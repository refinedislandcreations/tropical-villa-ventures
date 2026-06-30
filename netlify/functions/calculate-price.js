// netlify/functions/calculate-price.js
const axios = require("axios");

const { getToken } = require("./hostaway-token");
const {
  calculateReservationTotals,
  normalizeFinanceFields,
  resolveCouponContext,
  roundAmount,
} = require("./hostaway-pricing");

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
    const start = new Date(startingDate);
    const end = new Date(endingDate);
    const nights = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    let couponContext = null;
    if (couponCode) {
      try {
        couponContext = await resolveCouponContext(token, {
          couponCode,
          listingMapId: listingId,
          startingDate,
          endingDate,
          nights,
        });
      } catch (couponError) {
        console.log("Coupon not found or invalid:", couponCode);
        return {
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            error: couponError.message || "Coupon not found or invalid",
          }),
        };
      }
    }

    // Calculate price using Hostaway API
    const requestBody = {
      startingDate,
      endingDate,
      numberOfGuests: parseInt(numberOfGuests),
      version: 2,
    };

    if (couponContext?.reservationCouponId) {
      requestBody.reservationCouponId = couponContext.reservationCouponId;
    }

    // CHECK AVAILABILITY FIRST
    const calendarResponse = await axios.get(
      `https://api.hostaway.com/v1/listings/${listingId}/calendar?startDate=${startingDate}&endDate=${endingDate}&includeResources=0`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (calendarResponse.data && calendarResponse.data.result) {
      // Only check up to the night before checkout
      const days = calendarResponse.data.result.filter(
        (d) => d.date >= startingDate && d.date < endingDate,
      );
      const isAvailable = days.every(
        (d) => d.status === "available" || d.isAvailable === 1,
      );
      if (!isAvailable || days.length === 0) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: false,
            error: "Dates not available",
          }),
        };
      }
    }

    const availabilityVerifiedAt = Date.now();

    const { getBookingEngineMarkup } = require("./hostaway-markup");
    let bookingEngineMarkup = await getBookingEngineMarkup(listingId, token);

    if (typeof bookingEngineMarkup === 'number' && bookingEngineMarkup !== 1 && bookingEngineMarkup !== 0) {
      requestBody.markup = bookingEngineMarkup;
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
      const components = normalizeFinanceFields(
        data.result.components ||
        data.result.financeField ||
        data.result.financeFields ||
        [],
      );

      const pricingTotals = calculateReservationTotals(
        components,
        couponContext?.coupon,
      );

      const breakdown = {
        baseRate: 0,
        cleaningFee: 0,
        taxes: 0,
        discounts: 0,
        otherFees: 0,
      };

      const componentDiscountTotal = components.reduce((sum, comp) => {
        if (comp.type !== "discount") return sum;
        return sum + Math.abs(comp.total || comp.value || 0);
      }, 0);

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

      breakdown.discounts = Math.max(
        0,
        roundAmount(componentDiscountTotal - pricingTotals.couponDiscount),
      );
      breakdown.couponDiscount = pricingTotals.couponDiscount;

      // reservationBaseAmount is the final amount used for payment (after discounts)
      const reservationBaseAmount = pricingTotals.total;
      // Use the room subtotal (pre-discount) to display the real per-night price
      const reservationSubtotal =
        pricingTotals.roomSubtotal ??
        pricingTotals.subtotal ??
        reservationBaseAmount;
      const pricePerNight = reservationSubtotal / nights;

      // Calculate Payment Processing Fee
      // Formula provided by user: 2.9% + 2000 + 11% VAT
      const baseAmount = reservationBaseAmount;
      const processingRate = 0.029; // 2.9%
      const fixedFee = 2000;
      const vatRate = 0.11; // 11%

      const processingFee = baseAmount * processingRate;
      const feeBeforeVAT = processingFee + fixedFee;
      const vat = feeBeforeVAT * vatRate;
      const totalFee = feeBeforeVAT + vat;

      const finalTotalPrice = baseAmount + totalFee;

      return {
        statusCode: 200,
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify({
          success: true,
          basePrice: baseAmount,
          reservationSubtotal: reservationSubtotal,
          couponDiscount: pricingTotals.couponDiscount,
          reservationCouponId: couponContext?.reservationCouponId || null,
          couponName: couponContext?.coupon?.name || couponCode || null,
          financeFields: components,
          totalPrice: finalTotalPrice,
          pricePerNight: pricePerNight,
          nights: nights,
          availabilityVerifiedAt,
          currency: "IDR",
          breakdown,
          fees: {
            processingFee,
            fixedFee,
            vat,
            totalFee,
          },
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
        details: "An unexpected error occurred during processing.",
      }),
    };
  }
};
