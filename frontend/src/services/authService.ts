export interface AuthSession {
  email: string;
  role?: string;
  token?: string;
  expiresAt: number;
  isMock?: boolean;
}

const STORAGE_KEY = 'paralax_auth_session';
const IS_MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true';

class AuthService {
  public getSession(): AuthSession | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const session = JSON.parse(stored) as AuthSession;
      if (Date.now() > session.expiresAt) {
        this.logout();
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  public async login(email: string, password: string): Promise<AuthSession> {
    if (!email || !password) {
      throw new Error('Please enter both email and password.');
    }

    if (IS_MOCK_MODE) {
      await new Promise((res) => setTimeout(res, 200));
      const session: AuthSession = {
        email,
        role: 'admin',
        token: `mock-jwt-${btoa(email)}-${Date.now()}`,
        expiresAt: Date.now() + 12 * 3600 * 1000,
        isMock: true,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      return session;
    }

    // Call real Node.js /api/v1/auth/login
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const loginUrl = `${cleanBase}/auth/login`;

    const res = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      let msg = 'Authentication failed';
      try {
        const errJson = await res.json();
        msg = errJson.error?.message || msg;
      } catch {}
      throw new Error(msg);
    }

    const data = await res.json();
    const session: AuthSession = {
      email: data.user?.email || email,
      role: data.user?.role || 'admin',
      token: data.token,
      expiresAt: Date.now() + 12 * 3600 * 1000, // 12 hours
      isMock: false,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return session;
  }

  public async checkSession(): Promise<AuthSession | null> {
    const current = this.getSession();
    if (!current) return null;

    if (current.isMock || IS_MOCK_MODE) {
      return current;
    }

    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
      const cleanBase = baseUrl.replace(/\/+$/, '');
      const meUrl = `${cleanBase}/auth/me`;

      const headers: Record<string, string> = {
        'X-Requested-With': 'XMLHttpRequest',
      };
      if (current.token) {
        headers['Authorization'] = `Bearer ${current.token}`;
      }

      const res = await fetch(meUrl, {
        headers,
        credentials: 'include',
      });

      if (!res.ok) {
        this.logout();
        return null;
      }

      const data = await res.json();
      current.email = data.user?.email || current.email;
      current.role = data.user?.role || current.role;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      return current;
    } catch {
      return current;
    }
  }

  public async refreshToken(): Promise<AuthSession | null> {
    return this.checkSession();
  }

  public async logout(): Promise<void> {
    try {
      if (!IS_MOCK_MODE) {
        const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
        const cleanBase = baseUrl.replace(/\/+$/, '');
        await fetch(`${cleanBase}/auth/logout`, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'include',
        });
      }
    } catch {}

    localStorage.removeItem(STORAGE_KEY);
  }
}

export const authService = new AuthService();
