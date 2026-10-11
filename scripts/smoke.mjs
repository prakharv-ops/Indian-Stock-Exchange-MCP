// Live smoke test: spawns the built server over stdio and calls every tool once.
// Usage: npm run build && npm run smoke   (requires ISE_API_KEY)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "../build/index.js");
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: "node", args: [entry] }));

const { tools } = await client.listTools();
console.log(`${tools.length} tools, ${(await client.listPrompts()).prompts.length} prompts`);

const calls = [
  ["search-stocks", { query: "tata" }],
  ["get-stock-snapshot", { name: "Reliance Industries" }],
  ["get-stock-price", { name: "TCS" }],
  ["get-stock-details", { name: "Infosys" }],
  ["get-stock-history", { name: "Infosys", period: "1m" }],
  ["compare-stocks", { names: ["TCS", "Infosys", "Wipro"] }],
  ["get-peers", { name: "HDFC Bank" }],
  ["get-stock-recommendations", { name: "TCS" }],
  ["get-financial-statements", { name: "TCS", statement: "quarterly_results" }],
  ["get-shareholding-pattern", { name: "TCS" }],
  ["get-analyst-estimates", { symbol: "TCS" }],
  ["get-price-target", { symbol: "TCS" }],
  ["get-corporate-actions", { name: "TCS" }],
  ["get-announcements", { name: "TCS", limit: 3 }],
  ["get-top-gainers", {}],
  ["get-top-losers", {}],
  ["get-most-active", {}],
  ["get-price-shockers", {}],
  ["get-52-week-highs-lows", { type: "low" }],
  ["get-news", { limit: 3 }],
  ["get-market-news", {}],
  ["get-market-overview", {}],
  ["get-ipos", { status: "upcoming" }],
  ["get-commodities", { product: "GOLD" }],
  ["search-mutual-funds", { query: "hdfc" }],
  ["get-mutual-fund-details", { name: "HDFC Mid Cap Fund" }],
  ["list-mutual-funds", {}],
  ["list-mutual-funds", { category: "Equity", sub_category: "Mid-Cap" }],
];

let failed = 0;
for (const [name, args] of calls) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content[0].text;
  if (r.isError) failed++;
  console.log(`${r.isError ? "FAIL" : "ok  "} ${name.padEnd(28)} ${String(text.length).padStart(6)}  ${text.replace(/\s+/g, " ").slice(0, 90)}`);
}
await client.close();
process.exit(failed ? 1 : 0);
