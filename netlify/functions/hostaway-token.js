// netlify/functions/hostaway-token.js
const axios = require("axios");

let cachedToken = null;
let tokenExpiry = null;

async function getToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const clientId = process.env.HOSTAWAY_ACCOUNT_ID;
  const clientSecret = process.env.HOSTAWAY_API_KEY;

  if (!clientId || !clientSecret) {
    throw new Error("Missing Hostaway credentials");
  }

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("scope", "general");

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
    tokenExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
    return cachedToken;
  }
  throw new Error("Failed to get access token");
}

exports.getToken = getToken;

exports.handler = async (event) => {
  try {
    const token = await getToken();
    return {
      statusCode: 200,
      body: JSON.stringify({ access_token: token }),
    };
  } catch (error) {
    console.error("Hostaway token error:", error.response?.data || error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Authentication failed",
        details: error.response?.data?.message || error.message,
      }),
    };
  }
};
