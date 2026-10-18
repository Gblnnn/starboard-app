import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { Loader2, PlusCircle, Send, Save } from "lucide-react";
import moment from "moment";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatOMR } from "./types";
import { usePettyCashAccess } from "./usePettyCashAccess";
import AccessDenied from "./AccessDenied";

interface ProjectOption {
  project_code: string;
  emp_id: string;
  assignment_id: number;
  balance: number;
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "0.875rem 1rem",
  borderRadius: "0.75rem",
  border: "1px solid rgba(100,100,100,0.2)",
  fontSize: "1rem",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 600,
  marginBottom: "0.4rem",
  display: "block",
  opacity: 0.75,
};

export default function NewRequest() {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const empId = userData?.emp_id ? String(userData.emp_id) : null;
  const { loading: accessLoading, canRequestCash } = usePettyCashAccess();

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const [selectedProject, setSelectedProject] = useState("");
  const [requestDate, setRequestDate] = useState(moment().format("YYYY-MM-DD"));
  const [particulars, setParticulars] = useState("");
  const [requestAmount, setRequestAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!empId) return;
    const load = async () => {
      setLoadingProjects(true);
      try {
        const { data, error } = await supabase
          .from("pettycash_user")
          .select("id, project_code, emp_id")
          .eq("emp_id", empId)
          .eq("active", true);
        if (error) throw error;

        // Get balances
        const withBalance = await Promise.all(
          (data || []).map(async (a) => {
            const { data: bal } = await supabase
              .from("v_petty_cash_balance")
              .select("available_balance")
              .eq("project_code", a.project_code)
              .eq("emp_id", a.emp_id)
              .maybeSingle();
            return {
              project_code: a.project_code,
              emp_id: a.emp_id,
              assignment_id: a.id,
              balance: Number(bal?.available_balance ?? 0),
            };
          })
        );
        setProjects(withBalance);
        if (withBalance.length === 1) setSelectedProject(withBalance[0].project_code);
      } catch (err: any) {
        toast.error(err?.message || "Failed to load projects");
      } finally {
        setLoadingProjects(false);
      }
    };
    load();
  }, [empId]);

  const selectedProjectData = projects.find((p) => p.project_code === selectedProject);

  const handleSave = async (submitForApproval: boolean) => {
    if (!empId) { toast.error("Employee ID not found"); return; }
    if (!selectedProject) { toast.error("Select a project"); return; }
    if (!particulars.trim()) { toast.error("Enter the purpose of this request"); return; }
    const amount = parseFloat(requestAmount);
    if (!amount || amount <= 0) { toast.error("Enter a valid request amount"); return; }

    const fn = submitForApproval ? setSubmitting : setSaving;
    fn(true);
    try {
      const status = submitForApproval ? "pending_approval" : "draft";
      const { data, error } = await supabase
        .from("petty_cash_request")
        .insert({
          request_date: requestDate,
          project_code: selectedProject,
          emp_id: empId,
          particulars: particulars.trim(),
          request_amount: amount,
          status,
          created_by: empId,
        })
        .select("request_number")
        .single();
      if (error) throw error;
      toast.success(
        submitForApproval
          ? `Request ${data.request_number} submitted for approval`
          : `Draft ${data.request_number} saved`
      );
      navigate("/petty-cash");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save request");
    } finally {
      fn(false);
    }
  };

  if (!accessLoading && !canRequestCash) {
    return (
      <AccessDenied
        title="Request Restricted"
        message="Only designated project custodians and administrators can submit petty cash advance requests."
      />
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: "100svh", paddingBottom: "2rem" }}>
      <Back fixed blurBG title="New Cash Request" icon={<PlusCircle width="1.125rem" />} />

      <div style={{ paddingTop: "5rem", padding: "5rem 1rem 2rem", maxWidth: 560, margin: "0 auto" }}>

        {/* Project */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={LABEL_STYLE}>Project *</label>
          {loadingProjects ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#64748b", fontSize: "0.875rem" }}>
              <Loader2 className="animate-spin" width="1rem" /> Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <p style={{ color: "#dc2626", fontSize: "0.85rem" }}>You have no active petty cash assignments.</p>
          ) : (
            <select
              id="pc-req-project"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              style={INPUT_STYLE}
            >
              <option value="">— Select Project —</option>
              {projects.map((p) => (
                <option key={p.project_code} value={p.project_code}>
                  {p.project_code} (Balance: {formatOMR(p.balance)})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Custodian (read-only) */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={LABEL_STYLE}>Custodian (You)</label>
          <div style={{ ...INPUT_STYLE, background: "rgba(100,100,100,0.05)", color: "#64748b" }}>
            {empId || "—"}
            {userData?.name ? ` · ${userData.name}` : ""}
          </div>
        </div>

        {/* Request Date */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label htmlFor="pc-req-date" style={LABEL_STYLE}>Request Date *</label>
          <input
            id="pc-req-date"
            type="date"
            value={requestDate}
            onChange={(e) => setRequestDate(e.target.value)}
            max={moment().format("YYYY-MM-DD")}
            style={INPUT_STYLE}
          />
        </div>

        {/* Purpose */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label htmlFor="pc-req-particulars" style={LABEL_STYLE}>Purpose of Request *</label>
          <textarea
            id="pc-req-particulars"
            value={particulars}
            onChange={(e) => setParticulars(e.target.value)}
            placeholder="Describe what the cash will be used for..."
            rows={3}
            style={{ ...INPUT_STYLE, resize: "vertical", minHeight: "5rem" }}
          />
        </div>

        {/* Amount */}
        <div style={{ marginBottom: "1.75rem" }}>
          <label htmlFor="pc-req-amount" style={LABEL_STYLE}>Requested Amount (OMR) *</label>
          <div style={{ position: "relative" }}>
            <input
              id="pc-req-amount"
              type="number"
              step="0.001"
              min="0.001"
              value={requestAmount}
              onChange={(e) => setRequestAmount(e.target.value)}
              placeholder="0.000"
              style={{ ...INPUT_STYLE, paddingRight: "3.5rem" }}
            />
            <span style={{
              position: "absolute", right: "1rem", top: "50%",
              transform: "translateY(-50%)", fontSize: "0.85rem",
              fontWeight: 600, opacity: 0.6,
            }}>OMR</span>
          </div>
          {selectedProjectData && (
            <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.4rem" }}>
              Current balance: {formatOMR(selectedProjectData.balance)}
            </p>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={saving || submitting}
            onClick={() => handleSave(false)}
            style={{
              flex: 1, padding: "0.875rem", borderRadius: "0.75rem",
              border: "1px solid rgba(100,100,100,0.3)",
              background: "transparent", fontSize: "0.9rem",
              fontWeight: 600, cursor: saving || submitting ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
            }}
          >
            {saving ? <Loader2 className="animate-spin" width="1rem" /> : <Save width="1rem" />}
            Save Draft
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={saving || submitting}
            onClick={() => handleSave(true)}
            style={{
              flex: 2, padding: "0.875rem", borderRadius: "0.75rem",
              border: "none", background: "#1e3a5f",
              color: "white", fontSize: "0.9rem",
              fontWeight: 600, cursor: saving || submitting ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
            }}
          >
            {submitting ? <Loader2 className="animate-spin" width="1rem" /> : <Send width="1rem" />}
            Submit for Approval
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
