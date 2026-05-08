// netlify/functions/calculate-price.js
const axios = require("axios");

const { getToken } = require("./hostaway-token");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { listingId, startingDate, endingDate, numberOfGuests, couponCode } =
      JSON.parse(event.body);

    const token = await getToken();

    // Calculate price using Hostaway API
    const requestBody = {
      startingDate,
      endingDate,
      numberOfGuests: parseInt(numberOfGuests),
      version: 2,
    };

    // Add coupon if provided
    if (couponCode) {
      try {
        const couponResponse = await axios.post(
          "https://api.hostaway.com/v1/reservationCoupons",
          {
            couponName: couponCode,
            listingMapId: parseInt(listingId),
            startingDate,
            endingDate,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        const couponData = couponResponse.data;
        if (
          couponData.status === "success" &&
          couponData.result &&
          couponData.result.id
        ) {
          requestBody.reservationCouponId = couponData.result.id;
        }
      } catch (couponError) {
        console.log("Coupon not found or invalid:", couponCode);
        return {
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            error: "Coupon not found or invalid",
          }),
        };
      }
    }

    const response = await axios.post(
      `https://api.hostaway.com/v1/listings/${listingId}/calendar/priceDetails`,
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const data = response.data;

    if (data.status === "success" && data.result) {
      const components = data.result.components || [];

      const breakdown = {
        baseRate: 0,
        cleaningFee: 0,
        taxes: 0,
        discounts: 0,
        otherFees: 0,
      };

      components.forEach((comp) => {
        const amount = comp.total || comp.value || 0;
        switch (comp.type) {
          case "price":
            breakdown.baseRate = amount;
            break;
          case "fee":
            if (comp.name === "cleaningFee") breakdown.cleaningFee = amount;
            else breakdown.otherFees += amount;
            break;
          case "tax":
            breakdown.taxes += amount;
            break;
          case "discount":
            breakdown.discounts += Math.abs(amount);
            break;
        }
      });

      // Calculate nights for accurate breakdown
      const start = new Date(startingDate);
      const end = new Date(endingDate);
      const nights = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      const pricePerNight = data.result.totalPrice / nights;

      return {
        statusCode: 200,
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify({
          success: true,
          totalPrice: data.result.totalPrice,
          pricePerNight: pricePerNight,
          nights: nights,
          currency: "IDR",
          breakdown,
          components: components.map((c) => ({
            name: c.title || c.name,
            type: c.type,
            amount: c.total || c.value,
          })),
        }),
      };
    }

    throw new Error(data.result || "Price calculation failed");
  } catch (error) {
    console.error(
      "Price calculation error:",
      error.response?.data || error.message,
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Price calculation failed",
        details: error.response?.data?.result || error.message,
      }),
    };
  }
};
