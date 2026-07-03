# Page Repair proxy

Cloudflare Worker backing the extension's prepaid-credits ("pay to use")
mode. Holds the real Anthropic API key server-side, authenticates customers
by token, spends 1 credit per labeling request, and builds the labeling
prompt itself — so a leaked token can only spend its own credits on control
labeling, never arbitrary API calls.

**Billing model: prepaid credits, no subscription.** 1 credit = 1 page
repair (up to 40 controls). Customers top up when they run out; nothing
renews on its own. At ~$0.01/page API cost, "100 credits for $3" keeps the
margin while staying inside what the price-sensitive AT community tolerates.

## Endpoints

| Route | Auth | Purpose |
|---|---|---|
| `POST /v1/label` | `Bearer <customer token>` | Label unnamed controls; spends 1 credit; 402 when balance is 0 |
| `POST /admin/tokens?credits=N&note=...` | `Bearer <ADMIN_SECRET>` | Mint a customer token with a starting balance (token returned once, stored hashed) |
| `POST /admin/credits` `{token, add}` | `Bearer <ADMIN_SECRET>` | Top up an existing token |
| `POST /webhooks/stripe` | — | Stub (501); will handle one-time payments (new token or top-up via checkout metadata) |

## Deploy

```sh
cd proxy
npm install
npx wrangler kv namespace create TOKENS   # paste the id into wrangler.jsonc
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ADMIN_SECRET
npm run deploy
```

Mint a customer token (default starting balance comes from
`DEFAULT_STARTING_CREDITS`; override with `?credits=N`):

```sh
curl -X POST "https://page-repair-proxy.<subdomain>.workers.dev/admin/tokens?credits=100&note=zach" \
  -H "Authorization: Bearer $ADMIN_SECRET"
```

Top up later:

```sh
curl -X POST "https://page-repair-proxy.<subdomain>.workers.dev/admin/credits" \
  -H "Authorization: Bearer $ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"token": "prt_...", "add": 100}'
```

Give the `prt_...` token + the worker URL to the extension's options page
(Option B).

## Local dev

`.dev.vars` (gitignored) provides placeholder secrets. `npm run dev`, then:

```sh
curl -X POST "http://localhost:8787/admin/tokens" -H "Authorization: Bearer local-dev-admin-secret"
```

`npm run check` regenerates `Env` types and typechecks.

## Design notes

- Tokens are stored as SHA-256 hashes; the plaintext exists only in the
  201 response. Admin auth is compared timing-safely.
- Balances live in KV (`credits:<hash>`). KV is eventually consistent, so a
  racing pair of requests can occasionally spend one credit twice — errs in
  the customer's favor; move to D1 if hard enforcement ever matters.
- Model is `claude-haiku-4-5` by default (the ~$0.01/page economics the
  pricing is built on); set `MODEL=claude-opus-4-8` for maximum label
  quality.
- Stripe flow when enabled (one-time payments only, no subscription
  lifecycle): `checkout.session.completed` with no token in metadata →
  mint a token with the purchased credits and deliver it on the success
  page; with a token in metadata → top up that balance.
