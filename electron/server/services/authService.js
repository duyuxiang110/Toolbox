/**
 * 认证服务 - 处理登录、注册、Token 管理
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { query } = require('../db/pool');

class AuthService {
  /**
   * 用户注册
   */
  async register({ username, email, password, phone }) {
    // 检查用户名是否已存在
    const existingUser = await query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    if (existingUser.length > 0) {
      throw { status: 409, message: '用户名或邮箱已被注册' };
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);

    // 创建用户（需管理员审核通过后方可登录）
    const result = await query(
      `INSERT INTO users (username, email, password_hash, phone, role, status)
       VALUES (?, ?, ?, ?, 'user', 'pending')`,
      [username, email, passwordHash, phone || null]
    );

    return {
      id: result.insertId,
      username,
      email,
      role: 'user',
    };
  }

  /**
   * 用户登录
   */
  async login({ username, password, deviceInfo, ipAddress }) {
    // 查找用户
    const users = await query(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, username]
    );

    if (users.length === 0) {
      await this._logLogin(null, username, ipAddress, deviceInfo, 'login_failed', '用户不存在');
      throw { status: 401, message: '用户名或密码错误' };
    }

    const user = users[0];

    // 检查账户状态
    if (user.status === 'inactive') {
      await this._logLogin(user.id, username, ipAddress, deviceInfo, 'login_failed', '账户已被限制登录');
      throw { status: 403, message: '您的账户已被限制登录，请联系管理员' };
    }

    // 检查是否待管理员审核
    if (user.status === 'pending') {
      await this._logLogin(user.id, username, ipAddress, deviceInfo, 'login_failed', '账户待管理员审核');
      throw { status: 403, message: '您的账户正在等待管理员审核，请耐心等待' };
    }

    // 检查是否被锁定
    if (user.status === 'locked' || (user.locked_until && new Date(user.locked_until) > new Date())) {
      const remainMin = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      throw { status: 423, message: `账户已锁定，请 ${remainMin} 分钟后重试` };
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      // 增加失败次数
      const attempts = user.login_attempts + 1;
      if (attempts >= config.security.maxLoginAttempts) {
        const lockedUntil = new Date(Date.now() + config.security.lockTime);
        await query(
          'UPDATE users SET login_attempts = ?, locked_until = ?, status = ? WHERE id = ?',
          [attempts, lockedUntil, 'locked', user.id]
        );
        await this._logLogin(user.id, username, ipAddress, deviceInfo, 'login_failed', '密码错误次数过多，账户已锁定');
        throw { status: 423, message: '密码错误次数过多，账户已锁定15分钟' };
      }

      await query('UPDATE users SET login_attempts = ? WHERE id = ?', [attempts, user.id]);
      await this._logLogin(user.id, username, ipAddress, deviceInfo, 'login_failed', `密码错误 (${attempts}/${config.security.maxLoginAttempts})`);
      throw { status: 401, message: `用户名或密码错误 (剩余 ${config.security.maxLoginAttempts - attempts} 次机会)` };
    }

    // 登录成功 - 重置失败次数
    await query(
      'UPDATE users SET login_attempts = 0, locked_until = NULL, status = ?, last_login_at = NOW(), last_login_ip = ? WHERE id = ?',
      ['active', ipAddress, user.id]
    );

    // 生成 Token
    const tokens = await this._generateTokens(user, deviceInfo, ipAddress);

    // 创建 SSO 会话
    const sessionId = uuidv4();
    const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小时
    await query(
      `INSERT INTO sessions (session_id, user_id, ip_address, user_agent, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [sessionId, user.id, ipAddress, deviceInfo, sessionExpiry]
    );

    // 记录登录日志
    await this._logLogin(user.id, username, ipAddress, deviceInfo, 'login_success', '登录成功');

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        phone: user.phone,
        lastLoginAt: user.last_login_at,
      },
      ...tokens,
      sessionId,
    };
  }

  /**
   * 刷新 Token
   */
  async refreshToken(refreshToken, ipAddress) {
    // 验证 refresh token
    let payload;
    try {
      payload = jwt.verify(refreshToken, config.jwt.refreshSecret);
    } catch (err) {
      throw { status: 401, message: 'Refresh Token 无效或已过期' };
    }

    // 检查 token 是否在数据库中
    const tokens = await query(
      'SELECT * FROM refresh_tokens WHERE token = ? AND user_id = ? AND expires_at > NOW()',
      [refreshToken, payload.userId]
    );

    if (tokens.length === 0) {
      throw { status: 401, message: 'Token 已失效，请重新登录' };
    }

    // 获取用户信息
    const users = await query('SELECT * FROM users WHERE id = ? AND status = ?', [payload.userId, 'active']);
    if (users.length === 0) {
      throw { status: 401, message: '用户不存在或已被禁用' };
    }

    const user = users[0];

    // 删除旧 refresh token（旋转策略）
    await query('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);

    // 生成新 token 对
    const newTokens = await this._generateTokens(user, null, ipAddress);

    // 记录日志
    await this._logLogin(user.id, user.username, ipAddress, null, 'token_refresh', 'Token 刷新');

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
      ...newTokens,
    };
  }

  /**
   * 登出
   */
  async logout(userId, sessionId, refreshToken) {
    // 删除 refresh token
    if (refreshToken) {
      await query('DELETE FROM refresh_tokens WHERE token = ? AND user_id = ?', [refreshToken, userId]);
    }

    // 使会话失效
    if (sessionId) {
      await query('UPDATE sessions SET is_active = 0 WHERE session_id = ? AND user_id = ?', [sessionId, userId]);
    }

    // 记录日志
    const users = await query('SELECT username FROM users WHERE id = ?', [userId]);
    if (users.length > 0) {
      await this._logLogin(userId, users[0].username, null, null, 'logout', '用户登出');
    }
  }

  /**
   * 修改密码
   */
  async changePassword(userId, oldPassword, newPassword) {
    const users = await query('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      throw { status: 404, message: '用户不存在' };
    }

    const user = users[0];
    const isValid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isValid) {
      throw { status: 400, message: '原密码错误' };
    }

    const newHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);

    // 使所有 refresh token 失效（强制重新登录）
    await query('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
    await query('UPDATE sessions SET is_active = 0 WHERE user_id = ?', [userId]);

    await this._logLogin(userId, user.username, null, null, 'password_change', '密码已修改');

    return { message: '密码修改成功，请重新登录' };
  }

  /**
   * 忘记密码自助重置（用户名 + 邮箱双重校验）
   */
  async forgotPassword({ username, email, newPassword, ipAddress }) {
    const users = await query('SELECT * FROM users WHERE username = ? AND email = ?', [username, email]);
    if (users.length === 0) {
      throw { status: 404, message: '用户名与邮箱不匹配，请核对后重试' };
    }

    const user = users[0];
    if (user.status === 'inactive') {
      throw { status: 403, message: '账户已被限制登录，请联系管理员' };
    }

    const newHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);
    // 锁定账户重置后自动解锁；待审核账户保持待审核
    const newStatus = user.status === 'locked' ? 'active' : user.status;
    await query(
      'UPDATE users SET password_hash = ?, login_attempts = 0, locked_until = NULL, status = ? WHERE id = ?',
      [newHash, newStatus, user.id]
    );

    // 使现有 token / 会话失效
    await query('DELETE FROM refresh_tokens WHERE user_id = ?', [user.id]);
    await query('UPDATE sessions SET is_active = 0 WHERE user_id = ?', [user.id]);

    await this._logLogin(user.id, username, ipAddress || null, null, 'password_change', '忘记密码自助重置');

    return { message: '密码重置成功，请使用新密码登录' };
  }

  /**
   * 验证 SSO 会话
   */
  async validateSession(sessionId) {
    const sessions = await query(
      `SELECT s.*, u.username, u.email, u.role, u.avatar
       FROM sessions s JOIN users u ON s.user_id = u.id
       WHERE s.session_id = ? AND s.is_active = 1 AND s.expires_at > NOW()`,
      [sessionId]
    );

    if (sessions.length === 0) {
      return null;
    }

    // 更新最后活跃时间
    await query('UPDATE sessions SET last_activity = NOW() WHERE session_id = ?', [sessionId]);

    return sessions[0];
  }

  /**
   * 生成 Access Token + Refresh Token
   */
  async _generateTokens(user, deviceInfo, ipAddress) {
    const accessToken = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.accessTokenExpiry }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshTokenExpiry }
    );

    // 存储 refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await query(
      'INSERT INTO refresh_tokens (user_id, token, device_info, ip_address, expires_at) VALUES (?, ?, ?, ?, ?)',
      [user.id, refreshToken, deviceInfo, ipAddress, expiresAt]
    );

    return { accessToken, refreshToken };
  }

  /**
   * 记录登录日志
   */
  async _logLogin(userId, username, ipAddress, deviceInfo, action, detail) {
    try {
      await query(
        'INSERT INTO login_logs (user_id, username, ip_address, device_info, action, detail) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, username, ipAddress, deviceInfo, action, detail]
      );
    } catch (err) {
      console.error('[Auth] 记录日志失败:', err.message);
    }
  }
}

module.exports = new AuthService();
