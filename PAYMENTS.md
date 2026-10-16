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

| Situation (after you sent `PAYMENT-SIGNATURE`) | HTTP you get | Charged? | Safe to retry? |
|---|---|---|---|
| Invalid input, not found, upstream down | 4xx/5xx with error, no `PAYMENT-RESPONSE` | No (never submitted) | Yes, immediately |
| Facilitator **rejects** verify/settle (confirmed failure) | `402` with the reason | No | Yes, immediately |
| Facilitator unreachable or returns an error during settle | `502 {"error": ...}` | **Uncertain** | Only after reconciling (below) |
| Unexpected server error during settle | `402 {}` | **Uncertain** | Only after reconciling (below) |
| Timeout / dropped connection, no response | none | **Uncertain** | Only after reconciling (below) |
| Success | `200` + data + `PAYMENT-RESPONSE` | Yes, once | — |

**Uncertain = the transaction may still land later.** Before signing a new payment:
- **Base (EIP-3009):** check `authorizationState(payer, nonce)` on the USDC contract, or a USDC `Transfer` from you to `payTo`. If not used, wait until the authorization's `validBefore` has passed; after that it can never settle, and retrying is safe.
- **Solana:** look up your signed transaction signature. If it is not found, wait until its recent blockhash has expired (~60–90 s); after that it can never land, and retrying is safe.

If an uncertain payment did settle and you got no data, open an issue with the transaction hash at https://github.com/bru1noia/vextorium-mcp/issues and we deliver the result or refund. The server never sends a new payment request for an uncertain result: the 502/402 above are terminal responses for that call.

**`maxTimeoutSeconds` (300 s on Base and Solana)** is the seller's limit for how long settlement of a request may take. It is **not** the signature's expiry: on Base the signed authorization expires at its own `validBefore` (set by the client, normally `now + maxTimeoutSeconds`); on Solana the transaction is valid until its recent blockhash expires (~60–90 s).

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

**Solana — real customer payment, 2026-10-14 17:00:19 UTC.** `POST` to the legacy alias of `/v1/eip712-review`, 0.005 USDC, network `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`, payer `34CM…5v2z` — https://solscan.io/tx/rPZcUEk6r8MoQthXyrH8edKbk1ZtGs9eWFouufsp9vzC2XQcx93f81J4rM6yYZje9BcgdHeNyYcx9QuVaMqP3aV . The customer's response body was not kept (see privacy below).

**Privacy.** Since 2026-10-16 the server keeps, with each payment, the delivered response and its sha256 only for services that return public-source data. Responses of services that process the customer's texts, secrets or personal data are never stored (https://vextorium.com/privacidad).

**Service availability.** Some routes return `503` (no charge) while they are under maintenance; they are not listed in `/catalog.json`.
