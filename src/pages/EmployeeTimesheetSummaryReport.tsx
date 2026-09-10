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
};

const PAGE_SIZE = 100;
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
  if (typeof value === 'string' && value.includes(':')) return formatTime(value);
  return decimalHoursToTime(value);
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
    displayBreakHours: breakHoursToTime(row.break_hours),
    displayHours: decimalHoursToTime(row.total_working_hours),
  };
}

function columnValue(row: DisplayRow, key: ColumnKey, serialNumber?: number): string {
  if (key === 'serialNumber') return serialNumber === undefined ? '' : String(serialNumber);
  return String(row[key] ?? '');
}

function excelRows(rows: DisplayRow[], visibleColumns: Record<ColumnKey, boolean>) {
  return rows.map((row, index) => Object.fromEntries(
    columns.filter(({ key }) => visibleColumns[key]).map(({ key, label }) => [label, columnValue(row, key, index + 1)]),
  ));
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

export default function EmployeeTimesheetSummaryReport() {
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
  const [sortColumn, setSortColumn] = useState<SortableColumnKey | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ companies: [], projects: [], statuses: [] });  
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const reportRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

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
    if (userData && !canViewReport) navigate('/attendance', { replace: true });
  }, [canViewReport, navigate, userData]);

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
        .select('name, emp_id')
        .not('name', 'is', null)
        .order('name');
      if (employeeError) throw employeeError;
      const employees = (employeeData || [])
        .filter((employee) => employee.name)
        .map((employee) => ({ name: employee.name as string, empId: String(employee.emp_id || '') }));
//      options.employees = employees;
      setEmployeeOptions(employees.filter((employee, index, allEmployees) => allEmployees.findIndex((item) => item.name === employee.name) === index).sort((left, right) => left.name.localeCompare(right.name)));

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
    if (userData?.email && canViewReport) {
      setRows([]);
      void fetchRows();
    }
  }, [canViewReport, fetchRows, userData?.email]);

  useEffect(() => {
    if (userData?.email && canViewReport) void fetchFilterOptions();
  }, [canViewReport, fetchFilterOptions, userData?.email]);
  
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
    };
  }, [employeeFilter, employeeOptions, rows]);
  const selectedEmployeeLabel = selectedEmployee
    ? `${selectedEmployee.name}${selectedEmployee.empId ? ` [${selectedEmployee.empId}]` : ''}`
    : '';

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
        displayDate: 27,
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
        name: 38,
        nationality: 24,
        project_code: 28,
        timesheet_status: 29,
        timecard_status: 29,
        remarks: 50,
      };
      const columnWidths = visibleColumnDefs.map(({ key }) => fixedColumnWidths[key] ?? flexibleColumnWidths[key] ?? 22);
      const headerFontSize = 5.8;
      const headerHeight = 16;
      const firstRowY = (selectedEmployeeLabel ? 18 : 14) + headerHeight;
      const reservedFooterHeight = selectedEmployeeLabel ? 6 : 0;
      const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
      const title = 'Employee Timesheet Summary';
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
        pdf.setFillColor(30, 41, 59);
        pdf.setTextColor(255, 255, 255);
        pdf.rect(margin, tableTop, tableWidth, headerHeight, 'F');
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
        pdf.setTextColor(30, 41, 59);
      };
      drawHeader();
      let y = firstRowY;
      filteredRows.forEach((row, rowIndex) => {
        pdf.setFontSize(5.8);
        const values = visibleColumnDefs.map(({ key }) => columnValue(row, key, rowIndex + 1));
        const wrappedValues = values.map((value, index) => pdf.splitTextToSize(String(value || ''), columnWidths[index] - 3));
        const lineHeight = 3.1;
        const cellPadding = 1.4;
        const rowHeight = Math.max(4.8, ...wrappedValues.map((value) => value.length * lineHeight + cellPadding));
        if (y + rowHeight > pageHeight - margin - reservedFooterHeight) {
          pdf.addPage();
          drawHeader();
          y = firstRowY;
        }
        if (rowIndex % 2 === 0) {
          pdf.setFillColor(248, 250, 252);
          pdf.rect(margin, y, tableWidth, rowHeight, 'F');
        }
        let x = margin;
        pdf.setFontSize(5.8);
        wrappedValues.forEach((text, index) => {
          const textHeight = text.length * lineHeight;
          const textY = y + Math.max(cellPadding / 2, (rowHeight - textHeight) / 2);
          pdf.text(text, x + 1.5, textY, { baseline: 'top' });
          pdf.rect(x, y, columnWidths[index], rowHeight, 'S');
          x += columnWidths[index];
        });
        y += rowHeight;
      });
      pdf.save(`employee_timesheet_summary_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    } catch {
      toast.error('Unable to create the PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white">
      <style>{`@media print {
        @page { margin: 12mm; }
        body * { visibility: hidden; }
        #timesheet-summary-report, #timesheet-summary-report * { visibility: visible; }
        #timesheet-summary-report { position: absolute; inset: 0; width: 100%; overflow: visible; padding: 0; }
        #timesheet-summary-report > div:first-child { margin-bottom: 4mm; }
        #timesheet-summary-report h1 { font-size: 12pt; }
        #timesheet-summary-report table { width: 100%; min-width: 0; table-layout: fixed; font-size: 7pt; }
        #timesheet-summary-report th { font-size: 5.8pt; line-height: 1; padding: 0; white-space: normal; overflow-wrap: anywhere; text-align: center; vertical-align: bottom; }
        #timesheet-summary-report th.print-rotated-header { height: 16mm; padding: 0; vertical-align: bottom; }
        #timesheet-summary-report th.print-rotated-header button { display: inline-flex; width: 100%; height: 16mm; align-items: flex-end; justify-content: center; padding-bottom: 1mm; transform: rotate(90deg); transform-origin: center bottom; white-space: nowrap; font-size: 5.8pt; }
        #timesheet-summary-report th.print-rotated-header button svg { display: none; }
        #timesheet-summary-report td { padding: 1mm; white-space: normal; overflow-wrap: anywhere; word-break: break-word; vertical-align: top; }
        #timesheet-summary-report th.print-col-emp_id, #timesheet-summary-report td.print-col-emp_id { width: 8ch; max-width: 8ch; }
        #timesheet-summary-report th.print-col-displayDate, #timesheet-summary-report td.print-col-displayDate { width: 12ch; max-width: 12ch; }
        #timesheet-summary-report th.print-col-displayPunchIn, #timesheet-summary-report td.print-col-displayPunchIn,
        #timesheet-summary-report th.print-col-displayPunchOut, #timesheet-summary-report td.print-col-displayPunchOut,
        #timesheet-summary-report th.print-col-displayOvertime, #timesheet-summary-report td.print-col-displayOvertime,
        #timesheet-summary-report th.print-col-displayHolidayOvertime, #timesheet-summary-report td.print-col-displayHolidayOvertime,
        #timesheet-summary-report th.print-col-displayBreakHours, #timesheet-summary-report td.print-col-displayBreakHours,
        #timesheet-summary-report th.print-col-displayHours, #timesheet-summary-report td.print-col-displayHours { width: 7ch; max-width: 7ch; }
        #timesheet-summary-report th.print-align-left, #timesheet-summary-report td.print-align-left { text-align: left; }
        #timesheet-summary-report .overflow-auto { overflow: visible; }
        #timesheet-summary-report .report-print-footer { display: block !important; position: fixed; bottom: 0; right: 0; text-align: right; }
        .report-no-print { display: none !important; }
      }`}</style>
      <div className="report-no-print flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2">
        <Back title="Employee Timesheet Summary" />
        <div className="flex items-center gap-2">
          <button onClick={() => void fetchRows()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50" title="Refresh report"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
          <button onClick={() => window.print()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"><Printer className="h-3.5 w-3.5" />Print</button>
          <button onClick={downloadExcel} disabled={loading || !filteredRows.length} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40"><Download className="h-3.5 w-3.5" />Excel</button>
          <button onClick={() => void downloadPdf()} disabled={loading || !filteredRows.length || exportingPdf} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-700 px-3 text-xs font-medium text-white hover:bg-teal-600 disabled:opacity-40">{exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}PDF</button>
        </div>
      </div>

      <div className="report-no-print flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
        <div className="relative min-w-[220px] flex-1 sm:flex-none"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee, company, project..." className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-teal-500" /></div>
        <SearchableSelect label="Company" value={companyFilter} options={filterOptions.companies} onChange={setCompanyFilter} />
        <SearchableSelect label="Project" value={projectFilter} options={filterOptions.projects} onChange={setProjectFilter} />
        <SearchableSelect label="Employee" value={employeeFilter} options={employeeOptions.map((employee) => employee.name)} onChange={setEmployeeFilter} />
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
          <div className="overflow-auto rounded-lg border border-slate-200"><table className="w-full min-w-[1100px] border-collapse text-xs"><thead className="sticky top-0 z-10 bg-slate-800 text-left text-[10px] uppercase tracking-wide text-white"><tr>{columns.filter(({ key }) => visibleColumns[key]).map(({ key, label }) => <th key={key} className={`whitespace-nowrap px-3 py-1.5 font-medium print-col-${key} print-rotated-header ${leftAlignedColumns.has(key) ? 'text-left print-align-left' : ''}`}><button type="button" onClick={() => toggleSort(key)} disabled={key === 'serialNumber'} className="inline-flex items-center gap-1 disabled:cursor-default">{label}{sortIcon(key)}</button></th>)}</tr></thead><tbody>{filteredRows.length ? filteredRows.map((row, index) => <tr key={`${row.emp_id}-${row.date}-${index}`} className="border-t border-slate-100 even:bg-slate-50/60 hover:bg-teal-50/40">{columns.filter(({ key }) => visibleColumns[key]).map(({ key }) => <td key={key} className={`px-3 py-1 print-col-${key} ${leftAlignedColumns.has(key) ? 'text-left print-align-left' : ''} ${key === 'name' ? 'max-w-[180px] whitespace-normal break-words font-medium text-slate-700' : ''} ${key === 'remarks' ? 'max-w-[240px] whitespace-normal break-words' : ''} ${key.startsWith('display') ? 'tabular-nums' : ''}`}>{columnValue(row, key, index + 1)}</td>)}</tr>) : <tr><td colSpan={columns.filter(({ key }) => visibleColumns[key]).length} className="px-3 py-12 text-center text-slate-400">No records found</td></tr>}</tbody></table></div>
          {hasMore && <div className="flex justify-center gap-2 py-3"><button type="button" onClick={() => void fetchRows(false, rows.length)} disabled={loading || loadingAll} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{loading && !loadingAll && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Load 100 more</button><button type="button" onClick={() => void loadAllRows()} disabled={!dateFilter && !monthFilter || loading || loadingAll} title={!dateFilter && !monthFilter ? 'Select a day or month to load the full report' : 'Load full report'} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50">{loadingAll && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Load full report</button></div>}
        </>}
        {selectedEmployeeLabel && <div className="report-print-footer hidden text-xs font-medium text-slate-600">{selectedEmployeeLabel}</div>}
      </div>
    </div>
  );
}
