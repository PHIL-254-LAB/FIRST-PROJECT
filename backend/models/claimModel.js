const fs = require('node:fs/promises');
const path = require('node:path');

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'claims.json');

async function readClaims() {
  try {
    const fileContents = await fs.readFile(dataFile, 'utf8');
    const claims = JSON.parse(fileContents);
    return Array.isArray(claims) ? claims : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeClaims(claims) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dataFile, `${JSON.stringify(claims, null, 2)}\n`, 'utf8');
}

async function getAll() {
  const claims = await readClaims();
  return [...claims].reverse();
}

async function getById(id) {
  const claims = await readClaims();
  return claims.find((claim) => claim.id === id) || null;
}

async function nextClaimNumber() {
  const claims = await readClaims();
  return claims.length + 1;
}

async function create(claim) {
  const claims = await readClaims();
  claims.push(claim);
  await writeClaims(claims);
  return claim;
}

async function updateApproval(id, updates) {
  const claims = await readClaims();
  const claim = claims.find((item) => item.id === id);
  if (!claim) return null;
  Object.assign(claim, updates);
  await writeClaims(claims);
  return claim;
}

async function remove(id) {
  const claims = await readClaims();
  const remaining = claims.filter((claim) => claim.id !== id);
  if (remaining.length === claims.length) return false;
  await writeClaims(remaining);
  return true;
}

module.exports = { getAll, getById, nextClaimNumber, create, updateApproval, remove };