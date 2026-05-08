const axios = require('axios');

async function getHostawayToken() {
  const clientId = "73263";
  const clientSecret = "3b2367d3b4cf151b6f92b080aabf9855b142cb932750c19acd50405ca7a5f135";
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("scope", "general");

  const response = await axios.post(
    "https://api.hostaway.com/v1/accessTokens",
    params.toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );
  return response.data.access_token;
}

async function run() {
  try {
    const token = await getHostawayToken();

    const response = await axios.get(
      "https://api.hostaway.com/v1/coupons",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-control": "no-cache",
        },
      }
    );
    console.log(JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error("ERROR:");
    console.error(JSON.stringify(err.response?.data || err.message, null, 2));
  }
}
run();
