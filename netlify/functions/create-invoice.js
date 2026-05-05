// netlify/functions/create-invoice.js
const axios = require("axios");
const { getStore } = require("@netlify/blobs");

const STORE_NAME = "temp-bookings";
const TTL_MS = 86400000; // 24 hours

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

    // Store booking data in Netlify Blobs for webhook retrieval
    const store = getStore(STORE_NAME);
    const bookingPayload = {
      bookingData: {
        listingId,
        checkin,
        checkout,
        guests,
        totalAmount,
        guestName: fullName,
        guestEmail: email,
        guestPhone: phone,
        specialRequests: specialRequests || "",
      },
      expires: Date.now() + TTL_MS,
      createdAt: new Date().toISOString(),
    };
    await store.set(externalId, JSON.stringify(bookingPayload));

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

    const authString = Buffer.from(
      `${process.env.XENDIT_SECRET_KEY}:`,
    ).toString("base64");

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
    console.error(
      "Create invoice error:",
      error.response?.data || error.message,
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
