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

Customer endpoints require the same `Authorization: Bearer <token>` header. Customer records are currently shared between authenticated users.

Example request body:

```json
{
  "customerName": "Mama Jane Shop",
  "products": [
    { "product": "Blue Band 500g", "pieces": 20, "pricePerItem": 200 },
    { "product": "Rama 500g", "pieces": 10, "pricePerItem": 150 }
  ]
}
```

Totals sent by a frontend are ignored. The backend calculates them from the product entries.
