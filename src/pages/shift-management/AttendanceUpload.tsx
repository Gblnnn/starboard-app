import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  addDays, AttendanceStatus, ATTENDANCE_STATUSES, Employee,
  errorMessage, fetchAccessibleProjects, filterMappedProjects, isAdminRole, Project, scheduledTimestamps,
  Shift, validDate, workingMinutes,
} from "./shared";

type ImportInput = {
  rowNumber: number;
  attendanceDate: string;
  projectCode: string;
  employeeCode: string;
  shiftCode: string;
  status: string;
  punchIn: string;
  punchOut: string;
  overtime: string;
  remarks: string;
};

type PreviewRow = ImportInput & {
  employeeName: string;
  errors: string[];
  warnings: string[];
  payload?: Record<string, unknown>;
};

const requiredHeaders = ["date", "project code", "employee id", "shift code", "status", "punch in", "punch out", "ot", "remarks"];
const fieldClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function excelDate(value: unknown): string {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = cellText(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return "";
  const first = Number(match[1]);
  const second = Number(match[2]);
  const day = first > 12 ? first : second > 12 ? second : first;
  const month = first > 12 ? second : second > 12 ? first : second;
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function excelTime(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const totalMinutes = Math.round((value % 1) * 1440);
    return `${String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  }
  const text = cellText(value);
  const match = text.match(/(?:T|\s)?(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : "";
}

function parseMinutes(value: unknown): number | null {
  const text = cellText(value);
  if (!text) return null;
  const minutes = Number(text);
  return Number.isInteger(minutes) && minutes >= 0 ? minutes : null;
}

function parseImportRows(file: File): Promise<ImportInput[]> {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("The workbook does not contain a worksheet.");
    const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
    if (!values.length) throw new Error("The first worksheet is empty.");
    const headers = (values[0] as unknown[]).map((value) => cellText(value).toLowerCase());
    const column = (name: string) => headers.indexOf(name);
    const missing = requiredHeaders.filter((header) => column(header) < 0);
    if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}.`);
    const rows = values.slice(1).filter((line) => (line as unknown[]).some((value) => cellText(value) !== ""));
    if (rows.length > 2000) throw new Error("A single import is limited to 2,000 data rows.");
    return rows.map((raw, index) => {
      const line = raw as unknown[];
      const get = (header: string) => line[column(header)];
      return {
        rowNumber: index + 2,
        attendanceDate: excelDate(get("date")),
        projectCode: cellText(get("project code")),
        employeeCode: cellText(get("employee id")),
        shiftCode: cellText(get("shift code")),
        status: cellText(get("status")).toLowerCase(),
        punchIn: excelTime(get("punch in")),
        punchOut: excelTime(get("punch out")),
        overtime: cellText(get("ot")),
        remarks: cellText(get("remarks")),
      };
    });
  });
}

function timeOnDate(date: string, time: string): string {
  return `${date}T${time}:00+04:00`;
}

export default function AttendanceUpload() {
  const { user, userData } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [mappings, setMappings] = useState<Array<{ project_code: string; shift_code: string; active_yn: string }>>([]);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);

  const loadReferences = useCallback(async () => {
    setValidating(true);
    try {
      const [accessibleProjects, shiftResult, mappingResult] = await Promise.all([
        fetchAccessibleProjects(userData?.emp_id ? String(userData.emp_id) : null, isAdminRole(userData?.role)),
        supabase.from("shift_master").select("id, shift_code, shift_name, punch_in, punch_out, default_ot_minutes, break_minutes, shift_type, active_yn"),
        supabase.from("project_shifts").select("project_code, shift_code, active_yn"),
      ]);
      if (shiftResult.error) throw shiftResult.error;
      if (mappingResult.error) throw mappingResult.error;
      setProjects(filterMappedProjects(accessibleProjects, (mappingResult.data ?? []).map((mapping) => mapping.project_code)));
      setShifts((shiftResult.data ?? []) as Shift[]);
      setMappings((mappingResult.data ?? []) as Array<{ project_code: string; shift_code: string; active_yn: string }>);
    } catch (error) {
      toast.error(errorMessage(error, "Unable to load validation data."));
    } finally {
      setValidating(false);
    }
  }, [userData?.emp_id, userData?.role]);

  useEffect(() => { void loadReferences(); }, [loadReferences]);

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      requiredHeaders.map((header) => ({
        "date": "Date",
        "project code": "Project Code",
        "employee id": "Employee ID",
        "shift code": "Shift Code",
        "status": "Status",
        "punch in": "Punch In",
        "punch out": "Punch Out",
        "ot": "OT",
        "remarks": "Remarks",
      }[header])),
      [null, "PROJECT-CODE", "SS00605", "D01", "present", null, null, 0, ""],
    ]);
    const excelEpoch = Date.UTC(1899, 11, 30);
    worksheet.A2 = { t: "n", v: (Date.UTC(2026, 9, 6) - excelEpoch) / 86400000, z: "yyyy-mm-dd" };
    worksheet.F2 = { t: "n", v: 7 / 24, z: "hh:mm" };
    worksheet.G2 = { t: "n", v: 17 / 24, z: "hh:mm" };
    worksheet["!cols"] = [{ wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 40 }];
    const instructions = XLSX.utils.aoa_to_sheet([
      ["Shift Attendance Upload — Instructions"],
      ["Use employees.emp_id for Employee ID. Do not use the biometric device_user_id."],
      ["Date is the business shift-start date in Asia/Dubai, formatted YYYY-MM-DD."],
      ["Punch In and Punch Out are local 24-hour times (HH:MM). Overnight punch-out is assigned to the next calendar day."],
      ["OT is a non-negative whole number of minutes."],
      [`Allowed statuses: ${ATTENDANCE_STATUSES.join(", ")}.`],
      ["The example row is illustrative; replace PROJECT-CODE, SS00605 and D01 with valid values."],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
    XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");
    XLSX.writeFile(workbook, "shift-attendance-template.xlsx");
  };

  const validateFile = async () => {
    if (!selectedFile) {
      toast.error("Choose an Excel file first.");
      return;
    }
    setValidating(true);
    try {
      const parsedRows = await parseImportRows(selectedFile);
      if (!parsedRows.length) throw new Error("The worksheet does not contain attendance rows.");
      const projectCodes = Array.from(new Set(parsedRows.map((row) => row.projectCode).filter(Boolean)));
      const dateKeys = parsedRows.map((row) => row.attendanceDate).filter(validDate).sort();
      const employeeCodes = Array.from(new Set(parsedRows.map((row) => row.employeeCode).filter(Boolean)));
      const [attendanceResult, employeeResult] = await Promise.all([
        dateKeys.length && projectCodes.length && employeeCodes.length ? supabase.from("shift_timesheet")
          .select("project_code, employee_code, attendance_date, approval_status")
          .in("project_code", projectCodes)
          .in("employee_code", employeeCodes)
          .gte("attendance_date", dateKeys[0])
          .lte("attendance_date", dateKeys[dateKeys.length - 1])
          : Promise.resolve({ data: [], error: null }),
        employeeCodes.length
          ? supabase.from("employees")
            .select("id, emp_id, device_user_id, name, designation, emp_type, project, status")
            .in("emp_id", employeeCodes)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (attendanceResult.error) throw attendanceResult.error;
      if (employeeResult.error) throw employeeResult.error;
      const existing = new Map((attendanceResult.data ?? []).map((row) => [
        `${row.project_code}:${row.employee_code}:${row.attendance_date}`,
        row.approval_status,
      ]));
      const projectByCode = new Map(projects.map((project) => [project.project_code, project]));
      const employeeByCode = new Map(((employeeResult.data ?? []) as Employee[]).map((employee) => [employee.emp_id, employee]));
      const shiftByCode = new Map(shifts.map((shift) => [shift.shift_code, shift]));
      const mappingSet = new Set(mappings.filter((mapping) => mapping.active_yn.trim().toUpperCase() === "Y").map((mapping) => `${mapping.project_code}:${mapping.shift_code}`));
      const seen = new Set<string>();

      const nextPreview: PreviewRow[] = parsedRows.map((row) => {
        const errors: string[] = [];
        const warnings: string[] = [];
        const project = projectByCode.get(row.projectCode);
        const employee = employeeByCode.get(row.employeeCode);
        const shift = shiftByCode.get(row.shiftCode);
        if (!validDate(row.attendanceDate)) errors.push("Date must be a valid YYYY-MM-DD business date.");
        if (!project) errors.push("Project is missing or you do not have access to it.");
        if (!employee) errors.push("Employee ID was not found.");
        else if (project) {
          const employeeProject = employee.project?.trim().toLowerCase();
          if (!employeeProject || ![project.project_code, project.project_name ?? ""].some((value) => value.trim().toLowerCase() === employeeProject)) {
            errors.push("Employee does not belong to the selected project.");
          }
          if (employee.status && employee.status.trim().toLowerCase() !== "active") {
            warnings.push(`Employee status is ${employee.status}.`);
          }
        }
        if (!shift || shift.active_yn.trim().toUpperCase() !== "Y") errors.push("Shift is missing or inactive.");
        if (project && shift && !mappingSet.has(`${project.project_code}:${shift.shift_code}`)) errors.push("Shift is not actively mapped to the project.");
        if (!ATTENDANCE_STATUSES.includes(row.status as AttendanceStatus)) errors.push("Status is not supported.");
        const overtimeMinutes = parseMinutes(row.overtime);
        if (row.overtime && overtimeMinutes === null) errors.push("OT must be a non-negative whole number of minutes.");
        const present = row.status === "present" || row.status === "present with ot";
        if (present && (!row.punchIn || !row.punchOut)) errors.push("Punch In and Punch Out are required for present statuses.");
        if (row.punchIn && !/^\d{2}:\d{2}$/.test(row.punchIn)) errors.push("Punch In must use HH:MM.");
        if (row.punchOut && !/^\d{2}:\d{2}$/.test(row.punchOut)) errors.push("Punch Out must use HH:MM.");
        const key = `${row.projectCode}:${row.employeeCode}:${row.attendanceDate}`;
        if (row.projectCode && row.employeeCode && row.attendanceDate && seen.has(key)) errors.push("Duplicate row in this file.");
        seen.add(key);
        const existingStatus = existing.get(key);
        if (existingStatus) errors.push(`Attendance already exists (${existingStatus}); import does not overwrite existing records.`);

        let payload: Record<string, unknown> | undefined;
        if (!errors.length && project && employee && shift) {
          try {
            const schedule = scheduledTimestamps(row.attendanceDate, shift);
            const punchIn: string | null = row.punchIn ? timeOnDate(row.attendanceDate, row.punchIn) : null;
            let punchOut: string | null = row.punchOut ? timeOnDate(row.attendanceDate, row.punchOut) : null;
            if (punchIn && punchOut && punchOut < punchIn) {
              punchOut = timeOnDate(addDays(row.attendanceDate, 1), row.punchOut);
            }
            let breakMinutes = 0;
            let totalWorkingMinutes: number | null = null;
            if (punchIn && punchOut) {
              const totals = workingMinutes(punchIn, punchOut, shift.break_minutes);
              breakMinutes = totals.breakMinutes;
              totalWorkingMinutes = totals.total;
            }
            payload = {
              attendance_date: row.attendanceDate,
              project_code: row.projectCode,
              employee_code: employee.emp_id,
              roster_shift_code: row.shiftCode,
              actual_shift_code: row.shiftCode,
              scheduled_punch_in: schedule.start,
              scheduled_punch_out: schedule.end,
              punch_in: punchIn,
              punch_out: punchOut,
              default_ot_minutes: shift.default_ot_minutes,
              overtime_minutes: overtimeMinutes ?? shift.default_ot_minutes,
              break_minutes: breakMinutes,
              total_working_minutes: totalWorkingMinutes,
              status: row.status as AttendanceStatus,
              verify_type: "manual",
              machine: "manual",
              approval_status: "draft",
              remarks: row.remarks || null,
              created_by: user?.id ?? null,
              updated_by: user?.id ?? null,
            };
          } catch (error) {
            errors.push(errorMessage(error, "Unable to calculate attendance."));
          }
        }
        if (!row.overtime && shift) warnings.push(`OT defaults to ${shift.default_ot_minutes} minutes.`);
        return { ...row, employeeName: employee?.name ?? "", errors, warnings, payload };
      });
      setPreview(nextPreview);
    } catch (error) {
      toast.error(errorMessage(error, "Unable to read or validate the workbook."));
      setPreview([]);
    } finally {
      setValidating(false);
    }
  };

  const importRows = async () => {
    const validRows = preview.filter((row) => row.errors.length === 0 && row.payload);
    if (!validRows.length) {
      toast.error("There are no valid rows to import.");
      return;
    }
    const confirmed = window.confirm(`Import ${validRows.length} valid attendance row${validRows.length === 1 ? "" : "s"}? Invalid rows will be skipped.`);
    if (!confirmed) return;
    setImporting(true);
    try {
      const payload = validRows.map((row) => ({
        ...row.payload,
        updated_at: new Date().toISOString(),
      }));
      const { data, error } = await supabase.from("shift_timesheet").insert(payload).select("id");
      if (error) throw error;
      toast.success(`Imported ${data?.length ?? validRows.length} attendance record${validRows.length === 1 ? "" : "s"}.`);
      setPreview([]);
      setSelectedFile(null);
    } catch (error) {
      toast.error(errorMessage(error, "Import failed; no attendance rows were written."));
    } finally {
      setImporting(false);
    }
  };

  const validCount = preview.filter((row) => row.errors.length === 0 && row.payload).length;
  const invalidCount = preview.length - validCount;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-slate-900">Attendance upload</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">Upload is validated and previewed before inserting. Employee ID is `employees.emp_id`; punch times and dates are interpreted in Asia/Dubai.</p></div>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={downloadTemplate}>Download blank template</button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input className={fieldClass} type="file" accept=".xlsx,.xls" onChange={(event) => { setSelectedFile(event.target.files?.[0] ?? null); setPreview([]); }} />
          <button type="button" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!selectedFile || validating || importing} onClick={() => void validateFile()}>{validating ? "Validating…" : "Validate and preview"}</button>
          {selectedFile && <span className="text-sm text-slate-500">{selectedFile.name}</span>}
        </div>
        <p className="mt-3 text-xs text-slate-500">Required headers: Date, Project Code, Employee ID, Shift Code, Status, Punch In, Punch Out, OT, Remarks. OT is a non-negative whole number of minutes; blank OT uses the shift default.</p>
      </section>

      {preview.length > 0 && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div><h2 className="font-semibold text-slate-900">Import preview</h2><p className="text-sm text-slate-500">{validCount} valid · {invalidCount} invalid · {preview.reduce((total, row) => total + row.warnings.length, 0)} warnings</p></div>
          <button type="button" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!validCount || importing || validating} onClick={() => void importRows()}>{importing ? "Importing…" : `Import ${validCount} valid rows`}</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1300px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Row", "Date", "Project", "Employee", "Shift", "Status", "Punch In", "Punch Out", "OT (min)", "Validation result"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {preview.map((row) => <tr key={row.rowNumber} className={row.errors.length ? "bg-rose-50/40" : ""}>
                <td className="px-3 py-3">{row.rowNumber}</td>
                <td className="px-3 py-3">{row.attendanceDate || "—"}</td>
                <td className="px-3 py-3">{row.projectCode || "—"}</td>
                <td className="px-3 py-3">{row.employeeCode || "—"}<div className="text-xs text-slate-500">{row.employeeName}</div></td>
                <td className="px-3 py-3">{row.shiftCode || "—"}</td>
                <td className="px-3 py-3">{row.status || "—"}</td>
                <td className="px-3 py-3">{row.punchIn || "—"}</td>
                <td className="px-3 py-3">{row.punchOut || "—"}</td>
                <td className="px-3 py-3">{row.overtime || "default"}</td>
                <td className="max-w-[28rem] px-3 py-3">
                  {row.errors.length > 0 ? <ul className="list-inside list-disc text-xs text-rose-700">{row.errors.map((error) => <li key={error}>{error}</li>)}</ul> : <span className="text-xs font-medium text-emerald-700">Valid</span>}
                  {row.warnings.map((warning) => <div key={warning} className="mt-1 text-xs text-amber-700">Warning: {warning}</div>)}
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>}
    </div>
  );
}
