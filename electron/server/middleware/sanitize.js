/**
 * 防 SQL 注入 & XSS 输入校验中间件
 * 1. 所有数据库查询已使用参数化查询（mysql2 占位符）—— 根本防线
 * 2. 本中间件对敏感字段做二次过滤，拦截明显攻击载荷
 */

// SQL 注入特征模式
const SQL_INJECTION_PATTERNS = [
  /(\b(union|select|insert|update|delete|drop|alter|create|truncate)\b\s+.*(table|database|from|into))/i,
  /(--|;)\s*(drop|delete|update|insert|select)/i,
  /'\s*(or|and)\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i,
  /'\s*(or|and)\s+'[^']*'\s*=\s*'/i,
  /\b(sleep|benchmark|waitfor\s+delay)\s*\(/i,
  /information_schema/i,
  /load_file\s*\(/i,
  /into\s+(out|dump)file/i,
];

// XSS 特征模式
const XSS_PATTERNS = [
  /<script[\s>]/i,
  /javascript\s*:/i,
  /on(error|load|click|mouseover)\s*=/i,
  /<iframe[\s>]/i,
  /expression\s*\(/i,
];

/**
 * 检测字符串是否包含注入特征
 */
function hasInjectionPattern(value) {
  if (typeof value !== 'string') return false;
  const decoded = value.replace(/(%27|%22|%3B|%2D)/gi, (m) => decodeURIComponent(m));
  return SQL_INJECTION_PATTERNS.some(p => p.test(decoded)) || XSS_PATTERNS.some(p => p.test(decoded));
}

/**
 * 严格模式：用户名/邮箱字段白名单校验
 */
function validateAuthInput(req, res, next) {
  const { username, email } = req.body || {};

  if (username !== undefined) {
    if (typeof username !== 'string' || hasInjectionPattern(username)) {
      return res.status(400).json({ success: false, message: '用户名包含非法字符', code: 'INVALID_INPUT' });
    }
    // 用户名白名单：字母、数字、中文、下划线、点、连字符
    if (username && !/^[\w\u4e00-\u9fa5.\-@]+$/.test(username)) {
      return res.status(400).json({ success: false, message: '用户名格式不合法', code: 'INVALID_INPUT' });
    }
  }

  if (email !== undefined && email !== null && email !== '') {
    if (typeof email !== 'string' || hasInjectionPattern(email)) {
      return res.status(400).json({ success: false, message: '邮箱包含非法字符', code: 'INVALID_INPUT' });
    }
  }

  next();
}

/**
 * 通用模式：对请求体所有字符串字段做注入检测
 */
function sanitizeBody(req, res, next) {
  const body = req.body;
  if (body && typeof body === 'object') {
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string' && hasInjectionPattern(value)) {
        console.warn(`[Security] 拦截疑似注入请求: 字段=${key}, IP=${req.ip}`);
        return res.status(400).json({ success: false, message: '请求包含非法内容', code: 'INVALID_INPUT' });
      }
    }
  }
  next();
}

module.exports = { validateAuthInput, sanitizeBody, hasInjectionPattern };
