const axios = require('axios');

async function getHostawayToken() {
  const clientId = "73263";
  const clientSecret = "3b2367d3b4cf151b6f92b080aabf9855b142cb932750c19acd50405ca7a5f135";
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("scope", "general");

  const response = await axios.post(
    "https://api.hostaway.com/v1/accessTokens",
    params.toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );
  return response.data.access_token;
}

async function run() {
  try {
    const token = await getHostawayToken();
    const reservationData = {
        channelId: 2000,
        listingMapId: 319474,
        isManuallyChecked: 0,
        isInitial: 0,
        guestName: "Test User 2",
        guestFirstName: "Test",
        guestLastName: "User",
        guestEmail: "test2@example.com",
        numberOfGuests: 1,
        adults: 1,
        children: null,
        infants: null,
        pets: null,
        arrivalDate: "2026-10-15",
        departureDate: "2026-10-20",
        phone: "+628123456789",
        totalPrice: 1000000,
        taxAmount: null,
        channelCommissionAmount: null,
        cleaningFee: null,
        securityDepositFee: null,
        isPaid: 1,
        currency: "IDR",
        status: "new",
        hostNote: "Test Note",
        couponName: "INVALID",
        financeField: [
          {
            type: "price",
            name: "baseRate",
            title: "Base rate",
            value: 1000000,
            total: 1000000,
            isIncludedInTotalPrice: 1,
            isOverriddenByUser: 0,
            isQuantitySelectable: 0,
            isDeleted: 0
          }
        ]
    };

    const response = await axios.post(
      "https://api.hostaway.com/v1/reservations?forceOverbooking=1",
      reservationData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Cache-control": "no-cache",
        },
      }
    );
    console.log(JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error("ERROR:");
    console.error(JSON.stringify(err.response?.data || err.message, null, 2));
  }
}
run();
