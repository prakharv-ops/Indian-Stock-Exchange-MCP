import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Context, defineTool, exchange, limitArg } from "./register.js";
import { limit, num } from "../util.js";

const slimMover = (s: any) => ({
  company: s.company_name ?? s.displayName ?? s.company,
  symbol: s.ticker_id ?? s.tickerId ?? s.ticker,
  exchange: s.exchange_type ?? s.exchangeType,
  price: num(s.price),
  percentChange: num(s.percent_change ?? s.percentChange),
  netChange: num(s.net_change ?? s.netChange),
  volume: num(s.volume),
  high: num(s.high),
  low: num(s.low),
  yearHigh: num(s.year_high ?? s.yearHigh),
  yearLow: num(s.year_low ?? s.yearLow),
  rating: s.overall_rating,
});

const slimNews = (n: any) => ({
  title: n.title,
  summary: n.summary,
  source: n.source,
  published: n.pub_date,
  url: n.url,
});

export function registerMarketTools(server: McpServer, { api }: Context) {
  const gainersLosers = async (kind: "top_gainers" | "top_losers", n: number) => {
    const d = await api.get("/trending");
    return limit(d.trending_stocks?.[kind], n).map(slimMover);
  };

  defineTool(server, {
    name: "get-top-gainers",
    title: "Top gainers",
    description: "Today's top gaining stocks (BSE-listed; use get-price-shockers for NSE).",
    inputSchema: { limit: limitArg(50, 10) },
    handler: ({ limit: n }) => gainersLosers("top_gainers", n),
  });

  defineTool(server, {
    name: "get-top-losers",
    title: "Top losers",
    description: "Today's top losing stocks (BSE-listed; use get-price-shockers for NSE).",
    inputSchema: { limit: limitArg(50, 10) },
    handler: ({ limit: n }) => gainersLosers("top_losers", n),
  });

  defineTool(server, {
    name: "get-most-active",
    title: "Most active stocks",
    description: "Most actively traded stocks by volume on the chosen exchange.",
    inputSchema: { exchange, limit: limitArg(50, 10) },
    handler: async ({ exchange: ex, limit: n }) =>
      limit(await api.get<any[]>(`/${ex}_most_active`), n).map(slimMover),
  });

  defineTool(server, {
    name: "get-price-shockers",
    title: "Price shockers",
    description: "Stocks with unusually large price moves today on the chosen exchange.",
    inputSchema: { exchange, limit: limitArg(50, 10) },
    handler: async ({ exchange: ex, limit: n }) => {
      const d = await api.get("/price_shockers");
      return limit(d[`${ex}_PriceShocker`], n).map(slimMover);
    },
  });

  defineTool(server, {
    name: "get-52-week-highs-lows",
    title: "52-week highs and lows",
    description: "Stocks trading at their 52-week high or low.",
    inputSchema: {
      exchange,
      type: z.enum(["high", "low"]).default("high"),
      limit: limitArg(100, 15),
    },
    handler: async ({ exchange: ex, type, limit: n }) => {
      const d = await api.get("/fetch_52_week_high_low_data");
      return limit(d[`${ex}_52WeekHighLow`]?.[`${type}52Week`], n);
    },
  });

  defineTool(server, {
    name: "get-news",
    title: "Market news",
    description: "Latest Indian stock-market and business news headlines with summaries.",
    inputSchema: { limit: limitArg(50, 10) },
    handler: async ({ limit: n }) => limit(await api.get<any[]>("/news"), n).map(slimNews),
  });

  defineTool(server, {
    name: "get-market-news",
    title: "Market news (alias)",
    description: "Alias of get-news: the latest market news.",
    inputSchema: { limit: limitArg(50, 10) },
    handler: async ({ limit: n }) => limit(await api.get<any[]>("/news"), n).map(slimNews),
  });

  defineTool(server, {
    name: "get-market-overview",
    title: "Market overview",
    description: "Dashboard of the day: top gainers and losers, most active NSE stocks, price shockers and headlines in one call.",
    inputSchema: { limit: limitArg(10, 5) },
    handler: async ({ limit: n }) => {
      const [trending, active, shockers, news] = await Promise.all([
        api.get("/trending"),
        api.get<any[]>("/NSE_most_active"),
        api.get("/price_shockers"),
        api.get<any[]>("/news"),
      ]);
      return {
        topGainers: limit(trending.trending_stocks?.top_gainers, n).map(slimMover),
        topLosers: limit(trending.trending_stocks?.top_losers, n).map(slimMover),
        mostActiveNSE: limit(active, n).map(slimMover),
        priceShockersNSE: limit(shockers.NSE_PriceShocker, n).map(slimMover),
        headlines: limit(news, n).map(slimNews),
      };
    },
  });

  defineTool(server, {
    name: "get-ipos",
    title: "IPOs",
    description: "IPO calendar: upcoming, active, pre-apply, recently closed and listed issues with price band and listing gains.",
    inputSchema: {
      status: z.enum(["upcoming", "active", "pre_apply", "closed", "listed"]).optional().describe("Default: all groups"),
      limit: limitArg(50, 10),
    },
    handler: async ({ status, limit: n }) => {
      const d = await api.get<Record<string, any[]>>("/ipo");
      const groups = status ? { [status]: d[status] } : d;
      return Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, limit(v, n)]));
    },
  });

  defineTool(server, {
    name: "get-commodities",
    title: "Commodity futures",
    description: "Commodity futures and options quotes (MCX) with open interest and buildup signal. Optionally filter by product, e.g. 'GOLD' or 'CRUDEOIL'.",
    inputSchema: { product: z.string().optional().describe("Substring of product name"), limit: limitArg(50, 15) },
    handler: async ({ product, limit: n }) => {
      let rows = await api.get<any[]>("/commodities");
      if (product) rows = rows.filter((r) => String(r.product).toUpperCase().includes(product.toUpperCase()));
      return limit(rows, n).map((r) => ({
        product: r.product,
        expiry: r.expiry,
        lastPrice: num(r.last_traded_price),
        change: r.change,
        percentChange: r.per_change,
        openInterest: num(r.open_interest),
        oiSignal: r.oiResult,
        volume: num(r.total_quantity_traded),
        unit: r.price_quotation_unit,
        updated: r.last_traded_time,
      }));
    },
  });
}
