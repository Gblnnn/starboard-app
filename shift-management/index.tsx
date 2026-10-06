import Back from "@/components/back";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { CalendarDays, ClipboardCheck, FileSpreadsheet, LayoutDashboard, Settings2, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import AttendanceUpload from "./AttendanceUpload";
import DailyAttendance from "./DailyAttendance";
import ProjectShifts from "./ProjectShifts";
import Roster from "./Roster";
import ShiftMaster from "./ShiftMaster";
import { AttendanceRow, errorMessage, fetchAccessibleProjects, isAdminRole, Project, projectDisplay } from "./shared";

type Tab = "overview" | "shifts" | "project-shifts" | "roster" | "attendance" | "upload";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });

export default function ShiftManagement() {
  const { userData } = useAuth();
  const isAdmin = isAdminRole(userData?.role);
  const [tab, setTab] = useState<Tab>("overview");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [summaryDate, setSummaryDate] = useState(today);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [rosteredCount, setRosteredCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchAccessibleProjects(userData?.emp_id ? String(userData.emp_id) : null, isAdmin);
      setProjects(rows);
      if (!selectedProject && rows.length) setSelectedProject(rows[0].project_code);
    } catch (error) {
      toast.error(errorMessage(error, "Unable to load assigned projects."));
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [userData?.emp_id, isAdmin, selectedProject]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const loadSummary = useCallback(async () => {
    if (!selectedProject || !summaryDate) {
      setAttendance([]);
      setRosteredCount(0);
      return;
    }
    try {
      const [{ data, error }, rosterResult] = await Promise.all([
        supabase.from("shift_timesheet")
          .select("id, attendance_date, project_code, employee_code, roster_shift_code, actual_shift_code, scheduled_punch_in, scheduled_punch_out, punch_in, punch_out, default_ot_minutes, overtime_minutes, break_minutes, total_working_minutes, status, verify_type, machine, attested_by, attested_at, verified_by, verified_at, approval_status, approved_by, approved_at, rejected_by, rejected_at, rejection_reason, remarks")
          .eq("project_code", selectedProject)
          .eq("attendance_date", summaryDate),
        supabase.from("roster")
          .select("id", { count: "exact", head: true })
          .eq("project_code", selectedProject)
          .eq("roster_date", summaryDate),
      ]);
      if (error) throw error;
      if (rosterResult.error) throw rosterResult.error;
      setAttendance((data ?? []) as AttendanceRow[]);
      setRosteredCount(rosterResult.count ?? 0);
    } catch (error) {
      toast.error(errorMessage(error, "Unable to load the project attendance summary."));
      setAttendance([]);
      setRosteredCount(0);
    }
  }, [selectedProject, summaryDate]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  const presentCount = attendance.filter((row) => row.status === "present" || row.status === "present with ot").length;
  const absentCount = attendance.filter((row) => row.status === "absent").length;
  const weekendCount = attendance.filter((row) => row.status === "weekend").length;
  const holidayCount = attendance.filter((row) => row.status === "holiday").length;
  const draftCount = attendance.filter((row) => row.approval_status === "draft").length;
  const submittedCount = attendance.filter((row) => row.approval_status === "submitted").length;
  const approvedCount = attendance.filter((row) => row.approval_status === "approved").length;
  const rejectedCount = attendance.filter((row) => row.approval_status === "rejected").length;

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; adminOnly?: boolean }> = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: "shifts", label: "Shift Master", icon: <Settings2 className="h-4 w-4" />, adminOnly: true },
    { id: "project-shifts", label: "Project Shifts", icon: <CalendarDays className="h-4 w-4" />, adminOnly: true },
    { id: "roster", label: "Roster", icon: <UsersRound className="h-4 w-4" /> },
    { id: "attendance", label: "Daily Attendance & Approval", icon: <ClipboardCheck className="h-4 w-4" /> },
    { id: "upload", label: "Attendance Upload", icon: <FileSpreadsheet className="h-4 w-4" /> },
  ];

  if (!isAdmin && !userData?.emp_id && !(() => {
    try { return JSON.parse(userData?.clearance || "{}").shift_management === true; } catch { return false; }
  })()) {
    return <main className="min-h-screen bg-slate-50 p-6"><Back title="Shift Management" /><div className="mx-auto mt-16 max-w-xl rounded-xl border border-amber-200 bg-white p-6 text-center shadow-sm"><h1 className="text-lg font-semibold text-slate-900">Access not assigned</h1><p className="mt-2 text-sm text-slate-600">Shift management access requires an employee identity and an assigned project role.</p></div></main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-8">
      <Back title="Shift Management" subtitle="Project roster and attendance" />
      <div className="mx-auto max-w-[1600px] px-3 pt-20 sm:px-6">
        <nav aria-label="Shift management sections" className="mb-5 flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          {tabs.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === item.id ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {item.icon}{item.label}
            </button>
          ))}
        </nav>

        {tab === "overview" && <section className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-[minmax(14rem,1fr)_12rem]">
              <label className="text-sm font-medium text-slate-700">Project
                <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}>
                  <option value="">Select project</option>
                  {projects.map((project) => <option key={project.project_code} value={project.project_code}>{projectDisplay(project)}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Business date (Dubai)
                <input className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" type="date" value={summaryDate} onChange={(event) => setSummaryDate(event.target.value)} />
              </label>
            </div>
          </div>
          {loading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading assigned projects…</div> : projects.length === 0 ? <div className="rounded-xl border border-amber-200 bg-white p-8 text-sm text-slate-600">No projects are currently assigned to your employee ID.</div> : <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Rostered", rosteredCount], ["Present", presentCount], ["Absent", absentCount], ["Draft / pending submission", draftCount], ["Submitted / pending approval", submittedCount], ["Approved", approvedCount], ["Rejected", rejectedCount], ["Weekend", weekendCount], ["Holiday", holidayCount]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p></div>)}
            </div>
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-4"><h2 className="font-semibold text-slate-900">Project attendance summary</h2><p className="text-sm text-slate-500">{projects.find((item) => item.project_code === selectedProject)?.project_name ?? selectedProject} · {summaryDate}</p></div>
              {!attendance.length ? <p className="p-5 text-sm text-slate-500">No attendance generated for this project/date. Roster employees, then generate attendance.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Employee ID", "Roster shift", "Actual shift", "Status", "Approval", "Working (HH:MM)"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{attendance.map((row) => <tr key={row.id}><td className="px-3 py-3 font-semibold">{row.employee_code}</td><td className="px-3 py-3">{row.roster_shift_code}</td><td className="px-3 py-3">{row.actual_shift_code}</td><td className="px-3 py-3 capitalize">{row.status}</td><td className="px-3 py-3 capitalize">{row.approval_status}</td><td className="px-3 py-3">{row.total_working_minutes == null ? "—" : `${String(Math.floor(row.total_working_minutes / 60)).padStart(2, "0")}:${String(row.total_working_minutes % 60).padStart(2, "0")}`}</td></tr>)}</tbody></table></div>}
            </section>
          </>}
        </section>}
        {tab === "shifts" && isAdmin && <ShiftMaster />}
        {tab === "project-shifts" && isAdmin && <ProjectShifts />}
        {tab === "roster" && <Roster />}
        {tab === "attendance" && <DailyAttendance />}
        {tab === "upload" && <AttendanceUpload />}
      </div>
    </main>
  );
}
