/**
 * Dashboard 仪表盘 - 登录后的主界面
 * 包含：用户信息、统计概览、用户管理、登录日志
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import './Dashboard.css';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  lockedUsers: number;
  activeSessions: number;
  todayLogins: number;
}

interface LogEntry {
  id: number;
  username: string;
  user_username: string;
  ip_address: string;
  action: string;
  detail: string;
  created_at: string;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'logs' | 'profile'>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadStats();
    loadLogs();
    if (user?.role === 'admin') loadUsers();
  }, []);

  const loadStats = async () => {
    const res = await api.get<Stats>('/users/stats');
    if (res.success && res.data) setStats(res.data);
  };

  const loadLogs = async () => {
    const res = await api.get<{ logs: LogEntry[] }>('/users/logs?pageSize=20');
    if (res.success && res.data) setLogs(res.data.logs);
  };

  const loadUsers = async () => {
    const res = await api.get<{ users: any[] }>('/users?pageSize=50');
    if (res.success && res.data) setUsers(res.data.users);
  };

  const handleLogout = async () => {
    await logout();
  };

  const actionLabels: Record<string, { text: string; color: string }> = {
    login_success: { text: '登录成功', color: '#10b981' },
    login_failed: { text: '登录失败', color: '#ef4444' },
    logout: { text: '登出', color: '#6b7280' },
    token_refresh: { text: 'Token刷新', color: '#3b82f6' },
    password_change: { text: '密码修改', color: '#f59e0b' },
  };

  const roleLabels: Record<string, string> = { admin: '管理员', user: '普通用户', guest: '访客' };

  return (
    <div className="dashboard">
      {/* 侧边栏 */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <svg viewBox="0 0 48 48" fill="none" width="32" height="32">
            <rect width="48" height="48" rx="12" fill="url(#dash-logo)" />
            <path d="M24 12L34 18V30L24 36L14 30V18L24 12Z" stroke="white" strokeWidth="2" fill="none" />
            <circle cx="24" cy="24" r="4" fill="white" opacity="0.9" />
            <defs>
              <linearGradient id="dash-logo" x1="0" y1="0" x2="48" y2="48">
                <stop stopColor="#6366f1" /><stop offset="1" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>
          <span>SSO Center</span>
        </div>

        <nav className="sidebar-nav">
          <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            概览
          </button>
          {user?.role === 'admin' && (
            <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
              用户管理
            </button>
          )}
          <button className={activeTab === 'logs' ? 'active' : ''} onClick={() => setActiveTab('logs')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14,2 14,8 20,8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            登录日志
          </button>
          <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            个人中心
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-mini">
            <div className="user-avatar">{user?.username?.charAt(0).toUpperCase()}</div>
            <div className="user-info">
              <span className="user-name">{user?.username}</span>
              <span className="user-role">{roleLabels[user?.role || 'user']}</span>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16,17 21,12 16,7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            退出
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="main-content">
        <header className="content-header">
          <h2>{activeTab === 'overview' ? '系统概览' : activeTab === 'users' ? '用户管理' : activeTab === 'logs' ? '登录日志' : '个人中心'}</h2>
          <div className="header-time">{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</div>
        </header>

        {/* 概览 */}
        {activeTab === 'overview' && (
          <div className="overview-content">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(99, 102, 241, 0.1)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                </div>
                <div className="stat-value">{stats?.totalUsers ?? '-'}</div>
                <div className="stat-label">总用户数</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>
                </div>
                <div className="stat-value">{stats?.activeUsers ?? '-'}</div>
                <div className="stat-label">活跃用户</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                </div>
                <div className="stat-value">{stats?.lockedUsers ?? '-'}</div>
                <div className="stat-label">锁定账户</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
                </div>
                <div className="stat-value">{stats?.activeSessions ?? '-'}</div>
                <div className="stat-label">活跃会话</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10,17 15,12 10,7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                </div>
                <div className="stat-value">{stats?.todayLogins ?? '-'}</div>
                <div className="stat-label">今日登录</div>
              </div>
            </div>

            {/* 最近登录活动 */}
            <div className="recent-section">
              <h3>最近活动</h3>
              <div className="activity-list">
                {logs.slice(0, 8).map(log => (
                  <div key={log.id} className="activity-item">
                    <div className="activity-dot" style={{ background: actionLabels[log.action]?.color || '#6b7280' }} />
                    <div className="activity-info">
                      <span className="activity-user">{log.user_username || log.username}</span>
                      <span className="activity-action">{actionLabels[log.action]?.text || log.action}</span>
                    </div>
                    <span className="activity-time">{log.created_at}</span>
                  </div>
                ))}
                {logs.length === 0 && <div className="empty-state">暂无活动记录</div>}
              </div>
            </div>
          </div>
        )}

        {/* 用户管理 */}
        {activeTab === 'users' && user?.role === 'admin' && (
          <div className="users-content">
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th><th>用户名</th><th>邮箱</th><th>角色</th><th>状态</th><th>最后登录</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td className="td-username">
                        <div className="td-avatar">{u.username.charAt(0).toUpperCase()}</div>
                        {u.username}
                      </td>
                      <td>{u.email}</td>
                      <td><span className={`badge badge-${u.role}`}>{roleLabels[u.role]}</span></td>
                      <td><span className={`status-dot status-${u.status}`} />{u.status === 'active' ? '正常' : u.status === 'locked' ? '锁定' : '禁用'}</td>
                      <td>{u.last_login_at || '从未'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && <div className="empty-state">暂无用户数据</div>}
            </div>
          </div>
        )}

        {/* 登录日志 */}
        {activeTab === 'logs' && (
          <div className="logs-content">
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr><th>时间</th><th>用户</th><th>操作</th><th>IP 地址</th><th>详情</th></tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td>{log.created_at}</td>
                      <td>{log.user_username || log.username || '-'}</td>
                      <td><span className="action-badge" style={{ color: actionLabels[log.action]?.color }}>{actionLabels[log.action]?.text || log.action}</span></td>
                      <td>{log.ip_address || '-'}</td>
                      <td className="td-detail">{log.detail || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logs.length === 0 && <div className="empty-state">暂无日志记录</div>}
            </div>
          </div>
        )}

        {/* 个人中心 */}
        {activeTab === 'profile' && (
          <div className="profile-content">
            <div className="profile-card">
              <div className="profile-avatar-large">{user?.username?.charAt(0).toUpperCase()}</div>
              <h3>{user?.username}</h3>
              <span className={`badge badge-${user?.role}`}>{roleLabels[user?.role || 'user']}</span>
              <div className="profile-details">
                <div className="profile-row"><span className="label">邮箱</span><span>{user?.email}</span></div>
                <div className="profile-row"><span className="label">手机</span><span>{user?.phone || '未绑定'}</span></div>
                <div className="profile-row"><span className="label">上次登录</span><span>{user?.lastLoginAt || '-'}</span></div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
