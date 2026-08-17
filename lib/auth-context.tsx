"use client";

import { createContext, useContext } from "react";
import type { Tenant } from "@/types/domain";

interface AuthState {
  accessToken: string;
  userId: string;
  userEmail: string;
  tenant: Tenant | null;
  refreshTenant: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({
  value,
  children,
}: {
  value: AuthState;
  children: React.ReactNode;
}) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
