const fs = require('node:fs/promises');
const path = require('node:path');

const dataFile = path.join(__dirname, '..', 'data', 'customers.json');

async function readCustomers() {
  const fileContents = await fs.readFile(dataFile, 'utf8');
  const customers = JSON.parse(fileContents);
  return Array.isArray(customers) ? customers : [];
}

async function writeCustomers(customers) {
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

async function remove(id) {
  const customers = await readCustomers();
  const remainingCustomers = customers.filter((customer) => customer.id !== id);

  if (remainingCustomers.length === customers.length) {
    return false;
  }

  await writeCustomers(remainingCustomers);
  return true;
}

module.exports = {
  getAll,
  getById,
  create,
  remove
};
