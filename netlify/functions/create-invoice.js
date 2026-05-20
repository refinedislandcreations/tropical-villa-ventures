// netlify/functions/create-invoice.js
const axios = require("axios");

const { saveBooking } = require("./store-temp-booking");

// ─── Date-Hold Lock (prevents double-booking race condition) ─────────────────
// When Guest A starts checkout, we place a 30-min hold on those dates.
// If Guest B tries the same listing+dates while the hold is active, they get
// a "dates no longer available" error instead of creating a competing invoice.

let getStore;
try {
  ({ getStore } = require("@netlify/blobs"));
} catch (e) {}

const HOLD_STORE_NAME = "date-holds";
const HOLD_TTL_MS = 30 * 60 * 1000; // 30 minutes

// In-memory fallback for local development (won't persist across function invocations, but helps somewhat)
// In production, Netlify functions might spin up multiple instances, so blobs are required for true safety.
const memoryHoldStore = new Map();

function buildHoldKey(listingId, checkin, checkout) {
  return `hold_${listingId}_${checkin}_${checkout}`;
}

async function getHoldStore() {
  if (getStore) {
    try {
      return getStore(HOLD_STORE_NAME);
    } catch (e) {
      console.warn("[HOLD] Blob store init failed:", e.message);
    }
  }
  return null;
}

/**
 * Check if dates are currently held by another pending booking.
 * Returns the hold data if active, null if no hold exists or it has expired.
 */
async function getActiveHold(holdKey) {
  const store = await getHoldStore();
  let holdData = null;

  try {
    if (store) {
      const raw = await store.get(holdKey);
      if (raw) holdData = JSON.parse(raw);
    } else {
      holdData = memoryHoldStore.get(holdKey);
    }

    if (!holdData) return null;

    if (holdData.expiresAt < Date.now()) {
      // Hold expired — clean up and allow
      if (store) await store.delete(holdKey).catch(() => {});
      memoryHoldStore.delete(holdKey);
      console.log(`[HOLD] Expired hold cleared: ${holdKey}`);
      return null;
    }
    return holdData;
  } catch (e) {
    console.warn(`[HOLD] Check failed: ${e.message}`);
    return null;
  }
}

/**
 * Acquire a date-hold lock. Returns true if acquired, false if dates are held.
 */
async function acquireHold(holdKey, externalId, guestEmail) {
  const store = await getHoldStore();

  // Check for existing active hold
  const existing = await getActiveHold(holdKey);
  if (existing) {
    console.log(
      `[HOLD] ❌ Dates already held by ${existing.externalId} (expires ${new Date(existing.expiresAt).toISOString()})`,
    );
    return false;
  }

  // Acquire the hold
  const holdData = {
    externalId,
    guestEmail,
    acquiredAt: Date.now(),
    expiresAt: Date.now() + HOLD_TTL_MS,
  };

  if (store) {
    await store.set(holdKey, JSON.stringify(holdData));
  } else {
    console.warn("[HOLD] No blob store available — using in-memory hold");
    memoryHoldStore.set(holdKey, holdData);
  }

  // Distributed lock verification (mitigate concurrent overwrite race conditions)
  await new Promise((r) => setTimeout(r, 100 + Math.random() * 100)); // 100-200ms jitter

  const verifiedHold = await getActiveHold(holdKey);
  if (verifiedHold && verifiedHold.externalId !== externalId) {
    console.log(
      `[HOLD] ❌ Race condition detected! Lost hold to ${verifiedHold.externalId}`,
    );
    return false;
  }

  console.log(`[HOLD] ✅ Acquired hold: ${holdKey} → expires in 30 min`);
  return true;
}

/**
 * Release a date-hold (called after invoice expiry or booking failure).
 */
async function releaseHold(holdKey) {
  const store = await getHoldStore();
  try {
    if (store) await store.delete(holdKey);
    memoryHoldStore.delete(holdKey);
    console.log(`[HOLD] Released hold: ${holdKey}`);
  } catch (e) {
    console.warn(`[HOLD] Release failed: ${e.message}`);
  }
}

// ─── Hostaway Availability Check ─────────────────────────────────────────────

async function checkHostawayAvailability(listingId, checkin, checkout) {
  const clientId = process.env.HOSTAWAY_ACCOUNT_ID;
  const clientSecret = process.env.HOSTAWAY_API_KEY;
  if (!clientId || !clientSecret) {
    console.warn(
      "[INVOICE] Missing Hostaway credentials — skipping availability check",
    );
    return true;
  }

  // Get token
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("scope", "general");
  const tokenRes = await axios.post(
    "https://api.hostaway.com/v1/accessTokens",
    params.toString(),
    {
      timeout: 10000,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  );
  const token = tokenRes.data?.access_token;
  if (!token) return true; // fail open if token issues

  // Check calendar
  const calendarRes = await axios.get(
    `https://api.hostaway.com/v1/listings/${listingId}/calendar?startDate=${checkin}&endDate=${checkout}&includeResources=0`,
    { timeout: 10000, headers: { Authorization: `Bearer ${token}` } },
  );

  if (calendarRes.data?.result) {
    const days = calendarRes.data.result.filter(
      (d) => d.date >= checkin && d.date < checkout,
    );
    const isAvailable =
      days.length > 0 &&
      days.every((d) => d.status === "available" || d.isAvailable === 1);
    if (!isAvailable) {
      console.log(
        `[INVOICE] ❌ Dates ${checkin}→${checkout} NOT available for listing ${listingId}`,
      );
      return false;
    }
  }
  console.log(
    `[INVOICE] ✅ Dates ${checkin}→${checkout} confirmed available for listing ${listingId}`,
  );
  return true;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function storeTempBooking(externalId, bookingData) {
  try {
    await saveBooking(externalId, bookingData);
    console.log(`[INVOICE] Stored temp booking: ${externalId}`);
  } catch (error) {
    console.error("[INVOICE] Storage failed:", error.message);
  }
}

/**
 * Sanitize any international phone number to E.164 format
 */
function sanitizePhone(phone) {
  if (!phone) return "";
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return "+" + cleaned.substring(2);
  if (cleaned.startsWith("0")) return "+62" + cleaned.substring(1);
  return "+" + cleaned;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  let holdKey = null;

  try {
    const {
      listingId,
      villaName,
      checkin,
      checkout,
      guests,
      nights,
      totalAmount,
      expectedTotal,
      firstName,
      lastName,
      email,
      phone,
      specialRequests,
      couponCode,
      reservationCouponId,
      financeFields,
      reservationSubtotal,
      origin,
    } = JSON.parse(event.body);

    // totalAmount is the reservation total coming from Hostaway pricing
    // (after coupon handling, before Xendit processing fees).
    const baseAmount = Math.round(totalAmount);

    // Calculate Fees (single source of truth — matches calculate-price.js formula)
    const processingRate = 0.029; // 2.9%
    const fixedFee = 2000;
    const vatRate = 0.11; // 11%

    const processingFee = Math.round(baseAmount * processingRate);
    const feeBeforeVAT = processingFee + fixedFee;
    const vat = Math.round(feeBeforeVAT * vatRate);
    const totalFee = processingFee + fixedFee + vat;

    const finalAmount = baseAmount + totalFee;

    // ── Safeguard: validate frontend/backend total agreement ──
    if (expectedTotal) {
      const tolerance = 5; // allow IDR 5 rounding tolerance
      if (Math.abs(finalAmount - expectedTotal) > tolerance) {
        console.error(`[INVOICE] ❌ PRICE MISMATCH DETECTED`);
        console.error(
          `[INVOICE]   Frontend expectedTotal: IDR ${expectedTotal}`,
        );
        console.error(`[INVOICE]   Backend finalAmount:    IDR ${finalAmount}`);
        console.error(
          `[INVOICE]   Difference:             IDR ${Math.abs(finalAmount - expectedTotal)}`,
        );
        console.error(`[INVOICE]   baseAmount (room):      IDR ${baseAmount}`);
        console.error(`[INVOICE]   totalFee (calculated):  IDR ${totalFee}`);
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: "Price validation failed",
            details:
              "The calculated total does not match the expected total. Please refresh and try again.",
          }),
        };
      }
    }

    // ── Layer 1: Re-verify Hostaway availability ──
    // The frontend already checked, but another guest may have booked in the meantime
    const available = await checkHostawayAvailability(
      listingId,
      checkin,
      checkout,
    );
    if (!available) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: "Dates no longer available",
          details:
            "Sorry, these dates were just booked by another guest. Please select different dates.",
        }),
      };
    }

    // ── Layer 2: Acquire date-hold lock ──
    // Prevents two simultaneous invoice creations for the same dates
    holdKey = buildHoldKey(listingId, checkin, checkout);
    const holdAcquired = await acquireHold(
      holdKey,
      `BOOKING_${listingId}_${Date.now()}`,
      email,
    );
    if (!holdAcquired) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: "Dates no longer available",
          details:
            "Another guest is currently completing a booking for these dates. Please try again shortly or select different dates.",
        }),
      };
    }

    console.log(`\n[INVOICE] ── Creating invoice ──────────────────────────`);
    console.log(`[INVOICE] Villa: ${villaName} (listing: ${listingId})`);
    console.log(`[INVOICE] Guest: ${firstName} ${lastName} <${email}>`);
    console.log(`[INVOICE] Dates: ${checkin} → ${checkout} (${nights} nights)`);
    console.log(`[INVOICE] ── Price Breakdown ──`);
    console.log(`[INVOICE]   Reservation Total:   IDR ${baseAmount}`);
    console.log(`[INVOICE]   Processing Fee 2.9%: IDR ${processingFee}`);
    console.log(`[INVOICE]   Flat Fee:            IDR ${fixedFee}`);
    console.log(`[INVOICE]   VAT 11%:             IDR ${vat}`);
    console.log(`[INVOICE]   Total Fees:          IDR ${totalFee}`);
    console.log(`[INVOICE]   Final Amount:        IDR ${finalAmount}`);
    console.log(
      `[INVOICE]   Frontend Expected:   IDR ${expectedTotal || "N/A"}`,
    );
    console.log(`[INVOICE] Phone: ${phone || "(none)"}`);

    const fullName = `${firstName} ${lastName}`.trim();
    const externalId = `BOOKING_${listingId}_${Date.now()}`;
    console.log(`[INVOICE] External ID: ${externalId}`);

    const description = `Booking for ${villaName}\nStay: ${checkin} to ${checkout} (${nights} nights)\nGuests: ${guests}\nGuest: ${fullName}`;

    // Store booking data for webhook retrieval
    await storeTempBooking(externalId, {
      listingId,
      checkin,
      checkout,
      guests,
      nights,
      baseAmount: baseAmount,
      reservationSubtotal: reservationSubtotal || baseAmount,
      totalAmount: finalAmount,
      totalFee: totalFee,
      feeBreakdown: {
        processingFee,
        fixedFee,
        vat,
      },
      guestName: fullName,
      guestFirstName: firstName || "Guest",
      guestLastName: lastName || "",
      guestEmail: email,
      guestPhone: phone,
      villaName: villaName,
      specialRequests: specialRequests || "",
      couponCode: couponCode || null,
      reservationCouponId: reservationCouponId || null,
      financeFields: Array.isArray(financeFields) ? financeFields : [],
    });

    // Sanitize phone — universal format
    const sanitizedPhone = sanitizePhone(phone);

    // Build items for Xendit Invoice display
    const items = [
      {
        name: `Stay at ${villaName}`,
        quantity: 1,
        price: baseAmount,
        category: "Accommodation",
        description: `${nights} nights (${checkin} - ${checkout})`,
      },
      {
        name: "Payment Processing Fee (2.9%)",
        quantity: 1,
        price: processingFee,
        category: "Fees",
      },
      {
        name: "Flat Processing Fee",
        quantity: 1,
        price: fixedFee,
        category: "Fees",
      },
      {
        name: "VAT on Fees (11%)",
        quantity: 1,
        price: vat,
        category: "Fees",
      },
    ];

    // Build customer object (only include valid fields)
    const customer = {
      given_names: firstName || "Guest",
      email: email,
    };
    if (lastName) customer.surname = lastName;
    if (sanitizedPhone) customer.mobile_number = sanitizedPhone;

    // Create Xendit invoice — full payment
    const xenditPayload = {
      external_id: externalId,
      amount: finalAmount,
      payer_email: email,
      description: description,
      currency: "IDR",
      success_redirect_url: `${origin || process.env.URL}/booking-success.html?ref=${externalId}`,
      failure_redirect_url: `${origin || process.env.URL}/booking-failed.html`,
      invoice_duration: 86400,
      customer: customer,
      customer_notification_preference: {
        invoice_created: ["email", "whatsapp"],
        invoice_reminder: ["email", "whatsapp"],
        invoice_paid: ["email", "whatsapp"],
        invoice_expired: ["email", "whatsapp"],
      },
      items: items,
      payment_methods: [
        "CREDIT_CARD",
        "BANK_TRANSFER",
        "EWALLET",
        "QRIS",
        "DIRECT_DEBIT",
        "RETAIL_OUTLET",
      ],
      metadata: {
        bookingData: {
          listingId,
          villaName,
          checkin,
          checkout,
          guests,
          nights,
          baseAmount,
          reservationSubtotal: reservationSubtotal || baseAmount,
          totalFee,
          finalAmount,
          feeBreakdown: {
            processingFee,
            fixedFee,
            vat,
          },
          guestName: fullName,
          guestEmail: email,
          guestPhone: sanitizedPhone || phone || "",
          specialRequests: specialRequests || "",
          couponCode: couponCode || null,
          reservationCouponId: reservationCouponId || null,
          financeFields: Array.isArray(financeFields) ? financeFields : [],
        },
      },
    };

    console.log(
      "[INVOICE] Xendit payload:",
      JSON.stringify(xenditPayload, null, 2),
    );

    const secretKey = process.env.XENDIT_SECRET_KEY;
    if (!secretKey) {
      throw new Error("XENDIT_SECRET_KEY environment variable is not set");
    }

    const authString = Buffer.from(`${secretKey}:`).toString("base64");

    const response = await axios.post(
      "https://api.xendit.co/v2/invoices",
      xenditPayload,
      {
        headers: {
          Authorization: `Basic ${authString}`,
          "Content-Type": "application/json",
        },
      },
    );

    const data = response.data;
    console.log(`[INVOICE] ✅ Invoice created: ${data.id}`);
    console.log(`[INVOICE] ── Xendit Confirmation ──`);
    console.log(`[INVOICE]   Invoice ID:     ${data.id}`);
    console.log(`[INVOICE]   Amount sent:    IDR ${finalAmount}`);
    console.log(`[INVOICE]   Amount in Xendit: IDR ${data.amount}`);
    console.log(
      `[INVOICE]   Match: ${data.amount === finalAmount ? "✅ YES" : "❌ NO — INVESTIGATE"}`,
    );

    if (data.id) {
      return {
        statusCode: 200,
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify({
          success: true,
          invoiceUrl: data.invoice_url,
          invoiceId: data.id,
          externalId: externalId,
          totalAmount: finalAmount,
        }),
      };
    }

    throw new Error(data.message || "Failed to create invoice");
  } catch (error) {
    // Release the date-hold if invoice creation failed
    if (holdKey) {
      try {
        await releaseHold(holdKey);
        console.log(`[INVOICE] Hold released after failure: ${holdKey}`);
      } catch (releaseErr) {
        console.warn(`[INVOICE] Hold release failed: ${releaseErr.message}`);
      }
    }

    console.error(
      "[INVOICE] ❌ Error:",
      JSON.stringify(error.response?.data || error.message, null, 2),
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to create invoice",
        details: error.response?.data?.message || error.message,
      }),
    };
  }
};

// Export for webhook handler to release holds on invoice expiry/payment
exports.releaseHold = releaseHold;
exports.buildHoldKey = buildHoldKey;
