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

  await userModel.ensureSeedUsers();

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