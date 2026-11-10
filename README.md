# Vextorium MCP — 200+ pay-per-call APIs for AI agents

[![Listed on mcpservers.org](https://mcpservers.org/badge.svg)](https://mcpservers.org/servers/bru1noia/vextorium-mcp)
[![Tested by Lumi](https://api.lumitrades.io/badge/vextorium.svg)](https://api.lumitrades.io/trust/v/vextorium)
[![Vextorium MCP on mcprush](https://mcprush.com/badge/vextorium-mcp/score.svg)](https://mcprush.com/to/vextorium-mcp?ref=badge)
[![Lumière PayCheck: live grade for abi-decode](https://lumierepaycheck.org/badge?url=https%3A%2F%2Fapi.vextorium.com%2Fv1%2Fabi-decode)](https://lumierepaycheck.org/sellers/api.vextorium.com)

**200+ pay-per-call data APIs for AI agents:** official statistics and economic data, crypto prices, compliance checks, public records and web/data utilities. Connect over Streamable HTTP; no service API key, signup or subscription. See the [live catalog](https://api.vextorium.com/catalog.json) for the exact current count and available services.

**MCP endpoint:** `https://api.vextorium.com/mcp`

## Try it free

Connect your remote MCP client to `https://api.vextorium.com/mcp` and ask it to call `current_date`. It returns the live date and local time in Europe/Madrid, plus a UTC timestamp. No wallet, account or API key is needed.

Then explore the catalog with `search_services` and `service_details`, both free. Paid services are separate and require an appropriate payment client.

[Run the complete free client](examples/current-date/README.md) · [Website](https://vextorium.com)

## Tools

| Tool | Cost | What it does |
|---|---|---|
| `current_date` | free | Current date and time in Europe/Madrid |
| `search_services` | free | Search the catalog by keywords, such as `ECB rates`, `crypto prices` or `sanctions` |
| `service_details` | free | Input schema, example, price and payment networks for one service |
| `call_service` | per call (from $0.001) | Run a supported service and return its JSON result, paid via x402 |

The HTTP catalog currently lists **244 routes**; **242 are available through MCP**. `/v1/my-ip` and `/v1/ping` are HTTP-only because their results refer to the HTTP client's IP. These are services exposed through `call_service`, not hundreds of separate MCP tools.

## Available data and tools

- **Economy:** central-bank rates, inflation, FX, Treasury yield curves, economic calendar and official statistics.
- **Companies and public records:** SEC filings and financial data, EU and Spanish public records, tenders and grants.
- **Crypto prices and calculations:** prices by ticker, conversions, portfolio valuation, PnL and risk calculators.
- **Compliance:** sanctions screening, wallet sanctions checks, LEI, VAT/VIES and IBAN validation.
- **Web and data utilities:** DNS, SSL and security headers, JSON/CSV tools, text utilities, regex and JSONPath.
- **Science and public data:** weather, earthquakes, research and reference lookups.

The live catalog is authoritative. Older token-safety, Hyperliquid and XRPL node-data services are not advertised here because they are absent from the current catalog.

## Connect

Add the remote server in Claude, Cursor or another MCP client:

```json
{
  "mcpServers": {
    "vextorium": { "url": "https://api.vextorium.com/mcp" }
  }
}
```

The three free tools work without a wallet. Paid calls require an x402-capable buyer client that supports the selected network; adding an MCP URL alone does not enable payment.

MCP payments use **USDC on Base, Solana, Polygon, Optimism, Arc or Stellar**. The HTTP API also accepts **RLUSD or XRP on the XRP Ledger**. XRPL payment options are not exposed over MCP. Consult the current payment challenge and [buyer guide](PAYMENTS.md) before paying.

Plain HTTP: send a JSON body to `POST https://api.vextorium.com/v1/<service>`. An unsigned request returns HTTP 402 with the price and payment options. Service failures before settlement are not charged; if settlement is attempted but its result is uncertain, reconcile before paying again as explained in [PAYMENTS.md](PAYMENTS.md).

- Catalog: https://api.vextorium.com/catalog.json
- OpenAPI 3.1: https://api.vextorium.com/openapi.json
- Agent guide: https://api.vextorium.com/llms.txt
- Website: https://vextorium.com

## Independent route check

[![ECB rates history: settlement verified on PayAPI Market](https://payapi.market/badge/vextorium-ecb-rates-history.svg)](https://payapi.market/api/vextorium-ecb-rates-history)

[PayAPI Market lists Vextorium's ECB rates history route](https://payapi.market/api/vextorium-ecb-rates-history). Its published check records a $0.003 USDC test payment on Base on 2026-10-23 for `POST /v1/ecb-rates-history`. This verification covers that route and payment network only.

## Data and privacy

Inputs are processed in memory. Payment records are retained; for selected services returning public-source data, the delivered response and its hash are also retained as proof of delivery. Responses containing customer text, secrets or personal data are not retained. See the [privacy policy](https://vextorium.com/privacy) and [terms](https://vextorium.com/legal).

## License

This repository (documentation and configuration) is MIT licensed. The service itself is operated by Vextorium.
