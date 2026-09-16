# Dahlia Blue Band Sort — Sales and Distribution Management System

A small sales and distribution workspace for a Blue Band distribution team. Staff sign in, record
customer sales with one or more products/SKUs, and track approval status. Administrators review
requests, set the request window, export records, and manage account roles.

- `dahlia-blueband-sort.html` — the whole frontend (one page, no build step)
- `backend/` — Express API with JSON-file storage (no database to install)

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
        data/customers.json · data/users.json · data/settings.json
```

Folder layout:

```
dahlia-blueband-sort.html    the single page, served at /dahlia-blueband-sort.html
backend/
  server.js                  app wiring: middleware, routes, static hosting, health check
  routes/                    one router per area: authRoutes, customerRoutes, adminRoutes
  controllers/               request handling and validation
  middleware/                auth.js (JWT + administrator guard), errorHandler.js
  models/                    JSON-file data access: userModel, customerModel, settingsModel
  data/                      the live data files (mount this folder on a host)
  test/                      api.test.js (full API run) and frontend.test.js (page checks)
package.json                 root scripts: start (API + page) and test
railway.json / render.yaml   deployment definitions
```

Two walks through the flow:

- **Saving a sale** — the page posts to `/api/customers`; `requireAuth` verifies the token, `createCustomer` checks the request window, recalculates every SKU total plus the record total (browser totals are ignored) and stamps the user's region; `customerModel` writes `data/customers.json`; the page reloads the list.
- **Approving** — an administrator patches `/api/customers/:id/status`; `requireAuth` + `requireAdmin` verify the role, `updateCustomerStatus` stores the status, operating deadline, reviewer, and review time through `customerModel`; the page refreshes the approval queue.

## What the app does

| Area | Detail |
| --- | --- |
| Sign in / register | Username + password (bcrypt hashes) and a region: Kakamega, Webuye, Busia, or Luanda |
| Customer sales | Customer name plus any number of SKU rows (product, pieces, KES price per item, expiry date) |
| Totals | Calculated by the API from the SKU rows; totals sent by the browser are ignored |
| Approvals | Administrators approve or decline pending requests and set an operating deadline |
| Request window | Administrators open/close requests and set the allowed start and end dates |
| Editing | Customers and their SKUs can be edited after saving; each record keeps a note history |
| Reporting | Search, status and region filters, stock/expiry watch, and a customer CSV export |
| Accounts | Users can change their own password; administrators can promote or demote accounts |

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
| `PATCH` | `/api/admin/users/:id/role` | Administrator | Promote or demote an account |

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
  and request rules in `backend/data/settings.json`. The API creates these files if they are missing.
- Passwords are stored as bcrypt hashes only. Tokens expire after 24 hours.
- The API enforces roles: regular users cannot approve requests, change request-window rules, or
  change account roles even if they call the endpoints directly.
- Never commit `backend/.env`, JWT secrets, or administrator passwords.

See `MANAGING_THE_WEBSITE.md` for the day-to-day walkthrough and `backend/README.md` for backend
details.
