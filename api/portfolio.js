// GET /api/portfolio  ->  open positions and the account summary from Trading 212
const { guard, toSymbol, parseMap } = require("./_lib");

module.exports = guard(async function () {
  const env = process.env;
  const base = env.T212_BASE || "https://live.trading212.com/api/v0";
  const headers = {
    Authorization: "Basic " + Buffer.from(env.T212_API_KEY + ":" + env.T212_API_SECRET).toString("base64")
  };

  const [posRes, sumRes] = await Promise.all([
    fetch(base + "/equity/positions", { headers: headers }),
    fetch(base + "/equity/account/summary", { headers: headers })
  ]);
  if (!posRes.ok) throw new Error("Trading 212 returned " + posRes.status + " for positions");
  const rows = await posRes.json();
  // The summary is rate limited to 1 request every 5 seconds. If it is missing,
  // the page works out totals from the positions instead.
  const summary = sumRes.ok ? await sumRes.json() : null;

  const overrides = parseMap(env.SYMBOL_MAP);
  let currency = (summary && summary.currency) || "GBP";
  const positions = rows.map(function (r) {
    const ticker = r.instrument.ticker;
    const w = r.walletImpact || {};
    if (!summary && w.currency) currency = w.currency;
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

  const account = { currency: currency };
  if (summary) {
    account.totalValue = summary.totalValue;
    account.cash = summary.cash;
    account.investments = summary.investments;
  }
  return { account: account, positions: positions };
}, 10);
