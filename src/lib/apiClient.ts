const API_BASE = import.meta.env.VITE_API_URL || '';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

class ApiClient {
  private tokens: TokenPair | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  constructor() {
    const stored = localStorage.getItem('auth_tokens');
    if (stored) {
      try {
        this.tokens = JSON.parse(stored);
      } catch {
        localStorage.removeItem('auth_tokens');
      }
    }
  }

  setTokens(tokens: TokenPair | null): void {
    this.tokens = tokens;
    if (tokens) {
      localStorage.setItem('auth_tokens', JSON.stringify(tokens));
    } else {
      localStorage.removeItem('auth_tokens');
    }
  }

  getAccessToken(): string | null {
    return this.tokens?.accessToken ?? null;
  }

  isAuthenticated(): boolean {
    return !!this.tokens?.accessToken;
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.tokens?.refreshToken) return false;

    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.tokens.refreshToken }),
      });

      if (!res.ok) {
        this.setTokens(null);
        return false;
      }

      const data = await res.json();
      this.setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return true;
    } catch {
      this.setTokens(null);
      return false;
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: { retry?: boolean } = { retry: true }
  ): Promise<T> {
    const headers: Record<string, string> = {};

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.tokens?.accessToken) {
      headers['Authorization'] = `Bearer ${this.tokens.accessToken}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // Handle 401 - try refresh
    if (res.status === 401 && options.retry && this.tokens?.refreshToken) {
      if (!this.refreshPromise) {
        this.refreshPromise = this.refreshAccessToken().finally(() => {
          this.refreshPromise = null;
        });
      }

      const refreshed = await this.refreshPromise;
      if (refreshed) {
        return this.request<T>(method, path, body, { retry: false });
      }

      // Refresh failed - trigger logout
      window.dispatchEvent(new CustomEvent('auth:logout'));
      throw new Error('Sessão expirada');
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
      const err = new Error(error.error || error.message || `HTTP ${res.status}`);
      (err as any).status = res.status;
      (err as any).details = error.details;
      throw err;
    }

    return res.json();
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async delete<T = { success: boolean }>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  async upload(path: string, file: File): Promise<{ url: string; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    if (this.tokens?.accessToken) {
      headers['Authorization'] = `Bearer ${this.tokens.accessToken}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Erro no upload' }));
      throw new Error(error.error || 'Erro no upload');
    }

    return res.json();
  }
}

export const api = new ApiClient();
