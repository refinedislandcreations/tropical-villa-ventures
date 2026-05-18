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
      expectedTotal,
      firstName,
      lastName,
      email,
      phone,
      specialRequests,
      couponCode,
    } = JSON.parse(event.body);

    // totalAmount is the BASE room price only (no fees included).
    // Fees are calculated here as the single source of truth.
    const baseAmount = Math.round(totalAmount);

    // Calculate Fees (single source of truth — matches calculate-price.js formula)
    const processingRate = 0.029; // 2.9%
    const fixedFee = 2000;
    const vatRate = 0.11;         // 11%

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
        console.error(`[INVOICE]   Frontend expectedTotal: IDR ${expectedTotal}`);
        console.error(`[INVOICE]   Backend finalAmount:    IDR ${finalAmount}`);
        console.error(`[INVOICE]   Difference:             IDR ${Math.abs(finalAmount - expectedTotal)}`);
        console.error(`[INVOICE]   baseAmount (room):      IDR ${baseAmount}`);
        console.error(`[INVOICE]   totalFee (calculated):  IDR ${totalFee}`);
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: "Price validation failed",
            details: "The calculated total does not match the expected total. Please refresh and try again.",
          }),
        };
      }
    }

    console.log(`\n[INVOICE] ── Creating invoice ──────────────────────────`);
    console.log(`[INVOICE] Villa: ${villaName} (listing: ${listingId})`);
    console.log(`[INVOICE] Guest: ${firstName} ${lastName} <${email}>`);
    console.log(`[INVOICE] Dates: ${checkin} → ${checkout} (${nights} nights)`);
    console.log(`[INVOICE] ── Price Breakdown ──`);
    console.log(`[INVOICE]   Room Base Amount:    IDR ${baseAmount}`);
    console.log(`[INVOICE]   Processing Fee 2.9%: IDR ${processingFee}`);
    console.log(`[INVOICE]   Flat Fee:            IDR ${fixedFee}`);
    console.log(`[INVOICE]   VAT 11%:             IDR ${vat}`);
    console.log(`[INVOICE]   Total Fees:          IDR ${totalFee}`);
    console.log(`[INVOICE]   Final Amount:        IDR ${finalAmount}`);
    console.log(`[INVOICE]   Frontend Expected:   IDR ${expectedTotal || 'N/A'}`);
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
      baseAmount: baseAmount,
      totalAmount: finalAmount,
      totalFee: totalFee,
      feeBreakdown: {
        processingFee,
        fixedFee,
        vat
      },
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

    // Build items for Xendit Invoice display
    const items = [
      {
        name: `Stay at ${villaName}`,
        quantity: 1,
        price: baseAmount,
        category: "Accommodation",
        description: `${nights} nights (${checkin} - ${checkout})`
      },
      {
        name: "Payment Processing Fee (2.9%)",
        quantity: 1,
        price: processingFee,
        category: "Fees"
      },
      {
        name: "Flat Processing Fee",
        quantity: 1,
        price: fixedFee,
        category: "Fees"
      },
      {
        name: "VAT on Fees (11%)",
        quantity: 1,
        price: vat,
        category: "Fees"
      }
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
      success_redirect_url: `${process.env.URL}/booking-success.html?ref=${externalId}`,
      failure_redirect_url: `${process.env.URL}/booking-failed.html`,
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
        "RETAIL_OUTLET"
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
          totalFee,
          finalAmount,
          guestName: fullName,
          guestEmail: email,
          guestPhone: sanitizedPhone || phone || "",
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
    console.log(`[INVOICE] ── Xendit Confirmation ──`);
    console.log(`[INVOICE]   Invoice ID:     ${data.id}`);
    console.log(`[INVOICE]   Amount sent:    IDR ${finalAmount}`);
    console.log(`[INVOICE]   Amount in Xendit: IDR ${data.amount}`);
    console.log(`[INVOICE]   Match: ${data.amount === finalAmount ? '✅ YES' : '❌ NO — INVESTIGATE'}`);

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
