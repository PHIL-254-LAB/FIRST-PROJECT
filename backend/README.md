# NEW DAY backend

Express API for saving customer sales entries in `data/customers.json`.

## Setup

From the project root:

```powershell
cd .\backend
npm install
Copy-Item .env.example .env
npm start
```

Set a unique `JWT_SECRET` in `.env` before sharing the app. Users can create accounts from the frontend; passwords are stored as bcrypt hashes and are never stored as plain text.

The seeded administrator account is `admin`. Use the initial password supplied to the project owner, then change it before sharing the account. Administrators can approve or decline customer requests and set operating deadlines; regular users cannot access those actions.

## Permanent Render deployment

The repository root includes `render.yaml`. Push the project to GitHub, then choose **New > Blueprint** in Render and select that repository. Render will create the web service, generate `JWT_SECRET`, serve the frontend and API together, and mount persistent storage for `data/users.json` and `data/customers.json`. A paid Render plan is required for the persistent disk.

For automatic restart during development:

```powershell
npm run dev
```

The API runs at `http://localhost:3000` by default. Set `PORT` and `FRONTEND_ORIGIN` in `.env` when needed.

## Endpoints

- `POST /api/customers` creates a customer and calculates product/customer totals.
- `GET /api/customers` returns all customers.
- `GET /api/customers/:id` returns one customer and its products.
- `DELETE /api/customers/:id` deletes one customer and its products.
- `GET /api/health` checks that the API is running.
- `POST /api/auth/register` creates a user account and returns a JWT.
- `POST /api/auth/login` signs in with a username and password and returns a JWT.
- `GET /api/auth/me` returns the authenticated user. Send `Authorization: Bearer <token>`.

Account administration (administrator only, all require `Authorization: Bearer <token>`):

- `GET /api/admin/users` lists accounts without password hashes.
- `POST /api/admin/users` creates an account: `{ username, name, password, email?, region?, role? }` (role is `user` or `admin`).
- `PUT /api/admin/users/:id` edits the login name and profile: `{ username, name, email?, region? }`.
- `PATCH /api/admin/users/:id/role` promotes or demotes an account.
- `PATCH /api/admin/users/:id/password` sets a new password: `{ newPassword }`.
- `GET /api/admin/login-log?limit=100` returns the login audit, newest first (successful and failed
  sign-ins with username, user id/name, role, region, IP, user agent, and time; the log keeps the
  500 most recent entries and `limit` is capped at 500).

Customer endpoints require the same `Authorization: Bearer <token>` header. New customer records start with `status: "pending"`; customer records are currently shared between authenticated users. Each customer can contain multiple products/SKUs, each with pieces, KES price, and expiry date.

## Claim catalog and claims

- `GET /api/catalog/options` returns the active claim customers and SKUs (with prices) for the claim form.
- `GET /api/catalog/manage` (administrator) returns the full catalog including deactivated items.
- `POST /api/catalog/customers`, `PUT /api/catalog/customers/:id`, `PATCH /api/catalog/customers/:id/active` (administrator) manage claim customers.
- `POST /api/catalog/skus`, `PUT /api/catalog/skus/:id`, `PATCH /api/catalog/skus/:id/active` (administrator) manage claim SKUs and prices. The catalog is seeded with the standard price list when empty.
- `POST /api/claims` (any signed-in user) saves a claim. It accepts only `customerId` and `items[{skuId, quantity}]`; the unit price, amount and 50% totals are calculated on the server from the catalog, duplicate SKUs are rejected, and the customer/SKU names and prices are snapshotted into the saved claim.
- `POST /api/claims/export-draft` returns a real `.xlsx` for an unsaved draft, validated exactly like a saved claim.
- `GET /api/claims/template` returns the blank claim form as a real `.xlsx`: the A4 "DAHLIA TRADING COMPANY (REGION)" page with the signed-in user's region and van, empty SKU rows, a TOTAL row built from `SUM()` formulas, the customer/verifier signature boxes, and the active SKU price list on a second sheet.
- `GET /api/claims` lists saved claims (newest first), `GET /api/claims/:id` returns one, and `GET /api/claims/:id/export` returns its `.xlsx` (DAHLIA BOTTLERS CLAIMS, A4 portrait, totals).

Example claim body:

```json
{
  "customerId": "<claim customer id>",
  "items": [
    { "skuId": "<sku id>", "quantity": 96 }
  ]
}
```

Example request body:

```json
{
  "customerName": "Mama Jane Shop",
  "products": [
    { "product": "Blue Band 500g", "pieces": 20, "pricePerItem": 200, "expiryDate": "2027-12-31" },
    { "product": "Rama 500g", "pieces": 10, "pricePerItem": 150, "expiryDate": "2028-06-30" }
  ]
}
```

Totals sent by a frontend are ignored. The backend calculates them from the product entries.
