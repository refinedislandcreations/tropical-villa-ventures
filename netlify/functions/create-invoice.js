// netlify/functions/create-invoice.js
const axios = require("axios");

const { saveBooking } = require("./store-temp-booking");

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
      couponCode,
    } = JSON.parse(event.body);

    const amount = Math.round(totalAmount);

    console.log(`\n[INVOICE] ── Creating invoice ──────────────────────────`);
    console.log(`[INVOICE] Villa: ${villaName} (listing: ${listingId})`);
    console.log(`[INVOICE] Guest: ${firstName} ${lastName} <${email}>`);
    console.log(`[INVOICE] Dates: ${checkin} → ${checkout} (${nights} nights)`);
    console.log(`[INVOICE] Amount: IDR ${amount}`);
    console.log(`[INVOICE] Phone: ${phone || "(none)"}`);

    const fullName = `${firstName} ${lastName}`.trim();
    const externalId = `BOOKING_${listingId}_${Date.now()}`;
    console.log(`[INVOICE] External ID: ${externalId}`);

    const description = `${villaName}: ${checkin} to ${checkout} (${nights} nights, ${guests} guests)`;

    // Store booking data for webhook retrieval
    await storeTempBooking(externalId, {
      listingId,
      checkin,
      checkout,
      guests,
      totalAmount: amount,
      guestName: fullName,
      guestFirstName: firstName || "Guest",
      guestLastName: lastName || "",
      guestEmail: email,
      guestPhone: phone,
      villaName: villaName,
      specialRequests: specialRequests || "",
      couponCode: couponCode || null,
    });

    // Sanitize phone — universal format
    const sanitizedPhone = sanitizePhone(phone);

    // Validate amount
    if (!amount || amount <= 0 || isNaN(amount)) {
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
        name: villaName || "Villa Stay",
        quantity: validNights,
        price: Math.round(amount / validNights),
        category: "Accommodation",
      },
    ];

    // Create Xendit invoice — full payment
    const xenditPayload = {
      external_id: externalId,
      amount: amount,
      payer_email: email,
      description: description,
      currency: "IDR",
      success_redirect_url: `${process.env.URL}/booking-success.html?ref=${externalId}`,
      failure_redirect_url: `${process.env.URL}/booking-failed.html`,
      invoice_duration: 86400,
      customer: customer,
      customer_notification_preference: {
        invoice_created: ["email"],
        invoice_reminder: ["email"],
        invoice_paid: ["email"],
        invoice_expired: ["email"],
      },
      items: items,
      metadata: {
        bookingData: {
          listingId,
          checkin,
          checkout,
          guests,
          totalAmount: amount,
          guestName: fullName,
          guestFirstName: firstName || "Guest",
          guestLastName: lastName || "",
          guestEmail: email,
          guestPhone: sanitizedPhone || phone || "",
          villaName: villaName,
          specialRequests: specialRequests || "",
          couponCode: couponCode || null,
        }
      }
    };

    console.log("[INVOICE] Xendit payload:", JSON.stringify(xenditPayload, null, 2));

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

    if (data.id) {
      return {
        statusCode: 200,
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify({
          success: true,
          invoiceUrl: data.invoice_url,
          invoiceId: data.id,
          externalId: externalId,
          totalAmount: amount,
        }),
      };
    }

    throw new Error(data.message || "Failed to create invoice");
  } catch (error) {
    console.error("[INVOICE] ❌ Error:", JSON.stringify(error.response?.data || error.message, null, 2));
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to create invoice",
        details: error.response?.data?.message || error.message,
      }),
    };
  }
};
