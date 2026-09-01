/**
 * 登录页面 - 工业级 SSO 登录
 * 粒子动画背景 + 毛玻璃卡片 + 流畅动效
 */
import { useState, type FormEvent } from 'react';
import { useAuth, encryptPassword } from '../../context/AuthContext';
import { api } from '../../api/client';
import ParticleCanvas from './ParticleCanvas';
import ThemeToggle from '../ThemeToggle';
import './auth.less';

interface LoginPageProps {
  onSwitchToRegister: () => void;
}

export default function LoginPage({ onSwitchToRegister }: LoginPageProps) {
  const { login } = useAuth();

  // 读取记住的账号密码
  const savedCredentials = (() => {
    try {
      const saved = localStorage.getItem('remembered_credentials');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return null;
  })();

  const [username, setUsername] = useState(savedCredentials?.username || '');
  const [password, setPassword] = useState(savedCredentials?.password || '');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(!!savedCredentials);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotForm, setForgotForm] = useState({ username: '', email: '', newPassword: '', confirmPassword: '' });
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const openForgot = () => {
    setShowForgot(true);
    setForgotStep(1);
    setForgotForm({ username: '', email: '', newPassword: '', confirmPassword: '' });
    setForgotError('');
    setForgotSuccess(false);
  };

  const updateForgot = (field: string, value: string) => {
    setForgotForm(prev => ({ ...prev, [field]: value }));
  };

  // 更新忘记密码表单字段
  const handleForgotNext = () => {
    setForgotError('');
    if (!forgotForm.username.trim() || !forgotForm.email.trim()) {
      setForgotError('请填写用户名和注册邮箱');
      return;
    }
    setForgotStep(2);
  };

  // 处理忘记密码下一步
  const handleForgotSubmit = async () => {
    setForgotError('');
    if (!forgotForm.newPassword || forgotForm.newPassword.length < 6) {
      setForgotError('新密码长度至少6位');
      return;
    }
    if (forgotForm.newPassword !== forgotForm.confirmPassword) {
      setForgotError('两次输入的密码不一致');
      return;
    }
    setForgotLoading(true);
    const res = await api.post('/auth/forgot-password', {
      username: forgotForm.username.trim(),
      email: forgotForm.email.trim(),
      newPassword: encryptPassword(forgotForm.newPassword),
    });
    setForgotLoading(false);
    if (res.success) {
      setForgotSuccess(true);
      setUsername(forgotForm.username.trim());
      setTimeout(() => setShowForgot(false), 1800);
    } else {
      setForgotError(res.message || '重置失败，请核对信息');
    }
  };

  // 处理登录表单提交
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      triggerShake();
      return;
    }

    setIsLoading(true);
    const result = await login(username.trim(), password);
    setIsLoading(false);

    if (result.success) {
      // 登录成功，处理记住我
      if (rememberMe) {
        localStorage.setItem('remembered_credentials', JSON.stringify({ username: username.trim(), password }));
      } else {
        localStorage.removeItem('remembered_credentials');
      }
    } else {
      setError(result.message || '登录失败');
      triggerShake();
    }
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  };

  return (
    <div className="auth-container">
      {/* 粒子动画背景 */}
      <ParticleCanvas className="particle-bg" />

      {/* 渐变光晕装饰 */}
      <div className="auth-glow auth-glow-1" />
      <div className="auth-glow auth-glow-2" />
      <div className="auth-glow auth-glow-3" />

      {/* 主题切换（右上角） */}
      <ThemeToggle className="auth-theme-toggle" />

      {/* 登录卡片 */}
      <div className={`auth-card ${shake ? 'shake' : ''}`}>
        {/* Logo & 标题 */}
        <div className="auth-header">
          <div className="auth-logo">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="48" rx="12" fill="url(#logo-gradient)" />
              <path d="M24 12L34 18V30L24 36L14 30V18L24 12Z" stroke="white" strokeWidth="2" fill="none" />
              <circle cx="24" cy="24" r="4" fill="white" opacity="0.9" />
              <path d="M24 20V14M28 22L33 19M28 26L33 29M24 28V34M20 26L15 29M20 22L15 19" stroke="white" strokeWidth="1.5" opacity="0.6" />
              <defs>
                <linearGradient id="logo-gradient" x1="0" y1="0" x2="48" y2="48">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="auth-title">登录认证</h1>
          <p className="auth-subtitle">Sign-On Authentication</p>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="auth-error">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM8.75 4.5v4a.75.75 0 01-1.5 0v-4a.75.75 0 011.5 0z"/>
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* 登录表单 */}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="username">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </label>
            <input
              id="username"
              type="text"
              placeholder="用户名 / 邮箱"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </label>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={isLoading}
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          <div className="form-options">
            <label className="checkbox-wrapper">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span className="checkmark" />
              <span>记住我</span>
            </label>
            <button type="button" className="forgot-link" onClick={openForgot}>忘记密码？</button>
          </div>

          <button type="submit" className={`auth-btn ${isLoading ? 'loading' : ''}`} disabled={isLoading}>
            {isLoading ? (
              <span className="spinner" />
            ) : (
              <>
                <span>登 录</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </form>

        {/* 底部 */}
        <div className="auth-footer">
          <span>还没有账户？</span>
          <button onClick={onSwitchToRegister} className="switch-btn">立即注册</button>
        </div>
      </div>

      {/* 忘记密码弹窗 */}
      {showForgot && (
        <div className="forgot-overlay" onClick={() => setShowForgot(false)}>
          <div className="forgot-modal" onClick={(e) => e.stopPropagation()}>
            <button className="forgot-close" onClick={() => setShowForgot(false)} aria-label="关闭">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            {forgotSuccess ? (
              <>
                <div className="forgot-icon forgot-icon-success">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20,6 9,17 4,12" />
                  </svg>
                </div>
                <h3 className="forgot-title">重置成功</h3>
                <p className="forgot-desc">密码已重置，请使用新密码登录</p>
              </>
            ) : (
              <>
                <div className="forgot-icon">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                </div>
                <h3 className="forgot-title">忘记密码？</h3>
                <p className="forgot-desc">
                  {forgotStep === 1
                    ? '第一步：验证身份 — 请输入注册时的用户名与邮箱'
                    : '第二步：设置新密码 — 重置成功后即可登录'}
                </p>

                <div className="forgot-stepbar">
                  <span className={`stepbar-dot ${forgotStep >= 1 ? 'on' : ''}`}>1</span>
                  <span className={`stepbar-line ${forgotStep >= 2 ? 'on' : ''}`} />
                  <span className={`stepbar-dot ${forgotStep >= 2 ? 'on' : ''}`}>2</span>
                </div>

                {forgotError && <div className="forgot-error">{forgotError}</div>}

                {forgotStep === 1 ? (
                  <div className="forgot-fields">
                    <input type="text" placeholder="用户名" value={forgotForm.username} onChange={(e) => updateForgot('username', e.target.value)} autoComplete="username" />
                    <input type="email" placeholder="注册邮箱" value={forgotForm.email} onChange={(e) => updateForgot('email', e.target.value)} autoComplete="email" />
                    <button className="auth-btn forgot-confirm" onClick={handleForgotNext}>
                      <span>下一步</span>
                    </button>
                  </div>
                ) : (
                  <div className="forgot-fields">
                    <input type="password" placeholder="新密码（至少6位）" value={forgotForm.newPassword} onChange={(e) => updateForgot('newPassword', e.target.value)} autoComplete="new-password" />
                    <input type="password" placeholder="确认新密码" value={forgotForm.confirmPassword} onChange={(e) => updateForgot('confirmPassword', e.target.value)} autoComplete="new-password" />
                    <div className="forgot-btnrow">
                      <button type="button" className="forgot-back" onClick={() => { setForgotStep(1); setForgotError(''); }} disabled={forgotLoading}>上一步</button>
                      <button className={`auth-btn forgot-confirm ${forgotLoading ? 'loading' : ''}`} onClick={handleForgotSubmit} disabled={forgotLoading}>
                        {forgotLoading ? <span className="spinner" /> : <span>重置密码</span>}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
