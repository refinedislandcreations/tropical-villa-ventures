# AUDIT_READONLY.md

## Purpose

This document defines the rules for performing a full system audit.

The AI Agent MUST:
- Read the entire codebase.
- Understand the architecture.
- Trace the complete user flow.
- Identify possible production issues.
- Generate a detailed audit report.

The AI Agent MUST NOT:
- Modify any files.
- Create pull requests.
- Apply fixes.
- Refactor code.
- Change configurations.
- Install dependencies.
- Rewrite logic.

The output must only be an audit report.

---

# Project Overview

Application:
Villa Booking Website

Technology Stack:
- Jekyll
- CloudCannon CMS
- Netlify Hosting
- Netlify Functions
- Hostaway API
- Xendit Payment API
- Netlify Blob Storage

---

# Audit Scope

The audit must cover:

1. Frontend
2. CMS
3. Backend Functions
4. External APIs
5. Database/storage
6. Payment flow
7. Booking flow
8. Security
9. Performance
10. Reliability
11. Error handling
12. Race conditions
13. Data consistency
14. Production failure scenarios


---

# Required Audit Process

## Phase 1: Architecture Understanding

Document:

- Application structure
- Data flow
- User journey
- External dependencies
- Authentication flow
- Payment flow
- Booking flow


---

# Phase 2: Complete Booking Flow Audit

Trace:

Guest searches villa
↓
Availability check
↓
Guest selects dates
↓
Booking form
↓
Create invoice request
↓
Xendit payment
↓
Payment callback/webhook
↓
Hostaway reservation creation
↓
Confirmation email/page


For every step analyze:

- Expected behavior
- Possible failures
- Current handling
- Production risks


---

# Phase 3: Frontend Audit

Analyze:

- User interactions
- Button states
- Loading handling
- Duplicate submissions
- Browser event timing
- API request handling
- Error messages
- Redirect logic

Report:

Example:

Issue:
Possible duplicate booking request

Severity:
Medium

Evidence:
Function allows multiple execution paths before request completion

Impact:
Duplicate payment attempt or confusing user experience

Recommendation:
Add request protection

(No code changes)


---

# Phase 4: Netlify Functions Audit

Analyze:

Every function:

Example:

create-invoice.js

Check:

- Input validation
- Error handling
- Race conditions
- Timeout handling
- Retry behaviour
- API failures
- Logging
- Security


---

# Phase 5: Booking Lock / Race Condition Audit

Analyze:

Current locking mechanism:

- How lock is created
- How ownership is verified
- How expiration works
- Storage consistency
- Concurrent requests
- False positives
- False negatives


Report:

Possible scenarios:

Scenario:
Two users booking same villa

Result:
Expected lock activation


Scenario:
Same user retrying booking

Result:
Potential false positive


Scenario:
Storage consistency delay

Result:
Possible incorrect lock ownership


---

# Phase 6: External API Audit


## Hostaway API

Analyze:

- Authentication
- Availability sync
- Reservation creation
- API failure scenarios
- Rate limits


## Xendit API

Analyze:

- Invoice creation
- Payment status
- Webhooks
- Duplicate payments
- Failed transactions


---

# Phase 7: Production Risk Report

Format:

| Issue | Severity | Probability | Impact |
|---|---|---|---|
| Duplicate booking request | High | Medium | Payment confusion |
| API timeout | Medium | Medium | Failed booking |
| Webhook delay | Medium | Low | Status mismatch |


---

# Phase 8: Recommendations

Recommendations only.

Do not implement.

Example:

Recommended:
Implement idempotency key for invoice creation.

Reason:
Prevent duplicate payment generation.

Priority:
High


---

# Final Audit Output

Generate:

1. Executive Summary
2. Architecture Diagram
3. Booking Flow Diagram
4. Findings
5. Risks
6. Root Cause Analysis
7. Recommended Improvements
8. Priority Ranking
9. Questions requiring developer confirmation


END OF AUDIT