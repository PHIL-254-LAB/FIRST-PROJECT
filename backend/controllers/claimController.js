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
      status: 'pending',
      approvalMode: null,
      createdBy: request.user.username,
      createdByName: request.user.name || request.user.username,
      region: request.user.region || 'Unassigned',
      van: request.user.van || '',
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
      createdByName: request.user.name || request.user.username,
      region: request.user.region || 'Unassigned',
      van: request.user.van || '',
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

async function approveClaim(request, response, next) {
  try {
    const status = typeof request.body?.status === 'string' ? request.body.status : '';
    const approvalMode = typeof request.body?.approvalMode === 'string' ? request.body.approvalMode : '';

    if (!['approved', 'declined'].includes(status)) throw validationError('Status must be approved or declined', 'status');

    let mode = null;
    if (status === 'approved') {
      if (!['50', '100'].includes(approvalMode)) throw validationError('Choose 50% or 100% off for the approval', 'approvalMode');
      mode = approvalMode;
    }

    const existing = await claimModel.getById(request.params.id);
    if (!existing) return response.status(404).json({ success: false, message: 'Claim not found' });

    const updates = {
      status,
      approvalMode: mode,
      approvedBy: request.user.username,
      approvedByName: request.user.name || request.user.username,
      approvedAt: new Date().toISOString()
    };

    if (status === 'approved') {
      updates.items = existing.items.map((item) => ({
        ...item,
        discountAmount: mode === '100' ? item.amount : roundCurrency(item.amount * 0.5)
      }));
      updates.totalDiscount = mode === '100'
        ? existing.totalAmount
        : roundCurrency((existing.items || []).reduce((sum, item) => sum + roundCurrency(item.amount * 0.5), 0));
    }

    const claim = await claimModel.updateApproval(existing.id, updates);
    const label = status === 'approved' ? `approved with ${mode}% off` : 'declined';
    response.json({ success: true, message: `Claim ${existing.claimNumber} ${label}`, claim });
  } catch (error) {
    next(error);
  }
}

async function exportClaim(request, response, next) {
  try {
    const claim = await claimModel.getById(request.params.id);
    if (!claim) return response.status(404).json({ success: false, message: 'Claim not found' });
    if (claim.status !== 'approved') {
      return response.status(403).json({ success: false, message: 'Only approved claims can be exported or kept as records' });
    }

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

// Shared look for every claim document: the exported/saved claim and the blank template.
const CLAIM_STYLES = {
  title: { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF17322F' } },
  label: { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF17322F' } },
  header: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
  body: { name: 'Calibri', size: 11 },
  meta: { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF71817B' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176B63' } },
  border: {
    top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
  },
  moneyFormat: '#,##0.00'
};

const TEMPLATE_FIRST_ROW = 6;
const TEMPLATE_ROW_COUNT = 12;
const TEMPLATE_HEADERS = ['SKU', 'QUANTITY (PCS)', 'ORIGINAL PRICE (KES)', 'PRICE TO BE CLAIMED (KES)', 'DISCOUNT'];

// A4 portrait with fit-to-width margins, used by every claim sheet.
function claimPageSetup() {
  return {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { top: 0.7, bottom: 0.7, left: 0.5, right: 0.5, header: 0.3, footer: 0.3 }
  };
}

// The blank claim form: the same A4 document the approved claims print to, with empty
// rows the team can print and write on, or fill in Excel before it is captured here.
async function downloadClaimTemplate(request, response, next) {
  try {
    const workbook = buildClaimTemplateWorkbook({
      region: request.user.region || 'Unassigned',
      van: request.user.van || '',
      preparedBy: request.user.name || request.user.username,
      preparedOn: new Date()
    }, await catalogModel.getSkus({ activeOnly: true }));

    const buffer = await workbook.xlsx.writeBuffer();

    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="DAHLIA-BOTTLERS-CLAIMS-TEMPLATE.xlsx"'
    });
    response.send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
}

function buildClaimTemplateWorkbook(user, skus) {
  const {
    title: titleFont, label: labelFont, header: headerFont, body: bodyFont, meta: metaFont,
    fill, border: thinBorder, moneyFormat
  } = CLAIM_STYLES;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Dahlia Bottlers Claims';
  // The TOTAL row is built from formulas, so let Excel calculate them when the file opens.
  workbook.calcProperties.fullCalcOnLoad = true;

  const sheet = workbook.addWorksheet('CLAIMS');
  sheet.columns = [
    { key: 'sku', width: 26 },
    { key: 'quantity', width: 18 },
    { key: 'price', width: 22 },
    { key: 'claimed', width: 22 },
    { key: 'discount', width: 16 }
  ];

  const totalRowNumber = TEMPLATE_FIRST_ROW + TEMPLATE_ROW_COUNT;
  const lastBlankRow = totalRowNumber - 1;

  sheet.getCell('A1').value = `DAHLIA TRADING COMPANY ("${String(user.region || 'Unassigned').toUpperCase()}")`;
  sheet.getCell('A1').font = titleFont;
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 34;
  sheet.mergeCells('A1:E1');

  sheet.getCell('A2').value = 'Customer name:';
  sheet.getCell('A2').font = labelFont;
  sheet.getCell('C2').border = { bottom: { style: 'thin' } };
  sheet.mergeCells('A2:B2');
  sheet.mergeCells('C2:E2');

  sheet.getCell('A3').value = 'Van:';
  sheet.getCell('A3').font = labelFont;
  sheet.getCell('C3').value = String(user.van || '').toUpperCase();
  sheet.getCell('C3').font = bodyFont;
  sheet.getCell('C3').alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getCell('C3').border = { bottom: { style: 'thin' } };
  sheet.mergeCells('A3:B3');
  sheet.mergeCells('C3:E3');

  sheet.getRow(4).height = 8;

  const headerRow = sheet.getRow(5);
  TEMPLATE_HEADERS.forEach((heading, index) => { headerRow.getCell(index + 1).value = heading; });
  headerRow.eachCell((cell) => {
    cell.font = headerFont;
    cell.fill = fill;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  });
  headerRow.height = 30;

  for (let rowNumber = TEMPLATE_FIRST_ROW; rowNumber <= lastBlankRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    for (let column = 1; column <= TEMPLATE_HEADERS.length; column += 1) {
      const cell = row.getCell(column);
      cell.font = bodyFont;
      cell.border = thinBorder;
      cell.alignment = { horizontal: column === 1 ? 'left' : 'center', vertical: 'middle' };
      if (column === 3 || column === 4) cell.numFmt = moneyFormat;
    }
    row.height = 22;
  }

  const totalRow = sheet.getRow(totalRowNumber);
  totalRow.getCell(1).value = 'TOTAL';
  ['B', 'C', 'D'].forEach((letter, index) => {
    totalRow.getCell(index + 2).value = { formula: `SUM(${letter}${TEMPLATE_FIRST_ROW}:${letter}${lastBlankRow})` };
  });
  totalRow.eachCell((cell) => {
    cell.font = labelFont;
    cell.border = thinBorder;
    cell.alignment = { horizontal: cell.column === 1 ? 'left' : 'center', vertical: 'middle' };
    if (cell.column === 3 || cell.column === 4) cell.numFmt = moneyFormat;
  });
  totalRow.height = 26;

  sheet.getCell('A19').value = 'Total price to be claimed (KES)';
  sheet.getCell('A19').font = labelFont;
  sheet.getCell('D19').value = { formula: `D${totalRowNumber}` };
  sheet.getCell('D19').font = labelFont;
  sheet.getCell('D19').numFmt = moneyFormat;
  sheet.getCell('D19').border = thinBorder;
  sheet.getCell('D19').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.mergeCells('A19:C19');

  sheet.getRow(20).height = 8;

  sheet.getCell('A21').value = 'Customer stamp / signature';
  sheet.getCell('D21').value = 'Verified by (stamp / signature)';
  ['A21', 'D21'].forEach((address) => {
    sheet.getCell(address).font = metaFont;
    sheet.getCell(address).border = thinBorder;
    sheet.getCell(address).alignment = { horizontal: 'center', vertical: 'bottom' };
  });
  sheet.mergeCells('A21:C21');
  sheet.mergeCells('D21:E21');
  sheet.getRow(21).height = 44;

  sheet.getCell('A22').value = `Blank claim template · Downloaded by ${user.preparedBy} on ${user.preparedOn.toLocaleDateString()} · Write 50% OFF or 100% OFF in the DISCOUNT column`;
  sheet.getCell('A22').font = metaFont;
  sheet.getCell('A22').alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.mergeCells('A22:E22');

  sheet.pageSetup = { ...claimPageSetup(), horizontalCentered: true };

  const priceList = workbook.addWorksheet('SKU PRICE LIST');
  priceList.columns = [{ key: 'sku', width: 28 }, { key: 'price', width: 18 }];

  const priceTitle = priceList.addRow(['APPROVED SKU PRICE LIST']);
  priceTitle.getCell(1).font = { ...titleFont, size: 14 };
  priceTitle.height = 26;
  priceList.mergeCells('A1:B1');

  const priceHeader = priceList.addRow(['SKU', 'PRICE (KES)']);
  priceHeader.eachCell((cell) => {
    cell.font = headerFont;
    cell.fill = fill;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  if (skus.length === 0) {
    priceList.addRow(['No active SKUs yet — ask an administrator to add them', '']).getCell(1).font = metaFont;
  } else {
    skus.forEach((sku) => {
      const row = priceList.addRow([sku.name, sku.unitPrice]);
      row.getCell(1).font = bodyFont;
      row.getCell(2).font = bodyFont;
      row.getCell(2).numFmt = moneyFormat;
      row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      row.eachCell((cell) => { cell.border = thinBorder; });
    });
  }

  priceList.pageSetup = claimPageSetup();

  return workbook;
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

  const {
    title: titleFont, label: labelFont, header: headerFont, body: bodyFont,
    fill, border: thinBorder, moneyFormat
  } = CLAIM_STYLES;

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

  sheet.pageSetup = { ...claimPageSetup(), horizontalCentered: true };

  return workbook;
}

module.exports = {
  createClaim,
  approveClaim,
  exportDraftClaim,
  getClaims,
  getClaim,
  exportClaim,
  downloadClaimTemplate,
  buildClaimWorkbook,
  buildClaimTemplateWorkbook
};