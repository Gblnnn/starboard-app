import Back from "@/components/back";
import { ArrowLeft, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AccessDenied({
  title = "Access Restricted",
  message = "You do not have the required role or assignment to access this page.",
}: {
  title?: string;
  message?: string;
}) {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", background: "var(--background, #f8fafc)" }}>
      <Back fixed blurBG title={title} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
        <div style={{
          width: "3.75rem",
          height: "3.75rem",
          borderRadius: "1.25rem",
          background: "rgba(220, 38, 38, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "1.25rem",
          color: "#dc2626",
          boxShadow: "0 4px 12px rgba(220, 38, 38, 0.08)",
        }}>
          <Lock width="1.85rem" height="1.85rem" />
        </div>
        <h3 style={{ fontWeight: 700, fontSize: "1.15rem", marginBottom: "0.5rem" }}>{title}</h3>
        <p style={{ fontSize: "0.85rem", color: "#64748b", maxWidth: 360, marginBottom: "1.75rem", lineHeight: 1.5 }}>
          {message}
        </p>
        <button
          onClick={() => navigate("/petty-cash")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.7rem 1.35rem",
            borderRadius: "0.65rem",
            background: "#1e3a5f",
            color: "white",
            border: "none",
            fontWeight: 600,
            fontSize: "0.85rem",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(30, 58, 95, 0.2)",
          }}
        >
          <ArrowLeft width="1rem" height="1rem" /> Return to Petty Cash
        </button>
      </div>
    </div>
  );
}
