const fs = require('node:fs/promises');
const path = require('node:path');

const dataFile = path.join(__dirname, '..', 'data', 'users.json');

async function readUsers() {
  const fileContents = await fs.readFile(dataFile, 'utf8');
  const users = JSON.parse(fileContents);
  return Array.isArray(users) ? users : [];
}

async function writeUsers(users) {
  await fs.writeFile(dataFile, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
}

async function findByUsername(username) {
  const users = await readUsers();
  return users.find((user) => user.username === username) || null;
}

async function create(user) {
  const users = await readUsers();
  users.push(user);
  await writeUsers(users);
  return user;
}

async function ensureSeedUsers() {
  const users = await readUsers();
  const adminExists = users.some((user) => user.username === 'admin');

  if (!adminExists) {
    users.push({
      id: 'seed-admin',
      username: 'admin',
      passwordHash: '$2b$12$BWzxZFOIgT6Vba1t6RXck.hnfAoGcXVgB215qGp2pGf8J2N81SwU2',
      name: 'Dahlia Administrator',
      email: 'admin@dahliabluebandsort.com',
      role: 'admin',
      createdAt: '2026-09-05T00:00:00.000Z'
    });
    await writeUsers(users);
  }
}

module.exports = { findByUsername, create, ensureSeedUsers };
