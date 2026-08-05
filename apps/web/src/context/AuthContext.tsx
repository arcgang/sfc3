import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { setToken, clearToken } from "../api.js";

const TOKEN_KEY = "wh_token";

interface AuthContextValue {
  isAuthenticated: boolean;
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(readToken);

  const login = useCallback((newToken: string) => {
    setToken(newToken);
    setTokenState(newToken);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: token !== null,
      token,
      login,
      logout,
    }),
    [token, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
