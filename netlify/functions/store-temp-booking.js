// netlify/functions/store-temp-booking.js
// Persistent temp storage with fallback for local development

let blobsAvailable = true;
let getStore;
try {
  ({ getStore } = require("@netlify/blobs"));
} catch (e) {
  blobsAvailable = false;
}

const STORE_NAME = "temp-bookings";
const TTL_MS = 86400000; // 24 hours

// In-memory fallback for local development (won't persist across restarts)
const memoryStore = new Map();

async function getBlobStore() {
  if (blobsAvailable && getStore) {
    try {
      return getStore(STORE_NAME);
    } catch (e) {
      console.warn("Blob store init failed, using memory fallback:", e.message);
    }
  }
  return null;
}

async function getBooking(id) {
  let data = null;
  const store = await getBlobStore();
  if (store) {
    const raw = await store.get(id);
    if (raw) data = JSON.parse(raw);
  }
  if (!data && memoryStore.has(id)) {
    data = memoryStore.get(id);
  }
  if (!data) return null;
  
  if (data.expires && data.expires < Date.now()) {
    if (store) await store.delete(id).catch(() => {});
    memoryStore.delete(id);
    return null;
  }
  return data.bookingData;
}

async function saveBooking(externalId, bookingData) {
  const store = await getBlobStore();
  const payload = {
    bookingData,
    expires: Date.now() + TTL_MS,
    createdAt: new Date().toISOString(),
  };
  if (store) {
    try {
      await store.set(externalId, JSON.stringify(payload));
    } catch (blobError) {
      memoryStore.set(externalId, payload);
    }
  } else {
    memoryStore.set(externalId, payload);
  }
}

async function removeBooking(id) {
  const store = await getBlobStore();
  if (store) await store.delete(id).catch(() => {});
  memoryStore.delete(id);
}

exports.getBooking = getBooking;
exports.saveBooking = saveBooking;
exports.removeBooking = removeBooking;

exports.handler = async (event) => {
  const store = await getBlobStore();

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
      const bookingData = await getBooking(id);
      if (!bookingData) {
        return { statusCode: 404, body: JSON.stringify({ error: "Not found or expired" }) };
      }
      return {
        statusCode: 200,
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify({ bookingData }),
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

      await saveBooking(externalId, bookingData);
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
      await removeBooking(id);
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
