const crypto = require('node:crypto');
const catalogModel = require('../models/catalogModel');

function validationError(message, field) {
  const error = new Error(message);
  error.statusCode = 400;
  error.field = field;
  return error;
}

function roundPrice(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function getOptions(request, response, next) {
  try {
    const [customers, skus] = await Promise.all([
      catalogModel.getCustomers({ activeOnly: true }),
      catalogModel.getSkus({ activeOnly: true })
    ]);
    response.json({
      success: true,
      customers: customers.map((customer) => ({ id: customer.id, name: customer.name })),
      skus: skus.map((sku) => ({ id: sku.id, name: sku.name, unitPrice: sku.unitPrice }))
    });
  } catch (error) {
    next(error);
  }
}

async function getManage(request, response, next) {
  try {
    const [customers, skus] = await Promise.all([
      catalogModel.getCustomers(),
      catalogModel.getSkus()
    ]);
    response.json({
      success: true,
      customers: customers.map((customer) => ({ id: customer.id, name: customer.name, active: customer.active !== false })),
      skus: skus.map((sku) => ({ id: sku.id, name: sku.name, unitPrice: sku.unitPrice, active: sku.active !== false }))
    });
  } catch (error) {
    next(error);
  }
}

async function getManage(request, response, next) {
  try {
    const [customers, skus] = await Promise.all([
      catalogModel.getCustomers(),
      catalogModel.getSkus()
    ]);
    response.json({ success: true, customers, skus });
  } catch (error) {
    next(error);
  }
}

async function createClaimCustomer(request, response, next) {
  try {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
    if (!name) throw validationError('Customer name cannot be empty', 'name');

    const existing = (await catalogModel.getCustomers()).find((customer) => customer.name.toLowerCase() === name.toLowerCase());
    if (existing) throw validationError('This customer is already in the list', 'name');

    const customer = await catalogModel.createCustomer({
      id: crypto.randomUUID(),
      name,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: request.user.username
    });
    response.status(201).json({ success: true, customer });
  } catch (error) {
    next(error);
  }
}

async function updateClaimCustomer(request, response, next) {
  try {
    const customer = await catalogModel.getCustomerById(request.params.id);
    if (!customer) return response.status(404).json({ success: false, message: 'Customer not found' });

    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
    if (!name) throw validationError('Customer name cannot be empty', 'name');

    const updated = await catalogModel.updateCustomer(customer.id, {
      name,
      updatedAt: new Date().toISOString(),
      updatedBy: request.user.username
    });
    response.json({ success: true, customer: updated });
  } catch (error) {
    next(error);
  }
}

async function setClaimCustomerActive(request, response, next) {
  try {
    const customer = await catalogModel.getCustomerById(request.params.id);
    if (!customer) return response.status(404).json({ success: false, message: 'Customer not found' });

    const active = request.body?.active !== false;
    const updated = await catalogModel.updateCustomer(customer.id, {
      active,
      updatedAt: new Date().toISOString(),
      updatedBy: request.user.username
    });
    response.json({ success: true, customer: updated });
  } catch (error) {
    next(error);
  }
}

async function createSku(request, response, next) {
  try {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim().toUpperCase() : '';
    const unitPrice = request.body?.unitPrice;

    if (!name) throw validationError('SKU name cannot be empty', 'name');
    if (typeof unitPrice !== 'number' || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw validationError('Unit price must be a positive number', 'unitPrice');
    }

    const existing = (await catalogModel.getSkus()).find((sku) => sku.name.toLowerCase() === name.toLowerCase());
    if (existing) throw validationError('This SKU is already in the list', 'name');

    const sku = await catalogModel.createSku({
      id: crypto.randomUUID(),
      name,
      unitPrice: roundPrice(unitPrice),
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: request.user.username
    });
    response.status(201).json({ success: true, sku });
  } catch (error) {
    next(error);
  }
}

async function updateSku(request, response, next) {
  try {
    const sku = await catalogModel.getSkuById(request.params.id);
    if (!sku) return response.status(404).json({ success: false, message: 'SKU not found' });

    const updates = {};
    if (request.body?.name !== undefined) {
      const name = typeof request.body.name === 'string' ? request.body.name.trim().toUpperCase() : '';
      if (!name) throw validationError('SKU name cannot be empty', 'name');
      updates.name = name;
    }
    if (request.body?.unitPrice !== undefined) {
      const unitPrice = request.body.unitPrice;
      if (typeof unitPrice !== 'number' || !Number.isFinite(unitPrice) || unitPrice < 0) {
        throw validationError('Unit price must be a positive number', 'unitPrice');
      }
      updates.unitPrice = roundPrice(unitPrice);
    }

    const updated = await catalogModel.updateSku(sku.id, {
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: request.user.username
    });
    response.json({ success: true, sku: updated });
  } catch (error) {
    next(error);
  }
}

async function setSkuActive(request, response, next) {
  try {
    const sku = await catalogModel.getSkuById(request.params.id);
    if (!sku) return response.status(404).json({ success: false, message: 'SKU not found' });

    const active = request.body?.active !== false;
    const updated = await catalogModel.updateSku(sku.id, {
      active,
      updatedAt: new Date().toISOString(),
      updatedBy: request.user.username
    });
    response.json({ success: true, sku: updated });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOptions,
  getManage,
  createClaimCustomer,
  updateClaimCustomer,
  setClaimCustomerActive,
  createSku,
  updateSku,
  setSkuActive
};