// netlify/functions/xendit-webhook.js
const axios = require("axios");

let blobsAvailable = true;
let getStore;
try {
  ({ getStore } = require("@netlify/blobs"));
} catch (e) {
  blobsAvailable = false;
}

const STORE_NAME = "temp-bookings";

async function getHostawayToken() {
  const response = await axios.get(
    `${process.env.URL || "http://localhost:8888"}/.netlify/functions/hostaway-token`,
  );
  return response.data.access_token;
}

async function getTempBooking(externalId) {
  if (blobsAvailable && getStore) {
    try {
      const store = getStore(STORE_NAME);
      const raw = await store.get(externalId);
      if (raw) {
        const data = JSON.parse(raw);
        return data.bookingData;
      }
    } catch (blobError) {
      console.warn("Blobs retrieval failed:", blobError.message);
    }
  }

  try {
    const baseUrl = process.env.URL || "http://localhost:8888";
    const response = await axios.get(
      `${baseUrl}/.netlify/functions/store-temp-booking?id=${externalId}`,
    );
    if (response.data && response.data.bookingData) {
      return response.data.bookingData;
    }
  } catch (httpError) {
    console.warn("HTTP fallback retrieval failed:", httpError.message);
  }

  return null;
}

async function cleanupTempBooking(externalId) {
  if (blobsAvailable && getStore) {
    try {
      const store = getStore(STORE_NAME);
      await store.delete(externalId);
      console.log(`Cleaned up temp booking: ${externalId}`);
    } catch (e) {
      console.warn("Blob cleanup failed:", e.message);
    }
  }
}

/**
 * Build the confirmation email HTML to send via Hostaway messaging
 */
function buildConfirmationMessage(bookingData) {
  const guestFirstName = bookingData.guestFirstName || bookingData.guestName?.split(" ")[0] || "Guest";
  const villaName = bookingData.villaName || "our villa";
  const checkin = bookingData.checkin;
  const checkout = bookingData.checkout;
  const depositAmount = bookingData.depositAmount || 0;
  const totalAmount = bookingData.totalAmount || 0;
  const remainingAmount = bookingData.remainingAmount || (totalAmount - depositAmount);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
  };

  const formatCurrency = (amount) => {
    return `IDR ${Math.round(amount).toLocaleString("id-ID")}`;
  };

  return `🌺 Hi ${guestFirstName},

Thank you for choosing ${villaName} for your upcoming Bali getaway from ${formatDate(checkin)} to ${formatDate(checkout)}. We can't wait to welcome you to our tropical haven and provide you with the best experience during your stay! 🌴😊

💰 **Payment Summary**:
- Total Stay: ${formatCurrency(totalAmount)}
- Deposit Paid (50%): ${formatCurrency(depositAmount)}
- Remaining Balance: ${formatCurrency(remainingAmount)}
The remaining balance is due upon check-in.

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
 * Send confirmation message via Hostaway's conversation API
 */
async function sendConfirmationViaHostaway(token, reservationId, bookingData) {
  try {
    const messageBody = buildConfirmationMessage(bookingData);

    const response = await axios.post(
      "https://api.hostaway.com/v1/conversationMessages",
      {
        reservationId: reservationId,
        body: messageBody,
        isIncoming: 0, // Outgoing message (from host to guest)
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log("Confirmation message sent via Hostaway:", response.data?.status || "OK");
    return true;
  } catch (error) {
    console.error(
      "Failed to send confirmation via Hostaway:",
      error.response?.data || error.message,
    );
    // Non-critical — reservation is still created
    return false;
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
    const webhookData = JSON.parse(event.body);

    console.log("Xendit webhook received:", JSON.stringify(webhookData, null, 2));

    const { id: invoiceId, status, external_id } = webhookData;

    console.log(`Payment webhook: ${invoiceId} - ${status} for ${external_id}`);

    // Only process PAID status
    if (status === "PAID") {
      const bookingData = await getTempBooking(external_id);

      if (!bookingData) {
        console.error(`No stored booking data found for ${external_id}`);
        return {
          statusCode: 200,
          body: JSON.stringify({
            received: true,
            warning: "No booking data found",
          }),
        };
      }

      try {
        const token = await getHostawayToken();

        // Parse guest name
        const nameParts = (bookingData.guestName || "").trim().split(" ");
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";

        // Calculate deposit info
        const totalAmount = parseFloat(bookingData.totalAmount);
        const depositAmount = bookingData.depositAmount || Math.round(totalAmount / 2);

        // Create reservation in Hostaway
        const reservationData = {
          channelId: 2000,
          listingMapId: parseInt(bookingData.listingId),
          isManuallyChecked: 1,
          isInitial: 1,
          guestName: bookingData.guestName || "",
          guestFirstName: firstName,
          guestLastName: lastName,
          guestEmail: bookingData.guestEmail || "",
          phone: bookingData.guestPhone || "",
          numberOfGuests: parseInt(bookingData.guests) || 2,
          adults: parseInt(bookingData.guests) || 2,
          arrivalDate: bookingData.checkin,
          departureDate: bookingData.checkout,
          totalPrice: totalAmount,
          currency: "IDR",
          status: "new",
          guestNote: bookingData.specialRequests || "",
          isPaid: 0, // 50% deposit — not fully paid
          paymentMethod: "xendit",
          hostNote: `50% deposit paid: IDR ${depositAmount.toLocaleString("id-ID")}. Remaining: IDR ${(totalAmount - depositAmount).toLocaleString("id-ID")} due at check-in.`,
        };

        const reservationResponse = await axios.post(
          "https://api.hostaway.com/v1/reservations?forceOverbooking=1",
          reservationData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        const reservationResult = reservationResponse.data;
        console.log("Reservation creation result:", JSON.stringify(reservationResult, null, 2));

        if (reservationResult.status === "success") {
          const reservationId = reservationResult.result.id;
          console.log(`Reservation created successfully: ${reservationId}`);

          // Send confirmation message via Hostaway conversation
          await sendConfirmationViaHostaway(token, reservationId, bookingData);

          // Clean up temp booking
          await cleanupTempBooking(external_id);
        } else {
          console.error("Failed to create reservation:", reservationResult);
        }
      } catch (reservationError) {
        console.error(
          `Error creating reservation for ${external_id}:`,
          reservationError.response?.data || reservationError.message,
        );
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true }),
    };
  } catch (error) {
    console.error("Webhook error:", error);
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, error: error.message }),
    };
  }
};
