const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const { jwtSecret } = require('../middleware/auth');

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
  return { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role };
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

    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw validationError('Username must be 3-30 characters using letters, numbers, dots, underscores, or hyphens', 'username');
    if (password.length < 6) throw validationError('Password must be at least 6 characters', 'password');
    if (!name) throw validationError('Name cannot be empty', 'name');

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
      createdAt: new Date().toISOString()
    };
    await userModel.create(user);
    response.status(201).json({ success: true, user: publicUser(user), token: createToken(user) });
  } catch (error) {
    next(error);
  }
}

async function login(request, response, next) {
  try {
    const username = normalizeUsername(request.body?.username);
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const user = await userModel.findByUsername(username);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return response.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    response.json({ success: true, user: publicUser(user), token: createToken(user) });
  } catch (error) {
    next(error);
  }
}

function me(request, response) {
  response.json({ success: true, user: request.user });
}

module.exports = { register, login, me };
