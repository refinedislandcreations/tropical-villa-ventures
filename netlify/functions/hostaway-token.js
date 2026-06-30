const { getStore } = require("@netlify/blobs");
const axios = require("axios");

let memoryCachedToken = null;
let memoryTokenExpiry = null;

async function getToken() {
  if (memoryCachedToken && memoryTokenExpiry && Date.now() < memoryTokenExpiry) {
    return memoryCachedToken;
  }

  let store;
  try {
    store = getStore("hostaway-cache");
    const cachedBlob = await store.get("access-token", { type: "json" });
    if (cachedBlob && cachedBlob.token && cachedBlob.expiry) {
      if (Date.now() < cachedBlob.expiry) {
        memoryCachedToken = cachedBlob.token;
        memoryTokenExpiry = cachedBlob.expiry;
        return memoryCachedToken;
      }
    }
  } catch (e) {
    console.warn("Netlify Blobs not available for token:", e.message);
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
    memoryCachedToken = data.access_token;
    // Set expiry to 29 days (Hostaway token is 30 days)
    memoryTokenExpiry = Date.now() + 29 * 24 * 60 * 60 * 1000;
    
    if (store) {
      try {
        await store.setJSON("access-token", {
          token: memoryCachedToken,
          expiry: memoryTokenExpiry
        });
      } catch (e) {}
    }
    return memoryCachedToken;
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
        details: "An unexpected error occurred during processing.",
      }),
    };
  }
};
