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

  const newPool = mysql.createPool({
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
    // 保活配置 - 防止远程连接超时断开
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,  // 每10秒发送心跳
  });

  // 测试连接
  try {
    const connection = await newPool.getConnection();
    console.log('[DB] MySQL 连接成功:', config.db.host);
    connection.release();
    pool = newPool;
  } catch (error) {
    // 连接失败，关闭临时池并不设置全局 pool
    await newPool.end().catch(() => {});
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
 * 执行查询（带自动重试，解决远程连接超时问题）
 */
async function query(sql, params = [], retries = 2) {
  const p = getPool();
  try {
    const [rows] = await p.execute(sql, params);
    return rows;
  } catch (error) {
    // 连接超时/断开时自动重试
    const retryableErrors = ['ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'PROTOCOL_CONNECTION_LOST'];
    const isRetryable = retryableErrors.some(code =>
      error.message?.includes(code) || error.code === code
    );

    if (isRetryable && retries > 0) {
      console.log(`[DB] 连接中断(${error.code || 'ETIMEDOUT'})，重试中... 剩余${retries}次`);
      await new Promise(r => setTimeout(r, 1000)); // 等待1秒后重试
      return query(sql, params, retries - 1);
    }
    throw error;
  }
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
