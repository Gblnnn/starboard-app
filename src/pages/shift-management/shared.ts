import { supabase } from "@/lib/supabase";

export type ShiftType = "DAY" | "NIGHT";
export type AttendanceStatus = "present" | "present with ot" | "absent" | "weekend" | "holiday";
export type ApprovalStatus = "draft" | "submitted" | "approved" | "rejected";

export interface Project {
  project_code: string;
  project_name: string | null;
  focal_point_id: string | null;
  approver_id: string | null;
}

export interface Shift {
  id: number;
  shift_code: string;
  shift_name: string;
  punch_in: string;
  punch_out: string;
  default_ot_minutes: number;
  break_minutes: number;
  shift_type: ShiftType;
  active_yn: string;
}

export interface Employee {
  id: number;
  emp_id: string;
  device_user_id: string | null;
  name: string;
  designation: string | null;
  emp_type: string | null;
  project: string | null;
  status: string | null;
}

export interface RosterRow {
  id: number;
  project_code: string;
  employee_code: string;
  shift_code: string;
  roster_date: string;
  created_by?: string | null;
}

export interface AttendanceRow {
  id: number;
  attendance_date: string;
  project_code: string;
  employee_code: string;
  roster_shift_code: string;
  actual_shift_code: string;
  scheduled_punch_in: string | null;
  scheduled_punch_out: string | null;
  punch_in: string | null;
  punch_out: string | null;
  default_ot_minutes: number;
  overtime_minutes: number;
  break_minutes: number;
  total_working_minutes: number | null;
  status: AttendanceStatus;
  verify_type: string;
  machine: string;
  attested_by: string | null;
  attested_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  approval_status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  remarks: string | null;
}

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "present",
  "present with ot",
  "absent",
  "weekend",
  "holiday",
];

export const APPROVAL_STATUSES: ApprovalStatus[] = ["draft", "submitted", "approved", "rejected"];
export const BUSINESS_TIME_ZONE = "Asia/Dubai";

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function isAdminRole(role?: string | null): boolean {
  return role?.trim().toLowerCase() === "admin";
}

export function projectAccess(project: Project, empId: string | null, isAdmin: boolean): boolean {
  return isAdmin || Boolean(empId && (
    String(project.focal_point_id ?? "").trim() === empId ||
    String(project.approver_id ?? "").trim() === empId
  ));
}

export function timeOfDay(value: string): string {
  return value.slice(0, 5);
}

export function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const minutes = Math.max(0, Math.trunc(value));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function minutesBetween(start: string, end: string): number {
  const duration = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(duration)) throw new Error("Enter valid punch-in and punch-out times.");
  const minutes = Math.floor(duration / 60000);
  if (minutes < 0) throw new Error("Punch-out must be after punch-in.");
  return minutes;
}

export function effectiveBreak(actualDurationMinutes: number, configuredBreakMinutes: number): number {
  if (actualDurationMinutes <= 360) return 0;
  if (configuredBreakMinutes > actualDurationMinutes) {
    throw new Error("Break time cannot be greater than the actual worked duration.");
  }
  return configuredBreakMinutes;
}

export function workingMinutes(punchIn: string, punchOut: string, configuredBreakMinutes: number): {
  elapsed: number;
  breakMinutes: number;
  total: number;
} {
  const elapsed = minutesBetween(punchIn, punchOut);
  const breakMinutes = effectiveBreak(elapsed, configuredBreakMinutes);
  return { elapsed, breakMinutes, total: elapsed - breakMinutes };
}

export function scheduledTimestamps(date: string, shift: Shift): { start: string; end: string } {
  if (!validDate(date)) throw new Error("Select a valid attendance date.");
  const startTime = timeOfDay(shift.punch_in);
  const endTime = timeOfDay(shift.punch_out);
  const nextDate = shift.punch_out < shift.punch_in ? addDays(date, 1) : date;
  return {
    start: `${date}T${startTime}:00+04:00`,
    end: `${nextDate}T${endTime}:00+04:00`,
  };
}

export function addDays(date: string, amount: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + amount));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`;
}

export function dateTimeInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
}

export function fromDateTimeInput(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Enter a valid punch date and time.");
  return `${value}:00+04:00`;
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export async function fetchAccessibleProjects(empId: string | null, isAdmin: boolean): Promise<Project[]> {
  const columns = "project_code, project_name, focal_point_id, approver_id";
  if (isAdmin) {
    const { data, error } = await supabase.from("projects").select(columns).order("project_code");
    if (error) throw error;
    return (data ?? []) as Project[];
  }
  if (!empId) return [];

  const [focalResult, approverResult] = await Promise.all([
    supabase.from("projects").select(columns).eq("focal_point_id", empId),
    supabase.from("projects").select(columns).eq("approver_id", empId),
  ]);
  if (focalResult.error) throw focalResult.error;
  if (approverResult.error) throw approverResult.error;
  const unique = new Map<string, Project>();
  for (const project of [...(focalResult.data ?? []), ...(approverResult.data ?? [])] as Project[]) {
    unique.set(project.project_code, project);
  }
  return Array.from(unique.values()).sort((left, right) => left.project_code.localeCompare(right.project_code));
}

export function filterMappedProjects(projects: Project[], mappedProjectCodes: Iterable<string>): Project[] {
  const mappedCodes = new Set(mappedProjectCodes);
  return projects.filter((project) => mappedCodes.has(project.project_code));
}

export function projectDisplay(project: Project): string {
  return project.project_name
    ? `${project.project_code} — ${project.project_name}`
    : project.project_code;
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function employeeBelongsToProject(employee: Employee, project: Project): boolean {
  const employeeProject = employee.project?.trim().toLowerCase();
  return Boolean(employeeProject && [
    project.project_code,
    project.project_name ?? "",
  ].some((value) => value.trim().toLowerCase() === employeeProject));
}
