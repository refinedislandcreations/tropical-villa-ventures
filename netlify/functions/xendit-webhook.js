// netlify/functions/xendit-webhook.js
const axios = require("axios");
const { getStore } = require("@netlify/blobs");

const STORE_NAME = "temp-bookings";

async function getHostawayToken() {
  const response = await axios.get(
    `${process.env.URL}/.netlify/functions/hostaway-token`,
  );
  return response.data.access_token;
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

    console.log(
      "Xendit webhook received:",
      JSON.stringify(webhookData, null, 2),
    );

    const { id: invoiceId, status, external_id } = webhookData;

    console.log(`Payment webhook: ${invoiceId} - ${status} for ${external_id}`);

    // Only process PAID status
    if (status === "PAID") {
      const store = getStore(STORE_NAME);

      try {
        // Retrieve stored booking data from Netlify Blobs
        const raw = await store.get(external_id);

        if (!raw) {
          console.error(`No stored booking data found for ${external_id}`);
          return {
            statusCode: 200,
            body: JSON.stringify({
              received: true,
              warning: "No booking data found",
            }),
          };
        }

        const storedData = JSON.parse(raw);
        const { bookingData } = storedData;

        const token = await getHostawayToken();

        // Parse guest name
        const nameParts = (bookingData.guestName || "").trim().split(" ");
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";

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
          totalPrice: parseFloat(bookingData.totalAmount),
          currency: "IDR",
          status: "new",
          guestNote: bookingData.specialRequests || "",
          isPaid: 1,
          paymentMethod: "xendit",
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
        console.log(
          "Reservation creation result:",
          JSON.stringify(reservationResult, null, 2),
        );

        if (reservationResult.status === "success") {
          console.log(
            `Reservation created successfully: ${reservationResult.result.id}`,
          );

          // Clean up the temp booking data
          await store.delete(external_id);
          console.log(`Cleaned up temp booking for ${external_id}`);
        } else {
          console.error("Failed to create reservation:", reservationResult);
        }
      } catch (storeError) {
        console.error(
          `Error processing booking for ${external_id}:`,
          storeError.message,
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
