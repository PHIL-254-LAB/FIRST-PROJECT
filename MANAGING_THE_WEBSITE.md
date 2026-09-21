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
5. Choose the product/SKU from the dropdown — pick **Other product (type below)** to type a product that is not listed — then enter pieces, KES price per item, and expiry date.
6. Check the combined total and save the request.
7. Open **Details** to see customer history and whether each request is pending, approved, or declined.
8. Use **Edit** on a saved record to correct the customer name or any SKU row; choose **+ Add product** to add another product row while editing, or **Remove** to drop a product row.
9. Use **Notes** to keep delivery, payment, or follow-up details on a record.
10. Use **Search**, the status filter, the region filter, and the van filter to find records.
11. Open **Overview** to see the summary of total customers, units recorded, and approved / pending / declined amounts.

Requests are shared with the administrator for review. A request cannot be created when the admin has closed the request window or the current date is outside the configured date range.

## Administrator workflow

Sign in with the administrator account. The admin sees an additional **Approvals** tab.

On the **Overview** tab, the _Summary_ panel shows the dashboard figures: total customers, total
units recorded, and — split by approval status — how many customer records were approved, are still
pending, or were declined, each with the combined amount in KES. It refreshes automatically when the
records load.

Below it, the admin-only **System controls** section lives on the same Overview tab:

- **Connection** — shows whether the workspace is talking to the live API (Online) or showing preview
  records (Offline), with the last check time.
- **Request window** — open or closed status and the allowed start/end dates. *This moved here from
  the Approvals tab.*
- **Registered users** — every account with its region, an online/offline indicator, its last
  sign-in time, and quick actions to edit the account, reset its password, or promote/demote the
  role. **Edit** jumps to the Accounts tab with the account loaded.

1. Review pending customer requests and all SKU details.
2. Set an operating deadline on the request card.
3. Select **Approve** or **Decline**.
4. Open **Request window** (on the Overview tab) to choose Open or Closed and set the allowed start/end dates.
5. Use **Registered users** (on the Overview tab) to see account names, usernames, roles, online/offline status, and last sign-in, and to promote or demote an account. You cannot change your own role, and the last remaining administrator cannot be demoted.
6. Open the **Details** tab and use **Export approved & declined to Excel** to download an `.xlsx` of every approved and declined request (customer, region, van, status, products, a separate expiry-date column, pieces, total, and deadline).
7. Use the **Accounts** tab to create accounts for staff (full name, login name, email, region, role, and an initial password), to edit a login name or other profile details, to reset a password at any time, and to promote or demote an account.
8. Use the **Login audit** through the API (`GET /api/admin/login-log`) to review every successful
   and failed sign-in — username, user, role, region, IP address, browser, and time, newest first.

The API enforces administrator permissions, so a regular user cannot approve, decline, change request-window rules, or read the login audit by calling the interface directly.

## Claims (customer returns)

The **Claims** area is a second, separate workflow for handling customer returns and swaps on the
"CUSTOMER CLAIMS.xlsx" style document — it has nothing to do with the sales register above.

For a staff member:

1. Open **Claims**.
2. Choose the **customer** from the dropdown (this list is set up by an administrator).
3. Under **Items**, pick a product from the SKU dropdown and type how many **pieces** it was.
   Click **Add row** for each extra SKU.
4. The unit price, amount (pieces × price) and the 50% discount fill in automatically — they can't
   be typed in. Adding the same product twice is blocked with a warning.
5. Check the totals, then **Export to Excel** to download the claim document directly, **Print** to
   produce the A4 form, or **Save claim** to keep it in the system (it then appears in the list
   below with its claim number, e.g. `DC-0032`). Any saved claim can be printed or exported again.

### Approved claims (Claims tab)

The **Claims** tab only lists **approved** claims. Use the two dropdowns above the list to narrow
it: pick a **Region**, then a **Van** (the van list only fills in once a region is chosen). The list
shows any approved claim that matches, and the **Print approved claims** button prints exactly what's
in the list.

Each printable approved claim uses the stamp-ready A4 template: the title
`DAHLIA TRADING COMPANY ("REGION")` centered, then `CUSTOMER NAME - ("VAN")`, a table listing each
SKU with its quantity, the **original price**, the **price to be claimed**, and a `50% OFF` / `100%
OFF` tag matching how it was approved, a total of the amount to be claimed, and two signature boxes —
one for the **customer** (stamp / signature) and one for **you** (verified by, stamp / signature).
To keep a copy, choose **Save as PDF** in the print dialog.

## Claim catalog (admin tools on the Claims tab)

Administrators get an extra **admin tools** block at the bottom of the **Claims** tab with three
views:

- **Customers** — add a claim customer (name), edit its name, or deactivate/activate it. Inactive
  customers disappear from the Claims screen.
- **SKUs** — the full price list (seeded automatically on first start):
  CHOCO 30G=17 · CHOCO 100G=62 · CHOCO 250G=169.6 · CHOCO 500G=321 · VANILLA 500G=267 ·
  VANILLA 1KG=522 · BB 20G=8 · BB 30G=15.9 · BB 100G=58 · BB 250G=142 · BB 500G=267 · BB 1KG=522
  (all KES). Edit a name or price with the inline edit button, or deactivate/activate a SKU.
- **Claims** — any claim (pending, approved, or declined) with its number, customer, totals, date,
  and saved-by user; open one to print or export it. Approve a pending claim here (choose **50%
  off** or **100% off**) or decline it — approval is what makes it printable on the Claims tab.

Changing a SKU's price only affects claims saved **after** the change. Already-saved claims keep the
price they were created with, so historical exports never change.

## Product list

The SKU dropdown is fed by the `productChoices` list near the top of the script in `dahlia-blueband-sort.html`. Add or remove product names there to change what staff can select. **Other product (type below)** stays available so a one-off product can still be recorded.

## Checks and tests

Run the automated checks from the project root:

```powershell
npm test
```

The suite starts the API against a temporary data folder and verifies sign-in, registration, saving and editing customers, notes, approvals, the request window, account roles, the login audit, the claim catalog and claim saves/calculations/Excel exports, and that the web page scripts are valid. It never modifies the records in `backend/data`.

## Data and deployment

Customer records are stored in `backend/data/customers.json`, user accounts in `backend/data/users.json`, request rules in `backend/data/settings.json`, the claim catalog in `backend/data/catalog.json`, saved claims in `backend/data/claims.json`, and the login audit in `backend/data/login-log.json` (kept to the 500 most recent entries). Railway mounts these files on persistent storage so data survives normal redeployments.

Code changes are pushed to GitHub and Railway redeploys from the `main` branch. After a deploy, refresh the website with `Ctrl+F5` if an older browser tab is still open.

Never publish `backend/.env`, JWT secrets, or administrator passwords. Change the seeded administrator password before sharing the live site widely.
