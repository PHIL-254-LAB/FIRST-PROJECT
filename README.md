# Dahlia Blue Band Sort — Sales and Distribution Management System

A small sales and distribution workspace for a Blue Band distribution team. Staff sign in, record
customer sales with one or more products/SKUs, and track approval status. Administrators review
requests, set the request window, export records, and manage account roles.

- `dahlia-blueband-sort.html` — the whole frontend (one page, no build step)
- `backend/` — Express API with JSON-file storage (no database to install)

## Customer claims

Alongside the sales workflow, the app includes a **customer claims** system driven by the
"CUSTOMER CLAIMS.xlsx" style document (title *DAHLIA BOTTLERS CLAIMS*):

The **Overview** tab also hosts admin-only **system controls**: a live API connection indicator,
the request window rules, and a registered-users table with each account's online/offline status
(based on recent sign-ins) and last sign-in time. Every sign-in attempt — successful or failed —
is written to a login audit log (`backend/data/login-log.json`, capped at the 500 most recent
entries) that administrators can view through the API.

- A separate, administrator-managed **claim catalog** lives in `backend/data/catalog.json`:
  a list of claim customers and the approved SKU list with fixed unit prices. It is seeded on
  first start with the standard price list (CHOCO / VANILLA / BB product sizes).
- Regular users open **Claims** to build a claim: pick a customer from the admin-configured
  dropdown, add SKU rows from the admin-configured dropdown, enter a quantity, and the unit
  price, amount (`quantity × unit price`) and 50% discount (amount ÷ 2) fill in automatically.
  The price can't be typed or overridden.
- Saving a claim posts only `customerId` + `items[{skuId, quantity}]`. The server looks the
  customer and SKU up in the catalog, verifies they are active, uses the **current** server-side
  SKU price, rejects duplicate SKUs, and stores snapshot copies of the customer name and SKU
  name/price so historical exports stay accurate if prices change later.
- Administrators open **Claim Admin** to add/edit/deactivate claim customers, and to
  add/edit/deactivate SKUs and change prices. New claims use the new price; saved claims keep
  the price they were created with.
- Every claim can be **printed** (A4, matching the template layout) or **exported to Excel**
  (real `.xlsx` with borders, title, totals, and A4 print setup) — either directly from the
  entry screen (server-generated draft export) or from any saved claim.

## How it fits together

```
Browser — dahlia-blueband-sort.html
   sign in · add customer sales · search and filter · review approvals · manage accounts
        |
        |  fetch('/api/...') with Authorization: Bearer <token>
        v
backend/server.js — Express app: CORS, JSON body parsing, static page hosting, /api/health
        |
        +-- routes/        URL to controller mapping (authRoutes, customerRoutes, adminRoutes)
        |     +-- middleware/auth.js — requireAuth (JWT) and requireAdmin (role check)
        |     v
        +-- controllers/   validate the request, apply the business rules, build the response
        |     v
        +-- models/        read and write the JSON files, one file per concern
              v
        data/customers.json · data/users.json · data/settings.json · data/catalog.json · data/claims.json
```

Folder layout:

```
dahlia-blueband-sort.html    the single page, served at /dahlia-blueband-sort.html
backend/
  server.js                  app wiring: middleware, routes, static hosting, health check
  routes/                    one router per area: authRoutes, customerRoutes, adminRoutes, catalogRoutes, claimRoutes
  controllers/               request handling and validation
  middleware/                auth.js (JWT + administrator guard), errorHandler.js
  models/                    JSON-file data access: userModel, customerModel, settingsModel, catalogModel, claimModel, loginModel
  data/                      the live data files (mount this folder on a host)
  test/                      api.test.js (full API run) and frontend.test.js (page checks)
package.json                 root scripts: start (API + page) and test
railway.json / render.yaml   deployment definitions
```

Two walks through the flow:

- **Saving a sale** — the page posts to `/api/customers`; `requireAuth` verifies the token, `createCustomer` checks the request window, recalculates every SKU total plus the record total (browser totals are ignored) and stamps the user's region; `customerModel` writes `data/customers.json`; the page reloads the list.
- **Saving a claim** — the **Claims** page posts `{customerId, items:[{skuId, quantity}]}` to
  `/api/claims`; `createClaim` looks up the customer and each SKU in the claim catalog, uses the
  **server-side** unit price for every row, rejects duplicate SKUs and empty quantities, stores a
  snapshot of the customer name and each SKU name/price, and returns the claim with its number
  (`DC-0001`...) and the auto-computed amount and 50% totals. The price sent by the browser is
  always ignored — the price field is read-only on screen.
- **Exporting a claim** — the page calls `/api/claims/export-draft` (unsaved draft, server writes a
  real `.xlsx`) or `GET /api/claims/:id/export` (any saved claim); `exportClaim` builds a
  *DAHLIA BOTTLERS CLAIMS* workbook with the customer name, the SKU / quantity / price / 50%-off
  columns and totals, sized for A4 portrait printing.
- **Approving** — an administrator patches `/api/customers/:id/status`; `requireAuth` + `requireAdmin` verify the role, `updateCustomerStatus` stores the status, operating deadline, reviewer, and review time through `customerModel`; the page refreshes the approval queue.

## What the app does

| Area | Detail |
| --- | --- |
| Sign in / register | Username + password (bcrypt hashes) and a region: Kakamega, Webuye, Busia, or Luanda |
| Customer sales | Customer name plus any number of SKU rows picked from a product dropdown (or "Other product" typed by hand), each with pieces, KES price per item, and expiry date |
| Totals | Calculated by the API from the SKU rows; totals sent by the browser are ignored |
| Approvals | Administrators approve or decline pending requests and set an operating deadline |
| Request window | Administrators open/close requests and set the allowed start and end dates |
| Editing | Customers and their SKUs can be edited after saving, including adding or removing products; each record keeps a note history |
| Reporting | Search, status and region filters, stock/expiry watch, and a customer CSV export |
| Overview summary | Counts of total customers and units recorded, plus approved / pending / declined counts with their amounts (KES) |
| System controls | On the Overview tab: API connection status, the request window, and registered users with online/offline status and last sign-in |
| Login audit | Every successful and failed sign-in is logged (username, user, role, region, IP, user agent, time); administrators read it through `/api/admin/login-log` |
| Accounts | Administrators manage accounts from the Accounts tab (create accounts with passwords, edit login names, reset passwords, promote or demote) |
| Claim catalog | Administrators manage claim customers and the approved SKU price list; seeded with the standard price list on first start |
| Claims | Employees build a claim from the admin-configured dropdowns; amount and 50% totals auto-fill from server-side prices that can't be overridden |
| Claim export | Print an A4 claim form or export a real `.xlsx` (from the entry screen or any saved claim) |

## Quick start (local)

```powershell
cd backend
npm install
Copy-Item .env.example .env
npm start
```

Then open <http://localhost:3000/dahlia-blueband-sort.html>. The API listens on port 3000 by default
and serves the page from the repository root, so the frontend and API share one origin.

Set a long random `JWT_SECRET` in `backend/.env` before sharing the app, and change the seeded
administrator password (`admin`) before going live.

## Environment variables

| Name | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | API port |
| `FRONTEND_ORIGIN` | `*` | Allowed CORS origin |
| `JWT_SECRET` | development fallback | Signs authentication tokens; set a real secret in production |
| `DATA_DIR` | `backend/data` | Optional folder for the JSON data files (used by the tests) |

## API

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Health check used by the hosting platforms |
| `POST` | `/api/auth/register` | Public | Create an account, returns a JWT |
| `POST` | `/api/auth/login` | Public | Sign in, returns a JWT |
| `GET` | `/api/auth/me` | Any signed-in user | Current account |
| `PATCH` | `/api/auth/password` | Any signed-in user | Change own password |
| `GET` | `/api/customers` | Any signed-in user | All customer records |
| `POST` | `/api/customers` | Any signed-in user | Save a customer sale (only while the request window is open) |
| `GET` | `/api/customers/:id` | Any signed-in user | One customer record |
| `PUT` | `/api/customers/:id` | Any signed-in user | Update a customer and its SKUs |
| `DELETE` | `/api/customers/:id` | Any signed-in user | Delete a customer |
| `POST` | `/api/customers/:id/notes` | Any signed-in user | Add a follow-up note |
| `PATCH` | `/api/customers/:id/status` | Administrator | Approve or decline a request |
| `GET` | `/api/customers/request-window` | Any signed-in user | Whether requests are open |
| `GET` | `/api/admin/settings` | Administrator | Request-window rules |
| `PATCH` | `/api/admin/settings` | Administrator | Save request-window rules |
| `GET` | `/api/admin/users` | Administrator | Registered accounts (never password hashes) |
| `POST` | `/api/admin/users` | Administrator | Create an account with a password and role |
| `PUT` | `/api/admin/users/:id` | Administrator | Edit an account's login name and profile details |
| `PATCH` | `/api/admin/users/:id/role` | Administrator | Promote or demote an account |
| `PATCH` | `/api/admin/users/:id/password` | Administrator | Set/reset an account's password |
| `GET` | `/api/admin/login-log` | Administrator | Login audit entries, newest first (optional `limit`, max 500) |
| `GET` | `/api/catalog/options` | Any signed-in user | Active claim customers + SKUs with prices for the claim form |
| `GET` | `/api/catalog/manage` | Administrator | Full claim catalog incl. deactivated items |
| `POST` | `/api/catalog/customers` | Administrator | Add a claim customer |
| `PUT` | `/api/catalog/customers/:id` | Administrator | Edit a claim customer |
| `PATCH` | `/api/catalog/customers/:id/active` | Administrator | Activate/deactivate a claim customer |
| `POST` | `/api/catalog/skus` | Administrator | Add a claim SKU |
| `PUT` | `/api/catalog/skus/:id` | Administrator | Edit a claim SKU (name or price) |
| `PATCH` | `/api/catalog/skus/:id/active` | Administrator | Activate/deactivate a claim SKU |
| `POST` | `/api/claims` | Any signed-in user | Save a claim (server-side pricing, snapshotting) |
| `POST` | `/api/claims/export-draft` | Any signed-in user | Excel export of an unsaved draft claim |
| `GET` | `/api/claims` | Any signed-in user | All saved claims, newest first |
| `GET` | `/api/claims/:id` | Any signed-in user | One saved claim |
| `GET` | `/api/claims/:id/export` | Any signed-in user | Excel export of a saved claim |

Send `Authorization: Bearer <token>` with every request except `register` and `login`.

## Tests

```powershell
npm test              # from the repository root
npm test --prefix backend
```

The suite uses Node's built-in test runner (no extra dependencies). It runs the API against a
temporary `DATA_DIR`, walks through registration, saving, editing, notes, approvals, the request
window, role management, and also checks that the single-page frontend parses and defines every
element its scripts look up.

## Deployment

- **Railway** — `railway.json` builds with Nixpacks and starts `npm start` (root `package.json`
  runs `node backend/server.js`). Add `JWT_SECRET` in the service variables and mount a volume on
  `backend/data` so customer records survive redeploys.
- **Render** — `render.yaml` creates the web service from the `backend` directory, generates
  `JWT_SECRET`, and mounts a persistent disk on `backend/data` (a paid plan is required for disks).

Push to `main` and the host redeploys. Hard-refresh (`Ctrl+F5`) the page if an old tab is cached.

## Data and security

- Customer records live in `backend/data/customers.json`, accounts in `backend/data/users.json`,
  request rules in `backend/data/settings.json`, the claim catalog in `backend/data/catalog.json`,
  saved claims in `backend/data/claims.json`, and the login audit in `backend/data/login-log.json`.
  The API creates these files if they are missing.
- Passwords are stored as bcrypt hashes only. Tokens expire after 24 hours.
- The API enforces roles: regular users cannot approve requests, change request-window rules, change
  account roles, administer the claim catalog, or read the login audit even if they call the
  endpoints directly.
- Every sign-in attempt is recorded, so failed password guesses and successful access both leave a
  trail in the audit log (a write that fails never blocks the sign-in itself).
- Claim prices always come from the catalog on the server — a client can't submit a cheaper unit
  price — and saved claims keep a snapshot, so later price changes never rewrite history.
- Never commit `backend/.env`, JWT secrets, or administrator passwords.

See `MANAGING_THE_WEBSITE.md` for the day-to-day walkthrough and `backend/README.md` for backend
details.
