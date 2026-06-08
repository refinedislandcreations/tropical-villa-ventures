require("dotenv").config();
const { handler } = require("./netlify/functions/calculate-price.js");

async function run() {
  const event = {
    httpMethod: "POST",
    body: JSON.stringify({
      listingId: 319474,
      startingDate: "2026-06-15",
      endingDate: "2026-06-18",
      numberOfGuests: 2,
    })
  };
  
  const result = await handler(event);
  console.log("Status Code:", result.statusCode);
  if (result.statusCode === 200) {
    const data = JSON.parse(result.body);
    console.log("Success:", data.success);
    console.log("Base Price:", data.basePrice);
    console.log("Reservation Subtotal:", data.reservationSubtotal);
    console.log("Total Price:", data.totalPrice);
    console.log("Breakdown:", data.breakdown);
    console.log("Components:");
    data.components.forEach(c => console.log(`  ${c.name}: ${c.amount} (${c.type})`));
  } else {
    console.log("Body:", result.body);
  }
}

run();
