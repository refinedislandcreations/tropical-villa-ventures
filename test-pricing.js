require("dotenv").config();
const { getToken } = require("./netlify/functions/hostaway-token");
const axios = require("axios");

async function checkPrice() {
  try {
    const token = await getToken();
    const listingId = 319474;
    const startingDate = "2026-07-01";
    const endingDate = "2026-07-05";
    const numberOfGuests = 2;

    const channelsToTest = [null, 9, 100, 1]; // null=default, 9=booking engine, 1=airbnb

    for (const channelId of channelsToTest) {
      console.log(`\n--- Testing with channelId: ${channelId} ---`);
      const body = {
        startingDate,
        endingDate,
        numberOfGuests,
        version: 2
      };
      if (channelId !== null) body.channelId = channelId;

      const response = await axios.post(
        `https://api.hostaway.com/v1/listings/${listingId}/calendar/priceDetails`,
        body,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      const res = response.data.result;
      console.log(`totalPrice: ${res.totalPrice}`);
      if (res.components) {
        res.components.forEach(c => console.log(`  Component: ${c.name} = ${c.value}`));
      }
    }

  } catch (error) {
    console.error(error.response?.data || error.message);
  }
}

checkPrice();
