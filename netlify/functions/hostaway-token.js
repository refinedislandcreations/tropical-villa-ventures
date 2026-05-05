// netlify/functions/hostaway-token.js
const axios = require("axios");

let cachedToken = null;
let tokenExpiry = null;

exports.handler = async (event) => {
  // Check if we have a valid cached token
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return {
      statusCode: 200,
      body: JSON.stringify({ access_token: cachedToken }),
    };
  }

  const clientId = process.env.HOSTAWAY_ACCOUNT_ID;
  const clientSecret = process.env.HOSTAWAY_API_KEY;

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("scope", "general");

  try {
    const response = await axios.post(
      "https://api.hostaway.com/v1/accessTokens",
      params.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const data = response.data;

    if (data.access_token) {
      cachedToken = data.access_token;
      tokenExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days cache

      return {
        statusCode: 200,
        body: JSON.stringify({ access_token: data.access_token }),
      };
    }

    throw new Error("Failed to get access token");
  } catch (error) {
    console.error(
      "Hostaway token error:",
      error.response?.data || error.message,
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Authentication failed",
        details: error.response?.data?.message || error.message,
      }),
    };
  }
};
