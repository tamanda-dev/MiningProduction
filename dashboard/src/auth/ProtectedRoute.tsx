import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { Role } from "@/types";
import { useAuth } from "./useAuth";

export function ProtectedRoute({ requireRole }: { requireRole?: Role }) {
  const { isAuthenticated, isLoading, hasRole } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireRole && !hasRole(requireRole)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
