/**
 * API 客户端 - 基于 axios 封装所有后端请求
 * 统一走 duyuxiang.cn 域名，Express 后端已合并到 Python FastAPI
 * 请求拦截器：统一附加 Authorization Token
 * 响应拦截器：统一处理错误，401 时自动刷新 Token，刷新失败则强制登出回到登录页
 */
import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

const BASE_URL = 'https://duyuxiang.cn/api';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
}

/** 无需附加 Token 的接口 */
const AUTH_FREE_PATHS = ['/auth/login', '/auth/register'];

/** 业务错误（携带 HTTP 状态码与服务端 message） */
class ApiError extends Error {
  status?: number;
  code?: string;
  constructor(status: number | undefined, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private isRefreshing = false;
  private refreshSubscribers: { resolve: (token: string) => void; reject: (err: Error) => void }[] = [];
  private http: AxiosInstance;

  constructor() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');

    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: 300000,
    });
    this.http.interceptors.request.use(this.onRequest);
    this.http.interceptors.response.use((resp) => resp, this.onResponseError);
  }

  // ===== Token 管理 =====

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

  // ===== 拦截器 =====

  /** 请求拦截：统一附加 Token */
  private onRequest = (config: InternalAxiosRequestConfig) => {
    const url = config.url || '';
    const needAuth = this.accessToken && !AUTH_FREE_PATHS.some((p) => url.includes(p));
    if (needAuth) {
      config.headers.set('Authorization', `Bearer ${this.accessToken}`);
    }
    return config;
  };

  /** 响应拦截：统一错误处理，401 尝试刷新 Token，失败则强制登出 */
  private onResponseError = async (error: AxiosError) => {
    const status = error.response?.status;
    const config = error.config as RetriableConfig | undefined;
    const body = await this.parseErrorBody(error);

    if (status === 401 && config && !config._retried && !this.isAuthRequest(config.url)) {
      if (body?.code === 'TOKEN_EXPIRED' && this.refreshToken) {
        try {
          const newToken = await this.refreshAccessToken();
          config.headers.set('Authorization', `Bearer ${newToken}`);
          config._retried = true;
          return this.http.request(config);
        } catch {
          // 刷新失败，走下方强制登出
        }
      }
      this.forceLogout();
    }

    const message = body?.message || error.message || '网络连接失败，请检查服务是否启动';
    return Promise.reject(new ApiError(status, message, body?.code));
  };

  // ===== 内部工具 =====

  /** 解析错误响应体（兼容 blob 响应） */
  private async parseErrorBody(error: AxiosError): Promise<ApiResponse | undefined> {
    let body = error.response?.data as any;
    if (body instanceof Blob) {
      try {
        body = JSON.parse(await body.text());
      } catch {
        return undefined;
      }
    }
    return body;
  }

  private isAuthRequest(url = '') {
    return url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh');
  }

  /** 刷新 Token，并发请求排队等待同一次刷新 */
  private refreshAccessToken(): Promise<string> {
    if (this.isRefreshing) {
      return new Promise((resolve, reject) => {
        this.refreshSubscribers.push({ resolve, reject });
      });
    }

    this.isRefreshing = true;
    return new Promise<string>((resolve, reject) => {
      axios
        .post<ApiResponse<{ accessToken: string; refreshToken: string }>>(`${BASE_URL}/auth/refresh`, {
          refreshToken: this.refreshToken,
        })
        .then((resp) => {
          const data = resp.data;
          if (data.success && data.data) {
            this.setTokens(data.data.accessToken, data.data.refreshToken);
            this.notifySubscribers(data.data.accessToken);
            resolve(data.data.accessToken);
          } else {
            throw new Error(data.message || '刷新 Token 失败');
          }
        })
        .catch((err) => {
          this.rejectSubscribers(err);
          reject(err);
        })
        .finally(() => {
          this.isRefreshing = false;
        });
    });
  }

  private notifySubscribers(token: string) {
    this.refreshSubscribers.forEach((s) => s.resolve(token));
    this.refreshSubscribers = [];
  }

  private rejectSubscribers(err: Error) {
    this.refreshSubscribers.forEach((s) => s.reject(err));
    this.refreshSubscribers = [];
  }

  /** 强制登出：清空本地凭证并通知 UI 回到登录页 */
  private forceLogout() {
    this.clearTokens();
    window.dispatchEvent(new Event('auth:logout'));
  }

  // ===== 核心请求方法 =====

  private async request<T>(config: { method: string; url: string; data?: any }): Promise<ApiResponse<T>> {
    try {
      const resp = await this.http.request<ApiResponse<T>>(config);
      return resp.data;
    } catch (err: any) {
      return { success: false, message: err.message || '网络连接失败，请检查服务是否启动', code: err.code };
    }
  }

  get<T>(endpoint: string) {
    return this.request<T>({ method: 'GET', url: endpoint });
  }

  post<T>(endpoint: string, body?: any) {
    return this.request<T>({ method: 'POST', url: endpoint, data: body });
  }

  put<T>(endpoint: string, body?: any) {
    return this.request<T>({ method: 'PUT', url: endpoint, data: body });
  }

  delete<T>(endpoint: string) {
    return this.request<T>({ method: 'DELETE', url: endpoint });
  }

  upload<T>(endpoint: string, formData: FormData) {
    return this.request<T>({ method: 'POST', url: endpoint, data: formData });
  }

  /**
   * 二进制下载（如视频压缩/PDF转换结果），支持取消与下载进度
   */
  async download(
    endpoint: string,
    formData: FormData,
    options: { signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void } = {},
  ): Promise<{ blob: Blob; getHeader: (name: string) => string | null }> {
    try {
      const resp = await this.http.request({
        method: 'POST',
        url: endpoint,
        data: formData,
        responseType: 'blob',
        timeout: 0,
        signal: options.signal,
        onDownloadProgress: (e) => {
          options.onProgress?.(e.loaded, e.total ?? 0);
        },
      });
      return {
        blob: resp.data as Blob,
        getHeader: (name: string) => (resp.headers[name.toLowerCase()] as string) ?? null,
      };
    } catch (err: any) {
      if (axios.isCancel(err)) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      throw err;
    }
  }

  // ===== 处理端点（/v2 前缀） =====

  async wordToImage(file: File, dpi: number, format: string): Promise<ApiResponse<{ images: string[] }>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('dpi', String(dpi));
    formData.append('format', format);
    return this.request<{ images: string[] }>({ method: 'POST', url: '/v2/word-to-image', data: formData });
  }

  async wordToPdf(file: File): Promise<{ blob: Blob; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const resp = await this.http.post('/v2/word-to-pdf', formData, { responseType: 'blob', timeout: 0 });
    const cd = resp.headers['content-disposition'] || '';
    const match = cd.match(/filename\*?=(?:UTF-8'')?([^;\s]+)/i);
    const filename = match ? decodeURIComponent(match[1]) : file.name.replace(/\.docx$/i, '.pdf');
    return { blob: resp.data as Blob, filename };
  }

  async ocr(file: File, lang: string): Promise<ApiResponse<{ text: string; confidence: number }>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('lang', lang);
    return this.request<{ text: string; confidence: number }>({ method: 'POST', url: '/v2/ocr', data: formData });
  }

  async pdfToWord(file: File, mode: string): Promise<{ blob: Blob; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);
    const resp = await this.http.post('/v2/pdf-to-word', formData, { responseType: 'blob', timeout: 0 });
    const cd = resp.headers['content-disposition'] || '';
    const match = cd.match(/filename\*?=(?:UTF-8'')?([^;\s]+)/i);
    const filename = match ? decodeURIComponent(match[1]) : file.name.replace(/\.pdf$/i, '.docx');
    return { blob: resp.data as Blob, filename };
  }
}

export const api = new ApiClient();
export type { ApiResponse };
