import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Context } from "./tools/register.js";
import { buildSnapshot } from "./tools/stocks.js";
import { limit } from "./util.js";

const json = (uri: URL, data: unknown) => ({
  contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
});

export function registerResources(server: McpServer, { api }: Context) {
  server.registerResource(
    "market-news",
    "ise://market/news",
    { title: "Latest market news", description: "Top 20 current headlines", mimeType: "application/json" },
    async (uri) => json(uri, limit(await api.get<any[]>("/news"), 20)),
  );

  server.registerResource(
    "ipo-calendar",
    "ise://market/ipos",
    { title: "IPO calendar", description: "Upcoming, active and recent IPOs", mimeType: "application/json" },
    async (uri) => json(uri, await api.get("/ipo")),
  );

  server.registerResource(
    "stock-snapshot",
    new ResourceTemplate("ise://stock/{name}", { list: undefined }),
    { title: "Stock snapshot", description: "Condensed snapshot for a company (name or NSE symbol)", mimeType: "application/json" },
    async (uri, { name }) => json(uri, buildSnapshot(await api.get("/stock", { name: decodeURIComponent(String(name)) }))),
  );
}
