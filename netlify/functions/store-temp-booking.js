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

// Internal module only — do not expose HTTP endpoints
exports.handler = async () => {
  return {
    statusCode: 404,
    headers: { "Cache-Control": "no-store" },
    body: JSON.stringify({ error: "Not Found" }),
  };
};
