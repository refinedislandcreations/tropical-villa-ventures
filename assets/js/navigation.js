// navigation.js - Optimized version

class NavigationManager {
  constructor() {
    this.mobileMenu = null;
    this.mobileButton = null;
    this.isMenuOpen = false;
    this.dropdownTimeouts = new Map();
    this.resizeObserver = null;
  }

  init() {
    this.initializeMobileMenu();
    this.initializeDesktopDropdowns();
    this.initializeMobileDropdowns();
    this.setupResizeHandler();
    this.setupKeyboardNavigation();
    this.setupFocusTrap();
  }

  initializeMobileMenu() {
    this.mobileButton = document.getElementById("mobile-menu-button");
    this.mobileMenu = document.getElementById("mobile-menu");

    if (!this.mobileButton || !this.mobileMenu) return;

    this.mobileButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleMobileMenu();
    });

    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (
        this.isMenuOpen &&
        !this.mobileMenu.contains(e.target) &&
        !this.mobileButton.contains(e.target)
      ) {
        this.toggleMobileMenu(false);
      }
    });

    // Close menu on escape key
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
      this.mobileMenu.classList.remove("translate-x-full");
      this.mobileMenu.classList.add("translate-x-0");
      this.mobileMenu.removeAttribute("hidden");
      this.mobileButton.setAttribute("aria-expanded", "true");

      // Animate hamburger to X
      middleLine.style.opacity = "0";
      topLine.style.transform = "translateY(10px) rotate(45deg)";
      bottomLine.style.transform = "translateY(-10px) rotate(-45deg)";

      // Prevent body scroll
      document.body.style.overflow = "hidden";
    } else {
      this.mobileMenu.classList.add("translate-x-full");
      this.mobileMenu.classList.remove("translate-x-0");
      this.mobileButton.setAttribute("aria-expanded", "false");

      // Restore hamburger
      middleLine.style.opacity = "1";
      topLine.style.transform = "translateY(0) rotate(0deg)";
      bottomLine.style.transform = "translateY(0) rotate(0deg)";

      // Re-enable body scroll
      document.body.style.overflow = "";

      // Hide menu after transition
      setTimeout(() => {
        if (!this.isMenuOpen) {
          this.mobileMenu.setAttribute("hidden", "");
        }
      }, 500);
    }
  }

  initializeDesktopDropdowns() {
    const dropdowns = document.querySelectorAll(".xl\\:flex [data-dropdown]");

    dropdowns.forEach((dropdown) => {
      const button = dropdown.querySelector("[data-dropdown-button]");
      const menu = dropdown.querySelector("[data-dropdown-menu]");

      if (!button || !menu) return;

      const handleMouseEnter = () => {
        this.clearDropdownTimeout(dropdown);
        this.toggleDropdown(menu, true);
        button.setAttribute("aria-expanded", "true");
      };

      const handleMouseLeave = () => {
        const timeout = setTimeout(() => {
          this.toggleDropdown(menu, false);
          button.setAttribute("aria-expanded", "false");
        }, 150);
        this.dropdownTimeouts.set(dropdown, timeout);
      };

      dropdown.addEventListener("mouseenter", handleMouseEnter);
      dropdown.addEventListener("mouseleave", handleMouseLeave);

      // Keyboard accessibility
      button.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const isExpanded = button.getAttribute("aria-expanded") === "true";
          this.toggleDropdown(menu, !isExpanded);
          button.setAttribute("aria-expanded", !isExpanded);
        } else if (
          e.key === "Escape" &&
          menu.classList.contains("opacity-100")
        ) {
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
      menu.classList.add("opacity-100", "visible", "scale-100");
      menu.classList.remove("opacity-0", "invisible", "scale-95");
    } else {
      menu.classList.remove("opacity-100", "visible", "scale-100");
      menu.classList.add("opacity-0", "invisible", "scale-95");
    }
  }

  clearDropdownTimeout(dropdown) {
    const timeout = this.dropdownTimeouts.get(dropdown);
    if (timeout) {
      clearTimeout(timeout);
      this.dropdownTimeouts.delete(dropdown);
    }
  }

  initializeMobileDropdowns() {
    const dropdowns = document.querySelectorAll("[data-mobile-dropdown]");

    dropdowns.forEach((dropdown) => {
      const summary = dropdown.querySelector("summary");
      const content = dropdown.querySelector(".dropdown-content");
      const icon = summary?.querySelector("svg");

      if (!summary || !content) return;

      summary.addEventListener("click", (e) => {
        e.preventDefault();
        const isOpen = dropdown.open;

        if (!isOpen) {
          // Close other dropdowns
          dropdowns.forEach((otherDropdown) => {
            if (otherDropdown !== dropdown && otherDropdown.open) {
              const otherContent =
                otherDropdown.querySelector(".dropdown-content");
              const otherIcon = otherDropdown.querySelector("summary svg");
              this.animateDropdownClose(otherDropdown, otherContent, otherIcon);
            }
          });

          // Open this dropdown
          this.animateDropdownOpen(dropdown, content, icon);
        } else {
          // Close this dropdown
          this.animateDropdownClose(dropdown, content, icon);
        }
      });

      // Close dropdown when clicking a link
      content.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
          if (this.isMenuOpen) {
            this.toggleMobileMenu(false);
          }
        });
      });
    });
  }

  animateDropdownOpen(dropdown, content, icon) {
    content.style.maxHeight = "0px";
    content.offsetHeight; // Force reflow

    dropdown.open = true;
    content.style.maxHeight = content.scrollHeight + "px";
    content.style.opacity = "1";

    if (icon) icon.classList.add("rotate-180");

    content.addEventListener(
      "transitionend",
      () => {
        if (dropdown.open) {
          content.style.maxHeight = "none";
        }
      },
      { once: true },
    );
  }

  animateDropdownClose(dropdown, content, icon) {
    if (content.style.maxHeight !== "none") {
      content.style.maxHeight = content.scrollHeight + "px";
      content.offsetHeight; // Force reflow
    }

    content.style.maxHeight = "0px";
    content.style.opacity = "0";

    const closeHandler = () => {
      dropdown.open = false;
      if (icon) icon.classList.remove("rotate-180");
      content.removeEventListener("transitionend", closeHandler);
    };

    content.addEventListener("transitionend", closeHandler, { once: true });
  }

  setupResizeHandler() {
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // Close mobile menu on resize to desktop
        if (window.innerWidth >= 1280 && this.isMenuOpen) {
          this.toggleMobileMenu(false);
        }
      }, 250);
    });
  }

  setupKeyboardNavigation() {
    // Handle keyboard navigation for dropdown items
    document.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        const activeElement = document.activeElement;
        const dropdownMenus = document.querySelectorAll(
          "[data-dropdown-menu].opacity-100",
        );

        dropdownMenus.forEach((menu) => {
          const focusableItems = menu.querySelectorAll("a, button");
          const firstItem = focusableItems[0];
          const lastItem = focusableItems[focusableItems.length - 1];

          if (activeElement === lastItem && !e.shiftKey) {
            e.preventDefault();
            firstItem?.focus();
          } else if (activeElement === firstItem && e.shiftKey) {
            e.preventDefault();
            lastItem?.focus();
          }
        });
      }
    });
  }

  setupFocusTrap() {
    // Trap focus in mobile menu when open
    this.mobileMenu?.addEventListener("keydown", (e) => {
      if (!this.isMenuOpen) return;

      const focusableElements = this.mobileMenu.querySelectorAll(
        'a, button, [tabindex]:not([tabindex="-1"])',
      );
      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];

      if (e.key === "Tab") {
        if (e.shiftKey && document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        } else if (!e.shiftKey && document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    const nav = new NavigationManager();
    nav.init();
  });
} else {
  const nav = new NavigationManager();
  nav.init();
}
