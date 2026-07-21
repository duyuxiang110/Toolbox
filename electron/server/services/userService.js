/**
 * 用户管理服务 - 用户CRUD、权限管理
 */
const bcrypt = require('bcryptjs');
const config = require('../config');
const { query } = require('../db/pool');

class UserService {
  /**
   * 获取用户列表（分页）
   */
  async getUsers({ page = 1, pageSize = 20, keyword = '', role = '', status = '' }) {
    const offset = (page - 1) * pageSize;
    let where = 'WHERE 1=1';
    const params = [];

    if (keyword) {
      where += ' AND (username LIKE ? OR email LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (role) {
      where += ' AND role = ?';
      params.push(role);
    }
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM users ${where}`, params);
    const total = countResult[0].total;

    const users = await query(
      `SELECT id, username, email, avatar, phone, role, status, login_attempts,
              locked_until, last_login_at, last_login_ip, created_at, updated_at
       FROM users ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, String(pageSize), String(offset)]
    );

    return { users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * 获取单个用户详情
   */
  async getUserById(userId) {
    const users = await query(
      `SELECT id, username, email, avatar, phone, role, status,
              last_login_at, last_login_ip, created_at, updated_at
       FROM users WHERE id = ?`,
      [userId]
    );
    if (users.length === 0) {
      throw { status: 404, message: '用户不存在' };
    }
    return users[0];
  }

  /**
   * 更新用户信息
   */
  async updateUser(userId, { email, phone, avatar, role, status }) {
    const fields = [];
    const params = [];

    if (email !== undefined) { fields.push('email = ?'); params.push(email); }
    if (phone !== undefined) { fields.push('phone = ?'); params.push(phone); }
    if (avatar !== undefined) { fields.push('avatar = ?'); params.push(avatar); }
    if (role !== undefined) { fields.push('role = ?'); params.push(role); }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }

    if (fields.length === 0) {
      throw { status: 400, message: '没有需要更新的字段' };
    }

    params.push(userId);
    await query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);

    return this.getUserById(userId);
  }

  /**
   * 删除用户（级联删除所有关联数据）
   */
  async deleteUser(userId) {
    const users = await query('SELECT id, username, role FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      throw { status: 404, message: '用户不存在' };
    }
    if (users[0].role === 'admin') {
      throw { status: 403, message: '不能删除管理员账户' };
    }

    // 级联删除关联数据
    await query('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
    await query('DELETE FROM sessions WHERE user_id = ?', [userId]);
    await query('DELETE FROM login_logs WHERE user_id = ?', [userId]);
    await query('DELETE FROM users WHERE id = ?', [userId]);

    return { message: `用户 ${users[0].username} 及其所有关联数据已删除` };
  }

  /**
   * 解锁用户
   */
  async unlockUser(userId) {
    await query(
      'UPDATE users SET status = ?, login_attempts = 0, locked_until = NULL WHERE id = ?',
      ['active', userId]
    );
    return { message: '用户已解锁' };
  }

  /**
   * 限制登录（设为禁用状态，登录时提示异常）
   */
  async restrictUser(userId) {
    const users = await query('SELECT id, username, role FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      throw { status: 404, message: '用户不存在' };
    }
    if (users[0].role === 'admin') {
      throw { status: 403, message: '不能限制管理员账户' };
    }

    await query('UPDATE users SET status = ? WHERE id = ?', ['inactive', userId]);
    // 使其现有会话/token 失效，强制下线
    await query('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
    await query('UPDATE sessions SET is_active = 0 WHERE user_id = ?', [userId]);

    return { message: `用户 ${users[0].username} 已被限制登录` };
  }

  /**
   * 解除限制（恢复正常状态）
   */
  async unrestrictUser(userId) {
    const users = await query('SELECT id, username FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      throw { status: 404, message: '用户不存在' };
    }

    await query(
      'UPDATE users SET status = ?, login_attempts = 0, locked_until = NULL WHERE id = ?',
      ['active', userId]
    );

    return { message: `用户 ${users[0].username} 已解除限制` };
  }

  /**
   * 审核通过注册用户（pending → active）
   */
  async approveUser(userId) {
    const users = await query('SELECT id, username, status FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      throw { status: 404, message: '用户不存在' };
    }
    if (users[0].status !== 'pending') {
      throw { status: 400, message: '该账户无需审核' };
    }

    await query('UPDATE users SET status = ? WHERE id = ?', ['active', userId]);

    return { message: `用户 ${users[0].username} 已通过审核，可以登录了` };
  }

  /**
   * 重置用户密码（管理员操作）
   */
  async resetPassword(userId, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
    // 使所有 token 失效
    await query('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
    await query('UPDATE sessions SET is_active = 0 WHERE user_id = ?', [userId]);
    return { message: '密码已重置，用户需重新登录' };
  }

  /**
   * 获取用户权限列表
   */
  async getUserPermissions(userId) {
    const users = await query('SELECT role FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return [];

    const permissions = await query(
      `SELECT p.code, p.name, p.description
       FROM role_permissions rp
       JOIN permissions p ON rp.permission_id = p.id
       WHERE rp.role = ?`,
      [users[0].role]
    );

    return permissions;
  }

  /**
   * 获取登录日志
   */
  async getLoginLogs({ page = 1, pageSize = 50, userId = null, action = '' }) {
    const offset = (page - 1) * pageSize;
    let where = 'WHERE 1=1';
    const params = [];

    if (userId) {
      where += ' AND l.user_id = ?';
      params.push(userId);
    }
    if (action) {
      where += ' AND l.action = ?';
      params.push(action);
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM login_logs l ${where}`, params);
    const total = countResult[0].total;

    const logs = await query(
      `SELECT l.*, u.username as user_username
       FROM login_logs l
       LEFT JOIN users u ON l.user_id = u.id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, String(pageSize), String(offset)]
    );

    return { logs, total, page, pageSize };
  }

  /**
   * 获取统计数据
   */
  async getStats() {
    const [totalUsers] = await query('SELECT COUNT(*) as count FROM users');
    const [activeUsers] = await query("SELECT COUNT(*) as count FROM users WHERE status = 'active'");
    const [lockedUsers] = await query("SELECT COUNT(*) as count FROM users WHERE status = 'locked'");
    const [activeSessions] = await query('SELECT COUNT(*) as count FROM sessions WHERE is_active = 1 AND expires_at > NOW()');
    const [todayLogins] = await query(
      "SELECT COUNT(*) as count FROM login_logs WHERE action = 'login_success' AND DATE(created_at) = CURDATE()"
    );

    return {
      totalUsers: totalUsers.count,
      activeUsers: activeUsers.count,
      lockedUsers: lockedUsers.count,
      activeSessions: activeSessions.count,
      todayLogins: todayLogins.count,
    };
  }
}

module.exports = new UserService();
