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

    const totalPrice = data.totalPrice;
    const nights = data.nights || 1;
    const pricePerNight = data.pricePerNight || Math.round(totalPrice / nights);

    if (totalElement) {
      totalElement.innerText = `IDR ${totalPrice.toLocaleString("id-ID")}`;
    }

    if (breakdownElement && data.breakdown) {
      breakdownElement.innerHTML = `
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span>IDR ${pricePerNight.toLocaleString("id-ID")} x ${nights} night${nights > 1 ? "s" : ""}</span>
            <span>IDR ${data.breakdown.baseRate.toLocaleString("id-ID")}</span>
          </div>
          ${
            data.breakdown.cleaningFee > 0
              ? `
            <div class="flex justify-between">
              <span>Cleaning fee</span>
              <span>IDR ${data.breakdown.cleaningFee.toLocaleString("id-ID")}</span>
            </div>
          `
              : ""
          }
          ${
            data.breakdown.taxes > 0
              ? `
            <div class="flex justify-between">
              <span>Taxes & fees</span>
              <span>IDR ${data.breakdown.taxes.toLocaleString("id-ID")}</span>
            </div>
          `
              : ""
          }
          ${
            data.breakdown.discounts > 0
              ? `
            <div class="flex justify-between text-green-300">
              <span>Discount</span>
              <span>-IDR ${data.breakdown.discounts.toLocaleString("id-ID")}</span>
            </div>
          `
              : ""
          }
          <hr class="my-2 border-white/30">
          <div class="flex justify-between font-bold">
            <span>Total</span>
            <span>IDR ${totalPrice.toLocaleString("id-ID")}</span>
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

  async createBooking() {
    const formData = this.getFormData();

    if (!formData.fullName || !formData.email || !formData.phone) {
      this.showError("Please fill in all required fields");
      return false;
    }

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

      const bookingPayload = {
        listingId: this.listingId,
        villaName: villaName,
        checkin: this.checkinDate,
        checkout: this.checkoutDate,
        guests: this.guests,
        nights: nights,
        totalAmount: this.priceBreakdown.totalPrice,
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
