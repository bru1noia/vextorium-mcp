// Settlement-outcome test for Vextorium's seller stack: real @x402/express + @x402/core HTTPFacilitatorClient
// against a local MOCK facilitator (no real payment, no keys). For each facilitator behaviour it records what
// the buyer receives after sending PAYMENT-SIGNATURE: HTTP status, whether a fresh PAYMENT-REQUIRED is issued,
// the decoded PAYMENT-RESPONSE, and how many times /settle was called.
// Run: npm i express@4 @x402/express@2.28.0 @x402/core@2.28.0 @x402/evm@2.28.0 viem && node tests/uncertain-settlement.test.mjs
// The facilitator timeout is set to 1 s here to keep the test short; production uses the client default (90 s).
import { createRequire } from "node:module";
const req = createRequire(process.env.X402_SERVER_DIR ? process.env.X402_SERVER_DIR + "/package.json" : import.meta.url);
const express = req("express");
const { paymentMiddleware, x402ResourceServer } = await import(req.resolve("@x402/express"));
const { HTTPFacilitatorClient } = await import(req.resolve("@x402/core/server"));
const { ExactEvmScheme } = await import(req.resolve("@x402/evm/exact/server"));
const { x402Client, x402HTTPClient } = req("@x402/core/client");
const { registerExactEvmScheme } = req("@x402/evm/exact/client");
const { privateKeyToAccount, generatePrivateKey } = req("viem/accounts");

const BASE = "eip155:8453", PAY_TO = "0xb9f06D2734B7E9D7b21B64C4D8b95bd774b71aCf";
let mode = "ok", settleCalls = 0;

// Mock facilitator: /supported and /verify always succeed; /settle behaves according to `mode`.
const fac = express(); fac.use(express.json());
fac.get("/supported", (q, r) => r.json({ kinds: [{ x402Version: 2, scheme: "exact", network: BASE }], extensions: [], signers: {} }));
fac.post("/verify", (q, r) => mode === "verify_rejected"
  ? r.json({ isValid: false, invalidReason: "invalid_exact_evm_payload_signature", payer: "0xPAYER" })
  : r.json({ isValid: true, payer: "0xPAYER" }));
fac.post("/settle", (q, r) => {
  settleCalls++;
  const net = q.body.paymentRequirements.network;
  switch (mode) {
    case "ok": return r.json({ success: true, transaction: "0x" + "ab".repeat(32), network: net, payer: "0xPAYER" });
    case "settle_rejected": return r.json({ success: false, errorReason: "invalid_exact_evm_payload_authorization_valid_before", transaction: "", network: net, payer: "0xPAYER" });
    case "settle_http500_json": return r.status(500).json({ success: false, errorReason: "unexpected_settle_error", transaction: "", network: net });
    case "settle_http503_html": return r.status(503).send("<html>Service Unavailable</html>");
    case "settle_malformed_200": return r.status(200).send("not json");
    case "settle_timeout": return setTimeout(() => r.json({ success: true, transaction: "0x" + "cd".repeat(32), network: net }), 3000);
    case "settle_connection_reset": return q.socket.destroy();
  }
});
const facSrv = fac.listen(4196);

// Seller: same middleware and order as production (verify -> handler -> settle only if < 400 -> release data).
const app = express(); app.use(express.json());
const rs = new x402ResourceServer(new HTTPFacilitatorClient({ url: "http://127.0.0.1:4196", timeoutMs: 1000 })).register(BASE, new ExactEvmScheme());
const route = { accepts: [{ scheme: "exact", price: "$0.003", network: BASE, payTo: PAY_TO }] };
app.use(paymentMiddleware({ "POST /v1/demo": route, "POST /v1/upstream-down": route }, rs));
app.post("/v1/demo", (q, r) => r.json({ data: "result" }));
app.post("/v1/upstream-down", (q, r) => r.status(502).json({ error: "upstream unavailable" }));
const srv = app.listen(4197); await new Promise((r) => setTimeout(r, 300));

const c = new x402Client(); registerExactEvmScheme(c, { signer: privateKeyToAccount(generatePrivateKey()), networks: [BASE] });
const http = new x402HTTPClient(c);
const dec = (h) => (h ? JSON.parse(Buffer.from(h, "base64").toString()) : null);

const cases = [["ok", "demo"], ["upstream_down_handler_502", "upstream-down"], ["verify_rejected", "demo"], ["settle_rejected", "demo"],
  ["settle_http500_json", "demo"], ["settle_http503_html", "demo"], ["settle_malformed_200", "demo"], ["settle_timeout", "demo"], ["settle_connection_reset", "demo"]];
console.log("case | HTTP | fresh PAYMENT-REQUIRED | PAYMENT-RESPONSE (decoded) | body | /settle calls");
for (const [name, path] of cases) {
  mode = name; settleCalls = 0;
  const url = `http://127.0.0.1:4197/v1/${path}`, body = JSON.stringify({ q: 1 });
  const r1 = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
  const pr = http.getPaymentRequiredResponse((n) => r1.headers.get(n), await r1.json().catch(() => undefined));
  const sig = http.encodePaymentSignatureHeader(await http.createPaymentPayload(pr));
  const r2 = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...sig }, body });
  const pResp = dec(r2.headers.get("payment-response"));
  if (pResp?.payer) pResp.payer = pResp.payer.slice(0, 6) + "…";
  console.log([name, r2.status, r2.headers.has("payment-required") ? "YES" : "no", JSON.stringify(pResp), (await r2.text()).slice(0, 90), settleCalls].join(" | "));
}
await new Promise((r) => setTimeout(r, 3000)); srv.close(); facSrv.close();
