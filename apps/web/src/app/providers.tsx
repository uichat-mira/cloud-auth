import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth/context";
import { HostGrantsProvider } from "@/lib/grants/context";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <HostGrantsProvider>{children}</HostGrantsProvider>
    </AuthProvider>
  );
}
