import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Role } from "../api/client";

export function RequireAuth() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequireRole({ role }: { role: Role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  // Client-side check is for navigation/UX only - the backend independently
  // enforces this on every request, per the spec's "frontend restrictions
  // shall not be considered sufficient security measures."
  if (user.role !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}
