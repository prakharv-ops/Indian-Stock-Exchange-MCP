import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const user = (text: string) => ({
  messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
});

const DISCLAIMER = "End with a short note that this is information, not investment advice.";

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "analyze-stock",
    {
      title: "Analyze a stock",
      description: "Research report on a stock: valuation, quality, growth, risks, analyst view and news.",
      argsSchema: { name: z.string().describe("Company name or NSE symbol") },
    },
    ({ name }) =>
      user(
        `Write a concise research note on ${name}. Use get-stock-snapshot first, then get-financial-statements (annual_results and quarterly_results), get-price-target, get-shareholding-pattern and get-announcements as needed. Cover: business and industry; valuation vs peers; profitability and growth trend; balance-sheet health; shareholding changes; analyst consensus vs current price; recent news and filings; key risks. Quote figures with their period. ${DISCLAIMER}`,
      ),
  );

  server.registerPrompt(
    "compare-stocks",
    {
      title: "Compare stocks",
      description: "Head-to-head comparison of several companies.",
      argsSchema: { names: z.string().describe("Comma-separated company names or symbols") },
    },
    ({ names }) =>
      user(
        `Compare these Indian stocks: ${names}. Use compare-stocks, then dig into any notable gap with get-stock-history or get-financial-statements. Present a table of valuation, profitability, growth, leverage and momentum, then say which looks stronger on each dimension and why. ${DISCLAIMER}`,
      ),
  );

  server.registerPrompt(
    "market-briefing",
    {
      title: "Daily market briefing",
      description: "Summary of today's Indian market: movers, activity, news and IPOs.",
    },
    () =>
      user(
        `Prepare a daily briefing for the Indian market. Call get-market-overview, get-52-week-highs-lows and get-ipos. Summarise: the day's biggest gainers and losers and any theme among them, unusual activity, the main headlines, and IPOs open or opening soon. Keep it under 300 words. ${DISCLAIMER}`,
      ),
  );

  server.registerPrompt(
    "dividend-and-events",
    {
      title: "Upcoming events for a stock",
      description: "Dividends, board meetings and filings to watch for a company.",
      argsSchema: { name: z.string().describe("Company name or NSE symbol") },
    },
    ({ name }) =>
      user(
        `List upcoming and recent corporate events for ${name} using get-corporate-actions and get-announcements: dividends (amount, record date), splits/bonus, board meetings and material filings. Order by date and flag anything upcoming. ${DISCLAIMER}`,
      ),
  );

  server.registerPrompt(
    "mutual-fund-picks",
    {
      title: "Mutual fund shortlist",
      description: "Shortlist funds in a category by returns, size and risk.",
      argsSchema: {
        category: z.string().describe("e.g. 'Equity'"),
        sub_category: z.string().describe("e.g. 'Mid-Cap' or 'ELSS (Tax Savings)'"),
      },
    },
    ({ category, sub_category }) =>
      user(
        `Shortlist the best ${sub_category} funds in ${category}. Use list-mutual-funds ranked by 3-year and 5-year return, then get-mutual-fund-details for the top three to compare expense ratio, risk metrics, fund size and manager. ${DISCLAIMER}`,
      ),
  );
}
