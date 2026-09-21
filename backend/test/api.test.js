'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const bcrypt = require('bcryptjs');
const { describe, it, before, after } = require('node:test');

const dataDir = path.join(os.tmpdir(), `dahlia-blueband-sort-test-${process.pid}`);

// Models and middleware read these values when they are first required.
process.env.DATA_DIR = dataDir;
process.env.JWT_SECRET = 'test-secret-not-used-in-production';

const ADMIN_PASSWORD = 'admin-secret-1';
const USER_PASSWORD = 'secret123';

let server;
let baseUrl;
let customerId;
let userToken;
let adminToken;
let userId;

async function api(method, endpoint, options = {}) {
  const headers = options.token ? { Authorization: `Bearer ${options.token}` } : {};

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();

  return { status: response.status, data: text ? JSON.parse(text) : {} };
}

before(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, 'users.json'), JSON.stringify([
    {
      id: 'test-admin',
      username: 'admin',
      passwordHash: bcrypt.hashSync(ADMIN_PASSWORD, 10),
      name: 'Test Administrator',
      email: 'admin@example.com',
      role: 'admin',
      createdAt: new Date().toISOString()
    }
  ], null, 2));
  await fs.writeFile(path.join(dataDir, 'customers.json'), '[]\n');
  await fs.writeFile(path.join(dataDir, 'settings.json'), JSON.stringify({ requestsOpen: true, startDate: null, endDate: null }, null, 2));

  const app = require('../server');
  const userModel = require('../models/userModel');
  const catalogModel = require('../models/catalogModel');

  await userModel.ensureSeedUsers();
  await catalogModel.ensureSeedCatalog();

  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe('Dahlia Blue Band Sort API', () => {
  it('reports API health', async () => {
    const { status, data } = await api('GET', '/api/health');
    assert.equal(status, 200);
    assert.equal(data.success, true);
  });

  it('returns 404 for unknown routes', async () => {
    const { status, data } = await api('GET', '/api/does-not-exist');
    assert.equal(status, 404);
    assert.equal(data.success, false);
  });

  it('requires authentication for customer records', async () => {
    assert.equal((await api('GET', '/api/customers')).status, 401);
    assert.equal((await api('GET', '/api/admin/settings')).status, 401);
  });

  it('creates a regular user account', async () => {
    const { status, data } = await api('POST', '/api/auth/register', {
      body: { username: 'testuser', password: USER_PASSWORD, name: 'Test User', email: 'test@example.com', region: 'Kakamega' }
    });

    assert.equal(status, 201);
    assert.equal(data.user.role, 'user');
    assert.equal(data.user.region, 'Kakamega');
    assert.equal(data.user.passwordHash, undefined);
    assert.ok(data.token);

    userToken = data.token;
    userId = data.user.id;
  });

  it('rejects duplicate usernames and invalid registration data', async () => {
    const duplicate = await api('POST', '/api/auth/register', {
      body: { username: 'testuser', password: USER_PASSWORD, name: 'Copy Cat', region: 'Busia' }
    });
    assert.equal(duplicate.status, 409);

    const badRegion = await api('POST', '/api/auth/register', {
      body: { username: 'otheruser', password: USER_PASSWORD, name: 'Other User', region: 'Nairobi' }
    });
    assert.equal(badRegion.status, 400);
    assert.equal(badRegion.data.field, 'region');

    const shortPassword = await api('POST', '/api/auth/register', {
      body: { username: 'otheruser', password: '123', name: 'Other User', region: 'Busia' }
    });
    assert.equal(shortPassword.status, 400);
    assert.equal(shortPassword.data.field, 'password');
  });

  it('signs in and rejects a wrong password', async () => {
    const wrong = await api('POST', '/api/auth/login', { body: { username: 'testuser', password: 'wrong-password', region: 'Kakamega' } });
    assert.equal(wrong.status, 401);

    const ok = await api('POST', '/api/auth/login', { body: { username: 'testuser', password: USER_PASSWORD, region: 'Kakamega' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.user.username, 'testuser');
    assert.ok(ok.data.token);

    const me = await api('GET', '/api/auth/me', { token: ok.data.token });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.username, 'testuser');
  });

  it('saves a customer and calculates totals on the server', async () => {
    const { status, data } = await api('POST', '/api/customers', {
      token: userToken,
      body: {
        customerName: 'Test Shop',
        totalAmount: 1,
        totalPieces: 1,
        products: [
          { product: 'Blue Band 500g', pieces: 20, pricePerItem: 250, expiryDate: '2027-12-31' },
          { product: 'Rama 500g', pieces: 5, pricePerItem: 200, expiryDate: '2027-06-30' }
        ]
      }
    });

    assert.equal(status, 201);
    assert.equal(data.customer.status, 'pending');
    assert.equal(data.customer.region, 'Kakamega');
    assert.equal(data.customer.totalPieces, 25);
    assert.equal(data.customer.totalAmount, 6000);
    assert.equal(data.customer.products[0].total, 5000);

    customerId = data.customer.id;
  });

  it('rejects invalid customer payloads', async () => {
    const noProducts = await api('POST', '/api/customers', { token: userToken, body: { customerName: 'Empty Shop', products: [] } });
    assert.equal(noProducts.status, 400);
    assert.equal(noProducts.data.field, 'products');

    const noName = await api('POST', '/api/customers', {
      token: userToken,
      body: { customerName: '   ', products: [{ product: 'Blue Band 500g', pieces: 1, pricePerItem: 250, expiryDate: '2027-12-31' }] }
    });
    assert.equal(noName.status, 400);

    const badPieces = await api('POST', '/api/customers', {
      token: userToken,
      body: { customerName: 'Bad Shop', products: [{ product: 'Blue Band 500g', pieces: 0, pricePerItem: 250, expiryDate: '2027-12-31' }] }
    });
    assert.equal(badPieces.status, 400);

    const badExpiry = await api('POST', '/api/customers', {
      token: userToken,
      body: { customerName: 'Bad Shop', products: [{ product: 'Blue Band 500g', pieces: 2, pricePerItem: 250, expiryDate: 'tomorrow' }] }
    });
    assert.equal(badExpiry.status, 400);
  });

  it('reports the request window to signed-in users', async () => {
    const { status, data } = await api('GET', '/api/customers/request-window', { token: userToken });
    assert.equal(status, 200);
    assert.equal(data.requestsOpen, true);
  });

  it('updates a customer record and recalculates totals', async () => {
    const { status, data } = await api('PUT', `/api/customers/${customerId}`, {
      token: userToken,
      body: {
        customerName: 'Test Shop Updated',
        products: [{ product: 'Blue Band 1kg', pieces: 10, pricePerItem: 320, expiryDate: '2028-01-31' }]
      }
    });

    assert.equal(status, 200);
    assert.equal(data.customer.customerName, 'Test Shop Updated');
    assert.equal(data.customer.totalPieces, 10);
    assert.equal(data.customer.totalAmount, 3200);
    assert.equal(data.customer.status, 'pending');
    assert.equal(data.customer.updatedBy, 'testuser');

    const stored = await api('GET', `/api/customers/${customerId}`, { token: userToken });
    assert.equal(stored.status, 200);
    assert.equal(stored.data.customer.customerName, 'Test Shop Updated');
  });

  it('rejects invalid or unknown customer updates', async () => {
    const noProducts = await api('PUT', `/api/customers/${customerId}`, {
      token: userToken,
      body: { customerName: 'Test Shop', products: [] }
    });
    assert.equal(noProducts.status, 400);

    const unknown = await api('PUT', '/api/customers/unknown-id', {
      token: userToken,
      body: { customerName: 'Ghost Shop', products: [{ product: 'Blue Band 500g', pieces: 1, pricePerItem: 250, expiryDate: '2027-12-31' }] }
    });
    assert.equal(unknown.status, 404);
  });

  it('adds notes to a customer record', async () => {
    const { status, data } = await api('POST', `/api/customers/${customerId}/notes`, {
      token: userToken,
      body: { note: 'Deliver before Friday.' }
    });

    assert.equal(status, 201);
    assert.equal(data.customer.notes.length, 1);
    assert.equal(data.customer.notes[0].author, 'testuser');
    assert.equal(data.customer.notes[0].text, 'Deliver before Friday.');

    const empty = await api('POST', `/api/customers/${customerId}/notes`, { token: userToken, body: { note: '   ' } });
    assert.equal(empty.status, 400);

    const unknown = await api('POST', '/api/customers/unknown-id/notes', { token: userToken, body: { note: 'Hello' } });
    assert.equal(unknown.status, 404);
  });

  it('changes the password of the signed-in user', async () => {
    const wrong = await api('PATCH', '/api/auth/password', {
      token: userToken,
      body: { currentPassword: 'not-the-password', newPassword: 'brand-new-secret' }
    });
    assert.equal(wrong.status, 401);

    const changed = await api('PATCH', '/api/auth/password', {
      token: userToken,
      body: { currentPassword: USER_PASSWORD, newPassword: 'brand-new-secret' }
    });
    assert.equal(changed.status, 200);

    const oldPassword = await api('POST', '/api/auth/login', { body: { username: 'testuser', password: USER_PASSWORD, region: 'Kakamega' } });
    assert.equal(oldPassword.status, 401);

    const newPassword = await api('POST', '/api/auth/login', { body: { username: 'testuser', password: 'brand-new-secret', region: 'Kakamega' } });
    assert.equal(newPassword.status, 200);
    userToken = newPassword.data.token;
  });

  it('blocks regular users from administrator actions', async () => {
    const approve = await api('PATCH', `/api/customers/${customerId}/status`, { token: userToken, body: { status: 'approved', operatingDeadline: '2026-10-01' } });
    assert.equal(approve.status, 403);

    const settings = await api('GET', '/api/admin/settings', { token: userToken });
    assert.equal(settings.status, 403);

    const users = await api('GET', '/api/admin/users', { token: userToken });
    assert.equal(users.status, 403);

    assert.ok(userId);
    const role = await api('PATCH', `/api/admin/users/${userId}/role`, { token: userToken, body: { role: 'admin' } });
    assert.equal(role.status, 403);
  });
});

describe('Administrator workflows', () => {
  it('signs in the seeded administrator', async () => {
    const { status, data } = await api('POST', '/api/auth/login', { body: { username: 'admin', password: ADMIN_PASSWORD, region: 'Kakamega' } });
    assert.equal(status, 200);
    assert.equal(data.user.role, 'admin');
    adminToken = data.token;
  });

  it('lists registered users without password hashes', async () => {
    const { status, data } = await api('GET', '/api/admin/users', { token: adminToken });
    assert.equal(status, 200);
    assert.equal(data.users.length, 2);
    assert.ok(data.users.every((user) => user.passwordHash === undefined));
  });

  it('approves a request with an operating deadline', async () => {
    const { status, data } = await api('PATCH', `/api/customers/${customerId}/status`, {
      token: adminToken,
      body: { status: 'approved', operatingDeadline: '2026-10-01' }
    });

    assert.equal(status, 200);
    assert.equal(data.customer.status, 'approved');
    assert.equal(data.customer.operatingDeadline, '2026-10-01');
    assert.equal(data.customer.reviewedBy, 'admin');
  });

  it('declines a request without a deadline', async () => {
    const { status, data } = await api('PATCH', `/api/customers/${customerId}/status`, { token: adminToken, body: { status: 'declined' } });
    assert.equal(status, 200);
    assert.equal(data.customer.status, 'declined');
    assert.equal(data.customer.operatingDeadline, null);
  });

  it('validates review payloads and unknown customers', async () => {
    const badStatus = await api('PATCH', `/api/customers/${customerId}/status`, { token: adminToken, body: { status: 'archived' } });
    assert.equal(badStatus.status, 400);
    assert.equal(badStatus.data.field, 'status');

    const badDeadline = await api('PATCH', `/api/customers/${customerId}/status`, { token: adminToken, body: { status: 'approved', operatingDeadline: 'next week' } });
    assert.equal(badDeadline.status, 400);
    assert.equal(badDeadline.data.field, 'operatingDeadline');

    const unknown = await api('PATCH', '/api/customers/unknown-id/status', { token: adminToken, body: { status: 'approved' } });
    assert.equal(unknown.status, 404);
  });

  it('updates the request window and enforces it', async () => {
    const close = await api('PATCH', '/api/admin/settings', { token: adminToken, body: { requestsOpen: false, startDate: null, endDate: null } });
    assert.equal(close.status, 200);
    assert.equal(close.data.settings.requestsOpen, false);
    assert.equal(close.data.settings.updatedBy, 'admin');

    const blocked = await api('POST', '/api/customers', {
      token: userToken,
      body: { customerName: 'Closed Shop', products: [{ product: 'Blue Band 500g', pieces: 1, pricePerItem: 250, expiryDate: '2027-12-31' }] }
    });
    assert.equal(blocked.status, 403);

    const outsideRange = await api('PATCH', '/api/admin/settings', { token: adminToken, body: { requestsOpen: true, startDate: '2030-01-01', endDate: '2030-01-31' } });
    assert.equal(outsideRange.status, 200);

    const stillBlocked = await api('POST', '/api/customers', {
      token: userToken,
      body: { customerName: 'Future Shop', products: [{ product: 'Blue Band 500g', pieces: 1, pricePerItem: 250, expiryDate: '2027-12-31' }] }
    });
    assert.equal(stillBlocked.status, 403);

    const reversedRange = await api('PATCH', '/api/admin/settings', { token: adminToken, body: { requestsOpen: true, startDate: '2026-05-01', endDate: '2026-04-01' } });
    assert.equal(reversedRange.status, 400);

    const reopen = await api('PATCH', '/api/admin/settings', { token: adminToken, body: { requestsOpen: true, startDate: null, endDate: null } });
    assert.equal(reopen.status, 200);

    const window = await api('GET', '/api/customers/request-window', { token: userToken });
    assert.equal(window.data.requestsOpen, true);
  });

  it('promotes and demotes account roles with guard rails', async () => {
    const invalid = await api('PATCH', `/api/admin/users/${userId}/role`, { token: adminToken, body: { role: 'owner' } });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.data.field, 'role');

    const promote = await api('PATCH', `/api/admin/users/${userId}/role`, { token: adminToken, body: { role: 'admin' } });
    assert.equal(promote.status, 200);
    assert.equal(promote.data.user.role, 'admin');

    const self = await api('PATCH', '/api/admin/users/test-admin/role', { token: adminToken, body: { role: 'user' } });
    assert.equal(self.status, 400);
    assert.equal(self.data.message, 'You cannot change your own role');

    const promotedLogin = await api('POST', '/api/auth/login', { body: { username: 'testuser', password: 'brand-new-secret', region: 'Kakamega' } });
    assert.equal(promotedLogin.status, 200);
    assert.equal(promotedLogin.data.user.role, 'admin');

    const demote = await api('PATCH', '/api/admin/users/test-admin/role', { token: promotedLogin.data.token, body: { role: 'user' } });
    assert.equal(demote.status, 200);
    assert.equal(demote.data.user.role, 'user');

    const lastAdmin = await api('PATCH', `/api/admin/users/${userId}/role`, { token: adminToken, body: { role: 'user' } });
    assert.equal(lastAdmin.status, 400);
    assert.equal(lastAdmin.data.message, 'At least one administrator must remain');

    const unknown = await api('PATCH', '/api/admin/users/unknown-id/role', { token: adminToken, body: { role: 'admin' } });
    assert.equal(unknown.status, 404);
  });

  it('persists users, customers, and settings to disk', async () => {
    const users = JSON.parse(await fs.readFile(path.join(dataDir, 'users.json'), 'utf8'));
    const storedUser = users.find((user) => user.username === 'testuser');
    assert.equal(storedUser.role, 'admin');
    assert.ok(storedUser.passwordHash.startsWith('$2'));

    const customers = JSON.parse(await fs.readFile(path.join(dataDir, 'customers.json'), 'utf8'));
    const storedCustomer = customers.find((customer) => customer.id === customerId);
    assert.equal(storedCustomer.customerName, 'Test Shop Updated');
    assert.equal(storedCustomer.notes.length, 1);

    const settings = JSON.parse(await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8'));
    assert.equal(settings.requestsOpen, true);
    assert.equal(settings.updatedBy, 'admin');
  });

  it('deletes a customer record once', async () => {
    const deleted = await api('DELETE', `/api/customers/${customerId}`, { token: adminToken });
    assert.equal(deleted.status, 200);

    const again = await api('DELETE', `/api/customers/${customerId}`, { token: adminToken });
    assert.equal(again.status, 404);

    const list = await api('GET', '/api/customers', { token: adminToken });
    assert.equal(list.status, 200);
    assert.equal(list.data.customers.length, 0);
  });
});

describe('Account administration', () => {
  let newAccountId;

  it('blocks regular users from creating or editing accounts', async () => {
    const created = await api('POST', '/api/admin/users', {
      token: userToken,
      body: { username: 'sneaky', password: 'secret123', name: 'Sneaky', role: 'admin' }
    });
    assert.equal(created.status, 403);

    const edited = await api('PUT', `/api/admin/users/${userId}`, {
      token: userToken,
      body: { username: 'hijacked', name: 'Test User' }
    });
    assert.equal(edited.status, 403);

    const reset = await api('PATCH', `/api/admin/users/${userId}/password`, {
      token: userToken,
      body: { newPassword: 'secret123' }
    });
    assert.equal(reset.status, 403);
  });

  it('creates an account with a password and role', async () => {
    const created = await api('POST', '/api/admin/users', {
      token: adminToken,
      body: { username: 'juma', password: 'juma-pass', name: 'Juma Otieno', email: 'juma@example.com', region: 'Busia', role: 'user' }
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.user.username, 'juma');
    assert.equal(created.data.user.role, 'user');
    assert.equal(created.data.user.region, 'Busia');
    assert.equal(created.data.user.passwordHash, undefined);
    newAccountId = created.data.user.id;

    const login = await api('POST', '/api/auth/login', { body: { username: 'juma', password: 'juma-pass', region: 'Busia' } });
    assert.equal(login.status, 200);
    assert.equal(login.data.user.name, 'Juma Otieno');
  });

  it('rejects invalid new-account data and duplicate usernames', async () => {
    const duplicate = await api('POST', '/api/admin/users', {
      token: adminToken,
      body: { username: 'juma', password: 'juma-pass', name: 'Copy Cat' }
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.field, 'username');

    const shortPassword = await api('POST', '/api/admin/users', {
      token: adminToken,
      body: { username: 'another', password: '123', name: 'Another' }
    });
    assert.equal(shortPassword.status, 400);
    assert.equal(shortPassword.data.field, 'password');

    const badRegion = await api('POST', '/api/admin/users', {
      token: adminToken,
      body: { username: 'another', password: 'secret123', name: 'Another', region: 'Nairobi' }
    });
    assert.equal(badRegion.status, 400);
    assert.equal(badRegion.data.field, 'region');

    const badRole = await api('POST', '/api/admin/users', {
      token: adminToken,
      body: { username: 'another', password: 'secret123', name: 'Another', role: 'owner' }
    });
    assert.equal(badRole.status, 400);
    assert.equal(badRole.data.field, 'role');
  });

  it('edits a login name and profile details', async () => {
    const renamed = await api('PUT', `/api/admin/users/${newAccountId}`, {
      token: adminToken,
      body: { username: 'juma.otieno', name: 'Juma Otieno Jnr', email: 'juma2@example.com', region: 'Kakamega' }
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.data.user.username, 'juma.otieno');
    assert.equal(renamed.data.user.name, 'Juma Otieno Jnr');

    const oldLogin = await api('POST', '/api/auth/login', { body: { username: 'juma', password: 'juma-pass', region: 'Kakamega' } });
    assert.equal(oldLogin.status, 401);

    const newLogin = await api('POST', '/api/auth/login', { body: { username: 'juma.otieno', password: 'juma-pass', region: 'Kakamega' } });
    assert.equal(newLogin.status, 200);
    assert.equal(newLogin.data.user.name, 'Juma Otieno Jnr');
  });

  it('blocks taking an existing username', async () => {
    const taken = await api('PUT', `/api/admin/users/${newAccountId}`, {
      token: adminToken,
      body: { username: 'testuser', name: 'Juma Otieno Jnr' }
    });
    assert.equal(taken.status, 409);
    assert.equal(taken.data.field, 'username');
  });

  it('resets a password and invalidates the old one', async () => {
    const reset = await api('PATCH', `/api/admin/users/${newAccountId}/password`, {
      token: adminToken,
      body: { newPassword: 'brand-new-pass' }
    });
    assert.equal(reset.status, 200);

    const oldLogin = await api('POST', '/api/auth/login', { body: { username: 'juma.otieno', password: 'juma-pass', region: 'Kakamega' } });
    assert.equal(oldLogin.status, 401);

    const newLogin = await api('POST', '/api/auth/login', { body: { username: 'juma.otieno', password: 'brand-new-pass', region: 'Kakamega' } });
    assert.equal(newLogin.status, 200);
    assert.equal(newLogin.data.user.username, 'juma.otieno');

    const short = await api('PATCH', `/api/admin/users/${newAccountId}/password`, { token: adminToken, body: { newPassword: '123' } });
    assert.equal(short.status, 400);
    assert.equal(short.data.field, 'newPassword');

    const unknown = await api('PATCH', '/api/admin/users/unknown-id/password', { token: adminToken, body: { newPassword: 'six-chars' } });
    assert.equal(unknown.status, 404);
  });
});

describe('Claim administration', () => {
  let seededSku;
  let newCustomerId;
  let newSkuId;

  it('serves the claim catalog options to signed-in users', async () => {
    const { status, data } = await api('GET', '/api/catalog/options', { token: userToken });
    assert.equal(status, 200);
    const sku = data.skus.find((item) => item.name === 'BB 250G');
    assert.ok(sku, 'Expected the seeded BB 250G SKU');
    assert.equal(sku.unitPrice, 142);
    assert.equal(sku.id, 'seed-sku-bb-250g');
    assert.ok(data.customers.some((customer) => customer.name === 'BENGWELA'));
    seededSku = sku;
  });

  it('blocks regular users from administering the claim catalog', async () => {
    const createCustomer = await api('POST', '/api/catalog/customers', { token: userToken, body: { name: 'Nope' } });
    assert.equal(createCustomer.status, 403);

    const createSku = await api('POST', '/api/catalog/skus', { token: adminToken === undefined ? userToken : userToken, body: { name: 'Nope', unitPrice: 5 } });
    assert.equal(createSku.status, 403);

    const options = await api('GET', '/api/catalog/options', { token: userToken });
    assert.equal(options.status, 200);
  });

  it('lets an administrator add and edit a claim customer', async () => {
    const created = await api('POST', '/api/catalog/customers', { token: adminToken, body: { name: '  MISIKHU  ' } });
    assert.equal(created.status, 201);
    assert.equal(created.data.customer.name, 'MISIKHU');
    assert.equal(created.data.customer.active, true);
    newCustomerId = created.data.customer.id;

    const duplicate = await api('POST', '/api/catalog/customers', { token: adminToken, body: { name: 'misikhu' } });
    assert.equal(duplicate.status, 400);

    const updated = await api('PUT', `/api/catalog/customers/${newCustomerId}`, { token: adminToken, body: { name: 'MISIKHU SUPER' } });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.customer.name, 'MISIKHU SUPER');
  });

  it('deactivates a claim customer and removes it from the options', async () => {
    const deactivated = await api('PATCH', `/api/catalog/customers/${newCustomerId}/active`, { token: adminToken, body: { active: false } });
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.data.customer.active, false);

    const options = await api('GET', '/api/catalog/options', { token: userToken });
    assert.ok(!options.data.customers.some((customer) => customer.id === newCustomerId));
  });

  it('lets an administrator add a SKU and update its price', async () => {
    const created = await api('POST', '/api/catalog/skus', { token: adminToken, body: { name: 'vanilla 250g', unitPrice: 155.5 } });
    assert.equal(created.status, 201);
    assert.equal(created.data.sku.name, 'VANILLA 250G');
    assert.equal(created.data.sku.unitPrice, 155.5);
    newSkuId = created.data.sku.id;

    const badPrice = await api('POST', '/api/catalog/skus', { token: adminToken, body: { name: 'BAD SKU', unitPrice: -5 } });
    assert.equal(badPrice.status, 400);

    const updated = await api('PUT', `/api/catalog/skus/${newSkuId}`, { token: adminToken, body: { unitPrice: 201 } });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.sku.unitPrice, 201);

    const options = await api('GET', '/api/catalog/options', { token: userToken });
    const current = options.data.skus.find((sku) => sku.id === newSkuId);
    assert.equal(current.unitPrice, 201);
  });

  it('deactivates a SKU and removes it from the options', async () => {
    const deactivated = await api('PATCH', `/api/catalog/skus/${newSkuId}/active`, { token: adminToken, body: { active: false } });
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.data.sku.active, false);

    const options = await api('GET', '/api/catalog/options', { token: userToken });
    assert.ok(!options.data.skus.some((sku) => sku.id === newSkuId));
  });
});

describe('Customer claims', () => {
  const totalClaim = { id: null };

  it('saves a claim, calculates on the server, and ignores submitted prices', async () => {
    const { status, data } = await api('POST', '/api/claims', {
      token: userToken,
      body: {
        customerId: 'seed-customer-bengwela',
        items: [
          { skuId: 'seed-sku-bb-250g', quantity: 96, unitPrice: 1, amount: 1 },
          { skuId: 'seed-sku-choco-250g', quantity: 8 },
          { skuId: 'seed-sku-vanilla-500g', quantity: 12 }
        ]
      }
    });

    assert.equal(status, 201);
    const claim = data.claim;
    assert.equal(claim.customerName, 'BENGWELA');
    assert.equal(claim.claimNumber, 'DC-0001');
    assert.ok(claim.id);

    const bb250 = claim.items.find((item) => item.skuId === 'seed-sku-bb-250g');
    assert.equal(bb250.quantity, 96);
    assert.equal(bb250.unitPrice, 142);
    assert.equal(bb250.amount, 13632);
    assert.equal(bb250.discountAmount, 6816);

    const choco = claim.items.find((item) => item.skuId === 'seed-sku-choco-250g');
    assert.equal(choco.amount, 1356.8);
    assert.equal(choco.discountAmount, 678.4);

    const vanilla = claim.items.find((item) => item.skuId === 'seed-sku-vanilla-500g');
    assert.equal(vanilla.amount, 3204);
    assert.equal(vanilla.discountAmount, 1602);

    assert.equal(claim.totalAmount, 13632 + 1356.8 + 3204);
    assert.equal(claim.totalDiscount, 6816 + 678.4 + 1602);
    totalClaim.id = claim.id;
  });

  it('rejects invalid claim payloads', async () => {
    const noCustomer = await api('POST', '/api/claims', { token: userToken, body: { items: [{ skuId: 'seed-sku-bb-250g', quantity: 1 }] } });
    assert.equal(noCustomer.status, 400);
    assert.equal(noCustomer.data.field, 'customerId');

    const noItems = await api('POST', '/api/claims', { token: userToken, body: { customerId: 'seed-customer-bengwela', items: [] } });
    assert.equal(noItems.status, 400);

    const badQuantity = await api('POST', '/api/claims', { token: userToken, body: { customerId: 'seed-customer-bengwela', items: [{ skuId: 'seed-sku-bb-250g', quantity: 0 }] } });
    assert.equal(badQuantity.status, 400);

    const unknownCustomer = await api('POST', '/api/claims', { token: userToken, body: { customerId: 'unknown-customer', items: [{ skuId: 'seed-sku-bb-250g', quantity: 1 }] } });
    assert.equal(unknownCustomer.status, 404);

    const unknownSku = await api('POST', '/api/claims', { token: userToken, body: { customerId: 'seed-customer-bengwela', items: [{ skuId: 'unknown-sku', quantity: 1 }] } });
    assert.equal(unknownSku.status, 404);

    const duplicateSku = await api('POST', '/api/claims', {
      token: userToken,
      body: { customerId: 'seed-customer-bengwela', items: [{ skuId: 'seed-sku-bb-250g', quantity: 1 }, { skuId: 'seed-sku-bb-250g', quantity: 2 }] }
    });
    assert.equal(duplicateSku.status, 400);
  });

  it('keeps historical claim prices when the administrator changes the SKU price', async () => {
    const priceUpdate = await api('PUT', '/api/catalog/skus/seed-sku-bb-250g', { token: adminToken, body: { unitPrice: 200 } });
    assert.equal(priceUpdate.status, 200);
    assert.equal(priceUpdate.data.sku.unitPrice, 200);

    const options = await api('GET', '/api/catalog/options', { token: userToken });
    assert.equal(options.data.skus.find((sku) => sku.id === 'seed-sku-bb-250g').unitPrice, 200);

    const saved = await api('GET', `/api/claims/${totalClaim.id}`, { token: userToken });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.claim.customerName, 'BENGWELA');
    const oldItem = saved.data.claim.items.find((item) => item.skuId === 'seed-sku-bb-250g');
    assert.equal(oldItem.unitPrice, 142, 'Historical claims must keep the price used at creation time');
    assert.equal(oldItem.amount, 13632);

    const fresh = await api('POST', '/api/claims', {
      token: userToken,
      body: { customerId: 'seed-customer-bengwela', items: [{ skuId: 'seed-sku-bb-250g', quantity: 1 }] }
    });
    assert.equal(fresh.status, 201);
    assert.equal(fresh.data.claim.items[0].unitPrice, 200, 'New claims must use the updated price');
    assert.equal(fresh.data.claim.items[0].amount, 200);
    assert.equal(fresh.data.claim.claimNumber, 'DC-0002');
  });

  it('lists claims and exports the Excel document', async () => {
    const list = await api('GET', '/api/claims', { token: userToken });
    assert.equal(list.status, 200);
    assert.equal(list.data.claims.length, 2);

    const response = await fetch(`${baseUrl}/api/claims/${totalClaim.id}/export`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert.equal(response.status, 200);
    const contentType = response.headers.get('content-type');
    assert.ok(contentType.includes('spreadsheetml'), `Expected an xlsx content type, got ${contentType}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    assert.ok(buffer.length > 1000, 'Expected a non-empty spreadsheet file');
    assert.equal(buffer.subarray(0, 2).toString(), 'PK', 'Expected a ZIP-based xlsx container');

    const missing = await fetch(`${baseUrl}/api/claims/unknown-id/export`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert.equal(missing.status, 404);
  });
});

describe('Login audit', () => {
  it('records failed and successful sign-ins newest-first', async () => {
    const failed = await api('POST', '/api/auth/login', { body: { username: 'ghost-user', password: 'wrong-password', region: 'Kakamega' } });
    assert.equal(failed.status, 401);

    const ok = await api('POST', '/api/auth/login', { body: { username: 'juma.otieno', password: 'brand-new-pass', region: 'Kakamega' } });
    assert.equal(ok.status, 200);

    const { status, data } = await api('GET', '/api/admin/login-log', { token: adminToken });
    assert.equal(status, 200);
    assert.ok(data.log.length >= 2);

    const newest = data.log[0];
    assert.equal(newest.username, 'juma.otieno');
    assert.equal(newest.success, true);
    assert.equal(newest.userId, ok.data.user.id);
    assert.equal(newest.name, 'Juma Otieno Jnr');
    assert.ok(typeof newest.userAgent === 'string');
    assert.ok(typeof newest.ip === 'string');
    assert.ok(new Date(newest.createdAt).getTime() <= Date.now());

    const second = data.log[1];
    assert.equal(second.username, 'ghost-user');
    assert.equal(second.success, false);
    assert.equal(second.userId, null);
  });

  it('blocks non-admins from reading the login audit', async () => {
    const { status } = await api('GET', '/api/admin/login-log', { token: userToken });
    assert.equal(status, 403);
  });

  it('lists only the most recent login entries', async () => {
    const { status, data } = await api('GET', '/api/admin/login-log?limit=1', { token: adminToken });
    assert.equal(status, 200);
    assert.equal(data.log.length, 1);
    assert.equal(data.log[0].username, 'juma.otieno');
  });
});