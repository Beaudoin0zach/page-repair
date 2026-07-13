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
| `GET /v1/balance` | `Bearer <customer token>` | Remaining credits; free (backs the options page's readout and "Test token") |
| `POST /admin/tokens?credits=N&note=...` | `Bearer <ADMIN_SECRET>` | Mint a customer token with a starting balance (token returned once, stored hashed) |
| `POST /admin/credits` `{token, add}` | `Bearer <ADMIN_SECRET>` | Top up an existing token |

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

Give the `prt_...` token to the extension's options page ("Prepaid
credits"). The worker URL is baked into the extension.

## Local dev

`.dev.vars` (gitignored) provides placeholder secrets. `npm run dev`, then:

```sh
curl -X POST "http://localhost:8787/admin/tokens" -H "Authorization: Bearer local-dev-admin-secret"
```

`npm run check` regenerates `Env` types and typechecks.

## Design notes

- Tokens are stored as SHA-256 hashes; the plaintext exists only in the
  201 response. Admin auth is compared timing-safely.
- Balances live in KV (`credits:<hash>`). The credit is spent *before* the
  Anthropic call and refunded on failure, so the double-spend race window is
  one KV round-trip rather than a whole model call. KV still has no atomic
  decrement — concurrent requests can occasionally over- or under-count,
  erring in the customer's favor; move to D1 or a Durable Object if hard
  enforcement ever matters.
- Every `context` field a client sends is whitelisted and length-capped
  server-side before it reaches the prompt, and the body cap is enforced on
  actual bytes — a hostile client can't inflate token spend past ~1 page.
- Model is `claude-haiku-4-5` by default (the ~$0.01/page economics the
  pricing is built on); set `MODEL=claude-opus-4-8` for maximum label
  quality.
