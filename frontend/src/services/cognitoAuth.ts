import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

const COGNITO_REGION = import.meta.env.VITE_COGNITO_REGION || 'us-east-1';
const COGNITO_USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID || '';
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '';
const MOCK_MODE = import.meta.env.VITE_MOCK_MODE !== 'false';

export interface AuthSession {
  email: string;
  token: string;
  refreshToken?: string;
  expiresAt: number;
  isMock?: boolean;
}

const STORAGE_KEY = 'paralax_auth_session';

class AuthService {
  private userPool: CognitoUserPool | null = null;

  constructor() {
    if (COGNITO_USER_POOL_ID && COGNITO_CLIENT_ID && !COGNITO_USER_POOL_ID.includes('example')) {
      this.userPool = new CognitoUserPool({
        UserPoolId: COGNITO_USER_POOL_ID,
        ClientId: COGNITO_CLIENT_ID,
      });
    }
  }

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
    // If real Cognito pool is configured and not in mock fallback mode
    if (this.userPool && !MOCK_MODE) {
      return new Promise((resolve, reject) => {
        const user = new CognitoUser({
          Username: email,
          Pool: this.userPool!,
        });

        const authDetails = new AuthenticationDetails({
          Username: email,
          Password: password,
        });

        user.authenticateUser(authDetails, {
          onSuccess: (cognitoSession: CognitoUserSession) => {
            const token = cognitoSession.getIdToken().getJwtToken();
            const refreshToken = cognitoSession.getRefreshToken().getToken();
            const exp = cognitoSession.getIdToken().getExpiration() * 1000;

            const session: AuthSession = {
              email,
              token,
              refreshToken,
              expiresAt: exp,
              isMock: false,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
            resolve(session);
          },
          onFailure: (err) => {
            reject(new Error(err.message || 'Cognito authentication failed'));
          },
        });
      });
    }

    // Mock Mode / Demo Authentication:
    // Any valid email and password (e.g. admin@paralax.io / password)
    if (!email || !password) {
      throw new Error('Please provide both email and password.');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    // Simulate network delay
    await new Promise((res) => setTimeout(res, 400));

    // Mock JWT token with standard payload
    const mockToken = `mock-jwt-${btoa(email)}-${Date.now()}`;
    const session: AuthSession = {
      email,
      token: mockToken,
      refreshToken: `mock-refresh-${Date.now()}`,
      expiresAt: Date.now() + 3600 * 1000 * 8, // 8 hours
      isMock: true,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return session;
  }

  public async refreshToken(): Promise<AuthSession | null> {
    const current = this.getSession();
    if (!current) return null;

    if (current.isMock) {
      current.expiresAt = Date.now() + 3600 * 1000 * 8;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      return current;
    }

    // Real Cognito token refresh
    if (this.userPool && current.refreshToken) {
      const user = this.userPool.getCurrentUser();
      if (user) {
        return new Promise((resolve) => {
          user.getSession((err: Error | null, session: CognitoUserSession | null) => {
            if (err || !session) {
              this.logout();
              resolve(null);
            } else {
              const refreshed: AuthSession = {
                email: current.email,
                token: session.getIdToken().getJwtToken(),
                refreshToken: session.getRefreshToken().getToken(),
                expiresAt: session.getIdToken().getExpiration() * 1000,
                isMock: false,
              };
              localStorage.setItem(STORAGE_KEY, JSON.stringify(refreshed));
              resolve(refreshed);
            }
          });
        });
      }
    }

    return current;
  }

  public logout(): void {
    if (this.userPool) {
      const user = this.userPool.getCurrentUser();
      if (user) user.signOut();
    }
    localStorage.removeItem(STORAGE_KEY);
  }
}

export const authService = new AuthService();
