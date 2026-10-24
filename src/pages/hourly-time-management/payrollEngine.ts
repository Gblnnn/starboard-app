// =============================================================================
// Hourly Time Management — Payroll Calculation Engine
// This is the SINGLE AUTHORITATIVE source of all payroll formulas.
// UI display, Excel export, and finalization all call this module.
//
// Currency: OMR, rounded to 3 decimal places at the final step only.
// Intermediate calculations use full floating-point precision.
//
// OT Divisor Rule: ALWAYS equals project.regular_hours (never separate).
// Salary Denominator: ALWAYS 30 (never calendar days in month).
// Allowance is prorated by the actual calendar days in each month.
// =============================================================================

import { format, parseISO, getDay, getDaysInMonth } from 'date-fns';
import type { PayrollLineResult, HTMEmployeeConfig, HTMProjectConfig, HTMAttendance, HTMHoliday } from './types';

// ---------------------------------------------------------------------------
// Day-type helpers
// ---------------------------------------------------------------------------

/** Returns 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat */
const dow = (dateStr: string): number => getDay(parseISO(dateStr));

const isFriday   = (d: string): boolean => dow(d) === 5;
const isSaturday  = (d: string): boolean => dow(d) === 6;
/** Ordinary working day: Mon(1)–Thu(4) and Sun(0) */
const isOrdinary  = (d: string): boolean => [0, 1, 2, 3, 4].includes(dow(d));

// ---------------------------------------------------------------------------
// Round OMR to 3 decimal places (banker's rounding not required; standard)
// ---------------------------------------------------------------------------
export const roundOMR = (value: number): number =>
  Math.round(value * 1000) / 1000;

// ---------------------------------------------------------------------------
// Core payroll calculation for a single employee over a date range
// ---------------------------------------------------------------------------

export interface CalcInput {
  empConfig: Pick<HTMEmployeeConfig, 'pay_category' | 'monthly_salary' | 'allowance' | 'hourly_rate' | 'ot_multiplier'>;
  projectConfig: Pick<HTMProjectConfig, 'regular_hours'>;
  /** Attendance map: key = 'YYYY-MM-DD', value = hours_worked (number) or null (not entered) */
  attendanceMap: Record<string, number | null>;
  /** Holiday set: Set of 'YYYY-MM-DD' strings that are public holidays for this project */
  holidaySet: Set<string>;
  /** All dates in the payroll period, in chronological order */
  dates: string[];
}

export interface CalcResult {
  payable_days: number;
  total_hours_worked: number;
  total_ot_hours: number;
  normal_pay: number;
  ot_pay: number;
  allowance_pay: number;
  gross_pay: number;
  /** Per-date breakdown for reporting */
  date_breakdown: Record<string, {
    hours: number | null;
    is_friday: boolean;
    is_saturday: boolean;
    is_holiday: boolean;
    is_ordinary: boolean;
    is_payable: boolean;
    ot_hours: number;
  }>;
}

export function calculatePayroll(input: CalcInput): CalcResult {
  const { empConfig, projectConfig, attendanceMap, holidaySet, dates } = input;
  const { pay_category, monthly_salary, hourly_rate, ot_multiplier } = empConfig;
  const regularHours = Number(projectConfig.regular_hours);

  let payableDays = 0;
  let totalHoursWorked = 0;
  let totalOtHours = 0;
  const dateBreakdown: CalcResult['date_breakdown'] = {};

  for (const dateStr of dates) {
    const hoursRaw = attendanceMap[dateStr] ?? null; // null = not entered
    const hours = hoursRaw !== null ? Number(hoursRaw) : null;
    const friday = isFriday(dateStr);
    const saturday = isSaturday(dateStr);
    const ordinary = isOrdinary(dateStr);
    const holiday = holidaySet.has(dateStr);

    // --- Determine payable-day status ---
    let isPayable = false;
    let otHours = 0;
    const hoursForTotal = hours ?? 0;

    if (pay_category === 'hourly_pay') {
      // Hourly: paid for all recorded hours, no payable-day concept
      // We count payable_days = 1 for each day with hours > 0 for reporting only
      isPayable = hours !== null && hours > 0;
      otHours = 0;

    } else if (pay_category === 'fixed_no_ot') {
      // --- Fixed No OT ---
      if (holiday) {
        // Public holiday: always payable, no OT
        isPayable = true;
        otHours = 0;
      } else if (friday) {
        // Friday: always payable
        isPayable = true;
        otHours = 0;
      } else if (saturday) {
        // Saturday: payable only if hours > 0
        isPayable = hours !== null && hours > 0;
        otHours = 0;
      } else {
        // Ordinary (Mon–Thu, Sun): payable only if hours > 0
        isPayable = hours !== null && hours > 0;
        otHours = 0;
      }

    } else {
      // --- Fixed With OT ---
      if (holiday) {
        // Public holiday: always payable; all hours = OT
        // If holiday also falls on Fri/Sat, treat once — no double-counting
        isPayable = true;
        otHours = hoursForTotal; // all hours worked are OT
      } else if (friday) {
        // Friday: always payable; all hours = OT
        isPayable = true;
        otHours = hoursForTotal;
      } else if (saturday) {
        // Saturday: payable only if hours > 0; all hours = OT
        isPayable = hours !== null && hours > 0;
        otHours = isPayable ? hoursForTotal : 0;
      } else {
        // Ordinary: payable if hours > 0
        isPayable = hours !== null && hours > 0;
        if (isPayable) {
          // OT = hours above regularHours threshold
          otHours = Math.max(0, hoursForTotal - regularHours);
        }
      }
    }

    if (isPayable) payableDays += 1;
    totalHoursWorked += hoursForTotal;
    totalOtHours += otHours;

    dateBreakdown[dateStr] = {
      hours,
      is_friday: friday,
      is_saturday: saturday,
      is_holiday: holiday,
      is_ordinary: ordinary,
      is_payable: isPayable,
      ot_hours: otHours,
    };
  }

  // --- Compute monetary values ---
  let normalPay = 0;
  let otPay = 0;
  let allowancePay = 0;

  if (pay_category === 'hourly_pay') {
    normalPay = totalHoursWorked * (hourly_rate ?? 0);
    otPay = 0;

  } else if (pay_category === 'fixed_no_ot') {
    normalPay = ((monthly_salary ?? 0) / 30) * payableDays;
    otPay = 0;

  } else {
    // fixed_with_ot
    normalPay = ((monthly_salary ?? 0) / 30) * payableDays;
    // OT Rate = Salary / 30 / regularHours  (divisor is ALWAYS project.regular_hours)
    const otHourlyRate = regularHours > 0
      ? ((monthly_salary ?? 0) / 30) / regularHours
      : 0;
    otPay = otHourlyRate * (ot_multiplier ?? 1) * totalOtHours;
  }

  for (const dateStr of dates) {
    if ((attendanceMap[dateStr] ?? 0) > 0) {
      allowancePay += (empConfig.allowance ?? 0) / getDaysInMonth(parseISO(dateStr));
    }
  }

  const grossPay = normalPay + otPay + allowancePay;

  return {
    payable_days: payableDays,
    total_hours_worked: totalHoursWorked,
    total_ot_hours: totalOtHours,
    normal_pay: roundOMR(normalPay),
    ot_pay: roundOMR(otPay),
    allowance_pay: roundOMR(allowancePay),
    gross_pay: roundOMR(grossPay),
    date_breakdown: dateBreakdown,
  };
}

// ---------------------------------------------------------------------------
// Build payroll lines for an entire project/period
// ---------------------------------------------------------------------------
export interface BuildPayrollLinesInput {
  projectConfig: HTMProjectConfig;
  employeeConfigs: HTMEmployeeConfig[];
  attendanceRecords: HTMAttendance[];
  holidays: HTMHoliday[];
  dates: string[]; // sorted ISO date strings for the period
  employeeNames: Record<string, string>; // emp_id -> name
}

export function buildPayrollLines(input: BuildPayrollLinesInput): PayrollLineResult[] {
  const { projectConfig, employeeConfigs, attendanceRecords, holidays, dates, employeeNames } = input;

  // Build holiday set
  const holidaySet = new Set(holidays.map(h => h.holiday_date));

  // Build attendance map per employee: emp_id -> { date -> hours | null }
  const attendanceByEmp: Record<string, Record<string, number | null>> = {};
  for (const rec of attendanceRecords) {
    if (!attendanceByEmp[rec.emp_id]) attendanceByEmp[rec.emp_id] = {};
    attendanceByEmp[rec.emp_id][rec.attendance_date] = rec.hours_worked;
  }

  const lines: PayrollLineResult[] = [];

  for (const empConfig of employeeConfigs) {
    const empId = empConfig.emp_id;
    const attendanceMap: Record<string, number | null> = {};
    for (const d of dates) {
      attendanceMap[d] = attendanceByEmp[empId]?.[d] ?? null;
    }

    const result = calculatePayroll({
      empConfig,
      projectConfig,
      attendanceMap,
      holidaySet,
      dates,
    });

    // Build daily_hours for snapshot
    const dailyHours: Record<string, number | null> = {};
    for (const d of dates) {
      dailyHours[d] = attendanceMap[d];
    }

    lines.push({
      emp_id: empId,
      employee_name: employeeNames[empId] ?? empId,
      project_code: projectConfig.project_code,
      pay_category: empConfig.pay_category,
      monthly_salary: empConfig.monthly_salary,
      allowance: empConfig.allowance,
      hourly_rate: empConfig.hourly_rate,
      ot_multiplier: empConfig.ot_multiplier,
      regular_hours: projectConfig.regular_hours,
      daily_hours: dailyHours,
      payable_days: result.payable_days,
      total_hours_worked: result.total_hours_worked,
      total_ot_hours: result.total_ot_hours,
      normal_pay: result.normal_pay,
      ot_pay: result.ot_pay,
      allowance_pay: result.allowance_pay,
      gross_pay: result.gross_pay,
    });
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Validate decimal hours: must be >= 0, <= 24, and representable as
// integer minutes (i.e., fractional part must be a multiple of 1/60).
// We accept 2-decimal-place decimal-hour notation (e.g., 8.50, 7.25, 8.75).
// ---------------------------------------------------------------------------
export function validateDecimalHours(value: unknown): { valid: boolean; error?: string } {
  if (value === null || value === undefined || value === '') {
    return { valid: true }; // blank = not entered
  }
  const num = Number(value);
  if (isNaN(num)) return { valid: false, error: 'Not a number' };
  if (num < 0) return { valid: false, error: 'Hours cannot be negative' };
  if (num > 24) return { valid: false, error: 'Hours cannot exceed 24' };
  // Check valid minute precision: fractional part * 60 must be an integer
  const fractional = num - Math.floor(num);
  const minutes = Math.round(fractional * 60);
  if (Math.abs(minutes / 60 - fractional) > 0.0001) {
    return { valid: false, error: `${value} does not represent valid minutes (use decimal hours like 8.50, 7.25)` };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Generate date range array (ISO strings, inclusive)
// ---------------------------------------------------------------------------
export function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const current = new Date(start);
  while (current <= end) {
    dates.push(format(current, 'yyyy-MM-dd'));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Find the effective employee config for a given date
// ---------------------------------------------------------------------------
export function findEffectiveConfig(
  configs: HTMEmployeeConfig[],
  date: string,
): HTMEmployeeConfig | null {
  return (
    configs.find(
      (c) =>
        c.active &&
        c.effective_from <= date &&
        (c.effective_to === null || c.effective_to >= date),
    ) ?? null
  );
}
