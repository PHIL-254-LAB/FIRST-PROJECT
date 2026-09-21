const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const settingsModel = require('../models/settingsModel');
const userModel = require('../models/userModel');
const loginModel = require('../models/loginModel');
const { allowedRegions, isValidVan } = require('../config/regions');

function validationError(message, field) {
  const error = new Error(message);
  error.statusCode = 400;
  error.field = field;
  return error;
}

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
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

async function createUser(request, response, next) {
  try {
    const username = normalizeUsername(request.body?.username);
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const region = typeof request.body?.region === 'string' ? request.body.region.trim() : '';
    const van = typeof request.body?.van === 'string' ? request.body.van.trim() : '';
    const role = typeof request.body?.role === 'string' ? request.body.role.trim() : 'user';

    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw validationError('Username must be 3-30 characters using letters, numbers, dots, underscores, or hyphens', 'username');
    if (password.length < 6) throw validationError('Password must be at least 6 characters', 'password');
    if (!name) throw validationError('Name cannot be empty', 'name');
    if (!['admin', 'user'].includes(role)) throw validationError('Role must be admin or user', 'role');

    if (role === 'user') {
      if (!allowedRegions.includes(region)) throw validationError('Choose Kakamega, Webuye, Busia, or Luanda', 'region');
      if (!van) throw validationError('Choose a van for the user', 'van');
      if (!isValidVan(region, van)) throw validationError(`"${van}" is not a van in ${region}`, 'van');
    }

    if (await userModel.findByUsername(username)) {
      const error = new Error('Username is already registered');
      error.statusCode = 409;
      error.field = 'username';
      throw error;
    }

    const user = {
      id: crypto.randomUUID(),
      username,
      passwordHash: await bcrypt.hash(password, 12),
      name,
      email,
      region: region || 'Unassigned',
      van: role === 'admin' ? '' : van,
      role,
      createdAt: new Date().toISOString(),
      createdBy: request.user.username
    };
    await userModel.create(user);
    const { passwordHash, ...created } = user;
    response.status(201).json({ success: true, message: `Account ${name || username} created`, user: created });
  } catch (error) {
    next(error);
  }
}

async function updateAccount(request, response, next) {
  try {
    const username = normalizeUsername(request.body?.username);
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const region = typeof request.body?.region === 'string' ? request.body.region.trim() : '';
    const van = typeof request.body?.van === 'string' ? request.body.van.trim() : '';

    const target = await userModel.getById(request.params.id);
    if (!target) {
      return response.status(404).json({ success: false, message: 'User not found' });
    }

    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw validationError('Username must be 3-30 characters using letters, numbers, dots, underscores, or hyphens', 'username');
    if (!name) throw validationError('Name cannot be empty', 'name');
    if (region && !allowedRegions.includes(region)) throw validationError('Choose Kakamega, Webuye, Busia, or Luanda', 'region');

    const effectiveRegion = region || target.region || 'Unassigned';
    if (target.role !== 'admin' && van && !isValidVan(effectiveRegion, van)) throw validationError(`"${van}" is not a van in ${effectiveRegion}`, 'van');
    if (target.role === 'user' && effectiveRegion && !van && !target.van) {
      throw validationError('Choose a van for the user', 'van');
    }

    if (username !== target.username && await userModel.findByUsername(username)) {
      const error = new Error('Username is already registered');
      error.statusCode = 409;
      error.field = 'username';
      throw error;
    }

    const updated = await userModel.updateUser(target.id, {
      username,
      name,
      email,
      region: effectiveRegion,
      van: target.role === 'admin' ? '' : (van || target.van || ''),
      updatedAt: new Date().toISOString(),
      updatedBy: request.user.username
    });
    const { passwordHash, ...user } = updated;
    response.json({ success: true, message: `Login details updated for ${name || username}`, user });
  } catch (error) {
    next(error);
  }
}

async function deleteUser(request, response, next) {
  try {
    const target = await userModel.getById(request.params.id);

    if (!target) {
      return response.status(404).json({ success: false, message: 'User not found' });
    }

    if (target.username === request.user.username) {
      throw validationError('You cannot delete your own account', 'id');
    }

    if (target.role === 'admin') {
      const admins = (await userModel.getPublicUsers()).filter((user) => user.role === 'admin');
      if (admins.length <= 1) throw validationError('At least one administrator must remain', 'role');
    }

    await userModel.removeUser(target.id);
    response.json({ success: true, message: `${target.name || target.username} deleted` });
  } catch (error) {
    next(error);
  }
}

async function resetPassword(request, response, next) {
  try {
    const newPassword = typeof request.body?.newPassword === 'string' ? request.body.newPassword : '';
    if (newPassword.length < 6) throw validationError('New password must be at least 6 characters', 'newPassword');

    const target = await userModel.getById(request.params.id);
    if (!target) {
      return response.status(404).json({ success: false, message: 'User not found' });
    }

    await userModel.updatePassword(target.id, await bcrypt.hash(newPassword, 12));
    response.json({ success: true, message: `Password updated for ${target.name || target.username}` });
  } catch (error) {
    next(error);
  }
}

async function getLoginLog(request, response, next) {
  try {
    const limit = Math.min(Number(request.query?.limit) || 100, 500);
    response.json({ success: true, log: await loginModel.getLog({ limit }) });
  } catch (error) {
    next(error);
  }
}

module.exports = { getSettings, updateSettings, getUsers, updateUserRole, createUser, updateAccount, deleteUser, resetPassword, getLoginLog };
