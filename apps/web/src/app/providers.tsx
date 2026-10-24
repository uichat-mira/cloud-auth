import type { ReactNode } from "react";
import { SessionPlaceholderProvider } from "./session-placeholder";

export function AppProviders({ children }: { children: ReactNode }) {
  return <SessionPlaceholderProvider>{children}</SessionPlaceholderProvider>;
}
