// netlify/functions/webhook-helpers.js
// Shared business logic for webhook processing — separated for testability
//
// Architecture:
//   xendit-webhook.js  →  (security + routing)  →  this module (business logic)
//   test-webhook.js    →  (no security, dev only) →  this module (business logic)
//
// Improvements over previous version:
//   1. Axios timeouts on ALL external HTTP calls (15s)
//   2. Idempotency layer — prevents duplicate reservation creation
//   3. handlePaid() now throws on failure instead of silently returning
//   4. Structured logging with consistent [TAG] prefixes
//   5. SETTLED status separated from PAID to avoid double-processing

const axios = require("axios");

// ─── Constants ───────────────────────────────────────────────────────────────

const AXIOS_TIMEOUT = 15000; // 15 seconds for all external requests
const STORE_NAME = "temp-bookings";
const IDEMPOTENCY_STORE_NAME = "processed-webhooks";

// ─── Storage Layer ───────────────────────────────────────────────────────────

let blobsAvailable = true;
let getStore;
try {
  ({ getStore } = require("@netlify/blobs"));
} catch (e) {
}

// In-memory fallback for local development (when Netlify Blobs is unavailable)
const memoryIdempotencyStore = new Map();

/**
 * Check whether a webhook has already been processed.
 * Uses Netlify Blobs in production, in-memory Map in local dev.
 *
 * @param {string} invoiceId  - Xendit invoice ID
 * @param {string} externalId - Our external booking reference
 * @returns {Promise<boolean>} true if already processed
 */
async function isAlreadyProcessed(invoiceId, externalId) {
  const key = `${invoiceId}__${externalId}`;

  // Try Netlify Blobs first
  if (blobsAvailable && getStore) {
    try {
      const store = getStore(IDEMPOTENCY_STORE_NAME);
      const existing = await store.get(key);
      if (existing) {
        console.log(`[IDEMPOTENCY] Found in Blobs: ${key}`);
        return true;
      }
    } catch (e) {
      console.warn(`[IDEMPOTENCY] Blobs read failed: ${e.message}`);
    }
  }

  // Fallback to in-memory store (local dev)
  if (memoryIdempotencyStore.has(key)) {
    console.log(`[IDEMPOTENCY] Found in memory: ${key}`);
    return true;
  }

  return false;
}

/**
 * Mark a webhook as processed to prevent duplicate handling.
 *
 * @param {string} invoiceId     - Xendit invoice ID
 * @param {string} externalId    - Our external booking reference
 * @param {number} reservationId - Hostaway reservation ID that was created
 */
async function markAsProcessed(invoiceId, externalId, reservationId) {
  const key = `${invoiceId}__${externalId}`;
  const payload = {
    invoiceId,
    externalId,
    reservationId,
    processedAt: new Date().toISOString(),
  };

  // Always write to memory (covers local dev)
  memoryIdempotencyStore.set(key, payload);

  // Try Netlify Blobs
  if (blobsAvailable && getStore) {
    try {
      const store = getStore(IDEMPOTENCY_STORE_NAME);
      await store.set(key, JSON.stringify(payload));
      console.log(`[IDEMPOTENCY] Marked processed in Blobs: ${key}`);
    } catch (e) {
      console.warn(`[IDEMPOTENCY] Blobs write failed (memory fallback active): ${e.message}`);
    }
  } else {
    console.log(`[IDEMPOTENCY] Marked processed in memory: ${key}`);
  }
}

/**
 * Retrieve temp booking data from blob store or HTTP fallback.
 */
async function getTempBooking(externalId) {
  console.log(`[STORAGE] Retrieving temp booking: ${externalId}`);

  if (blobsAvailable && getStore) {
    try {
      const store = getStore(STORE_NAME);
      const raw = await store.get(externalId);
      if (raw) {
        console.log(`[STORAGE] Found in Blobs`);
        return JSON.parse(raw).bookingData;
      }
    } catch (e) {
      console.warn(`[STORAGE] Blobs read failed: ${e.message}`);
    }
  }

  try {
    const baseUrl = process.env.URL || "http://localhost:8888";
    const response = await axios.get(
      `${baseUrl}/.netlify/functions/store-temp-booking?id=${externalId}`,
      { 
        timeout: AXIOS_TIMEOUT,
        headers: { "ngrok-skip-browser-warning": "true" }
      },
    );
    if (response.data?.bookingData) {
      console.log(`[STORAGE] Found via HTTP fallback`);
      return response.data.bookingData;
    }
  } catch (e) {
    console.warn(`[STORAGE] HTTP fallback failed: ${e.message}`);
  }

  console.error(`[STORAGE] Not found: ${externalId}`);
  return null;
}

/**
 * Delete temp booking after successful processing.
 */
async function cleanupTempBooking(externalId) {
  console.log(`[STORAGE] Cleaning up: ${externalId}`);
  if (blobsAvailable && getStore) {
    try {
      const store = getStore(STORE_NAME);
      await store.delete(externalId);
      console.log(`[STORAGE] Deleted from Blobs`);
    } catch (e) {
      console.warn(`[STORAGE] Blob delete failed: ${e.message}`);
    }
  }
}

// ─── Hostaway Integration ────────────────────────────────────────────────────

/**
 * Fetch Hostaway OAuth token directly from Hostaway API.
 * Throws on failure — callers must handle.
 */
async function getHostawayToken() {
  console.log(`[HOSTAWAY] Fetching token`);
  const clientId = process.env.HOSTAWAY_ACCOUNT_ID;
  const clientSecret = process.env.HOSTAWAY_API_KEY;

  if (!clientId || !clientSecret) {
    throw new Error("Missing Hostaway API credentials in environment");
  }

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("scope", "general");

  const response = await axios.post(
    "https://api.hostaway.com/v1/accessTokens",
    params.toString(),
    {
      timeout: AXIOS_TIMEOUT,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );

  if (!response.data?.access_token) {
    throw new Error("Hostaway token response missing access_token");
  }
  return response.data.access_token;
}

/**
 * Create reservation in Hostaway using the documented API format.
 * Reference: https://api.hostaway.com/documentation
 * POST /v1/reservations?forceOverbooking=1
 *
 * Throws on failure — callers must handle.
 */
async function createHostawayReservation(token, bookingData) {
  const nameParts = (bookingData.guestName || "").trim().split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";
  const totalAmount = parseFloat(bookingData.totalAmount);

  const listingMapId = parseInt(bookingData.listingId);
  if (!listingMapId || isNaN(listingMapId)) {
    throw new Error(`Invalid or missing listingMapId: ${bookingData.listingId}`);
  }

  // Use only documented fields from Hostaway API
  const reservationData = {
    channelId: 2000,
    listingMapId: listingMapId,
    isManuallyChecked: 0,
    isInitial: 0,
    guestName: bookingData.guestName || "",
    guestFirstName: firstName,
    guestLastName: lastName,
    guestEmail: bookingData.guestEmail || "",
    numberOfGuests: parseInt(bookingData.guests) || 1,
    adults: parseInt(bookingData.guests) || 1,
    children: null,
    infants: null,
    pets: null,
    arrivalDate: bookingData.checkin,
    departureDate: bookingData.checkout,
    checkInTime: null,
    checkOutTime: null,
    phone: bookingData.guestPhone || "",
    totalPrice: totalAmount,
    taxAmount: null,
    channelCommissionAmount: null,
    cleaningFee: null,
    securityDepositFee: null,
    isPaid: 1,
    currency: "IDR",
    status: "new",
    hostNote: `Paid via Xendit. Booking ref: ${bookingData.externalId || "N/A"}`,
    guestNote: bookingData.specialRequests || null,
    comment: null,
    couponName: bookingData.couponCode || null,
    financeField: [
      {
        type: "price",
        name: "baseRate",
        title: "Base rate",
        value: totalAmount,
        total: totalAmount,
        isIncludedInTotalPrice: 1,
        isOverriddenByUser: 0,
        isQuantitySelectable: 0,
        isDeleted: 0
      }
    ]
  };

  console.log(`[HOSTAWAY] Creating reservation for ${bookingData.guestName} at listing ${bookingData.listingId}`);
  console.log(`[HOSTAWAY] Dates: ${bookingData.checkin} → ${bookingData.checkout}, Total: IDR ${totalAmount}`);

  const response = await axios.post(
    "https://api.hostaway.com/v1/reservations?forceOverbooking=1",
    reservationData,
    {
      timeout: AXIOS_TIMEOUT,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cache-control": "no-cache",
      },
    },
  );

  console.log(`[HOSTAWAY] Response status: ${response.data?.status}`);

  if (response.data?.status !== "success") {
    console.error(`[HOSTAWAY] Unexpected response:`, JSON.stringify(response.data, null, 2));
    throw new Error(`Hostaway reservation failed: ${JSON.stringify(response.data?.result || response.data)}`);
  }

  return response.data;
}

// ─── Guest Messaging ─────────────────────────────────────────────────────────

function buildConfirmationMessage(bookingData) {
  const guestFirstName = bookingData.guestFirstName || bookingData.guestName?.split(" ")[0] || "Guest";
  const villaName = bookingData.villaName || "our villa";
  const checkin = bookingData.checkin;
  const checkout = bookingData.checkout;
  const totalAmount = bookingData.totalAmount || 0;

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
  };
  const formatCurrency = (amount) => `IDR ${Math.round(amount).toLocaleString("id-ID")}`;

  return `🌺 Hi ${guestFirstName},

Thank you for choosing ${villaName} for your upcoming Bali getaway from ${formatDate(checkin)} to ${formatDate(checkout)}. We can't wait to welcome you to our tropical haven and provide you with the best experience during your stay! 🌴😊

💰 **Payment Confirmed**: ${formatCurrency(totalAmount)}

To ensure a smooth check-in process and to tailor your experience to your preferences, we kindly request some additional information from you.

Could you please provide us with the following details:

🏡 **Arrival Time**: Please let us know your expected arrival time at the Villa. This will help us arrange for a seamless check-in experience and ensure that our staff is ready to welcome you upon your arrival.

✈️ **Airport Transfer**: Would you like us to arrange airport transfer services for you? If so, kindly provide us with your flight details (arrival time, flight number, etc.) so we can make the necessary arrangements. The arranged transport fee is IDR 300.000 between 06:00 - 21:00 and IDR 350.000 between 22:00-05:00.

Closer to your arrival date we will send you our Villa Manager contact number and the link to our Villa location.

If you have any special requests or requirements, please feel free to contact us via WhatsApp and we will do our best to accommodate them.

☎️ https://wa.me/message/BBYXJ5GNJ5N3D1

Kind regards,
Tropical Villa Ventures🫶🏼🏝️`;
}

/**
 * Send confirmation message via Hostaway's conversation API.
 * Non-critical — failures are logged but do not cause the webhook to fail.
 *
 * The correct endpoint per docs is:
 *   POST /v1/conversations/{conversationId}/messages
 * For "direct" channel reservations, we first look up the conversation.
 */
async function sendConfirmationViaHostaway(token, reservationId, bookingData) {
  const messageBody = buildConfirmationMessage(bookingData);
  console.log(`[MESSAGING] Sending confirmation for reservation ${reservationId}`);

  try {
    // First, get the conversation for this reservation
    const convResponse = await axios.get(
      `https://api.hostaway.com/v1/conversations?reservationId=${reservationId}`,
      {
        timeout: AXIOS_TIMEOUT,
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-control": "no-cache",
        },
      },
    );

    let conversationId;
    if (convResponse.data?.status === "success" && convResponse.data?.result?.length > 0) {
      conversationId = convResponse.data.result[0].id;
      console.log(`[MESSAGING] Found conversation: ${conversationId}`);
    } else {
      console.warn(`[MESSAGING] No conversation found for reservation ${reservationId}, skipping message`);
      return false;
    }

    // Send the message to the conversation
    const response = await axios.post(
      `https://api.hostaway.com/v1/conversations/${conversationId}/messages`,
      { body: messageBody },
      {
        timeout: AXIOS_TIMEOUT,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Cache-control": "no-cache",
        },
      },
    );
    console.log(`[MESSAGING] Sent successfully:`, response.data?.status || "OK");
    return true;
  } catch (error) {
    console.error(`[MESSAGING] Failed:`, error.response?.data || error.message);
    // Non-critical — reservation is still created
    return false;
  }
}

// ─── Status Handlers ─────────────────────────────────────────────────────────

/**
 * Handle a PAID webhook callback.
 *
 * Orchestration:
 *   1. Check idempotency (skip if already processed)
 *   2. Load temp booking
 *   3. Get Hostaway token
 *   4. Create Hostaway reservation
 *   5. Mark as processed (idempotency)
 *   6. Send confirmation message (non-critical)
 *   7. Clean up temp booking
 *
 * THROWS on processing failure — the webhook handler must catch and return 500
 * so that Xendit retries the delivery.
 *
 * @param {string} externalId  - Our BOOKING_xxx reference
 * @param {object} webhookData - Full webhook payload from Xendit
 * @returns {object} result summary
 */
async function handlePaid(externalId, webhookData) {
  const invoiceId = webhookData.id;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`[PAID] Processing payment for: ${externalId}`);
  console.log(`[PAID] Invoice ID: ${invoiceId}`);
  console.log(`[PAID] Amount: ${webhookData.amount} ${webhookData.currency}`);
  console.log(`${"=".repeat(60)}\n`);

  // ── Step 1: Idempotency check ──────────────────────────────────────────────
  const alreadyDone = await isAlreadyProcessed(invoiceId, externalId);
  if (alreadyDone) {
    console.log(`[IDEMPOTENCY] Duplicate webhook ignored: ${invoiceId} / ${externalId}`);
    return { success: true, duplicate: true, message: "Already processed" };
  }

  // ── Step 2: Load booking data ──────────────────────────────────────────────
  // We prefer the metadata from the Xendit invoice directly! This avoids dependency on temp storage.
  let bookingData = null;
  if (webhookData.metadata && webhookData.metadata.bookingData) {
    console.log(`[PAID] Extracted booking data from Xendit metadata`);
    bookingData = webhookData.metadata.bookingData;
  } else {
    console.log(`[PAID] Metadata not found, falling back to temp storage`);
    bookingData = await getTempBooking(externalId);
  }

  if (!bookingData) {
    // No booking data means we can't create a reservation.
    // This is a permanent failure — do NOT throw (retries won't help).
    console.error(`[PAID] ❌ No booking data found for ${externalId}. Cannot create reservation.`);
    return { success: false, error: "No booking data found" };
  }

  // Attach externalId for the hostNote
  bookingData.externalId = externalId;

  console.log(`[PAID] Booking loaded: ${bookingData.villaName} | ${bookingData.guestName} | ${bookingData.checkin} → ${bookingData.checkout}`);

  // ── Step 3: Get Hostaway token ─────────────────────────────────────────────
  // Throws on failure → webhook handler returns 500 → Xendit retries
  const token = await getHostawayToken();

  // ── Step 4: Create Hostaway reservation ────────────────────────────────────
  // Throws on failure → webhook handler returns 500 → Xendit retries
  const reservationResult = await createHostawayReservation(token, bookingData);
  const reservationId = reservationResult.result.id;
  console.log(`[PAID] ✅ Reservation created: #${reservationId}`);

  // ── Step 5: Mark as processed (idempotency) ───────────────────────────────
  // Done immediately after reservation creation to prevent duplicates on retry
  await markAsProcessed(invoiceId, externalId, reservationId);
  console.log(`[IDEMPOTENCY] Marked as processed: ${invoiceId}`);

  // ── Step 6: Send confirmation message (non-critical) ──────────────────────
  let messageSent = false;
  try {
    messageSent = await sendConfirmationViaHostaway(token, reservationId, bookingData);
    console.log(`[PAID] ${messageSent ? "✅" : "⚠️"} Confirmation message ${messageSent ? "sent" : "failed (non-critical)"}`);
  } catch (msgError) {
    console.error(`[PAID] ⚠️ Confirmation message error (non-critical): ${msgError.message}`);
  }

  // ── Step 7: Cleanup temp booking ──────────────────────────────────────────
  try {
    await cleanupTempBooking(externalId);
    console.log(`[PAID] ✅ Temp booking cleaned up`);
  } catch (cleanupError) {
    console.warn(`[PAID] ⚠️ Cleanup failed (non-critical): ${cleanupError.message}`);
  }

  return { success: true, reservationId, messageSent };
}

/**
 * Handle SETTLED status.
 * SETTLED means the funds have been disbursed to the merchant account.
 * The reservation should already have been created when PAID was received,
 * so we just acknowledge — no duplicate processing.
 */
function handleSettled(externalId, webhookData) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[SETTLED] Settlement acknowledged: ${externalId}`);
  console.log(`[SETTLED] Invoice ID: ${webhookData.id}`);
  console.log(`[SETTLED] Amount: ${webhookData.amount} ${webhookData.currency}`);
  console.log(`[SETTLED] This is a settlement notification only — reservation was created on PAID.`);
  console.log(`${"=".repeat(60)}\n`);
  return { acknowledged: true, status: "SETTLED" };
}

function handlePending(externalId, webhookData) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[PENDING] Invoice pending: ${externalId}`);
  console.log(`[PENDING] Invoice ID: ${webhookData.id}`);
  console.log(`[PENDING] Amount: ${webhookData.amount} ${webhookData.currency}`);
  console.log(`[PENDING] Payment method: ${webhookData.payment_method || "not selected"}`);
  console.log(`${"=".repeat(60)}\n`);
  return { acknowledged: true, status: "PENDING" };
}

function handleExpired(externalId, webhookData) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[EXPIRED] Invoice expired: ${externalId}`);
  console.log(`[EXPIRED] Invoice ID: ${webhookData.id}`);
  console.log(`[EXPIRED] Amount: ${webhookData.amount} ${webhookData.currency}`);
  console.log(`${"=".repeat(60)}\n`);
  cleanupTempBooking(externalId).catch((e) =>
    console.warn(`[EXPIRED] Cleanup failed: ${e.message}`),
  );
  return { acknowledged: true, status: "EXPIRED" };
}

function handleUnknownStatus(status, externalId, webhookData) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[UNKNOWN] Unhandled status: ${status}`);
  console.log(`[UNKNOWN] External ID: ${externalId}`);
  console.log(`[UNKNOWN] Invoice ID: ${webhookData.id}`);
  console.log(`${"=".repeat(60)}\n`);
  return { acknowledged: true, status };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Storage
  getTempBooking,
  cleanupTempBooking,
  // Idempotency
  isAlreadyProcessed,
  markAsProcessed,
  // Hostaway
  getHostawayToken,
  createHostawayReservation,
  // Messaging
  buildConfirmationMessage,
  sendConfirmationViaHostaway,
  // Status handlers
  handlePaid,
  handleSettled,
  handlePending,
  handleExpired,
  handleUnknownStatus,
};
