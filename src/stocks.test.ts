import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSnapshot } from "./tools/stocks.js";
import { flattenMetrics, num } from "./util.js";

test("num parses API-style numbers", () => {
  assert.equal(num("1,234.5"), 1234.5);
  assert.equal(num("-"), null);
  assert.equal(num(null), null);
  assert.equal(num("abc"), null);
  assert.equal(num(7), 7);
});

test("flattenMetrics merges groups and strips stray parentheses", () => {
  const flat = flattenMetrics({
    a: [{ key: "revenueTrailing12Month)", value: "10" }],
    b: [{ key: "beta", value: "1.2" }],
  });
  assert.deepEqual(flat, { revenueTrailing12Month: 10, beta: 1.2 });
});

test("buildSnapshot condenses a stock payload", () => {
  const snap = buildSnapshot({
    companyName: "Acme",
    currentPrice: { NSE: "110", BSE: "110.5" },
    percentChange: "1.5",
    yearHigh: "200",
    yearLow: "90",
    keyMetrics: { v: [{ key: "pPerEBasicExcludingExtraordinaryItemsTTM", value: "20" }] },
    stockTechnicalData: [
      { days: 5, nsePrice: "100" },
      { days: 50, nsePrice: "120" },
    ],
    analystView: [
      { ratingName: "Buy", numberOfAnalystsLatest: "3" },
      { ratingName: "Hold", numberOfAnalystsLatest: "1" },
    ],
  });
  assert.equal(snap.price.nse, 110);
  assert.equal(snap.valuation.peTTM, 20);
  assert.equal(snap.range.distanceFrom52wHigh, "-45.0%");
  assert.equal(snap.technicals.trendSummary, "Price is above 1 of 2 moving averages");
  assert.equal(snap.analystConsensus.totalAnalysts, 4);
});
