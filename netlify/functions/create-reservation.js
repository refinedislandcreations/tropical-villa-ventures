// netlify/functions/create-reservation.js
const axios = require("axios");

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
    const {
      listingId,
      checkin,
      checkout,
      guests,
      guestName,
      guestEmail,
      guestPhone,
      guestAddress,
      guestCity,
      guestCountry,
      totalPrice,
      specialRequests,
    } = JSON.parse(event.body);

    const token = await getHostawayToken();

    // Parse guest name
    const nameParts = guestName.trim().split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    const reservationData = {
      channelId: 2000, // Direct booking channel
      listingMapId: parseInt(listingId),
      isManuallyChecked: 1,
      isInitial: 1,
      guestName: guestName,
      guestFirstName: firstName,
      guestLastName: lastName,
      guestEmail: guestEmail,
      phone: guestPhone,
      guestAddress: guestAddress || "",
      guestCity: guestCity || "",
      guestCountry: guestCountry || "ID",
      numberOfGuests: parseInt(guests),
      adults: parseInt(guests),
      arrivalDate: checkin,
      departureDate: checkout,
      totalPrice: parseFloat(totalPrice),
      currency: "IDR",
      status: "new",
      guestNote: specialRequests || "",
    };

    const response = await axios.post(
      "https://api.hostaway.com/v1/reservations?forceOverbooking=1",
      reservationData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const data = response.data;

    if (data.status === "success" && data.result) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          reservationId: data.result.id,
          hostawayReservationId: data.result.hostawayReservationId,
          message: "Reservation created successfully",
        }),
      };
    }

    throw new Error(data.result || "Failed to create reservation");
  } catch (error) {
    console.error(
      "Reservation creation error:",
      error.response?.data || error.message,
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to create reservation",
        details: error.response?.data?.result || error.message,
      }),
    };
  }
};
