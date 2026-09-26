"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokenStore, type User } from "./api";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore the session from a stored token (localStorage is only available in the browser).
    Promise.resolve(tokenStore.get())
      .then((token) => (token ? api.me() : null))
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    window.addEventListener("et:unauthorized", logout);
    return () => window.removeEventListener("et:unauthorized", logout);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    tokenStore.set(res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export const isManagerish = (u: User | null) => u?.role === "ADMIN" || u?.role === "MANAGER";
