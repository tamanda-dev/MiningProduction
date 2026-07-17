import { useContext } from "react";
import { SessionContext } from "@/src/auth/SessionContext";

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
