# Paying Vextorium (x402 v2): buyer integration guide

Vextorium is an x402 **seller** (a paid API), not a facilitator. Base URL: `https://api.vextorium.com`.
This page covers the HTTP API and the remote MCP server. It does not offer facilitator endpoints to third parties.

## 1. Catalogue: routes, methods, prices

| Source | What it contains |
|---|---|
| https://api.vextorium.com/catalog.json | Every paid route: `endpoint`, `method`, `price_usdc`, `networks`, `tags`, `example_body` (a ready request body) |
| https://api.vextorium.com/openapi.json | OpenAPI 3.1: one operation per paid route, input schema, price (`x-payment-info`) |
| https://api.vextorium.com/.well-known/x402 | x402 discovery: each resource with `name`, `description`, price and networks |
| https://api.vextorium.com/llms.txt | Plain-text guide for agents |

- Paid routes are `https://api.vextorium.com/v1/<service>`.
- A **paid call is always `POST`** with a JSON body (`content-type: application/json`). Use the route's `example_body` from catalog.json as the template.
- An unsigned `GET` or `POST` to a paid route returns `402` with the payment terms, so clients can discover the price. A `GET` is never charged.
- The price shown in the 402 is the price you pay. Most routes cost 0.003 USDC; some cost 0.001–0.05 USDC (see `price_usdc`).
- Legacy Spanish paths (for example `/clasificar-pago`, `/revisar-firma-pago`) are aliases kept for old clients. Each has the same price as its `/v1` equivalent (`/v1/classify-text` and `/v1/eip712-review`, 0.005 USDC).

Example request body (`POST /v1/gas-price`, 0.003 USDC):

```json
{"network": "base"}
```

## 2. Payment flow and headers

1. Send `POST /v1/<service>` with the JSON body and no payment. You get `402`:
   - The `PAYMENT-REQUIRED` header holds base64 JSON (x402 v2: `x402Version`, `resource`, `accepts[]`).
   - The JSON body repeats the same terms and adds a human-readable `message`.
2. Choose one entry of `accepts[]`, sign it, and repeat the same request with the `PAYMENT-SIGNATURE` header (x402 v2; the v1 `X-PAYMENT` header is not used).
3. On success you get `200`, the JSON result, and the `PAYMENT-RESPONSE` header with the settlement receipt (base64 JSON: `success`, `transaction`, `network`, `payer`).

Scheme `exact`, x402 v2. Networks in scope for the registry review:

| Network | CAIP-2 | Asset (decimals) | payTo |
|---|---|---|---|
| Base | `eip155:8453` | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6), EIP-3009 | `0xb9f06D2734B7E9D7b21B64C4D8b95bd774b71aCf` |
| Solana | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (6) | `HcjfmZLgWRZzwj4deEiS7pewc4KBYSw39mW5nTyt3pz2` |

The same 402 response also offers Polygon, Optimism, Arc and XRP Ledger. Those networks are outside this document's review scope.

Any standard x402 v2 client works: `@x402/fetch`, `@x402/axios`, the Python `x402` package, or our client `pip install vextorium`.

## 3. Settlement (seller side)

The server uses `@x402/express` 2.28. The order of operations is:

**verify the payment → run the service → settle only if the service answered < 400 → return the result together with `PAYMENT-RESPONSE`**

| Network | Who verifies and settles |
|---|---|
| Base | Coinbase CDP x402 facilitator, base URL `https://api.cdp.coinbase.com/platform/v2/x402`. It has `/supported`, `/verify` and `/settle`, and every request is authenticated with Vextorium's CDP API key (a JWT per request, through `@coinbase/cdp-sdk`). Buyers need no credentials. CDP submits the `transferWithAuthorization` transaction itself. |
| Solana | Coinbase CDP x402 facilitator (same URL and authentication as Base). The fee payer is CDP's and is advertised in `accepts[].extra.feePayer`. |

## 4. Failures, timeouts and not paying twice

The server buffers the result and settles **after** the service has answered < 400. The data is released only if settlement succeeds (`@x402/express` 2.28).

What you receive after sending `PAYMENT-SIGNATURE` (measured with the test in [`tests/uncertain-settlement.test.mjs`](tests/uncertain-settlement.test.mjs): real `@x402/express` 2.28 and `HTTPFacilitatorClient` against a mock facilitator; output in [`tests/uncertain-settlement.output.txt`](tests/uncertain-settlement.output.txt)):

| Situation | HTTP | `PAYMENT-REQUIRED` | `PAYMENT-RESPONSE` | Submitted? | What to do |
|---|---|---|---|---|---|
| Success | `200` + data | no | `success: true` + `transaction` | Yes | Done. Keep the receipt. |
| Invalid input, not found, upstream down (service answered ≥ 400) | that 4xx/5xx + `{"error": ...}` | no | none | **No** (settle never called) | Fix the request and retry. |
| Facilitator rejects **verify** | `402` | **yes** (fresh terms) | none | **No** | Sign a new payment. |
| Facilitator answers **settle** with `success: false` | `402 {}` | **no** | `success: false` + `errorReason` | **Uncertain** (attempted) | **Reconcile first** (below). |
| Facilitator settle HTTP error or transport error (5xx, connection reset, DNS) | `402 {}` | **no** | `success: false`, `errorReason` such as `fetch failed` or `Facilitator settle failed (503)` | **Uncertain** | **Reconcile first**. |
| Facilitator settle timeout or malformed answer | `502 {"error": "Facilitator settle request timed out ..."}` / `"... returned invalid JSON"` | **no** | none | **Uncertain** | **Reconcile first**. |
| Your connection drops, no response | none | — | — | **Uncertain** | **Reconcile first**. |

Rules:
- **Before settlement** (verify rejected, or the service failed): nothing was submitted. A verify rejection is the only case with a fresh `PAYMENT-REQUIRED`.
- **After settlement was attempted** (any `PAYMENT-RESPONSE` with `success: false`, a `502` about the facilitator, or no response): the server **never** sends a fresh `PAYMENT-REQUIRED`. The response is terminal for that call. A failed or missing settlement result is **not** proof that the payment cannot land later, so do not sign a new payment until you have reconciled.
- The HTTP status alone does not tell a confirmed rejection from a transport error: both can be `402`. Always reconcile after an attempted settlement.

**How to reconcile** (each step below is demonstrated on mainnet, read-only, with real Base and Solana payments in [`tests/reconciliation-demo.mjs`](tests/reconciliation-demo.mjs); output in [`tests/reconciliation-demo.output.txt`](tests/reconciliation-demo.output.txt)):
- **Base (EIP-3009):** read `authorizationState(authorizer, nonce)` on the USDC contract, using your address and the nonce you signed.
  - `true`: the payment settled. Do not pay again: open an issue at https://github.com/bru1noia/vextorium-mcp/issues with your address and the nonce (or the transaction hash), and we deliver the result or refund.
  - `false`: it can still settle until `validBefore`. Retry only after `validBefore` has passed; after that it can never settle.
- **Solana:** the transaction ID is the fee payer's signature, which you may not have. Check your USDC token account history (`getSignaturesForAddress`) for a transfer to `payTo`. If it is there, do not pay again: open an issue with that transaction and we deliver the result or refund. If there is none, retry only after the transaction's recent blockhash has expired (`lastValidBlockHeight` passed, about 60–90 s); after that it can never land.

**`maxTimeoutSeconds` (300 s on Base and Solana)** is the seller's limit for how long settlement of a request may take. It is **not** the signature's expiry:
- On Base, the signed authorization expires at its own `validBefore`. The standard `@x402/evm` client sets it to `now + maxTimeoutSeconds`.
- On Solana, the transaction is valid until its recent blockhash expires (about 60–90 s), regardless of `maxTimeoutSeconds`.

## 5. Remote MCP server

| Item | Detail |
|---|---|
| Endpoint | `https://api.vextorium.com/mcp` |
| Transport | Streamable HTTP, stateless (no session id), JSON responses. `POST` only; `GET` and `DELETE` return 405. |
| Setup | Add it as a remote MCP server URL in Claude, Cursor or any MCP client. It is also listed in the official MCP Registry. |
| Free tools | `search_services(query, limit)` and `service_details(service)` |
| Paid tool | `call_service(service, params)`, which uses x402 over MCP (`@x402/mcp` 2.28) |

How `call_service` handles payment:
- Without payment, the tool result carries the x402 `PaymentRequired` terms (same `accepts[]` as HTTP).
- The client retries with the signed payment in `_meta["x402/payment"]`.
- The receipt comes back in `_meta["x402/payment-response"]`.
- Same rule as HTTP: the call is settled only after the service succeeds.

MCP networks: Base, Solana, Polygon, Optimism and Arc, the same as HTTP except XRP Ledger. XRPL payments need a per-request `invoiceId`, which the MCP flow does not carry.

The MCP server is part of the same application and process as the HTTP API. Each paid call goes to the same backend service at the same price and to the same `payTo`.

## 6. Evidence (anonymised)

**Base — operator test, clearly labelled, 2026-10-16 22:12:20 UTC.** `POST https://api.vextorium.com/v1/fx-rates`, body `{"currencies":"EUR,JPY"}`, 0.004 USDC. Response `200` (`{"currencies":2,"types":[{"currency":"EUR","units_per_usd":0.888652,...}],"source":"Source: ECB statistics ..."}`). Decoded `PAYMENT-RESPONSE`: `{"success":true,"payer":"0xa8FC…868F","transaction":"0xf4ab31807b2498de8baa0a7106b2ccbcd26dfc9284626f9d4a32e95b1a10b76c","network":"eip155:8453"}` — https://basescan.org/tx/0xf4ab31807b2498de8baa0a7106b2ccbcd26dfc9284626f9d4a32e95b1a10b76c

**Solana: customer payment with retained response (not an operator test), 2026-10-17 00:56:33 UTC.**
- Request: `POST https://api.vextorium.com/v1/sec-company-ranking`, 0.006 USDC, network `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`, payer `2WgR…Z23Wx` (redacted).
- Request body: not retained (we never store request bodies). The response (metric `revenue`, period `CY2025`, 10 entries) matches the catalogue example body `{"metric": "revenue", "period": "CY2025", "limit": 10}`, which reproduces the call.
- Response: `200`, 1644 bytes, sha256 `7de8b67a30835ea414de50aaa6f09bdbda67e56f8b8c78db1024e4d45b7e175a`. The data comes from public SEC filings: `{"metric":"revenue","period":"CY2025","companies":4384,"ranking":[{"company":"AMAZON.COM, INC.","ticker":"AMZN","value_usd":716924000000,"position":1},...],"source":"SEC EDGAR, XBRL frames (figures as reported by the companies)"}`.
- Decoded `PAYMENT-RESPONSE`: `{"success":true,"payer":"2WgR…Z23Wx","transaction":"3MFE9Fp9DM7Y5MweKA4RXM3JMukcV3QN7opTqiPvixkbooEgZbNKz2Bo9v9BUYsB1v6KYZ7nvJbrpFgVfjFTH5PV","network":"solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"}`
- Explorer: https://solscan.io/tx/3MFE9Fp9DM7Y5MweKA4RXM3JMukcV3QN7opTqiPvixkbooEgZbNKz2Bo9v9BUYsB1v6KYZ7nvJbrpFgVfjFTH5PV (slot 457844994, 0.006 USDC to `HcjfmZ…t3pz2`, settled by the CDP facilitator).

**Solana: historical customer payment, 2026-10-14 17:00:19 UTC.** `POST` to the legacy alias of `/v1/eip712-review`, 0.005 USDC, payer `34CM…5v2z`: https://solscan.io/tx/rPZcUEk6r8MoQthXyrH8edKbk1ZtGs9eWFouufsp9vzC2XQcx93f81J4rM6yYZje9BcgdHeNyYcx9QuVaMqP3aV . Its response body was not kept: responses have only been retained since 2026-10-16. At that time Solana was settled by our self-hosted facilitator; since 2026-10-16 it is settled by CDP.

**Privacy.** Since 2026-10-16 the server keeps, with each payment, the delivered response and its sha256 only for services that return public-source data. Responses of services that process the customer's texts, secrets or personal data are never stored (https://vextorium.com/privacidad).

**Service availability.** Some routes return `503` (no charge) while they are under maintenance; they are not listed in `/catalog.json`.
