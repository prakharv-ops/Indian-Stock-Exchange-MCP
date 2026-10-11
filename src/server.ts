import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ApiClient } from "./client.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { registerFundamentalTools } from "./tools/fundamentals.js";
import { registerFundTools } from "./tools/funds.js";
import { registerMarketTools } from "./tools/market.js";
import { registerStockTools } from "./tools/stocks.js";

export const SERVER_VERSION = "2.0.0";

export function createServer(api: ApiClient): McpServer {
  const server = new McpServer(
    { name: "indian-stock-exchange", title: "Indian Stock Exchange", version: SERVER_VERSION },
    {
      instructions:
        "Data for Indian equities (NSE/BSE), IPOs, mutual funds and commodities. Start with get-stock-snapshot for a company, " +
        "get-market-overview for the market, and search-stocks if a name is ambiguous. Amounts are in INR; market caps in crore. " +
        "Data is informational and not investment advice.",
    },
  );
  const ctx = { api };
  registerStockTools(server, ctx);
  registerFundamentalTools(server, ctx);
  registerMarketTools(server, ctx);
  registerFundTools(server, ctx);
  registerResources(server, ctx);
  registerPrompts(server);
  return server;
}
