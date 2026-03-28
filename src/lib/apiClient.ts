const API_BASE = import.meta.env.VITE_API_URL || '';

class ApiClient {
  private clerkToken: string | null = null;

  /**
   * Set the Clerk session token (called by AuthContext on auth state changes).
   */
  setClerkToken(token: string | null): void {
    this.clerkToken = token;
  }

  getAccessToken(): string | null {
    return this.clerkToken;
  }

  isAuthenticated(): boolean {
    return !!this.clerkToken;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {};

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.clerkToken) {
      headers['Authorization'] = `Bearer ${this.clerkToken}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      // Clerk handles token refresh — if we get 401, session is truly expired
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
    if (this.clerkToken) {
      headers['Authorization'] = `Bearer ${this.clerkToken}`;
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
