require("dotenv").config();
const { handler } = require("./netlify/functions/get-availability");

async function run() {
  const event = {
    queryStringParameters: {
      listingId: "319474", // example ID
      startDate: "2026-06-08",
      endDate: "2026-06-15",
    },
  };

  const response = await handler(event);
  console.log("Status Code:", response.statusCode);
  const data = JSON.parse(response.body);
  console.log("Success:", data.success);
  if (data.calendar && data.calendar.length > 0) {
    console.log("First day price:", data.calendar[0].price);
  }
}

run();
