/**
 * JWT 认证中间件
 */
const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * 验证 Access Token
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '未提供认证令牌' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded; // { userId, username, role }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token 已过期', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: '无效的认证令牌' });
  }
}

/**
 * 角色权限检查
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: '未认证' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: '权限不足，需要角色: ' + roles.join('/') });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
