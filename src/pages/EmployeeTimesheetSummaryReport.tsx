import Back from '@/components/back';
import { useAuth } from '@/components/AuthProvider';
import { DatePicker } from '@/components/date-picker';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Download, FileBarChart2, Loader2, Printer, RefreshCw, Search, Settings2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

type SummaryRow = {
  company_name: string | null;
  emp_id: string | number | null;
  name: string | null;
  nationality: string | null;
  emp_type: string | null;  
  employee_status: string | null;
  date: string | null;
  punch_in: string | null;
  punch_out: string | null;
  overtime: number | string | null;
  break_hours: number | string | null;
  break_hour?: number | string | null;
  project_code: string | null;
  timesheet_status: string | null;
  timecard_status: string | null;
  remarks: string | null;
  total_working_hours: number | string | null;
  weekend_ot_minutes: number | string | null;  
};

type DisplayRow = SummaryRow & {
  displayDate: string;
  dateKey: string;
  displayPunchIn: string;
  displayPunchOut: string;
  displayOvertime: string;
  displayHolidayOvertime: string;
  displayBreakHours: string;
  displayHours: string;
};

type FilterOptions = {
  companies: string[];
  projects: string[];
//  employees: string[];
  statuses: string[];
};

type EmployeeOption = {
  name: string;
  empId: string;
  company: string | null;
};

type MonthlyPrintProjectOption = {
  code: string;
  name: string;
};

type MonthlyPrintCompanyOption = {
  code: string;
  name: string;
};

const PAGE_SIZE = 100;
const PRINT_ROWS_PER_PAGE = 32;
const columns = [
  { key: 'serialNumber', label: 'S.No.' },
  { key: 'company_name', label: 'Company' },
  { key: 'emp_id', label: 'Employee ID' },
  { key: 'name', label: 'Name' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'displayDate', label: 'Date' },
  { key: 'displayPunchIn', label: 'Punch In' },
  { key: 'displayPunchOut', label: 'Punch Out' },
  { key: 'displayOvertime', label: 'OT' },
  { key: 'displayHolidayOvertime', label: 'Holiday OT' },
  { key: 'displayBreakHours', label: 'Break Hours' },
  { key: 'displayHours', label: 'Total Hours' },
  { key: 'project_code', label: 'Project' },
  { key: 'timesheet_status', label: 'Timesheet Status' },
  { key: 'timecard_status', label: 'Timecard Status' },
  { key: 'remarks', label: 'Remarks' },
] as const;
type ColumnKey = typeof columns[number]['key'];
type SortableColumnKey = Exclude<ColumnKey, 'serialNumber'>;
const defaultVisibleColumns: Record<ColumnKey, boolean> = Object.fromEntries(columns.map(({ key }) => [key, [
  'serialNumber', 'emp_id', 'name', 'displayDate', 'displayPunchIn', 'displayPunchOut',
  'displayOvertime', 'displayHolidayOvertime', 'displayBreakHours', 'displayHours', 'project_code', 'remarks',
].includes(key)])) as Record<ColumnKey, boolean>;
const leftAlignedColumns = new Set<ColumnKey>(['company_name', 'name', 'timesheet_status', 'timecard_status', 'remarks']);

function formatDate(value: string | null): string {
  if (!value) return '';
  const datePart = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (datePart) {
    const [year, month, day] = datePart.split('-');
    return `${day}-${month}-${year}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Dubai',
  }).format(parsed).replace(/\//g, '-');
}

function dateKey(value: string | null): string {
  if (!value) return '';
  const datePart = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (datePart) return datePart;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(parsed);
}

function dayOfWeek(value: string | null): string {
  const key = dateKey(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '';
  const date = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date);
}

function formatTime(value: string | null): string {
  if (!value) return '';
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function minutesToTime(value: string | number | null): string {
  if (value === null || value === undefined || value === '') return '';
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return String(value);
  const totalMinutes = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function decimalHoursToTime(value: number | string | null): string {
  if (value === null || value === undefined || value === '') return '';
  const hours = Number(value);
  if (!Number.isFinite(hours)) return formatTime(String(value));
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function breakHoursToTime(value: number | string | null): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' && value.includes(':')) return formatTime(value);

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);
  if (numericValue > 24) return minutesToTime(numericValue);
  return decimalHoursToTime(numericValue);
}

function toDisplayRow(row: SummaryRow): DisplayRow {
  return {
    ...row,
    displayDate: formatDate(row.date),
    dateKey: dateKey(row.date),
    displayPunchIn: formatTime(row.punch_in),
    displayPunchOut: formatTime(row.punch_out),
    displayOvertime: minutesToTime(row.overtime),
    displayHolidayOvertime: minutesToTime(row.weekend_ot_minutes),
    displayBreakHours: breakHoursToTime(row.break_hours ?? row.break_hour ?? null),
    displayHours: decimalHoursToTime(row.total_working_hours),
  };
}

function columnValue(row: DisplayRow, key: ColumnKey, serialNumber?: number): string {
  if (key === 'serialNumber') return serialNumber === undefined ? '' : String(serialNumber);
  return String(row[key] ?? '');
}

function totalMinutes(rows: DisplayRow[], key: 'displayOvertime' | 'displayHolidayOvertime' | 'displayHours'): number {
  return rows.reduce((total, row) => {
    const [hours, minutes] = row[key].split(':').map(Number);
    return total + (Number.isFinite(hours) ? hours * 60 + (Number.isFinite(minutes) ? minutes : 0) : 0);
  }, 0);
}

function reportTotals(rows: DisplayRow[]): Pick<DisplayRow, 'displayOvertime' | 'displayHolidayOvertime' | 'displayHours'> {
  return {
    displayOvertime: minutesToTime(totalMinutes(rows, 'displayOvertime')),
    displayHolidayOvertime: minutesToTime(totalMinutes(rows, 'displayHolidayOvertime')),
    displayHours: minutesToTime(totalMinutes(rows, 'displayHours')),
  };
}

function totalRowValue(totals: ReturnType<typeof reportTotals>, key: ColumnKey): string {
  if (key === 'serialNumber') return 'Total';
  if (key === 'displayOvertime' || key === 'displayHolidayOvertime' || key === 'displayHours') return totals[key];
  return '';
}

function excelRows(rows: DisplayRow[], visibleColumns: Record<ColumnKey, boolean>) {
  const dataRows = rows.map((row, index) => Object.fromEntries(
    columns.filter(({ key }) => visibleColumns[key]).map(({ key, label }) => [label, columnValue(row, key, index + 1)]),
  ));
  const totals = reportTotals(rows);
  dataRows.push(Object.fromEntries(
    columns.filter(({ key }) => visibleColumns[key]).map(({ key, label }) => [label, totalRowValue(totals, key)]),
  ));
  return dataRows;
}

function SearchableSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filteredOptions = options.filter((option) => option.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((current) => !current)} className="inline-flex h-8 min-w-[145px] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-xs text-slate-700">
        <span className="truncate">{value || `All ${label}`}</span><ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-30 w-60 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <div className="flex items-center gap-1 rounded border border-slate-200 px-2"><Search className="h-3 w-3 text-slate-400" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}...`} className="h-7 w-full text-xs outline-none" /><button type="button" onClick={() => setQuery('')}><X className="h-3 w-3 text-slate-400" /></button></div>
          <div className="mt-1 max-h-48 overflow-y-auto">
            <button type="button" onClick={() => { onChange(''); setOpen(false); setQuery(''); }} className={`w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50 ${!value ? 'font-semibold text-teal-700' : ''}`}>All {label}</button>
            {filteredOptions.map((option) => <button key={option} type="button" onClick={() => { onChange(option); setOpen(false); setQuery(''); }} className={`w-full truncate rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50 ${value === option ? 'font-semibold text-teal-700' : ''}`}>{option}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchableEmployeeSelect({ employees, value, onChange, disabled, className = '' }: {
  employees: EmployeeOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedEmployee = employees.find((employee) => employee.empId === value);
  const filteredEmployees = employees.filter((employee) =>
    `${employee.empId} ${employee.name}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const selectEmployee = (empId: string) => {
    onChange(empId);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => { setOpen((current) => !current); setQuery(''); }}
        className="inline-flex h-9 w-full min-w-56 items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 disabled:bg-slate-100"
      >
        <span className="truncate">{selectedEmployee ? `${selectedEmployee.name} [${selectedEmployee.empId}]` : value === 'ALL' ? 'All employees' : 'Select an employee'}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-50 w-full min-w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <div className="flex items-center gap-1 rounded border border-slate-200 px-2">
            <Search className="h-3 w-3 shrink-0 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or employee ID..."
              aria-label="Search employees by name or employee ID"
              className="h-8 w-full text-xs outline-none"
            />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear employee search"><X className="h-3 w-3 text-slate-400" /></button>}
          </div>
          <div className="mt-1 max-h-48 overflow-y-auto" role="listbox">
            <button type="button" role="option" aria-selected={value === 'ALL'} onClick={() => selectEmployee('ALL')} className={`w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50 ${value === 'ALL' ? 'font-semibold text-teal-700' : ''}`}>All employees</button>
            {filteredEmployees.map((employee) => (
              <button
                key={employee.empId}
                type="button"
                role="option"
                aria-selected={value === employee.empId}
                onClick={() => selectEmployee(employee.empId)}
                className={`w-full truncate rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50 ${value === employee.empId ? 'font-semibold text-teal-700' : ''}`}
              >
                {employee.name} [{employee.empId}]
              </button>
            ))}
            {!filteredEmployees.length && <p className="px-2 py-2 text-xs text-slate-400">No matching employees.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmployeeTimesheetSummaryReport({ embedMode = false, timesheetPrintMode = false }: { embedMode?: boolean; timesheetPrintMode?: boolean } = {}) {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [calendarMode, setCalendarMode] = useState<'day' | 'month'>('day');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [companyFilter, setCompanyFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [visibleColumns, setVisibleColumns] = useState(defaultVisibleColumns);
  const [hasMore, setHasMore] = useState(true);
  const [loadingAll, setLoadingAll] = useState(false);  
  const [monthlyPrintOpen, setMonthlyPrintOpen] = useState(false);
  const [monthlyPrintCompany, setMonthlyPrintCompany] = useState('');
  const [monthlyPrintProject, setMonthlyPrintProject] = useState('');
  const [monthlyPrintEmployeeId, setMonthlyPrintEmployeeId] = useState('ALL');
  const [monthlyPrintMonth, setMonthlyPrintMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [monthlyPrintLoading, setMonthlyPrintLoading] = useState(false);
  const [monthlyPrintOptionsLoading, setMonthlyPrintOptionsLoading] = useState(false);
  const [monthlyPrintProjects, setMonthlyPrintProjects] = useState<MonthlyPrintProjectOption[]>([]);
  const [monthlyPrintCompanies, setMonthlyPrintCompanies] = useState<MonthlyPrintCompanyOption[]>([]);
  const [monthlyPrintProjectEmployeeIds, setMonthlyPrintProjectEmployeeIds] = useState<string[]>([]);
  const [monthlyPrintEmployeesLoading, setMonthlyPrintEmployeesLoading] = useState(false);
  const [monthlyPrintData, setMonthlyPrintData] = useState<{ month: string; sheets: Array<{ employee: EmployeeOption; rows: DisplayRow[] }> } | null>(null);
  const [assignedPrintProjects, setAssignedPrintProjects] = useState<MonthlyPrintProjectOption[]>([]);
  const [assignedPrintProjectsLoading, setAssignedPrintProjectsLoading] = useState(false);
  const [assignedPrintProject, setAssignedPrintProject] = useState('');
  const [assignedPrintMonth, setAssignedPrintMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [assignedPrintEmployeeId, setAssignedPrintEmployeeId] = useState('ALL');
  const [assignedPrintEmployees, setAssignedPrintEmployees] = useState<EmployeeOption[]>([]);
  const [assignedPrintEmployeesLoading, setAssignedPrintEmployeesLoading] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortableColumnKey | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ companies: [], projects: [], statuses: [] });  
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const reportRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const assignedPrintRequestIdRef = useRef(0);

  useEffect(() => {
    if (!monthlyPrintData || timesheetPrintMode) return;
    const handleAfterPrint = () => {
      document.body.classList.remove('employee-monthly-timesheet-print');
      setMonthlyPrintData(null);
    };
    document.body.classList.add('employee-monthly-timesheet-print');
    window.addEventListener('afterprint', handleAfterPrint);
    const printTimeout = window.setTimeout(() => window.print(), 100);
    return () => {
      window.clearTimeout(printTimeout);
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('employee-monthly-timesheet-print');
    };
  }, [monthlyPrintData, timesheetPrintMode]);

  useEffect(() => {
    if (!timesheetPrintMode) return;
    const empId = userData?.emp_id ? String(userData.emp_id) : '';
    setAssignedPrintProjects([]);
    setAssignedPrintProject('');
    setAssignedPrintProjectsLoading(false);
    assignedPrintRequestIdRef.current += 1;
    setMonthlyPrintLoading(false);
    setMonthlyPrintData(null);
    if (!empId) return;

    let cancelled = false;
    const loadAssignedProjects = async () => {
      setAssignedPrintProjectsLoading(true);
      try {
        const [focalResult, approverResult] = await Promise.all([
          supabase.from('projects').select('project_code, project_name').eq('focal_point_id', empId),
          supabase.from('projects').select('project_code, project_name').eq('approver_id', empId),
        ]);
        if (focalResult.error) throw focalResult.error;
        if (approverResult.error) throw approverResult.error;
        if (cancelled) return;
        const projectMap = new Map<string, MonthlyPrintProjectOption>();
        [...(focalResult.data || []), ...(approverResult.data || [])].forEach((project) => {
          const code = String(project.project_code || '');
          if (code) projectMap.set(code, { code, name: String(project.project_name || '') });
        });
        setAssignedPrintProjects(Array.from(projectMap.values()).sort((left, right) => left.code.localeCompare(right.code)));
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'Unable to load assigned projects.');
      } finally {
        if (!cancelled) setAssignedPrintProjectsLoading(false);
      }
    };
    void loadAssignedProjects();
    return () => { cancelled = true; };
  }, [timesheetPrintMode, userData?.emp_id]);

  useEffect(() => {
    setAssignedPrintEmployees([]);
    setAssignedPrintEmployeeId('ALL');
    setAssignedPrintEmployeesLoading(false);
    assignedPrintRequestIdRef.current += 1;
    setMonthlyPrintData(null);
    if (!timesheetPrintMode || !assignedPrintProject) return;

    let cancelled = false;
    const loadAssignedProjectEmployees = async () => {
      setAssignedPrintEmployeesLoading(true);
      try {
        let offset = 0;
        let pageRows: Array<{ emp_id: string | number | null; name: string | null; company_name: string | null }>;
        const employees = new Map<string, EmployeeOption>();
        do {
          const { data, error } = await supabase
            .from('v_employee_timesheet_summary')
            .select('emp_id, name, company_name')
            .eq('project_code', assignedPrintProject)
            .order('emp_id', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
          if (error) throw error;
          pageRows = (data || []) as typeof pageRows;
          pageRows.forEach((row) => {
            if (row.emp_id === null || row.emp_id === undefined) return;
            const empId = String(row.emp_id);
            if (!employees.has(empId)) {
              employees.set(empId, { empId, name: row.name || empId, company: row.company_name });
            }
          });
          offset += PAGE_SIZE;
        } while (pageRows.length === PAGE_SIZE);
        if (!cancelled) setAssignedPrintEmployees(Array.from(employees.values()).sort((left, right) => left.name.localeCompare(right.name)));
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'Unable to load employees for this project.');
      } finally {
        if (!cancelled) setAssignedPrintEmployeesLoading(false);
      }
    };
    void loadAssignedProjectEmployees();
    return () => { cancelled = true; };
  }, [assignedPrintProject, timesheetPrintMode]);

  useEffect(() => {
    if (!monthlyPrintOpen) return;
    let cancelled = false;
    const loadMonthlyPrintOptions = async () => {
      setMonthlyPrintOptionsLoading(true);
      try {
        const [projectsResult, companiesResult] = await Promise.all([
          supabase.from('projects').select('project_code, project_name').eq('Active_YN', 'Yes').order('project_code'),
          supabase.from('company_master').select('alfa_code, company_name').order('company_name'),
        ]);
        if (projectsResult.error) throw projectsResult.error;
        if (companiesResult.error) throw companiesResult.error;
        if (cancelled) return;
        setMonthlyPrintProjects((projectsResult.data || []).map((project) => ({
          code: String(project.project_code || ''),
          name: String(project.project_name || ''),
        })).filter((project) => project.code));
        setMonthlyPrintCompanies((companiesResult.data || []).map((company) => ({
          code: String(company.alfa_code || ''),
          name: String(company.company_name || ''),
        })).filter((company) => company.name));
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'Unable to load project and company options.');
      } finally {
        if (!cancelled) setMonthlyPrintOptionsLoading(false);
      }
    };
    void loadMonthlyPrintOptions();
    return () => { cancelled = true; };
  }, [monthlyPrintOpen]);

  useEffect(() => {
    setMonthlyPrintProjectEmployeeIds([]);
    setMonthlyPrintEmployeesLoading(false);
    if (!monthlyPrintOpen || (!monthlyPrintProject && !monthlyPrintCompany)) return;

    let cancelled = false;
    const loadProjectEmployees = async () => {
      setMonthlyPrintEmployeesLoading(true);
      try {
        let offset = 0;
        let pageRows: Array<{ emp_id: string | number | null }>;
        const employeeIds = new Set<string>();
        do {
          let query = supabase
            .from('v_employee_timesheet_summary')
            .select('emp_id');
          if (monthlyPrintProject) query = query.eq('project_code', monthlyPrintProject);
          else if (monthlyPrintCompany) query = query.eq('company_name', monthlyPrintCompany);
          const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
          if (error) throw error;
          pageRows = (data || []) as Array<{ emp_id: string | number | null }>;
          pageRows.forEach((row) => {
            if (row.emp_id !== null && row.emp_id !== undefined) employeeIds.add(String(row.emp_id));
          });
          offset += PAGE_SIZE;
        } while (pageRows.length === PAGE_SIZE);
        if (!cancelled) setMonthlyPrintProjectEmployeeIds(Array.from(employeeIds));
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'Unable to load project employees.');
      } finally {
        if (!cancelled) setMonthlyPrintEmployeesLoading(false);
      }
    };

    void loadProjectEmployees();
    return () => { cancelled = true; };
  }, [monthlyPrintCompany, monthlyPrintOpen, monthlyPrintProject]);

  const canViewReport = useMemo(() => {
    if (userData?.role === 'admin' || userData?.role === 'site_admin') return true;
    try {
      const permissions = JSON.parse(userData?.clearance || '{}') as Record<string, boolean>;
      return permissions.timesheet_summary_report === true;
    } catch {
      return false;
    }
  }, [userData]);

  useEffect(() => {
    if (!timesheetPrintMode && userData && !canViewReport) navigate('/attendance', { replace: true });
  }, [canViewReport, navigate, timesheetPrintMode, userData]);

  const fetchRows = useCallback(async (reset = true, offset = 0) => {
  const requestId = ++requestIdRef.current;    
    setLoading(true);
    try {
      let startDate = dateFilter;
      let endDate = dateFilter;
      if (!startDate && monthFilter) {
        const [year, month] = monthFilter.split('-').map(Number);
        startDate = `${monthFilter}-01`;
        const nextMonth = new Date(Date.UTC(year, month, 1));
        endDate = nextMonth.toISOString().slice(0, 10);      
      } else if (startDate) {
        const nextDate = new Date(`${startDate}T00:00:00Z`);
        nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        endDate = nextDate.toISOString().slice(0, 10);
      }

      const pageOffset = reset ? 0 : offset;
      let query = supabase.from('v_employee_timesheet_summary').select('*').order('date', { ascending: false }).range(pageOffset, pageOffset + PAGE_SIZE - 1);
      if (startDate && endDate) {
        query = query.gte('date', `${startDate}T00:00:00Z`).lt('date', `${endDate}T00:00:00Z`);
      }
      if (companyFilter) query = query.eq('company_name', companyFilter);
      if (projectFilter) query = query.eq('project_code', projectFilter);
      if (employeeFilter) query = query.eq('name', employeeFilter);
      if (statusFilter !== 'ALL') query = query.eq('timecard_status', statusFilter);      
      const { data, error } = await query;
      if (error) throw error;
      if (requestId !== requestIdRef.current) return;      
      const nextRows = (data || []).map((row) => toDisplayRow(row as SummaryRow));
        setFilterOptions((current) => ({
        companies: Array.from(new Set([...current.companies, ...nextRows.map((row) => row.company_name).filter(Boolean) as string[]])).sort(),
        projects: Array.from(new Set([...current.projects, ...nextRows.map((row) => row.project_code).filter(Boolean) as string[]])).sort(),
//        employees: current.employees,
        statuses: Array.from(new Set([...current.statuses, ...nextRows.map((row) => row.timecard_status).filter(Boolean) as string[]])).sort(),
      }));      
      setRows((current) => reset ? nextRows : [...current, ...nextRows]);
      setHasMore(nextRows.length === PAGE_SIZE);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;      
      toast.error(error instanceof Error ? error.message : 'Unable to load the timesheet summary.');
      if (reset) setRows([]);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);      
    }
    }, [companyFilter, dateFilter, employeeFilter, monthFilter, projectFilter, statusFilter]);

  const fetchFilterOptions = useCallback(async () => {
    try {
      let offset = 0;
      const options: FilterOptions = { companies: [], projects: [], statuses: [] };
      let page: Array<Pick<SummaryRow, 'company_name' | 'project_code' | 'name' | 'timecard_status'>>;

      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select('name, emp_id, company')
        .not('name', 'is', null)
        .order('name');
      if (employeeError) throw employeeError;
      const employees = (employeeData || [])
        .filter((employee) => employee.name)
        .map((employee) => ({
          name: employee.name as string,
          empId: String(employee.emp_id || ''),
          company: employee.company as string | null,
        }));
//      options.employees = employees;
      setEmployeeOptions(employees.sort((left, right) => left.name.localeCompare(right.name)));

      do {
        const { data, error } = await supabase
          .from('v_employee_timesheet_summary')
          .select('company_name, project_code, name, timecard_status')
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;

        page = (data || []) as Array<Pick<SummaryRow, 'company_name' | 'project_code' | 'name' | 'timecard_status'>>;
        options.companies.push(...page.map((row) => row.company_name).filter(Boolean) as string[]);
        options.projects.push(...page.map((row) => row.project_code).filter(Boolean) as string[]);
        options.statuses.push(...page.map((row) => row.timecard_status).filter(Boolean) as string[]);
        offset += PAGE_SIZE;
      } while (page.length === PAGE_SIZE);

      setFilterOptions({
        companies: Array.from(new Set(options.companies)).sort(),
        projects: Array.from(new Set(options.projects)).sort(),
        // employees: Array.from(new Set(options.employees)).sort(),
        statuses: Array.from(new Set(options.statuses)).sort(),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load report filter options.');
    }
  }, []);  
  const loadAllRows = useCallback(async () => {
    const requestId = ++requestIdRef.current;    
    setLoadingAll(true);
    setLoading(true);
    try {
      let offset = 0;
      const allRows: DisplayRow[] = [];
      let pageRows: DisplayRow[];

      do {
        let startDate = dateFilter;
        let endDate = dateFilter;
        if (!startDate && monthFilter) {
          const [year, month] = monthFilter.split('-').map(Number);
          startDate = `${monthFilter}-01`;
          endDate = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
        } else if (startDate) {
          const nextDate = new Date(`${startDate}T00:00:00Z`);
          nextDate.setUTCDate(nextDate.getUTCDate() + 1);
          endDate = nextDate.toISOString().slice(0, 10);
        }

        let query = supabase.from('v_employee_timesheet_summary').select('*').order('date', { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
        if (startDate && endDate) query = query.gte('date', `${startDate}T00:00:00Z`).lt('date', `${endDate}T00:00:00Z`);
        if (companyFilter) query = query.eq('company_name', companyFilter);
        if (projectFilter) query = query.eq('project_code', projectFilter);
        if (employeeFilter) query = query.eq('name', employeeFilter);
        if (statusFilter !== 'ALL') query = query.eq('timecard_status', statusFilter);       
        const { data, error } = await query;
        if (error) throw error;
        if (requestId !== requestIdRef.current) return;
        
        pageRows = (data || []).map((row) => toDisplayRow(row as SummaryRow));
        setFilterOptions((current) => ({
          companies: Array.from(new Set([...current.companies, ...pageRows.map((row) => row.company_name).filter(Boolean) as string[]])).sort(),
          projects: Array.from(new Set([...current.projects, ...pageRows.map((row) => row.project_code).filter(Boolean) as string[]])).sort(),
          // employees: Array.from(new Set([...current.employees, ...pageRows.map((row) => row.name).filter(Boolean) as string[]])).sort(),
          statuses: Array.from(new Set([...current.statuses, ...pageRows.map((row) => row.timecard_status).filter(Boolean) as string[]])).sort(),
        }));      
        allRows.push(...pageRows);
        offset += PAGE_SIZE;
      } while (pageRows.length === PAGE_SIZE);

      setRows(allRows);
      setHasMore(false);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      toast.error(error instanceof Error ? error.message : 'Unable to load the full timesheet summary.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingAll(false);
      }
    }
  }, [companyFilter, dateFilter, employeeFilter, monthFilter, projectFilter, statusFilter]);

  useEffect(() => {
    if (!timesheetPrintMode && userData?.email && canViewReport) {
      setRows([]);
      void fetchRows();
    }
  }, [canViewReport, fetchRows, timesheetPrintMode, userData?.email]);

  useEffect(() => {
    if (!timesheetPrintMode && userData?.email && canViewReport) void fetchFilterOptions();
  }, [canViewReport, fetchFilterOptions, timesheetPrintMode, userData?.email]);

  const companyEmployeeOptions = useMemo(
    () => employeeOptions
      .filter((employee) => !companyFilter || employee.company === companyFilter)
      .filter((employee, index, allEmployees) => allEmployees.findIndex((item) => item.name === employee.name) === index),
    [companyFilter, employeeOptions],
  );

  useEffect(() => {
    if (employeeFilter && !companyEmployeeOptions.some((employee) => employee.name === employeeFilter)) {
      setEmployeeFilter('');
    }
  }, [companyEmployeeOptions, employeeFilter]);
  
  //const companies = useMemo(() => Array.from(new Set(rows.map((row) => row.company_name).filter(Boolean) as string[])).sort(), [rows]);
  //const projects = useMemo(() => Array.from(new Set(rows.map((row) => row.project_code).filter(Boolean) as string[])).sort(), [rows]);
  //const employees = useMemo(() => Array.from(new Set(rows.map((row) => row.name).filter(Boolean) as string[])).sort(), [rows]);
  //const statuses = useMemo(() => Array.from(new Set(rows.map((row) => row.timecard_status).filter(Boolean) as string[])).sort(), [rows]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matchingRows = rows.filter((row) => {
      const matchesSearch = !query || [row.company_name, row.emp_id, row.name, row.project_code, row.remarks]
        .some((value) => String(value || '').toLowerCase().includes(query));
      const matchesDate = !dateFilter && !monthFilter || (dateFilter ? row.dateKey === dateFilter : row.dateKey.startsWith(monthFilter));
      //const matchesCompany = !companyFilter || row.company_name === companyFilter;
      //const matchesProject = !projectFilter || row.project_code === projectFilter;
      //const matchesEmployee = !employeeFilter || row.name === employeeFilter;
      //const matchesStatus = statusFilter === 'ALL' || row.timecard_status === statusFilter;
      //return matchesSearch && matchesDate && matchesCompany && matchesProject && matchesEmployee && matchesStatus;
      return matchesSearch && matchesDate;
    });
//  }, [companyFilter, dateFilter, employeeFilter, monthFilter, projectFilter, rows, search, statusFilter]);
    if (!sortColumn) return matchingRows;

    return [...matchingRows].sort((left, right) => {
      const leftValue = sortColumn === 'displayDate' ? left.dateKey : String(left[sortColumn] ?? '');
      const rightValue = sortColumn === 'displayDate' ? right.dateKey : String(right[sortColumn] ?? '');
      const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [companyFilter, dateFilter, employeeFilter, monthFilter, projectFilter, rows, search, sortColumn, sortDirection, statusFilter]);

  const selectedEmployee = useMemo(() => {
    if (!employeeFilter) return null;
    const employeeOption = employeeOptions.find((employee) => employee.name === employeeFilter);
    const employeeRow = rows.find((row) => row.name === employeeFilter && row.emp_id);
    return {
      name: employeeFilter,
      empId: employeeOption?.empId || (employeeRow?.emp_id ? String(employeeRow.emp_id) : ''),
      companyName: employeeRow?.company_name || '',
    };
  }, [employeeFilter, employeeOptions, rows]);
  const selectedEmployeeLabel = selectedEmployee
    ? `${selectedEmployee.name}${selectedEmployee.empId ? ` [${selectedEmployee.empId}]` : ''}${selectedEmployee.companyName ? ` [${selectedEmployee.companyName}]` : ''}`
    : '';
  const monthlyPrintEmployeeOptions = useMemo(
    () => !monthlyPrintProject && !monthlyPrintCompany
      ? employeeOptions
      : employeeOptions.filter((employee) => monthlyPrintProjectEmployeeIds.includes(employee.empId)),
    [employeeOptions, monthlyPrintCompany, monthlyPrintProject, monthlyPrintProjectEmployeeIds],
  );
  const totals = reportTotals(filteredRows);
  const printPaddingCount = (PRINT_ROWS_PER_PAGE - ((filteredRows.length + 1) % PRINT_ROWS_PER_PAGE)) % PRINT_ROWS_PER_PAGE;

  const toggleSort = (key: ColumnKey) => {
    if (key === 'serialNumber') return;
    const sortableKey = key as SortableColumnKey;
    if (sortColumn === sortableKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(sortableKey);
      setSortDirection('asc');
    }
  };

  const sortIcon = (key: ColumnKey) => {
    if (key === 'serialNumber') return null;
    if (sortColumn !== key) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };    

  const downloadExcel = () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelRows(filteredRows, visibleColumns));
    worksheet['!cols'] = columns.filter(({ key }) => visibleColumns[key]).map(({ label }) => ({ wch: Math.max(label.length + 2, 15) }));
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Timesheet Summary');
    XLSX.writeFile(workbook, `employee_timesheet_summary_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  const printEmployeeMonth = async () => {
    if (!monthlyPrintMonth) {
      toast.error('Select a month to print.');
      return;
    }
    setMonthlyPrintLoading(true);
    try {
      const [year, month] = monthlyPrintMonth.split('-').map(Number);
      const startDate = `${monthlyPrintMonth}-01`;
      const endDate = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
      let offset = 0;
      const monthRows: DisplayRow[] = [];
      let pageRows: SummaryRow[];
      do {
        let query = supabase
          .from('v_employee_timesheet_summary')
          .select('*')
          .gte('date', `${startDate}T00:00:00Z`)
          .lt('date', `${endDate}T00:00:00Z`);
        if (monthlyPrintProject) query = query.eq('project_code', monthlyPrintProject);
        else if (monthlyPrintCompany) query = query.eq('company_name', monthlyPrintCompany);
        if (monthlyPrintEmployeeId !== 'ALL') query = query.eq('emp_id', monthlyPrintEmployeeId);
        const { data, error } = await query
          .order('emp_id', { ascending: true })
          .order('date', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        pageRows = (data || []) as SummaryRow[];
        monthRows.push(...pageRows.map(toDisplayRow));
        offset += PAGE_SIZE;
      } while (pageRows.length === PAGE_SIZE);
      if (!monthRows.length) {
        toast.error('No timesheet records were found for the selected project, employee, and month.');
        return;
      }
      const rowsByEmployee = new Map<string, DisplayRow[]>();
      monthRows.forEach((row) => {
        if (row.emp_id === null || row.emp_id === undefined) return;
        const empId = String(row.emp_id);
        const employeeRows = rowsByEmployee.get(empId) || [];
        employeeRows.push(row);
        rowsByEmployee.set(empId, employeeRows);
      });
      const sheets = Array.from(rowsByEmployee, ([empId, employeeRows]) => {
        const option = employeeOptions.find((employee) => employee.empId === empId);
        const firstRow = employeeRows[0];
        return {
          employee: option || {
            name: firstRow.name || empId,
            empId,
            company: firstRow.company_name,
          },
          rows: employeeRows,
        };
      }).sort((left, right) => left.employee.name.localeCompare(right.employee.name));
      if (!sheets.length) {
        toast.error('No employee timesheets were found for the selected month.');
        return;
      }
      setMonthlyPrintData({ month: monthlyPrintMonth, sheets });
      setMonthlyPrintOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load the employee timesheet.');
    } finally {
      setMonthlyPrintLoading(false);
    }
  };

  const loadAssignedProjectTimesheets = async () => {
    if (!assignedPrintProject || !assignedPrintMonth) {
      toast.error('Select a project and month to view timesheets.');
      return;
    }
    if (!assignedPrintProjects.some((project) => project.code === assignedPrintProject)) {
      toast.error('You are not assigned to the selected project.');
      return;
    }
    if (assignedPrintEmployeeId !== 'ALL' && !assignedPrintEmployees.some((employee) => employee.empId === assignedPrintEmployeeId)) {
      toast.error('Select an employee assigned to the selected project.');
      return;
    }

    const requestId = ++assignedPrintRequestIdRef.current;
    setMonthlyPrintLoading(true);
    try {
      const [focalAssignment, approverAssignment] = await Promise.all([
        supabase.from('projects').select('project_code').eq('project_code', assignedPrintProject).eq('focal_point_id', String(userData?.emp_id || '')),
        supabase.from('projects').select('project_code').eq('project_code', assignedPrintProject).eq('approver_id', String(userData?.emp_id || '')),
      ]);
      if (focalAssignment.error) throw focalAssignment.error;
      if (approverAssignment.error) throw approverAssignment.error;
      if (requestId !== assignedPrintRequestIdRef.current) return;
      if (!focalAssignment.data?.length && !approverAssignment.data?.length) {
        toast.error('You are no longer assigned to the selected project.');
        setAssignedPrintProjects((projects) => projects.filter((project) => project.code !== assignedPrintProject));
        setMonthlyPrintData(null);
        return;
      }

      const [year, month] = assignedPrintMonth.split('-').map(Number);
      const startDate = `${assignedPrintMonth}-01`;
      const endDate = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
      const employeeIds = assignedPrintEmployeeId === 'ALL'
        ? assignedPrintEmployees.map((employee) => employee.empId)
        : [assignedPrintEmployeeId];
      if (!employeeIds.length) {
        toast.error('No employees were found for the selected project.');
        setMonthlyPrintData(null);
        return;
      }
      let offset = 0;
      const monthRows: DisplayRow[] = [];
      let pageRows: SummaryRow[];
      do {
        let query = supabase
          .from('v_employee_timesheet_summary')
          .select('*')
          .gte('date', `${startDate}T00:00:00Z`)
          .lt('date', `${endDate}T00:00:00Z`)
          .in('emp_id', employeeIds);
        const { data, error } = await query
          .order('emp_id', { ascending: true })
          .order('date', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        if (requestId !== assignedPrintRequestIdRef.current) return;
        pageRows = (data || []) as SummaryRow[];
        monthRows.push(...pageRows.map(toDisplayRow));
        offset += PAGE_SIZE;
      } while (pageRows.length === PAGE_SIZE);
      if (!monthRows.length) {
        toast.error('No timesheet records were found for the selected project, employee, and month.');
        setMonthlyPrintData(null);
        return;
      }

      const rowsByEmployee = new Map<string, DisplayRow[]>();
      monthRows.forEach((row) => {
        if (row.emp_id === null || row.emp_id === undefined) return;
        const empId = String(row.emp_id);
        const employeeRows = rowsByEmployee.get(empId) || [];
        employeeRows.push(row);
        rowsByEmployee.set(empId, employeeRows);
      });
      const sheets = Array.from(rowsByEmployee, ([empId, employeeRows]) => {
        const option = assignedPrintEmployees.find((employee) => employee.empId === empId);
        const firstRow = employeeRows[0];
        return {
          employee: option || {
            name: firstRow.name || empId,
            empId,
            company: firstRow.company_name,
          },
          rows: employeeRows,
        };
      }).sort((left, right) => left.employee.name.localeCompare(right.employee.name));
      if (!sheets.length) {
        toast.error('No employee timesheets were found for the selected month.');
        setMonthlyPrintData(null);
        return;
      }
      setMonthlyPrintData({ month: assignedPrintMonth, sheets });
    } catch (error) {
      if (requestId === assignedPrintRequestIdRef.current) {
        toast.error(error instanceof Error ? error.message : 'Unable to load the employee timesheet.');
        setMonthlyPrintData(null);
      }
    } finally {
      if (requestId === assignedPrintRequestIdRef.current) setMonthlyPrintLoading(false);
    }
  };

  const printAssignedProjectTimesheets = () => {
    if (!monthlyPrintData) return;
    const cleanup = () => document.body.classList.remove('employee-monthly-timesheet-print');
    document.body.classList.add('employee-monthly-timesheet-print');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  };

  const downloadPdf = async () => {
    if (!filteredRows.length) return;
    setExportingPdf(true);
    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const margin = 8;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const visibleColumnDefs = columns.filter(({ key }) => visibleColumns[key]);
      const fixedColumnWidths: Partial<Record<ColumnKey, number>> = {
        emp_id: 18,
        displayDate: 15,
        displayPunchIn: 16,
        displayPunchOut: 16,
        displayOvertime: 16,
        displayHolidayOvertime: 16,
        displayBreakHours: 16,
        displayHours: 16,
      };
      const flexibleColumnWidths: Partial<Record<ColumnKey, number>> = {
        serialNumber: 12,
        company_name: 32,
        name: 53,
        nationality: 24,
        project_code: 28,
        timesheet_status: 29,
        timecard_status: 29,
        remarks: 50,
      };
      const columnWidths = visibleColumnDefs.map(({ key }) => fixedColumnWidths[key] ?? flexibleColumnWidths[key] ?? 22);
      const headerFontSize = 5.8;
      const headerHeight = 15;
      const firstRowY = (selectedEmployeeLabel ? 18 : 14) + headerHeight;
      const reservedFooterHeight = selectedEmployeeLabel ? 6 : 0;
      const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
      const title = 'Employee Timesheet Summary';
      const totals = reportTotals(filteredRows);
      const pdfRows = [
        ...filteredRows.map((row) => ({ row, isTotal: false })),
        { row: null, isTotal: true },
      ];
      while (pdfRows.length % PRINT_ROWS_PER_PAGE !== 0) pdfRows.splice(pdfRows.length - 1, 0, { row: null, isTotal: false });
      const drawHeader = () => {
        const tableTop = selectedEmployeeLabel ? 18 : 14;
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text(title, margin, 10);
        if (selectedEmployeeLabel) {
          pdf.setFontSize(9);
          pdf.text(selectedEmployeeLabel, margin, 14);
        }
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Generated ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - margin, 10, { align: 'right' });
        let x = margin;
        pdf.setDrawColor(148, 163, 184);
        pdf.setFillColor(255, 255, 255);
        pdf.setTextColor(0, 0, 0);
        pdf.rect(margin, tableTop, tableWidth, headerHeight, 'FD');
        pdf.setFontSize(headerFontSize);
        visibleColumnDefs.forEach(({ label }, index) => {
          pdf.text(label, x + columnWidths[index] / 2, tableTop + headerHeight - 1, { align: 'center', angle: 90 });
          x += columnWidths[index];
        });
        if (selectedEmployeeLabel) {
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(30, 41, 59);
          pdf.text(selectedEmployeeLabel, pageWidth - margin, pageHeight - 4, { align: 'right' });
        }
        pdf.setTextColor(0, 0, 0);
      };
      drawHeader();
      let y = firstRowY;
      const rowHeight = (pageHeight - margin - reservedFooterHeight - firstRowY) / PRINT_ROWS_PER_PAGE;
      pdfRows.forEach(({ row, isTotal }, rowIndex) => {
        pdf.setFontSize(5.8);
        const values = visibleColumnDefs.map(({ key }) => row
          ? columnValue(row, key, filteredRows.indexOf(row) + 1)
          : (isTotal ? totalRowValue(totals, key) : ''));
        const wrappedValues = values.map((value, index) => pdf.splitTextToSize(String(value || ''), columnWidths[index] - 3));
        const lineHeight = 3.1;
        const cellPadding = 1.4;
        if (rowIndex > 0 && rowIndex % PRINT_ROWS_PER_PAGE === 0) {
          pdf.addPage();
          drawHeader();
          y = firstRowY;
        }
        if (row && rowIndex % 2 === 0) {
          pdf.setFillColor(248, 250, 252);
          pdf.rect(margin, y, tableWidth, rowHeight, 'F');
        }
        if (isTotal) {
          pdf.setFillColor(255, 255, 255);
          pdf.rect(margin, y, tableWidth, rowHeight, 'F');
          pdf.setFont('helvetica', 'bold');
        }
        let x = margin;
        pdf.setFontSize(5.8);
        wrappedValues.forEach((text, index) => {
          const textHeight = Math.min(text.length, 1) * lineHeight;
          const textY = y + Math.max(cellPadding / 2, (rowHeight - textHeight) / 2);
          pdf.text(text, x + 1.5, textY, { baseline: 'top' });
          pdf.rect(x, y, columnWidths[index], rowHeight, 'S');
          x += columnWidths[index];
        });
        pdf.setFont('helvetica', 'normal');
        y += rowHeight;
      });
      pdf.save(`employee_timesheet_summary_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    } catch {
      toast.error('Unable to create the PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const monthlyPrintReport = monthlyPrintData && <section
    id="employee-monthly-timesheet"
    className={timesheetPrintMode ? 'timesheet-print-preview' : undefined}
    aria-hidden={!timesheetPrintMode}
  >{monthlyPrintData.sheets.map((sheet) => {
    const sheetTotals = reportTotals(sheet.rows);
    const companyName = sheet.rows[0]?.company_name || sheet.employee.company || '';
    return <article key={sheet.employee.empId} className="monthly-print-sheet">
      <h1>Timesheet for the month of - {format(new Date(`${monthlyPrintData.month}-01T00:00:00`), 'MMMM yyyy')}</h1>
      <p className="monthly-print-subtitle">{sheet.employee.name} [{sheet.employee.empId}] [{companyName}]</p>
      <table><thead><tr><th className="monthly-serial"><span>S.No.</span></th><th className="monthly-date"><span>Date</span></th><th className="monthly-day"><span>Day</span></th><th className="monthly-time"><span>Punch<br />In</span></th><th className="monthly-time"><span>Punch<br />Out</span></th><th className="monthly-time"><span>OT</span></th><th className="monthly-time"><span>Holiday<br />OT</span></th><th className="monthly-time"><span>Total<br />Hours</span></th><th className="monthly-project"><span>Project</span></th><th className="monthly-remarks"><span>Remarks</span></th><th className="monthly-verified"><span>Verified</span></th></tr></thead><tbody>{sheet.rows.map((row, index) => <tr key={`${row.emp_id}-${row.date}-${index}`}><td className="monthly-serial">{index + 1}</td><td className="monthly-date">{row.displayDate}</td><td className="monthly-day">{dayOfWeek(row.date)}</td><td className="monthly-time">{row.displayPunchIn}</td><td className="monthly-time">{row.displayPunchOut}</td><td className="monthly-time">{row.displayOvertime}</td><td className="monthly-time">{row.displayHolidayOvertime}</td><td className="monthly-time">{row.displayHours}</td><td className="monthly-project">{row.project_code || ''}</td><td className="monthly-remarks">{row.remarks || ''}</td><td className="monthly-verified">&nbsp;</td></tr>)}<tr className="monthly-total-row"><td colSpan={5}>Total</td><td className="monthly-time">{sheetTotals.displayOvertime}</td><td className="monthly-time">{sheetTotals.displayHolidayOvertime}</td><td className="monthly-time">{sheetTotals.displayHours}</td><td></td><td></td><td></td></tr></tbody></table>
      <footer className="monthly-print-footer"><span>{userData?.emp_id ? `Emp ID: ${userData.emp_id} | ` : ''}{format(new Date(), 'dd/MM/yyyy HH:mm')}</span><span>Verified by</span><span>{sheet.employee.name} [{sheet.employee.empId}]</span></footer>
    </article>;
  })}</section>;

  if (timesheetPrintMode) {
    return (
      <div className="employee-timesheet-summary-root flex h-full w-full flex-col overflow-hidden bg-white">
        <style>{`
          .timesheet-print-preview { overflow: auto; padding: 16px; color: #000; background: #fff; font-family: Arial, sans-serif; }
          .timesheet-print-preview .monthly-print-sheet { max-width: 1100px; margin: 0 auto 24px; }
          .timesheet-print-preview h1 { margin: 0 0 6px; font-size: 18px; font-weight: 700; }
          .timesheet-print-preview .monthly-print-subtitle { margin: 0 0 12px; font-size: 13px; }
          .timesheet-print-preview table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12px; line-height: 1.2; }
          .timesheet-print-preview th, .timesheet-print-preview td { border: 1px solid #000; padding: 4px 6px; vertical-align: middle; overflow-wrap: anywhere; }
          .timesheet-print-preview th { height: 100px; padding: 0; text-align: left; font-weight: 700; }
          .timesheet-print-preview th > span { display: inline-block; width: 100%; height: 100px; overflow: hidden; text-align: left; writing-mode: vertical-rl; transform: rotate(180deg); }
          .timesheet-print-preview .monthly-serial { width: 40px; }
          .timesheet-print-preview .monthly-date { width: 90px; }
          .timesheet-print-preview .monthly-day { width: 55px; }
          .timesheet-print-preview .monthly-time { width: 55px; }
          .timesheet-print-preview .monthly-project { width: calc(50% - 242.5px); }
          .timesheet-print-preview .monthly-verified { width: 80px; }
          .timesheet-print-preview tbody .monthly-serial, .timesheet-print-preview tbody .monthly-date, .timesheet-print-preview tbody .monthly-day, .timesheet-print-preview tbody .monthly-time { white-space: nowrap; }
          .timesheet-print-preview tbody tr { height: 34px; }
          .timesheet-print-preview .monthly-total-row { font-weight: 700; }
          .timesheet-print-preview .monthly-print-footer { display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: end; margin-top: 28px; font-size: 12px; }
          .timesheet-print-preview .monthly-print-footer > :nth-child(2) { text-align: center; }
          .timesheet-print-preview .monthly-print-footer > :nth-child(3) { text-align: right; }
          @media print {
            @page employee-monthly-timesheet-page { size: A4 portrait; margin: 5mm 8mm 7mm; }
            body * { visibility: hidden; }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet,
            body.employee-monthly-timesheet-print #employee-monthly-timesheet * { visibility: visible !important; }
            body.employee-monthly-timesheet-print .employee-timesheet-summary-root { height: auto !important; overflow: visible !important; }
            body.employee-monthly-timesheet-print .employee-timesheet-summary-root > :not(style):not(#employee-monthly-timesheet) { display: none !important; }
            body.employee-monthly-timesheet-print #timesheet-summary-report { display: none !important; }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet { display: block; position: absolute; top: 0; left: 0; right: 0; width: auto; margin: 0; padding: 0; color: #000; font-family: Arial, sans-serif; }
            body.employee-monthly-timesheet-print .monthly-print-sheet { page: employee-monthly-timesheet-page; break-inside: avoid; page-break-inside: avoid; }
            body.employee-monthly-timesheet-print .monthly-print-sheet + .monthly-print-sheet { break-before: page; page-break-before: always; }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet h1 { margin: 0 0 0.8mm; padding: 0; border: 0; font-size: 14pt; line-height: 1; font-weight: 700; }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-print-subtitle { margin: 0 0 2.5mm; padding: 0; border: 0; font-size: 9pt; line-height: 1.1; }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 7pt; line-height: 1; }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet th { text-align: left; font-weight: 700; }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet th,
            body.employee-monthly-timesheet-print #employee-monthly-timesheet td { border: 1px solid #000; padding: 0.8mm 1.2mm; vertical-align: middle; overflow-wrap: anywhere; }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet th { height: 12mm; max-height: 12mm; padding: 0; vertical-align: middle; }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet th > span { display: inline-block; width: 100%; height: 12mm; max-height: 12mm; overflow: hidden; text-align: left; writing-mode: vertical-rl; transform: rotate(180deg); }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-serial { width: calc(2ch + 3mm); max-width: calc(2ch + 3mm); }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-date { width: calc(10ch + 3mm); max-width: calc(10ch + 3mm); }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-day { width: calc(5ch + 3mm); max-width: calc(5ch + 3mm); }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-time { width: calc(5ch + 3mm); max-width: calc(5ch + 3mm); }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-project { width: calc(50% - 23.5ch - 10.5mm); max-width: calc(50% - 23.5ch - 10.5mm); }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-verified { width: 10ch; max-width: 10ch; }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet tbody .monthly-serial,
            body.employee-monthly-timesheet-print #employee-monthly-timesheet tbody .monthly-date,
            body.employee-monthly-timesheet-print #employee-monthly-timesheet tbody .monthly-day,
            body.employee-monthly-timesheet-print #employee-monthly-timesheet tbody .monthly-time { white-space: nowrap; overflow-wrap: normal; }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet tbody tr { height: 4.5mm; break-inside: avoid; page-break-inside: avoid; }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-total-row { font-weight: 700; }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-print-footer { display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: end; margin-top: 7mm; font-size: 8pt; }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-print-footer > :nth-child(2) { text-align: center; }
            body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-print-footer > :nth-child(3) { text-align: right; }
          }
        `}</style>
        <div className="report-no-print flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2">
          <Back title="Timesheet Print" noback={embedMode} />
          {monthlyPrintData && <button type="button" onClick={printAssignedProjectTimesheets} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-700 px-3 text-xs font-medium text-white hover:bg-teal-600"><Printer className="h-3.5 w-3.5" />Print</button>}
        </div>
        <div className="report-no-print flex shrink-0 flex-wrap items-end gap-3 border-b border-slate-100 bg-slate-50/70 px-3 py-3">
          <label className="block text-xs font-medium text-slate-700">Project<select value={assignedPrintProject} disabled={assignedPrintProjectsLoading} onChange={(event) => { assignedPrintRequestIdRef.current += 1; setMonthlyPrintLoading(false); setAssignedPrintProject(event.target.value); setMonthlyPrintData(null); }} className="mt-1 h-9 min-w-64 rounded-md border border-slate-200 bg-white px-2 text-sm disabled:bg-slate-100"><option value="">Select a project</option>{assignedPrintProjects.map((project) => <option key={project.code} value={project.code}>{project.code}{project.name ? ` - ${project.name}` : ''}</option>)}</select></label>
          <label className="block text-xs font-medium text-slate-700">Month<input type="month" value={assignedPrintMonth} onChange={(event) => { assignedPrintRequestIdRef.current += 1; setMonthlyPrintLoading(false); setAssignedPrintMonth(event.target.value); setMonthlyPrintData(null); }} className="mt-1 h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" /></label>
          <div className="text-xs font-medium text-slate-700"><span>Employee</span><SearchableEmployeeSelect className="mt-1" employees={assignedPrintEmployees} value={assignedPrintEmployeeId} disabled={!assignedPrintProject || assignedPrintEmployeesLoading} onChange={(value) => { assignedPrintRequestIdRef.current += 1; setMonthlyPrintLoading(false); setAssignedPrintEmployeeId(value); setMonthlyPrintData(null); }} /></div>
          <button type="button" onClick={() => void loadAssignedProjectTimesheets()} disabled={!assignedPrintProject || !assignedPrintMonth || monthlyPrintLoading || assignedPrintEmployeesLoading} className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-50">{monthlyPrintLoading && <Loader2 className="h-4 w-4 animate-spin" />}View Report</button>
          {assignedPrintProjectsLoading || assignedPrintEmployeesLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
          {!assignedPrintProjectsLoading && !assignedPrintProjects.length && <p className="text-sm text-slate-500">No projects are assigned to your employee ID.</p>}
        </div>
        {monthlyPrintReport}
      </div>
    );
  }

  return (
    <div className="employee-timesheet-summary-root flex h-full w-full flex-col overflow-hidden bg-white">
      <style>{`@media print {
        @page { margin: 12mm; }
        @page employee-monthly-timesheet-page { size: A4 portrait; margin: 5mm 8mm 7mm; }
        body * { visibility: hidden; }
        #timesheet-summary-report, #timesheet-summary-report * { visibility: visible; }
        #timesheet-summary-report { position: absolute; inset: 0; width: 100%; overflow: visible; padding: 0; }
        #timesheet-summary-report > div:first-child { margin-bottom: 4mm; }
        #timesheet-summary-report > div:first-child svg { display: none; }
        #timesheet-summary-report h1 { font-size: 14pt; line-height: 1; }
        #timesheet-summary-report h1 span { display: block; margin-left: 0; font-size: 9pt; }
        #timesheet-summary-report h1 + p { display: none; }
        #timesheet-summary-report table { width: 100%; min-width: 0; table-layout: fixed; font-size: 7pt; }
        #timesheet-summary-report thead { position: static !important; z-index: auto !important; background: #fff !important; color: #000 !important; }
        #timesheet-summary-report th { background: #fff !important; color: #000 !important; }
        #timesheet-summary-report th { font-size: 5.8pt; line-height: 1; padding: 0; white-space: normal; overflow-wrap: anywhere; text-align: center; vertical-align: bottom; }
        #timesheet-summary-report thead tr, #timesheet-summary-report th.print-rotated-header { height: 15mm; max-height: 15mm; }
        #timesheet-summary-report th.print-rotated-header { padding: 0; vertical-align: middle; overflow: hidden; }
        #timesheet-summary-report th.print-rotated-header button { display: inline-flex; width: 100%; height: 15mm; max-height: 15mm; align-items: center; justify-content: center; padding: 0; writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; font-size: 5.8pt; color: #000; overflow: hidden; }
        #timesheet-summary-report th.print-rotated-header button svg { display: none; }
        #timesheet-summary-report tbody tr { height: 5.5mm; break-inside: avoid; page-break-inside: avoid; }
        #timesheet-summary-report tbody tr:nth-child(32n):not(:last-child) { break-after: page; page-break-after: always; }
        #timesheet-summary-report td { height: 5.5mm; max-height: 5.5mm; padding: 1mm; white-space: normal; overflow: hidden; overflow-wrap: anywhere; word-break: break-word; vertical-align: top; }
        #timesheet-summary-report .print-only-row { display: table-row !important; }
        #timesheet-summary-report .report-total-row { font-weight: 700; background: #fff !important; }
        #timesheet-summary-report th.print-col-emp_id, #timesheet-summary-report td.print-col-emp_id { width: 10ch; max-width: 10ch; }
        #timesheet-summary-report th.print-col-serialNumber, #timesheet-summary-report td.print-col-serialNumber { width: 12mm; max-width: 12mm; }
        #timesheet-summary-report th.print-col-company_name, #timesheet-summary-report td.print-col-company_name { width: 32mm; max-width: 32mm; }
        #timesheet-summary-report th.print-col-name, #timesheet-summary-report td.print-col-name { width: 38mm; max-width: 38mm; }
        #timesheet-summary-report th.print-col-nationality, #timesheet-summary-report td.print-col-nationality { width: 24mm; max-width: 24mm; }
        #timesheet-summary-report th.print-col-project_code, #timesheet-summary-report td.print-col-project_code { width: 28mm; max-width: 28mm; }
        #timesheet-summary-report th.print-col-timesheet_status, #timesheet-summary-report td.print-col-timesheet_status,
        #timesheet-summary-report th.print-col-timecard_status, #timesheet-summary-report td.print-col-timecard_status { width: 29mm; max-width: 29mm; }
        #timesheet-summary-report th.print-col-remarks, #timesheet-summary-report td.print-col-remarks { width: 50mm; max-width: 50mm; }
        #timesheet-summary-report th.print-col-displayDate, #timesheet-summary-report td.print-col-displayDate { width: 15mm; max-width: 15mm; }
        #timesheet-summary-report th.print-col-displayPunchIn, #timesheet-summary-report td.print-col-displayPunchIn,
        #timesheet-summary-report th.print-col-displayPunchOut, #timesheet-summary-report td.print-col-displayPunchOut,
        #timesheet-summary-report th.print-col-displayOvertime, #timesheet-summary-report td.print-col-displayOvertime,
        #timesheet-summary-report th.print-col-displayHolidayOvertime, #timesheet-summary-report td.print-col-displayHolidayOvertime,
        #timesheet-summary-report th.print-col-displayBreakHours, #timesheet-summary-report td.print-col-displayBreakHours,
        #timesheet-summary-report th.print-col-displayHours, #timesheet-summary-report td.print-col-displayHours { width: 7ch; max-width: 7ch; }
        #timesheet-summary-report th.print-align-left, #timesheet-summary-report td.print-align-left { text-align: left; }
        #timesheet-summary-report .overflow-auto { overflow: visible; }
        #timesheet-summary-report .report-print-footer { display: none !important; }
        .report-no-print { display: none !important; }
        body.employee-monthly-timesheet-print * { visibility: hidden !important; }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet,
        body.employee-monthly-timesheet-print #employee-monthly-timesheet * { visibility: visible !important; }
        body.employee-monthly-timesheet-print .employee-timesheet-summary-root { height: auto !important; overflow: visible !important; }
        body.employee-monthly-timesheet-print .employee-timesheet-summary-root > :not(style):not(#employee-monthly-timesheet) { display: none !important; }
        body.employee-monthly-timesheet-print #timesheet-summary-report { display: none !important; }
        #employee-monthly-timesheet { display: none; }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet { display: block; position: absolute; top: 0; left: 0; right: 0; width: auto; margin: 0; padding: 0; color: #000; font-family: Arial, sans-serif; }
        body.employee-monthly-timesheet-print .monthly-print-sheet { page: employee-monthly-timesheet-page; break-inside: avoid; page-break-inside: avoid; }
        body.employee-monthly-timesheet-print .monthly-print-sheet + .monthly-print-sheet { break-before: page; page-break-before: always; }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet h1 { margin: 0 0 0.8mm; padding: 0; border: 0; font-size: 14pt; line-height: 1; font-weight: 700; }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-print-subtitle { margin: 0 0 2.5mm; padding: 0; border: 0; font-size: 9pt; line-height: 1.1; }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 7pt; line-height: 1; }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet th { text-align: left; font-weight: 700; }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet th,
        body.employee-monthly-timesheet-print #employee-monthly-timesheet td { border: 1px solid #000; padding: 0.8mm 1.2mm; vertical-align: middle; overflow-wrap: anywhere; }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet th { height: 12mm; max-height: 12mm; padding: 0; vertical-align: middle; }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet th > span { display: inline-block; width: 100%; height: 12mm; max-height: 12mm; overflow: hidden; text-align: left; writing-mode: vertical-rl; transform: rotate(180deg); }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-serial { width: calc(2ch + 3mm); max-width: calc(2ch + 3mm); }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-date { width: calc(10ch + 3mm); max-width: calc(10ch + 3mm); }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-day,
        body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-time { width: calc(5ch + 3mm); max-width: calc(5ch + 3mm); }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-verified { width: 10ch; max-width: 10ch; }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet tbody .monthly-serial,
        body.employee-monthly-timesheet-print #employee-monthly-timesheet tbody .monthly-date,
        body.employee-monthly-timesheet-print #employee-monthly-timesheet tbody .monthly-time { white-space: nowrap; overflow-wrap: normal; }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet tbody tr { height: 4.5mm; break-inside: avoid; page-break-inside: avoid; }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-total-row { font-weight: 700; }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-print-footer { display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: end; margin-top: 7mm; font-size: 8pt; }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-print-footer > :nth-child(2) { text-align: center; }
        body.employee-monthly-timesheet-print #employee-monthly-timesheet .monthly-print-footer > :nth-child(3) { text-align: right; }
      }`}</style>
      <div className="report-no-print flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2">
        <Back title="Employee Timesheet Summary" noback={embedMode} />
        <div className="flex items-center gap-2">
          <button onClick={() => void fetchRows()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50" title="Refresh report"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
          <button onClick={() => window.print()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"><Printer className="h-3.5 w-3.5" />Print</button>
          <button onClick={() => setMonthlyPrintOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"><Printer className="h-3.5 w-3.5" />Timesheet Print</button>
          <button onClick={downloadExcel} disabled={loading || !filteredRows.length} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40"><Download className="h-3.5 w-3.5" />Excel</button>
          <button onClick={() => void downloadPdf()} disabled={loading || !filteredRows.length || exportingPdf} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-700 px-3 text-xs font-medium text-white hover:bg-teal-600 disabled:opacity-40">{exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}PDF</button>
        </div>
      </div>

      <div className="report-no-print flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
        <div className="relative min-w-[220px] flex-1 sm:flex-none"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee, company, project..." className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-teal-500" /></div>
        <SearchableSelect label="Company" value={companyFilter} options={filterOptions.companies} onChange={setCompanyFilter} />
        <SearchableSelect label="Project" value={projectFilter} options={filterOptions.projects} onChange={setProjectFilter} />
        <SearchableSelect label="Employee" value={employeeFilter} options={companyEmployeeOptions.map((employee) => employee.name)} onChange={setEmployeeFilter} />
        <div className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
          <button type="button" onClick={() => setCalendarMode('day')} className={`h-7 rounded-md px-2 text-[11px] ${calendarMode === 'day' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Day</button>
          <button type="button" onClick={() => setCalendarMode('month')} className={`h-7 rounded-md px-2 text-[11px] ${calendarMode === 'month' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Month</button>
        </div>
        <DatePicker
          value={calendarMode === 'day' ? dateFilter : (monthFilter ? `${monthFilter}-01` : '')}
          onChange={(value) => {
            const selectedValue = typeof value === 'function' ? value(calendarMode === 'day' ? dateFilter : (monthFilter ? `${monthFilter}-01` : '')) : value;
            if (calendarMode === 'day') {
              setDateFilter(selectedValue);
              setMonthFilter('');
            } else {
              setMonthFilter(selectedValue ? selectedValue.slice(0, 7) : '');
              setDateFilter('');
            }
          }}
          placeholder={calendarMode === 'day' ? 'All dates' : 'All months'}
          className="h-8 w-[112px] px-2 text-xs"
        />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-teal-500"><option value="ALL">All statuses</option>{filterOptions.statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select>        
        <div className="relative">
          <button type="button" onClick={(event) => { const menu = event.currentTarget.nextElementSibling; menu?.classList.toggle('hidden'); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"><Settings2 className="h-3.5 w-3.5" />Columns</button>
          <div className="hidden absolute right-0 top-9 z-30 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            {columns.map(({ key, label }) => <label key={key} className="flex w-full items-center justify-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50"><input type="checkbox" checked={visibleColumns[key]} disabled={Object.values(visibleColumns).filter(Boolean).length === 1 && visibleColumns[key]} onChange={() => setVisibleColumns((current) => ({ ...current, [key]: !current[key] }))} />{label}</label>)}
          </div>
        </div>
        <span className="text-xs text-slate-500">{filteredRows.length} of {rows.length} records</span>
      </div>

      <div id="timesheet-summary-report" ref={reportRef} className="min-h-0 flex-1 overflow-auto p-3">
        <div className="mb-3 flex items-center gap-2"><FileBarChart2 className="h-5 w-5 text-teal-700" /><div><h1 className="text-lg font-semibold text-slate-800">Employee Timesheet Summary{selectedEmployeeLabel && <span className="ml-2 font-medium text-teal-700">{selectedEmployeeLabel}</span>}</h1><p className="text-xs text-slate-500">Date: DD-MM-YYYY | Time and hours: HH:MM</p></div></div>
        {loading && !rows.length ? <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading report...</div> : <>
          <div className="overflow-auto rounded-lg border border-slate-200"><table className="w-full min-w-[1100px] border-collapse text-xs"><thead className="sticky top-0 z-10 bg-slate-800 text-left text-[10px] uppercase tracking-wide text-white"><tr>{columns.filter(({ key }) => visibleColumns[key]).map(({ key, label }) => <th key={key} className={`whitespace-nowrap px-3 py-1.5 font-medium print-col-${key} print-rotated-header ${leftAlignedColumns.has(key) ? 'text-left print-align-left' : ''}`}><button type="button" onClick={() => toggleSort(key)} disabled={key === 'serialNumber'} className="inline-flex items-center gap-1 disabled:cursor-default">{label}{sortIcon(key)}</button></th>)}</tr></thead><tbody>{filteredRows.length ? <>{filteredRows.map((row, index) => <tr key={`${row.emp_id}-${row.date}-${index}`} className="border-t border-slate-100 even:bg-slate-50/60 hover:bg-teal-50/40">{columns.filter(({ key }) => visibleColumns[key]).map(({ key }) => <td key={key} className={`px-3 py-1 print-col-${key} ${leftAlignedColumns.has(key) ? 'text-left print-align-left' : ''} ${key === 'name' ? 'max-w-[180px] whitespace-normal break-words font-medium text-slate-700' : ''} ${key === 'remarks' ? 'max-w-[240px] whitespace-normal break-words' : ''} ${key.startsWith('display') ? 'tabular-nums' : ''}`}>{columnValue(row, key, index + 1)}</td>)}</tr>)}{Array.from({ length: printPaddingCount }, (_, index) => <tr key={`print-padding-${index}`} className="print-only-row"><td colSpan={columns.filter(({ key }) => visibleColumns[key]).length} /></tr>)}<tr className="report-total-row border-t border-slate-300"><>{columns.filter(({ key }) => visibleColumns[key]).map(({ key }) => <td key={key} className={`px-3 py-1 print-col-${key} ${leftAlignedColumns.has(key) ? 'text-left print-align-left' : ''} ${key.startsWith('display') ? 'tabular-nums' : ''}`}>{totalRowValue(totals, key)}</td>)}</></tr></> : <tr><td colSpan={columns.filter(({ key }) => visibleColumns[key]).length} className="px-3 py-12 text-center text-slate-400">No records found</td></tr>}</tbody></table></div>
          {hasMore && <div className="flex justify-center gap-2 py-3"><button type="button" onClick={() => void fetchRows(false, rows.length)} disabled={loading || loadingAll} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{loading && !loadingAll && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Load 100 more</button><button type="button" onClick={() => void loadAllRows()} disabled={!dateFilter && !monthFilter || loading || loadingAll} title={!dateFilter && !monthFilter ? 'Select a day or month to load the full report' : 'Load full report'} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50">{loadingAll && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Load full report</button></div>}
        </>}
        {selectedEmployeeLabel && <div className="report-print-footer hidden text-xs font-medium text-slate-600">{selectedEmployeeLabel}</div>}
      </div>
      {monthlyPrintOpen && <div className="report-no-print fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-labelledby="monthly-print-title">
        <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between"><h2 id="monthly-print-title" className="text-base font-semibold text-slate-900">Print employee timesheet</h2><button type="button" onClick={() => setMonthlyPrintOpen(false)} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
          <label className="mb-3 block text-xs font-medium text-slate-700">Company<select value={monthlyPrintCompany} disabled={Boolean(monthlyPrintProject) || monthlyPrintOptionsLoading} onChange={(event) => { setMonthlyPrintCompany(event.target.value); setMonthlyPrintProject(''); setMonthlyPrintEmployeeId('ALL'); }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm disabled:bg-slate-100"><option value="">All companies</option>{monthlyPrintCompanies.map((company) => <option key={company.code || company.name} value={company.name}>{company.name}{company.code ? ` [${company.code}]` : ''}</option>)}</select></label>
          <label className="mb-3 block text-xs font-medium text-slate-700">Project<select value={monthlyPrintProject} disabled={Boolean(monthlyPrintCompany) || monthlyPrintOptionsLoading} onChange={(event) => { setMonthlyPrintProject(event.target.value); setMonthlyPrintCompany(''); setMonthlyPrintEmployeeId('ALL'); }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm disabled:bg-slate-100"><option value="">All projects</option>{monthlyPrintProjects.map((project) => <option key={project.code} value={project.code}>{project.code}{project.name ? ` - ${project.name}` : ''}</option>)}</select></label>
          <label className="mb-3 block text-xs font-medium text-slate-700">Month<input type="month" value={monthlyPrintMonth} onChange={(event) => setMonthlyPrintMonth(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm" /></label>
          <div className="mb-3 text-xs font-medium text-slate-700"><span>Employee</span><SearchableEmployeeSelect className="mt-1" employees={monthlyPrintEmployeeOptions.filter((employee) => employee.empId)} value={monthlyPrintEmployeeId} onChange={setMonthlyPrintEmployeeId} disabled={monthlyPrintEmployeesLoading} /></div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setMonthlyPrintOpen(false)} className="h-9 rounded-md border border-slate-200 px-3 text-sm text-slate-700">Cancel</button><button type="button" onClick={() => void printEmployeeMonth()} disabled={!monthlyPrintMonth || monthlyPrintLoading || monthlyPrintEmployeesLoading} className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-medium text-white disabled:opacity-50">{monthlyPrintLoading && <Loader2 className="h-4 w-4 animate-spin" />}Print</button></div>
        </div>
      </div>}
      {monthlyPrintReport}
    </div>
  );
}
