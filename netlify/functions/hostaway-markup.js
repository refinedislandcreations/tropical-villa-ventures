const { getStore } = require("@netlify/blobs");
const axios = require("axios");

async function getBookingEngineMarkup(listingId, token) {
  let store;
  try {
    store = getStore("hostaway-cache");
    const cachedBlob = await store.get(`markup-data-${listingId}`, { type: "json" });
    if (cachedBlob && cachedBlob.markup !== undefined && cachedBlob.expiry) {
      if (Date.now() < cachedBlob.expiry) {
        return cachedBlob.markup;
      }
    }
  } catch (e) {
    console.warn("Netlify Blobs not available for markup cache:", e.message);
  }

  let bookingEngineMarkup = 1;
  try {
    const listingResponse = await axios.get(
      `https://api.hostaway.com/v1/listings/${listingId}?includeResources=0`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (listingResponse.data?.result?.bookingEngineMarkup !== undefined) {
      bookingEngineMarkup = listingResponse.data.result.bookingEngineMarkup;
    }
  } catch (e) {
    console.error(`Failed to fetch listing ${listingId} for markup:`, e.message);
  }

  if (store) {
    try {
      const expiry = Date.now() + 12 * 60 * 60 * 1000;
      await store.setJSON(`markup-data-${listingId}`, {
        markup: bookingEngineMarkup,
        expiry: expiry
      });
    } catch (e) {}
  }

  return bookingEngineMarkup;
}

exports.getBookingEngineMarkup = getBookingEngineMarkup;
