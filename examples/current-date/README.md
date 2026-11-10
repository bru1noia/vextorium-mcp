# Try Vextorium for free

This example connects to the existing Vextorium MCP server, lists its tools and calls only `current_date`. It returns the live date and local time in Europe/Madrid, plus the observation time in UTC.

No wallet, account or API key is needed. It makes no paid call.

## Run

Requires Node.js 18 or newer. From this directory:

```sh
npm install
npm start
```

The SDK is pinned in package.json. The client prints the JSON returned by the server; the actual date changes on each call.

## Use your own MCP client

Connect a compatible remote MCP client to `https://api.vextorium.com/mcp`, then ask it to call `current_date`. Client configuration formats vary: follow your client's remote HTTP MCP instructions.

After trying the date tool, use `search_services` and `service_details` to explore the catalog. Both are free. Paid services use `call_service` or the HTTP API and need an appropriate payment client.

The HTTP APIs can advertise XRP and RLUSD on XRPL. Read the current 402 offer and the [official XRPL client guide](https://xrpl-x402.t54.ai/docs/client-guides/typescript) before making a paid call. XRPL payments currently use HTTP rather than MCP call_service.

[Website](https://vextorium.com) · [Catalog](https://api.vextorium.com/catalog.json)

## License

MIT, as specified by the repository's root LICENSE. This example does not grant rights to the paid service or third-party data beyond their published terms.
