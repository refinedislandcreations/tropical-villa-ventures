// netlify/functions/test-webhook.js
// Simulates Xendit webhook callbacks for local development testing
// Usage: POST /.netlify/functions/test-webhook
// Body: { "external_id": "BOOKING_xxx", "status": "PAID" }

const { handlePaid, handleSettled, handlePending, handleExpired, handleUnknownStatus } = require("./webhook-helpers");

exports.handler = async (event) => {
  // Only allow in development
  if (process.env.NODE_ENV === "production" || process.env.CONTEXT === "production") {
    return { statusCode: 403, body: JSON.stringify({ error: "Test endpoint disabled in production" }) };
  }

  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: `<!DOCTYPE html><html><head><title>Webhook Tester</title>
<style>body{font-family:monospace;max-width:600px;margin:2rem auto;padding:1rem;background:#1a1a1a;color:#e0e0e0}
h1{color:#8B8635}input,select,textarea,button{width:100%;padding:8px;margin:4px 0 12px;box-sizing:border-box;background:#2a2a2a;border:1px solid #444;color:#e0e0e0;border-radius:4px}
button{background:#8B8635;color:white;cursor:pointer;font-weight:bold;border:none;padding:12px}button:hover{background:#6B682A}
pre{background:#0a0a0a;padding:1rem;overflow-x:auto;border-radius:4px;white-space:pre-wrap;max-height:400px;overflow-y:auto}</style></head>
<body><h1>🧪 Webhook Tester</h1>
<label>External ID (BOOKING_xxx):</label><input id="eid" value="" placeholder="BOOKING_319477_xxx"/>
<label>Status:</label><select id="st"><option value="PAID">PAID</option><option value="PENDING">PENDING</option><option value="EXPIRED">EXPIRED</option></select>
<label>Amount (IDR):</label><input id="amt" type="number" value="500000"/>
<button onclick="send()">🚀 Send Test Webhook</button>
<h3>Response:</h3><pre id="out">Click Send to test...</pre>
<script>async function send(){const o=document.getElementById('out');o.textContent='Sending...';try{const r=await fetch('/.netlify/functions/test-webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({external_id:document.getElementById('eid').value,status:document.getElementById('st').value,amount:parseInt(document.getElementById('amt').value),currency:'IDR',id:'test_inv_'+Date.now()})});o.textContent=JSON.stringify(await r.json(),null,2)}catch(e){o.textContent='Error: '+e.message}}</script>
</body></html>`,
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Use GET for UI, POST to simulate" }) };
  }

  try {
    const data = JSON.parse(event.body);
    const { external_id, status = "PAID", amount = 500000, currency = "IDR", id } = data;

    if (!external_id) {
      return { statusCode: 400, body: JSON.stringify({ error: "external_id is required" }) };
    }

    const webhookData = {
      id: id || `test_inv_${Date.now()}`,
      status,
      external_id,
      amount,
      currency,
      paid_at: status === "PAID" ? new Date().toISOString() : null,
      payment_method: "TEST_SIMULATOR",
    };

    console.log(`\n[TEST-WEBHOOK] Simulating ${status} for ${external_id}`);
    console.log(`[TEST-WEBHOOK] Payload:`, JSON.stringify(webhookData, null, 2));

    let result;
    switch (status) {
      case "PAID":
        result = await handlePaid(external_id, webhookData);
        break;
      case "SETTLED":
        result = handleSettled(external_id, webhookData);
        break;
      case "PENDING":
        result = handlePending(external_id, webhookData);
        break;
      case "EXPIRED":
        result = handleExpired(external_id, webhookData);
        break;
      default:
        result = handleUnknownStatus(status, external_id, webhookData);
        break;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ test: true, simulated_status: status, external_id, result }, null, 2),
    };
  } catch (error) {
    console.error(`[TEST-WEBHOOK] Error:`, error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
