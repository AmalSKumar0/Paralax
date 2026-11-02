import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService, AuthSession } from '../services/cognitoAuth';

interface AuthContextType {
  session: AuthSession | null;
  isAuthenticated: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(() => authService.getSession());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const current = authService.getSession();
    if (current) {
      setSession(current);
    }
    setIsLoading(false);

    // Periodic token refresh check every 10 minutes
    const interval = setInterval(async () => {
      if (session) {
        const refreshed = await authService.refreshToken();
        if (refreshed) {
          setSession(refreshed);
        }
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const login = async (email: string, pass: string) => {
    const newSession = await authService.login(email, pass);
    setSession(newSession);
  };

  const logout = () => {
    authService.logout();
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        isAuthenticated: !!session,
        login,
        logout,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
