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

module.exports = { findByUsername, create };
