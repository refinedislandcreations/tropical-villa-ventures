const axios = require("axios");

function toNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function roundAmount(value) {
  return Math.round(toNumber(value));
}

function getApiResult(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.result)) return data.result;
  if (data.result && Array.isArray(data.result.components))
    return data.result.components;
  return null;
}

function normalizeFinanceFields(source) {
  const fields = Array.isArray(source)
    ? source
    : Array.isArray(source?.financeField)
      ? source.financeField
      : Array.isArray(source?.financeFields)
        ? source.financeFields
        : Array.isArray(source?.components)
          ? source.components
          : [];

  return fields.map((field) => ({
    ...field,
    value:
      field.value === null || field.value === undefined
        ? field.value
        : toNumber(field.value),
    total: toNumber(field.total ?? field.value),
  }));
}

function sumFinanceFieldTotals(fields) {
  return normalizeFinanceFields(fields).reduce(
    (sum, field) => sum + toNumber(field.total),
    0,
  );
}

function calculateCouponDiscount(coupon, subtotal) {
  if (!coupon) return 0;

  if (coupon.type === "percentage") {
    return roundAmount((toNumber(subtotal) * toNumber(coupon.amount)) / 100);
  }

  if (coupon.type === "flatFee" || coupon.type === "flat") {
    return roundAmount(coupon.amount);
  }

  return 0;
}

function isCouponApplicable(coupon, { startingDate, endingDate, nights }) {
  if (!coupon) return false;
  if (coupon.isActive !== 1 || coupon.isExpired === 1) return false;

  const used = toNumber(coupon.numberOfUsesUsed);
  const initialUses = toNumber(coupon.numberOfUsesInitial);
  if (initialUses !== -1 && used >= initialUses) return false;

  if (coupon.minimumNights && nights < toNumber(coupon.minimumNights))
    return false;
  if (coupon.maximumNights && nights > toNumber(coupon.maximumNights))
    return false;

  if (coupon.checkInDateStart && startingDate < coupon.checkInDateStart)
    return false;
  if (coupon.checkInDateEnd && startingDate > coupon.checkInDateEnd)
    return false;
  if (coupon.validityDateStart && endingDate < coupon.validityDateStart)
    return false;
  if (coupon.validityDateEnd && endingDate > coupon.validityDateEnd)
    return false;

  return true;
}

async function listCoupons(token) {
  const response = await axios.get("https://api.hostaway.com/v1/coupons", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-control": "no-cache",
    },
  });

  return getApiResult(response.data) || [];
}

async function createReservationCoupon(
  token,
  { couponName, listingMapId, startingDate, endingDate },
) {
  const response = await axios.post(
    "https://api.hostaway.com/v1/reservationCoupons",
    {
      couponName,
      listingMapId: Number(listingMapId),
      startingDate,
      endingDate,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cache-control": "no-cache",
      },
    },
  );

  const result = response.data?.result || response.data;
  const reservationCouponId =
    result?.reservationCouponId ??
    result?.id ??
    response.data?.reservationCouponId ??
    null;

  if (!reservationCouponId) {
    throw new Error("Hostaway did not return a reservationCouponId");
  }

  return {
    reservationCouponId: Number(reservationCouponId),
    raw: response.data,
  };
}

async function resolveCouponContext(
  token,
  { couponCode, listingMapId, startingDate, endingDate, nights },
) {
  const normalizedCouponCode = (couponCode || "").trim().toUpperCase();
  if (!normalizedCouponCode) {
    return { coupon: null, reservationCouponId: null };
  }

  const coupons = await listCoupons(token);
  const coupon = coupons.find(
    (item) => (item.name || "").trim().toUpperCase() === normalizedCouponCode,
  );

  if (
    !coupon ||
    !isCouponApplicable(coupon, { startingDate, endingDate, nights })
  ) {
    const error = new Error("Coupon not found or invalid");
    error.statusCode = 400;
    throw error;
  }

  const reservationCoupon = await createReservationCoupon(token, {
    couponName: coupon.name,
    listingMapId,
    startingDate,
    endingDate,
  });

  return {
    coupon,
    reservationCouponId: reservationCoupon.reservationCouponId,
    reservationCoupon: reservationCoupon.raw,
  };
}

async function getReservationFinanceFields(token, reservationId) {
  const response = await axios.get(
    `https://api.hostaway.com/v1/financeField/${reservationId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Cache-control": "no-cache",
      },
    },
  );

  return normalizeFinanceFields(getApiResult(response.data) || []);
}

async function updateReservationFinanceField(
  token,
  reservationId,
  financeFieldId,
  updates,
) {
  const response = await axios.put(
    `https://api.hostaway.com/v1/financeField/${reservationId}/${financeFieldId}`,
    {
      ...updates,
      isOverriddenByUser: 1,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cache-control": "no-cache",
      },
    },
  );

  return response.data?.result || response.data;
}

function calculateReservationTotals(financeFields, coupon) {
  const normalizedFields = normalizeFinanceFields(financeFields);
  const subtotal = sumFinanceFieldTotals(normalizedFields);
  const couponDiscount = calculateCouponDiscount(coupon, subtotal);
  const total = roundAmount(subtotal - couponDiscount);

  return {
    financeFields: normalizedFields,
    subtotal,
    couponDiscount,
    total,
  };
}

function buildReservationFinanceFields(financeFields, fallbackTotal, feeBreakdown) {
  const normalizedFields = normalizeFinanceFields(financeFields);

  // Start with Hostaway's own finance fields if available, otherwise create base rate
  const fields = normalizedFields.length > 0
    ? [...normalizedFields]
    : [
        {
          type: "price",
          name: "baseRate",
          title: "Base rate",
          alias: null,
          quantity: null,
          value: roundAmount(fallbackTotal),
          total: roundAmount(fallbackTotal),
          isIncludedInTotalPrice: 1,
          isOverriddenByUser: 0,
          isQuantitySelectable: 0,
          isMandatory: null,
          isDeleted: 0,
        },
      ];

  // Append payment processing fees as separate finance field entries
  if (feeBreakdown && typeof feeBreakdown === "object") {
    const processingFee = roundAmount(feeBreakdown.processingFee || 0);
    const fixedFee = roundAmount(feeBreakdown.fixedFee || 0);
    const vat = roundAmount(feeBreakdown.vat || 0);

    if (processingFee > 0) {
      fields.push({
        type: "fee",
        name: "paymentProcessingFee",
        title: "Payment Processing Fee (2.9%)",
        alias: null,
        quantity: null,
        value: processingFee,
        total: processingFee,
        isIncludedInTotalPrice: 1,
        isOverriddenByUser: 1,
        isQuantitySelectable: 0,
        isMandatory: null,
        isDeleted: 0,
      });
    }

    if (fixedFee > 0) {
      fields.push({
        type: "fee",
        name: "flatProcessingFee",
        title: "Flat Processing Fee",
        alias: null,
        quantity: null,
        value: fixedFee,
        total: fixedFee,
        isIncludedInTotalPrice: 1,
        isOverriddenByUser: 1,
        isQuantitySelectable: 0,
        isMandatory: null,
        isDeleted: 0,
      });
    }

    if (vat > 0) {
      fields.push({
        type: "tax",
        name: "vatOnFees",
        title: "VAT on Fees (11%)",
        alias: null,
        quantity: null,
        value: vat,
        total: vat,
        isIncludedInTotalPrice: 1,
        isOverriddenByUser: 1,
        isQuantitySelectable: 0,
        isMandatory: null,
        isDeleted: 0,
      });
    }
  }

  return fields;
}

module.exports = {
  calculateCouponDiscount,
  calculateReservationTotals,
  buildReservationFinanceFields,
  getReservationFinanceFields,
  listCoupons,
  normalizeFinanceFields,
  resolveCouponContext,
  roundAmount,
  sumFinanceFieldTotals,
  updateReservationFinanceField,
};
