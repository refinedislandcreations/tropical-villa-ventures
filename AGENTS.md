# Production Incident: Booking Missing in Hostaway

## Context

A client reported that a guest successfully made a booking, but the reservation never appeared in Hostaway.

Client concern:

> "We had a booking from a friend and it did not go into Hostaway. It’s a bit scary if we have bookings that we don’t know of and the guest shows up."

This is a production-critical issue because bookings may be accepted and paid for without being synchronized to Hostaway.

---

# Tech Stack

* Frontend: Jekyll
* Hosting: Netlify
* Backend: Netlify Functions
* PMS: Hostaway API
* Payments: Xendit
* Database: Investigate and document usage
* Email/Notifications: Investigate and document usage

---

# Objective

Perform a complete audit of the booking pipeline and identify exactly how a booking can be successfully created or paid while failing to appear in Hostaway.

Do not assume the problem is in Hostaway.

Trace the entire flow end-to-end and prove the failure path with evidence.

---

# Phase 1: Project Discovery

Inspect the entire repository and document:

## Frontend

Locate:

* Booking forms
* Checkout pages
* Availability checks
* Booking confirmation pages

Identify:

* Form submission flow
* API calls
* Client-side validation
* Error handling

## Netlify Functions

Locate all functions related to:

* Booking creation
* Booking confirmation
* Availability
* Pricing
* Xendit integration
* Hostaway integration
* Webhooks

Create a map of:

* Function names
* Endpoints
* Dependencies
* Call chains

---

# Phase 2: Trace Booking Flow

Document the exact booking lifecycle:

1. User submits booking
2. Netlify Function receives request
3. Availability validation
4. Booking record creation
5. Xendit payment creation
6. Xendit webhook processing
7. Booking confirmation
8. Hostaway reservation creation
9. Guest confirmation

For every step identify:

* Source file
* Function name
* Inputs
* Outputs
* Failure scenarios

---

# Phase 3: Audit Xendit Integration

Determine:

## Booking Creation Timing

Does Hostaway sync happen:

* Before payment?
* After payment?
* On Xendit webhook?
* Via background processing?

## Webhook Reliability

Audit:

* Signature verification
* Retry handling
* Duplicate webhook handling
* Timeout handling
* Failure logging

Investigate whether:

* Payment succeeded
* Webhook failed
* Booking was never finalized

Look for race conditions between payment confirmation and Hostaway synchronization.

---

# Phase 4: Audit Hostaway Integration

Locate all Hostaway API calls.

For every API call identify:

* Endpoint used
* Payload structure
* Authentication method
* Error handling
* Retry logic

Verify:

## Critical Questions

* Can Hostaway API failures be ignored?
* Are API errors surfaced?
* Are failures logged?
* Are retries implemented?
* Are failed syncs recoverable?

Look specifically for:

```js
try {
  ...
} catch (e) {
  console.log(e);
}
```

or other patterns that swallow failures.

Investigate any logic that can cause a booking to be marked successful without Hostaway confirmation.

---

# Phase 5: Search for Missing Booking Scenarios

Identify every scenario where:

## Scenario A

Guest pays successfully through Xendit.

BUT

Hostaway booking is never created.

## Scenario B

Booking record exists internally.

BUT

Hostaway sync never runs.

## Scenario C

Hostaway API call fails.

BUT

System still reports success.

## Scenario D

Hostaway booking creation succeeds.

BUT

Internal state is inconsistent.

---

# Phase 6: Reliability Review

Determine whether the current architecture guarantees:

## Required Guarantees

### Guarantee 1

Every successful payment eventually creates a Hostaway reservation.

### Guarantee 2

Temporary Hostaway failures trigger retries.

### Guarantee 3

Failed synchronizations remain visible.

### Guarantee 4

No booking can be silently lost.

### Guarantee 5

Duplicate webhook events cannot create duplicate reservations.

If any guarantee is missing, document it.

---

# Phase 7: Fix Root Cause

If issues are found:

1. Explain root cause.
2. Show affected files.
3. Implement fix.
4. Add structured logging.
5. Add retry handling.
6. Add monitoring hooks.
7. Add automated tests.

---

# Phase 8: Hardening Recommendations

Review whether the architecture should be improved.

Potential improvements:

* Booking state machine
* Persistent booking records before payment
* Retry queue for Hostaway sync
* Dead-letter handling
* Failed-sync dashboard
* Reconciliation job comparing internal bookings vs Hostaway reservations
* Alerting when synchronization fails

---

# Deliverables

Provide:

## Booking Architecture

End-to-end flow diagram.

## Root Cause Analysis

Evidence-backed explanation.

## Code Changes

Files changed and rationale.

## Test Results

Coverage added.

## Remaining Risks

Any unresolved concerns.

---

# Important

Do not stop after finding the first bug.

Continue auditing the entire booking, payment, webhook, and Hostaway synchronization pipeline.

Assume there may be multiple independent failure points.
