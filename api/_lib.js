// Shared helpers for the portfolio API (Vercel serverless functions).
// Files starting with an underscore are not exposed as routes.
//
// Your keys live in Vercel environment variables, never in the web page:
//   T212_API_KEY, T212_API_SECRET, TWELVEDATA_KEY, FINNHUB_KEY, ACCESS_CODE
// Optional: SYMBOL_MAP (JSON), T212_BASE

const crypto = require("crypto");

const RANGES = {
  "1D": { interval: "5min", size: 78 },
  "1W": { interval: "30min", size: 70 },
  "1M": { interval: "1day", size: 22 },
  "3M": { interval: "1day", size: 66 },
  "1Y": { interval: "1day", size: 252 },
  "5Y": { interval: "1week", size: 260 }
};

function sha(s) {
  return crypto.createHash("sha256").update(String(s)).digest();
}

function codeIsValid(given, expected) {
  if (!given || !expected) return false;
  return crypto.timingSafeEqual(sha(given), sha(expected));
}

// Wraps a handler: GET only, access code required, errors returned as JSON.
function guard(handler, maxAge) {
  return async function (req, res) {
    res.setHeader("Cache-Control", maxAge ? "private, max-age=" + maxAge : "no-store");
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    if (!codeIsValid(req.headers["x-access-code"], process.env.ACCESS_CODE)) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(401).json({ error: "Unauthorised" });
    }
    try {
      const body = await handler(req);
      return res.status(200).json(body);
    } catch (err) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(502).json({ error: String((err && err.message) || err) });
    }
  };
}

function cleanSymbol(s) {
  const v = String(s || "").toUpperCase();
  if (!/^[A-Z0-9.:-]{1,20}$/.test(v)) throw new Error("Invalid symbol");
  return v;
}

// "AMD_US_EQ" -> "AMD". Other exchanges may need an entry in SYMBOL_MAP.
function toSymbol(ticker) {
  const us = ticker.match(/^([A-Z0-9.]+?)_US_EQ$/);
  if (us) return us[1];
  return ticker.split("_")[0].replace(/[a-z]+$/, "");
}

function parseMap(text) {
  try { return text ? JSON.parse(text) : {}; } catch (e) { return {}; }
}

module.exports = { RANGES, codeIsValid, guard, cleanSymbol, toSymbol, parseMap };
