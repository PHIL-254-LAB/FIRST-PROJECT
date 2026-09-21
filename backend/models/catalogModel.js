const fs = require('node:fs/promises');
const path = require('node:path');

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'catalog.json');

const CURRENCY = 'KES';

const seedSkus = [
  { name: 'CHOCO 30G', unitPrice: 17 },
  { name: 'CHOCO 100G', unitPrice: 62 },
  { name: 'CHOCO 250G', unitPrice: 169.6 },
  { name: 'CHOCO 500G', unitPrice: 321 },
  { name: 'VANILLA 500G', unitPrice: 267 },
  { name: 'VANILLA 1KG', unitPrice: 522 },
  { name: 'BB 20G', unitPrice: 8 },
  { name: 'BB 30G', unitPrice: 15.9 },
  { name: 'BB 100G', unitPrice: 58 },
  { name: 'BB 250G', unitPrice: 142 },
  { name: 'BB 500G', unitPrice: 267 },
  { name: 'BB 1KG', unitPrice: 522 }
];

const seedCustomers = ['BENGWELA', 'WINO MART', 'RAMULA', 'TIN MART', 'MULAMBO'];

const slug = (value) => String(value).replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
const seedSkuId = (name) => `seed-sku-${slug(name)}`;

const emptyCatalog = () => ({ customers: [], skus: [] });

async function readCatalog() {
  try {
    const fileContents = await fs.readFile(dataFile, 'utf8');
    const catalog = JSON.parse(fileContents);
    return {
      customers: Array.isArray(catalog.customers) ? catalog.customers : [],
      skus: Array.isArray(catalog.skus) ? catalog.skus : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') return emptyCatalog();
    throw error;
  }
}

async function writeCatalog(catalog) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dataFile, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
}

async function getCustomers(options = {}) {
  const catalog = await readCatalog();
  let customers = catalog.customers;
  if (options.activeOnly) customers = customers.filter((customer) => customer.active !== false);
  return customers;
}

async function getCustomerById(id) {
  const catalog = await readCatalog();
  return catalog.customers.find((customer) => customer.id === id) || null;
}

async function createCustomer(customer) {
  const catalog = await readCatalog();
  catalog.customers.push(customer);
  await writeCatalog(catalog);
  return customer;
}

async function updateCustomer(id, updates) {
  const catalog = await readCatalog();
  const customer = catalog.customers.find((item) => item.id === id);
  if (!customer) return null;
  Object.assign(customer, updates);
  await writeCatalog(catalog);
  return customer;
}

async function getSkus(options = {}) {
  const catalog = await readCatalog();
  let skus = catalog.skus;
  if (options.activeOnly) skus = skus.filter((sku) => sku.active !== false);
  return skus;
}

async function getSkuById(id) {
  const catalog = await readCatalog();
  return catalog.skus.find((sku) => sku.id === id) || null;
}

async function createSku(sku) {
  const catalog = await readCatalog();
  catalog.skus.push(sku);
  await writeCatalog(catalog);
  return sku;
}

async function updateSku(id, updates) {
  const catalog = await readCatalog();
  const sku = catalog.skus.find((item) => item.id === id);
  if (!sku) return null;
  Object.assign(sku, updates);
  await writeCatalog(catalog);
  return sku;
}

async function ensureSeedCatalog() {
  const catalog = await readCatalog();
  let changed = false;
  const now = new Date().toISOString();

  // Idempotent product-master upsert: update prices in place, never duplicate.
  for (const seed of seedSkus) {
    const existing = catalog.skus.find((sku) => sku.id === seedSkuId(seed.name))
      || catalog.skus.find((sku) => String(sku.name || '').toUpperCase() === seed.name.toUpperCase());

    if (!existing) {
      catalog.skus.push({
        id: seedSkuId(seed.name),
        name: seed.name,
        unitPrice: seed.unitPrice,
        currency: CURRENCY,
        active: true,
        createdAt: now,
        updatedAt: now
      });
      changed = true;
      continue;
    }

    if (existing.name !== seed.name) { existing.name = seed.name; changed = true; }
    if (typeof existing.unitPrice !== 'number' || existing.unitPrice !== seed.unitPrice) {
      existing.unitPrice = seed.unitPrice;
      existing.updatedAt = now;
      changed = true;
    }
    if (existing.currency !== CURRENCY) { existing.currency = CURRENCY; changed = true; }
    if (!existing.updatedAt) { existing.updatedAt = now; changed = true; }
  }

  if (catalog.customers.length === 0) {
    for (const name of seedCustomers) {
      catalog.customers.push({
        id: `seed-customer-${name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}`,
        name,
        active: true,
        createdAt: new Date().toISOString()
      });
    }
    changed = true;
  }

  if (changed) await writeCatalog(catalog);
  return catalog;
}

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  getSkus,
  getSkuById,
  createSku,
  updateSku,
  ensureSeedCatalog,
  seedCustomers,
  seedSkus,
  CURRENCY
};