"use client";

import { createContext, useContext } from "react";
import type { Customer } from "@/lib/api-client";

interface CustomerAuthState {
  accessToken: string;
  customer: Customer;
}

const CustomerAuthContext = createContext<CustomerAuthState | null>(null);

export function CustomerAuthProvider({
  value,
  children,
}: {
  value: CustomerAuthState;
  children: React.ReactNode;
}) {
  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth(): CustomerAuthState {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error("useCustomerAuth must be used within a CustomerAuthProvider");
  return ctx;
}
