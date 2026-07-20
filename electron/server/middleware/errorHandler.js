/**
 * 全局错误处理中间件
 */
function errorHandler(err, req, res, next) {
  console.error('[Error]', err.message || err);

  const status = err.status || 500;
  const message = err.message || '服务器内部错误';

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

/**
 * 404 处理
 */
function notFound(req, res) {
  res.status(404).json({ success: false, message: `接口不存在: ${req.method} ${req.path}` });
}

module.exports = { errorHandler, notFound };
