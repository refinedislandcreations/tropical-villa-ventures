// netlify/functions/listing-price.js
const axios = require("axios");

async function getHostawayToken() {
  const response = await axios.get(
    `${process.env.URL}/.netlify/functions/hostaway-token`,
  );
  return response.data.access_token;
}

exports.handler = async (event) => {
  const { listingId, checkin, checkout } = event.queryStringParameters;

  if (!listingId || !checkin || !checkout) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "listingId, checkin, and checkout are required",
      }),
    };
  }

  try {
    const token = await getHostawayToken();

    const response = await axios.post(
      `https://api.hostaway.com/v1/listings/${listingId}/calendar/priceDetails`,
      {
        startingDate: checkin,
        endingDate: checkout,
        numberOfGuests: 2,
        version: 2,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const data = response.data;

    if (data.status === "success" && data.result) {
      const startDate = new Date(checkin);
      const endDate = new Date(checkout);
      const nights = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      const pricePerNight = data.result.totalPrice / nights;

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          totalPrice: data.result.totalPrice,
          pricePerNight: pricePerNight,
          currency: "IDR",
          nights: nights,
        }),
      };
    }

    throw new Error(data.result || "Price calculation failed");
  } catch (error) {
    console.error(
      "Listing price error:",
      error.response?.data || error.message,
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to fetch price",
        details: error.response?.data?.result || error.message,
      }),
    };
  }
};
