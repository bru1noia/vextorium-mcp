import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "vextorium-free-demo", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL("https://api.vextorium.com/mcp"));

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  if (!tools.some(tool => tool.name === "current_date")) {
    throw new Error("The server does not advertise current_date.");
  }
  const result = await client.callTool({ name: "current_date", arguments: {} });
  if (result.isError) throw new Error("The date tool returned an error.");
  for (const item of result.content ?? []) {
    if (item.type === "text") console.log(item.text);
  }
} finally {
  await client.close();
}
