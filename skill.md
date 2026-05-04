# qa-automation — Skill / Context Primer

> Auto-loaded by Claude in every new session for this repo. Doubles as the
> canonical README — there is no separate `README.md`. Keep the "Quick
> Reference" block at the bottom in sync if commands or paths change.

---

## Purpose

Standalone Playwright test suite that exercises the full Fintech Gateway
platform end-to-end through its public surface (nginx → backend services).
It is **not** a per-service unit test repo. The same suite runs in two
modes:

1. **CI gate** — `qa-gate.yml` spins up the entire backend stack via
   `docker-compose.ci.yml` against a per-PR Postgres, runs the `smoke`
   project, and blocks the calling service's deploy if anything fails.
2. **Live regression** — pointed at `https://findev.qpaymentz.com` (dev) or
   `https://finstage.qpaymentz.com` (stage) by overriding `BASE_URL`. Used
   to catch contract drift after a service deploys.

The suite covers all backend services in the platform: **auth, dashboard,
products, sendpayment, receivepayment, sync, POS**. Tests are written
API-first (faster, more deterministic) and only use the browser when the
behaviour under test is genuinely UI-only (PO list icon rendering, vendor
dedup banner, low-threshold filter toggle).

After every run a `globalTeardown` purges any QA-prefixed fixtures the
suite created, so dev/stage data never accumulates. See **Cleanup System**
below.

---

## Tech Stack

| | |
| --- | --- |
| Runtime | Node 22 (CI), any 20+ locally |
| Test runner | `@playwright/test` ^1.50 |
| Language | TypeScript 5.7 (strict) |
| CLI scripts | `tsx` (for `scripts/cleanup-qa-data.ts`) |
| Package manager | npm (lockfile is `package-lock.json`) |

The repo deliberately has **no app code** — just tests, helpers, fixtures,
and a CI compose file. See `package.json` for the full dependency list.

---

## Architecture

### Top-level layout

```
qa-automation/
├── playwright.config.ts        # 2 projects: smoke + chromium
├── globalTeardown.ts           # auto-purges QA fixtures after every run
├── docker-compose.ci.yml       # full stack used by qa-gate workflow
├── scripts/
│   └── cleanup-qa-data.ts      # CLI wrapper around src/lib/cleanup.ts
├── src/
│   ├── fixtures/auth.fixture.ts      # authenticatedPage + apiClient
│   ├── helpers/
│   │   ├── api-client.ts             # ApiClient wrapper over nginx paths
│   │   ├── constants.ts              # API_PATHS, HEALTH_ENDPOINTS, APP_ROUTES
│   │   └── test-data.ts              # qaPayee / qaCustomer / qaPurchaseOrder …
│   ├── lib/cleanup.ts                # shared cleanup engine (CLI + teardown)
│   ├── pages/                        # Playwright POMs (login, home, …)
│   └── tests/
│       ├── smoke/                    # health-checks, login, page-loads
│       ├── location-scoping.spec.ts
│       ├── purchase-orders.spec.ts
│       ├── po-low-threshold-vendor.spec.ts
│       ├── po-resend-icon-screenshot.spec.ts
│       └── vendor-dedup-ui.spec.ts
└── .github/workflows/
    ├── qa-gate.yml                   # called by service repos pre-deploy
    ├── pr-validation.yml
    └── full-regression.yml
```

### `playwright.config.ts`

- `testDir: ./src/tests`
- `globalTeardown: ./globalTeardown.ts` — runs even on test failure
- `fullyParallel: false`, `workers: 1` — the suite shares one tenant DB
  and seeds named fixtures, so parallelism would race
- `retries: 2` in CI, `0` locally
- Two projects:
  - **`smoke`** — `testMatch: /smoke\/.*/`, 30 s timeout. This is what the
    CI gate runs (`npm run test:smoke`).
  - **`chromium`** — `testIgnore: /smoke\/.*/`, the regression set.
- `baseURL` defaults to `http://localhost:8080` (CI nginx) and is
  overridden by `BASE_URL` for live runs.

### `globalTeardown.ts`

Builds a fresh `request` context, logs in with `TEST_USER_EMAIL` /
`TEST_USER_PASSWORD`, calls `cleanupQaData(...)` from `src/lib/cleanup.ts`,
and disposes the context. Errors are logged but **non-fatal** — a hiccup
during cleanup must never mask a real test result. Bypass with
`CLEANUP=skip` when you want to inspect leftover state.

### `src/fixtures/auth.fixture.ts`

Extends `@playwright/test` with two fixtures:

- **`authenticatedPage`** — a `Page` whose `BrowserContext` already has
  auth cookies set by a `POST /auth-api/v1/auth/login` (faster than UI
  login and avoids the rate-limited login form).
- **`apiClient`** — an `ApiClient` (see below) bound to a fresh
  `APIRequestContext` that has been logged in. Used by every API-level
  spec.

`TEST_CREDENTIALS` come from `src/helpers/constants.ts` and default to
`admin@fintech.dev` / `admin123` (the seeded owner from the auth
migration).

### `src/helpers/api-client.ts`

Thin typed wrapper over `APIRequestContext` that exposes one method per
endpoint the suite uses, organised by service. All paths go through the
nginx proxy prefixes from `API_PATHS`, so the same `ApiClient` works
identically against CI compose and live dev/stage.

---

## Test Suites

### Smoke (`src/tests/smoke/`, project = `smoke`)

| File | Coverage |
| --- | --- |
| `health-checks.spec.ts` | Iterates `HEALTH_ENDPOINTS` (Auth, Dashboard, SendPayment, ReceivePayment, Products) and asserts each `/health` returns `{status:"ok"}` and responds in < 5 s. |
| `login.spec.ts` | Login page renders; valid credentials redirect to `#/`; `POST /auth-api/v1/auth/login` sets cookies and returns the user; `GET /auth/me` works with those cookies; invalid credentials surface an error. |
| `page-loads.spec.ts` | Home page shows dashboard cards; every route in `APP_ROUTES` (Home, Users, Settings, Receive Payments, Reports) renders without console errors and has visible content; sidebar nav links exist. |

These are the only specs executed by the CI gate (`npm run test:smoke`).

### Regression (project = `chromium`)

| File | Coverage |
| --- | --- |
| `location-scoping.spec.ts` | API contract: `?locationId=` filter on SendPayment payments, ReceivePayment invoices + payments, and Users. Verifies records carry `locationId`, that a non-existent ID returns empty, that a record created with `locationId=X` is found under that filter and not under another, and that unscoped records don't leak into a location-scoped query. The Users variant accounts for owners always bypassing the filter. |
| `purchase-orders.spec.ts` | API regressions for the four PO fixes that have a server-side surface: (#1) `/payees/:id/products` returns `reorderThreshold` + `inStockQty` so the FE low-threshold filter works; (#3) PO `resend-email` returns `NO_VENDOR_EMAIL` for vendors with no email and `200 + recipient` when the vendor has one (gated to `status=sent`); (#4) NIB warehouse PO surfaces in `/warehouse-orders`; (#6) `?status=generated` filter still returns only generated rows. |
| `po-low-threshold-vendor.spec.ts` | UI smoke: seeds vendor + product (`reorderThreshold=100`, stock 0), drives the PO create page, opens "Add Multiple", toggles "Low Threshold Products", and asserts the test product appears. Validates that the filter scopes to the selected vendor's catalog rather than every product in the system. |
| `po-resend-icon-screenshot.spec.ts` | UI smoke: seeds a sent PO, opens the PO list, asserts the `title="Re-send PO email to vendor"` Mail icon is visible (it only renders for sent POs per migration 0049), and writes screenshots to `test-results/`. |
| `vendor-dedup-ui.spec.ts` | UI smoke: seeds a vendor, opens the PO create page → Add Vendor modal, submits a new vendor with the same email, asserts the 409 amber banner shows the existing vendor's name, clicks "Use existing vendor" and confirms the Vendor `<select>` swaps to the existing record. |

Run the regression set with `npm run test:regression`.

---

## API Path Map

All requests are made against the nginx proxy paths defined in
`src/helpers/constants.ts`. The same prefixes work against the CI compose
nginx (port 8080) and the live dev/stage frontends.

| Constant | Nginx prefix | Backend service | Internal port |
| --- | --- | --- | --- |
| `API_PATHS.AUTH` | `/auth-api/v1` | auth | 3001 |
| `API_PATHS.DASHBOARD` | `/api/v1` | dashboard API | 3000 |
| `API_PATHS.SENDPAYMENT` | `/sp-api/v1` | sendpayment | 3002 |
| `API_PATHS.RECEIVEPAYMENT` | `/rp-api/v1` | receivepayment | 3003 |
| `API_PATHS.PRODUCTS` | `/products-api/v1` | products | 3004 |
| `API_PATHS.POS` | `/pos-api/v1` | POS backend | 3005 |
| (no constant) | `/sync-api/v1` (via web) | sync | 3006 |

`HEALTH_ENDPOINTS` covers Auth, Dashboard, SendPayment, ReceivePayment,
and Products (POS + sync are not currently in the smoke health loop).

---

## Test Data Factories

All factories live in `src/helpers/test-data.ts`. They share two strict
naming conventions that the cleanup engine matches against:

- **Names** start with `QA-` (or `QA ` for the funding-account holder
  field, e.g. `QA Funding abc123`).
- **Emails** match `qa-<role>-<id>@test.local`, where `<role>` is one of
  `payee`, `vendor`, `whvendor`, `customer`, or `user`.

These rules are enforced by `cleanupQaData` (regexes below) so a real
person named "QA Smith" with a real-domain email is impossible to delete
by accident.

| Factory | Returns | Cleanup match |
| --- | --- | --- |
| `qaPayee()` | `{ name:"QA-Payee-…", email:"qa-payee-…@test.local", bankName, accountType, routingNumber, accountNumber, accountHolderName }` | name `QA-` + email regex |
| `qaThirdPartyVendor()` | `{ name:"QA-Vendor-…", email:"qa-vendor-…@test.local", contactName, phone, vendorType:"third_party" }` | name `QA-` + email regex |
| `qaWarehouseVendor(linkedWarehouseId, linkedWarehouseLocationId?)` | `{ name:"QA-WarehouseVendor-…", email:"qa-whvendor-…@test.local", contactName, phone, vendorType:"warehouse", linkedWarehouseId, linkedWarehouseLocationId }` | name `QA-` + email regex |
| `qaFundingAccount(locationId)` | `{ nickname:"QA-Funding-…", bankName, accountType, routingNumber, accountNumber, accountHolderName:"QA Funding …", locationId }` | nickname prefix `QA-Funding-` + holder prefix `QA Funding ` |
| `qaCustomer()` | `{ name:"QA-Customer-…", email:"qa-customer-…@test.local", phone, company }` | name `QA-Customer-` + email regex |
| `qaProduct()` | `{ name:"QA-Product-…", description, cashPrice, cost, sku }` | not auto-cleaned (DELETE on products is soft-deactivate; QA fixtures are intentional) |
| `qaDepartment()` | `{ name:"QA-Dept-…" }` | not auto-cleaned |
| `qaUser(locationId?)` | `{ name:"QA-User-…", email:"qa-user-…@test.local", password:"QaTest123!", role:"employee", locationId? }` | email regex |
| `qaInvoice(customerId)` | `{ customerId, dueDate (today+30d), lines:[{ description:"QA Test Service", quantity:1, unitPrice:100 }] }` | cleaned transitively when its customer is purged |
| `qaPurchaseOrder({ payeeId, locationId, productId, quantity?=1, costPerUnit?=5 })` | `{ payeeId, locationId, createdByName:"QA Automation", items:[{ productId, unitOfMeasure:"each", quantity, costPerUnit }] }` | `createdByName === "QA Automation"` |

`uniqueId()` returns `Date.now().toString(36) + 4 random chars` so calls
within the same ms still produce distinct ids.

---

## Cleanup System

Implemented in **`src/lib/cleanup.ts`** (the engine), exposed via two
entry points:

1. **CLI** — `scripts/cleanup-qa-data.ts`, run via `npm run cleanup`
   (dry-run) or `npm run cleanup:execute` (actually delete).
2. **`globalTeardown.ts`** — invoked automatically by Playwright after
   every test run. Bypass with `CLEANUP=skip`.

Both paths share a single `cleanupQaData(opts)` function so behaviour is
identical.

### What it deletes

In order, with the strict prefix + email rules:

1. **Dashboard payees / vendors** (`/api/v1/payees`)
   - Match: `name` starts with `QA-` **AND** email matches
     `/^qa-(payee|vendor|whvendor)-[a-z0-9]+@test\.local$/i`
   - Delete: `DELETE /api/v1/payees/:id?hard=true` first (physically
     removes the row + the `sp_payees` mirror + `product_payees` joins);
     if that returns **409** (vendor has POs/payments) we fall back to
     soft-delete `DELETE /api/v1/payees/:id`.

2. **SendPayment funding accounts** (`/sp-api/v1/funding-accounts`)
   - Match: `nickname` starts with `QA-Funding-` **AND**
     `accountHolderName` starts with `QA Funding `
   - Delete: `DELETE /sp-api/v1/funding-accounts/:id`

3. **Purchase orders** (`/api/v1/purchase-orders`)
   - Match: `createdByName === "QA Automation"`
   - Skip terminal states (`status === 'cancelled' || 'received'`) —
     `DELETE` only accepts `draft` and `/cancel` only accepts
     `draft|sent`, so further calls just 400. Tombstone rows don't affect
     any flow.
   - Action: drafts → `DELETE /api/v1/purchase-orders/:id`; everything
     else (incl. `sent` / `generated`) → `POST /api/v1/purchase-orders/:id/cancel`
     with `{ reason: "QA cleanup" }`.

4. **Auth users** (`/auth-api/v1/users`)
   - Match: email matches `/^qa-user-[a-z0-9]+@test\.local$/i`
   - Delete: `DELETE /auth-api/v1/users/:id` via the owner-gated endpoint
     added specifically for QA cleanup.
   - **Pacing**: 250 ms between deletes; on 429, back off 2 s and retry
     once. Auth has an aggressive global rate limit (~5/s) so a big batch
     would otherwise get throttled.

5. **ReceivePayment customers** (`/rp-api/v1/customers`)
   - Match: `name` starts with `QA-Customer-` **AND** email matches
     `/^qa-customer-[a-z0-9]+@test\.local$/i`
   - Cascade: list each customer's invoices (`GET /rp-api/v1/invoices?customerId=…&limit=500`)
     and delete them with `DELETE /rp-api/v1/invoices/:id?force=true`.
     `?force=true` bypasses the "only draft can be deleted" state guard
     (necessary because the location-scoping suite creates non-draft
     invoices).
   - Delete: `DELETE /rp-api/v1/customers/:id`

### What it does NOT touch (and why)

- **Products** — `DELETE /products` is a soft-deactivate, and the
  `QA-LowThreshold-*` products created by the low-threshold UI smoke
  are intentional fixtures left for manual inspection. Cleared by hand
  if the dev DB ever gets crowded.
- **Departments** — same shape (no hard-delete endpoint), volume is low.
- **Sync / POS data** — not seeded by this suite.

### Result shape

`cleanupQaData` returns:

```ts
{
  payees:          { matched, deleted, failed },
  fundingAccounts: { matched, deleted, failed },
  purchaseOrders:  { matched, deleted, failed },
  users:           { matched, deleted, failed },
  customers:       { matched, deleted, failed },
  notes:           string[],   // human-readable warnings + skip reasons
}
```

The CLI prints a summary line; the teardown logs it with the `[teardown]`
prefix.

---

## Running Tests

### Local — against CI compose

```bash
docker compose -f docker-compose.ci.yml up -d
# wait for stack to be healthy (see qa-gate.yml for the exact loop)
npm ci
npx playwright install --with-deps chromium
npm run test            # full suite (smoke + regression)
npm run test:smoke      # smoke project only
npm run test:regression # regression project only
npm run test:ui         # Playwright UI mode
npm run report          # open the last HTML report
```

### Local — against live dev or stage

```bash
BASE_URL=https://findev.qpaymentz.com \
TEST_USER_EMAIL=admin@fintech.dev \
TEST_USER_PASSWORD=admin123 \
  npx playwright test po-resend-icon-screenshot
```

### Cleanup CLI

```bash
# Dry-run: list what would be deleted
BASE_URL=https://findev.qpaymentz.com npm run cleanup

# Actually delete (only after a dry-run confirms the matches)
BASE_URL=https://findev.qpaymentz.com npm run cleanup:execute
```

### Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:8080` | Where the suite points. CI compose nginx, `https://findev.qpaymentz.com`, or `https://finstage.qpaymentz.com`. |
| `TEST_USER_EMAIL` | `admin@fintech.dev` | Login for the suite + cleanup. Must be an `owner` so it can list payees/users globally and call hard-delete endpoints. |
| `TEST_USER_PASSWORD` | `admin123` | Password for the above. |
| `CLEANUP` | (unset) | Set to `skip` to bypass `globalTeardown` cleanup. |
| `CI` | (unset) | When truthy, enables `forbidOnly`, 2 retries, and the `github` reporter. |

`.env.example` carries the canonical default set.

---

## CI Integration

### `qa-gate.yml` — pre-deploy gate

Reusable workflow (`workflow_call`) called by every backend service repo's
`deploy-dev.yml` **before** EC2 deploy. Inputs: `service` (the one being
deployed) and `image-tag` (the freshly built image). Steps:

1. Checks out `qa-automation@main`.
2. Logs in to GHCR with the org `GHCR_PAT`.
3. `sed`-overrides the image tag for the deploying service in
   `docker-compose.ci.yml`, leaving the rest at `dev-latest`.
4. Cross-service migration journal lint — extracts each service's
   `_journal.json` from its image and fails on timestamp collisions.
5. Pulls + starts the stack in stages (db → auth → sendpayment → api →
   products/receivepayment/sync/web) with health-check waits.
6. Installs Node 22 + Playwright Chromium.
7. **`npx playwright test --project=smoke`** against
   `BASE_URL=http://localhost:8080`.
8. Uploads the HTML report as an artifact.
9. `docker compose down -v --remove-orphans` always.

Failure here blocks the calling repo's deploy job.

### Other workflows

- `pr-validation.yml` — runs on PRs to this repo (lint/build/smoke).
- `full-regression.yml` — scheduled / manual full suite against live dev.

---

## Branches & Deploy Pipeline

This repo has a **single long-lived branch: `main`** (the default). There
is no `dev` / `stage` / `test` branch. The CI gate always checks out
`main`, and live regression runs are simply triggered against whichever
tagged `BASE_URL` you point them at.

Feature work happens on short-lived `feat/…`, `fix/…`, or `test/…`
branches that PR into `main` and then get deleted.

> Note: the broader Fintech-Gateway-Solution platform uses a `main`
> (dev) and `test` (stage) branch convention per service repo — this
> repo intentionally opts out because the suite has no environment
> coupling beyond `BASE_URL`.

---

## Known Caveats

- **Auth rate limit** — `/auth-api` enforces an aggressive global limit
  (~5 req/s). Cleanup paces user deletes at 250 ms with a 2 s back-off on
  429. If you batch-create many users in a new spec, do the same.
- **Invoice deletion needs `?force=true`** — the receivepayment service
  guards `DELETE /invoices/:id` to drafts only. Cleanup uses `?force=true`
  to bypass because the location-scoping suite produces non-draft
  invoices on purpose.
- **Payee hard-delete falls back to soft-delete on 409** — if a QA payee
  has been referenced by a real PO/payment from another test run, the
  `?hard=true` path 409s; cleanup retries without it so the soft-delete
  path still removes the row from listings.
- **Terminal POs are skipped** — `cancelled` and `received` POs are no-ops
  for both `DELETE` and `/cancel`, so cleanup leaves them. They don't
  participate in any flow.
- **Single worker / not parallel** — `workers: 1` is intentional. The
  suite shares one tenant, seeds named fixtures with timestamp-based ids,
  and the cleanup engine is not parallel-safe.
- **`status=generated` is the canonical sent state** — UI labels it
  "Sent". Don't be confused by tests filtering on `status=generated`.
- **PO `resend-email` is gated to `status=sent`** — drafts must transition
  via `POST /purchase-orders/:id/send` first. The suite does this
  explicitly before asserting on resend behaviour.
- **`getDepartments`, `getProducts`, `getLocations` skip on empty** — the
  PO and location-scoping suites call `testInfo.skip(...)` if a tenant has
  no locations / departments / products rather than failing, because that
  configuration is a tenant-setup issue, not a regression.
- **CI `web` image** — only the dashboard `web` SPA is exposed on port
  8080 in the CI compose. POS-specific UIs are not in the gate.

---

## Quick Reference for Claude

### Key files

| Path | What it is |
| --- | --- |
| `/Users/srinathsridharan/repos/qa-automation/playwright.config.ts` | Test runner config (projects, teardown wiring). |
| `/Users/srinathsridharan/repos/qa-automation/globalTeardown.ts` | Auto-cleanup runner. |
| `/Users/srinathsridharan/repos/qa-automation/src/fixtures/auth.fixture.ts` | `authenticatedPage` + `apiClient` fixtures. |
| `/Users/srinathsridharan/repos/qa-automation/src/helpers/api-client.ts` | All endpoint methods grouped by service. |
| `/Users/srinathsridharan/repos/qa-automation/src/helpers/constants.ts` | `API_PATHS`, `HEALTH_ENDPOINTS`, `APP_ROUTES`, `TEST_CREDENTIALS`. |
| `/Users/srinathsridharan/repos/qa-automation/src/helpers/test-data.ts` | All `qa*` factories. |
| `/Users/srinathsridharan/repos/qa-automation/src/lib/cleanup.ts` | Cleanup engine (regexes + delete logic). |
| `/Users/srinathsridharan/repos/qa-automation/scripts/cleanup-qa-data.ts` | Cleanup CLI entry. |
| `/Users/srinathsridharan/repos/qa-automation/docker-compose.ci.yml` | Full stack used by `qa-gate.yml`. |
| `/Users/srinathsridharan/repos/qa-automation/.github/workflows/qa-gate.yml` | Reusable pre-deploy gate. |

### Common commands

```bash
# Install
npm ci && npx playwright install --with-deps chromium

# Run smoke (CI gate equivalent)
npm run test:smoke

# Run a single regression spec against live dev
BASE_URL=https://findev.qpaymentz.com npx playwright test purchase-orders

# Inspect what cleanup would touch on dev
BASE_URL=https://findev.qpaymentz.com npm run cleanup

# Run tests but keep fixtures around for debugging
CLEANUP=skip npx playwright test po-resend-icon-screenshot

# Open the last HTML report
npm run report
```

### Common env var combos

| Goal | Env |
| --- | --- |
| Local smoke vs CI compose | (defaults) |
| Live dev regression | `BASE_URL=https://findev.qpaymentz.com` |
| Live stage regression | `BASE_URL=https://finstage.qpaymentz.com` |
| Debug — keep test data | add `CLEANUP=skip` |
| Use a non-default seeded user | `TEST_USER_EMAIL=… TEST_USER_PASSWORD=…` |

### Adding a new test

1. If the behaviour has an API surface, prefer an API-level spec under
   `src/tests/`, using the `apiClient` fixture.
2. If it's a true UI-only behaviour, use `authenticatedPage` and add
   under `src/tests/` (not under `smoke/` unless it's a simple
   page-loads check).
3. Use the existing `qa*` factories for any data you create. If you need
   a new entity type, add a factory to `src/helpers/test-data.ts` with
   the same `QA-…` / `qa-…@test.local` naming, and extend
   `src/lib/cleanup.ts` to match it.
4. Verify locally that `npm run cleanup` (dry-run) lists everything your
   spec creates before running it against dev/stage.
