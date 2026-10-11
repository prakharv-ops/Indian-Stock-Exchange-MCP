import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Context, defineTool, limitArg, stockName } from "./register.js";
import { limit } from "../util.js";

const STATEMENTS = {
  quarterly_results: "quarter_results",
  annual_results: "yoy_results",
  balance_sheet: "balancesheet",
  cash_flow: "cashflow",
  ratios: "ratios",
} as const;

export function registerFundamentalTools(server: McpServer, { api }: Context) {
  defineTool(server, {
    name: "get-financial-statements",
    title: "Financial statements",
    description:
      "Multi-year financials as metric -> period series. quarterly_results and annual_results hold the P&L (sales, profit, EPS), plus balance_sheet, cash_flow and ratios.",
    inputSchema: {
      name: stockName(),
      statement: z.enum(Object.keys(STATEMENTS) as [keyof typeof STATEMENTS, ...(keyof typeof STATEMENTS)[]]).describe("Which statement"),
    },
    handler: ({ name, statement }) =>
      api.get("/historical_stats", { stock_name: name, stats: STATEMENTS[statement] }, 600_000),
  });

  defineTool(server, {
    name: "get-shareholding-pattern",
    title: "Shareholding pattern",
    description: "Promoter, FII, DII and public holding percentages over time.",
    inputSchema: {
      name: stockName(),
      view: z.enum(["quarterly", "yearly"]).default("quarterly"),
    },
    handler: ({ name, view }) =>
      api.get("/historical_stats", { stock_name: name, stats: `shareholding_pattern_${view}` }, 600_000),
  });

  const measures = {
    EPS: "Earnings per share",
    SAL: "Sales / revenue",
    NET: "Net income",
    EBI: "EBIT",
    EBT: "EBITDA",
    DPS: "Dividend per share",
    CPS: "Cash flow per share",
    CPX: "Capex",
    GPS: "Gross profit per share",
    GRM: "Gross margin",
    NAV: "Net asset value",
    NDT: "Net debt",
    PRE: "Pre-tax profit",
    ROA: "Return on assets",
    ROE: "Return on equity",
  };
  defineTool(server, {
    name: "get-analyst-estimates",
    title: "Analyst estimates",
    description: `Consensus forecasts or reported actuals for a financial measure. Measures: ${Object.entries(measures)
      .map(([k, v]) => `${k} (${v})`)
      .join(", ")}.`,
    inputSchema: {
      symbol: z.string().min(1).describe("NSE symbol, e.g. 'RELIANCE' or 'TCS'"),
      measure: z.enum(Object.keys(measures) as [string, ...string[]]).default("EPS"),
      period_type: z.enum(["Annual", "Interim"]).default("Annual"),
      data_type: z.enum(["Estimates", "Actuals"]).default("Estimates"),
      age: z
        .enum(["Current", "OneWeekAgo", "ThirtyDaysAgo", "SixtyDaysAgo", "NinetyDaysAgo"])
        .default("Current")
        .describe("Snapshot age, useful to see how estimates have been revised"),
    },
    handler: ({ symbol, measure, period_type, data_type, age }) =>
      api.get("/stock_forecasts", { stock_id: symbol, measure_code: measure, period_type, data_type, age }, 600_000),
  });

  defineTool(server, {
    name: "get-price-target",
    title: "Analyst price target",
    description: "Mean/median/high/low analyst price targets and the consensus recommendation, with recent revisions.",
    inputSchema: { symbol: z.string().min(1).describe("NSE symbol, e.g. 'RELIANCE'") },
    handler: ({ symbol }) => api.get("/stock_target_price", { stock_id: symbol }, 600_000),
  });

  defineTool(server, {
    name: "get-corporate-actions",
    title: "Corporate actions",
    description: "Dividends, bonus, splits, rights issues and board meetings for a company, most recent first.",
    inputSchema: { name: stockName(), limit: limitArg(100, 10).describe("Maximum rows per category") },
    handler: async ({ name, limit: n }) => {
      const d = await api.get<Record<string, any>>("/corporate_actions", { stock_name: name }, 600_000);
      return Object.fromEntries(
        Object.entries(d).map(([k, v]) => [k, v && Array.isArray(v.data) ? { ...v, data: limit(v.data, n) } : v]),
      );
    },
  });

  defineTool(server, {
    name: "get-announcements",
    title: "Company announcements",
    description: "Recent exchange filings and announcements (BSE) for a company, with links to the PDFs.",
    inputSchema: { name: stockName(), limit: limitArg(50, 10) },
    handler: async ({ name, limit: n }) => limit(await api.get<any[]>("/recent_announcements", { stock_name: name }), n),
  });
}
