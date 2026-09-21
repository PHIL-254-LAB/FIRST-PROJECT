'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const htmlFile = path.join(__dirname, '..', '..', 'dahlia-blueband-sort.html');
const html = fs.readFileSync(htmlFile, 'utf8');

function collect(pattern) {
  return new Set([...html.matchAll(pattern)].map((match) => match[1]));
}

describe('dahlia-blueband-sort.html', () => {
  it('contains each inline script with valid JavaScript', () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

    assert.ok(scripts.length >= 2, 'Expected the page to contain the app script and the enhancement script');

    scripts.forEach((code, index) => {
      assert.doesNotThrow(() => new vm.Script(code, { filename: `inline-script-${index + 1}.js` }));
    });
  });

  it('defines every element the scripts look up', () => {
    // Elements are either part of the static markup or injected by the scripts themselves.
    const definedIds = collect(/id="([A-Za-z0-9_-]+)"/g);
    const lookedUpIds = new Set([
      ...collect(/document\.getElementById\('([A-Za-z0-9_-]+)'\)/g),
      ...collect(/\$\('([A-Za-z0-9_-]+)'\)/g)
    ]);

    const missing = [...lookedUpIds].filter((id) => !definedIds.has(id)).sort();
    assert.deepEqual(missing, [], `These element ids are referenced but never defined: ${missing.join(', ')}`);
  });

  it('exposes the panel ids used by the navigation and the API base URL', () => {
    ['summaryPanel', 'overviewAdminPanel', 'customersPanel', 'detailsPanel', 'adminPanel', 'accountsPanel', 'loginScreen', 'app'].forEach((id) => {
      assert.ok(html.includes(`id="${id}"`), `Expected the page to define id="${id}"`);
    });

    assert.ok(html.includes("'http://localhost:3000/api'"), 'Expected the local API fallback URL');
  });

  it('builds SKU rows from the shared product dropdown', () => {
    assert.ok(/const defaultProductChoices = Object\.keys\(defaultProductPrices\)/.test(html), 'Expected a product list to feed the SKU dropdown');
    assert.ok(html.includes("'BB 250G': 142"), 'Expected the BB 250G master SKU with its fixed price');
    assert.ok(html.includes("'CHOCO 250G': 169.6"), 'Expected the CHOCO 250G master SKU with its fixed price');
    assert.ok(html.includes("'VANILLA 500G': 267"), 'Expected the VANILLA 500G master SKU with its fixed price');
    assert.ok(html.includes('loadProductMaster'), 'Expected the dropdown to refresh from the product master API');
    assert.ok(html.includes('applyFixedPrice'), 'Expected the price to be locked to the chosen product');
    assert.ok(html.includes('product-select'), 'Expected the SKU product field to be a dropdown');
    assert.ok(html.includes('productNameFromRow(row)'), 'Expected submitted products to come from the dropdown value');
    assert.ok(html.includes('id="addEditProduct"'), 'Expected an add-product control in the customer editor');
    assert.ok(html.includes('remove-edit-product'), 'Expected a remove control for each product in the editor');
    assert.ok(html.includes('linkProductField(row'), 'Expected the custom-product field to be wired up');
  });

  it('escapes customer data before rendering it', () => {
    assert.ok(html.includes('const esc = (value)'), 'Expected the enhancement script to define an HTML escape helper');
    assert.ok(/esc\(customer\.customerName\)/.test(html), 'Expected rendered customer names to be escaped');
  });

  it('defines the claims entry panels and controls', () => {
    ['claimsPanel', 'claimsAdminPanel', 'claimForm', 'claimCustomer', 'claimSkuList', 'claimList', 'claimTotal', 'saveClaimButton', 'printClaimDraftButton', 'exportClaimDraftButton', 'claimsAdminCustomers', 'claimsAdminSkus', 'claimsAdminClaims'].forEach((id) => {
      assert.ok(html.includes(`id="${id}"`), `Expected the page to define id="${id}"`);
    });

    assert.ok(html.includes("'/api/claims'"), 'Expected the claims API base URL');
    assert.ok(html.includes('/api/catalog/options'), 'Expected the claim catalog options endpoint');
  });

  it('defines the accounts management panel for administrators', () => {
    ['accountsPanel', 'accountsNav', 'accountForm', 'accountName', 'accountUsername', 'accountEmail', 'accountRegion', 'accountVan', 'accountPassword', 'accountRole', 'accountSubmit', 'accountCancel', 'accountList', 'accountsRefreshButton'].forEach((id) => {
      assert.ok(html.includes(`id="${id}"`), `Expected the page to define id="${id}"`);
    });

    assert.ok(html.includes("'/admin/users'"), 'Expected the accounts API endpoint');
    assert.ok(html.includes('loadAccounts'), 'Expected an account list loader');
    assert.ok(html.includes('populateAccountVans'), 'Expected a van dropdown builder for accounts');
    assert.ok(html.includes('resetAccountPassword'), 'Expected a password reset helper');
    assert.ok(html.includes('data-account-delete'), 'Expected a delete button on each account row');
    assert.ok(html.includes('deleteAccount('), 'Expected a delete-account helper');
    assert.ok(html.includes('switchAccountsPage'), 'Expected the accounts page to be wired into navigation');
  });

  it('lets users pick a role, region, and van on the login form', () => {
    ['loginRole', 'loginRegion', 'loginVan', 'roleField', 'regionField', 'vanField'].forEach((id) => {
      assert.ok(html.includes(`id="${id}"`), `Expected the page to define id="${id}"`);
    });

    assert.ok(html.includes('regionVans'), 'Expected a region-to-van map in the page');
    assert.ok(html.includes('Kakamega: ['), 'Expected Kakamega vans in the region map');
    assert.ok(html.includes('W001 KKMG'), 'Expected the Kakamega W001 KKMG van');
    assert.ok(html.includes('WEB 1'), 'Expected the Webuye vans');
    assert.ok(html.includes('W001 BUSIA'), 'Expected the Busia W001 BUSIA van');
    assert.ok(html.includes("'B001'"), 'Expected the Luanda B001 van');
    assert.ok(html.includes('id="loginRoleAdmin"'), 'Expected the Admin role option to be marked');
    assert.ok(html.includes('adminOption.disabled = registering'), 'Expected the Admin role to be locked to existing admins on self-register');
    assert.ok(html.includes('populateLoginVans'), 'Expected a login van dropdown builder');
    assert.ok(html.includes('updateLoginRoleFields'), 'Expected a helper to toggle region/van for admins');
  });

  it('locks the claim unit price and warns on duplicate SKUs', () => {
    assert.ok(html.includes('class="claim-sku-price"'), 'Expected a claim unit-price input');
    assert.ok(/claim-sku-price[^>]*readonly/.test(html) || /input[^>]*class="claim-sku-price"[^>]*readonly/.test(html), 'Expected the claim unit price to be readonly');
    assert.ok(html.includes('checkClaimDuplicates'), 'Expected a duplicate-SKU checker');
    assert.ok(html.includes('updateClaimTotal'), 'Expected a claim total calculator');
    assert.ok(html.includes('onClaimSkuChange'), 'Expected the price to auto-fill when a product is chosen');
    assert.ok(html.includes('sku.unitPrice'), 'Expected the price to come from the SKU catalog');
    assert.ok(html.includes('updateClaimRow'), 'Expected the claim row amount to recalculate from quantity');
  });

  it('includes print and Excel export helpers for claims', () => {
    assert.ok(html.includes('printClaim'), 'Expected a claim print helper');
    assert.ok(html.includes('exportClaimExcel'), 'Expected a claim Excel export helper');
    assert.ok(html.includes('DAHLIA TRADING COMPANY (') || html.includes('DAHLIA BOTTLERS CLAIMS'), 'Expected the claim document title');
  });

  it('gates claim printing on approval and exposes the admin approval workflow', () => {
    assert.ok(html.includes('printAllApprovedButton'), 'Expected a "print all approved claims" button');
    assert.ok(html.includes('printAllApproved'), 'Expected a helper that prints every approved claim');
    assert.ok(html.includes('data-approve-claim'), 'Expected an approve button on each pending claim');
    assert.ok(html.includes('data-decline-claim'), 'Expected a decline button on each pending claim');
    assert.ok(html.includes('/approval'), 'Expected the claim approval API endpoint');
    assert.ok(html.includes('Only approved claims can be printed / exported'), 'Expected printable actions to be gated on approval');
    assert.ok(html.includes('Approved '), 'Expected an approved status badge with the discount mode');
    assert.ok(html.includes('claimStatusBadge'), 'Expected a status badge helper');
  });

  it('shows only approved claims on the Claims tab with a region then van filter and a stamp-ready print template', () => {
    ['claimRegionFilter', 'claimVanFilter', 'claimVanField', 'printApprovedClaimsButton'].forEach((id) => {
      assert.ok(html.includes(`id="${id}"`), `Expected the page to define id="${id}"`);
    });

    assert.ok(html.includes('function renderClaimList'), 'Expected a dedicated renderer for the approved claims tab list');
    assert.ok(html.includes('.filter((claim) => claim.status === \'approved\')'), 'Expected the list to keep only approved claims');
    assert.ok(html.includes('const units = new Set(regionVanMap[region] || [])'), 'Expected the van list to come from the selected region');
    assert.ok(html.includes('vanSelect.disabled = true'), 'Expected the van filter to wait until a region is chosen');
    assert.ok(html.includes('No approved claims match this region and van yet.'), 'Expected an empty state for the filtered approved list');
    assert.ok(html.includes('function filteredApprovedClaims'), 'Expected the print action to respect the region/van filter');
    assert.ok(html.includes("$('claimList').innerHTML = shown.length"), 'Expected the Claims tab list to render the filtered approved claims');

    assert.ok(html.includes('DAHLIA TRADING COMPANY ("'), 'Expected the printed title to name the company and region');
    assert.ok(html.includes('ORIGINAL PRICE (KES)'), 'Expected the original price column header');
    assert.ok(html.includes('PRICE TO BE CLAIMED (KES)'), 'Expected the claim price column header');
    assert.ok(html.includes('off-tag') && html.includes('${mode}% OFF'), 'Expected a 50%/100% OFF tag on each row');
    assert.ok(html.includes('Total price to be claimed:'), 'Expected a total to be claimed line');
    assert.ok(html.includes('Customer stamp / signature'), 'Expected a place for the customer stamp or signature');
    assert.ok(html.includes('Verified by (stamp / signature)'), 'Expected a place for the admin stamp or signature');
  });

  it('turns the administrator Customers tab into a Requests tab with a region then van filter', () => {
    assert.ok(html.includes('id="customersNav"'), 'Expected the shared navigation button to have an id');
    assert.ok(html.includes("customersNav').textContent = isAdmin ? 'Requests' : 'Customers'"), 'Expected the admin nav entry to read Requests');
    assert.ok(html.includes("customersNav').dataset.page = isAdmin ? 'admin' : 'customers'"), 'Expected the Requests tab to open the approval panel');
    assert.ok(!html.includes('id="adminNav"'), 'Expected the separate Approvals tab to be merged away');
    assert.ok(html.includes('<h2>Requests</h2>'), 'Expected the panel heading to read Requests');
    assert.ok(html.includes('id="approvalRegionFilter"'), 'Expected a region filter on the requests panel');
    assert.ok(html.includes('id="approvalVanFilter"'), 'Expected a van filter on the requests panel');
    assert.ok(html.includes('id="approvalVanField"'), 'Expected the van field to be toggleable');
    assert.ok(html.includes('approval-tools'), 'Expected the request filters to be laid out');
    assert.ok(html.includes("(customer.status || 'pending') === 'pending'"), 'Expected only pending requests to be listed for approval');
    assert.ok(html.includes('const units = new Set(regionVans[region] || [])'), 'Expected the van list to come from the selected region');
    assert.ok(html.includes('vanSelect.disabled = true'), 'Expected the van filter to wait until a region is chosen');
    assert.ok(html.includes('data-approve=') && html.includes('data-decline='), 'Expected approve and decline buttons on each request');
    assert.ok(!html.includes('window.regionVans'), 'The region map is a top-level const, not a window property');
  });

  it('adds a van filter so administrators can see the customers each van added', () => {
    assert.ok(html.includes('id="customerVanFilter"'), 'Expected a customer van filter dropdown');
    assert.ok(html.includes('All vans'), 'Expected a default "All vans" option');
    assert.ok(html.includes('customerVanFilter'), 'Expected the van filter to be wired to the customer list');
    assert.ok(html.includes('Van \' + esc(customer.van'), 'Expected each customer card to show its van');
  });

  it('moves the request export from Requests to Details as an Excel download', () => {
    assert.ok(html.includes('id="exportDecidedButton"'), 'Expected an export button on the Details panel');
    assert.ok(html.includes('Export approved &amp; declined to Excel'), 'Expected the button to describe the export');
    assert.ok(html.includes('exportDecidedRequests'), 'Expected an export helper');
    assert.ok(html.includes("'/customers/export'") || html.includes('"/customers/export"'), 'Expected the export to call the customers export endpoint');
    assert.ok(html.includes("$('exportDecidedButton').classList.toggle('hidden', !isAdmin)"), 'Expected the export button to be hidden from non-admins');
    assert.ok(!html.includes('adminExportCustomers'), 'Expected the old request CSV button to be removed');
    assert.ok(!html.includes('Export customer CSV'), 'Expected the CSV label to be gone');
  });

  it('defines the overview system controls for administrators', () => {
    ['overviewAdminPanel', 'overviewAdminStatus', 'overviewAdminRefreshButton', 'connectionBadge', 'connectionDetail', 'connectionLastCheck', 'userList', 'settingsForm'].forEach((id) => {
      assert.ok(html.includes(`id="${id}"`), `Expected the page to define id="${id}"`);
    });

    assert.ok(html.includes("'/admin/login-log'"), 'Expected the login audit endpoint in the page');
    assert.ok(html.includes('loadOverviewControls'), 'Expected a system-controls loader');
    assert.ok(html.includes('updateConnectionStatus') || html.includes('setConnectionStatus'), 'Expected a connection status helper');
    assert.ok(html.includes('renderOverviewUsers'), 'Expected an overview user list renderer');
    assert.ok(html.includes('data-overview-delete'), 'Expected a delete button on each overview user row');
    assert.ok(html.includes('overviewDeleteAccount'), 'Expected an overview delete-account helper');
  });

  it('hides the connection card and adds an interactive per-region per-van summary', () => {
    assert.ok(/<div class="setting-card hidden">\s*<h3>Connection<\/h3>/.test(html), 'Expected the Connection card to be hidden');
    assert.ok(html.includes('id="summaryBreakdown"'), 'Expected a summary breakdown container');
    assert.ok(html.includes('data-summary-status="pending"') && html.includes('data-summary-status="approved"') && html.includes('data-summary-status="declined"'), 'Expected pending/approved/declined summary tabs');
    assert.ok(html.includes("let summaryFilter = 'pending'"), 'Expected a summary status filter state');
    assert.ok(/data-summary-status/.test(html) && html.includes("summaryFilter = button.dataset.summaryStatus"), 'Expected the summary tabs to be wired up');
    assert.ok(html.includes('summary-region') && html.includes('summary-van') && html.includes('summary-request'), 'Expected the breakdown grouped by region then van');
    assert.ok(html.includes('const selected = byStatus(summaryFilter)'), 'Expected the breakdown to respect the chosen status');
    assert.ok(html.includes("customer.region || 'Unassigned'") && html.includes("customer.van || 'Unassigned'"), 'Expected missing region/van to fall back to Unassigned');
  });

  it('clears a dead session when the API rejects an expired token', () => {
    assert.ok(html.includes("'Invalid or expired authentication token'"), 'Expected the page to handle the expired-token message');
    assert.ok(/localStorage\.removeItem\('newDayToken'\)/.exec(html) && /\.removeItem\('newDayUser'\)/.test(html), 'Expected a stale token to clear the saved session');
    assert.ok(html.includes('window.fetch = async function'), 'Expected a fetch wrapper for session expiry');
  });
});