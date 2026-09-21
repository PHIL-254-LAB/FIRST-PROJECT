const fs = require('node:fs/promises');
const path = require('node:path');

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'login-log.json');
const MAX_ENTRIES = 500;

async function readLog() {
  try {
    const fileContents = await fs.readFile(dataFile, 'utf8');
    const entries = JSON.parse(fileContents);
    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeLog(entries) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dataFile, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}

async function append(entry) {
  const entries = await readLog();
  entries.push(entry);
  await writeLog(entries.slice(-MAX_ENTRIES));
  return entry;
}

async function getLog({ limit = 100 } = {}) {
  const entries = await readLog();
  return entries.slice(-limit).reverse();
}

module.exports = { append, getLog };