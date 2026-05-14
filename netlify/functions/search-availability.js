// netlify/functions/search-availability.js
// Uses Hostaway Booking Engine API for instant availability check across all listings
// This is a public API that doesn't require authentication — much faster than per-listing calendar calls

const axios = require("axios");

exports.handler = async (event) => {
  const { startDate, endDate, guests } = event.queryStringParameters || {};

  if (!startDate || !endDate) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "startDate and endDate are required" }),
    };
  }

  try {
    // Convert dates to ISO format for the dates[] parameter
    const startISO = new Date(startDate + "T17:00:00.000Z").toISOString();
    const endISO = new Date(endDate + "T17:00:00.000Z").toISOString();

    const url = `https://booking-engine.hostaway.com/bookingEngines/www.tvvbali.com/listings`;
    const params = {
      availabilityGuestNumber: parseInt(guests) || 1,
      limit: 20,
      calendarAvailabilityStartDate: startDate,
      calendarAvailabilityEndDate: endDate,
      offset: 0,
      "dates[]": [startISO, endISO],
    };

    const response = await axios.get(url, {
      params,
      timeout: 10000,
    });

    const data = response.data;

    if (data.status === "success" && data.result) {
      const listings = data.result.map((item) => ({
        hostawayId: item.listing?.listingMap || item.id,
        listingId: item.listing?.id,
        name: item.listing?.name || "",
        description: item.listing?.description || "",
        personCapacity: item.listing?.personCapacity || 0,
        bedrooms: item.listing?.bedroomsNumber || 0,
        bathrooms: item.listing?.bathroomsNumber || 0,
        price: item.listing?.price || 0,
        averageNightlyPrice: item.averageNightlyPrice || 0,
        totalPrice: item.totalPriceForGivenPeriod || 0,
        currency: item.listing?.currencyCode || "IDR",
        image: item.listingImage?.[0]?.url || "",
        city: item.listing?.city || "",
        country: item.listing?.countryUsingCountryCode || "",
      }));

      return {
        statusCode: 200,
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify({
          success: true,
          count: data.count || listings.length,
          listings,
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, count: 0, listings: [] }),
    };
  } catch (error) {
    console.error(
      "Search availability error:",
      error.response?.data || error.message
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to search availability",
        details: error.response?.data || error.message,
      }),
    };
  }
};
