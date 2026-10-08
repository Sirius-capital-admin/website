// GET /api/portfolio  ->  open positions from Trading 212
const { guard, toSymbol, parseMap } = require("./_lib");

module.exports = guard(async function () {
  const env = process.env;
  const base = env.T212_BASE || "https://live.trading212.com/api/v0";
  const auth = "Basic " + Buffer.from(env.T212_API_KEY + ":" + env.T212_API_SECRET).toString("base64");

  const res = await fetch(base + "/equity/positions", { headers: { Authorization: auth } });
  if (!res.ok) throw new Error("Trading 212 returned " + res.status);
  const rows = await res.json();
  const overrides = parseMap(env.SYMBOL_MAP);

  let currency = "GBP";
  const positions = rows.map(function (r) {
    const ticker = r.instrument.ticker;
    const w = r.walletImpact || {};
    if (w.currency) currency = w.currency;
    return {
      ticker: ticker,
      symbol: overrides[ticker] || toSymbol(ticker),
      name: r.instrument.name,
      currency: r.instrument.currency,
      quantity: r.quantity,
      avgPrice: r.averagePricePaid,
      price: r.currentPrice,
      cost: w.totalCost,
      value: w.currentValue,
      pnl: w.unrealizedProfitLoss
    };
  });
  return { account: { currency: currency }, positions: positions };
}, 30);
