/**
 * Express 服务器入口
 * 在 Electron 主进程中启动
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { initPool, closePool } = require('./db/pool');
const { initDatabase } = require('./db/init');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const { errorHandler, notFound } = require('./middleware/errorHandler');

let server = null;

/**
 * 启动 API 服务器
 */
async function startServer() {
  const app = express();

  // 安全中间件
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // 请求体解析
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 限流
  const limiter = rateLimit({
    windowMs: config.security.rateLimitWindow,
    max: config.security.rateLimitMax,
    message: { success: false, message: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  // 登录接口更严格的限流
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: '登录尝试过于频繁，请15分钟后再试' },
  });
  app.use('/api/auth/login', loginLimiter);

  // 健康检查
  app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'SSO Server Running', timestamp: new Date().toISOString() });
  });

  // 路由
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);

  // 404 & 错误处理
  app.use(notFound);
  app.use(errorHandler);

  // 初始化数据库连接
  try {
    await initPool();
    await initDatabase();
    await createDefaultAdmin();
  } catch (err) {
    console.error('[Server] 数据库初始化失败:', err.message);
    console.log('[Server] 请确保 MySQL 服务已启动且配置正确');
    // 不阻止服务器启动，允许重试
  }

  // 启动监听
  return new Promise((resolve) => {
    server = app.listen(config.server.port, '127.0.0.1', () => {
      console.log(`[Server] SSO API 服务已启动: http://127.0.0.1:${config.server.port}`);
      resolve(server);
    });
  });
}

/**
 * 创建默认管理员账户
 */
async function createDefaultAdmin() {
  const bcrypt = require('bcryptjs');
  const { query } = require('./db/pool');

  const existing = await query("SELECT id FROM users WHERE username = 'admin'");
  if (existing.length === 0) {
    const hash = await bcrypt.hash('admin123', config.security.bcryptRounds);
    await query(
      `INSERT INTO users (username, email, password_hash, role, status)
       VALUES ('admin', 'admin@sso.local', ?, 'admin', 'active')`,
      [hash]
    );
    console.log('[Server] 默认管理员已创建: admin / admin123');
  }
}

/**
 * 停止服务器
 */
async function stopServer() {
  if (server) {
    server.close();
    server = null;
  }
  await closePool();
  console.log('[Server] SSO API 服务已停止');
}

module.exports = { startServer, stopServer };
