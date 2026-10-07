# Vextorium MCP — 509 pay-per-call data tools for AI agents

[![Listed on mcpservers.org](https://mcpservers.org/badge.svg)](https://mcpservers.org/servers/bru1noia/vextorium-mcp)

Remote MCP server (Streamable HTTP) that gives any MCP client access to **509 data services** paid per call in USDC with [x402](https://x402.org). No sign-up, no API keys, no subscriptions: failed calls are never charged.

**Endpoint:** `https://api.vextorium.com/mcp`

## Tools

| Tool | Cost | What it does |
|---|---|---|
| `search_services` | free | Search the catalog by keywords (`"token safety solana"`, `"ECB rates"`, `"sanctions"`) |
| `service_details` | free | Inputs (JSON schema), example and price of one service |
| `call_service` | per call (from $0.001) | Run any service and get JSON; paid via x402 in USDC on Base or Solana |

## What's inside

- **Trading bots:** token safety verdicts (EVM and Solana), batch checks of 25 tokens, wash-trading detection, pre-trade check (risk + liquidity + price impact), position monitoring, new tokens that pass safety filters
- **Wallets and on-chain data:** balances and portfolios on 30+ chains (EVM, Solana, Bitcoin, Tron, TON, Cosmos, Sui, Aptos, Cardano…), transaction decoding, token approvals, ENS/Basenames
- **Markets:** Hyperliquid (funding, whales, liquidation map), Polymarket, DeFi yields, stablecoin depeg monitor, crypto news, market regime
- **Economy:** central bank rates, Treasury yield curve, inflation, FX, economic calendar, official statistics (Eurostat, World Bank, BLS, ECB)
- **Compliance:** sanctions screening (EU, OFAC, UN), LEI, VAT (VIES), IBAN
- **Web and developer tools:** web page to markdown, JSON repair, PDF text and tables, LLM token counter, DNS/SSL/security headers, regex, JSONPath

## Use it

Claude Desktop / Cursor / any MCP client (remote server):

```json
{
  "mcpServers": {
    "vextorium": { "url": "https://api.vextorium.com/mcp" }
  }
}
```

Paid calls need an x402-capable MCP client or wallet (e.g. AgentCash, Coinbase awal). Without one, `search_services` and `service_details` still work.

Plain HTTP works too: every service is `POST https://api.vextorium.com/v1/<service>` with a JSON body. The first call returns HTTP 402 with the price; pay and retry.

- Catalog: https://api.vextorium.com/catalog.json
- OpenAPI 3.1: https://api.vextorium.com/openapi.json
- Agent guide: https://api.vextorium.com/llms.txt
- Website: https://vextorium.com

## Data and privacy

Only open, redistributable and on-chain data sources. Inputs are processed in memory and not stored. Not financial or legal advice. Terms: https://api.vextorium.com/legal

## License

This repository (documentation and configuration) is MIT licensed. The service itself is operated by Vextorium.
