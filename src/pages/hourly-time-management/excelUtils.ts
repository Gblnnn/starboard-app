// =============================================================================
// Hourly Time Management — Excel Utilities
// Template download and attendance import/export.
// Uses @e965/xlsx (already installed). Prevents formula injection.
// =============================================================================

import * as XLSX from '@e965/xlsx';
import { format } from 'date-fns';
import type { HTMProjectConfig, HTMAttendance, PayrollLineResult } from './types';
import { PAY_CATEGORY_LABELS } from './types';
import { generateDateRange, validateDecimalHours } from './payrollEngine';

// Sanitize a cell value to prevent formula injection
const sanitize = (value: unknown): string => {
  const str = String(value ?? '');
  if (['=', '+', '-', '@', '\t', '\r'].some((c) => str.startsWith(c))) {
    return "'" + str; // prefix with single quote to prevent formula execution
  }
  return str;
};

// ---------------------------------------------------------------------------
// A. ATTENDANCE TEMPLATE DOWNLOAD
// ---------------------------------------------------------------------------
export function downloadAttendanceTemplate(
  projectConfig: HTMProjectConfig,
  projectName: string,
  employees: Array<{ emp_id: string; name: string }>,
  startDate: string,
  endDate: string,
): void {
  const dates = generateDateRange(startDate, endDate);
  const wb = XLSX.utils.book_new();

  // --- Instructions sheet ---
  const instrRows = [
    ['Hourly Time Management — Attendance Template'],
    [],
    [`Project Code: ${projectConfig.project_code}`],
    [`Project Name: ${projectName}`],
    [`Period: ${startDate} to ${endDate}`],
    [`Regular Hours: ${projectConfig.regular_hours}`],
    [],
    ['INSTRUCTIONS:'],
    ['1. Enter daily hours as decimal numbers (e.g., 8.50 = 8 hours 30 minutes, 7.25 = 7 hours 15 minutes).'],
    ['2. Do NOT interpret 8.30 as 8 hours 30 minutes — it means 8.3 decimal hours.'],
    ['3. Leave a cell BLANK to indicate attendance not entered (missing record).'],
    ['4. Enter 0 (zero) to indicate explicitly recorded zero hours.'],
    ['5. Hours must be between 0 and 24.'],
    ['6. Do not change the column headers or employee IDs.'],
    ['7. Do not add or remove rows in the Attendance sheet.'],
    ['8. Each date column header shows the full ISO date (YYYY-MM-DD). Do not change these.'],
  ];

  const instrWS = XLSX.utils.aoa_to_sheet(instrRows);
  instrWS['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, instrWS, 'Instructions');

  // --- Attendance sheet ---
  const header: (string | null)[] = ['Employee ID', 'Employee Name', ...dates.map((d) => d)];
  const rows: (string | number | null)[][] = [header];

  for (const emp of employees) {
    const row: (string | number | null)[] = [
      sanitize(emp.emp_id),
      sanitize(emp.name),
      ...dates.map(() => null), // blank = not entered
    ];
    rows.push(row);
  }

  const attendanceWS = XLSX.utils.aoa_to_sheet(rows);

  // Style column widths
  attendanceWS['!cols'] = [
    { wch: 14 }, // Employee ID
    { wch: 28 }, // Employee Name
    ...dates.map(() => ({ wch: 12 })),
  ];

  // Freeze first two columns and header row
  attendanceWS['!freeze'] = { xSplit: 2, ySplit: 1 };

  XLSX.utils.book_append_sheet(wb, attendanceWS, 'Attendance');

  const filename = `HTM_Attendance_${projectConfig.project_code}_${startDate}_${endDate}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ---------------------------------------------------------------------------
// B. EXCEL UPLOAD PARSING AND VALIDATION
// ---------------------------------------------------------------------------
export interface ParsedUploadResult {
  projectCode: string | null;
  startDate: string | null;
  endDate: string | null;
  dates: string[];
  rows: Array<{
    emp_id: string;
    employee_name: string;
    entries: Array<{ date: string; raw: string | number | null }>;
  }>;
  parseError: string | null;
}

export function parseAttendanceExcel(buffer: ArrayBuffer): ParsedUploadResult {
  try {
    const wb = XLSX.read(buffer, { type: 'array', cellDates: false });

    // Find Attendance sheet
    const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === 'attendance');
    if (!sheetName) {
      return { projectCode: null, startDate: null, endDate: null, dates: [], rows: [], parseError: 'Sheet named "Attendance" not found in uploaded file.' };
    }
    const ws = wb.Sheets[sheetName];
    const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      raw: true,
    });

    if (!data || data.length < 2) {
      return { projectCode: null, startDate: null, endDate: null, dates: [], rows: [], parseError: 'Attendance sheet has no data rows.' };
    }

    const header = (data[0] as (string | null)[]).map((h) => String(h ?? '').trim());
    if (header[0]?.toLowerCase() !== 'employee id' || header[1]?.toLowerCase() !== 'employee name') {
      return { projectCode: null, startDate: null, endDate: null, dates: [], rows: [], parseError: 'Invalid template format: expected "Employee ID" and "Employee Name" as first two columns.' };
    }

    // Extract date columns (columns from index 2 onward)
    const dateColumns = header.slice(2).filter(Boolean);
    const validDates: string[] = [];
    for (const col of dateColumns) {
      // Expect ISO date format YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(col)) {
        validDates.push(col);
      }
    }

    if (validDates.length === 0) {
      return { projectCode: null, startDate: null, endDate: null, dates: [], rows: [], parseError: 'No valid date columns found. Columns must be in YYYY-MM-DD format.' };
    }

    const startDate = validDates[0];
    const endDate = validDates[validDates.length - 1];

    const rows = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i] as (string | number | null)[];
      const emp_id = String(row[0] ?? '').trim();
      const employee_name = String(row[1] ?? '').trim();
      if (!emp_id) continue; // skip empty rows

      const entries = validDates.map((date, idx) => ({
        date,
        raw: row[2 + idx] ?? null,
      }));

      rows.push({ emp_id, employee_name, entries });
    }

    return { projectCode: null, startDate, endDate, dates: validDates, rows, parseError: null };
  } catch (err: any) {
    return { projectCode: null, startDate: null, endDate: null, dates: [], rows: [], parseError: `Failed to parse Excel file: ${err?.message || err}` };
  }
}

export interface UploadValidationRow {
  emp_id: string;
  employee_name: string;
  attendance_date: string;
  raw: string | number | null;
  hours_worked: number | null;
  status: 'valid' | 'invalid' | 'conflict' | 'skip';
  reason?: string;
  existing_hours?: number;
}

export function validateUploadRows(
  parsed: ParsedUploadResult,
  validEmpIds: Set<string>,
  existingAttendance: HTMAttendance[],
  validatedProjectCode: string,
): UploadValidationRow[] {
  const existingMap = new Map<string, HTMAttendance>();
  for (const rec of existingAttendance) {
    existingMap.set(`${rec.emp_id}::${rec.attendance_date}`, rec);
  }

  const results: UploadValidationRow[] = [];

  for (const row of parsed.rows) {
    for (const entry of row.entries) {
      const key = `${row.emp_id}::${entry.date}`;
      const raw = entry.raw;

      // Skip blank cells (not entered — no row will be created)
      if (raw === null || raw === '') {
        results.push({
          emp_id: row.emp_id,
          employee_name: row.employee_name,
          attendance_date: entry.date,
          raw,
          hours_worked: null,
          status: 'skip',
          reason: 'Blank cell — no entry created',
        });
        continue;
      }

      // Validate employee
      if (!validEmpIds.has(row.emp_id)) {
        results.push({
          emp_id: row.emp_id,
          employee_name: row.employee_name,
          attendance_date: entry.date,
          raw,
          hours_worked: null,
          status: 'invalid',
          reason: `Employee ID "${row.emp_id}" is not assigned to project ${validatedProjectCode} for this date`,
        });
        continue;
      }

      // Validate hours
      const validation = validateDecimalHours(raw);
      if (!validation.valid) {
        results.push({
          emp_id: row.emp_id,
          employee_name: row.employee_name,
          attendance_date: entry.date,
          raw,
          hours_worked: null,
          status: 'invalid',
          reason: validation.error ?? 'Invalid hours value',
        });
        continue;
      }

      const hours = Number(raw);
      const existing = existingMap.get(key);

      if (existing) {
        results.push({
          emp_id: row.emp_id,
          employee_name: row.employee_name,
          attendance_date: entry.date,
          raw,
          hours_worked: hours,
          status: 'conflict',
          reason: `Existing record has ${existing.hours_worked} hours — will update if approved`,
          existing_hours: existing.hours_worked,
        });
      } else {
        results.push({
          emp_id: row.emp_id,
          employee_name: row.employee_name,
          attendance_date: entry.date,
          raw,
          hours_worked: hours,
          status: 'valid',
        });
      }
    }
  }

  return results;
}

// Error report download
export function downloadErrorReport(errors: UploadValidationRow[]): void {
  const rows = [
    ['Employee ID', 'Employee Name', 'Date', 'Entered Value', 'Error Reason'],
    ...errors.map((e) => [
      sanitize(e.emp_id),
      sanitize(e.employee_name),
      sanitize(e.attendance_date),
      e.raw !== null && e.raw !== undefined ? String(e.raw) : '',
      sanitize(e.reason ?? ''),
    ]),
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Upload Errors');
  XLSX.writeFile(wb, `HTM_Upload_Errors_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
}

// ---------------------------------------------------------------------------
// C. PAYROLL TIMESHEET EXCEL EXPORT
// ---------------------------------------------------------------------------
export function downloadPayrollExcel(
  projectConfig: HTMProjectConfig,
  projectName: string,
  lines: PayrollLineResult[],
  dates: string[],
  periodLabel: string,
): void {
  const wb = XLSX.utils.book_new();

  // Header rows
  const headerRows: (string | number)[][] = [
    [`HOURLY TIME MANAGEMENT — PAYROLL TIMESHEET`],
    [`Project: ${projectConfig.project_code} — ${projectName}`],
    [`Period: ${periodLabel}`],
    [`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`],
    [],
  ];

  // Column headers: ID, Name, [date cols], Total Hrs, OT Hrs, Category, OT Mult, Normal Pay, OT Pay, Gross Pay
  const colHeader: string[] = [
    'Employee ID',
    'Employee Name',
    ...dates.map((d) => d),
    'Total Hours',
    'OT Hours',
    'Pay Category',
    'OT Multiplier',
    'Normal Pay (OMR)',
    'OT Pay (OMR)',
    'Gross Pay (OMR)',
  ];

  const dataRows: (string | number)[][] = lines.map((line) => [
    sanitize(line.emp_id),
    sanitize(line.employee_name),
    ...dates.map((d) => {
      const h = line.daily_hours[d];
      return h !== null && h !== undefined ? Number(h) : '';
    }),
    line.total_hours_worked,
    line.total_ot_hours,
    PAY_CATEGORY_LABELS[line.pay_category],
    line.ot_multiplier !== null ? Number(line.ot_multiplier) : 'N/A',
    line.normal_pay,
    line.ot_pay,
    line.gross_pay,
  ]);

  // Totals row
  const totalHours = lines.reduce((s, l) => s + l.total_hours_worked, 0);
  const totalOT    = lines.reduce((s, l) => s + l.total_ot_hours, 0);
  const totalNorm  = lines.reduce((s, l) => s + l.normal_pay, 0);
  const totalOTPay = lines.reduce((s, l) => s + l.ot_pay, 0);
  const totalGross = lines.reduce((s, l) => s + l.gross_pay, 0);

  const totalsRow: (string | number)[] = [
    'TOTAL',
    '',
    ...dates.map(() => ''),
    totalHours,
    totalOT,
    '',
    '',
    totalNorm,
    totalOTPay,
    totalGross,
  ];

  const allRows = [
    ...headerRows,
    colHeader,
    ...dataRows,
    totalsRow,
  ];

  const ws = XLSX.utils.aoa_to_sheet(allRows);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 28 },
    ...dates.map(() => ({ wch: 11 })),
    { wch: 12 },
    { wch: 10 },
    { wch: 22 },
    { wch: 12 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Payroll');

  const filename = `HTM_Payroll_${projectConfig.project_code}_${periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`;
  XLSX.writeFile(wb, filename);
}
