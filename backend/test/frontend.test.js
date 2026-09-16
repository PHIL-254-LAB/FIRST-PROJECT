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
    ['profilePanel', 'customersPanel', 'detailsPanel', 'adminPanel', 'loginScreen', 'app'].forEach((id) => {
      assert.ok(html.includes(`id="${id}"`), `Expected the page to define id="${id}"`);
    });

    assert.ok(html.includes("'http://localhost:3000/api'"), 'Expected the local API fallback URL');
  });

  it('escapes customer data before rendering it', () => {
    assert.ok(html.includes('const esc = (value)'), 'Expected the enhancement script to define an HTML escape helper');
    assert.ok(/esc\(customer\.customerName\)/.test(html), 'Expected rendered customer names to be escaped');
  });
});