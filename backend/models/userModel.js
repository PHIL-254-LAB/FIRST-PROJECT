const fs = require('node:fs/promises');
const path = require('node:path');

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'users.json');

async function readUsers() {
  try {
    const fileContents = await fs.readFile(dataFile, 'utf8');
    const users = JSON.parse(fileContents);
    return Array.isArray(users) ? users : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeUsers(users) {
  await fs.mkdir(dataDir, { recursive: true });
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

async function getById(id) {
  const users = await readUsers();
  return users.find((user) => user.id === id) || null;
}

async function updateUser(id, updates) {
  const users = await readUsers();
  const user = users.find((item) => item.id === id);

  if (!user) {
    return null;
  }

  Object.assign(user, updates);
  user.id = id;
  await writeUsers(users);
  return user;
}

async function updatePassword(id, passwordHash) {
  return updateUser(id, { passwordHash, passwordChangedAt: new Date().toISOString() });
}

async function updateRole(id, role) {
  return updateUser(id, { role, roleChangedAt: new Date().toISOString() });
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

async function getPublicUsers() {
  const users = await readUsers();
  return users.map(({ passwordHash, ...user }) => user);
}

module.exports = {
  findByUsername,
  getById,
  create,
  updateUser,
  updatePassword,
  updateRole,
  ensureSeedUsers,
  getPublicUsers
};
