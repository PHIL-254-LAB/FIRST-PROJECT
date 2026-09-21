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
    assert.ok(/const productChoices = \[/.test(html), 'Expected a product list to feed the SKU dropdown');
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
    ['claimsPanel', 'claimsAdminPanel', 'claimsAdminNav', 'claimForm', 'claimCustomer', 'claimSkuList', 'claimList', 'claimTotal', 'saveClaimButton', 'printClaimDraftButton', 'exportClaimDraftButton', 'claimsAdminCustomers', 'claimsAdminSkus', 'claimsAdminClaims'].forEach((id) => {
      assert.ok(html.includes(`id="${id}"`), `Expected the page to define id="${id}"`);
    });

    assert.ok(html.includes("'/api/claims'"), 'Expected the claims API base URL');
    assert.ok(html.includes('/api/catalog/options'), 'Expected the claim catalog options endpoint');
  });

  it('defines the accounts management panel for administrators', () => {
    ['accountsPanel', 'accountsNav', 'accountForm', 'accountName', 'accountUsername', 'accountEmail', 'accountRegion', 'accountPassword', 'accountRole', 'accountSubmit', 'accountCancel', 'accountList', 'accountsRefreshButton'].forEach((id) => {
      assert.ok(html.includes(`id="${id}"`), `Expected the page to define id="${id}"`);
    });

    assert.ok(html.includes("'/admin/users'"), 'Expected the accounts API endpoint');
    assert.ok(html.includes('loadAccounts'), 'Expected an account list loader');
    assert.ok(html.includes('resetAccountPassword'), 'Expected a password reset helper');
    assert.ok(html.includes('switchAccountsPage'), 'Expected the accounts page to be wired into navigation');
  });

  it('locks the claim unit price and warns on duplicate SKUs', () => {
    assert.ok(html.includes('class="claim-sku-price"'), 'Expected a claim unit-price input');
    assert.ok(/claim-sku-price[^>]*readonly/.test(html) || /input[^>]*class="claim-sku-price"[^>]*readonly/.test(html), 'Expected the claim unit price to be readonly');
    assert.ok(html.includes('checkClaimDuplicates'), 'Expected a duplicate-SKU checker');
    assert.ok(html.includes('updateClaimTotal'), 'Expected a claim total calculator');
  });

  it('includes print and Excel export helpers for claims', () => {
    assert.ok(html.includes('printClaim'), 'Expected a claim print helper');
    assert.ok(html.includes('exportClaimExcel'), 'Expected a claim Excel export helper');
    assert.ok(html.includes('DAHLIA BOTTLERS CLAIMS'), 'Expected the claim document title');
  });

  it('defines the overview system controls for administrators', () => {
    ['overviewAdminPanel', 'overviewAdminStatus', 'overviewAdminRefreshButton', 'connectionBadge', 'connectionDetail', 'connectionLastCheck', 'userList', 'settingsForm'].forEach((id) => {
      assert.ok(html.includes(`id="${id}"`), `Expected the page to define id="${id}"`);
    });

    assert.ok(html.includes("'/admin/login-log'"), 'Expected the login audit endpoint in the page');
    assert.ok(html.includes('loadOverviewControls'), 'Expected a system-controls loader');
    assert.ok(html.includes('updateConnectionStatus') || html.includes('setConnectionStatus'), 'Expected a connection status helper');
    assert.ok(html.includes('renderOverviewUsers'), 'Expected an overview user list renderer');
  });
});