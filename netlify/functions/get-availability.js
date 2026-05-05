// netlify/functions/get-availability.js
const axios = require("axios");

async function getHostawayToken() {
  const response = await axios.get(
    `${process.env.URL}/.netlify/functions/hostaway-token`,
  );
  return response.data.access_token;
}

exports.handler = async (event) => {
  const { listingId, startDate, endDate } = event.queryStringParameters;

  if (!listingId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "listingId is required" }),
    };
  }

  try {
    const token = await getHostawayToken();

    // Default to next 12 months if no dates provided
    const start = startDate || new Date().toISOString().split("T")[0];
    const end =
      endDate ||
      (() => {
        const date = new Date();
        date.setMonth(date.getMonth() + 12);
        return date.toISOString().split("T")[0];
      })();

    const response = await axios.get(
      `https://api.hostaway.com/v1/listings/${listingId}/calendar?startDate=${start}&endDate=${end}&includeResources=0`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-control": "no-cache",
        },
      },
    );

    const data = response.data;

    const calendarData = data.result
      ? data.result.map((day) => ({
          date: day.date,
          available: day.isAvailable === 1 || day.status === "available",
          status: day.status,
          price: day.price,
          minStay: day.minimumStay,
        }))
      : [];

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        calendar: calendarData,
      }),
    };
  } catch (error) {
    console.error(
      "Calendar fetch error:",
      error.response?.data || error.message,
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to fetch calendar",
        details: error.response?.data?.result || error.message,
      }),
    };
  }
};
