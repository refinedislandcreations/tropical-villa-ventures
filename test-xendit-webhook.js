const axios = require('axios');

async function run() {
  try {
    const payload = {
      id: "inv_12345",
      external_id: "BOOKING_TEST_123",
      status: "PAID",
      amount: 1000000,
      currency: "IDR",
      payer_email: "test@example.com",
      metadata: {
        bookingData: {
          listingId: 319474,
          checkin: "2026-11-01",
          checkout: "2026-11-05",
          guests: 1,
          totalAmount: 1000000,
          guestName: "Test Webhook",
          guestFirstName: "Test",
          guestLastName: "Webhook",
          guestEmail: "test@example.com",
          guestPhone: "+628123456789",
          villaName: "Tropical Villa",
          specialRequests: "",
          couponCode: null
        }
      }
    };

    const response = await axios.post(
      "http://localhost:8888/.netlify/functions/xendit-webhook",
      payload,
      {
        headers: { "Content-Type": "application/json" },
        validateStatus: () => true
      }
    );

    console.log(`HTTP Status: ${response.status}`);
    console.log("Body:", JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error("ERROR:");
    console.error(err.message);
  }
}
run();
