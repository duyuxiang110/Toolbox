/**
 * 认证相关路由 - 登录/注册/刷新/登出/修改密码
 */
const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { authenticate } = require('../middleware/auth');

/**
 * POST /api/auth/register - 用户注册
 */
router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password, phone } = req.body;

    // 参数验证
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: '用户名、邮箱和密码为必填项' });
    }
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ success: false, message: '用户名长度需为3-50个字符' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: '密码长度至少6位' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: '邮箱格式不正确' });
    }

    const user = await authService.register({ username, email, password, phone });
    res.status(201).json({ success: true, data: user, message: '注册成功' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login - 用户登录
 */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: '请输入用户名和密码' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';

    const result = await authService.login({ username, password, deviceInfo, ipAddress });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/refresh - 刷新 Token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ success: false, message: '缺少 Refresh Token' });
    }

    const ipAddress = req.ip || '127.0.0.1';
    const result = await authService.refreshToken(refreshToken, ipAddress);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout - 登出
 */
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const { sessionId, refreshToken } = req.body;
    await authService.logout(req.user.userId, sessionId, refreshToken);
    res.json({ success: true, message: '已成功登出' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/change-password - 修改密码
 */
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: '请提供原密码和新密码' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: '新密码长度至少6位' });
    }

    const result = await authService.changePassword(req.user.userId, oldPassword, newPassword);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/validate-session - 验证 SSO 会话
 */
router.get('/validate-session', async (req, res, next) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: '缺少 sessionId' });
    }

    const session = await authService.validateSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, message: '会话无效或已过期' });
    }

    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
