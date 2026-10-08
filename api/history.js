// GET /api/history?symbol=AMD&range=1M  ->  price history from Twelve Data
const { guard, RANGES, cleanSymbol } = require("./_lib");

module.exports = guard(async function (req) {
  const symbol = cleanSymbol(req.query.symbol);
  const cfg = RANGES[req.query.range] || RANGES["1M"];

  const api = new URL("https://api.twelvedata.com/time_series");
  api.searchParams.set("symbol", symbol);
  api.searchParams.set("interval", cfg.interval);
  api.searchParams.set("outputsize", String(cfg.size));
  api.searchParams.set("apikey", process.env.TWELVEDATA_KEY);

  const res = await fetch(api);
  const data = await res.json();
  if (data.status === "error" || !data.values) throw new Error(data.message || "No price data");

  const points = data.values
    .map(function (v) { return { t: Date.parse(v.datetime.replace(" ", "T") + "Z"), c: Number(v.close) }; })
    .reverse();
  return { symbol: symbol, currency: data.meta && data.meta.currency, points: points };
}, 120);
