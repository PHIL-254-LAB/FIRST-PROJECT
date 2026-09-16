const settingsModel = require('../models/settingsModel');
const userModel = require('../models/userModel');

function validationError(message, field) {
  const error = new Error(message);
  error.statusCode = 400;
  error.field = field;
  return error;
}

function validDate(value) {
  return value === null || value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

async function getSettings(request, response, next) {
  try {
    response.json({ success: true, settings: await settingsModel.get() });
  } catch (error) {
    next(error);
  }
}

async function updateSettings(request, response, next) {
  try {
    const startDate = request.body?.startDate || null;
    const endDate = request.body?.endDate || null;
    const requestsOpen = request.body?.requestsOpen !== false;

    if (!validDate(startDate)) throw validationError('Start date must be a valid date', 'startDate');
    if (!validDate(endDate)) throw validationError('End date must be a valid date', 'endDate');
    if (startDate && endDate && startDate > endDate) throw validationError('End date cannot be before start date', 'endDate');

    const settings = await settingsModel.update({
      requestsOpen,
      startDate,
      endDate,
      updatedAt: new Date().toISOString(),
      updatedBy: request.user.username
    });
    response.json({ success: true, settings });
  } catch (error) {
    next(error);
  }
}

async function getUsers(request, response, next) {
  try {
    response.json({ success: true, users: await userModel.getPublicUsers() });
  } catch (error) {
    next(error);
  }
}

async function updateUserRole(request, response, next) {
  try {
    const role = typeof request.body?.role === 'string' ? request.body.role.trim() : '';

    if (!['admin', 'user'].includes(role)) throw validationError('Role must be admin or user', 'role');

    const target = await userModel.getById(request.params.id);

    if (!target) {
      return response.status(404).json({ success: false, message: 'User not found' });
    }

    if (target.username === request.user.username) {
      throw validationError('You cannot change your own role', 'role');
    }

    if (target.role === 'admin' && role !== 'admin') {
      const admins = (await userModel.getPublicUsers()).filter((user) => user.role === 'admin');
      if (admins.length <= 1) throw validationError('At least one administrator must remain', 'role');
    }

    const updated = await userModel.updateRole(target.id, role);
    const { passwordHash, ...user } = updated;
    response.json({ success: true, message: `${user.name || user.username} is now ${role}`, user });
  } catch (error) {
    next(error);
  }
}

module.exports = { getSettings, updateSettings, getUsers, updateUserRole };
