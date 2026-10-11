import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Context, defineTool, limitArg } from "./register.js";
import { limit } from "../util.js";

export function registerFundTools(server: McpServer, { api }: Context) {
  defineTool(server, {
    name: "search-mutual-funds",
    title: "Search mutual funds",
    description: "Find mutual fund schemes by name.",
    inputSchema: { query: z.string().min(1).describe("e.g. 'hdfc mid cap'"), limit: limitArg(25, 10) },
    handler: async ({ query, limit: n }) => limit(await api.get<any[]>("/mutual_fund_search", { query }), n),
  });

  defineTool(server, {
    name: "get-mutual-fund-details",
    title: "Mutual fund details",
    description: "NAV, returns, risk metrics, expense ratio (recent history), exit load, SIP limits, fund manager and top holdings for a scheme.",
    inputSchema: {
      name: z.string().min(1).describe("Scheme name, e.g. 'HDFC Mid Cap Fund'"),
      holdings: z.number().int().min(0).max(50).default(10).describe("Number of top holdings to include"),
    },
    handler: async ({ name, holdings }) => {
      const d = await api.get("/mutual_funds_details", { stock_name: name }, 300_000);
      return {
        ...d,
        expense_ratio: { current: d.expense_ratio?.current, history: limit(d.expense_ratio?.history, 12) },
        holdings: limit(d.holdings, holdings),
      };
    },
  });

  defineTool(server, {
    name: "list-mutual-funds",
    title: "Browse mutual funds",
    description:
      "Browse funds by category (Equity, Debt, Hybrid, Index Funds, Solutions Oriented, Other) and sub-category, ranked by a return period. Call without arguments to list the categories.",
    inputSchema: {
      category: z.string().optional().describe("e.g. 'Equity'"),
      sub_category: z.string().optional().describe("e.g. 'Mid-Cap', 'Flexi Cap', 'ELSS (Tax Savings)'"),
      sort_by: z
        .enum(["1_month_return", "3_month_return", "6_month_return", "1_year_return", "3_year_return", "5_year_return", "asset_size", "star_rating"])
        .default("1_year_return"),
      limit: limitArg(50, 10),
    },
    handler: async ({ category, sub_category, sort_by, limit: n }) => {
      const d = await api.get<Record<string, Record<string, any[]>>>("/mutual_funds", {}, 300_000);
      if (!category) return Object.fromEntries(Object.entries(d).map(([c, subs]) => [c, Object.keys(subs)]));

      const cat = Object.keys(d).find((c) => c.toLowerCase() === category.toLowerCase());
      if (!cat) throw new Error(`Unknown category '${category}'. Options: ${Object.keys(d).join(", ")}`);

      const subs = Object.entries(d[cat]).filter(
        ([s]) => !sub_category || s.toLowerCase().includes(sub_category.toLowerCase()),
      );
      if (!subs.length) throw new Error(`No sub-category matching '${sub_category}'. Options: ${Object.keys(d[cat]).join(", ")}`);

      return subs
        .flatMap(([s, funds]) => funds.map((f) => ({ sub_category: s, ...f })))
        .sort((a, b) => (b[sort_by] ?? -Infinity) - (a[sort_by] ?? -Infinity))
        .slice(0, n);
    },
  });
}
