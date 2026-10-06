"use client";
import { createContext, useContext, useMemo } from "react";
import { customerText, defaultCustomerText, type CustomerText } from "@/content/customer-text";

const CustomerTextContext = createContext<CustomerText>(defaultCustomerText);
export function CustomerTextProvider({ copy, children }: { copy: CustomerText; children: React.ReactNode }) {
  return <CustomerTextContext.Provider value={copy}>{children}</CustomerTextContext.Provider>;
}
export function useCustomerText(group: string) {
  const copy = useContext(CustomerTextContext);
  return useMemo(() => customerText(copy, group), [copy, group]);
}
