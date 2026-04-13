// navigation.js

class NavigationManager {
  constructor() {
    this.mobileMenu = null;
    this.mobileButton = null;
    this.mobileBackdrop = null;
    this.isMenuOpen = false;
    this.dropdownTimeouts = new Map();
    this.header = null;
    this.scrollTimer = null;
    this.lastScrollY = 0;
  }

  init() {
    this.initializeMobileMenu();
    this.initializeDesktopDropdowns();
    this.initializeMobileDropdowns();
    this.setupResizeHandler();
    this.setupKeyboardNavigation();
    this.setupFocusTrap();
    this.initializeScrollBackground();
    this.initializeSmoothScrollBehavior();
  }

  // =========================
  // MOBILE MENU
  // =========================
  initializeMobileMenu() {
    this.mobileButton = document.getElementById("mobile-menu-button");
    this.mobileMenu = document.getElementById("mobile-menu");
    this.mobileBackdrop = document.getElementById("mobile-menu-backdrop");

    if (!this.mobileButton || !this.mobileMenu || !this.mobileBackdrop) return;

    // Toggle menu on hamburger click
    this.mobileButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleMobileMenu();
    });

    // Close menu with backdrop click
    this.mobileBackdrop.addEventListener("click", () => {
      if (this.isMenuOpen) {
        this.toggleMobileMenu(false);
      }
    });

    // Close menu with Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isMenuOpen) {
        this.toggleMobileMenu(false);
      }
    });
  }

  toggleMobileMenu(isOpen = !this.isMenuOpen) {
    this.isMenuOpen = isOpen;

    const topLine = this.mobileButton.querySelector(".top");
    const middleLine = this.mobileButton.querySelector(".middle");
    const bottomLine = this.mobileButton.querySelector(".bottom");

    if (this.isMenuOpen) {
      // Show elements first
      this.mobileMenu.style.display = "flex";
      this.mobileBackdrop.style.display = "block";

      // Trigger reflow for smooth animation
      this.mobileMenu.offsetHeight;

      // Animate menu in
      this.mobileMenu.classList.remove("translate-x-full");
      this.mobileMenu.classList.add("translate-x-0");

      // Animate backdrop in
      this.mobileBackdrop.classList.remove("opacity-0", "pointer-events-none");
      this.mobileBackdrop.classList.add("opacity-100");
      this.mobileBackdrop.style.pointerEvents = "auto";

      // Animate hamburger to X
      middleLine.style.opacity = "0";
      middleLine.style.transform = "scaleX(0)";
      topLine.style.transform = "translateY(10px) rotate(45deg)";
      bottomLine.style.transform = "translateY(-10px) rotate(-45deg)";

      this.mobileButton.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
    } else {
      // Animate menu out
      this.mobileMenu.classList.add("translate-x-full");
      this.mobileMenu.classList.remove("translate-x-0");

      // Animate backdrop out
      this.mobileBackdrop.classList.add("opacity-0", "pointer-events-none");
      this.mobileBackdrop.classList.remove("opacity-100");
      this.mobileBackdrop.style.pointerEvents = "none";

      // Animate X back to hamburger
      middleLine.style.opacity = "1";
      middleLine.style.transform = "scaleX(1)";
      topLine.style.transform = "translateY(0) rotate(0deg)";
      bottomLine.style.transform = "translateY(0) rotate(0deg)";

      this.mobileButton.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";

      // Hide elements after animation completes
      setTimeout(() => {
        if (!this.isMenuOpen) {
          this.mobileMenu.style.display = "none";
          this.mobileBackdrop.style.display = "none";
        }
      }, 400);
    }
  }

  // =========================
  // DESKTOP DROPDOWNS
  // =========================
  initializeDesktopDropdowns() {
    const dropdowns = document.querySelectorAll("[data-dropdown]");

    dropdowns.forEach((dropdown) => {
      const button = dropdown.querySelector("[data-dropdown-button]");
      const menu = dropdown.querySelector("[data-dropdown-menu]");

      if (!button || !menu) return;

      const handleEnter = () => {
        this.clearDropdownTimeout(dropdown);
        this.toggleDropdown(menu, true);
        button.setAttribute("aria-expanded", "true");
      };

      const handleLeave = () => {
        const timeout = setTimeout(() => {
          this.toggleDropdown(menu, false);
          button.setAttribute("aria-expanded", "false");
        }, 150);

        this.dropdownTimeouts.set(dropdown, timeout);
      };

      dropdown.addEventListener("mouseenter", handleEnter);
      dropdown.addEventListener("mouseleave", handleLeave);

      button.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const isOpen = button.getAttribute("aria-expanded") === "true";
          this.toggleDropdown(menu, !isOpen);
          button.setAttribute("aria-expanded", !isOpen);
        }

        if (e.key === "Escape") {
          this.toggleDropdown(menu, false);
          button.setAttribute("aria-expanded", "false");
          button.focus();
        }
      });
    });
  }

  toggleDropdown(menu, isOpen) {
    if (!menu) return;

    if (isOpen) {
      menu.classList.add("opacity-100", "visible");
      menu.classList.remove("opacity-0", "invisible");
      menu.style.transform = "translateY(0)";
    } else {
      menu.classList.remove("opacity-100", "visible");
      menu.classList.add("opacity-0", "invisible");
      menu.style.transform = "translateY(-8px)";
    }
  }

  clearDropdownTimeout(dropdown) {
    const timeout = this.dropdownTimeouts.get(dropdown);
    if (timeout) {
      clearTimeout(timeout);
      this.dropdownTimeouts.delete(dropdown);
    }
  }

  // =========================
  // MOBILE DROPDOWNS
  // =========================
  initializeMobileDropdowns() {
    const dropdowns = document.querySelectorAll("[data-mobile-dropdown]");

    dropdowns.forEach((dropdown) => {
      const summary = dropdown.querySelector("summary");
      const content = dropdown.querySelector(".dropdown-content");
      const icon = summary?.querySelector("svg");

      if (!summary || !content) return;

      summary.addEventListener("click", (e) => {
        e.preventDefault();

        if (!dropdown.open) {
          this.animateDropdownOpen(dropdown, content, icon);
        } else {
          this.animateDropdownClose(dropdown, content, icon);
        }
      });
    });
  }

  animateDropdownOpen(dropdown, content, icon) {
    content.style.maxHeight = "0px";
    content.offsetHeight;

    dropdown.open = true;
    content.style.maxHeight = content.scrollHeight + "px";
    content.style.opacity = "1";

    if (icon) {
      icon.style.transform = "rotate(180deg)";
    }
  }

  animateDropdownClose(dropdown, content, icon) {
    content.style.maxHeight = content.scrollHeight + "px";
    content.offsetHeight;

    content.style.maxHeight = "0px";
    content.style.opacity = "0";

    const closeHandler = () => {
      dropdown.open = false;
      if (icon) {
        icon.style.transform = "rotate(0deg)";
      }
      content.removeEventListener("transitionend", closeHandler);
    };

    content.addEventListener("transitionend", closeHandler, {
      once: true,
    });
  }

  // =========================
  // SCROLL BACKGROUND
  // =========================
  initializeScrollBackground() {
    this.header = document.getElementById("site-header");
    if (!this.header) return;

    // Throttled scroll handler
    window.addEventListener("scroll", () => {
      if (this.scrollTimer) return;

      this.scrollTimer = setTimeout(() => {
        const scrolled = window.scrollY;
        this.updateHeaderBackground(scrolled);
        this.scrollTimer = null;
      }, 8);
    });
  }

  updateHeaderBackground(scrollY) {
    const scrolled = scrollY > 50;
    const threshold = 50;
    const opacity = Math.min(scrollY / threshold, 1);

    if (scrolled) {
      if (!this.header.classList.contains("scrolled")) {
        this.header.classList.add("scrolled");
        this.header.style.backdropFilter = `blur(${opacity * 1}px)`;
        this.header.style.backgroundColor = `rgba(175, 67, 29, ${0.85 + opacity * 0.1})`;
      }
    } else {
      if (this.header.classList.contains("scrolled")) {
        this.header.classList.remove("scrolled");
        this.header.style.backdropFilter = "blur(0px)";
        this.header.style.backgroundColor = "transparent";
      }
    }
  }

  // =========================
  // SMOOTH SCROLL BEHAVIOR
  // =========================
  initializeSmoothScrollBehavior() {
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", function (e) {
        const target = document.querySelector(this.getAttribute("href"));
        if (target) {
          e.preventDefault();
          const headerOffset = 90;
          const elementPosition = target.getBoundingClientRect().top;
          const offsetPosition =
            elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: "smooth",
          });
        }
      });
    });
  }

  // =========================
  // RESIZE HANDLER
  // =========================
  setupResizeHandler() {
    let timer;

    window.addEventListener("resize", () => {
      clearTimeout(timer);

      timer = setTimeout(() => {
        if (window.innerWidth >= 1280 && this.isMenuOpen) {
          this.toggleMobileMenu(false);
        }
      }, 200);
    });
  }

  // =========================
  // KEYBOARD NAVIGATION
  // =========================
  setupKeyboardNavigation() {
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;

      const active = document.activeElement;
      const menus = document.querySelectorAll(
        "[data-dropdown-menu].opacity-100",
      );

      menus.forEach((menu) => {
        const items = menu.querySelectorAll("a, button");
        const first = items[0];
        const last = items[items.length - 1];

        if (active === last && !e.shiftKey) {
          e.preventDefault();
          first?.focus();
        } else if (active === first && e.shiftKey) {
          e.preventDefault();
          last?.focus();
        }
      });
    });
  }

  // =========================
  // FOCUS TRAP (MOBILE)
  // =========================
  setupFocusTrap() {
    this.mobileMenu?.addEventListener("keydown", (e) => {
      if (!this.isMenuOpen || e.key !== "Tab") return;

      const items = this.mobileMenu.querySelectorAll(
        'a, button, [tabindex]:not([tabindex="-1"])',
      );

      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    });
  }
}

// =========================
// INIT
// =========================
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new NavigationManager().init();
  });
} else {
  new NavigationManager().init();
}
