/**
 * 认证上下文 - 管理全局登录状态
 * 密码传输前统一 MD5 加密，防止明文泄露
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { md5 } from 'js-md5';
import { api } from '../api/client';

/** 密码 MD5 加密（传输层保护，服务端另有 bcrypt 存储加密） */
export const encryptPassword = (password: string): string => md5(password);

export interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  avatar?: string;
  phone?: string;
  lastLoginAt?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (data: { username: string; email: string; password: string; phone?: string }) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化：检查本地存储的登录状态
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const token = api.getAccessToken();
    if (savedUser && token) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        api.clearTokens();
      }
    }
    setIsLoading(false);

    // 监听强制登出事件
    const handleLogout = () => {
      setUser(null);
    };
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<{
      user: User;
      accessToken: string;
      refreshToken: string;
      sessionId: string;
    }>('/auth/login', { username, password: encryptPassword(password) });

    if (res.success && res.data) {
      const { user: userData, accessToken, refreshToken, sessionId } = res.data;
      api.setTokens(accessToken, refreshToken);
      localStorage.setItem('sessionId', sessionId);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      return { success: true };
    }
    return { success: false, message: res.message };
  }, []);

  const register = useCallback(async (data: { username: string; email: string; password: string; phone?: string }) => {
    const res = await api.post('/auth/register', {
      ...data,
      password: encryptPassword(data.password),
    });
    return { success: res.success, message: res.message };
  }, []);

  const logout = useCallback(async () => {
    const sessionId = localStorage.getItem('sessionId');
    const refreshToken = localStorage.getItem('refreshToken');
    await api.post('/auth/logout', { sessionId, refreshToken });
    api.clearTokens();
    setUser(null);
  }, []);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      register,
      logout,
      updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
