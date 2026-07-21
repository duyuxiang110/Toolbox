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
const toolsRoutes = require('./routes/tools');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { loginIpLimiter } = require('./middleware/loginLimiter');
const { sanitizeBody } = require('./middleware/sanitize');

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

  // 防注入：全局请求体检测
  app.use('/api/', sanitizeBody);

  // 限流
  const limiter = rateLimit({
    windowMs: config.security.rateLimitWindow,
    max: config.security.rateLimitMax,
    message: { success: false, message: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  // 登录接口 IP 限流：1分钟超过5次 → 锁定10分钟
  app.use('/api/auth/login', loginIpLimiter);

  // 健康检查
  app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'SSO Server Running', timestamp: new Date().toISOString() });
  });

  // 路由
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/tools', toolsRoutes);

  // 404 & 错误处理
  app.use(notFound);
  app.use(errorHandler);

  // 初始化数据库连接（失败不阻止服务启动，自动重试）
  try {
    await initPool();
    await initDatabase();
    await createDefaultAdmin();
  } catch (err) {
    console.error('[Server] 数据库初始化失败:', err.message);
    console.log('[Server] 将在 30 秒后重试连接数据库...');
    // 定时重试连接
    const retryTimer = setInterval(async () => {
      try {
        await initPool();
        await initDatabase();
        await createDefaultAdmin();
        console.log('[Server] 数据库重连成功 ✓');
        clearInterval(retryTimer);
      } catch (e) {
        console.log('[Server] 数据库重连失败，30秒后再试...');
      }
    }, 30000);
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
 * 密码流程：前端 MD5(明文) → 服务端 bcrypt(MD5)
 */
async function createDefaultAdmin() {
  const bcrypt = require('bcryptjs');
  const crypto = require('crypto');
  const { query } = require('./db/pool');

  const md5 = (str) => crypto.createHash('md5').update(str).digest('hex');
  const existing = await query("SELECT id, password_hash FROM users WHERE username = 'admin'");

  if (existing.length === 0) {
    // 新建管理员：bcrypt(md5('Abc3622490'))
    const hash = await bcrypt.hash(md5('Abc3622490'), config.security.bcryptRounds);
    await query(
      `INSERT INTO users (username, email, password_hash, role, status)
       VALUES ('admin', 'duyuxiang110@gmail.com', ?, 'admin', 'active')`,
      [hash]
    );
    console.log('[Server] 默认管理员已创建: admin / Abc3622490');
  } else {
    // 迁移：如果旧哈希是明文流程 bcrypt('Abc3622490')，升级为 MD5 流程
    const oldHash = existing[0].password_hash;
    const isOldFlow = await bcrypt.compare('Abc3622490', oldHash).catch(() => false);
    if (isOldFlow) {
      const newHash = await bcrypt.hash(md5('Abc3622490'), config.security.bcryptRounds);
      await query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, existing[0].id]);
      console.log('[Server] 管理员密码哈希已升级为 MD5 流程');
    }
  }
}

/**
 * 停止服务器
 */
async function stopServer() {
  try {
    if (server) {
      server.close();
      server = null;
    }
    await closePool();
    console.log('[Server] SSO API 服务已停止');
  } catch (e) {
    // 忽略关闭时的错误
  }
}

module.exports = { startServer, stopServer };
