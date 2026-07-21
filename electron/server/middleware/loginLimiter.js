/**
 * 登录接口 IP 限流中间件
 * 规则：同一 IP 在统计窗口内「登录失败」超过 5 次 → 锁定该 IP 10 分钟
 *
 * 关键设计：只统计「失败」尝试，成功登录会清空该 IP 的记录。
 *   这样正常切换账号（每次都是成功登录）永远不会累积计数、不会被误锁；
 *   只有暴力破解（连续输错密码）才会触发锁定。
 *   （旧实现把成功登录也计入，导致本机正常切换账号几次后被锁 10 分钟。）
 *
 * 内存存储，服务重启后自动清零
 */

const WINDOW_MS = 60 * 1000;        // 统计窗口：1 分钟
const MAX_FAILURES = 5;             // 窗口内最大失败次数
const BLOCK_MS = 10 * 60 * 1000;    // 锁定时长：10 分钟

// IP -> { failures: number[], blockedUntil: number|null }
const ipRecords = new Map();

// 定期清理过期记录，防止内存泄漏
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRecords.entries()) {
    if (record.blockedUntil && record.blockedUntil < now) {
      ipRecords.delete(ip);
    } else if (record.failures.length > 0) {
      record.failures = record.failures.filter(t => now - t < WINDOW_MS);
      if (record.failures.length === 0 && !record.blockedUntil) {
        ipRecords.delete(ip);
      }
    }
  }
}, 60 * 1000);

/**
 * 获取客户端真实 IP
 */
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    '127.0.0.1'
  );
}

/** 取（或创建）某 IP 的记录 */
function getRecord(ip) {
  let record = ipRecords.get(ip);
  if (!record) {
    record = { failures: [], blockedUntil: null };
    ipRecords.set(ip, record);
  }
  return record;
}

/**
 * 登录限流中间件：仅检查该 IP 是否处于锁定状态，不在此计数。
 * 计数改由 recordLoginFailure / clearLoginRecord 在得知登录结果后进行，
 * 从而做到「只统计失败尝试」。
 */
function loginIpLimiter(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  const record = ipRecords.get(ip);

  if (record && record.blockedUntil && record.blockedUntil > now) {
    const remainMin = Math.ceil((record.blockedUntil - now) / 60000);
    return res.status(429).json({
      success: false,
      message: `登录失败次数过多，该 IP 已被限制，请 ${remainMin} 分钟后再试`,
      code: 'IP_BLOCKED',
    });
  }

  // 锁定已过期 → 清除
  if (record && record.blockedUntil && record.blockedUntil <= now) {
    record.blockedUntil = null;
    record.failures = [];
  }

  next();
}

/**
 * 记录一次登录失败：窗口内失败次数超过阈值则锁定 IP。
 * 由登录路由在 authService.login 抛出错误时调用。
 */
function recordLoginFailure(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const record = getRecord(ip);

  // 仍在锁定中：不再累加
  if (record.blockedUntil && record.blockedUntil > now) return;
  // 锁定已过期：先清除
  if (record.blockedUntil && record.blockedUntil <= now) {
    record.blockedUntil = null;
    record.failures = [];
  }

  // 清除窗口外的旧失败记录，再记入本次
  record.failures = record.failures.filter(t => now - t < WINDOW_MS);
  record.failures.push(now);

  if (record.failures.length > MAX_FAILURES) {
    record.blockedUntil = now + BLOCK_MS;
    record.failures = [];
    console.warn(`[Security] IP ${ip} 登录失败过于频繁，已锁定 10 分钟`);
  }
}

/**
 * 登录成功：清空该 IP 的失败记录。
 * 成功登录不应累积限流计数，避免正常切换账号被误锁。
 */
function clearLoginRecord(req) {
  const ip = getClientIp(req);
  ipRecords.delete(ip);
}

module.exports = { loginIpLimiter, recordLoginFailure, clearLoginRecord, getClientIp };
