/**
 * 服务器配置 - 数据库连接 & JWT 密钥
 * 生产环境请修改为实际值
 */
module.exports = {
  // MySQL 数据库配置（阿里云服务器）
  db: {
    host: '114.55.11.191',
    port: 3306,
    user: 'root',
    password: 'Abc3622490', // 请修改为你的MySQL密码
    database: 'sso_system',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    connectTimeout: 5000,
  },

  // JWT 配置
  jwt: {
    secret: 'sso-secret-key-change-in-production-2024', // 生产环境请更换
    refreshSecret: 'sso-refresh-secret-key-change-in-production-2024',
    accessTokenExpiry: '2h',      // Access Token 有效期
    refreshTokenExpiry: '7d',     // Refresh Token 有效期
  },

  // 服务端口
  server: {
    port: 3900,
  },

  // 安全配置
  security: {
    bcryptRounds: 12,                    // 密码加密轮数
    maxLoginAttempts: 5,                 // 最大登录尝试次数
    lockTime: 15 * 60 * 1000,           // 锁定时间 15分钟
    rateLimitWindow: 15 * 60 * 1000,    // 限流窗口
    rateLimitMax: 100,                   // 窗口内最大请求数
  },
};
