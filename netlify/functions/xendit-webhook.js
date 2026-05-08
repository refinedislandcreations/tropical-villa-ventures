// netlify/functions/xendit-webhook.js
//
// Production webhook handler for Xendit payment callbacks.
//
// Security:
//   - Verifies x-callback-token header against XENDIT_CALLBACK_TOKEN env var
//   - Rejects unauthenticated requests with 401
//
// Error handling:
//   - Returns 500 on processing failures (enables Xendit retry)
//   - Returns 200 only on successful processing or safe acknowledgements
//   - Returns 400 on malformed request body
//   - Returns 401 on invalid/missing callback token
//
// Idempotency:
//   - Handled inside webhook-helpers.js (isAlreadyProcessed / markAsProcessed)
//   - Duplicate PAID webhooks return 200 safely
//
// Status routing:
//   - PAID     → handlePaid() — creates reservation (throws on failure → 500)
//   - SETTLED  → handleSettled() — acknowledge only (reservation already created on PAID)
//   - PENDING  → handlePending() — acknowledge, no action
//   - EXPIRED  → handleExpired() — cleanup temp booking

const {
  handlePaid,
  handleSettled,
  handlePending,
  handleExpired,
  handleUnknownStatus,
} = require("./webhook-helpers");

// ─── Callback Token Verification ─────────────────────────────────────────────

/**
 * Verify the Xendit callback token from the request headers.
 * Xendit sends this as `x-callback-token` in every webhook request.
 *
 * @param {object} headers - event.headers (Netlify lowercases all header keys)
 * @returns {{ valid: boolean, reason?: string }}
 */
function verifyCallbackToken(headers) {
  const expectedToken = process.env.XENDIT_CALLBACK_TOKEN;

  // If no token is configured, skip verification (dev mode safety)
  if (!expectedToken) {
    console.warn(`[SECURITY] XENDIT_CALLBACK_TOKEN not configured — skipping verification`);
    return { valid: true };
  }

  // Netlify normalizes all header keys to lowercase
  const receivedToken = (headers || {})["x-callback-token"];

  if (!receivedToken) {
    console.error(`[SECURITY] Missing x-callback-token header`);
    return { valid: false, reason: "Missing callback token" };
  }

  // Constant-time comparison to prevent timing attacks
  if (receivedToken.length !== expectedToken.length) {
    console.error(`[SECURITY] Invalid callback token (length mismatch)`);
    return { valid: false, reason: "Invalid callback token" };
  }

  // Node.js crypto.timingSafeEqual requires Buffer of same length
  const crypto = require("crypto");
  const a = Buffer.from(receivedToken);
  const b = Buffer.from(expectedToken);
  if (!crypto.timingSafeEqual(a, b)) {
    console.error(`[SECURITY] Invalid callback token`);
    return { valid: false, reason: "Invalid callback token" };
  }

  console.log(`[SECURITY] Valid callback token`);
  return { valid: true };
}

// ─── Safe JSON Parser ────────────────────────────────────────────────────────

/**
 * Safely parse JSON body. Returns { data, error }.
 */
function safeParseJSON(body) {
  try {
    return { data: JSON.parse(body), error: null };
  } catch (e) {
    return { data: null, error: e.message };
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const timestamp = new Date().toISOString();

  // ── Method check ──────────────────────────────────────────────────────────
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // ── 1. Callback token verification (§1 — Security) ────────────────────────
  const tokenCheck = verifyCallbackToken(event.headers);
  if (!tokenCheck.valid) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: tokenCheck.reason }),
    };
  }

  // ── 2. Safe JSON parsing (§7) ─────────────────────────────────────────────
  const { data: webhookData, error: parseError } = safeParseJSON(event.body);
  if (parseError) {
    console.error(`[WEBHOOK] ${timestamp} | JSON parse error: ${parseError}`);
    console.error(`[WEBHOOK] Raw body (first 200 chars): ${(event.body || "").substring(0, 200)}`);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON body", details: parseError }),
    };
  }

  const { id: invoiceId, status, external_id: externalId } = webhookData;

  console.log(`[WEBHOOK] ${timestamp} | ${status} | ${externalId} | Invoice: ${invoiceId}`);

  // ── 3. Route by status ────────────────────────────────────────────────────
  try {
    let result;

    switch (status) {
      // PAID: Create reservation. Throws on failure → catch returns 500.
      case "PAID":
        result = await handlePaid(externalId, webhookData);
        break;

      // SETTLED: Acknowledge only — reservation already created on PAID (§4).
      case "SETTLED":
        result = handleSettled(externalId, webhookData);
        break;

      // PENDING / EXPIRED: Acknowledge, safe operations only.
      case "PENDING":
        result = handlePending(externalId, webhookData);
        break;

      case "EXPIRED":
        result = handleExpired(externalId, webhookData);
        break;

      default:
        result = handleUnknownStatus(status, externalId, webhookData);
        break;
    }

    console.log(`[WEBHOOK] ✅ ${status} processed successfully for ${externalId}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, ...result }),
    };
  } catch (error) {
    // ── 4. Error handling (§3) — return 500 so Xendit retries ──────────────
    const errorDetails = error.response?.data || error.message;
    console.error(`[ERROR] ${timestamp} | Webhook processing failed`);
    console.error(`[ERROR] Status: ${status} | Invoice: ${invoiceId} | Ref: ${externalId}`);
    console.error(`[ERROR] Details:`, JSON.stringify(errorDetails, null, 2));

    // Distinguish timeout errors for clearer debugging
    if (error.code === "ECONNABORTED") {
      console.error(`[ERROR] Request timed out after 15s`);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        received: true,
        error: "Processing failed — will be retried by Xendit",
        details: typeof errorDetails === "string" ? errorDetails : error.message,
      }),
    };
  }
};
