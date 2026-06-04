# @veronica/contracts

Shared **zod schemas** and inferred **TypeScript types** that define the contract between the Veronica API (`@veronica/api`) and the web client (`veronica-web`).

This is the single source of truth for request/response shapes. The API validates its responses against these schemas before sending; the frontend installs this package and uses the same schemas to type its API calls (and to drive MSW mocks).

## Stability

**v1.0.0 (2026-05-31) — stable.** This is the v1 release. From here on the public schema surface follows semver:

- **Major** (`2.0.0`) — a breaking change: removing/renaming a field, tightening a type, or making an optional field required.
- **Minor** (`1.1.0`) — additive, backward-compatible: a new schema or a new **optional** field.
- **Patch** (`1.0.1`) — docs / internal refactors with no shape change.

Every breaking change needs a major bump **and** a heads-up to the FE intern in `#veronica-dev` before publishing.

### Stable public surface

- **Catalog** — `Category*`, `Product*`, `Sku*`, `ProductListItem*`
- **Home / settings** — `Home*`, `Settings*`
- **Auth** — `Auth*`, OTP request/verify, `User*`
- **Cart** — `Cart*`, add/update item requests
- **Checkout** — `ShippingAddress`, `CreateOrder*`, `VerifyOrder*`
- **Orders** — `Order*`, `OrderLine`, `OrderEvent*` (tracking timeline)
- **Pincode** — `PincodeLookup`
- **SEO** — `ProductStructuredData` (schema.org/Product JSON-LD)
- **Common** — `Id`, `Slug`, `Url`, `Price`, `Timestamp`

## Usage

```ts
import { CategorySchema, type Category } from "@veronica/contracts";

const category = CategorySchema.parse(apiResponse);
```

## Publishing

Published to GitHub Packages under the `@veronica` scope. Every schema change is a **version bump** that the frontend must install — announce it in `#veronica-dev` before publishing.

```bash
pnpm --filter @veronica/contracts build
pnpm --filter @veronica/contracts publish --access restricted --no-git-checks
```
