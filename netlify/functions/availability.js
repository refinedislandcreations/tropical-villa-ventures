import { hostawayFetch } from "./hostaway.js";

export async function handler(event) {
  const { start, end, guests } = event.queryStringParameters;

  const url = `https://api.hostaway.com/v1/listings?availabilityDateStart=${start}&availabilityDateEnd=${end}&availabilityGuestNumber=${guests}`;

  const data = await hostawayFetch(url);

  return {
    statusCode: 200,
    body: JSON.stringify(data.result),
  };
}
