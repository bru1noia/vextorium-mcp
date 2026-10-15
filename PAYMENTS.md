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
| Solana | Self-hosted, in the same server process. It uses the reference `@x402/svm` exact facilitator (`x402Facilitator` + `registerExactSvmScheme`, x402 2.28) and has no public HTTP endpoint. The fee payer is `4ZHcGaij9ktYqm9dNvMSMLsbT5D7BUrXDEzQGVH5h3Q6` and is advertised in `accepts[].extra.feePayer`. That account only pays network fees; the USDC goes to `payTo`. The RPC used is `solana-rpc.publicnode.com`. |

Solana fallback: if the self-hosted fee payer is unavailable (no key, or SOL balance below 0.002 at startup), Solana settlement falls back to the CDP facilitator above.

Base fallback: none. If CDP fails, the call is not settled and nothing is delivered.

## 4. Failures, timeouts and not paying twice

| Situation | What happens |
|---|---|
| Invalid input, not found, or upstream source down (4xx/5xx) | Not settled, so you are not charged. You get the error with no `PAYMENT-RESPONSE`. |
| Settlement fails | The result is discarded and you get `402` again. You were not charged, and you can sign a new payment. |
| Each signed payment | It can settle at most once. EVM uses an EIP-3009 nonce; Solana uses the signed transaction itself. If you replay the same signature, it is rejected and no second charge is possible. |
| Timeout or dropped connection with no response | Do **not** sign a new payment straight away. Check first whether your authorization settled: on Base, look for a USDC `Transfer` from your address to `payTo` (or the EIP-3009 nonce state); on Solana, check your recent USDC transfers to `payTo`. If it did not settle, you were not charged and can retry. If it did settle and you got no data, open an issue with the transaction hash at https://github.com/bru1noia/vextorium-mcp/issues and we will deliver the result or refund. |

The signature's validity window is `maxTimeoutSeconds` (300 s).

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
