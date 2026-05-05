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
  // Try Netlify Blobs first
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

  // Fallback: call store-temp-booking function via HTTP
  try {
    const baseUrl = process.env.URL || "http://localhost:8888";
    await axios.post(`${baseUrl}/.netlify/functions/store-temp-booking`, {
      externalId,
      bookingData,
    });
    console.log(`Stored temp booking via HTTP fallback: ${externalId}`);
  } catch (httpError) {
    console.error("HTTP fallback storage also failed:", httpError.message);
    // Don't throw — invoice creation should still proceed
  }
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
    const description = `${villaName}: ${checkin} to ${checkout} (${nights} nights, ${guests} guests)`;

    // Store booking data for webhook retrieval (non-blocking — doesn't fail the invoice)
    await storeTempBooking(externalId, {
      listingId,
      checkin,
      checkout,
      guests,
      totalAmount,
      guestName: fullName,
      guestEmail: email,
      guestPhone: phone,
      specialRequests: specialRequests || "",
    });

    // Sanitize phone number to E.164 format for Xendit
    let sanitizedPhone = (phone || "").replace(/[\s\-\(\)]/g, "");
    if (sanitizedPhone && !sanitizedPhone.startsWith("+")) {
      // Convert Indonesian numbers: 08xx → +628xx
      if (sanitizedPhone.startsWith("0")) {
        sanitizedPhone = "+62" + sanitizedPhone.substring(1);
      } else {
        sanitizedPhone = "+" + sanitizedPhone;
      }
    }

    // Validate amount
    const invoiceAmount = Math.round(totalAmount);
    if (!invoiceAmount || invoiceAmount <= 0 || isNaN(invoiceAmount)) {
      throw new Error(`Invalid amount: ${totalAmount}. Price calculation may have failed.`);
    }

    // Build customer object (only include valid fields)
    const customer = {
      given_names: firstName || "Guest",
      email: email,
    };
    if (lastName) customer.surname = lastName;
    if (sanitizedPhone) customer.mobile_number = sanitizedPhone;

    // Build items (only if nights is valid)
    const validNights = parseInt(nights) || 1;
    const items = [
      {
        name: villaName || "Villa Stay",
        quantity: validNights,
        price: Math.round(invoiceAmount / validNights),
        category: "Accommodation",
      },
    ];

    // Create Xendit invoice
    const xenditPayload = {
      external_id: externalId,
      amount: invoiceAmount,
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
        }),
      };
    }

    throw new Error(data.message || "Failed to create invoice");
  } catch (error) {
    // Log full error details for debugging
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
