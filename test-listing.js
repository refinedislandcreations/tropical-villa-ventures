require("dotenv").config();
const { getToken } = require("./netlify/functions/hostaway-token");
const axios = require("axios");

async function fetchListing() {
  try {
    const token = await getToken();
    const listingId = 319474;
    const response = await axios.get(
      `https://api.hostaway.com/v1/listings/${listingId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
      }
    );
    console.log(Object.keys(response.data.result));
    console.log(response.data.result.priceMarkup);
    console.log(response.data.result.channelMarkups);
    console.log(response.data.result.bookingEngineMarkup);
  } catch (error) {
    console.error(error.response?.data || error.message);
  }
}

fetchListing();
