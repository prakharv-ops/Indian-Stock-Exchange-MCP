import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Context, defineTool, limitArg, stockName } from "./register.js";
import { flattenMetrics, limit, num } from "../util.js";

/** Condense the very large /stock payload into the numbers people actually ask about. */
export function buildSnapshot(d: any) {
  const m = flattenMetrics(d.keyMetrics);
  const price = num(d.currentPrice?.NSE) ?? num(d.currentPrice?.BSE);

  const trend = (d.stockTechnicalData ?? []).map((t: any) => {
    const avg = num(t.nsePrice) ?? num(t.bsePrice);
    return {
      movingAverageDays: t.days,
      value: avg,
      priceVsAverage: price !== null && avg ? `${(((price - avg) / avg) * 100).toFixed(1)}%` : null,
    };
  });
  const above = trend.filter((t: any) => t.value !== null && price !== null && price > t.value).length;

  const ratings = (d.analystView ?? []).map((r: any) => ({
    rating: r.ratingName,
    analysts: num(r.numberOfAnalystsLatest) ?? 0,
  }));
  const totalAnalysts = ratings.reduce((s: number, r: any) => s + r.analysts, 0);

  return {
    company: d.companyName,
    industry: d.industry,
    nseSymbol: d.companyProfile?.exchangeCodeNse,
    bseCode: d.companyProfile?.exchangeCodeBse,
    isin: d.companyProfile?.isInId,
    price: { nse: num(d.currentPrice?.NSE), bse: num(d.currentPrice?.BSE), percentChange: num(d.percentChange) },
    range: {
      dayHigh: num(d.stockDetailsReusableData?.high),
      dayLow: num(d.stockDetailsReusableData?.low),
      week52High: num(d.yearHigh),
      week52Low: num(d.yearLow),
      distanceFrom52wHigh: price && num(d.yearHigh) ? `${(((price - num(d.yearHigh)!) / num(d.yearHigh)!) * 100).toFixed(1)}%` : null,
    },
    marketCapCrore: m.marketCap,
    valuation: {
      peTTM: m.pPerEBasicExcludingExtraordinaryItemsTTM,
      priceToBook: m.priceToBookMostRecentFiscalYear,
      priceToSales: m.priceToSalesTrailing12Month,
      pegRatio: m.pegRatio,
      dividendYieldPct: m.dividendYieldIndicatedAnnualDividendDividedByClosingprice,
    },
    profitability: {
      roePctTTM: m.returnOnAverageEquityTrailing12Month,
      roePct5yAvg: m.returnOnAverageEquity5YearAverage,
      netMarginPctTTM: m.netProfitMarginPercentTrailing12Month,
      operatingMarginPctTTM: m.operatingMarginTrailing12Month,
    },
    growth: {
      revenueGrowth5yPct: m.revenueGrowthRate5Year,
      epsGrowth5yPct: m.ePSGrowthRate5Year,
      revenueTTMvsPriorTTMPct: m.revenueChangePercentTTMPOverTTM,
    },
    financialHealth: {
      debtToEquity: m.totalDebtPerTotalEquityMostRecentQuarter,
      currentRatio: m.currentRatioMostRecentQuarter,
      interestCoverage: m.netInterestCoverageTrailing12Month,
    },
    performancePct: {
      fiveDay: m.price5DayPercentChange,
      thirteenWeek: m.price13WeekPricePercentChange,
      twentySixWeek: m.price26WeekPricePercentChange,
      ytd: m.priceYTDPricePercentChange,
      fiftyTwoWeek: m.price52WeekPricePercentChange,
    },
    beta: m.beta,
    risk: d.riskMeter,
    technicals: {
      trendSummary: trend.length ? `Price is above ${above} of ${trend.length} moving averages` : null,
      movingAverages: trend,
    },
    analystConsensus: {
      totalAnalysts,
      breakdown: ratings,
    },
    peers: limit(d.companyProfile?.peerCompanyList, 5).map((p: any) => ({
      company: p.companyName,
      price: p.price,
      percentChange: p.percentChange,
      marketCapCrore: p.marketCap,
      pe: p.priceToEarningsValueRatio,
      priceToBook: p.priceToBookValueRatio,
    })),
    asOf: [d.stockDetailsReusableData?.date, d.stockDetailsReusableData?.time].filter(Boolean).join(" "),
  };
}

export function registerStockTools(server: McpServer, { api }: Context) {
  const stock = (name: string) => api.get("/stock", { name });

  defineTool(server, {
    name: "search-stocks",
    title: "Search stocks",
    description:
      "Find listed Indian companies by name or partial name. Returns NSE/BSE codes and ISIN; use it to resolve ambiguous names.",
    inputSchema: { query: z.string().min(1).describe("Search text, e.g. 'tata'"), limit: limitArg(25, 10) },
    handler: async ({ query, limit: n }) => {
      const results = await api.get<any[]>("/industry_search", { query });
      return limit(results, n).map((r) => ({
        name: r.commonName,
        nseSymbol: r.exchangeCodeNsi,
        bseCode: r.exchangeCodeBse,
        isin: r.id,
        industry: r.mgIndustry,
        type: r.stockType,
        trend: r.activeStockTrends?.overallRating,
      }));
    },
  });

  defineTool(server, {
    name: "get-stock-snapshot",
    title: "Stock snapshot",
    description:
      "One-call overview of a stock: price, ranges, valuation, profitability, growth, balance-sheet health, returns, technical trend, analyst consensus and peers. Best first call for any stock question.",
    inputSchema: { name: stockName() },
    handler: async ({ name }) => buildSnapshot(await stock(name)),
  });

  defineTool(server, {
    name: "get-stock-price",
    title: "Stock price",
    description: "Latest price (NSE and BSE), day change and 52-week range for a stock.",
    inputSchema: { name: stockName() },
    handler: async ({ name }) => {
      const d = await stock(name);
      const r = d.stockDetailsReusableData ?? {};
      return {
        company: d.companyName,
        price: d.currentPrice,
        percentChange: d.percentChange,
        previousClose: r.close,
        dayHigh: r.high,
        dayLow: r.low,
        week52High: d.yearHigh,
        week52Low: d.yearLow,
        marketCapCrore: r.marketCap,
        asOf: [r.date, r.time].filter(Boolean).join(" "),
      };
    },
  });

  const sections = ["profile", "key_metrics", "shareholding", "corporate_actions", "analyst", "news", "financials"] as const;
  defineTool(server, {
    name: "get-stock-details",
    title: "Stock details",
    description:
      "Detailed data for a stock, by section. Defaults to profile, key_metrics and analyst. 'financials' is very large; prefer get-financial-statements.",
    inputSchema: {
      name: stockName("Tata Steel"),
      sections: z
        .array(z.enum(sections))
        .default(["profile", "key_metrics", "analyst"])
        .describe("Which sections to include"),
    },
    handler: async ({ name, sections: wanted }) => {
      const d = await stock(name);
      const out: Record<string, unknown> = { company: d.companyName, industry: d.industry, price: d.currentPrice };
      if (wanted.includes("profile")) out.profile = d.companyProfile;
      if (wanted.includes("key_metrics")) out.keyMetrics = d.keyMetrics;
      if (wanted.includes("shareholding")) out.shareholding = d.shareholding;
      if (wanted.includes("corporate_actions")) out.corporateActions = d.stockCorporateActionData;
      if (wanted.includes("analyst")) out.analyst = { analystView: d.analystView, recosBar: d.recosBar };
      if (wanted.includes("news")) out.news = d.recentNews;
      if (wanted.includes("financials")) out.financials = d.stockFinancialData;
      return out;
    },
  });

  defineTool(server, {
    name: "get-stock-history",
    title: "Price and valuation history",
    description: "Historical series for a stock: price, P/E, price-to-book, sales/margins or EV multiples.",
    inputSchema: {
      name: stockName("Infosys"),
      period: z.enum(["1m", "6m", "1yr", "3yr", "5yr", "10yr", "max"]).default("1yr").describe("Look-back window"),
      metric: z
        .enum(["price", "pe", "pb", "sm", "ev"])
        .default("price")
        .describe("price; pe = price/earnings; pb = price/book; sm = sales & margins; ev = EV multiples"),
    },
    handler: ({ name, period, metric }) =>
      api.get("/historical_data", { stock_name: name, period, filter: metric }, 300_000),
  });

  defineTool(server, {
    name: "compare-stocks",
    title: "Compare stocks",
    description: "Side-by-side comparison of 2-5 stocks on price, valuation, profitability, growth, risk and analyst views.",
    inputSchema: {
      names: z.array(stockName()).min(2).max(5).describe("Companies to compare"),
    },
    handler: async ({ names }) => {
      const settled = await Promise.allSettled(names.map((n) => stock(n)));
      return settled.map((r, i) => {
        if (r.status === "rejected") return { requested: names[i], error: (r.reason as Error).message };
        const s = buildSnapshot(r.value);
        return {
          requested: names[i],
          company: s.company,
          industry: s.industry,
          price: s.price,
          marketCapCrore: s.marketCapCrore,
          valuation: s.valuation,
          profitability: s.profitability,
          growth: s.growth,
          financialHealth: s.financialHealth,
          performancePct: s.performancePct,
          beta: s.beta,
          trend: s.technicals.trendSummary,
          analystBreakdown: s.analystConsensus.breakdown,
        };
      });
    },
  });

  defineTool(server, {
    name: "get-peers",
    title: "Peer companies",
    description: "Listed peers of a company with their price, market cap, P/E, P/B, ROE and margins.",
    inputSchema: { name: stockName(), limit: limitArg(20, 10) },
    handler: async ({ name, limit: n }) => {
      const d = await stock(name);
      return {
        company: d.companyName,
        peers: limit(d.companyProfile?.peerCompanyList, n).map((p: any) => ({
          company: p.companyName,
          price: p.price,
          percentChange: p.percentChange,
          marketCapCrore: p.marketCap,
          pe: p.priceToEarningsValueRatio,
          priceToBook: p.priceToBookValueRatio,
          roeTTMPct: p.returnOnAverageEquityTrailing12Month,
          netMarginTTMPct: p.netProfitMarginPercentTrailing12Month,
          debtToEquity: p.ltDebtPerEquityMostRecentFiscalYear,
          dividendYieldPct: p.dividendYieldIndicatedAnnual,
        })),
      };
    },
  });

  defineTool(server, {
    name: "get-stock-recommendations",
    title: "Analyst recommendations",
    description: "Analyst rating breakdown (strong buy to strong sell) and its trend over recent months for a stock.",
    inputSchema: { name: stockName() },
    handler: async ({ name }) => {
      const d = await stock(name);
      return { company: d.companyName, analystView: d.analystView, recosBar: d.recosBar };
    },
  });
}
