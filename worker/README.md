# Portfolio proxy

This small Cloudflare Worker connects the Portfolio page to Trading 212, Twelve Data (prices) and Finnhub (news). It keeps your keys private and asks visitors for an access code.

## Set up

1. Create a Trading 212 API key: in the app, go to Settings, then API. Give it **read-only** permissions for account data and positions. It does not need to place orders.
2. Create free keys at [Twelve Data](https://twelvedata.com) and [Finnhub](https://finnhub.io).
3. Install Wrangler and sign in:

   ```
   npm install -g wrangler
   wrangler login
   ```

4. From this folder, store each secret. Wrangler prompts for the value so it never appears in a file or in chat:

   ```
   wrangler secret put T212_API_KEY
   wrangler secret put T212_API_SECRET
   wrangler secret put TWELVEDATA_KEY
   wrangler secret put FINNHUB_KEY
   wrangler secret put ACCESS_CODE
   ```

   `ACCESS_CODE` is the password you will type on the Portfolio page. Choose a long one.

5. Set `ALLOWED_ORIGIN` in `wrangler.toml` to the address of your website, then deploy:

   ```
   wrangler deploy
   ```

6. Copy the address Wrangler prints (it ends in `workers.dev`) into `js/config.js` as `apiBase`, then commit and push.

## Notes

- Trading 212 limits positions requests to 1 per second, so the proxy caches responses briefly.
- Twelve Data's free plan allows 8 requests a minute and 800 a day. Each chart range you open for a stock uses one request.
- Shares that are not listed in the US may need an entry in `SYMBOL_MAP` so the proxy knows which symbol to look up.
- Trading 212 reports prices in each share's own currency and values in your account currency. The page shows both as received.
