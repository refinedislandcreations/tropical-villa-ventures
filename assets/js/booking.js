// assets/js/booking.js
// Booking Manager Class
class VillaBookingManager {
  constructor(listingId, maxGuests) {
    this.listingId = listingId;
    this.maxGuests = maxGuests;
    this.checkinDate = null;
    this.checkoutDate = null;
    this.guests = 1;
    this.villaName = null;
    this.priceBreakdown = null;
    this.couponCode = null;
    this.isLoading = false;

    this.init();
  }

  init() {
    this.loadStoredBookingData();
    this.initGuestSelect();
    this.initCouponHandler();
  }

  loadStoredBookingData() {
    const bookingData = JSON.parse(localStorage.getItem("bookingData"));
    if (bookingData) {
      this.checkinDate = bookingData.checkin;
      this.checkoutDate = bookingData.checkout;
      this.guests = bookingData.guests;
      this.listingId = bookingData.listingId;
      this.villaName = bookingData.villaName || "Villa";

      const checkinInput = document.getElementById("checkin");
      const checkoutInput = document.getElementById("checkout");
      const guestsSelect = document.getElementById("guests");

      if (checkinInput && this.checkinDate) {
        checkinInput.value = this.formatDisplayDate(this.checkinDate);
      }
      if (checkoutInput && this.checkoutDate) {
        checkoutInput.value = this.formatDisplayDate(this.checkoutDate);
        checkoutInput.classList.remove("opacity-50");
      }
      if (guestsSelect && this.guests) {
        guestsSelect.value = this.guests;
      }

      this.calculatePrice();
    }
  }

  formatDisplayDate(dateStr) {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  initGuestSelect() {
    const guestSelect = document.getElementById("guests");
    if (guestSelect) {
      guestSelect.addEventListener("change", (e) => {
        this.guests = parseInt(e.target.value);

        // Update localStorage with new guest count
        const bookingData = JSON.parse(localStorage.getItem("bookingData"));
        if (bookingData) {
          bookingData.guests = this.guests;
          localStorage.setItem("bookingData", JSON.stringify(bookingData));
        }

        if (this.checkinDate && this.checkoutDate) {
          this.calculatePrice();
        }
      });
    }
  }

  initCouponHandler() {
    const applyBtn = document.getElementById("applyCouponBtn");
    const couponInput = document.getElementById("couponInput");
    if (applyBtn && couponInput) {
      applyBtn.addEventListener("click", async () => {
        const code = couponInput.value.trim().toUpperCase();
        if (code) {
          this.couponCode = code;
          await this.calculatePrice();
          const message = document.getElementById("couponMessage");
          if (message) {
            message.innerText = "Coupon applied!";
            message.className = "text-xs text-green-200";
            setTimeout(() => {
              message.innerText = "";
            }, 3000);
          }
        }
      });
    }
  }

  async calculatePrice() {
    if (!this.checkinDate || !this.checkoutDate) return;

    // Show subtle loading in price area only (not the full-screen overlay)
    const breakdownEl = document.getElementById("priceBreakdown");
    if (breakdownEl) {
      breakdownEl.innerHTML = `<div class="text-sm text-white/60">Calculating price...</div>`;
    }
    const totalEl = document.getElementById("totalPrice");
    if (totalEl) {
      totalEl.innerText = "...";
    }

    try {
      const response = await fetch("/.netlify/functions/calculate-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: this.listingId,
          startingDate: this.checkinDate,
          endingDate: this.checkoutDate,
          numberOfGuests: this.guests,
          couponCode: this.couponCode,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Price calculation failed");
      }
      this.priceBreakdown = data;
      this.updatePriceDisplay(data);
    } catch (error) {
      console.error("Price calculation error:", error);
      if (breakdownEl) {
        breakdownEl.innerHTML = `<div class="text-sm text-red-400">Unable to load price or invalid coupon.</div>`;
      }
      if (totalEl) totalEl.innerText = "Error";
      throw error;
    }
  }

  updatePriceDisplay(data) {
    const totalElement = document.getElementById("totalPrice");
    const breakdownElement = document.getElementById("priceBreakdown");
    const feeElement = document.getElementById("feeBreakdown");

    const totalPrice = data.totalPrice;
    const basePrice = data.basePrice || totalPrice;
    const nights = data.nights || 1;
    const pricePerNight = data.pricePerNight || Math.round(basePrice / nights);

    const formatIDR = (num) =>
      `IDR ${Math.round(num).toLocaleString("id-ID", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}`;

    if (totalElement) {
      totalElement.innerText = formatIDR(totalPrice);
    }

    if (breakdownElement && data.breakdown) {
      breakdownElement.innerHTML = `
        <div class="space-y-2 text-sm pt-1">
          <div class="flex justify-between">
            <span>${formatIDR(pricePerNight)} x ${nights} night${nights > 1 ? "s" : ""}</span>
            <span>${formatIDR(pricePerNight * nights)}</span>
          </div>

          ${
            data.breakdown.discounts > 0
              ? `
            <div class="flex justify-between text-white font-medium">
              <span>Discount</span>
              <span>-${formatIDR(data.breakdown.discounts)}</span>
            </div>
          `
              : ""
          }
        </div>
      `;
    }

    if (feeElement && data.fees) {
      feeElement.innerHTML = `
        <div class="space-y-1 text-sm pt-1">
          <div class="flex justify-between">
            <span>Payment Processing Fee (2.9%)</span>
            <span>${formatIDR(data.fees.processingFee)}</span>
          </div>
          <div class="flex justify-between">
            <span>Flat Fee</span>
            <span>${formatIDR(data.fees.fixedFee)}</span>
          </div>
          <div class="flex justify-between">
            <span>VAT (11%)</span>
            <span>${formatIDR(data.fees.vat)}</span>
          </div>
          <div class="flex justify-between border-t border-white/20 pt-1 mt-1 font-medium">
            <span>Fee Subtotal</span>
            <span>${formatIDR(data.fees.totalFee)}</span>
          </div>
        </div>
      `;
    }
  }

  getFormData() {
    return {
      fullName: document.getElementById("fullName")?.value || "",
      email: document.getElementById("email")?.value || "",
      phone: document.getElementById("phone")?.value || "",
      address: document.getElementById("address")?.value || "",
      city: document.getElementById("city")?.value || "",
      specialRequests: document.getElementById("specialRequests")?.value || "",
    };
  }

  validateForm() {
    const formData = this.getFormData();
    let isValid = true;
    let firstError = null;

    const fields = [
      { id: "fullName", name: "full name", type: "text" },
      { id: "email", name: "email address", type: "email" },
      { id: "phone", name: "phone number", type: "tel" }
    ];

    fields.forEach(field => {
      const el = document.getElementById(field.id);
      if (!el) return;

      const val = formData[field.id].trim();
      let hasError = false;

      if (!val) {
        hasError = true;
        if (!firstError) firstError = `Please enter your ${field.name}.`;
      } else if (field.type === "email") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(val)) {
          hasError = true;
          if (!firstError) firstError = "Please enter a valid email address.";
        }
      }

      if (hasError) {
        isValid = false;
        // Highlight field with red border
        el.classList.add("border-red-500", "text-red-500");
        el.classList.remove("border-[#231F20]/40");
        
        // Remove error style when user starts typing again
        el.addEventListener("input", function removeError() {
          el.classList.remove("border-red-500", "text-red-500");
          el.classList.add("border-[#231F20]/40");
          el.removeEventListener("input", removeError);
        });
      }
    });

    if (!isValid) {
      this.showError(firstError);
    }
    return isValid;
  }

  async createBooking() {
    if (!this.validateForm()) {
      return false;
    }

    const formData = this.getFormData();

    if (!this.checkinDate || !this.checkoutDate || !this.priceBreakdown) {
      this.showError("Please select check-in and check-out dates first.");
      return false;
    }

    this.setLoading(true);

    try {
      const nameParts = formData.fullName.trim().split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";
      const startDate = new Date(this.checkinDate);
      const endDate = new Date(this.checkoutDate);
      const nights = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      // Get villa name from localStorage (reliable across all pages)
      const bookingData = JSON.parse(localStorage.getItem("bookingData"));
      const villaName = bookingData?.villaName || this.villaName || "Villa";

      // IMPORTANT: Send basePrice (room cost only), NOT totalPrice (which includes fees).
      // create-invoice.js is the single source of truth for fee calculation.
      // Sending totalPrice here would cause fees to be applied twice (double-charge bug).
      const basePrice = this.priceBreakdown.basePrice;
      const expectedTotal = this.priceBreakdown.totalPrice;

      if (!basePrice || basePrice <= 0) {
        this.showError("Price calculation error. Please refresh and try again.");
        return false;
      }

      // Safeguard: validate that fee math is consistent before proceeding
      if (this.priceBreakdown.fees) {
        const recalcTotal = basePrice + this.priceBreakdown.fees.totalFee;
        const tolerance = 2; // allow IDR 2 rounding tolerance
        if (Math.abs(recalcTotal - expectedTotal) > tolerance) {
          console.error(`[BOOKING] Price mismatch! basePrice=${basePrice}, fees=${this.priceBreakdown.fees.totalFee}, expected=${expectedTotal}, recalc=${recalcTotal}`);
          this.showError("Price validation error. Please refresh and try again.");
          return false;
        }
      }

      const bookingPayload = {
        listingId: this.listingId,
        villaName: villaName,
        checkin: this.checkinDate,
        checkout: this.checkoutDate,
        guests: this.guests,
        nights: nights,
        totalAmount: basePrice,  // Room cost ONLY — fees added by create-invoice.js
        expectedTotal: expectedTotal,  // For backend validation
        firstName: firstName,
        lastName: lastName,
        email: formData.email,
        phone: formData.phone,
        address: formData.address || "",
        city: formData.city || "",
        specialRequests: formData.specialRequests || "",
        couponCode: this.couponCode || null,
      };

      // Create invoice — this also stores temp booking data via Blobs
      const response = await fetch("/.netlify/functions/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingPayload),
      });

      const result = await response.json();

      if (result.invoiceUrl) {
        // Redirect to Xendit payment page
        window.location.href = result.invoiceUrl;
        return true;
      } else {
        throw new Error(result.error || "Payment initialization failed");
      }
    } catch (error) {
      console.error("Booking creation error:", error);
      this.showError("Unable to create booking. Please try again.");
      return false;
    } finally {
      this.setLoading(false);
    }
  }

  async applyCoupon() {
    const couponInput = document.getElementById("couponInput");
    if (!couponInput) return;

    const code = couponInput.value.trim().toUpperCase();
    if (!code) return;

    this.couponCode = code;
    try {
      await this.calculatePrice();

      const message = document.getElementById("couponMessage");
      if (message) {
        message.innerText = "Coupon applied!";
        message.className = "text-xs text-green-200 mt-1";
        setTimeout(() => {
          message.innerText = "";
        }, 3000);
      }
    } catch (e) {
      this.couponCode = null;
      try { await this.calculatePrice(); } catch(err) {} // recalculate without coupon
      
      const message = document.getElementById("couponMessage");
      if (message) {
        message.innerText = "Coupon not found or invalid";
        message.className = "text-xs text-red-400 mt-1";
        setTimeout(() => {
          message.innerText = "";
        }, 3000);
      }
    }
  }

  setLoading(loading) {
    this.isLoading = loading;
    const loader = document.getElementById("bookingLoader");
    if (loader) {
      // Use inline style to guarantee visibility control — avoids CSS specificity issues
      loader.style.display = loading ? "flex" : "none";
    }
  }

  showError(message) {
    const errorContainer = document.getElementById("bookingError");
    if (errorContainer) {
      errorContainer.innerText = message;
      errorContainer.classList.remove("hidden");
      setTimeout(() => {
        errorContainer.classList.add("hidden");
      }, 5000);
    } else {
      alert(message);
    }
  }
}

// Initialize booking manager
document.addEventListener("DOMContentLoaded", () => {
  const listingIdElement = document.getElementById("listingId");
  if (listingIdElement && listingIdElement.value) {
    window.bookingManager = new VillaBookingManager(listingIdElement.value, 10);
  }
});

window.getFormData = function () {
  return window.bookingManager?.getFormData() || {};
};
window.createBooking = function () {
  return window.bookingManager?.createBooking();
};
