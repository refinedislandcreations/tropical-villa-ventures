// netlify/functions/store-temp-booking.js
// Persistent temp storage using Netlify Blobs
const { getStore } = require("@netlify/blobs");

const STORE_NAME = "temp-bookings";
const TTL_MS = 86400000; // 24 hours

exports.handler = async (event) => {
  const store = getStore(STORE_NAME);

  // GET request - retrieve stored booking data
  if (event.httpMethod === "GET") {
    const { id } = event.queryStringParameters || {};

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing id parameter" }),
      };
    }

    try {
      const raw = await store.get(id);

      if (!raw) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Not found" }),
        };
      }

      const data = JSON.parse(raw);

      // Check TTL
      if (data.expires && data.expires < Date.now()) {
        await store.delete(id);
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Expired" }),
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ bookingData: data.bookingData }),
      };
    } catch (error) {
      console.error("Retrieve error:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message }),
      };
    }
  }

  // POST request - store booking data
  if (event.httpMethod === "POST") {
    try {
      const { externalId, bookingData } = JSON.parse(event.body);

      if (!externalId || !bookingData) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Missing externalId or bookingData" }),
        };
      }

      const payload = {
        bookingData,
        expires: Date.now() + TTL_MS,
        createdAt: new Date().toISOString(),
      };

      await store.set(externalId, JSON.stringify(payload));

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      };
    } catch (error) {
      console.error("Store error:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message }),
      };
    }
  }

  // DELETE request - clean up after reservation creation
  if (event.httpMethod === "DELETE") {
    const { id } = event.queryStringParameters || {};

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing id parameter" }),
      };
    }

    try {
      await store.delete(id);
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      };
    } catch (error) {
      console.error("Delete error:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message }),
      };
    }
  }

  return {
    statusCode: 405,
    body: JSON.stringify({ error: "Method not allowed" }),
  };
};
