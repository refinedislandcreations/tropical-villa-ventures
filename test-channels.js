require("dotenv").config();
const { getToken } = require("./netlify/functions/hostaway-token");
const axios = require("axios");

async function fetchChannels() {
  try {
    const token = await getToken();
    const response = await axios.get(
      `https://api.hostaway.com/v1/channels`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
      }
    );
    console.log(JSON.stringify(response.data.result, null, 2));
  } catch (error) {
    console.error("Channels fetch failed", error.response?.data || error.message);
  }
}

fetchChannels();
