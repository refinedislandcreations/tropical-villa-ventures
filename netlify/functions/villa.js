import { hostawayFetch } from "./hostaway.js";

export async function handler(event) {
  const id = event.queryStringParameters.id;

  const data = await hostawayFetch(
    `https://api.hostaway.com/v1/listings/${id}?includeResources=1`,
  );

  return {
    statusCode: 200,
    body: JSON.stringify(data.result),
  };
}
