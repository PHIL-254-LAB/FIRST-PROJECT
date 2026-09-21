const crypto = require('node:crypto');
const ExcelJS = require('exceljs');
const catalogModel = require('../models/catalogModel');
const claimModel = require('../models/claimModel');

function validationError(message, field) {
  const error = new Error(message);
  error.statusCode = 400;
  error.field = field;
  return error;
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function resolveClaimPayload(body) {
  const customerId = typeof body?.customerId === 'string' ? body.customerId : '';
  const items = Array.isArray(body?.items) ? body.items : [];

  if (!customerId) throw validationError('Customer is required', 'customerId');
  if (items.length === 0) throw validationError('At least one SKU must be submitted', 'items');

  const customer = await catalogModel.getCustomerById(customerId);
  if (!customer || customer.active === false) {
    const error = new Error('Customer not found or is inactive');
    error.statusCode = 404;
    throw error;
  }

  const seenSkuIds = new Set();
  const claimItems = [];
  for (let index = 0; index < items.length; index += 1) {
    const skuId = typeof items[index]?.skuId === 'string' ? items[index].skuId : '';
    const quantity = items[index]?.quantity;

    if (!skuId) throw validationError(`SKU is required at index ${index}`, `items[${index}].skuId`);
    if (seenSkuIds.has(skuId)) {
      throw validationError('The same SKU cannot be added twice — edit the existing row instead', `items[${index}].skuId`);
    }
    seenSkuIds.add(skuId);

    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
      throw validationError(`Quantity must be a positive number at index ${index}`, `items[${index}].quantity`);
    }

    const sku = await catalogModel.getSkuById(skuId);
    if (!sku || sku.active === false) {
      const error = new Error(`SKU not found or is inactive at index ${index}`);
      error.statusCode = 404;
      throw error;
    }

    const unitPrice = sku.unitPrice;
    const amount = roundCurrency(quantity * unitPrice);
    const discountAmount = roundCurrency(amount * 0.5);

    claimItems.push({
      skuId,
      skuName: sku.name,
      quantity,
      unitPrice,
      amount,
      discountAmount
    });
  }

  return {
    customerId,
    customerName: customer.name,
    items: claimItems,
    totalAmount: roundCurrency(claimItems.reduce((sum, item) => sum + item.amount, 0)),
    totalDiscount: roundCurrency(claimItems.reduce((sum, item) => sum + item.discountAmount, 0))
  };
}

async function createClaim(request, response, next) {
  try {
    const payload = await resolveClaimPayload(request.body);
    const claimNumber = await claimModel.nextClaimNumber();

    const claim = await claimModel.create({
      id: crypto.randomUUID(),
      claimNumber: `DC-${String(claimNumber).padStart(4, '0')}`,
      customerId: payload.customerId,
      customerName: payload.customerName,
      items: payload.items,
      totalAmount: payload.totalAmount,
      totalDiscount: payload.totalDiscount,
      createdBy: request.user.username,
      createdAt: new Date().toISOString()
    });

    response.status(201).json({ success: true, message: 'Claim saved successfully', claim });
  } catch (error) {
    next(error);
  }
}

async function exportDraftClaim(request, response, next) {
  try {
    const payload = await resolveClaimPayload(request.body);
    const draft = {
      claimNumber: 'DRAFT',
      customerName: payload.customerName,
      items: payload.items,
      totalAmount: payload.totalAmount,
      totalDiscount: payload.totalDiscount,
      createdBy: request.user.username,
      createdAt: new Date().toISOString()
    };
    const workbook = await buildClaimWorkbook(draft);
    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = payload.customerName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="DAHLIA-BOTTLERS-CLAIMS-${safeName}-DRAFT.xlsx"`
    });
    response.send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
}

async function getClaims(request, response, next) {
  try {
    response.json({ success: true, claims: await claimModel.getAll() });
  } catch (error) {
    next(error);
  }
}

async function getClaim(request, response, next) {
  try {
    const claim = await claimModel.getById(request.params.id);
    if (!claim) return response.status(404).json({ success: false, message: 'Claim not found' });
    response.json({ success: true, claim });
  } catch (error) {
    next(error);
  }
}

async function exportClaim(request, response, next) {
  try {
    const claim = await claimModel.getById(request.params.id);
    if (!claim) return response.status(404).json({ success: false, message: 'Claim not found' });

    const workbook = await buildClaimWorkbook(claim);
    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = claim.customerName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="DAHLIA-BOTTLERS-CLAIMS-${safeName}-${claim.claimNumber}.xlsx"`
    });
    response.send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
}

async function buildClaimWorkbook(claim) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Dahlia Bottlers Claims';
  const sheet = workbook.addWorksheet('CLAIMS');

  sheet.columns = [
    { key: 'sku', width: 20 },
    { key: 'quantity', width: 18 },
    { key: 'price', width: 16 },
    { key: 'discount', width: 14 }
  ];

  const titleFont = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF17322F' } };
  const labelFont = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF17322F' } };
  const headerFont = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  const bodyFont = { name: 'Calibri', size: 11 };
  const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176B63' } };
  const thinBorder = {
    top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
  };

  sheet.mergeCells('A1:D1');
  sheet.getCell('A1').value = 'DAHLIA BOTTLERS CLAIMS';
  sheet.getCell('A1').font = titleFont;
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 34;

  sheet.mergeCells('A2:D2');
  sheet.getCell('A2').value = `Customer name: ${claim.customerName}`;
  sheet.getCell('A2').font = labelFont;
  sheet.getCell('A2').alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(2).height = 26;

  const headerRow = sheet.addRow(['SKUS', 'QUANTITY (PCS)', 'PRICE', '50% OFF']);
  headerRow.eachCell((cell) => {
    cell.font = headerFont;
    cell.fill = fill;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });
  headerRow.height = 24;

  const moneyFormat = '#,##0.00';
  claim.items.forEach((item) => {
    const row = sheet.addRow([item.skuName, item.quantity, item.amount, item.discountAmount]);
    row.getCell(1).font = bodyFont;
    row.getCell(2).font = bodyFont;
    row.getCell(3).font = bodyFont;
    row.getCell(4).font = bodyFont;
    row.getCell(3).numFmt = moneyFormat;
    row.getCell(4).numFmt = moneyFormat;
    row.eachCell((cell) => {
      cell.alignment = cell.column === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });
  });

  const totalRow = sheet.addRow(['TOTAL', '', claim.totalAmount, claim.totalDiscount]);
  totalRow.eachCell((cell) => {
    cell.font = labelFont;
    cell.alignment = { horizontal: cell.column === 1 ? 'left' : 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });
  totalRow.getCell(3).numFmt = moneyFormat;
  totalRow.getCell(4).numFmt = moneyFormat;
  totalRow.height = 26;

  const metaRow = sheet.addRow([`Prepared by ${claim.createdBy}  ·  ${new Date(claim.createdAt).toLocaleDateString()}`]);
  sheet.mergeCells(`A${metaRow.number}:D${metaRow.number}`);
  metaRow.getCell(1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF71817B' } };
  metaRow.getCell(1).alignment = { horizontal: 'left' };
  metaRow.height = 20;

  sheet.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { top: 0.7, bottom: 0.7, left: 0.5, right: 0.5, header: 0.3, footer: 0.3 },
    horizontalCentered: true
  };

  return workbook;
}

module.exports = { createClaim, exportDraftClaim, getClaims, getClaim, exportClaim, buildClaimWorkbook };