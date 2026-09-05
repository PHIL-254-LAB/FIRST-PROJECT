const jwt = require('jsonwebtoken');

const jwtSecret = process.env.JWT_SECRET || 'development-only-change-this-secret';

function requireAuth(request, response, next) {
  const authorization = request.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!token) {
    return response.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    request.user = jwt.verify(token, jwtSecret);
    next();
  } catch (error) {
    response.status(401).json({ success: false, message: 'Invalid or expired authentication token' });
  }
}

function requireAdmin(request, response, next) {
  if (request.user?.role !== 'admin') {
    return response.status(403).json({ success: false, message: 'Administrator access required' });
  }

  next();
}

module.exports = { jwtSecret, requireAuth, requireAdmin };
