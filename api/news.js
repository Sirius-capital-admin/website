// GET /api/news?symbol=AMD  ->  recent company news from Finnhub
const { guard, cleanSymbol } = require("./_lib");

module.exports = guard(async function (req) {
  const symbol = cleanSymbol(req.query.symbol);
  const day = function (d) { return d.toISOString().slice(0, 10); };

  const api = new URL("https://finnhub.io/api/v1/company-news");
  api.searchParams.set("symbol", symbol);
  api.searchParams.set("from", day(new Date(Date.now() - 14 * 864e5)));
  api.searchParams.set("to", day(new Date()));
  api.searchParams.set("token", process.env.FINNHUB_KEY);

  const res = await fetch(api);
  if (!res.ok) throw new Error("Finnhub returned " + res.status);
  const items = (await res.json()).slice(0, 10).map(function (n) {
    return { headline: n.headline, source: n.source, url: n.url, datetime: n.datetime };
  });
  return { items: items };
}, 600);
