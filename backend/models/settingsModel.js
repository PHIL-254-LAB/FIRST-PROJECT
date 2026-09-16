const fs = require('node:fs/promises');
const path = require('node:path');

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'settings.json');
const defaultSettings = { requestsOpen: true, startDate: null, endDate: null, updatedAt: null, updatedBy: null };

async function readSettings() {
  try {
    const fileContents = await fs.readFile(dataFile, 'utf8');
    return { ...defaultSettings, ...JSON.parse(fileContents) };
  } catch (error) {
    if (error.code === 'ENOENT') return { ...defaultSettings };
    throw error;
  }
}

async function writeSettings(settings) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dataFile, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

async function get() {
  return readSettings();
}

async function update(updates) {
  const settings = { ...(await readSettings()), ...updates };
  await writeSettings(settings);
  return settings;
}

function isWithinWindow(settings, now = new Date()) {
  if (!settings.requestsOpen) return false;
  const day = now.toISOString().slice(0, 10);
  if (settings.startDate && day < settings.startDate) return false;
  if (settings.endDate && day > settings.endDate) return false;
  return true;
}

module.exports = { get, update, isWithinWindow };
