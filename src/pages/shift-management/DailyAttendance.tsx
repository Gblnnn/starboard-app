import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ApprovalStatus, AttendanceRow, AttendanceStatus, ATTENDANCE_STATUSES, dateTimeInput,
  errorMessage, fetchAccessibleProjects, filterMappedProjects, formatDateTime, formatMinutes, fromDateTimeInput,
  isAdminRole, Project, projectDisplay, scheduledTimestamps, Shift,
  workingMinutes,
} from "./shared";

type Screen = "attendance" | "approval" | "report";
const fieldClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
const badgeClass: Record<ApprovalStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

export default function DailyAttendance() {
  const { user, userData } = useAuth();
  const [screen, setScreen] = useState<Screen>("attendance");
  const [projects, setProjects] = useState<Project[]>([]);
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});
  const [projectCode, setProjectCode] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }));
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [mappedShiftCodes, setMappedShiftCodes] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalStatus | "all">("all");
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [processingApproval, setProcessingApproval] = useState(false);
  const [savedEdits, setSavedEdits] = useState<Record<number, string>>({});

  const editableState = (row: AttendanceRow) => JSON.stringify([
    row.actual_shift_code, row.punch_in, row.punch_out, row.status,
    row.overtime_minutes, row.remarks ?? "",
  ]);

  const loadSetup = useCallback(async () => {
    try {
      const [accessibleProjects, shiftResult, projectsMappingsResult] = await Promise.all([
        fetchAccessibleProjects(userData?.emp_id ? String(userData.emp_id) : null, isAdminRole(userData?.role)),
        supabase.from("shift_master").select("id, shift_code, shift_name, punch_in, punch_out, default_ot_minutes, break_minutes, shift_type, active_yn").order("shift_code"),
        supabase.from("project_shifts").select("project_code"),
      ]);
      if (shiftResult.error) throw shiftResult.error;
      if (projectsMappingsResult.error) throw projectsMappingsResult.error;
      const projectRows = filterMappedProjects(
        accessibleProjects,
        (projectsMappingsResult.data ?? []).map((mapping) => mapping.project_code),
      );
      const mappingResult = projectCode
        ? await supabase.from("project_shifts").select("shift_code, active_yn").eq("project_code", projectCode)
        : { data: [], error: null };
      if (mappingResult.error) throw mappingResult.error;
      setProjects(projectRows);
      setShifts((shiftResult.data ?? []) as Shift[]);
      setMappedShiftCodes(new Set((mappingResult.data ?? [])
        .filter((mapping) => mapping.active_yn.trim().toUpperCase() === "Y")
        .map((mapping) => mapping.shift_code)));
      if (!projectRows.some((project) => project.project_code === projectCode)) {
        setProjectCode(projectRows[0]?.project_code ?? "");
      }
    } catch (error) {
      toast.error(errorMessage(error, "Unable to load attendance setup."));
      setProjects([]);
    }
  }, [userData?.emp_id, userData?.role, projectCode]);

  useEffect(() => { void loadSetup(); }, [loadSetup]);

  const loadRows = useCallback(async () => {
    if (!projectCode || !attendanceDate) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.from("shift_timesheet")
        .select("id, attendance_date, project_code, employee_code, roster_shift_code, actual_shift_code, scheduled_punch_in, scheduled_punch_out, punch_in, punch_out, default_ot_minutes, overtime_minutes, break_minutes, total_working_minutes, status, verify_type, machine, attested_by, attested_at, verified_by, verified_at, approval_status, approved_by, approved_at, rejected_by, rejected_at, rejection_reason, remarks")
        .eq("project_code", projectCode)
        .eq("attendance_date", attendanceDate)
        .order("employee_code");
      if (error) throw error;
      const attendanceRows = (data ?? []) as AttendanceRow[];
      setRows(attendanceRows);
      setSavedEdits(Object.fromEntries(attendanceRows.map((row) => [row.id, editableState(row)])));
      const employeeCodes = Array.from(new Set(attendanceRows.map((row) => row.employee_code)));
      if (employeeCodes.length) {
        const { data: employees, error: employeeError } = await supabase.from("employees")
          .select("emp_id, name")
          .in("emp_id", employeeCodes);
        if (employeeError) throw employeeError;
        setEmployeeNames(Object.fromEntries((employees ?? []).map((employee) => [employee.emp_id, employee.name])));
      } else {
        setEmployeeNames({});
      }
    } catch (error) {
      toast.error(errorMessage(error, "Unable to load daily attendance."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [projectCode, attendanceDate]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  const shiftByCode = useMemo(() => new Map(shifts.map((shift) => [shift.shift_code, shift])), [shifts]);
  const selectedProject = projects.find((project) => project.project_code === projectCode);
  const canApprove = isAdminRole(userData?.role) ||
    String(selectedProject?.approver_id ?? "").trim() === String(userData?.emp_id ?? "").trim();

  const generateAttendance = async () => {
    if (!projectCode || !attendanceDate) {
      toast.error("Select a project and date.");
      return;
    }
    setGenerating(true);
    try {
      const [{ data: rosterData, error: rosterError }, { data: mappingData, error: mappingError }] = await Promise.all([
        supabase.from("roster").select("employee_code, shift_code")
          .eq("project_code", projectCode).eq("roster_date", attendanceDate),
        supabase.from("project_shifts").select("shift_code, active_yn")
          .eq("project_code", projectCode),
      ]);
      if (rosterError) throw rosterError;
      if (mappingError) throw mappingError;
      if (!rosterData?.length) throw new Error("No roster exists for this project and date.");
      const allowedCodes = new Set((mappingData ?? [])
        .filter((item) => item.active_yn?.trim().toUpperCase() === "Y")
        .map((item) => item.shift_code));
      const byCode = new Map(shifts.map((shift) => [shift.shift_code, shift]));
      const timestamp = new Date().toISOString();
      const values = rosterData.map((rosterItem) => {
        const shift = byCode.get(rosterItem.shift_code);
        if (!shift || shift.active_yn.trim().toUpperCase() !== "Y" || !allowedCodes.has(shift.shift_code)) {
          throw new Error(`Roster shift ${rosterItem.shift_code} is not currently active and mapped to this project.`);
        }
        const schedule = scheduledTimestamps(attendanceDate, shift);
        const work = workingMinutes(schedule.start, schedule.end, shift.break_minutes);
        return {
          attendance_date: attendanceDate,
          project_code: projectCode,
          employee_code: rosterItem.employee_code,
          roster_shift_code: rosterItem.shift_code,
          actual_shift_code: rosterItem.shift_code,
          scheduled_punch_in: schedule.start,
          scheduled_punch_out: schedule.end,
          punch_in: schedule.start,
          punch_out: schedule.end,
          default_ot_minutes: shift.default_ot_minutes,
          overtime_minutes: shift.default_ot_minutes,
          break_minutes: work.breakMinutes,
          total_working_minutes: work.total,
          status: "present" as AttendanceStatus,
          verify_type: "manual",
          machine: "manual",
          approval_status: "draft" as ApprovalStatus,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
          updated_at: timestamp,
        };
      });
      const { error } = await supabase.from("shift_timesheet").upsert(values, {
        onConflict: "project_code,employee_code,attendance_date",
        ignoreDuplicates: true,
      });
      if (error) throw error;
      toast.success(`Attendance generated for ${values.length} rostered employee${values.length === 1 ? "" : "s"}. Existing attendance was preserved.`);
      await loadRows();
    } catch (error) {
      toast.error(errorMessage(error, "Unable to generate attendance."));
    } finally {
      setGenerating(false);
    }
  };

  const updateLocal = (id: number, changes: Partial<AttendanceRow>) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...changes } : row));
  };

  const changeActualShift = (row: AttendanceRow, shiftCode: string) => {
    const shift = shiftByCode.get(shiftCode);
    if (!shift) {
      toast.error("The selected shift is unavailable.");
      return;
    }
    try {
      const schedule = scheduledTimestamps(row.attendance_date, shift);
      const work = workingMinutes(schedule.start, schedule.end, shift.break_minutes);
      updateLocal(row.id, {
        actual_shift_code: shift.shift_code,
        scheduled_punch_in: schedule.start,
        scheduled_punch_out: schedule.end,
        punch_in: schedule.start,
        punch_out: schedule.end,
        default_ot_minutes: shift.default_ot_minutes,
        overtime_minutes: shift.default_ot_minutes,
        break_minutes: work.breakMinutes,
        total_working_minutes: work.total,
      });
    } catch (error) {
      toast.error(errorMessage(error, "Unable to apply this shift."));
    }
  };

  const saveAttendanceRow = async (row: AttendanceRow) => {
    if (row.approval_status === "approved" || row.approval_status === "submitted") {
      toast.error("Submitted or approved attendance cannot be edited.");
      return;
    }
    const shift = shiftByCode.get(row.actual_shift_code);
    if (!shift) {
      toast.error(`Shift ${row.actual_shift_code} is missing from Shift Master.`);
      return;
    }
    if (!Number.isInteger(row.overtime_minutes) || row.overtime_minutes < 0) {
      toast.error("OT must be a non-negative whole number of minutes.");
      return;
    }
    let computed: { elapsed: number; breakMinutes: number; total: number } | null = null;
    if (row.status === "present" || row.status === "present with ot") {
      if (!row.punch_in || !row.punch_out) {
        toast.error("Punch in and punch out are required for present attendance.");
        return;
      }
      try {
        computed = workingMinutes(row.punch_in, row.punch_out, shift.break_minutes);
      } catch (error) {
        toast.error(errorMessage(error, "Punches are invalid."));
        return;
      }
    }
    setSavingId(row.id);
    try {
      const payload = {
        actual_shift_code: shift.shift_code,
        scheduled_punch_in: row.scheduled_punch_in,
        scheduled_punch_out: row.scheduled_punch_out,
        punch_in: row.punch_in,
        punch_out: row.punch_out,
        default_ot_minutes: shift.default_ot_minutes,
        overtime_minutes: Number(row.overtime_minutes),
        break_minutes: computed?.breakMinutes ?? 0,
        total_working_minutes: computed?.total ?? null,
        status: row.status,
        remarks: row.remarks?.trim() || null,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      };
      const { error } = await supabase.from("shift_timesheet").update(payload).eq("id", row.id);
      if (error) throw error;
      toast.success(`Attendance saved for ${row.employee_code}.`);
      await loadRows();
    } catch (error) {
      toast.error(errorMessage(error, "Unable to save attendance."));
    } finally {
      setSavingId(null);
    }
  };

  const submitAttendance = async () => {
    const submittable = rows.filter((row) => row.approval_status === "draft" || row.approval_status === "rejected");
    if (submittable.length === 0) {
      toast.error("There are no draft or rejected records to submit.");
      return;
    }
    if (submittable.some((row) => savedEdits[row.id] !== editableState(row))) {
      toast.error("Save all attendance edits before submitting.");
      return;
    }
    const invalid = submittable.find((row) => {
      if (row.status !== "present" && row.status !== "present with ot") return false;
      const shift = shiftByCode.get(row.actual_shift_code);
      if (!shift || !row.punch_in || !row.punch_out) return true;
      try {
        workingMinutes(row.punch_in, row.punch_out, shift.break_minutes);
        return !Number.isInteger(row.overtime_minutes) || row.overtime_minutes < 0;
      } catch {
        return true;
      }
    });
    if (invalid) {
      toast.error(`Complete and save valid punches and OT for ${invalid.employee_code} before submitting.`);
      return;
    }
    setProcessingApproval(true);
    try {
      const ids = submittable.map((row) => row.id);
      const { error } = await supabase.from("shift_timesheet").update({
        approval_status: "submitted",
        attested_by: user?.id ?? null,
        attested_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      }).in("id", ids);
      if (error) throw error;
      toast.success(`Submitted ${ids.length} attendance record${ids.length === 1 ? "" : "s"} for approval.`);
      await loadRows();
      setScreen("approval");
    } catch (error) {
      toast.error(errorMessage(error, "Unable to submit attendance."));
    } finally {
      setProcessingApproval(false);
    }
  };

  const approveSubmitted = async () => {
    const submitted = rows.filter((row) => row.approval_status === "submitted");
    if (!submitted.length) {
      toast.info("There are no submitted records for this project and date.");
      return;
    }
    setProcessingApproval(true);
    try {
      const { error } = await supabase.from("shift_timesheet").update({
        approval_status: "approved",
        approved_by: user?.id ?? null,
        approved_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      }).in("id", submitted.map((row) => row.id)).eq("approval_status", "submitted");
      if (error) throw error;
      toast.success(`Approved ${submitted.length} record${submitted.length === 1 ? "" : "s"}.`);
      await loadRows();
    } catch (error) {
      toast.error(errorMessage(error, "Unable to approve attendance."));
    } finally {
      setProcessingApproval(false);
    }
  };

  const rejectSubmitted = async () => {
    const reason = rejectionReason.trim();
    if (!reason) {
      toast.error("Enter a rejection reason.");
      return;
    }
    const submitted = rows.filter((row) => row.approval_status === "submitted");
    if (!submitted.length) {
      toast.info("There are no submitted records for this project and date.");
      return;
    }
    setProcessingApproval(true);
    try {
      const { error } = await supabase.from("shift_timesheet").update({
        approval_status: "rejected",
        rejected_by: user?.id ?? null,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      }).in("id", submitted.map((row) => row.id)).eq("approval_status", "submitted");
      if (error) throw error;
      toast.success(`Rejected ${submitted.length} record${submitted.length === 1 ? "" : "s"}.`);
      setRejectionReason("");
      await loadRows();
    } catch (error) {
      toast.error(errorMessage(error, "Unable to reject attendance."));
    } finally {
      setProcessingApproval(false);
    }
  };

  const exportCsv = () => {
    const data = rows.filter((row) => approvalFilter === "all" || row.approval_status === approvalFilter);
    if (!data.length) {
      toast.info("No attendance records to export.");
      return;
    }
    const headers = ["Date", "Project Code", "Employee ID", "Roster Shift", "Actual Shift", "Status", "Punch In", "Punch Out", "Break Minutes", "OT Minutes", "Total Working Minutes", "Approval Status", "Remarks"];
    const escapeCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [headers, ...data.map((row) => [
      row.attendance_date, row.project_code, row.employee_code, row.roster_shift_code, row.actual_shift_code,
      row.status, row.punch_in, row.punch_out, row.break_minutes, row.overtime_minutes,
      row.total_working_minutes, row.approval_status, row.remarks,
    ])].map((line) => line.map(escapeCell).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `shift-attendance-${projectCode}-${attendanceDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const visibleRows = rows.filter((row) => (
    (approvalFilter === "all" || row.approval_status === approvalFilter) &&
    `${row.employee_code} ${row.actual_shift_code} ${row.roster_shift_code} ${row.status} ${row.remarks ?? ""}`
      .toLowerCase().includes(search.trim().toLowerCase())
  ));
  const counts = rows.reduce<Record<ApprovalStatus, number>>((result, row) => {
    result[row.approval_status] += 1;
    return result;
  }, { draft: 0, submitted: 0, approved: 0, rejected: 0 });
  const statusLabel = (status: AttendanceStatus) => status.replace(/\b\w/g, (character) => character.toUpperCase());

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(15rem,1fr)_12rem_auto]">
          <label className="text-sm font-medium text-slate-700">Project
            <select className={`${fieldClass} mt-1 w-full`} value={projectCode} onChange={(event) => setProjectCode(event.target.value)}>
              <option value="">Select project</option>{projects.map((project) => <option key={project.project_code} value={project.project_code}>{projectDisplay(project)}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Attendance date
            <input className={`${fieldClass} mt-1 w-full`} type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} />
          </label>
          <button type="button" onClick={() => void generateAttendance()} disabled={generating || loading || !projectCode} className="mt-auto h-10 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{generating ? "Generating…" : "Generate attendance"}</button>
        </div>
        {selectedProject && <p className="mt-2 text-xs text-slate-500">Business timezone: Asia/Dubai · Attendance date is the shift-start date, including overnight shifts.</p>}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(["draft", "submitted", "approved", "rejected"] as const).map((status) => <div key={status} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{status}</p><p className="mt-1 text-2xl font-semibold text-slate-900">{counts[status]}</p></div>)}
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <div className="flex flex-wrap gap-2">
              {(["attendance", "approval", "report"] as const).map((value) => <button type="button" key={value} onClick={() => setScreen(value)} className={`rounded-lg px-3 py-2 text-sm font-medium capitalize ${screen === value ? "bg-teal-700 text-white" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}>{value}</button>)}
            </div>
            <p className="mt-2 text-sm text-slate-500">{rows.length} records · {attendanceDate}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {screen === "attendance" && <button type="button" className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={processingApproval || !rows.some((row) => row.approval_status === "draft" || row.approval_status === "rejected")} onClick={() => void submitAttendance()}>{processingApproval ? "Submitting…" : "Submit attendance"}</button>}
            {screen === "approval" && canApprove && <>
              <button type="button" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={processingApproval || !rows.some((row) => row.approval_status === "submitted")} onClick={() => void approveSubmitted()}>{processingApproval ? "Processing…" : "Approve submitted"}</button>
              <input className={fieldClass} placeholder="Required rejection reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} />
              <button type="button" className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={processingApproval || !rows.some((row) => row.approval_status === "submitted")} onClick={() => void rejectSubmitted()}>Reject submitted</button>
            </>}
            {screen === "report" && <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={exportCsv}>Export CSV</button>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <input className={`${fieldClass} min-w-[14rem] flex-1`} placeholder="Search employee, shift, status or remarks" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select className={fieldClass} value={approvalFilter} onChange={(event) => setApprovalFilter(event.target.value as ApprovalStatus | "all")}>
            <option value="all">All approval statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
          </select>
        </div>

        {loading ? <p className="p-6 text-sm text-slate-500">Loading attendance…</p> : visibleRows.length === 0 ? <p className="p-6 text-sm text-slate-500">No attendance records. Generate from the roster to begin.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>{["Employee ID", "Roster shift", "Actual shift", "Status", "Punch in (Dubai)", "Punch out (Dubai)", "Break", "OT (min)", "Working", "Approval", "Remarks", ...(screen === "approval" ? ["Audit"] : []), ...(screen === "attendance" ? ["Save"] : [])].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => {
                  const editable = screen === "attendance" && (row.approval_status === "draft" || row.approval_status === "rejected");
                  const shift = shiftByCode.get(row.actual_shift_code);
                  let calculated = formatMinutes(row.total_working_minutes);
                  let calculatedBreak = row.break_minutes;
                  if (row.punch_in && row.punch_out && shift) {
                    try {
                      const totals = workingMinutes(row.punch_in, row.punch_out, shift.break_minutes);
                      calculated = formatMinutes(totals.total);
                      calculatedBreak = totals.breakMinutes;
                    } catch {
                      calculated = "Invalid";
                    }
                  }
                  return <tr key={row.id} className={row.approval_status === "rejected" ? "bg-rose-50/40" : ""}>
                    <td className="px-3 py-3 font-semibold text-slate-800">{row.employee_code}<div className="font-normal text-slate-500">{employeeNames[row.employee_code] || "—"}</div></td>
                    <td className="px-3 py-3">{row.roster_shift_code}</td>
                    <td className="px-3 py-3">
                      {editable ? <select className={`${fieldClass} min-w-32`} value={row.actual_shift_code} onChange={(event) => changeActualShift(row, event.target.value)}>{shifts.filter((item) => item.active_yn.trim().toUpperCase() === "Y" && mappedShiftCodes.has(item.shift_code)).map((item) => <option key={item.shift_code} value={item.shift_code}>{item.shift_code}</option>)}</select> : row.actual_shift_code}
                    </td>
                    <td className="px-3 py-3">
                      {editable ? <select className={fieldClass} value={row.status} onChange={(event) => updateLocal(row.id, { status: event.target.value as AttendanceStatus })}>{ATTENDANCE_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select> : statusLabel(row.status)}
                    </td>
                    <td className="px-3 py-3">
                      {editable ? <input aria-label={`Punch in for ${row.employee_code}`} className={`${fieldClass} min-w-52`} type="datetime-local" value={dateTimeInput(row.punch_in)} onChange={(event) => updateLocal(row.id, { punch_in: fromDateTimeInput(event.target.value) })} /> : formatDateTime(row.punch_in)}
                    </td>
                    <td className="px-3 py-3">
                      {editable ? <input aria-label={`Punch out for ${row.employee_code}`} className={`${fieldClass} min-w-52`} type="datetime-local" value={dateTimeInput(row.punch_out)} onChange={(event) => updateLocal(row.id, { punch_out: fromDateTimeInput(event.target.value) })} /> : formatDateTime(row.punch_out)}
                    </td>
                    <td className="px-3 py-3">{calculatedBreak} min</td>
                    <td className="px-3 py-3">{editable ? <input aria-label={`OT minutes for ${row.employee_code}`} className={`${fieldClass} w-24`} type="number" min={0} step={1} value={row.overtime_minutes} onChange={(event) => updateLocal(row.id, { overtime_minutes: Number(event.target.value) })} /> : formatMinutes(row.overtime_minutes)}</td>
                    <td className="px-3 py-3 font-medium">{calculated}</td>
                    <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${badgeClass[row.approval_status]}`}>{row.approval_status}</span></td>
                    <td className="max-w-56 px-3 py-3">
                      {editable ? <input className={`${fieldClass} min-w-40`} maxLength={500} value={row.remarks ?? ""} onChange={(event) => updateLocal(row.id, { remarks: event.target.value })} placeholder="Remarks" /> : <span title={row.rejection_reason ?? row.remarks ?? ""}>{row.rejection_reason || row.remarks || "—"}</span>}
                    </td>
                    {screen === "approval" && <td className="px-3 py-3 text-xs text-slate-500">
                      {row.approval_status === "approved" ? <>Approved {formatDateTime(row.approved_at)}<br />By {row.approved_by || "—"}</> : row.approval_status === "rejected" ? <>Rejected {formatDateTime(row.rejected_at)}<br />{row.rejection_reason}</> : <>Attested {formatDateTime(row.attested_at)}<br />By {row.attested_by || "—"}</>}
                    </td>}
                    {screen === "attendance" && <td className="px-3 py-3">{editable ? <button type="button" className="font-semibold text-teal-700 hover:underline disabled:opacity-50" disabled={savingId === row.id} onClick={() => void saveAttendanceRow(row)}>{savingId === row.id ? "Saving…" : "Save"}</button> : "Locked"}</td>}
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
