const crypto = require('node:crypto');
const customerModel = require('../models/customerModel');

function validationError(message, field) {
  const error = new Error(message);
  error.statusCode = 400;
  error.field = field;
  return error;
}

function validateAndBuildCustomer(body) {
  const customerName = typeof body?.customerName === 'string'
    ? body.customerName.trim()
    : '';

  if (!customerName) {
    throw validationError('Customer name cannot be empty', 'customerName');
  }

  if (!Array.isArray(body.products) || body.products.length === 0) {
    throw validationError('At least one product must be submitted', 'products');
  }

  const products = body.products.map((item, index) => {
    const product = typeof item?.product === 'string' ? item.product.trim() : '';
    const pieces = item?.pieces;
    const pricePerItem = item?.pricePerItem;
    const expiryDate = typeof item?.expiryDate === 'string' ? item.expiryDate.trim() : '';

    if (!product) {
      throw validationError(`Product/SKU cannot be empty at index ${index}`, `products[${index}].product`);
    }

    if (typeof pieces !== 'number' || !Number.isFinite(pieces) || pieces <= 0) {
      throw validationError(`Pieces must be a positive number at index ${index}`, `products[${index}].pieces`);
    }

    if (typeof pricePerItem !== 'number' || !Number.isFinite(pricePerItem) || pricePerItem < 0) {
      throw validationError(`Price per item cannot be negative at index ${index}`, `products[${index}].pricePerItem`);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) || Number.isNaN(Date.parse(`${expiryDate}T00:00:00Z`))) {
      throw validationError(`Expiry date must be a valid date at index ${index}`, `products[${index}].expiryDate`);
    }

    return {
      product,
      pieces,
      pricePerItem,
      expiryDate,
      total: roundCurrency(pieces * pricePerItem)
    };
  });

  return {
    id: crypto.randomUUID(),
    customerName,
    products,
    status: 'pending',
    totalPieces: products.reduce((sum, item) => sum + item.pieces, 0),
    totalAmount: roundCurrency(products.reduce((sum, item) => sum + item.total, 0)),
    createdAt: new Date().toISOString()
  };
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function createCustomer(request, response, next) {
  try {
    const customer = validateAndBuildCustomer(request.body);
    const savedCustomer = await customerModel.create(customer);

    response.status(201).json({
      success: true,
      message: 'Customer saved successfully',
      customer: savedCustomer
    });
  } catch (error) {
    next(error);
  }
}

async function getCustomers(request, response, next) {
  try {
    const customers = (await customerModel.getAll()).map((customer) => ({
      ...customer,
      status: customer.status || 'pending'
    }));
    response.json({ success: true, customers });
  } catch (error) {
    next(error);
  }
}

async function getCustomer(request, response, next) {
  try {
    const customer = await customerModel.getById(request.params.id);

    if (!customer) {
      return response.status(404).json({ success: false, message: 'Customer not found' });
    }

    response.json({ success: true, customer: { ...customer, status: customer.status || 'pending' } });
  } catch (error) {
    next(error);
  }
}

async function deleteCustomer(request, response, next) {
  try {
    const deleted = await customerModel.remove(request.params.id);

    if (!deleted) {
      return response.status(404).json({ success: false, message: 'Customer not found' });
    }

    response.json({ success: true, message: 'Customer deleted successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createCustomer,
  getCustomers,
  getCustomer,
  deleteCustomer
};
