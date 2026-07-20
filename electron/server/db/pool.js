/**
 * MySQL 连接池管理
 */
const mysql = require('mysql2/promise');
const config = require('../config');

let pool = null;

/**
 * 初始化数据库连接池
 */
async function initPool() {
  if (pool) return pool;

  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: config.db.waitForConnections,
    connectionLimit: config.db.connectionLimit,
    queueLimit: config.db.queueLimit,
    connectTimeout: config.db.connectTimeout,
    dateStrings: true,
  });

  // 测试连接
  try {
    const connection = await pool.getConnection();
    console.log('[DB] MySQL 连接成功:', config.db.host);
    connection.release();
  } catch (error) {
    console.error('[DB] MySQL 连接失败:', error.message);
    throw error;
  }

  return pool;
}

/**
 * 获取连接池
 */
function getPool() {
  if (!pool) {
    throw new Error('数据库连接池未初始化，请先调用 initPool()');
  }
  return pool;
}

/**
 * 执行查询
 */
async function query(sql, params = []) {
  const p = getPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

/**
 * 关闭连接池
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[DB] MySQL 连接池已关闭');
  }
}

module.exports = { initPool, getPool, query, closePool };
