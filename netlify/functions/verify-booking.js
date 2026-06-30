// netlify/functions/verify-booking.js
// Verifies that a booking was actually paid via Xendit API
const axios = require("axios");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const { ref } = event.queryStringParameters || {};

  if (!ref) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing ref parameter", verified: false }),
    };
  }

  try {
    const secretKey = process.env.XENDIT_SECRET_KEY;
    if (!secretKey) {
      throw new Error("XENDIT_SECRET_KEY not configured");
    }

    const authString = Buffer.from(`${secretKey}:`).toString("base64");

    // Query Xendit for invoices with this external_id
    const response = await axios.get(
      `https://api.xendit.co/v2/invoices?external_id=${encodeURIComponent(ref)}`,
      {
        headers: {
          Authorization: `Basic ${authString}`,
        },
      },
    );

    const invoices = response.data;

    if (invoices && invoices.length > 0) {
      const invoice = invoices[0]; // Most recent invoice with this external_id
      const isPaid = invoice.status === "PAID" || invoice.status === "SETTLED";

      // ── Fallback Sync ──────────────────────────────────────────────────────────
      // If the webhook from Xendit was delayed or lost, we can trigger the creation 
      // synchronously here to guarantee the booking is placed before the user leaves.
      // handlePaid is idempotent, so it won't duplicate if the webhook already ran.
      if (isPaid) {
        try {
          const { handlePaid } = require("./webhook-helpers");
          console.log(`[VERIFY-FALLBACK] Triggering handlePaid for ${ref}`);
          const fallbackResult = await handlePaid(ref, invoice);
          console.log(`[VERIFY-FALLBACK] Result:`, fallbackResult);
        } catch (fallbackErr) {
          console.error(`[VERIFY-FALLBACK] Error:`, fallbackErr.message);
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          verified: isPaid,
          status: invoice.status,
          amount: invoice.amount,
          currency: invoice.currency,
          paidAt: invoice.paid_at || null,
          description: invoice.description || "",
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        verified: false,
        status: "NOT_FOUND",
      }),
    };
  } catch (error) {
    console.error("Verify booking error:", error.response?.data || error.message);
    return {
      statusCode: 200,
      body: JSON.stringify({
        verified: false,
        status: "ERROR",
        error: "An unexpected error occurred during verification.",
      }),
    };
  }
};
