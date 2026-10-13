import { useAuth } from "@/components/AuthProvider";
import { Navigate } from "react-router-dom";

export default function AdminOnlyRoute({ children }: { children: React.ReactNode }) {
  const { userData } = useAuth();

  return userData?.role === "admin" ? <>{children}</> : <Navigate to="/index" replace />;
}
