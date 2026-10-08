// Sirius Capital portfolio proxy (Cloudflare Worker).
//
// Why this exists: your Trading 212 key can place and cancel orders if you give it
// those permissions, and anything in a web page is visible to every visitor.
// The key therefore lives here, as an encrypted secret, and the page only talks
// to this proxy. Visitors need the access code before they get any data.
//
// Routes (all need the X-Access-Code header):
//   GET /api/portfolio              open positions from Trading 212
//   GET /api/history?symbol&range   price history from Twelve Data
//   GET /api/news?symbol            company news from Finnhub

const RANGES = {
  "1D": { interval: "5min", size: 78 },
  "1W": { interval: "30min", size: 70 },
  "1M": { interval: "1day", size: 22 },
  "3M": { interval: "1day", size: 66 },
  "1Y": { interval: "1day", size: 252 },
  "5Y": { interval: "1week", size: 260 }
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, cors);

    if (!(await codeIsValid(request.headers.get("X-Access-Code"), env.ACCESS_CODE))) {
      return json({ error: "Unauthorised" }, 401, cors);
    }

    try {
      if (url.pathname === "/api/portfolio") return json(await portfolio(env), 200, cors, 30);
      if (url.pathname === "/api/history") return json(await history(url, env), 200, cors, 120);
      if (url.pathname === "/api/news") return json(await news(url, env), 200, cors, 600);
      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      return json({ error: String(err.message || err) }, 502, cors);
    }
  }
};

/* ---------- Trading 212 ---------- */

async function portfolio(env) {
  const base = env.T212_BASE || "https://live.trading212.com/api/v0";
  const auth = "Basic " + btoa(env.T212_API_KEY + ":" + env.T212_API_SECRET);
  const res = await fetch(base + "/equity/positions", { headers: { Authorization: auth } });
  if (!res.ok) throw new Error("Trading 212 returned " + res.status);
  const rows = await res.json();
  const overrides = parseMap(env.SYMBOL_MAP);

  let currency = "GBP";
  const positions = rows.map((r) => {
    const ticker = r.instrument.ticker;
    const w = r.walletImpact || {};
    if (w.currency) currency = w.currency;
    return {
      ticker,
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
  return { account: { currency }, positions };
}

// "AMD_US_EQ" -> "AMD". Other exchanges often need an entry in SYMBOL_MAP.
function toSymbol(ticker) {
  const us = ticker.match(/^([A-Z0-9.]+?)_US_EQ$/);
  if (us) return us[1];
  return ticker.split("_")[0].replace(/[a-z]+$/, "");
}

function parseMap(text) {
  try { return text ? JSON.parse(text) : {}; } catch (e) { return {}; }
}

/* ---------- Twelve Data ---------- */

async function history(url, env) {
  const symbol = cleanSymbol(url.searchParams.get("symbol"));
  const cfg = RANGES[url.searchParams.get("range")] || RANGES["1M"];
  const api = new URL("https://api.twelvedata.com/time_series");
  api.searchParams.set("symbol", symbol);
  api.searchParams.set("interval", cfg.interval);
  api.searchParams.set("outputsize", String(cfg.size));
  api.searchParams.set("apikey", env.TWELVEDATA_KEY);
  const res = await fetch(api);
  const data = await res.json();
  if (data.status === "error" || !data.values) throw new Error(data.message || "No price data");
  const points = data.values
    .map((v) => ({ t: Date.parse(v.datetime.replace(" ", "T") + "Z"), c: Number(v.close) }))
    .reverse();
  return { symbol, currency: data.meta && data.meta.currency, points };
}

/* ---------- Finnhub ---------- */

async function news(url, env) {
  const symbol = cleanSymbol(url.searchParams.get("symbol"));
  const to = new Date();
  const from = new Date(Date.now() - 14 * 864e5);
  const day = (d) => d.toISOString().slice(0, 10);
  const api = new URL("https://finnhub.io/api/v1/company-news");
  api.searchParams.set("symbol", symbol);
  api.searchParams.set("from", day(from));
  api.searchParams.set("to", day(to));
  api.searchParams.set("token", env.FINNHUB_KEY);
  const res = await fetch(api);
  if (!res.ok) throw new Error("Finnhub returned " + res.status);
  const items = (await res.json()).slice(0, 10).map((n) => ({
    headline: n.headline, source: n.source, url: n.url, datetime: n.datetime
  }));
  return { items };
}

/* ---------- helpers ---------- */

function cleanSymbol(s) {
  const v = String(s || "").toUpperCase();
  if (!/^[A-Z0-9.:-]{1,20}$/.test(v)) throw new Error("Invalid symbol");
  return v;
}

async function codeIsValid(given, expected) {
  if (!given || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected))
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGIN;
  const h = {
    "Access-Control-Allow-Headers": "X-Access-Code",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin"
  };
  if (origin && allowed && origin === allowed) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(body, status, cors, maxAge) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign(
      { "Content-Type": "application/json", "Cache-Control": maxAge ? "private, max-age=" + maxAge : "no-store" },
      cors
    )
  });
}
