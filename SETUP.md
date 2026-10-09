# Connecting your Trading 212 account

The Portfolio page reads your account through three small functions in the `api/` folder. They run on Vercel and keep your keys private. Visitors need your access code before they get any data.

## 1. Create the Trading 212 key

In Trading 212: Settings, then API (Beta), then Generate API key.

- Access: choose **Unrestricted**. Vercel does not use a fixed IP address, so "trusted IPs only" would block it. The key is safe because it is stored only as a Vercel secret and you will give it read permissions only.
- Permissions: switch on **Account data** and the portfolio or positions read permission if it is listed lower in the list. Leave everything that places orders, executes orders or edits pies switched off. History is not needed.
- Copy the key and the secret when they are shown. Trading 212 shows the secret once.

## 2. Get the price and news keys

- [Twelve Data](https://twelvedata.com): free key for price history.
- [Finnhub](https://finnhub.io): free key for company news.

## 3. Deploy on Vercel

1. In Vercel choose Add New, then Project, and import the `website` repository from GitHub.
2. Leave the framework preset as Other. No build command is needed.
3. Before deploying, open Environment Variables and add:

   | Name | Value |
   |---|---|
   | `T212_API_KEY` | your Trading 212 key |
   | `T212_API_SECRET` | your Trading 212 secret |
   | `TWELVEDATA_KEY` | your Twelve Data key |
   | `FINNHUB_KEY` | your Finnhub key |
   | `ACCESS_CODE` | a long password you will type on the Portfolio page |

4. Deploy.

## 4. Open the Portfolio page

`js/config.js` already has `live: true`. Once the environment variables are set and the site is deployed, open `/portfolio.html`, enter your access code, and your account balance, holdings and prices appear. Prices refresh every 30 seconds. Set `live: false` to show sample data instead.

## Notes

- Trading 212 allows 1 positions request per second. The functions cache responses briefly.
- Twelve Data's free plan allows 8 requests a minute and 800 a day.
- Shares not listed in the US may need an entry in the optional `SYMBOL_MAP` variable, for example `{"VOD_EQ":"VOD.LON"}`.
- To use the demo Trading 212 account instead of your live one, add `T212_BASE` with the value `https://demo.trading212.com/api/v0`.
