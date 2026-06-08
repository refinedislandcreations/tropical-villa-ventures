# UPDATE.md

## Objective

Implement Meta Pixel tracking for the TVV website and investigate a Hostaway pricing discrepancy where the direct booking website is displaying the base price instead of the expected website-adjusted price.

---

# CLIENT REQUEST

Meta Pixel ID:

1551563185525446

Dataset:

TVV Website dataset

Client requirements:

1. Add Meta Pixel base code to all pages.
2. Fire ViewContent on villa/property pages.
3. Fire book_now when Book Now is clicked.
4. Fire Purchase or booking_confirmed on successful booking confirmation page.
5. Investigate pricing issue with Hostaway direct booking pricing.

---

# TASK 1: META PIXEL IMPLEMENTATION

## Pixel ID

1551563185525446

## IMPORTANT IMPLEMENTATION REQUIREMENT

Do NOT blindly implement generic examples.

Before writing any code:

1. Inspect the existing codebase.
2. Understand:
   - Current architecture
   - Existing analytics implementation
   - Existing tracking events
   - Villa/property data models
   - Booking flow
   - Reservation flow
   - Checkout flow
   - Payment flow

3. Reuse existing tracking hooks whenever possible.
4. Reuse existing identifiers and data structures.
5. Follow current project conventions.
6. Avoid introducing duplicate event logic.
7. Avoid duplicate event firing.

The goal is to achieve the requested Meta tracking behavior while fitting naturally into the existing application architecture.

---

## REQUIRED TRACKING OBJECTIVES

### PageView

Fire when any page loads.

Purpose:

- Track all website visits.

Implementation details should follow existing project patterns.

---

### ViewContent

Fire when a visitor views a villa/property detail page.

Purpose:

- Track property interest.
- Enable Meta retargeting and optimization.

Use property information already available in the application.

Possible fields may include:

- property id
- villa id
- listing id
- slug
- title
- displayed price

Use actual project fields, not assumptions.

---

### book_now

Fire when a visitor initiates a booking by clicking a booking CTA.

Purpose:

- Track booking intent.

Use whichever booking trigger currently exists in the codebase.

Examples:

- Book Now button
- Reserve button
- Start booking flow
- Continue checkout action

Reuse existing event handlers where possible.

---

### Purchase / booking_confirmed

Fire after a successful booking is completed.

Purpose:

- Track actual conversions.

Trigger only after successful booking confirmation.

Potential data may include:

- reservation id
- booking id
- order id
- transaction id
- total amount
- currency
- guest count
- stay dates

Use actual available project data.

Do not invent fields.

---

# TASK 2: ANALYZE CURRENT EVENT FLOW

Before implementation, document:

## Existing Analytics

Identify:

- Existing analytics providers
- Existing event tracking
- Existing conversion tracking

Examples:

- Google Analytics
- GTM
- Segment
- PostHog
- Custom tracking

---

## Existing Booking Flow

Document:

- Property page
- Availability check
- Booking initiation
- Checkout
- Payment
- Booking confirmation

Map where Meta events should be attached.

---

## Existing Data Availability

Document which fields are available at:

### Property View

Available data:

- TBD after inspection

### Booking Initiation

Available data:

- TBD after inspection

### Booking Confirmation

Available data:

- TBD after inspection

---

## Meta Event Mapping

Before implementation create a mapping table:

| Meta Event  | Existing Trigger | Available Data |
| ----------- | ---------------- | -------------- |
| PageView    | TBD              | TBD            |
| ViewContent | TBD              | TBD            |
| book_now    | TBD              | TBD            |
| Purchase    | TBD              | TBD            |

---

# TASK 3: VERIFY META PIXEL IMPLEMENTATION

After implementation:

Verify:

- PageView fires correctly.
- ViewContent fires correctly.
- book_now fires correctly.
- Purchase (or booking_confirmed) fires correctly.

Validation methods:

- Meta Pixel Helper
- Browser DevTools
- Meta Events Manager
- Network inspection

Document findings.

---

# TASK 4: INVESTIGATE HOSTAWAY PRICING ISSUE

## Reported Problem

Hostaway contains:

- Base Price
- Channel-specific pricing adjustments

Client expectation:

Website Price = Base Price - 10%

Current behavior:

Website Price = Base Price

The website appears to ignore the website-specific pricing adjustment.

---

# TASK 5: REVIEW HOSTAWAY DOCUMENTATION

Documentation:

https://api.hostaway.com/documentation

Review the documentation before making implementation assumptions.

Focus specifically on:

- Listing pricing
- Reservation pricing
- Booking engine pricing
- Channel pricing
- Financial fields
- Price calculation endpoints

---

# TASK 6: VERIFY HOSTAWAY CONFIGURATION

Investigate whether the direct booking website is configured correctly.

Verify:

- Website channel exists
- Website channel pricing rules exist
- Website channel adjustments exist
- Dynamic pricing settings
- Discounts
- Markups
- Overrides

Confirm whether the intended rule is:

Website Price = Base Price - 10%

Document findings.

---

# TASK 7: INSPECT HOSTAWAY API RESPONSES

Review actual API responses.

Identify pricing-related fields returned by Hostaway.

Examples may include:

- baseRate
- totalPrice
- totalPriceFromChannel
- adjustedPrice
- nightlyRate
- markup
- discount
- channelAdjustment

Do not assume field names.

Use actual API responses.

Document all relevant pricing fields.

---

# TASK 8: TRACE PRICE FLOW

Trace pricing through the full system.

Map:

Hostaway
↓
Hostaway API
↓
Backend
↓
Transformation Layer
↓
Frontend
↓
Website Display

Determine:

1. Which pricing field enters the application.
2. Which pricing field is stored.
3. Which pricing field is rendered.
4. Whether adjustments are applied.
5. Whether adjustments are ignored.

Document the complete flow.

---

# TASK 9: COMPARE EXPECTED VS ACTUAL PRICING

Use at least one real property.

For each property document:

- Base Price
- Website Adjustment
- API Response Values
- Backend Values
- Frontend Values
- Displayed Price

Example format:

Base Price: $100

Website Adjustment: -10%

Expected Website Price: $90

Actual Website Price: TBD

---

# TASK 10: IDENTIFY ROOT CAUSE

Determine whether the issue is:

## A. Hostaway Configuration

Examples:

- Website adjustment missing
- Channel setup incorrect
- Pricing rule disabled

## B. API Integration

Examples:

- Wrong field consumed
- Adjusted price ignored
- Incorrect endpoint used

## C. Application Logic

Examples:

- Base price rendered directly
- Discount calculation skipped
- Channel pricing never applied

Document exact root cause.

---

# TASK 11: DELIVERABLES

Provide a final report containing:

## Meta Pixel

- Implementation locations
- Event mapping
- Payload structure used
- Validation results
- Screenshots if available

## Hostaway Investigation

- Documentation sections reviewed
- Endpoints reviewed
- API response findings
- Pricing flow diagram
- Root cause analysis

## Final Recommendation

Clearly state:

1. Why the website displays the wrong price.
2. Whether the issue belongs in Hostaway or application code.
3. Exact fix required.
4. Files changed.
5. Risks or follow-up work.

---

# SUCCESS CRITERIA

The task is complete when:

- Meta Pixel is installed.
- PageView tracking works.
- ViewContent tracking works.
- book_now tracking works.
- Purchase/booking_confirmed tracking works.
- Hostaway pricing behavior is fully understood.
- Root cause is documented.
- Recommended fix is provided.
- Any applicable fixes are implemented and verified.
