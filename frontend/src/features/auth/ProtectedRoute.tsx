import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";
import type { ReactNode } from "react";

export function ProtectedRoute({ children }: { readonly children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: { pathname: location.pathname } }}
      />
    );
  }

  return <>{children}</>;
}
