import type { ReactNode } from "react";
import { useAuth } from "@/auth/useAuth";
import type { Role } from "@/types";

export function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const { hasRole } = useAuth();
  if (!hasRole(role)) return null;
  return <>{children}</>;
}
