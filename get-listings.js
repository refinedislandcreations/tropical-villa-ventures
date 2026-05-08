const fs = require('fs');
const axios = require('axios');
const querystring = require('querystring');

const envFile = fs.readFileSync('.env', 'utf8');
const envVars = envFile.split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1]] = match[2];
  return acc;
}, {});

async function test() {
  try {
    const tokenResponse = await axios.post(
      "https://api.hostaway.com/v1/accessTokens",
      querystring.stringify({
        grant_type: "client_credentials",
        client_id: envVars.HOSTAWAY_ACCOUNT_ID,
        client_secret: envVars.HOSTAWAY_API_KEY,
        scope: "general",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    const token = tokenResponse.data.access_token;

    const response = await axios.get("https://api.hostaway.com/v1/listings", {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(response.data.result.map(l => ({ id: l.id, name: l.name })));
  } catch (e) {
    console.error(e.message);
  }
}
test();
