/**
 * 认证相关路由 - 登录/注册/刷新/登出/修改密码
 */
const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { authenticate } = require('../middleware/auth');
const { validateAuthInput } = require('../middleware/sanitize');
const { recordLoginFailure, clearLoginRecord } = require('../middleware/loginLimiter');

// MD5 哈希格式校验（32位十六进制）
const MD5_REGEX = /^[a-f0-9]{32}$/i;

/**
 * POST /api/auth/register - 用户注册
 */
router.post('/register', validateAuthInput, async (req, res, next) => {
  try {
    const { username, email, password, phone } = req.body;

    // 参数验证
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: '用户名、邮箱和密码为必填项' });
    }
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ success: false, message: '用户名长度需为3-50个字符' });
    }
    // 密码必须为 MD5 加密后的 32 位哈希
    if (!MD5_REGEX.test(password)) {
      return res.status(400).json({ success: false, message: '密码格式无效，请使用客户端加密后重试', code: 'INVALID_PASSWORD_FORMAT' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: '邮箱格式不正确' });
    }

    const user = await authService.register({ username, email, password, phone });
    res.status(201).json({ success: true, data: user, message: '注册成功，请等待管理员审核' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/forgot-password - 忘记密码自助重置（用户名+邮箱校验）
 */
router.post('/forgot-password', validateAuthInput, async (req, res, next) => {
  try {
    const { username, email, newPassword } = req.body;

    if (!username || !email || !newPassword) {
      return res.status(400).json({ success: false, message: '请完整填写用户名、邮箱和新密码' });
    }
    // 新密码必须为 MD5 加密后的 32 位哈希
    if (!MD5_REGEX.test(newPassword)) {
      return res.status(400).json({ success: false, message: '密码格式无效，请使用客户端加密后重试', code: 'INVALID_PASSWORD_FORMAT' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const result = await authService.forgotPassword({ username, email, newPassword, ipAddress });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login - 用户登录
 */
router.post('/login', validateAuthInput, async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: '请输入用户名和密码' });
    }

    // 密码必须为 MD5 加密后的 32 位哈希
    if (!MD5_REGEX.test(password)) {
      return res.status(400).json({ success: false, message: '密码格式无效，请使用客户端加密后重试', code: 'INVALID_PASSWORD_FORMAT' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';

    let result;
    try {
      result = await authService.login({ username, password, deviceInfo, ipAddress });
    } catch (loginErr) {
      // 登录失败（用户名/密码错误、账户被锁等）→ 记入 IP 失败次数用于限流
      recordLoginFailure(req);
      throw loginErr;
    }
    // 登录成功 → 清空该 IP 的失败记录（成功登录不应累积限流计数）
    clearLoginRecord(req);
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
    // 密码必须为 MD5 加密后的 32 位哈希
    if (!MD5_REGEX.test(oldPassword) || !MD5_REGEX.test(newPassword)) {
      return res.status(400).json({ success: false, message: '密码格式无效，请使用客户端加密后重试', code: 'INVALID_PASSWORD_FORMAT' });
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
