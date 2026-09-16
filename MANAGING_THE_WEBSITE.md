# Managing Dahlia Blue Band Sort

## Website access

Open the Railway website:

`https://dahlia-blueband-sort-production.up.railway.app/dahlia-blueband-sort.html`

Regular users select **Create one** on the login screen and enter a username, name, email, and password of at least six characters. They can sign in again with the same username and password.

## Regular user workflow

1. Sign in.
2. Open **Customers**.
3. Enter the customer name.
4. Add one or more SKU rows with **+ Add SKU**.
5. Enter each product/SKU, pieces, KES price per item, and expiry date.
6. Check the combined total and save the request.
7. Open **Details** to see customer history and whether each request is pending, approved, or declined.

Requests are shared with the administrator for review. A request cannot be created when the admin has closed the request window or the current date is outside the configured date range.

## Administrator workflow

Sign in with the administrator account. The admin sees an additional **Approvals** tab.

1. Review pending customer requests and all SKU details.
2. Set an operating deadline on the request card.
3. Select **Approve** or **Decline**.
4. Open **Request window** to choose Open or Closed and set the allowed start/end dates.
5. Use **Registered users** to see account names, usernames, roles, and join dates.

The API enforces administrator permissions, so a regular user cannot approve, decline, or change request-window rules by calling the interface directly.

## Data and deployment

Customer records are stored in `backend/data/customers.json`, user accounts in `backend/data/users.json`, and request rules in `backend/data/settings.json`. Railway mounts these files on persistent storage so data survives normal redeployments.

Code changes are pushed to GitHub and Railway redeploys from the `main` branch. After a deploy, refresh the website with `Ctrl+F5` if an older browser tab is still open.

Never publish `backend/.env`, JWT secrets, or administrator passwords. Change the seeded administrator password before sharing the live site widely.
