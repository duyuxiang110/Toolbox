/**
 * 注册页面
 */
import { useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import ParticleCanvas from './ParticleCanvas';
import './auth.css';

interface RegisterPageProps {
  onSwitchToLogin: () => void;
}

export default function RegisterPage({ onSwitchToLogin }: RegisterPageProps) {
  const { register } = useAuth();
  const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '', phone: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [shake, setShake] = useState(false);

  const getPasswordStrength = (pwd: string): number => {
    let score = 0;
    if (pwd.length >= 6) score++;
    if (pwd.length >= 10) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return Math.min(score, 4);
  };

  const strength = getPasswordStrength(form.password);
  const strengthLabels = ['', '弱', '一般', '较强', '强'];
  const strengthClasses = ['', 'weak', 'medium', 'medium', 'strong'];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.username.trim() || !form.email.trim() || !form.password) {
      setError('请填写所有必填项');
      triggerShake();
      return;
    }
    if (form.password.length < 6) {
      setError('密码长度至少6位');
      triggerShake();
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('两次输入的密码不一致');
      triggerShake();
      return;
    }

    setIsLoading(true);
    const result = await register({
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
      phone: form.phone.trim() || undefined,
    });
    setIsLoading(false);

    if (result.success) {
      setSuccess('注册成功！即将跳转到登录页...');
      setTimeout(onSwitchToLogin, 2000);
    } else {
      setError(result.message || '注册失败');
      triggerShake();
    }
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  };

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="auth-container">
      <ParticleCanvas className="particle-bg" />
      <div className="auth-glow auth-glow-1" />
      <div className="auth-glow auth-glow-2" />
      <div className="auth-glow auth-glow-3" />

      <div className={`auth-card register-card ${shake ? 'shake' : ''}`}>
        <div className="auth-header">
          <div className="auth-logo">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="48" rx="12" fill="url(#logo-gradient2)" />
              <path d="M24 14v20M14 24h20" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="24" cy="24" r="12" stroke="white" strokeWidth="1.5" opacity="0.4" />
              <defs>
                <linearGradient id="logo-gradient2" x1="0" y1="0" x2="48" y2="48">
                  <stop stopColor="#8b5cf6" />
                  <stop offset="1" stopColor="#6366f1" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="auth-title">创建账户</h1>
          <p className="auth-subtitle">Join SSO Platform</p>
        </div>

        {error && (
          <div className="auth-error">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM8.75 4.5v4a.75.75 0 01-1.5 0v-4a.75.75 0 011.5 0z"/>
            </svg>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="auth-success">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.22 5.28l-3.5 3.5a.75.75 0 01-1.06 0l-1.88-1.88a.75.75 0 111.06-1.06l1.35 1.35 2.97-2.97a.75.75 0 111.06 1.06z"/>
            </svg>
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </label>
            <input
              type="text"
              placeholder="用户名（3-50字符）"
              value={form.username}
              onChange={(e) => updateField('username', e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 7L2 7" />
              </svg>
            </label>
            <input
              type="email"
              placeholder="邮箱地址"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
              </svg>
            </label>
            <input
              type="tel"
              placeholder="手机号（选填）"
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div>
            <div className="form-group">
              <label>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </label>
              <input
                type="password"
                placeholder="密码（至少6位）"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                disabled={isLoading}
              />
            </div>
            {form.password && (
              <>
                <div className="password-strength">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className={`strength-bar ${i <= strength ? strengthClasses[strength] : ''}`} />
                  ))}
                </div>
                <div className="strength-text">密码强度：{strengthLabels[strength]}</div>
              </>
            )}
          </div>

          <div className="form-group">
            <label>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </label>
            <input
              type="password"
              placeholder="确认密码"
              value={form.confirmPassword}
              onChange={(e) => updateField('confirmPassword', e.target.value)}
              disabled={isLoading}
            />
          </div>

          <button type="submit" className={`auth-btn ${isLoading ? 'loading' : ''}`} disabled={isLoading}>
            {isLoading ? (
              <span className="spinner" />
            ) : (
              <>
                <span>注 册</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <span>已有账户？</span>
          <button onClick={onSwitchToLogin} className="switch-btn">返回登录</button>
        </div>
      </div>
    </div>
  );
}
