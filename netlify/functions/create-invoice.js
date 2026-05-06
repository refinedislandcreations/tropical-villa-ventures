// netlify/functions/create-invoice.js
const axios = require("axios");

let blobsAvailable = true;
let getStore;
try {
  ({ getStore } = require("@netlify/blobs"));
} catch (e) {
  blobsAvailable = false;
  console.log("@netlify/blobs not available, using fallback temp storage");
}

const STORE_NAME = "temp-bookings";
const TTL_MS = 86400000; // 24 hours

async function storeTempBooking(externalId, bookingData) {
  if (blobsAvailable && getStore) {
    try {
      const store = getStore(STORE_NAME);
      const payload = {
        bookingData,
        expires: Date.now() + TTL_MS,
        createdAt: new Date().toISOString(),
      };
      await store.set(externalId, JSON.stringify(payload));
      console.log(`Stored temp booking via Blobs: ${externalId}`);
      return;
    } catch (blobError) {
      console.warn("Blobs storage failed, trying HTTP fallback:", blobError.message);
    }
  }

  try {
    const baseUrl = process.env.URL || "http://localhost:8888";
    await axios.post(`${baseUrl}/.netlify/functions/store-temp-booking`, {
      externalId,
      bookingData,
    });
    console.log(`Stored temp booking via HTTP fallback: ${externalId}`);
  } catch (httpError) {
    console.error("HTTP fallback storage also failed:", httpError.message);
  }
}

/**
 * Sanitize any international phone number to E.164 format
 * Supports: +628xxx, 08xxx, +1xxx, +44xxx, etc.
 */
function sanitizePhone(phone) {
  if (!phone) return "";
  // Strip spaces, dashes, parentheses, dots
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, "");
  // If already starts with +, it's likely valid E.164
  if (cleaned.startsWith("+")) return cleaned;
  // If starts with 00 (international prefix), replace with +
  if (cleaned.startsWith("00")) return "+" + cleaned.substring(2);
  // If starts with 0, it's a local number — we can't determine the country,
  // so just skip it (Xendit doesn't require phone)
  if (cleaned.startsWith("0")) return "";
  // Otherwise, prepend + (user likely entered country code without +)
  return "+" + cleaned;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const {
      listingId,
      villaName,
      checkin,
      checkout,
      guests,
      nights,
      totalAmount,
      firstName,
      lastName,
      email,
      phone,
      specialRequests,
    } = JSON.parse(event.body);

    const fullName = `${firstName} ${lastName}`.trim();
    const externalId = `BOOKING_${listingId}_${Date.now()}`;

    // Calculate 50% deposit
    const depositAmount = Math.round(totalAmount / 2);
    const remainingAmount = Math.round(totalAmount) - depositAmount;

    const description = `50% Deposit — ${villaName}: ${checkin} to ${checkout} (${nights} nights, ${guests} guests)`;

    // Store booking data for webhook retrieval (includes FULL total for reference)
    await storeTempBooking(externalId, {
      listingId,
      checkin,
      checkout,
      guests,
      totalAmount: totalAmount, // Store full amount
      depositAmount: depositAmount, // Store deposit amount
      remainingAmount: remainingAmount,
      guestName: fullName,
      guestFirstName: firstName || "Guest",
      guestLastName: lastName || "",
      guestEmail: email,
      guestPhone: phone,
      villaName: villaName,
      specialRequests: specialRequests || "",
    });

    // Sanitize phone — universal format
    const sanitizedPhone = sanitizePhone(phone);

    // Validate amount
    if (!depositAmount || depositAmount <= 0 || isNaN(depositAmount)) {
      throw new Error(`Invalid amount: ${totalAmount}. Price calculation may have failed.`);
    }

    // Build customer object (only include valid fields)
    const customer = {
      given_names: firstName || "Guest",
      email: email,
    };
    if (lastName) customer.surname = lastName;
    if (sanitizedPhone) customer.mobile_number = sanitizedPhone;

    // Build items
    const validNights = parseInt(nights) || 1;
    const items = [
      {
        name: `${villaName || "Villa Stay"} — 50% Deposit`,
        quantity: validNights,
        price: Math.round(depositAmount / validNights),
        category: "Accommodation",
      },
    ];

    // Create Xendit invoice for 50% deposit
    const xenditPayload = {
      external_id: externalId,
      amount: depositAmount,
      payer_email: email,
      description: description,
      currency: "IDR",
      success_redirect_url: `${process.env.URL || "https://www.tvvbali.com"}/booking-success.html?ref=${externalId}`,
      failure_redirect_url: `${process.env.URL || "https://www.tvvbali.com"}/booking-failed.html`,
      invoice_duration: 86400,
      customer: customer,
      customer_notification_preference: {
        invoice_created: ["email"],
        invoice_reminder: ["email"],
        invoice_paid: ["email"],
        invoice_expired: ["email"],
      },
      items: items,
    };

    console.log("Xendit payload:", JSON.stringify(xenditPayload, null, 2));

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

    if (data.id) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          invoiceUrl: data.invoice_url,
          invoiceId: data.id,
          externalId: externalId,
          depositAmount: depositAmount,
          totalAmount: Math.round(totalAmount),
          remainingAmount: remainingAmount,
        }),
      };
    }

    throw new Error(data.message || "Failed to create invoice");
  } catch (error) {
    console.error("Create invoice error:", JSON.stringify(error.response?.data || error.message, null, 2));
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to create invoice",
        details: error.response?.data?.message || error.message,
      }),
    };
  }
};
