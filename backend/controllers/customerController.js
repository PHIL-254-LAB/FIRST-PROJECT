const crypto = require('node:crypto');
const ExcelJS = require('exceljs');
const customerModel = require('../models/customerModel');
const settingsModel = require('../models/settingsModel');

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
    const settings = await settingsModel.get();
    if (!settingsModel.isWithinWindow(settings)) {
      const error = new Error('Customer requests are currently closed');
      error.statusCode = 403;
      throw error;
    }
    const customer = { ...validateAndBuildCustomer(request.body), region: request.user.region || 'Unassigned', van: request.user.van || '' };
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

async function getRequestWindow(request, response, next) {
  try {
    const settings = await settingsModel.get();
    response.json({ success: true, requestsOpen: settingsModel.isWithinWindow(settings), startDate: settings.startDate, endDate: settings.endDate });
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

async function updateCustomer(request, response, next) {
  try {
    const existing = await customerModel.getById(request.params.id);
    if (!existing) return response.status(404).json({ success: false, message: 'Customer not found' });
    const validated = validateAndBuildCustomer(request.body);
    const customer = await customerModel.update(request.params.id, {
      customerName: validated.customerName,
      products: validated.products,
      totalPieces: validated.totalPieces,
      totalAmount: validated.totalAmount,
      updatedAt: new Date().toISOString(),
      updatedBy: request.user.username
    });
    response.json({ success: true, message: 'Customer updated successfully', customer });
  } catch (error) { next(error); }
}

async function addCustomerNote(request, response, next) {
  try {
    const note = typeof request.body?.note === 'string' ? request.body.note.trim() : '';
    if (!note) throw validationError('Note cannot be empty', 'note');
    if (note.length > 500) throw validationError('Note must be 500 characters or fewer', 'note');
    const existing = await customerModel.getById(request.params.id);
    if (!existing) return response.status(404).json({ success: false, message: 'Customer not found' });
    const notes = Array.isArray(existing.notes) ? existing.notes : [];
    const customer = await customerModel.update(request.params.id, {
      notes: [...notes, { id: crypto.randomUUID(), text: note, author: request.user.username, createdAt: new Date().toISOString() }]
    });
    response.status(201).json({ success: true, message: 'Note saved', customer });
  } catch (error) { next(error); }
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

async function updateCustomerStatus(request, response, next) {
  try {
    const status = typeof request.body?.status === 'string' ? request.body.status : '';
    const operatingDeadline = typeof request.body?.operatingDeadline === 'string'
      ? request.body.operatingDeadline.trim()
      : '';

    if (!['pending', 'approved', 'declined'].includes(status)) {
      const error = validationError('Status must be pending, approved, or declined', 'status');
      throw error;
    }

    if (operatingDeadline && (!/^\d{4}-\d{2}-\d{2}$/.test(operatingDeadline) || Number.isNaN(Date.parse(`${operatingDeadline}T00:00:00Z`)))) {
      throw validationError('Operating deadline must be a valid date', 'operatingDeadline');
    }

    const customer = await customerModel.updateStatus(request.params.id, {
      status,
      operatingDeadline: operatingDeadline || null,
      reviewedAt: new Date().toISOString(),
      reviewedBy: request.user.username
    });

    if (!customer) {
      return response.status(404).json({ success: false, message: 'Customer not found' });
    }

    response.json({ success: true, message: `Customer ${status}`, customer });
  } catch (error) {
    next(error);
  }
}

async function exportCustomers(request, response, next) {
  try {
    const decided = (await customerModel.getAll())
      .filter((customer) => ['approved', 'declined'].includes(customer.status || 'pending'))
      .sort((a, b) => new Date(b.reviewedAt || b.createdAt) - new Date(a.reviewedAt || a.createdAt));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Dahlia Bottlers Requests';
    const sheet = workbook.addWorksheet('REQUESTS');
    sheet.columns = [
      { key: 'customer', width: 26 },
      { key: 'region', width: 16 },
      { key: 'van', width: 14 },
      { key: 'status', width: 12 },
      { key: 'products', width: 40 },
      { key: 'expiry', width: 16 },
      { key: 'pieces', width: 12 },
      { key: 'total', width: 16 },
      { key: 'created', width: 22 },
      { key: 'deadline', width: 20 }
    ];

    const titleFont = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF17322F' } };
    const headerFont = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    const bodyFont = { name: 'Calibri', size: 11 };
    const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176B63' } };
    const thinBorder = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

    sheet.mergeCells('A1:J1');
    sheet.getCell('A1').value = 'DAHLIA BOTTLERS - APPROVED & DECLINED REQUESTS';
    sheet.getCell('A1').font = titleFont;
    sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    const headerRow = sheet.addRow(['Customer', 'Region', 'Van', 'Status', 'Products', 'Expiry date', 'Pieces', 'Total (KES)', 'Reviewed', 'Operating deadline']);
    headerRow.eachCell((cell) => {
      cell.font = headerFont;
      cell.fill = fill;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });
    headerRow.height = 22;

    decided.forEach((customer) => {
      const products = (customer.products || []).map((product) => `${product.product} (${product.pieces} pcs)`).join('\n');
      const expiries = (customer.products || []).map((product) => product.expiryDate || 'n/a').join('\n');
      const row = sheet.addRow([
        customer.customerName,
        customer.region || 'Unassigned',
        customer.van || 'Unassigned',
        customer.status || 'pending',
        products,
        expiries,
        customer.totalPieces || 0,
        customer.totalAmount || 0,
        customer.reviewedAt ? new Date(customer.reviewedAt).toLocaleString('en-GB') : new Date(customer.createdAt).toLocaleString('en-GB'),
        customer.operatingDeadline || ''
      ]);
      row.eachCell((cell) => { cell.font = bodyFont; cell.border = thinBorder; cell.alignment = { vertical: 'top' }; });
      row.getCell(5).alignment = { vertical: 'top', wrapText: true };
      row.getCell(6).alignment = { vertical: 'top', wrapText: true };
      row.getCell(8).numFmt = '#,##0.00';
    });

    sheet.views = [{ state: 'frozen', ySplit: 2 }];
    const buffer = await workbook.xlsx.writeBuffer();

    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="DAHLIA-BOTTLERS-REQUESTS.xlsx"'
    });
    response.send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createCustomer,
  getRequestWindow,
  getCustomers,
  getCustomer,
  updateCustomer,
  addCustomerNote,
  deleteCustomer,
  updateCustomerStatus,
  exportCustomers
};
