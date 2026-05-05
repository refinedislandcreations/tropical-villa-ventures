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

    // Create Xendit invoice
    const xenditPayload = {
      external_id: externalId,
      amount: Math.round(totalAmount),
      payer_email: email,
      description: description,
      currency: "IDR",
      success_redirect_url: `${process.env.URL || "https://www.tvvbali.com"}/booking-success.html`,
      failure_redirect_url: `${process.env.URL || "https://www.tvvbali.com"}/booking-failed.html`,
      invoice_duration: 86400,
      customer: {
        given_names: firstName,
        surname: lastName,
        email: email,
        mobile_number: phone,
      },
      customer_notification_preference: {
        invoice_created: ["email"],
        invoice_reminder: ["email"],
        invoice_paid: ["email"],
        invoice_expired: ["email"],
      },
      items: [
        {
          name: villaName,
          quantity: nights,
          price: Math.round(totalAmount / nights),
          category: "Accommodation",
        },
      ],
    };

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
    console.error("Create invoice error:", error.response?.data || error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to create invoice",
        details: error.response?.data?.message || error.message,
      }),
    };
  }
};
