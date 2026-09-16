const fs = require('node:fs/promises');
const path = require('node:path');

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'customers.json');

async function readCustomers() {
  try {
    const fileContents = await fs.readFile(dataFile, 'utf8');
    const customers = JSON.parse(fileContents);
    return Array.isArray(customers) ? customers : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeCustomers(customers) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dataFile, `${JSON.stringify(customers, null, 2)}\n`, 'utf8');
}

async function getAll() {
  return readCustomers();
}

async function getById(id) {
  const customers = await readCustomers();
  return customers.find((customer) => customer.id === id) || null;
}

async function create(customer) {
  const customers = await readCustomers();
  customers.push(customer);
  await writeCustomers(customers);
  return customer;
}

async function update(id, updates) {
  const customers = await readCustomers();
  const customer = customers.find((item) => item.id === id);

  if (!customer) {
    return null;
  }

  Object.assign(customer, updates);
  customer.id = id;
  await writeCustomers(customers);
  return customer;
}

async function remove(id) {
  const customers = await readCustomers();
  const remainingCustomers = customers.filter((customer) => customer.id !== id);

  if (remainingCustomers.length === customers.length) {
    return false;
  }

  await writeCustomers(remainingCustomers);
  return true;
}

async function updateStatus(id, updates) {
  const customers = await readCustomers();
  const customer = customers.find((item) => item.id === id);

  if (!customer) {
    return null;
  }

  Object.assign(customer, updates);
  await writeCustomers(customers);
  return customer;
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  updateStatus
};
