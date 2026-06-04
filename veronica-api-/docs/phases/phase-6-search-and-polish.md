# Phase 6 (Backend) — Search + Polish

## What you'll build

The final pass before "v1 done": evaluate whether Postgres FTS is enough or if we need Meilisearch, expose sitemap data for the frontend, add a pincode lookup endpoint for shipping address autofill, and ship helpers for SEO structured data.

This phase is intentionally lighter on prescription — each task is "evaluate, then implement". Use Ketan's input on the open questions.

## Prerequisites

- [ ] Phase 5 (Backend) complete — caching and observability in production
- [ ] Catalog has at least 50 SKUs to measure search behavior against
- [ ] [TODO confirm with Ketan] How important is typo-tolerance? If "must work great for misspellings", we go Meilisearch.

## Success criteria

- Search returns sensible results for typos like "snik" → "sink", "facuet" → "faucet" (current Postgres FTS does not do this)
- Sitemap and robots data exposed for Next.js to consume
- Order tracking endpoint returns shipping status (manual updates by admin for now)
- Pincode → city/state autofill works for Indian postal codes
- `@veronica/contracts@1.0.0` — finally a 1.0 release

## Estimated effort

1-2 sessions (~4-5 hours).

---

## Task 6.1 — Evaluate Meilisearch vs Postgres FTS

**Context**: Postgres FTS is fine for exact-ish matches. Meilisearch is the open-source typo-tolerant alternative — self-host on Fly.io for ~$5/mo.

**What to do**:

1. Run a query benchmark against current Postgres FTS:
   - 20 real customer searches (from analytics if available, otherwise synthetic: "sink", "facuet", "rustproof", "kichen", "drain", typos and variants)
   - Note: how many return relevant results, how many return nothing

2. If ≥ 80% return relevant results → stay on Postgres FTS, skip to Task 6.2.

3. If < 80% → spin up Meilisearch on Fly.io as Task 6.1b.

**Suggested Claude Code prompt** (for the benchmark):
> Run a benchmark script:
> 1. Define an array of 20 search queries (mix of correct, common typos, partial words)
> 2. For each, GET /search?q=...
> 3. For each, log: query, result count, top 3 names
> 4. Output a markdown table I can review
>
> Don't make any code changes yet — just measure.

**Acceptance criteria**:
- [x] Benchmark script delivered (`apps/api/scripts/search-benchmark.ts`, `pnpm search:benchmark`)
- [x] Decision made: **Postgres FTS** (see below)
- [x] Commit: `chore(phase-6): search benchmark`

**Decision (2026-05-31): stay on Postgres FTS for v1.**
Per Ketan, typo-tolerance is not a current pain point, and the doc calls this
choice reversible. Meilisearch (Task 6.1b) is deferred — the integration is not
built. Run `pnpm search:benchmark` against a seeded staging DB (≥50 SKUs); if
< 80% of the queries return results (typos like `snik`/`facuet` will likely
miss), revisit and implement 6.1b then.

---

## Task 6.1b — Meilisearch setup (if needed)

**Context**: Only if Task 6.1 decided Meilisearch.

**Files to touch**:
- `apps/api/src/lib/meili.ts` (new)
- `apps/api/scripts/index-meili.ts` (new)
- `apps/api/src/routes/products.ts` — swap `/search` handler
- `fly.toml` or wrangler — add MEILI_HOST + MEILI_API_KEY env

**Suggested Claude Code prompt**:
> Add Meilisearch.
>
> 1. Deploy Meilisearch on Fly.io in Mumbai region. Use the official Meilisearch Docker image. Set master key via `fly secrets set MEILI_MASTER_KEY=...`. Document the URL once deployed.
>
> 2. Env: `MEILI_HOST`, `MEILI_API_KEY` (use a search-only key, not the master key).
>
> 3. Create `apps/api/src/lib/meili.ts` — initialize MeiliSearch client.
>
> 4. Create `apps/api/scripts/index-meili.ts`:
>    - Read all active products from Postgres
>    - Push to Meili `products` index with searchable fields: name, tags (joined), description
>    - Configure: typo tolerance, prefix matching, ranking rules
>    - Make idempotent: replace the whole index on each run
>
> 5. Replace `/search` handler in `apps/api/src/routes/products.ts`:
>    - Query Meilisearch instead of Postgres FTS
>    - Return same shape as before (ProductListItem array)
>
> 6. On admin product create/update/delete, also update the Meili index (via `index.addDocuments` / `index.deleteDocument`).
>
> 7. `pnpm db:seed` → also runs `index-meili.ts`.

**Verification commands**:
```bash
pnpm tsx apps/api/scripts/index-meili.ts
# Then:
curl http://localhost:8787/search?q=snik
# Should now return sink products (typo tolerance)

curl http://localhost:8787/search?q=facuet
# Should return faucet products
```

**Acceptance criteria**:
- [ ] Meilisearch deployed
- [ ] Indexing works
- [ ] Search returns typo-tolerant results
- [ ] Admin mutations re-index
- [ ] Commit: `feat(phase-6): replace Postgres FTS with Meilisearch`

---

## Task 6.2 — Pincode → city/state autofill endpoint

**Context**: Indian customers expect the address form to autofill city/state when they enter a pincode. Use India Post's free API (https://api.postalpincode.in).

**Files to touch**:
- `apps/api/src/routes/pincode.ts` (new)
- Cache results (pincodes don't change)

**Suggested Claude Code prompt**:
> Add `GET /pincode/:pincode` (no auth — public read).
>
> 1. Validate pincode format (6 digits).
> 2. Check Redis cache `pincode:${pincode}` first — TTL 30 days.
> 3. On miss: call https://api.postalpincode.in/pincode/${pincode}. Their response is an array with PostOffice info.
> 4. Extract: city (use `District` or first PostOffice's `Name`), state, country.
> 5. Cache the result.
> 6. Return `{ city, state, country, pincode }` or 404 if not found.
>
> Tests: valid pincode, invalid format, unknown pincode, caching works.

**Verification commands**:
```bash
curl http://localhost:8787/pincode/110061
# Expect: { city: "New Delhi", state: "Delhi", country: "India", pincode: "110061" }

curl http://localhost:8787/pincode/123
# Expect: 400 (invalid format)

curl http://localhost:8787/pincode/999999
# Expect: 404
```

**Acceptance criteria**:
- [ ] Pincode lookup works
- [ ] Results cached for 30 days
- [ ] Invalid input handled
- [ ] Tests pass
- [ ] Commit: `feat(phase-6): pincode autofill endpoint`

---

## Task 6.3 — Order tracking endpoint

**Context**: Customers want to know "where's my order". For v1, this is just the status + a couple of timestamps. Real carrier tracking comes later.

**Files to touch**:
- `apps/api/src/routes/me.ts` — extend
- Schema: add `tracking_events` jsonb column to orders, OR a separate `order_events` table
- Admin order detail page can add new events

**Suggested Claude Code prompt**:
> Add a simple tracking timeline.
>
> 1. Schema: add a new table `order_events`:
>    - id, order_id (FK → orders), event_type (text — 'placed'|'paid'|'confirmed'|'shipped'|'out_for_delivery'|'delivered'|'cancelled'|'note'), note (text, optional), created_at, created_by (uuid → users for admin events).
>
> 2. Backfill: on every order status transition (in admin order PATCH handler), also insert an `order_events` row.
>
> 3. `GET /me/orders/:orderNumber/events` — return chronological event list.
>
> 4. Admin endpoint: `POST /admin/orders/:id/events` — add a custom note ("Out for delivery via Bluedart, tracking AWB#XXX").

**Acceptance criteria**:
- [ ] Order events table + endpoints work
- [ ] Status transitions auto-log events
- [ ] Admin can add custom notes
- [ ] Commit: `feat(phase-6): order tracking timeline`

---

## Task 6.4 — SEO structured data helpers

**Context**: Frontend will render JSON-LD on product pages (schema.org/Product). Backend just needs to expose the data shape.

**Files to touch**:
- `packages/contracts/src/seo.ts` (new)

**Suggested Claude Code prompt**:
> In `packages/contracts/src/seo.ts`, define:
> - `ProductStructuredDataSchema` — matches schema.org/Product JSON-LD shape with name, image, description, brand, sku, offers (price, priceCurrency: INR, availability)
>
> Add a helper in `apps/api/src/routes/products.ts` GET /products/:slug that includes a `structuredData` field in the response with this shape pre-computed. Saves the FE the work of constructing it.

**Acceptance criteria**:
- [ ] Schema defined in contracts
- [ ] Product detail response includes `structuredData`
- [ ] Commit: `feat(phase-6): structured data on product responses`

---

## Task 6.5 — Bump and publish `@veronica/contracts@1.0.0`

**Suggested Claude Code prompt**:
> This is the v1 release of the contracts. Bump from `0.4.x` to `1.0.0`. From now on, breaking changes require a major bump.
>
> Update the contracts README with a "Stability" section noting this. Document the public API surface that's now stable.

**Acceptance criteria**:
- [ ] `@veronica/contracts@1.0.0` published
- [ ] Tag pushed
- [ ] Commit: `chore: release contracts v1.0.0`

---

## Common pitfalls across this phase

- **Meilisearch decision is reversible.** Don't agonize. If Postgres FTS is "fine but not amazing", stay there for now. Switch later if/when search becomes a complaint.
- **Pincode API rate limits**: india.gov.in's API doesn't publish formal limits but is known to throttle aggressive callers. Cache aggressively.
- **`structuredData` in responses**: don't include for unauthenticated users in `/me/*` responses (it's product-specific).

## What's next

**v1 is done.** Time to:
- Drive real traffic
- Monitor Sentry + Axiom
- Triage real customer issues
- Plan v1.5 (returns/RMA, discounts, wishlists, abandoned cart)

Move planning into a new doc set: `docs/v1.5-plan.md`.
