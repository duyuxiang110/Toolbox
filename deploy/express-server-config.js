/**
 * 服务器端 Express 配置 — MySQL 本地连接
 * 部署到 /opt/lingguang-express/server/config/index.js
 */
module.exports = {
  db: {
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'Abc3622490',
    database: 'sso_system',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    connectTimeout: 5000,
  },
  jwt: {
    secret: 'sso-secret-key-change-in-production-2024',
    refreshSecret: 'sso-refresh-secret-key-change-in-production-2024',
    accessTokenExpiry: '2h',
    refreshTokenExpiry: '7d',
  },
  server: {
    port: 3900,
  },
  security: {
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    rateLimitWindow: 15 * 60 * 1000,
    rateLimitMax: 100,
  },
};
