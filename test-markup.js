require("dotenv").config();
const axios = require("axios");
const { getToken } = require("./netlify/functions/hostaway-token");

async function testMarkup() {
  const token = await getToken();
  const listingId = 319474;
  
  const response = await axios.post(
    `https://api.hostaway.com/v1/listings/${listingId}/calendar/priceDetails`,
    {
      startingDate: "2026-06-15",
      endingDate: "2026-06-18",
      numberOfGuests: 2,
      markup: 0.9,
      version: 2
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  
  const result = response.data.result;
  console.log("Status:", response.data.status);
  console.log("Totals:", result.total);
  result.components.forEach(c => console.log(`${c.type} - ${c.name}: ${c.value}`));
}
testMarkup();
