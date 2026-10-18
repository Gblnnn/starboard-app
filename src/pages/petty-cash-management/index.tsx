import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import {
  AlertCircle,
  BadgeDollarSign,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { type PettyCashBalance, type PettyCashUser, formatOMR, statusColor, statusLabel } from "./types";

const CARD_STYLE: React.CSSProperties = {
  background: "var(--card, rgba(255,255,255,0.04))",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "1rem",
  padding: "1.25rem",
};

const PILL_STYLE = (color: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
  padding: "0.2rem 0.6rem",
  borderRadius: "999px",
  fontSize: "0.7rem",
  fontWeight: 600,
  background: color + "20",
  color,
});

export default function PettyCashIndex() {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const empId = userData?.emp_id ? String(userData.emp_id) : null;
  const isAdmin = userData?.role === "admin";
  const isFinance = isAdmin || userData?.role === "management";

  const [assignments, setAssignments] = useState<(PettyCashUser & { balance: PettyCashBalance | null })[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [mySubmissions, setMySubmissions] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (silent = false) => {
    if (!empId && !isAdmin) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      // Load active assignments for this custodian (or all if admin)
      let assignQuery = supabase
        .from("pettycash_user")
        .select("*")
        .eq("active", true);
      if (!isAdmin && empId) assignQuery = assignQuery.eq("emp_id", empId);

      const { data: assignData, error: assignErr } = await assignQuery;
      if (assignErr) throw assignErr;

      // Load balance for each assignment
      const assignmentsWithBalance = await Promise.all(
        (assignData || []).map(async (a) => {
          const { data: bal } = await supabase
            .from("v_petty_cash_balance")
            .select("*")
            .eq("project_code", a.project_code)
            .eq("emp_id", a.emp_id)
            .eq("active", true)
            .maybeSingle();
          return { ...a, balance: bal ?? null };
        })
      );
      setAssignments(assignmentsWithBalance);

      // Load my recent requests
      if (empId) {
        const { data: reqData } = await supabase
          .from("petty_cash_request")
          .select("id,request_number,request_date,project_code,request_amount,approved_amount,status")
          .eq("emp_id", empId)
          .not("status", "in", "(cancelled)")
          .order("created_at", { ascending: false })
          .limit(5);
        setMyRequests(reqData || []);

        const { data: subData } = await supabase
          .from("petty_cash_submission")
          .select("id,submission_number,submission_date,project_code,status")
          .eq("emp_id", empId)
          .not("status", "in", "(cancelled)")
          .order("created_at", { ascending: false })
          .limit(5);
        setMySubmissions(subData || []);
      }

      // Pending approvals count
      if (isFinance || isAdmin) {
        const { count: reqPending } = await supabase
          .from("petty_cash_request")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_approval");
        const { count: subPending } = await supabase
          .from("petty_cash_submission")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending_petty_cash_approval", "pending_finance_approval"]);
        setPendingApprovals((reqPending || 0) + (subPending || 0));
      } else if (empId) {
        // approvals where this emp is an approver
        const { count: approvableReq } = await supabase
          .from("petty_cash_request")
          .select("id", { count: "exact", head: true })
          .eq("approver_id", empId)
          .eq("status", "pending_approval");
        const { count: approvableSub } = await supabase
          .from("petty_cash_submission")
          .select("id", { count: "exact", head: true })
          .eq("petty_cash_approver_id", empId)
          .eq("status", "pending_petty_cash_approval");
        setPendingApprovals((approvableReq || 0) + (approvableSub || 0));
      }
    } catch (err: any) {
      if (!silent) toast.error(err?.message || "Failed to load petty cash data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [empId]);

  const totalAvailable = assignments.reduce(
    (s, a) => s + (a.balance?.available_balance ?? 0),
    0
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: "100svh", paddingBottom: "2rem" }}>
      <Back fixed blurBG title="Petty Cash" icon={<Wallet width="1.25rem" />}
        extra={
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            style={{ padding: "0.5rem", borderRadius: "0.5rem", border: "none", background: "transparent", cursor: "pointer" }}
          >
            <RefreshCw width="1.125rem" className={refreshing ? "animate-spin" : ""} />
          </button>
        }
      />

      <div style={{ paddingTop: "4.5rem", padding: "4.5rem 1rem 2rem", maxWidth: 640, margin: "0 auto" }}>

        {/* Total Balance Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: "linear-gradient(135deg, #1e3a5f 0%, #0f2540 100%)",
            borderRadius: "1.25rem",
            padding: "1.5rem",
            marginBottom: "1.25rem",
            color: "white",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
          <div style={{ position: "absolute", bottom: -30, right: 40, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
          <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Total Available Balance
          </p>
          <h2 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>
            {loading ? "..." : formatOMR(totalAvailable)}
          </h2>
          <p style={{ fontSize: "0.8rem", opacity: 0.6 }}>
            {assignments.length} active project{assignments.length !== 1 ? "s" : ""}
          </p>

          {/* Quick action buttons */}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem", flexWrap: "wrap" }}>
            {empId && (
              <>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate("/petty-cash/new-request")}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.4rem",
                    padding: "0.6rem 1rem", borderRadius: "0.6rem",
                    background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)",
                    color: "white", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                  }}
                >
                  <Plus width="0.9rem" /> Request Cash
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate("/petty-cash/submit-bills")}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.4rem",
                    padding: "0.6rem 1rem", borderRadius: "0.6rem",
                    background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)",
                    color: "white", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                  }}
                >
                  <FileText width="0.9rem" /> Submit Bills
                </motion.button>
              </>
            )}
          </div>
        </motion.div>

        {/* Project Balances */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem 0" }}>
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <>
            {assignments.length === 0 && (
              <div style={{ ...CARD_STYLE, textAlign: "center", padding: "2rem", color: "#64748b" }}>
                <Wallet width="2rem" style={{ margin: "0 auto 0.75rem", opacity: 0.4 }} />
                <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>No Active Assignments</p>
                <p style={{ fontSize: "0.8rem" }}>
                  {isAdmin ? "Create a petty cash assignment from the Assignments screen." : "You have no active petty cash assignments."}
                </p>
                {isAdmin && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => navigate("/petty-cash/assignments")}
                    style={{
                      marginTop: "1rem", padding: "0.6rem 1.25rem",
                      borderRadius: "0.6rem", background: "#1e3a5f",
                      color: "white", border: "none", fontSize: "0.85rem",
                      fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Manage Assignments
                  </motion.button>
                )}
              </div>
            )}

            {assignments.map((a) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ ...CARD_STYLE, marginBottom: "0.75rem" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: "0.95rem" }}>{a.project_code}</p>
                    <p style={{ fontSize: "0.75rem", color: "#64748b" }}>Custodian: {a.emp_id}</p>
                  </div>
                  <span style={PILL_STYLE("#16a34a")}>
                    <CheckCircle2 width="0.65rem" /> Active
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <p style={{ fontSize: "0.7rem", color: "#64748b", marginBottom: "0.15rem" }}>Available Balance</p>
                    <p style={{ fontWeight: 700, fontSize: "1.1rem", color: (a.balance?.available_balance ?? 0) < 0 ? "#dc2626" : "inherit" }}>
                      {formatOMR(a.balance?.available_balance)}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: "0.7rem", color: "#64748b", marginBottom: "0.15rem" }}>Pending Claims</p>
                    <p style={{ fontWeight: 600, fontSize: "0.95rem", color: "#d97706" }}>
                      {formatOMR(a.balance?.pending_expense_claims)}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: "0.7rem", color: "#64748b", marginBottom: "0.15rem" }}>Outstanding Reimbursement</p>
                    <p style={{ fontWeight: 600, fontSize: "0.95rem", color: (a.balance?.outstanding_reimbursement ?? 0) > 0 ? "#dc2626" : "inherit" }}>
                      {formatOMR(a.balance?.outstanding_reimbursement)}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: "0.7rem", color: "#64748b", marginBottom: "0.15rem" }}>Funding Awaiting Payment</p>
                    <p style={{ fontWeight: 600, fontSize: "0.95rem", color: "#7c3aed" }}>
                      {formatOMR(a.balance?.approved_funding_awaiting_payment)}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </>
        )}

        {/* Quick Nav Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "0.5rem", marginBottom: "1.5rem" }}>
          {[
            { label: "Approvals", icon: <ClipboardList width="1.25rem" />, path: "/petty-cash/approvals", badge: pendingApprovals > 0 ? pendingApprovals : 0, color: "#d97706" },
            { label: "Finance", icon: <CreditCard width="1.25rem" />, path: "/petty-cash/finance", badge: 0, color: "#7c3aed", show: isFinance },
            { label: "Dashboard", icon: <BadgeDollarSign width="1.25rem" />, path: "/petty-cash/dashboard", badge: 0, color: "#1e3a5f", show: isFinance },
            { label: "Assignments", icon: <AlertCircle width="1.25rem" />, path: "/petty-cash/assignments", badge: 0, color: "#16a34a", show: isAdmin },
            { label: "Categories", icon: <FileText width="1.25rem" />, path: "/petty-cash/categories", badge: 0, color: "#0891b2", show: isAdmin },
          ]
            .filter(item => item.show !== false)
            .map((item) => (
              <motion.button
                key={item.path}
                whileTap={{ scale: 0.96 }}
                onClick={() => navigate(item.path)}
                style={{
                  ...CARD_STYLE,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  border: `1px solid ${item.color}25`,
                  position: "relative",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{ color: item.color }}>{item.icon}</span>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{item.label}</span>
                </div>
                {item.badge > 0 && (
                  <span style={{
                    background: item.color, color: "white",
                    borderRadius: "999px", fontSize: "0.65rem",
                    fontWeight: 700, padding: "0.15rem 0.45rem", minWidth: "1.25rem", textAlign: "center",
                  }}>
                    {item.badge}
                  </span>
                )}
              </motion.button>
            ))}
        </div>

        {/* My Recent Requests */}
        {myRequests.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 style={{ fontWeight: 700, fontSize: "0.95rem" }}>My Requests</h3>
              <button
                onClick={() => navigate("/petty-cash/new-request")}
                style={{ fontSize: "0.75rem", color: "#1e3a5f", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
              >
                + New
              </button>
            </div>
            {myRequests.map((req) => (
              <motion.div key={req.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ ...CARD_STYLE, marginBottom: "0.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: "0.85rem" }}>{req.request_number}</p>
                  <p style={{ fontSize: "0.72rem", color: "#64748b" }}>{req.project_code} · {req.request_date}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontWeight: 700, fontSize: "0.9rem" }}>{formatOMR(req.request_amount)}</p>
                  <span style={PILL_STYLE(statusColor[req.status] || "#64748b")}>{statusLabel[req.status] || req.status}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* My Recent Submissions */}
        {mySubmissions.length > 0 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 style={{ fontWeight: 700, fontSize: "0.95rem" }}>My Submissions</h3>
              <button
                onClick={() => navigate("/petty-cash/submit-bills")}
                style={{ fontSize: "0.75rem", color: "#1e3a5f", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
              >
                + New
              </button>
            </div>
            {mySubmissions.map((sub) => (
              <motion.div key={sub.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ ...CARD_STYLE, marginBottom: "0.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: "0.85rem" }}>{sub.submission_number}</p>
                  <p style={{ fontSize: "0.72rem", color: "#64748b" }}>{sub.project_code} · {sub.submission_date}</p>
                </div>
                <span style={PILL_STYLE(statusColor[sub.status] || "#64748b")}>{statusLabel[sub.status] || sub.status}</span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
