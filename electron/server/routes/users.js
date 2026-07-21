/**
 * 用户管理路由 - 需要管理员权限
 */
const express = require('express');
const router = express.Router();
const userService = require('../services/userService');
const { authenticate, requireRole } = require('../middleware/auth');

// 所有用户管理路由都需要认证
router.use(authenticate);

/**
 * GET /api/users - 获取用户列表（管理员）
 */
router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { page, pageSize, keyword, role, status } = req.query;
    const result = await userService.getUsers({
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 20,
      keyword: keyword || '',
      role: role || '',
      status: status || '',
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/stats - 获取统计数据（管理员）
 */
router.get('/stats', requireRole('admin'), async (req, res, next) => {
  try {
    const stats = await userService.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/logs - 获取登录日志（管理员）
 */
router.get('/logs', requireRole('admin'), async (req, res, next) => {
  try {
    const { page, pageSize, userId, action } = req.query;
    const result = await userService.getLoginLogs({
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 50,
      userId: userId ? parseInt(userId) : null,
      action: action || '',
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/permissions - 获取当前用户权限
 */
router.get('/permissions', async (req, res, next) => {
  try {
    const permissions = await userService.getUserPermissions(req.user.userId);
    res.json({ success: true, data: permissions });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/profile - 获取当前用户信息
 */
router.get('/profile', async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.user.userId);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/users/profile - 更新个人资料
 */
router.put('/profile', async (req, res, next) => {
  try {
    const { email, phone, avatar } = req.body;
    const user = await userService.updateUser(req.user.userId, { email, phone, avatar });
    res.json({ success: true, data: user, message: '资料更新成功' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/:id - 获取指定用户（管理员）
 */
router.get('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const user = await userService.getUserById(parseInt(req.params.id));
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/users/:id - 更新用户（管理员）
 */
router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { email, phone, role, status } = req.body;
    const user = await userService.updateUser(parseInt(req.params.id), { email, phone, role, status });
    res.json({ success: true, data: user, message: '用户更新成功' });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/users/:id - 删除用户（管理员）
 */
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await userService.deleteUser(parseInt(req.params.id));
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users/:id/unlock - 解锁用户（管理员）
 */
router.post('/:id/unlock', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await userService.unlockUser(parseInt(req.params.id));
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users/:id/restrict - 限制登录（管理员）
 */
router.post('/:id/restrict', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await userService.restrictUser(parseInt(req.params.id));
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users/:id/unrestrict - 解除限制（管理员）
 */
router.post('/:id/unrestrict', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await userService.unrestrictUser(parseInt(req.params.id));
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users/:id/approve - 审核通过注册用户（管理员）
 */
router.post('/:id/approve', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await userService.approveUser(parseInt(req.params.id));
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users/:id/reset-password - 重置密码（管理员）
 */
router.post('/:id/reset-password', requireRole('admin'), async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    // 密码必须为 MD5 加密后的 32 位哈希
    if (!newPassword || !/^[a-f0-9]{32}$/i.test(newPassword)) {
      return res.status(400).json({ success: false, message: '密码格式无效，请使用客户端加密后重试' });
    }
    const result = await userService.resetPassword(parseInt(req.params.id), newPassword);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
