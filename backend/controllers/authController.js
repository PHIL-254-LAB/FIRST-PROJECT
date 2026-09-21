const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const loginModel = require('../models/loginModel');
const { jwtSecret } = require('../middleware/auth');
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

function publicUser(user) {
  return { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role, region: user.region || 'Unassigned', van: user.van || '' };
}

function createToken(user) {
  return jwt.sign(publicUser(user), jwtSecret, { expiresIn: '1d' });
}

async function register(request, response, next) {
  try {
    const username = normalizeUsername(request.body?.username);
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : username;
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const region = typeof request.body?.region === 'string' ? request.body.region.trim() : '';
    const van = typeof request.body?.van === 'string' ? request.body.van.trim() : '';

    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw validationError('Username must be 3-30 characters using letters, numbers, dots, underscores, or hyphens', 'username');
    if (password.length < 6) throw validationError('Password must be at least 6 characters', 'password');
    if (!name) throw validationError('Name cannot be empty', 'name');
    if (!allowedRegions.includes(region)) throw validationError('Choose Kakamega, Webuye, Busia, or Luanda', 'region');
    if (!van) throw validationError('Choose a van for your region', 'van');
    if (!isValidVan(region, van)) throw validationError(`"${van}" is not a van in ${region}`, 'van');
    if (typeof request.body?.role === 'string' && request.body.role.trim().toLowerCase() === 'admin') {
      const error = new Error('Administrator accounts must be created by an existing admin');
      error.statusCode = 403;
      error.field = 'role';
      throw error;
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
      role: 'user',
      region,
      van,
      createdAt: new Date().toISOString()
    };
    await userModel.create(user);
    response.status(201).json({ success: true, user: publicUser(user), token: createToken(user) });
  } catch (error) {
    next(error);
  }
}

async function recordLogin(entry) {
  try {
    await loginModel.append({
      id: crypto.randomUUID(),
      username: entry.username,
      userId: entry.userId || null,
      name: entry.name || entry.username || '',
      role: entry.role || 'user',
      region: entry.region || 'Unassigned',
      van: entry.van || '',
      success: entry.success,
      ip: entry.ip,
      userAgent: entry.userAgent,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    // A failed audit write must never block a sign-in.
  }
}

async function login(request, response, next) {
  try {
    const username = normalizeUsername(request.body?.username);
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const selectedRole = typeof request.body?.role === 'string' ? request.body.role.trim().toLowerCase() : 'user';
    const selectedRegion = typeof request.body?.region === 'string' ? request.body.region.trim() : '';
    const selectedVan = typeof request.body?.van === 'string' ? request.body.van.trim() : '';

    if (!['user', 'admin'].includes(selectedRole)) throw validationError('Choose a role: User or Admin', 'role');
    if (selectedRole === 'user') {
      if (!allowedRegions.includes(selectedRegion)) throw validationError('Choose Kakamega, Webuye, Busia, or Luanda', 'region');
      if (!selectedVan) throw validationError('Choose a van for your region', 'van');
      if (!isValidVan(selectedRegion, selectedVan)) throw validationError(`"${selectedVan}" is not a van in ${selectedRegion}`, 'van');
    }

    const user = await userModel.findByUsername(username);
    const ip = request.ip || request.socket?.remoteAddress || '';
    const userAgent = typeof request.headers?.['user-agent'] === 'string' ? request.headers['user-agent'].slice(0, 200) : '';

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      await recordLogin({ username, success: false, ip, userAgent, region: selectedRegion || 'Unassigned', van: selectedRole === 'user' ? selectedVan : '' });
      return response.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    if ((user.role || 'user') !== selectedRole) {
      return response.status(403).json({ success: false, message: user.role === 'admin' ? 'Choose Admin to sign in to this account' : 'Choose User to sign in to this account' });
    }

    let sessionUser = { ...user };
    if (selectedRole === 'user') {
      sessionUser = { ...user, region: selectedRegion, van: selectedVan };
      await userModel.updateUser(user.id, { region: selectedRegion, van: selectedVan, updatedAt: new Date().toISOString() });
    }

    await recordLogin({ username, userId: user.id, name: user.name, role: user.role || 'user', region: sessionUser.region || 'Unassigned', van: sessionUser.van || '', success: true, ip, userAgent });
    response.json({ success: true, user: publicUser(sessionUser), token: createToken(sessionUser) });
  } catch (error) {
    next(error);
  }
}

async function changePassword(request, response, next) {
  try {
    const currentPassword = typeof request.body?.currentPassword === 'string' ? request.body.currentPassword : '';
    const newPassword = typeof request.body?.newPassword === 'string' ? request.body.newPassword : '';
    if (newPassword.length < 6) throw validationError('New password must be at least 6 characters', 'newPassword');
    const user = await userModel.findByUsername(request.user.username);
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return response.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    await userModel.updatePassword(user.id, await bcrypt.hash(newPassword, 12));
    response.json({ success: true, message: 'Password updated successfully' });
  } catch (error) { next(error); }
}

function me(request, response) {
  response.json({ success: true, user: request.user });
}

module.exports = { register, login, me, changePassword };
