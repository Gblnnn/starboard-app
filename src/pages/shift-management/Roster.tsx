import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  addDays, employeeBelongsToProject, Employee, errorMessage, fetchAccessibleProjects, filterMappedProjects,
  isAdminRole, Project, projectDisplay, RosterRow, Shift, validDate,
} from "./shared";

const fieldClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

function formatRosterDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}-${month}-${year}`;
}

function rosterSaveErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Unable to save roster.";
}

export default function Roster() {
  const { user, userData } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectCode, setProjectCode] = useState("");
  const [fromDate, setFromDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }));
  const [toDate, setToDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }));
  const [selectedShift, setSelectedShift] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [mappings, setMappings] = useState<Array<{ project_code: string; shift_code: string; active_yn: string }>>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showRosterReport, setShowRosterReport] = useState(false);
  const [reportFromDate, setReportFromDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }));
  const [reportToDate, setReportToDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }));
  const [reportShiftCode, setReportShiftCode] = useState("all");
  const [reportRoster, setReportRoster] = useState<RosterRow[]>([]);
  const [reportEmployeeNames, setReportEmployeeNames] = useState<Record<string, string>>({});
  const [reportLoading, setReportLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const accessibleProjects = useCallback(() => fetchAccessibleProjects(
    userData?.emp_id ? String(userData.emp_id) : null,
    isAdminRole(userData?.role),
  ), [userData?.emp_id, userData?.role]);

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [projectRows, shiftResult, mappingResult] = await Promise.all([
        accessibleProjects(),
        supabase.from("shift_master").select("id, shift_code, shift_name, punch_in, punch_out, default_ot_minutes, break_minutes, shift_type, active_yn").order("shift_code"),
        supabase.from("project_shifts").select("project_code, shift_code, active_yn"),
      ]);
      if (shiftResult.error) throw shiftResult.error;
      if (mappingResult.error) throw mappingResult.error;
      const mappedProjects = filterMappedProjects(
        projectRows,
        (mappingResult.data ?? []).map((mapping) => mapping.project_code),
      );
      setProjects(mappedProjects);
      setShifts((shiftResult.data ?? []) as Shift[]);
      setMappings((mappingResult.data ?? []) as Array<{ project_code: string; shift_code: string; active_yn: string }>);
      if (!mappedProjects.some((project) => project.project_code === projectCode)) {
        setProjectCode(mappedProjects[0]?.project_code ?? "");
      }
    } catch (error) {
      toast.error(errorMessage(error, "Unable to load roster setup."));
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [accessibleProjects, projectCode]);

  useEffect(() => { void loadBase(); }, [loadBase]);

  const project = projects.find((item) => item.project_code === projectCode) ?? null;
  const projectShifts = shifts.filter((shift) => shift.active_yn.trim().toUpperCase() === "Y" &&
    mappings.some((mapping) => mapping.project_code === projectCode &&
      mapping.shift_code === shift.shift_code && mapping.active_yn.trim().toUpperCase() === "Y"));
  const shiftByCode = useMemo(() => new Map(shifts.map((shift) => [shift.shift_code, shift])), [shifts]);

  const loadRoster = useCallback(async () => {
    if (!project) {
      setEmployees([]);
      setRoster([]);
      setSelected(new Set());
      return;
    }
    setLoading(true);
    try {
      const [latestProjectsResult, rosterResult] = await Promise.all([
        supabase.from("v_employee_latest_project")
          .select("emp_id, project_code")
          .eq("project_code", project.project_code),
        supabase.from("roster")
          .select("id, project_code, employee_code, shift_code, roster_date, created_by")
          .eq("project_code", projectCode)
          .gte("roster_date", fromDate)
          .lte("roster_date", toDate)
          .order("roster_date")
          .order("employee_code"),
      ]);
      if (latestProjectsResult.error) throw latestProjectsResult.error;
      if (rosterResult.error) throw rosterResult.error;
      const latestProjectByEmployee = new Map(
        (latestProjectsResult.data ?? [])
          .filter((row) => row.emp_id && row.project_code)
          .map((row) => [row.emp_id, row.project_code]),
      );
      const employeeCodes = Array.from(latestProjectByEmployee.keys());
      const employeeResult = employeeCodes.length
        ? await supabase.from("employees")
          .select("id, emp_id, device_user_id, name, designation, emp_type, status")
          .in("emp_id", employeeCodes)
          .order("name")
        : { data: [], error: null };
      if (employeeResult.error) throw employeeResult.error;
      const distinctEmployees = new Map<string, Employee>();
      for (const employeeDetails of (employeeResult.data ?? []) as Omit<Employee, "project">[]) {
        const rawEmployee: Employee = {
          ...employeeDetails,
          project: latestProjectByEmployee.get(employeeDetails.emp_id) ?? null,
        };
        if (!rawEmployee.emp_id || !employeeBelongsToProject(rawEmployee, project)) continue;
        if (rawEmployee.status && rawEmployee.status.trim().toLowerCase() !== "active") continue;
        distinctEmployees.set(rawEmployee.emp_id, rawEmployee);
      }
      const rosterRows = (rosterResult.data ?? []) as RosterRow[];
      const currentlyRostered = new Set(rosterRows.map((row) => row.employee_code));
      setEmployees(Array.from(distinctEmployees.values()));
      setRoster(rosterRows);
      setSelected(currentlyRostered);
    } catch (error) {
      toast.error(errorMessage(error, "Unable to load employees or roster."));
      setEmployees([]);
      setRoster([]);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [project, projectCode, fromDate, toDate]);

  useEffect(() => { void loadRoster(); }, [loadRoster]);

  const loadReport = useCallback(async () => {
    if (!showRosterReport) return;
    if (!projectCode) {
      setReportRoster([]);
      setReportEmployeeNames({});
      return;
    }
    if (!validDate(reportFromDate) || !validDate(reportToDate)) {
      toast.error("Select valid roster report dates.");
      setReportRoster([]);
      setReportEmployeeNames({});
      return;
    }
    if (reportFromDate > reportToDate) {
      toast.error("Report From date must be on or before To date.");
      setReportRoster([]);
      setReportEmployeeNames({});
      return;
    }
    setReportLoading(true);
    try {
      const pageSize = 1000;
      const rosterRows: RosterRow[] = [];
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from("roster")
          .select("id, project_code, employee_code, shift_code, roster_date, created_by")
          .eq("project_code", projectCode)
          .gte("roster_date", reportFromDate)
          .lte("roster_date", reportToDate)
          .order("roster_date")
          .order("shift_code")
          .order("employee_code")
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const page = (data ?? []) as RosterRow[];
        rosterRows.push(...page);
        if (page.length < pageSize) break;
      }

      const employeeCodes = Array.from(new Set(rosterRows.map((row) => row.employee_code)));
      const employeeNameEntries = await Promise.all(
        Array.from({ length: Math.ceil(employeeCodes.length / 500) }, (_, index) =>
          supabase.from("employees")
            .select("emp_id, name")
            .in("emp_id", employeeCodes.slice(index * 500, (index + 1) * 500))
        ),
      );
      const employeeNames: Record<string, string> = {};
      for (const result of employeeNameEntries) {
        if (result.error) throw result.error;
        for (const employee of result.data ?? []) employeeNames[employee.emp_id] = employee.name;
      }
      setReportRoster(rosterRows);
      setReportEmployeeNames(employeeNames);
    } catch (error) {
      toast.error(errorMessage(error, "Unable to load roster report."));
      setReportRoster([]);
      setReportEmployeeNames({});
    } finally {
      setReportLoading(false);
    }
  }, [projectCode, reportFromDate, reportToDate, showRosterReport]);

  useEffect(() => { void loadReport(); }, [loadReport]);

  const rosterByKey = useMemo(() => new Map(roster.map((row) => [`${row.roster_date}:${row.employee_code}`, row])), [roster]);
  const reportShiftCodes = Array.from(new Set(reportRoster.map((row) => row.shift_code))).sort();
  const effectiveReportShiftCode = reportShiftCodes.includes(reportShiftCode) ? reportShiftCode : "all";
  const filteredReportRoster = effectiveReportShiftCode === "all"
    ? reportRoster
    : reportRoster.filter((row) => row.shift_code === effectiveReportShiftCode);
  const visibleEmployees = employees.filter((employee) =>
    `${employee.emp_id} ${employee.name} ${employee.designation ?? ""} ${employee.emp_type ?? ""}`
      .toLowerCase().includes(search.trim().toLowerCase())
  );
  const displayDates = fromDate && toDate && validDate(fromDate) && validDate(toDate) && fromDate <= toDate
    ? (() => {
      const count = Math.floor((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000);
      return count >= 0 && count < 93
        ? Array.from({ length: count + 1 }, (_, index) => addDays(fromDate, index))
        : [];
    })()
    : [];

  const toggleEmployee = (empId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(empId)) next.delete(empId);
      else next.add(empId);
      return next;
    });
  };

  const datesInRange = (): string[] => {
    if (!validDate(fromDate) || !validDate(toDate)) throw new Error("Select valid From and To dates.");
    if (fromDate > toDate) throw new Error("From date must be on or before To date.");
    const dates: string[] = [];
    for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
      if (dates.length >= 93) throw new Error("A roster range cannot exceed 93 days.");
      dates.push(date);
    }
    return dates;
  };

  const saveRoster = async () => {
    if (!projectCode || !selectedShift || selected.size === 0) {
      toast.error("Select a project, an active mapped shift, and at least one employee.");
      return;
    }
    setSaving(true);
    try {
      const dates = datesInRange();
      const timestamp = new Date().toISOString();
      const values = dates.flatMap((rosterDate) => Array.from(selected).map((employeeCode) => ({
        project_code: projectCode,
        employee_code: employeeCode,
        shift_code: selectedShift,
        roster_date: rosterDate,
        created_by: rosterByKey.get(`${rosterDate}:${employeeCode}`)?.created_by ?? user?.id ?? null,
        updated_by: user?.id ?? null,
        updated_at: timestamp,
      })));
      const { error } = await supabase.from("roster").upsert(values, { onConflict: "project_code,employee_code,roster_date" });
      if (error) throw error;
      toast.success(`Saved roster assignments for ${selected.size} employee${selected.size === 1 ? "" : "s"} across ${dates.length} date${dates.length === 1 ? "" : "s"}.`);
      await loadRoster();
    } catch (error) {
      toast.error(rosterSaveErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const removeAssignment = async (row: RosterRow) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("roster").delete().eq("id", row.id);
      if (error) throw error;
      toast.success(`Removed ${row.employee_code} from ${row.roster_date}.`);
      await loadRoster();
    } catch (error) {
      toast.error(errorMessage(error, "Unable to remove the roster entry."));
    } finally {
      setSaving(false);
    }
  };

  const copyPreviousDay = async () => {
    if (!projectCode || !validDate(fromDate)) {
      toast.error("Select a valid project and From date.");
      return;
    }
    setSaving(true);
    try {
      const sourceDate = addDays(fromDate, -1);
      const { data, error } = await supabase.from("roster")
        .select("project_code, employee_code, shift_code, created_by")
        .eq("project_code", projectCode)
        .eq("roster_date", sourceDate);
      if (error) throw error;
      if (!data?.length) {
        toast.info(`No roster found on ${sourceDate}.`);
        return;
      }
      const { error: saveError } = await supabase.from("roster").upsert(
        data.map((row) => ({
          project_code: row.project_code,
          employee_code: row.employee_code,
          shift_code: row.shift_code,
          roster_date: fromDate,
          created_by: rosterByKey.get(`${fromDate}:${row.employee_code}`)?.created_by ?? row.created_by ?? user?.id ?? null,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "project_code,employee_code,roster_date" },
      );
      if (saveError) throw saveError;
      toast.success(`Copied ${data.length} assignment${data.length === 1 ? "" : "s"} from ${sourceDate}.`);
      await loadRoster();
    } catch (error) {
      toast.error(errorMessage(error, "Unable to copy the previous day."));
    } finally {
      setSaving(false);
    }
  };

  const copyPreviousWeek = async () => {
    if (!projectCode) return;
    setSaving(true);
    try {
      const dates = datesInRange();
      const sourceStart = addDays(fromDate, -7);
      const sourceEnd = addDays(toDate, -7);
      const { data, error } = await supabase.from("roster")
        .select("project_code, employee_code, shift_code, roster_date, created_by")
        .eq("project_code", projectCode)
        .gte("roster_date", sourceStart)
        .lte("roster_date", sourceEnd);
      if (error) throw error;
      if (!data?.length) {
        toast.info("No roster was found in the matching dates of the previous week.");
        return;
      }
      const { error: saveError } = await supabase.from("roster").upsert(
        data.map((row) => ({
          project_code: row.project_code,
          employee_code: row.employee_code,
          shift_code: row.shift_code,
          roster_date: addDays(row.roster_date, 7),
          created_by: rosterByKey.get(`${addDays(row.roster_date, 7)}:${row.employee_code}`)?.created_by ?? row.created_by ?? user?.id ?? null,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "project_code,employee_code,roster_date" },
      );
      if (saveError) throw saveError;
      toast.success(`Copied ${data.length} assignment${data.length === 1 ? "" : "s"} into the selected ${dates.length}-day range.`);
      await loadRoster();
    } catch (error) {
      toast.error(errorMessage(error, "Unable to copy the previous week."));
    } finally {
      setSaving(false);
    }
  };

  if (showRosterReport) {
    return (
      <div className="space-y-5">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Roster report</h2>
              <p className="text-sm text-slate-500">Employees assigned to each shift in the selected project and date range.</p>
            </div>
            <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => setShowRosterReport(false)}>Back to roster</button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-medium text-slate-700">Project
              <select className={`${fieldClass} mt-1 w-full`} value={projectCode} onChange={(event) => { setProjectCode(event.target.value); setReportShiftCode("all"); }}>
                <option value="">Select project</option>
                {projects.map((item) => <option key={item.project_code} value={item.project_code}>{projectDisplay(item)}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">From date
              <input className={`${fieldClass} mt-1 w-full`} type="date" value={reportFromDate} onChange={(event) => setReportFromDate(event.target.value)} />
            </label>
            <label className="text-sm font-medium text-slate-700">To date
              <input className={`${fieldClass} mt-1 w-full`} type="date" value={reportToDate} onChange={(event) => setReportToDate(event.target.value)} />
            </label>
            <label className="text-sm font-medium text-slate-700">Roster / shift
              <select className={`${fieldClass} mt-1 w-full`} value={effectiveReportShiftCode} onChange={(event) => setReportShiftCode(event.target.value)}>
                <option value="all">All</option>
                {reportShiftCodes.map((shiftCode) => <option key={shiftCode} value={shiftCode}>{shiftCode}{shiftByCode.has(shiftCode) ? ` — ${shiftByCode.get(shiftCode)?.shift_name}` : ""}</option>)}
              </select>
            </label>
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {reportLoading ? <p className="p-6 text-sm text-slate-500">Loading roster report…</p> : filteredReportRoster.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No roster assignments are available for this project and date range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>{["Roster date", "Shift", "Employee ID", "Employee name"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReportRoster.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-3">{formatRosterDate(row.roster_date)}</td>
                      <td className="px-3 py-3 font-medium">{row.shift_code}</td>
                      <td className="px-3 py-3">{row.employee_code}</td>
                      <td className="px-3 py-3">{reportEmployeeNames[row.employee_code] ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">Project
            <select className={`${fieldClass} mt-1 w-full`} value={projectCode} onChange={(event) => { setProjectCode(event.target.value); setReportShiftCode("all"); }}>
              <option value="">Select project</option>{projects.map((item) => <option key={item.project_code} value={item.project_code}>{projectDisplay(item)}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">From date
            <input className={`${fieldClass} mt-1 w-full`} type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-700">To date
            <input className={`${fieldClass} mt-1 w-full`} type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-700">Mapped active shift
            <select className={`${fieldClass} mt-1 w-full`} value={selectedShift} onChange={(event) => setSelectedShift(event.target.value)}>
              <option value="">Select shift</option>{projectShifts.map((shift) => <option key={shift.shift_code} value={shift.shift_code}>{shift.shift_code} — {shift.shift_name}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className="rounded-lg border border-teal-700 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50" onClick={() => { setReportShiftCode("all"); setShowRosterReport(true); }}>Roster report</button>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={saving || !projectCode} onClick={() => void copyPreviousDay()}>Copy previous day</button>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={saving || !projectCode} onClick={() => void copyPreviousWeek()}>Copy previous week</button>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" onClick={() => setSelected(new Set(employees.map((employee) => employee.emp_id)))}>Select all</button>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" onClick={() => setSelected(new Set())}>Clear all</button>
          <button type="button" className="ml-auto rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50" disabled={saving || loading || !projectCode} onClick={() => void saveRoster()}>{saving ? "Saving…" : `Save roster (${selected.size})`}</button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div><h2 className="font-semibold text-slate-900">Employees and existing roster</h2><p className="text-sm text-slate-500">Employee ID is the business key. Device ID is displayed for biometric reference only.</p></div>
          <input aria-label="Search employees" className={fieldClass} placeholder="Search ID, name or designation" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        {loading ? <p className="p-6 text-sm text-slate-500">Loading project employees and roster…</p> : !project ? <p className="p-6 text-sm text-slate-500">Select an assigned project.</p> : visibleEmployees.length === 0 ? <p className="p-6 text-sm text-slate-500">No active employees found using the employees.project assignment.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Select", "Employee ID", "Device ID", "Employee name", "Designation", "Employee type", "Existing shift by date", "Remove"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visibleEmployees.map((employee) => {
                  const assignments = displayDates.map((date) => ({ date, row: rosterByKey.get(`${date}:${employee.emp_id}`) })).filter((entry) => entry.row);
                  return <tr key={employee.emp_id}>
                    <td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${employee.emp_id}`} checked={selected.has(employee.emp_id)} onChange={() => toggleEmployee(employee.emp_id)} /></td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{employee.emp_id}</td>
                    <td className="px-3 py-3 text-slate-500">{employee.device_user_id || "—"}</td>
                    <td className="px-3 py-3">{employee.name}</td>
                    <td className="px-3 py-3">{employee.designation || "—"}</td>
                    <td className="px-3 py-3">{employee.emp_type || "—"}</td>
                    <td className="px-3 py-3">
                      {assignments.length ? assignments.map(({ date, row }) => <div key={date} className="whitespace-nowrap">{formatRosterDate(date)}: <span className="font-medium">{row?.shift_code}</span></div>) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {assignments.map(({ date, row }) => row && <button key={date} type="button" className="mr-2 text-xs font-medium text-rose-700 hover:underline disabled:opacity-50" disabled={saving} title={`${formatRosterDate(date)}: ${shiftByCode.get(row.shift_code)?.shift_name ?? row.shift_code}`} onClick={() => void removeAssignment(row)}>{formatRosterDate(date)} ×</button>)}
                    </td>
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
