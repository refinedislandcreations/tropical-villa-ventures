import { hostawayFetch } from "./hostaway.js";

export async function handler() {
  const data = await hostawayFetch(
    "https://api.hostaway.com/v1/listings?limit=50&includeResources=1",
  );

  return {
    statusCode: 200,
    body: JSON.stringify(data.result),
  };
}
