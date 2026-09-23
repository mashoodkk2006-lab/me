const jwt = require('jsonwebtoken');
const config = require('./config');

// Generate JWT token
function generateToken(payload, expiresIn = '12h') {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn });
}

// Authentication Middleware
function authenticate(req, res, next) {
  let token = null;

  // 1. Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.aurora_token) {
    // 2. Check cookie
    token = req.cookies.aurora_token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

// Require Head Admin role
function requireHeadAdmin(req, res, next) {
  authenticate(req, res, () => {
    if (!req.user || req.user.role !== 'HEAD_ADMIN') {
      return res.status(403).json({ error: 'Access denied: Head Administrator authorization required.' });
    }
    next();
  });
}

// Require Head Admin or Sub Admin (Volunteer)
function requireAdminOrVolunteer(req, res, next) {
  authenticate(req, res, () => {
    if (!req.user || !['HEAD_ADMIN', 'SUB_ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: Administrative credentials required.' });
    }
    next();
  });
}

// Require Student role
function requireStudent(req, res, next) {
  authenticate(req, res, () => {
    if (!req.user || req.user.role !== 'STUDENT') {
      return res.status(403).json({ error: 'Access denied: Student credentials required.' });
    }
    next();
  });
}

module.exports = {
  generateToken,
  authenticate,
  requireHeadAdmin,
  requireAdminOrVolunteer,
  requireStudent
};
