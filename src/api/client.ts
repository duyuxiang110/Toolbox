/**
 * API 客户端 - 封装所有后端请求
 * 自动处理 Token 刷新和错误
 */
const BASE_URL = 'http://127.0.0.1:3900/api';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private isRefreshing = false;
  private refreshSubscribers: ((token: string) => void)[] = [];

  constructor() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
  }

  // Token 管理
  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('sessionId');
    localStorage.removeItem('user');
  }

  getAccessToken() {
    return this.accessToken;
  }

  // 订阅 Token 刷新
  private subscribeTokenRefresh(cb: (token: string) => void) {
    this.refreshSubscribers.push(cb);
  }

  private onTokenRefreshed(token: string) {
    this.refreshSubscribers.forEach(cb => cb(token));
    this.refreshSubscribers = [];
  }

  // 核心请求方法
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/register')) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
      const data = await response.json();

      // Token 过期，尝试刷新
      if (response.status === 401 && data.code === 'TOKEN_EXPIRED' && this.refreshToken) {
        if (!this.isRefreshing) {
          this.isRefreshing = true;
          try {
            const refreshResult = await this.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
              refreshToken: this.refreshToken,
            });
            if (refreshResult.success && refreshResult.data) {
              this.setTokens(refreshResult.data.accessToken, refreshResult.data.refreshToken);
              this.isRefreshing = false;
              this.onTokenRefreshed(refreshResult.data.accessToken);
              // 重试原请求
              headers['Authorization'] = `Bearer ${refreshResult.data.accessToken}`;
              const retryResponse = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
              return await retryResponse.json();
            }
          } catch {
            this.isRefreshing = false;
            this.clearTokens();
            window.dispatchEvent(new Event('auth:logout'));
          }
        } else {
          // 等待刷新完成
          return new Promise((resolve) => {
            this.subscribeTokenRefresh((token) => {
              headers['Authorization'] = `Bearer ${token}`;
              fetch(`${BASE_URL}${endpoint}`, { ...options, headers })
                .then(r => r.json())
                .then(resolve);
            });
          });
        }
      }

      return data;
    } catch (error: any) {
      return { success: false, message: error.message || '网络连接失败，请检查服务是否启动' };
    }
  }

  get<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  post<T>(endpoint: string, body?: any) {
    return this.request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) });
  }

  put<T>(endpoint: string, body?: any) {
    return this.request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) });
  }

  delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
export type { ApiResponse };
