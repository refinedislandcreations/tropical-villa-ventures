let cachedToken = null;
let expiry = null;

async function getToken() {
  if (cachedToken && expiry > Date.now()) {
    return cachedToken;
  }

  const params = new URLSearchParams();

  params.append("grant_type", "client_credentials");
  params.append("client_id", process.env.HOSTAWAY_ACCOUNT_ID);
  params.append("client_secret", process.env.HOSTAWAY_API_KEY);
  params.append("scope", "general");

  const res = await fetch("https://api.hostaway.com/v1/accessTokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: params.toString(),
  });

  const data = await res.json();

  cachedToken = data.access_token;

  // convert expires_in seconds → milliseconds
  expiry = Date.now() + data.expires_in * 1000;

  return cachedToken;
}

export async function hostawayFetch(url) {
  const token = await getToken();

  // hostaway requires 1 second delay before using token
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.json();
}
