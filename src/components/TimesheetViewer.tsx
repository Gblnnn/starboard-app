import { useAuth } from '@/components/AuthProvider';
import { DatePicker } from '@/components/date-picker';
import { ResponsiveModal } from '@/components/responsive-modal';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { db } from '@/firebase';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, where } from 'firebase/firestore';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleMinus, Download, Hash, Highlighter, Loader2, Plus, Search, X, User, Globe } from 'lucide-react';
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { parseLocationGeofence } from '../lib/geofence';
import { supabase } from '../lib/supabase';
import { yesterdayISO } from '../lib/utilis';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  id: number;
  device_user_id: string;
  name: string;
  department: string | null;
  emp_type: string | null;
  emp_id: string | null;
  company?: string | null;
  location?: string | null;
  nationality?: string | null;
}

interface TimesheetRow {
  id: string;
  date: string;
  employee_code: string;
  employee_name: string;
  project_code: string;
  punch_in: string;
  punch_out: string;
  status: string;
  overtime: string | number;
  remarks: string;
  verified_by: string | null;
  approved_by: string | null;
  approval: boolean;
  last_updated: string;
  total_working_hours?: number | null;
  overtime_minutes?: number | null;  
}

interface DaySummary {
  firstIn: string | null;
  firstInLocation: string | null;
  lastOut: string | null;
  lastOutLocation: string | null;
  firstPunch: string | null;
  firstPunchLocation: string | null;
  lastPunch: string | null;
  lastPunchLocation: string | null;
  isPresent: boolean;
  status?: string;
  overtime?: string | number;
  remarks?: string;
  approval?: boolean;
  approved_by?: string | null;
  verified_by?: string | null;
  totalWorkingHours?: number | null;
  overtimeMinutes?: number | null;  
}

type AttendanceMatrix = Record<string, Record<string, DaySummary>>;

type ReportType = 'inout' | 'pa' | 'hourly' | 'location_inout';
type ReportView = 'daily' | 'individual' | 'monthly';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string | null): string {
  if (!iso) return '';
  if (iso.includes(':') && !iso.includes('T')) return iso.slice(0, 5); // Already HH:MM
  try {
    return new Date(iso).toLocaleTimeString('en-OM', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Muscat',
    });
  } catch (e) {
    return iso.slice(0, 5);
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getDayName(year: number, month: number, day: number): string {
  return new Date(year, month, day).toLocaleDateString('en-OM', { weekday: 'short' });
}

function isWeekend(year: number, month: number, day: number, emp?: Employee): boolean {
  const d = new Date(year, month, day).getDay();
  const isOmani = emp?.nationality?.toLowerCase().trim() === 'omani';
  if (isOmani) {
    return d === 5 || d === 6; // Friday and Saturday
  }
  return d === 5; // Friday only
}

function monthLabel(month: number, year: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-OM', { month: 'long', year: 'numeric' });
}

function getDayHours(summary: DaySummary | undefined): string {
    if (summary?.totalWorkingHours !== undefined && summary.totalWorkingHours !== null) {
    return summary.totalWorkingHours > 0 ? summary.totalWorkingHours.toFixed(1) : '—';
  }
  if (!summary || !summary.firstPunch || !summary.lastPunch) return '—';
  //if (summary.status === 'off' || summary.status === 'leave' || summary.status === 'absent') return '—';
  if (summary.status === 'leave' || summary.status === 'absent') return '—';
  let diffHrs = 0;
  if (summary.firstPunch.includes(':') && !summary.firstPunch.includes('T')) {
    const [h1, m1] = summary.firstPunch.split(':').map(Number);
    const [h2, m2] = summary.lastPunch.split(':').map(Number);
    const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff > 0) {
      diffHrs = diff / 60;
    } else {
      return '—';
    }
  } else {
    const start = new Date(summary.firstPunch).getTime();
    const end = new Date(summary.lastPunch).getTime();
    if (isNaN(start) || isNaN(end)) return '—';
    diffHrs = (end - start) / (1000 * 60 * 60);
  }

  const finalHrs = Math.max(0, diffHrs - 1);
  return finalHrs > 0 ? finalHrs.toFixed(1) : '—';
}

function getOvertime(summary: DaySummary | undefined, _empType?: string | null): string {
  if (summary?.overtimeMinutes !== undefined && summary.overtimeMinutes !== null) {
    return summary.overtimeMinutes > 0 ? (summary.overtimeMinutes / 60).toFixed(1) : '—';
  }  
//  if (summary && summary.overtime !== undefined) {
//  const otVal = typeof summary.overtime === 'string' ? parseFloat(summary.overtime) : summary.overtime;
//  if (otVal && !isNaN(otVal) && otVal > 0) {
//    return otVal.toFixed(1);
   if (summary?.firstPunch && summary.lastPunch) {
    const parsePunch = (value: string): number | null => {
      if (value.includes(':') && !value.includes('T')) {
        const [hours, minutes] = value.split(':').map(Number);
        if (Number.isFinite(hours) && Number.isFinite(minutes)) return hours * 60 + minutes;
        return null;
      }
      const timestamp = new Date(value).getTime();
      return Number.isNaN(timestamp) ? null : timestamp / (1000 * 60);
    };

    const start = parsePunch(summary.firstPunch);
    const end = parsePunch(summary.lastPunch);
    if (start !== null && end !== null) {
      const diffMinutes = end >= start ? end - start : end + 24 * 60 - start;
      return diffMinutes > 0 ? (diffMinutes / 60).toFixed(1) : '—';
    }
  }
  return '—';
}

// Shared row height so both tables stay in sync
const ROW_H = 44;
const HEAD_R1 = 40;
const HEAD_R2 = 26;

// ─── Memoized Subcomponents ───────────────────────────────────────────────────

const InCell = memo(({ daySummary, year, month, d, today, useFirstLast, holidayMap, emp }: {
  daySummary: DaySummary | undefined;
  year: number;
  month: number;
  d: number;
  today: Date;
  useFirstLast: boolean;
  holidayMap: Record<number, { id: string; name: string }>;
  emp?: Employee;
}) => {
  if (daySummary?.status === 'leave') return <td className="text-center text-amber-600 font-bold text-[12px] bg-amber-50/20" style={{ height: ROW_H }}>L</td>;
  if (daySummary?.status === 'off') return <td className="text-center text-slate-400 font-semibold text-[11px] bg-slate-50/50" style={{ height: ROW_H }}>OFF</td>;
  if (daySummary?.status === 'absent') return <td className="text-center text-red-500 font-bold text-[12px] bg-red-50/10" style={{ height: ROW_H }}>A</td>;

  if (isWeekend(year, month, d, emp)) {
    if (daySummary?.isPresent) {
      const displayTime = useFirstLast ? formatTime(daySummary.firstPunch) : (formatTime(daySummary.firstIn) || '✓');
      const isApproved = daySummary.approved_by || daySummary.approval;
      const textColor = isApproved ? 'text-indigo-600 font-medium' : 'text-slate-500 font-medium';
      const bgStyle = isApproved ? { height: ROW_H, backgroundColor: '#f0f3ff' } : { height: ROW_H, backgroundColor: '#fef3c7' };
      return (
        <td className={`text-center font-medium tabular-nums text-[11px] whitespace-nowrap ${textColor}`} style={bgStyle} title="Weekend Worked">
          {displayTime} (W)
        </td>
      );
    }
    return <td className="bg-gray-50 text-gray-300 text-center text-[12px]" style={{ height: ROW_H }}>—</td>;
  }
  const holiday = holidayMap?.[d];
  if (holiday) {
    if (daySummary?.isPresent) {
      const displayTime = useFirstLast ? formatTime(daySummary.firstPunch) : (formatTime(daySummary.firstIn) || '✓');
      const isApproved = daySummary.approved_by || daySummary.approval;
      const textColor = isApproved ? 'text-indigo-600 font-medium' : 'text-slate-500 font-medium';
      const bgStyle = isApproved ? { height: ROW_H, backgroundColor: '#f0f3ff' } : { height: ROW_H, backgroundColor: '#f4f7ff' };
      return (
        <td className={`text-center font-medium tabular-nums text-[11px] whitespace-nowrap ${textColor}`} style={bgStyle} title={`Holiday Worked: ${holiday.name}`}>
          {displayTime} (H)
        </td>
      );
    }
    return (
      <td className="text-center text-indigo-600 font-bold text-[12px]" style={{ height: ROW_H, backgroundColor: '#f4f7ff' }} title={holiday.name}>
        H
      </td>
    );
  }
  if (daySummary?.isPresent) {
    const displayTime = useFirstLast ? formatTime(daySummary.firstPunch) : (formatTime(daySummary.firstIn) || '✓');
    const isApproved = daySummary.approved_by || daySummary.approval;
    const textColor = isApproved ? 'text-indigo-600 font-medium' : 'text-slate-500 font-medium';
    const bgStyle = isApproved ? { height: ROW_H, backgroundColor: '#f0f3ff' } : { height: ROW_H };
    return (
      <td className={`text-center font-medium tabular-nums text-[12px] whitespace-nowrap ${textColor}`} style={bgStyle}>
        {displayTime}
      </td>
    );
  }

  const isFuture = new Date(year, month, d) > today;
  if (isFuture) return <td className="text-center text-gray-300 text-[12px]" style={{ height: ROW_H }}>—</td>;

  return <td className="text-center text-red-400 font-bold text-[12px]" style={{ height: ROW_H }}>A</td>;
});
InCell.displayName = 'InCell';

const OutCell = memo(({ daySummary, year, month, d, useFirstLast, holidayMap, emp }: {
  daySummary: DaySummary | undefined;
  year: number;
  month: number;
  d: number;
  useFirstLast: boolean;
  holidayMap: Record<number, { id: string; name: string }>;
  emp?: Employee;
}) => {
  if (daySummary?.status === 'leave' || daySummary?.status === 'off' || daySummary?.status === 'absent') {
    const bg = daySummary.status === 'off' ? 'bg-slate-50/50' : daySummary.status === 'leave' ? 'bg-amber-50/10' : 'bg-red-50/10';
    return <td className={`text-center text-[12px] ${bg}`} style={{ height: ROW_H }} />;
  }

  if (isWeekend(year, month, d, emp)) {
    if (daySummary?.isPresent) {
      const displayTime = useFirstLast
        ? (daySummary.firstPunch === daySummary.lastPunch ? '' : formatTime(daySummary.lastPunch))
        : (formatTime(daySummary.lastOut) || '—');
      const isApproved = daySummary.approved_by || daySummary.approval;
      const textColor = isApproved ? 'text-indigo-600 font-medium' : 'text-slate-500 font-medium';
      const bgStyle = isApproved ? { height: ROW_H, backgroundColor: '#f0f3ff' } : { height: ROW_H, backgroundColor: '#fef3c7' };
      return (
        <td className={`text-center font-medium tabular-nums text-[11px] whitespace-nowrap ${textColor}`} style={bgStyle} title="Weekend Worked">
          {displayTime}
        </td>
      );
    }
    return <td className="bg-gray-50 text-gray-300 text-center text-[12px]" style={{ height: ROW_H }}>—</td>;
  }
  const holiday = holidayMap?.[d];
  if (holiday) {
    if (daySummary?.isPresent) {
      const displayTime = useFirstLast
        ? (daySummary.firstPunch === daySummary.lastPunch ? '' : formatTime(daySummary.lastPunch))
        : (formatTime(daySummary.lastOut) || '—');
      const isApproved = daySummary.approved_by || daySummary.approval;
      const textColor = isApproved ? 'text-indigo-600 font-medium' : 'text-slate-500 font-medium';
      const bgStyle = isApproved ? { height: ROW_H, backgroundColor: '#f0f3ff' } : { height: ROW_H, backgroundColor: '#f4f7ff' };
      return (
        <td className={`text-center font-medium tabular-nums text-[11px] whitespace-nowrap ${textColor}`} style={bgStyle} title={`Holiday Worked: ${holiday.name}`}>
          {displayTime}
        </td>
      );
    }
    return <td className="text-center text-[12px]" style={{ height: ROW_H, backgroundColor: '#f4f7ff' }} title={holiday.name} />;
  }
  if (daySummary?.isPresent) {
    const displayTime = useFirstLast
      ? (daySummary.firstPunch === daySummary.lastPunch ? '' : formatTime(daySummary.lastPunch))
      : (formatTime(daySummary.lastOut) || '—');
    const isApproved = daySummary.approved_by || daySummary.approval;
    const textColor = isApproved ? 'text-indigo-600 font-medium' : 'text-slate-500 font-medium';
    const bgStyle = isApproved ? { height: ROW_H, backgroundColor: '#f0f3ff' } : { height: ROW_H };
    return (
      <td className={`text-center font-medium tabular-nums text-[12px] whitespace-nowrap ${textColor}`} style={bgStyle}>
        {displayTime}
      </td>
    );
  }
  return <td className="text-center text-[12px]" style={{ height: ROW_H }} />;
});
OutCell.displayName = 'OutCell';

const LocationInCell = memo(({ daySummary, year, month, d, today, useFirstLast, holidayMap, emp }: {
  daySummary: DaySummary | undefined;
  year: number;
  month: number;
  d: number;
  today: Date;
  useFirstLast: boolean;
  holidayMap: Record<number, { id: string; name: string }>;
  emp?: Employee;
}) => {
  if (daySummary?.status === 'leave') return <td className="text-center text-amber-600 font-bold text-[12px] bg-amber-50/20" style={{ height: ROW_H }}>L</td>;
  if (daySummary?.status === 'off') return <td className="text-center text-slate-400 font-semibold text-[11px] bg-slate-50/50" style={{ height: ROW_H }}>OFF</td>;
  if (daySummary?.status === 'absent') return <td className="text-center text-red-500 font-bold text-[12px] bg-red-50/10" style={{ height: ROW_H }}>A</td>;

  if (isWeekend(year, month, d, emp)) {
    if (daySummary?.isPresent) {
      const displayTime = useFirstLast ? formatTime(daySummary.firstPunch) : (formatTime(daySummary.firstIn) || '✓');
      const displayLoc = useFirstLast ? daySummary.firstPunchLocation : (daySummary.firstInLocation || '—');
      const isApproved = daySummary.approved_by || daySummary.approval;
      const textColor = isApproved ? 'text-indigo-600 font-medium' : 'text-slate-500 font-medium';
      const bgStyle = isApproved ? { height: ROW_H, verticalAlign: 'middle', padding: '2px', backgroundColor: '#f0f3ff' } : { height: ROW_H, verticalAlign: 'middle', padding: '2px', backgroundColor: '#fef3c7' };
      return (
        <td className="text-center" style={bgStyle} title="Weekend Worked">
          <div className="flex flex-col items-center justify-center leading-tight">
            <span className={`tabular-nums text-[11px] ${textColor}`}>{displayTime} (W)</span>
            <span className="text-gray-400 text-[10px] truncate max-w-[110px]" title={displayLoc || ''}>{displayLoc || '—'}</span>
          </div>
        </td>
      );
    }
    return <td className="bg-gray-50 text-gray-300 text-center text-[11px]" style={{ height: ROW_H }}>—</td>;
  }
  const holiday = holidayMap?.[d];
  if (holiday) {
    if (daySummary?.isPresent) {
      const displayTime = useFirstLast ? formatTime(daySummary.firstPunch) : (formatTime(daySummary.firstIn) || '✓');
      const displayLoc = useFirstLast ? daySummary.firstPunchLocation : (daySummary.firstInLocation || '—');
      const isApproved = daySummary.approved_by || daySummary.approval;
      const textColor = isApproved ? 'text-indigo-600 font-medium' : 'text-slate-500 font-medium';
      const bgStyle = isApproved ? { height: ROW_H, verticalAlign: 'middle', padding: '2px', backgroundColor: '#f0f3ff' } : { height: ROW_H, verticalAlign: 'middle', padding: '2px', backgroundColor: '#f4f7ff' };
      return (
        <td className="text-center" style={bgStyle} title={`Holiday Worked: ${holiday.name}`}>
          <div className="flex flex-col items-center justify-center leading-tight">
            <span className={`tabular-nums text-[11px] ${textColor}`}>{displayTime} (H)</span>
            <span className="text-gray-400 text-[10px] truncate max-w-[110px]" title={displayLoc || ''}>{displayLoc || '—'}</span>
          </div>
        </td>
      );
    }
    return (
      <td className="text-center text-indigo-600 font-bold text-[12px]" style={{ height: ROW_H, backgroundColor: '#f4f7ff' }} title={holiday.name}>
        H
      </td>
    );
  }
  if (daySummary?.isPresent) {
    const displayTime = useFirstLast ? formatTime(daySummary.firstPunch) : (formatTime(daySummary.firstIn) || '✓');
    const displayLoc = useFirstLast ? daySummary.firstPunchLocation : (daySummary.firstInLocation || '—');
    const isApproved = daySummary.approved_by || daySummary.approval;
    const textColor = isApproved ? 'text-indigo-600 font-medium' : 'text-slate-500 font-medium';
    const bgStyle = isApproved ? { height: ROW_H, verticalAlign: 'middle', padding: '2px', backgroundColor: '#f0f3ff' } : { height: ROW_H, verticalAlign: 'middle', padding: '2px', backgroundColor: 'white' };
    return (
      <td className="text-center" style={bgStyle}>
        <div className="flex flex-col items-center justify-center leading-tight">
          <span className={`tabular-nums text-[12px] ${textColor}`}>{displayTime}</span>
          <span className="text-gray-400 text-[10px] truncate max-w-[110px]" title={displayLoc || ''}>{displayLoc || '—'}</span>
        </div>
      </td>
    );
  }

  const isFuture = new Date(year, month, d) > today;
  if (isFuture) return <td className="text-center text-gray-300 text-[12px]" style={{ height: ROW_H }}>—</td>;

  return <td className="text-center text-red-400 font-bold text-[12px]" style={{ height: ROW_H }}>A</td>;
});
LocationInCell.displayName = 'LocationInCell';

const LocationOutCell = memo(({ daySummary, year, month, d, useFirstLast, holidayMap, emp }: {
  daySummary: DaySummary | undefined;
  year: number;
  month: number;
  d: number;
  useFirstLast: boolean;
  holidayMap: Record<number, { id: string; name: string }>;
  emp?: Employee;
}) => {
  if (daySummary?.status === 'leave' || daySummary?.status === 'off' || daySummary?.status === 'absent') {
    const bg = daySummary.status === 'off' ? 'bg-slate-50/50' : daySummary.status === 'leave' ? 'bg-amber-50/10' : 'bg-red-50/10';
    return <td className={`text-center text-[12px] ${bg}`} style={{ height: ROW_H }} />;
  }

  if (isWeekend(year, month, d, emp)) {
    if (daySummary?.isPresent) {
      const displayTime = useFirstLast
        ? (daySummary.firstPunch === daySummary.lastPunch ? '' : formatTime(daySummary.lastPunch))
        : (formatTime(daySummary.lastOut) || '—');
      const displayLoc = useFirstLast
        ? (daySummary.firstPunch === daySummary.lastPunch ? '' : (daySummary.lastPunchLocation || '—'))
        : (daySummary.lastOutLocation || '—');

      if (!displayTime && !displayLoc) {
        return <td className="text-center text-[12px] bg-gray-50" style={{ height: ROW_H }} />;
      }

      const isApproved = daySummary.approved_by || daySummary.approval;
      const textColor = isApproved ? 'text-indigo-600 font-medium' : 'text-slate-500 font-medium';
      const bgStyle = isApproved ? { height: ROW_H, verticalAlign: 'middle', padding: '2px', backgroundColor: '#f0f3ff' } : { height: ROW_H, verticalAlign: 'middle', padding: '2px', backgroundColor: '#fef3c7' };

      return (
        <td className="text-center" style={bgStyle} title="Weekend Worked">
          <div className="flex flex-col items-center justify-center leading-tight">
            <span className={`tabular-nums text-[11px] ${textColor}`}>{displayTime || '—'}</span>
            <span className="text-gray-400 text-[10px] truncate max-w-[110px]" title={displayLoc || ''}>{displayLoc || '—'}</span>
          </div>
        </td>
      );
    }
    return <td className="bg-gray-50 text-gray-300 text-center text-[11px]" style={{ height: ROW_H }}>—</td>;
  }
  const holiday = holidayMap?.[d];
  if (holiday) {
    if (daySummary?.isPresent) {
      const displayTime = useFirstLast
        ? (daySummary.firstPunch === daySummary.lastPunch ? '' : formatTime(daySummary.lastPunch))
        : (formatTime(daySummary.lastOut) || '—');
      const displayLoc = useFirstLast
        ? (daySummary.firstPunch === daySummary.lastPunch ? '' : (daySummary.lastPunchLocation || '—'))
        : (daySummary.lastOutLocation || '—');

      if (!displayTime && !displayLoc) {
        return <td className="text-center text-[12px]" style={{ height: ROW_H, backgroundColor: '#f4f7ff' }} />;
      }

      const isApproved = daySummary.approved_by || daySummary.approval;
      const textColor = isApproved ? 'text-indigo-600 font-medium' : 'text-slate-500 font-medium';
      const bgStyle = isApproved ? { height: ROW_H, verticalAlign: 'middle', padding: '2px', backgroundColor: '#f0f3ff' } : { height: ROW_H, verticalAlign: 'middle', padding: '2px', backgroundColor: '#f4f7ff' };

      return (
        <td className="text-center" style={bgStyle} title={`Holiday Worked: ${holiday.name}`}>
          <div className="flex flex-col items-center justify-center leading-tight">
            <span className={`tabular-nums text-[11px] ${textColor}`}>{displayTime || '—'}</span>
            <span className="text-gray-400 text-[10px] truncate max-w-[110px]" title={displayLoc || ''}>{displayLoc || '—'}</span>
          </div>
        </td>
      );
    }
    return <td className="text-center text-[12px]" style={{ height: ROW_H, backgroundColor: '#f4f7ff' }} title={holiday.name} />;
  }
  if (daySummary?.isPresent) {
    const displayTime = useFirstLast
      ? (daySummary.firstPunch === daySummary.lastPunch ? '' : formatTime(daySummary.lastPunch))
      : (formatTime(daySummary.lastOut) || '—');
    const displayLoc = useFirstLast
      ? (daySummary.firstPunch === daySummary.lastPunch ? '' : (daySummary.lastPunchLocation || '—'))
      : (daySummary.lastOutLocation || '—');

    if (!displayTime && !displayLoc) {
      return <td className="text-center text-[12px]" style={{ height: ROW_H }} />;
    }

    const isApproved = daySummary.approved_by || daySummary.approval;
    const textColor = isApproved ? 'text-indigo-600 font-medium' : 'text-slate-500 font-medium';
    const bgStyle = isApproved ? { height: ROW_H, verticalAlign: 'middle', padding: '2px', backgroundColor: '#f0f3ff' } : { height: ROW_H, verticalAlign: 'middle', padding: '2px', backgroundColor: 'white' };

    return (
      <td className="text-center" style={bgStyle}>
        <div className="flex flex-col items-center justify-center leading-tight">
          <span className={`tabular-nums text-[12px] ${textColor}`}>{displayTime || '—'}</span>
          <span className="text-gray-400 text-[10px] truncate max-w-[110px]" title={displayLoc || ''}>{displayLoc || '—'}</span>
        </div>
      </td>
    );
  }
  return <td className="text-center text-[12px]" style={{ height: ROW_H }} />;
});
LocationOutCell.displayName = 'LocationOutCell';

interface FrozenRowProps {
  emp: Employee;
  index: number;
  locationList: string;
  presenceCount: number;
  absentCount: number;
  overtimeCount: string;
  showOvertime: boolean;
  isHighlighted?: boolean;
  onClick?: () => void;
  highlightMode?: boolean;
  isFocal?: boolean;
}

const FrozenRow = memo(({ emp, index, locationList, presenceCount, absentCount, overtimeCount, showOvertime, isHighlighted, onClick, highlightMode, isFocal }: FrozenRowProps) => {
  return (
    <tr
      onClick={onClick}
      className={`${isHighlighted ? 'highlighted-row' : ''} ${highlightMode ? 'cursor-pointer' : ''}`}
      style={{ height: ROW_H, borderBottom: '1px solid #f9fafb' }}
    >
      <td className="text-[13px] text-gray-400 text-center bg-white px-1">{index + 1}</td>
      <td style={{ textTransform: "capitalize" }} className="text-[13px] font-medium text-gray-900 bg-white px-3 whitespace-nowrap animate-fade-in">
        {(emp.name || '').toLowerCase()}
        {emp.emp_id && <div className="text-[11px] text-gray-400 font-normal">{emp.emp_id}</div>}
      </td>
      {!isFocal && (
        <td
          className="text-[13px] text-gray-500 bg-white px-2 truncate"
          style={{ maxWidth: 170 }}
          title={locationList}
        >
          {locationList}
        </td>
      )}
      <td className="text-center text-[13px] font-semibold text-emerald-700" style={{ background: '#ecfdf5', height: ROW_H }}>
        {presenceCount}
      </td>
      <td className="text-center text-[13px] font-semibold text-red-600" style={{ background: '#fef2f2', height: ROW_H }}>
        {absentCount}
      </td>
      {showOvertime && (
        <td className="text-center text-[13px] font-semibold text-amber-700" style={{ background: '#fffbeb', height: ROW_H }}>
          {overtimeCount}
        </td>
      )}
      <td className="bg-white" />
    </tr>
  );
});
FrozenRow.displayName = 'FrozenRow';

interface ScrollableRowProps {
  emp: Employee;
  dayList: number[];
  reportType: ReportType;
  useFirstLast: boolean;
  matrixForEmployee: Record<string, DaySummary> | undefined;
  year: number;
  month: number;
  today: Date;
  holidayMap: Record<number, { id: string; name: string }>;
  isHighlighted?: boolean;
  onClick?: () => void;
  highlightMode?: boolean;
}

const ScrollableRow = memo(({
  emp,
  dayList,
  reportType,
  useFirstLast,
  matrixForEmployee,
  year,
  month,
  today,
  holidayMap,
  isHighlighted,
  onClick,
  highlightMode
}: ScrollableRowProps) => {
  return (
    <tr
      onClick={onClick}
      className={`hover:bg-blue-50/20 ${isHighlighted ? 'highlighted-row' : ''} ${highlightMode ? 'cursor-pointer' : ''}`}
      style={{ height: ROW_H, borderBottom: '1px solid #f9fafb' }}
    >
      {dayList.map(d => {
        const pad = (n: number) => String(n).padStart(2, '0');
        const dateKey = `${year}-${pad(month + 1)}-${pad(d)}`;
        const c = matrixForEmployee?.[dateKey];

        if (reportType === 'hourly') {
          const holiday = holidayMap?.[d];
          const bg = isWeekend(year, month, d, emp) ? '#f9fafb' : holiday ? '#eef2ff' : 'white';
          return (
            <td key={`day-${d}`} className="text-center text-[12px] font-medium text-gray-400" style={{ height: ROW_H, background: bg }} title={holiday ? `Holiday: ${holiday.name}` : undefined}>
              {holiday && (!c || !c.isPresent) ? 'HOL' : getDayHours(c)}
            </td>
          );
        }
        if (reportType === 'pa') {
          let content = '';
          let color = '';
          const holiday = holidayMap?.[d];
          const bg = isWeekend(year, month, d, emp) ? '#f9fafb' : holiday ? '#eef2ff' : 'white';

          if (c?.status === 'leave') { content = 'L'; color = 'text-amber-600 font-bold'; }
          else if (c?.status === 'off') { content = 'OFF'; color = 'text-slate-400 font-semibold'; }
          else if (c?.status === 'absent') { content = 'A'; color = 'text-red-400 font-bold'; }
          else if (isWeekend(year, month, d, emp)) {
            if (c?.isPresent) { content = 'P(W)'; color = 'text-teal-600 font-bold'; }
            else { content = '—'; color = 'text-gray-300'; }
          }
          else if (holiday) {
            if (c?.isPresent) { content = 'P(H)'; color = 'text-teal-600 font-bold'; }
            else { content = 'H'; color = 'text-indigo-500 font-bold'; }
          }
          else if (c?.isPresent) { content = 'P'; color = 'text-emerald-500 font-bold'; }
          else if (new Date(year, month, d) > today) { content = '—'; color = 'text-gray-300'; }
          else { content = 'A'; color = 'text-red-400 font-bold'; }

          return (
            <td key={`day-${d}`} className={`text-center text-[12px] ${color}`} style={{ height: ROW_H, background: bg }} title={holiday ? `Holiday: ${holiday.name}` : undefined}>
              {content}
            </td>
          );
        }
        if (reportType === 'location_inout') {
          return (
            <Fragment key={`day-${d}`}>
              <LocationInCell daySummary={c} year={year} month={month} d={d} today={today} useFirstLast={useFirstLast} holidayMap={holidayMap} emp={emp} />
              <LocationOutCell daySummary={c} year={year} month={month} d={d} useFirstLast={useFirstLast} holidayMap={holidayMap} emp={emp} />
            </Fragment>
          );
        }
        return (
          <Fragment key={`day-${d}`}>
            <InCell daySummary={c} year={year} month={month} d={d} today={today} useFirstLast={useFirstLast} holidayMap={holidayMap} emp={emp} />
            <OutCell daySummary={c} year={year} month={month} d={d} useFirstLast={useFirstLast} holidayMap={holidayMap} emp={emp} />
          </Fragment>
        );
      })}
    </tr>
  );
});
ScrollableRow.displayName = 'ScrollableRow';

// ─── Component ────────────────────────────────────────────────────────────────

interface TimesheetViewerProps {
  refreshTrigger?: number;
  onLoadingChange?: (loading: boolean) => void;
  source?: 'timesheet' | 'summary_view';  
}

export default function TimesheetViewer({ refreshTrigger, onLoadingChange, source = 'timesheet' }: TimesheetViewerProps = {}) {
  const { userData } = useAuth();



  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [timesheetData, setTimesheetData] = useState<TimesheetRow[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [isFocal, setIsFocal] = useState(false);
  const [projectNameMap, setProjectNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedEmpPrefixes, setSelectedEmpPrefixes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [presenceFilter, setPresenceFilter] = useState<'ALL' | 'ZERO' | 'NON_ZERO'>('ALL');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [nationalityFilter, setNationalityFilter] = useState<'ALL' | 'OMANI' | 'NON_OMANI'>('ALL');
  const [highlightMode, setHighlightMode] = useState(false);
  const [highlightedRows, setHighlightedRows] = useState<Set<string>>(new Set());

  const toggleRowHighlight = (deviceUserId: string) => {
    setHighlightedRows(prev => {
      const next = new Set(prev);
      if (next.has(deviceUserId)) {
        next.delete(deviceUserId);
      } else {
        next.add(deviceUserId);
      }
      return next;
    });
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [reportType, setReportType] = useState<ReportType>('pa');
  const [useFirstLast] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [reportView, setReportView] = useState<ReportView>('daily');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedDailyDate, setSelectedDailyDate] = useState<string>(() => yesterdayISO());
  const [empSearch, setEmpSearch] = useState("");
  const [openEmpSelect, setOpenEmpSelect] = useState(false);

  // Pagination / Rendering Limit state
  const [renderLimit, setRenderLimit] = useState(100);

  useEffect(() => {
    setRenderLimit(100);
  }, [searchQuery, selectedDepartments, selectedLocations, selectedEmpPrefixes, selectedStatuses, presenceFilter, reportView, reportType, selectedDailyDate, nationalityFilter]);

  // Holidays State
  interface Holiday {
    id: string;
    day: number;
    name: string;
  }
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [newHolidayDay, setNewHolidayDay] = useState(1);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [holidaySubmitting, setHolidaySubmitting] = useState(false);

  // Realtime holidays fetch from Firestore
  useEffect(() => {
    const q = query(
      collection(db, 'attendance_holidays'),
      where('year', '==', year),
      where('month', '==', month)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Holiday[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          day: data.day,
          name: data.name
        });
      });
      list.sort((a, b) => a.day - b.day);
      setHolidays(list);
    }, (err) => {
      console.error('Error fetching holidays:', err);
    });

    return () => unsubscribe();
  }, [year, month]);

  const holidayMap = useMemo(() => {
    const map: Record<number, { id: string; name: string }> = {};
    holidays.forEach(h => {
      map[h.day] = { id: h.id, name: h.name };
    });
    return map;
  }, [holidays]);

  const isHoliday = useCallback((d: number) => {
    return !!holidayMap[d];
  }, [holidayMap]);

  const rightRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const tableAreaRef = useRef<HTMLDivElement>(null);
  const dayHeaderDragRef = useRef({ isDragging: false, startX: 0, startScrollLeft: 0 });
  const [isDayHeaderDragging, setIsDayHeaderDragging] = useState(false);

  const days = daysInMonth(year, month);
  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => i + 1), [days]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    let start = '';
    let end = '';

    if (reportView === 'daily') {
      if (!selectedDailyDate) {
        setLoading(false);
        return;
      }
      start = selectedDailyDate;
      end = selectedDailyDate;
    } else {
      const pad = (n: number) => String(n).padStart(2, '0');
      start = `${year}-${pad(month + 1)}-01`;
      end = `${year}-${pad(month + 1)}-${pad(days)}`;
    }

    try {
      const { data: allProjectsData } = await supabase
        .from('projects')
        .select('project_code, project_name');

      const nameMap: Record<string, string> = {};
      (allProjectsData || []).forEach(p => {
        const normCode = p.project_code.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normName = p.project_name.toLowerCase().replace(/[^a-z0-9]/g, '');
        nameMap[normCode] = p.project_name;
        nameMap[normName] = p.project_name;
      });
      setProjectNameMap(nameMap);

      // 1. Fetch timesheet records from Supabase first
      // 1. Fetch report records from Supabase first      
      let allTimesheets: TimesheetRow[] = [];
      let fromRange = 0;
      let toRange = 999;
      let finished = false;

      while (!finished) {
        const { data: timesheetResult, error: tsErr } = await supabase
          .from(source === 'summary_view' ? 'v_employee_timesheet_summary' : 'timesheet')
          .select('*')
          .gte('date', start)
          .lte('date', end)
          .range(fromRange, toRange);

        if (tsErr) {
          setError(tsErr.message);
          setLoading(false);
          return;
        }

        if (timesheetResult && timesheetResult.length > 0) {
          allTimesheets = [...allTimesheets, ...timesheetResult];
          if (timesheetResult.length < 1000) {
            finished = true;
          } else {
            fromRange += 1000;
            toRange += 1000;
          }
        } else {
          finished = true;
        }
      }

      // 2. Fetch employee, device and transfer details
      let empData: Employee[] | null = null;
      let eErr: any = null;

      const empWithLocation = await supabase.from('employees')
        .select('id, device_user_id, name, department, emp_type, emp_id, company, nationality')
        .neq('status', 'Inactive') 
        .or('status.ilike.active,status.is.null')
        .order('name', { ascending: true });

      empData = (empWithLocation.data as Employee[] | null) || [];
      eErr = empWithLocation.error;

      if (source === 'summary_view') {
        const employeesByEmpId = new Map(
          (empData || [])
            .filter(employee => employee.emp_id)
            .map(employee => [employee.emp_id!.trim().toLowerCase(), employee])
        );

        allTimesheets = allTimesheets.map((row: any) => {
          const employee = row.emp_id
            ? employeesByEmpId.get(String(row.emp_id).trim().toLowerCase())
            : undefined;
          const overtimeMinutes = Number(row.overtime || 0) + Number(row.weekend_ot_minutes || 0);

          return {
            id: `${row.emp_id || 'employee'}-${row.date}`,
            date: row.date,
            employee_code: employee?.device_user_id || String(row.emp_id || ''),
            employee_name: row.name || employee?.name || '',
            project_code: row.project_code || '',
            punch_in: row.punch_in || '',
            punch_out: row.punch_out || '',
            status: row.timecard_status || row.timesheet_status || 'absent',
            overtime: row.overtime || 0,
            remarks: row.remarks || '',
            verified_by: null,
            approved_by: null,
            approval: false,
            last_updated: '',
            total_working_hours: row.total_working_hours,
            overtime_minutes: overtimeMinutes,
          };
        });
      }      

      // 3. Fetch details for any missing employees who have timesheet records in the period
      const existingUserIds = new Set((empData || []).map(e => e.device_user_id).filter(Boolean));
      const missingUserIds = Array.from(new Set(
        allTimesheets
          .map(ts => ts.employee_code)
          .filter(code => code && !existingUserIds.has(code))
      )) as string[];

      if (missingUserIds.length > 0) {
        const { data: missingEmps, error: mErr } = await supabase
          .from('employees')
          .select('id, device_user_id, name, department, emp_type, emp_id, company, nationality')
          .neq('status', 'Inactive') 
          .in('device_user_id', missingUserIds);

        if (!mErr && missingEmps) {
          // Map each missing employee to have location: null to match the active list structure
          const formattedMissing = missingEmps.map(emp => ({ ...emp, location: null }));
          empData = [...(empData || []), ...formattedMissing];
        }
      }

      const [
        { data: devData, error: dErr },
        { data: transData, error: tErr }
      ] = await Promise.all([
        supabase.from('devices').select('serial_no, project_code, location'),
        supabase.from('transfers').select('*')
      ]);

      if (eErr) {
        setError(eErr.message);
        setLoading(false);
        return;
      }
      if (dErr) {
        setError(dErr?.message || 'Failed to fetch devices');
        setLoading(false);
        return;
      }
      if (tErr) {
        setError(tErr?.message || 'Failed to fetch transfers');
        setLoading(false);
        return;
      }
      setTransfers(transData || []);

      // 4. Determine if focal point filter is active
      let focalProjectCodes: string[] = [];
      let focalProjectLocations: string[] = [];
      let isFocalFiltered = false;

      if (userData?.role !== 'admin' && userData?.email) {
        const { data: focalProjects } = await supabase
          .from('projects')
          .select('project_code, project_location')
          .eq('focal_point_email', userData.email);

        if (focalProjects && focalProjects.length > 0) {
          focalProjectCodes = focalProjects.map(p => p.project_code);
          focalProjectLocations = focalProjects
            .map(p => parseLocationGeofence(p.project_location).name.toLowerCase().trim())
            .filter(Boolean);
          isFocalFiltered = true;
        }
      }
      setIsFocal(isFocalFiltered);

      // Build Set of employee codes who have timesheet entries on our project(s)
      const employeesWithTimesheetOnProject = new Set<string>();
      if (isFocalFiltered) {
        allTimesheets.forEach(ts => {
          if (ts.project_code && ts.employee_code) {
            const normTsCode = ts.project_code.toLowerCase().replace(/[^a-z0-9]/g, '');
            const tsProjName = nameMap[normTsCode] || ts.project_code;
            
            const isMatch = focalProjectCodes.some(code => {
              const normFocalCode = code.toLowerCase().replace(/[^a-z0-9]/g, '');
              const focalProjName = nameMap[normFocalCode] || code;
              return tsProjName.toLowerCase().replace(/[^a-z0-9]/g, '') === focalProjName.toLowerCase().replace(/[^a-z0-9]/g, '');
            });
            
            if (isMatch) {
              employeesWithTimesheetOnProject.add(ts.employee_code);
            }
          }
        });
      }

      const projectDeviceSerials = (devData ?? [])
        .filter(d => d.project_code && focalProjectCodes.includes(d.project_code))
        .map(d => d.serial_no);

      let allowedEmpIds = new Set<number>();
      let allowedDeviceUserIds = new Set<string>();
      const punchedOnProjectDevicesInPeriod = new Set<string>();

      if (isFocalFiltered) {
        if (projectDeviceSerials.length > 0) {
          const [{ data: cmdData }, { data: punchUserIds }, { data: periodPunchUserIds }] = await Promise.all([
            supabase
              .from('device_commands')
              .select('employee_id')
              .in('device_serial', projectDeviceSerials),
            supabase
              .from('punches')
              .select('user_id')
              .in('device_serial', projectDeviceSerials)
              .limit(5000),
            supabase
              .from('punches')
              .select('user_id')
              .in('device_serial', projectDeviceSerials)
              .gte('punch_time', `${start}T00:00:00`)
              .lte('punch_time', `${end}T23:59:59`)
          ]);

          if (cmdData) {
            cmdData.forEach(c => {
              if (c.employee_id) allowedEmpIds.add(c.employee_id);
            });
          }

          if (punchUserIds) {
            punchUserIds.forEach(p => {
              if (p.user_id) allowedDeviceUserIds.add(p.user_id);
            });
          }

          if (periodPunchUserIds) {
            periodPunchUserIds.forEach(p => {
              if (p.user_id) punchedOnProjectDevicesInPeriod.add(p.user_id);
            });
          }
        }
      }

      const filteredEmployees = isFocalFiltered
        ? (empData || []).filter(emp => {
          if (employeesWithTimesheetOnProject.has(emp.device_user_id)) {
            return true;
          }
          const hasCommand = allowedEmpIds.has(emp.id);
          const hasPunch = allowedDeviceUserIds.has(emp.device_user_id);

          // Resolve verified transfer location
          const empTrans = (transData || []).filter(t => t.emp_id === emp.emp_id || t.emp_id === String(emp.id));
          let verifiedLoc = '';
          if (empTrans.length > 0) {
            empTrans.sort((a: any, b: any) => new Date(b.transfer_date).getTime() - new Date(a.transfer_date).getTime() || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            verifiedLoc = empTrans[0].to_project;
          }

          const hasLocationMatch = emp.location && focalProjectLocations.includes(emp.location.toLowerCase().trim());
          const hasVerifiedMatch = verifiedLoc && focalProjectLocations.includes(verifiedLoc.toLowerCase().trim());

          const belongsToProject = hasLocationMatch || hasVerifiedMatch;
          if (belongsToProject) return true;

          const hasDifferentLocation = (emp.location && !focalProjectLocations.includes(emp.location.toLowerCase().trim())) ||
            (verifiedLoc && !focalProjectLocations.includes(verifiedLoc.toLowerCase().trim()));
          if (hasDifferentLocation) {
            return punchedOnProjectDevicesInPeriod.has(emp.device_user_id);
          }

          return hasCommand || hasPunch;
        })
        : (empData || []);

      setEmployees(filteredEmployees);
      setTimesheetData(allTimesheets);
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching data');
    } finally {
      setLoading(false);
    }
  }, [year, month, days, reportView, selectedDailyDate, userData?.email, userData?.role, source]);


  useEffect(() => {
    if (isFocal && reportType === 'location_inout') {
      setReportType('inout');
    }
  }, [isFocal, reportType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchData();
    }
  }, [refreshTrigger, fetchData]);

  // ── Matrix ─────────────────────────────────────────────────────────────────
  const matrix: AttendanceMatrix = useMemo(() => {
    const r: AttendanceMatrix = {};



    timesheetData.forEach(row => {
      const empCode = row.employee_code;
      const dateKey = row.date ? row.date.substring(0, 10) : '';
      if (!empCode || !dateKey) return;

      if (!r[empCode]) r[empCode] = {};

      const cleanStatus = (row.status || '').toLowerCase().trim();
//      const isPresent = cleanStatus === 'present' || cleanStatus === 'present with ot' || cleanStatus === 'weekend' || cleanStatus === 'holiday';
      const hasPunch = Boolean(row.punch_in || row.punch_out);
      const isPresent = hasPunch || cleanStatus === 'present' || cleanStatus === 'present with ot' || cleanStatus === 'weekend' || cleanStatus === 'holiday';
      const effectiveStatus = hasPunch && (cleanStatus === 'off' || cleanStatus === 'absent') ? 'present' : cleanStatus;

      r[empCode][dateKey] = {
        firstIn: row.punch_in || null,
        firstInLocation: row.project_code || null,
        lastOut: row.punch_out || null,
        lastOutLocation: row.project_code || null,
        firstPunch: row.punch_in || null,
        firstPunchLocation: row.project_code || null,
        lastPunch: row.punch_out || null,
        lastPunchLocation: row.project_code || null,
        isPresent: isPresent,
//        status: cleanStatus,
        status: effectiveStatus,        
        overtime: row.overtime || 0,
        remarks: row.remarks || '',
        approval: row.approval || false,
        approved_by: row.approved_by || null,
        verified_by: row.verified_by || null,
        totalWorkingHours: row.total_working_hours,
        overtimeMinutes: row.overtime_minutes
      };
    });

    return r;
  }, [timesheetData]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const departments = useMemo(() =>
    [...new Set(employees.map(e => e.department).filter(Boolean) as string[])].sort(),
    [employees]);

  const empCodePrefixes = useMemo(() => {
    const prefixes = new Set<string>();
    employees.forEach(e => {
      if (e.emp_id && e.emp_id.length >= 2) {
        prefixes.add(e.emp_id.slice(0, 2).toUpperCase());
      }
    });
    return Array.from(prefixes).sort();
  }, [employees]);

  const employeeLocations = useMemo(() => {
    const result: Record<string, string> = {};

    // Group timesheet records to find the most frequent project location for each employee
    const userLocationCounts: Record<string, Record<string, number>> = {};
    const latestPunchLoc: Record<string, string> = {};

    timesheetData.forEach(row => {
      const uid = row.employee_code;
      const loc = row.project_code;
      if (!uid || !loc) return;

      const norm = loc.toLowerCase().replace(/[^a-z0-9]/g, '');
      const resolvedLoc = projectNameMap[norm] || loc;

      if (!userLocationCounts[uid]) {
        userLocationCounts[uid] = {};
      }
      userLocationCounts[uid][resolvedLoc] = (userLocationCounts[uid][resolvedLoc] || 0) + 1;
      latestPunchLoc[uid] = resolvedLoc;
    });

    const primLocs: Record<string, string> = {};
    Object.entries(userLocationCounts).forEach(([userId, counts]) => {
      let mostFrequentLoc = '';
      let maxCount = 0;
      Object.entries(counts).forEach(([loc, count]) => {
        if (count > maxCount) {
          maxCount = count;
          mostFrequentLoc = loc;
        }
      });
      if (mostFrequentLoc) {
        primLocs[userId] = mostFrequentLoc;
      }
    });

    employees.forEach(emp => {
      const uid = emp.device_user_id;

      // Resolve verified transfer location
      const empTrans = transfers.filter((t: any) => t.emp_id === emp.emp_id || t.emp_id === String(emp.id));
      let verifiedLoc = '';
      if (empTrans.length > 0) {
        empTrans.sort((a: any, b: any) => new Date(b.transfer_date).getTime() - new Date(a.transfer_date).getTime() || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        verifiedLoc = empTrans[0].to_project;
      }

      // Precedence: verified transfer -> latest project -> most frequent project -> default employee location
      const rawLoc = verifiedLoc || latestPunchLoc[uid] || primLocs[uid] || emp.location || '';
      const normRaw = rawLoc.toLowerCase().replace(/[^a-z0-9]/g, '');
      const finalLoc = projectNameMap[normRaw] || rawLoc;
      result[uid] = finalLoc;
    });
    return result;
  }, [timesheetData, employees, transfers, projectNameMap]);


  const locations = useMemo(() => {
    const locSet = new Set<string>();
    employees.forEach(emp => {
      const loc = employeeLocations[emp.device_user_id];
      if (loc) locSet.add(loc);
    });
    const sorted = Array.from(locSet).sort();
    const hasBlank = employees.some(emp => {
      const loc = employeeLocations[emp.device_user_id];
      return !loc || loc.trim() === '';
    });
    if (hasBlank) {
      sorted.push('(Blank)');
    }
    return sorted;
  }, [employees, employeeLocations]);

  const filtered = useMemo(() => {
    let list = employees;
    if (selectedDepartments.length > 0) {
      list = list.filter(e => e.department && selectedDepartments.includes(e.department));
    }
    if (selectedTypes.length > 0) {
      list = list.filter(e => e.emp_type && selectedTypes.includes(e.emp_type.toLowerCase()));
    }
    if (nationalityFilter === 'OMANI') {
      list = list.filter(e => e.nationality?.toLowerCase().trim() === 'omani');
    } else if (nationalityFilter === 'NON_OMANI') {
      list = list.filter(e => e.nationality?.toLowerCase().trim() !== 'omani');
    }
    if (selectedEmpPrefixes.length > 0) {
      list = list.filter(e => {
        if (!e.emp_id || e.emp_id.length < 2) return false;
        const prefix = e.emp_id.slice(0, 2).toUpperCase();
        return selectedEmpPrefixes.includes(prefix);
      });
    }
    if (selectedLocations.length > 0) {
      list = list.filter(e => {
        const loc = employeeLocations[e.device_user_id];
        if (!loc || loc.trim() === '') {
          return selectedLocations.includes('(Blank)');
        }
        return selectedLocations.includes(loc);
      });
    }
    if (reportView === 'daily' && selectedStatuses.length > 0) {
      list = list.filter(e => {
        const c = matrix[e.device_user_id]?.[selectedDailyDate];
        const [y, m, d] = selectedDailyDate.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const isWeekendDay = isWeekend(y, m - 1, d, e);
        const isHolidayDay = holidays.some(h => h.day === d && year === y && month === (m - 1));

        let statusText = 'Absent';
        if (c?.status) {
          if (c.status === 'leave') statusText = 'Leave';
          else if (c.status === 'off') statusText = 'Off';
          else if (c.status === 'absent') statusText = 'Absent';
            else if (c.status === 'weekend') statusText = 'Weekend';
              else if (c.status === 'holiday') statusText = 'Holiday';
          else if (c.status === 'present' || c.status === 'present with ot') statusText = 'Present';
        } else if (isWeekendDay) {
          statusText = 'Weekend';
        } else if (isHolidayDay) {
          statusText = 'Holiday';
        } else {
          statusText = dateObj > today ? '—' : 'Absent';
        }

        if (selectedStatuses.includes(statusText)) return true;
        if (selectedStatuses.includes('Holiday') && statusText === 'Holiday') return true;
        return false;
      });
    }
    if (presenceFilter === 'ZERO') {
      list = list.filter(e => {
        const uid = e.device_user_id;
        const presentCount = dayList.filter(d => {
          const pad = (n: number) => String(n).padStart(2, '0');
          const dateKey = `${year}-${pad(month + 1)}-${pad(d)}`;
          return !!matrix[uid]?.[dateKey]?.isPresent;
        }).length;
        return presentCount === 0;
      });
    } else if (presenceFilter === 'NON_ZERO') {
      list = list.filter(e => {
        const uid = e.device_user_id;
        const presentCount = dayList.filter(d => {
          const pad = (n: number) => String(n).padStart(2, '0');
          const dateKey = `${year}-${pad(month + 1)}-${pad(d)}`;
          return !!matrix[uid]?.[dateKey]?.isPresent;
        }).length;
        return presentCount > 0;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.emp_id && e.emp_id.toLowerCase().includes(q))
      );
    }
    return list;
  }, [employees, selectedDepartments, selectedLocations, selectedEmpPrefixes, selectedStatuses, presenceFilter, dayList, searchQuery, employeeLocations, reportView, selectedDailyDate, matrix, useFirstLast, holidays, year, month, selectedTypes, nationalityFilter]);

  const selectedEmp = useMemo(() => {
    return employees.find(e => e.device_user_id === selectedEmployeeId) || filtered[0] || employees[0];
  }, [employees, filtered, selectedEmployeeId]);

  const selectableEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter(emp =>
      (emp.name || '').toLowerCase().includes(q) ||
      (emp.emp_id && emp.emp_id.toLowerCase().includes(q))
    );
  }, [filtered, empSearch]);

  const dateListInRange = useMemo(() => {
    if (!selectedDailyDate) return [];
    return [selectedDailyDate];
  }, [selectedDailyDate]);

  const workDays = useMemo(() =>
    dayList.filter(d => !isWeekend(year, month, d) && !isHoliday(d)).length,
    [dayList, year, month, isHoliday]);

  const presenceDays = (uid: string) => {
    return dayList.filter(d => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateKey = `${year}-${pad(month + 1)}-${pad(d)}`;
      return !!matrix[uid]?.[dateKey]?.isPresent;
    }).length;
  };
  const absentDays = (uid: string) => {
    const emp = employees.find(e => e.device_user_id === uid);
    return dayList.filter(d => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateKey = `${year}-${pad(month + 1)}-${pad(d)}`;
      const c = matrix[uid]?.[dateKey];
      return (
        new Date(year, month, d) <= today &&
        !isWeekend(year, month, d, emp) &&
        !isHoliday(d) &&
        (!c || c.status === 'absent')
      );
    }).length;
  };

  const totalOvertime = (uid: string, empType: string | null) => {
    if (empType === 'staff') return '—';
    let total = 0;
    dayList.forEach(d => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateKey = `${year}-${pad(month + 1)}-${pad(d)}`;
      const c = matrix[uid]?.[dateKey];
      if (c?.isPresent) {
        const otStr = getOvertime(c, empType);
        if (otStr !== '—') {
          const hours = parseFloat(otStr);
          if (!isNaN(hours)) {
            total += hours;
          }
        }
      }
    });
    return total > 0 ? total.toFixed(1) : '—';
  };

  const totalHours = (uid: string) => {
    let total = 0;
    dayList.forEach(d => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateKey = `${year}-${pad(month + 1)}-${pad(d)}`;
      const c = matrix[uid]?.[dateKey];
      if (c?.isPresent) {
        const hoursStr = getDayHours(c);
        if (hoursStr !== '—') {
          const hours = parseFloat(hoursStr);
          if (!isNaN(hours)) {
            total += hours;
          }
        }
      }
    });
    return total > 0 ? total.toFixed(1) : '—';
  };

  // ── Scroll sync ────────────────────────────────────────────────────────────
  useEffect(() => {
    const r = rightRef.current;
    const l = leftRef.current;
    if (!r || !l) return;
    const sync = () => { l.scrollTop = r.scrollTop; };
    r.addEventListener('scroll', sync);
    return () => r.removeEventListener('scroll', sync);
  }, [loading]);

  const handleDayHeaderPointerDown = useCallback((event: any) => {
    if (event.button !== 0 || !rightRef.current) return;
    dayHeaderDragRef.current = {
      isDragging: true,
      startX: event.clientX,
      startScrollLeft: rightRef.current.scrollLeft,
    };
    setIsDayHeaderDragging(true);
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, []);

  const handleDayHeaderPointerMove = useCallback((event: any) => {
    if (!dayHeaderDragRef.current.isDragging || !rightRef.current) return;
    const deltaX = event.clientX - dayHeaderDragRef.current.startX;
    rightRef.current.scrollLeft = dayHeaderDragRef.current.startScrollLeft - deltaX;
  }, []);

  const handleDayHeaderPointerUp = useCallback((event: any) => {
    if (!dayHeaderDragRef.current.isDragging) return;
    dayHeaderDragRef.current.isDragging = false;
    setIsDayHeaderDragging(false);
    if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  // ── Month nav ──────────────────────────────────────────────────────────────
  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  // ── Excel export ───────────────────────────────────────────────────────────
  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const rows: (string | number)[][] = [];

    if (reportView === 'individual') {
      if (!selectedEmp) return;
      rows.push([`Employee Individual Monthly Report — ${selectedEmp.name}`]);
      rows.push([`Period: ${monthLabel(month, year)}`]);
      rows.push([]);
      rows.push(['Date', 'Day', 'Status', 'Check In', 'Check Out', 'Hours', 'Overtime', 'Remarks', 'Approved By']);

      dayList.forEach((d) => {
        const pad = (n: number) => String(n).padStart(2, '0');
        const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
        const dateObj = new Date(year, month, d);
        const displayDate = dateObj.toLocaleDateString('en-OM', { day: '2-digit', month: 'short', year: 'numeric' });
        const displayDayName = getDayName(year, month, d);

        const c = matrix[selectedEmp.device_user_id]?.[dateStr];
        const isWeekendDay = isWeekend(year, month, d, selectedEmp);
        const isHolidayDay = isHoliday(d);
        const holiday = holidayMap[d];

        let statusText = 'Absent';
        let checkInText = '—';
        let checkOutText = '—';
        let hoursText = '—';
        let overtimeText = '—';

        if (c?.status) {
          if (c.status === 'leave') statusText = 'Leave';
          else if (c.status === 'off') statusText = 'Off';
          else if (c.status === 'absent') statusText = 'Absent';
          else if (c.status === 'weekend') statusText = 'Weekend';
          else if (c.status === 'holiday') statusText = 'Holiday';            
          else if (c.status === 'present' || c.status === 'present with ot') statusText = 'Present';
        } else if (isWeekendDay) {
          statusText = c?.isPresent ? 'Worked (Weekend)' : 'Weekend';
        } else if (isHolidayDay) {
          statusText = c?.isPresent ? 'Worked (Holiday)' : `Holiday (${holiday?.name || 'Holiday'})`;
        } else {
          statusText = dateObj > today ? '—' : 'Absent';
        }

        if (c?.isPresent) {
          if (useFirstLast) {
            checkInText = formatTime(c.firstPunch) || '✓';
            checkOutText = c.firstPunch === c.lastPunch ? '—' : (formatTime(c.lastPunch) || '—');
          } else {
            checkInText = formatTime(c.firstIn) || '✓';
            checkOutText = formatTime(c.lastOut) || '—';
          }

          const inLoc = useFirstLast ? c.firstPunchLocation : c.firstInLocation;
          const outLoc = useFirstLast ? c.lastPunchLocation : c.lastOutLocation;

          if (!isFocal) {
            if (inLoc) checkInText += ` (${inLoc})`;
            if (outLoc && c.firstPunch !== c.lastPunch) checkOutText += ` (${outLoc})`;
          }

          hoursText = getDayHours(c);
          overtimeText = getOvertime(c, selectedEmp.emp_type);
        }

        rows.push([
          displayDate,
          displayDayName,
          statusText,
          checkInText,
          checkOutText,
          hoursText,
          overtimeText,
          c?.remarks || '',
          c?.approved_by || ''
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 30 }, { wch: 8 }, { wch: 8 }, { wch: 25 }, { wch: 25 }];
      XLSX.utils.book_append_sheet(wb, ws, `Individual_Report`);
      XLSX.writeFile(wb, `Individual_${selectedEmp.name.replace(/\s+/g, '_')}_${year}_${String(month + 1).padStart(2, '0')}.xlsx`);
      return;
    }


    if (reportView === 'daily') {
      rows.push([`Staff Daily Attendance Report`]);
      rows.push([`Date: ${selectedDailyDate}`]);
      rows.push([]);
      const dailyHeaders = ['Date', '#', 'Name', 'Emp ID', 'Department', 'Location', 'Status', 'Check In', 'Check Out', 'Hours', 'Overtime', 'Remarks', 'Approved By'];
      if (isFocal) {
        dailyHeaders.splice(5, 1);
      }
      rows.push(dailyHeaders);

      dateListInRange.forEach((dateStr) => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const displayDate = dateObj.toLocaleDateString('en-OM', { day: '2-digit', month: 'short', year: 'numeric' });
        const isHolidayDay = holidays.some(h => h.day === d && year === y && month === (m - 1));

        filtered.forEach((emp, idx) => {
          const isWeekendDay = isWeekend(y, m - 1, d, emp);
          const c = matrix[emp.device_user_id]?.[dateStr];

          let statusText = 'Absent';
          let checkInText = '—';
          let checkOutText = '—';
          let hoursText = '—';
          let locDisplay = '—';

          if (c?.status) {
            if (c.status === 'leave') statusText = 'Leave';
            else if (c.status === 'off') statusText = 'Off';
            else if (c.status === 'absent') statusText = 'Absent';
            else if (c.status === 'weekend') statusText = 'Weekend';
            else if (c.status === 'holiday') statusText = 'Holiday';              
            else if (c.status === 'present' || c.status === 'present with ot') statusText = 'Present';
          } else if (isWeekendDay) {
            statusText = 'Weekend';
          } else if (isHolidayDay) {
            statusText = 'Holiday';
          } else {
            statusText = dateObj > today ? '—' : 'Absent';
          }

          if (c?.isPresent) {
            if (useFirstLast) {
              checkInText = formatTime(c.firstPunch) || '✓';
              checkOutText = c.firstPunch === c.lastPunch ? '—' : (formatTime(c.lastPunch) || '—');
            } else {
              checkInText = formatTime(c.firstIn) || '✓';
              checkOutText = formatTime(c.lastOut) || '—';
            }

            const inLoc = useFirstLast ? c.firstPunchLocation : c.firstInLocation;
            const outLoc = useFirstLast ? c.lastPunchLocation : c.lastOutLocation;

            if (inLoc && outLoc && inLoc !== outLoc && c.firstPunch !== c.lastPunch) {
              locDisplay = `${inLoc} / ${outLoc}`;
            } else {
              locDisplay = inLoc || outLoc || '—';
            }

            hoursText = getDayHours(c);
          }

          const overtimeText = getOvertime(c, emp.emp_type);

          const rowData = [
            displayDate,
            idx + 1,
            emp.name || '',
            emp.emp_id ?? '',
            emp.department ?? '',
            locDisplay,
            statusText,
            checkInText,
            checkOutText,
            hoursText,
            overtimeText,
            c?.remarks || '',
            c?.approved_by || ''
          ];
          if (isFocal) {
            rowData.splice(5, 1);
          }
          rows.push(rowData);
        });
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const colWidths = [{ wch: 12 }, { wch: 4 }, { wch: 25 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 25 }, { wch: 25 }];
      if (isFocal) {
        colWidths.splice(5, 1);
      }
      ws['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(wb, ws, `Daily_Report`);
      XLSX.writeFile(wb, `Daily_Attendance_${selectedDailyDate}.xlsx`);
      return;
    }

    rows.push([`Staff Attendance — ${monthLabel(month, year)}`]);
    rows.push([]);

    const monthName = new Date(year, month, 1).toLocaleDateString('en-OM', { month: 'long' });
    const r1: string[] = ['#', 'Name', 'Emp ID'];
    if (!isFocal) r1.push('Location');
    const r2: string[] = ['', '', ''];
    if (!isFocal) r2.push('');
    const r3: string[] = ['', '', ''];
    if (!isFocal) r3.push('');
    const colCount = reportType === 'inout' || reportType === 'location_inout' ? 2 : 1;

    for (let d = 1; d <= days; d++) {
      r1.push(`${d} ${monthName} ${year}`);
      if (colCount === 2) r1.push('');
      r2.push(getDayName(year, month, d));
      if (colCount === 2) r2.push('');
      if (reportType === 'hourly') {
        r3.push('hours');
      } else if (reportType === 'pa') {
        r3.push('status');
      } else if (reportType === 'location_inout') {
        r3.push('In (Time - Loc)', 'Out (Time - Loc)');
      } else {
        r3.push('In', 'Out');
      }
    }
    if (reportType === 'hourly') {
      r1.push('P', 'A', 'OT'); r2.push('', '', ''); r3.push('', '', '');
    } else {
      r1.push('P', 'A'); r2.push('', ''); r3.push('', '');
    }
    rows.push(r1, r2, r3);

    filtered.forEach((emp, idx) => {
      const row: (string | number)[] = [idx + 1, emp.name || '', emp.emp_id ?? ''];
      if (!isFocal) {
        row.push(employeeLocations[emp.device_user_id] || '—');
      }
      for (let d = 1; d <= days; d++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const c = matrix[emp.device_user_id]?.[dateKey];
        const isHolidayDay = isHoliday(d);
        const holiday = holidayMap[d];

        if (reportType === 'hourly') {
          if (c?.status === 'leave') { row.push('L'); }
          else if (c?.status === 'off') { row.push('OFF'); }
//          else if (isWeekend(year, month, d, emp)) { row.push('OFF'); }            
          else if (isWeekend(year, month, d, emp) && !c?.isPresent) { row.push('OFF'); }            
          else if (isHolidayDay) { row.push(c?.isPresent ? getDayHours(c) : 'HOL'); }
          else { row.push(getDayHours(c)); }
        } else if (reportType === 'pa') {
          if (c?.status === 'leave') { row.push('L'); }
          else if (c?.status === 'off') { row.push('OFF'); }
          else if (c?.status === 'absent') { row.push('A'); }
//          else if (isWeekend(year, month, d, emp)) { row.push('OFF'); }
          else if (isWeekend(year, month, d, emp) && !c?.isPresent) { row.push('OFF'); }            
          else if (isHolidayDay) { row.push(c?.isPresent ? 'P(H)' : 'H'); }
          else if (c?.isPresent) { row.push('P'); }
          else if (new Date(year, month, d) > today) { row.push('—'); }
          else { row.push('A'); }
        } else if (reportType === 'location_inout') {
          if (c?.status === 'leave') { row.push('L', ''); }
          else if (c?.status === 'off') { row.push('OFF', ''); }
          else if (c?.status === 'absent') { row.push('A', ''); }
//          else if (isWeekend(year, month, d, emp)) { row.push('OFF', ''); }
          else if (isWeekend(year, month, d, emp) && !c?.isPresent) { row.push('OFF', ''); }            
          else if (isHolidayDay && !c?.isPresent) { row.push(`HOL (${holiday?.name || 'Holiday'})`, ''); }
          else if (c?.isPresent) {
            if (useFirstLast) {
              const inTime = formatTime(c.firstPunch);
              const inLoc = c.firstPunchLocation || '—';
              const outTime = c.firstPunch === c.lastPunch ? '' : formatTime(c.lastPunch);
              const outLoc = c.firstPunch === c.lastPunch ? '' : (c.lastPunchLocation || '—');
              row.push(
                inTime ? `${inTime} (${inLoc})${isHolidayDay ? ' (H)' : ''}` : '',
                outTime ? `${outTime} (${outLoc})${isHolidayDay ? ' (H)' : ''}` : ''
              );
            } else {
              const inTime = formatTime(c.firstIn) || '✓';
              const inLoc = c.firstInLocation || '—';
              const outTime = formatTime(c.lastOut) || '';
              const outLoc = c.lastOutLocation || '—';
              row.push(
                `${inTime} (${inLoc})${isHolidayDay ? ' (H)' : ''}`,
                outTime ? `${outTime} (${outLoc})${isHolidayDay ? ' (H)' : ''}` : ''
              );
            }
          }
          else if (new Date(year, month, d) > today) { row.push('—', ''); }
          else { row.push('A', ''); }
        } else {
          if (c?.status === 'leave') { row.push('L', ''); }
          else if (c?.status === 'off') { row.push('OFF', ''); }
          else if (c?.status === 'absent') { row.push('A', ''); }
//          else if (isWeekend(year, month, d, emp)) { row.push('OFF', ''); }
          else if (isWeekend(year, month, d, emp) && !c?.isPresent) { row.push('OFF', ''); }            
          else if (isHolidayDay && !c?.isPresent) { row.push('HOL', ''); }
          else if (c?.isPresent) {
            if (useFirstLast) {
              row.push(
                (formatTime(c.firstPunch) || '') + (isHolidayDay ? ' (H)' : ''),
                (c.firstPunch === c.lastPunch ? '' : formatTime(c.lastPunch)) + (isHolidayDay && c.firstPunch !== c.lastPunch ? ' (H)' : '')
              );
            } else {
              row.push(
                (formatTime(c.firstIn) || '✓') + (isHolidayDay ? ' (H)' : ''),
                (formatTime(c.lastOut) || '') + (isHolidayDay && c.lastOut ? ' (H)' : '')
              );
            }
          }
          else if (new Date(year, month, d) > today) { row.push('—', ''); }
          else { row.push('A', ''); }
        }
      }
      row.push(presenceDays(emp.device_user_id), absentDays(emp.device_user_id));
      if (reportType === 'hourly') {
        row.push(totalOvertime(emp.device_user_id, emp.emp_type));
      }
      rows.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const cols = [{ wch: 4 }, { wch: 22 }, { wch: 9 }, { wch: 14 }];
    for (let i = 0; i < days; i++) {
      if (reportType === 'location_inout') {
        cols.push({ wch: 18 }); cols.push({ wch: 18 });
      } else {
        const width = colCount === 2 ? 8 : 12;
        cols.push({ wch: width }); if (colCount === 2) cols.push({ wch: width });
      }
    }
    cols.push({ wch: 6 }, { wch: 6 });
    if (reportType === 'hourly') {
      cols.push({ wch: 6 });
    }
    ws['!cols'] = cols;
    ws['!freeze'] = { xSplit: 4, ySplit: 5, topLeftCell: 'E6', activeCell: 'E6', sqref: 'E6' };
    XLSX.utils.book_append_sheet(wb, ws, 'Staff Attendance');
    XLSX.writeFile(wb, `Staff_${year}_${String(month + 1).padStart(2, '0')}.xlsx`);
  }

  // ── PDF export ─────────────────────────────────────────────────────────────
  const exportPDF = useCallback(async () => {
    if (!tableAreaRef.current) return;
    setPdfLoading(true);

    // Give UI a tick to render loading spinner
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const isDaily = reportView === 'daily';
    const isIndividual = reportView === 'individual';
    const colWidth = reportType === 'location_inout' ? 240 : reportType === 'inout' ? 92 : 46;
    const totalWidth = isDaily ? 960 : isIndividual ? 1120 : 584 + (days * colWidth);
    const offscreen = document.createElement("div");
    offscreen.style.cssText =
      `position:fixed;top:0;left:-${totalWidth + 1000}px;` +
      `width:${totalWidth}px;height:auto;z-index:-9999;overflow:visible;background:white;padding:8px;box-sizing:border-box;`;

    // Title and stats header in offscreen wrapper
    const header = document.createElement("div");
    header.style.cssText = `margin-bottom: 20px; font-family: ui-sans-serif, system-ui, sans-serif; width:100%;`;

    const title = document.createElement("h2");
    title.innerText = isDaily
      ? `Staff Daily Attendance Report — Date: ${selectedDailyDate}`
      : isIndividual
        ? `${selectedEmp?.name} — ${monthLabel(month, year)}`
        : `Staff Attendance Report — ${monthLabel(month, year)}`;
    title.style.cssText = `margin: 0; font-size: 22px; font-weight: 500; color: #020617;`;

    const subtitle = document.createElement("div");
    const locText = selectedLocations.length === 0 ? 'All Locations' : selectedLocations.join(', ');
    if (isIndividual) {
      const companyName = selectedEmp?.company?.trim() || 'SOHAR STAR UNITED LLC';
      subtitle.innerText = `Department: ${selectedEmp?.department || '—'}  ·  Company: ${companyName}  ·  Emp ID: ${selectedEmp?.emp_id || '—'}`;
      subtitle.style.cssText = `margin-top: 6px; font-size: 13px; color:#0f172a; font-weight:500; width:100%;`;
    } else {
      subtitle.innerText = isDaily
        ? `${filtered.length} staff  ·  Location: ${locText}`
        : `${filtered.length} staff  ·  ${workDays} working days  ·  Location: ${locText}`;
      subtitle.style.cssText = `margin-top: 6px; font-size: 13px; color: #0f172a; font-weight: 600;`;
    }

    header.appendChild(title);
    header.appendChild(subtitle);
    offscreen.appendChild(header);

    const tableAreaClone = tableAreaRef.current.cloneNode(true) as HTMLElement;
    tableAreaClone.style.overflow = "visible";
    tableAreaClone.style.height = "auto";
    tableAreaClone.style.flex = "none";
    tableAreaClone.style.width = `${totalWidth}px`;
    tableAreaClone.style.borderTop = "none";

    if (reportView === 'monthly') {
      tableAreaClone.style.display = "flex";
      tableAreaClone.style.flexDirection = "row";

      const leftPanelClone = tableAreaClone.children[0] as HTMLElement;
      const rightPanelClone = tableAreaClone.children[1] as HTMLElement;

      if (leftPanelClone) {
        leftPanelClone.style.overflowY = "visible";
        leftPanelClone.style.overflowX = "visible";
        leftPanelClone.style.height = "auto";
        leftPanelClone.style.boxShadow = "none";
        leftPanelClone.style.borderRight = "1px solid #e5e7eb";
      }

      if (rightPanelClone) {
        rightPanelClone.style.overflowX = "visible";
        rightPanelClone.style.overflowY = "visible";
        rightPanelClone.style.height = "auto";
        rightPanelClone.style.flex = "none";
        rightPanelClone.style.width = `${days * colWidth}px`;
      }
    }

    // Convert all sticky header rows to static so they render in standard flow
    const headerTrs = tableAreaClone.querySelectorAll('thead tr');
    headerTrs.forEach((tr) => {
      const trEl = tr as HTMLElement;
      trEl.style.position = 'static';
    });

    offscreen.appendChild(tableAreaClone);
    document.body.appendChild(offscreen);

    try {
      if (isIndividual) {
        const footerSource = tableAreaClone.querySelector('tfoot')?.cloneNode(true) as HTMLElement | null;
        const footerRow = tableAreaClone.querySelector('tfoot') as HTMLElement | null;
        if (footerRow) {
          footerRow.style.display = 'none';
        }

        const bodyCanvas = await html2canvas(offscreen, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: totalWidth,
        });

        const bodyImgData = bodyCanvas.toDataURL('image/jpeg', 0.95);
        const bodyLayoutWidth = offscreen.offsetWidth;
        const bodyLayoutHeight = offscreen.offsetHeight;

        let footerCanvas: HTMLCanvasElement | null = null;
        let footerLayoutHeight = 0;
        if (footerSource) {
          const footerOffscreen = document.createElement('div');
          footerOffscreen.style.cssText =
            `position:fixed;top:0;left:-${totalWidth + 2000}px;` +
            `width:${totalWidth}px;height:auto;z-index:-9999;overflow:visible;background:white;padding:0;box-sizing:border-box;`;

          const footerTable = document.createElement('table');
          footerTable.className = (tableAreaClone.querySelector('table') as HTMLTableElement | null)?.className || 'w-full text-sm text-left border-collapse';
          footerTable.style.cssText = `width:${totalWidth}px;table-layout:fixed;border-collapse:collapse;`;
          footerTable.appendChild(footerSource);
          footerOffscreen.appendChild(footerTable);
          document.body.appendChild(footerOffscreen);

          try {
            footerLayoutHeight = footerOffscreen.offsetHeight;
            footerCanvas = await html2canvas(footerOffscreen, {
              scale: 2,
              useCORS: true,
              logging: false,
              backgroundColor: '#ffffff',
              windowWidth: totalWidth,
            });
          } finally {
            if (footerOffscreen.parentNode) {
              footerOffscreen.parentNode.removeChild(footerOffscreen);
            }
          }
        }

        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 2;
        const maxWidth = pageWidth - margin;
        //const maxWidth = pageWidth - margin * 2;
        const maxHeight = pageHeight - margin * 2;
        const combinedHeight = bodyLayoutHeight + footerLayoutHeight;
        const scale = Math.min(maxWidth / bodyLayoutWidth, maxHeight / combinedHeight);
        const bodyRenderWidth = bodyLayoutWidth * scale;
        const bodyRenderHeight = bodyLayoutHeight * scale;
        const footerImgData = footerCanvas ? footerCanvas.toDataURL('image/jpeg', 0.95) : null;
        const footerRenderWidth = footerImgData ? bodyLayoutWidth * scale : 0;
        const footerRenderHeight = footerImgData ? footerLayoutHeight * scale : 0;
        const bodyX = (pageWidth - bodyRenderWidth) / 2;
        const bodyY = margin;

        pdf.addImage(bodyImgData, 'JPEG', bodyX, bodyY, bodyRenderWidth, bodyRenderHeight, undefined, 'FAST');

        if (footerImgData) {
          const footerX = (pageWidth - footerRenderWidth) / 2;
          const footerY = pageHeight - margin - footerRenderHeight;
          pdf.addImage(footerImgData, 'JPEG', footerX, footerY, footerRenderWidth, footerRenderHeight, undefined, 'FAST');
        }

        pdf.save(`Individual_Attendance_${selectedEmp?.name?.replace(/\s+/g, '_')}_${year}_${String(month + 1).padStart(2, '0')}.pdf`);
      } else {
        const canvas = await html2canvas(offscreen, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: totalWidth,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const layoutWidth = offscreen.offsetWidth;
        const layoutHeight = offscreen.offsetHeight;

        if (isDaily) {
          const pdf = new jsPDF({
            orientation: layoutWidth > layoutHeight ? 'l' : 'p',
            unit: 'px',
            format: [layoutWidth, layoutHeight]
          });

          pdf.addImage(imgData, 'JPEG', 0, 0, layoutWidth, layoutHeight, undefined, 'FAST');
          pdf.save(`Staff_Daily_Attendance_${selectedDailyDate}.pdf`);
        } else {
          const pdf = new jsPDF({
            orientation: layoutWidth > layoutHeight ? 'l' : 'p',
            unit: 'px',
            format: [layoutWidth, layoutHeight]
          });

          pdf.addImage(imgData, 'JPEG', 0, 0, layoutWidth, layoutHeight, undefined, 'FAST');
          pdf.save(`Staff_Attendance_${year}_${String(month + 1).padStart(2, '0')}.pdf`);
        }
      }
    } catch (err) {
      console.error("Failed to generate PDF:", err);
    } finally {
      if (offscreen.parentNode) {
        offscreen.parentNode.removeChild(offscreen);
      }
      setPdfLoading(false);
    }
  }, [days, month, year, filtered, workDays, reportType, useFirstLast, selectedDepartments, selectedLocations, reportView, selectedDailyDate, selectedEmployeeId, selectedEmp]);

  const limit = pdfLoading ? filtered.length : renderLimit;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', width: "100%" }}>
      <style dangerouslySetInnerHTML={{
        __html: `
        .highlighted-row td {
          background-color: #fef08a !important;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.35s ease-out forwards;
        }
      ` }} />

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', padding: '0.5rem 0.75rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>

          {/* Report View Selector */}
          <Select
            value={reportView}
            onValueChange={(val: ReportView) => setReportView(val)}
          >
            <SelectTrigger className="h-8 text-xs w-[145px] bg-white border-gray-200 rounded-lg">
              <SelectValue placeholder="Daily View" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem style={{ justifyContent: "flex-start" }} value="daily">Daily View</SelectItem>
              <SelectItem style={{ justifyContent: "flex-start" }} value="individual">Individual View</SelectItem>
              <SelectItem style={{ justifyContent: "flex-start" }} value="monthly">Monthly View</SelectItem>
            </SelectContent>
          </Select>

          {/* Employee Selector for Individual View */}
          {reportView === 'individual' && (
            <Popover open={openEmpSelect} onOpenChange={setOpenEmpSelect}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="h-8 text-xs w-[200px] bg-white border border-gray-200 rounded-lg px-3 py-1 flex items-center justify-between shadow-xs hover:bg-gray-50 transition-colors text-left"
                >
                  <span className="truncate font-medium text-gray-700 capitalize">
                    {selectedEmp ? selectedEmp.name.toLowerCase() : "Select Employee"}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[240px] p-0 bg-white border border-gray-200 shadow-md rounded-md z-50"
                align="start"
              >
                <div className="p-2 border-b border-gray-100 bg-gray-50/50">
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-200 rounded-md">
                    <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Search name or ID..."
                      value={empSearch}
                      onChange={(e) => setEmpSearch(e.target.value)}
                      className="text-xs bg-transparent border-0 outline-none w-full p-0 focus:ring-0 placeholder:text-gray-400 normal-case"
                      autoFocus
                    />
                    {empSearch && (
                      <button
                        type="button"
                        onClick={() => setEmpSearch("")}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-[220px] overflow-y-auto py-1">
                  {selectableEmployees.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-gray-400 font-medium">
                      No results found
                    </div>
                  ) : (
                    selectableEmployees.map((emp) => {
                      const isSelected = selectedEmp?.device_user_id === emp.device_user_id;
                      return (
                        <button
                          style={{ justifyContent: "space-between" }}
                          key={emp.device_user_id}
                          type="button"
                          onClick={() => {
                            setSelectedEmployeeId(emp.device_user_id);
                            setOpenEmpSelect(false);
                            setEmpSearch("");
                          }}
                          className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between capitalize font-medium ${isSelected
                            ? "bg-amber-50/70 text-amber-900"
                            : "hover:bg-gray-55 bg-transparent"
                            }`}
                        >
                          <div className="truncate">
                            <div>{emp.name.toLowerCase()}</div>
                            {emp.emp_id && (
                              <div className="text-[10px] text-gray-400 font-normal normal-case">
                                ID: {emp.emp_id}
                              </div>
                            )}
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Hide Report Type in Daily and Individual views */}
          {reportView === 'monthly' && (
            <Select
              value={reportType}
              onValueChange={(val: ReportType) => setReportType(val)}
            >
              <SelectTrigger className="h-8 text-xs w-[140px] bg-white border-gray-200 rounded-lg">
                <SelectValue placeholder="Report Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem style={{ justifyContent: "flex-start" }} value="pa">P/A Matrix</SelectItem>
                <SelectItem style={{ justifyContent: "flex-start" }} value="inout">In/Out Report</SelectItem>
                {!isFocal && (
                  <SelectItem style={{ justifyContent: "flex-start" }} value="location_inout">Location In/Out Report</SelectItem>
                )}
                <SelectItem style={{ justifyContent: "flex-start" }} value="hourly">Hourly Report</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Date pickers */}
          {reportView === 'daily' ? (
            <DatePicker
              value={selectedDailyDate}
              onChange={(val) => {
                if (val) {
                  setSelectedDailyDate(val as string);
                }
              }}
              placeholder="Pick a date"
              className="text-xs h-8 border-gray-200 bg-white rounded-lg min-w-[150px]"
            />
          ) : (
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={prevMonth} className="px-1.5 py-1.5 hover:bg-gray-50 transition-colors">
                <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
              </button>
              <span className="px-2 py-1 text-xs font-medium text-gray-700 min-w-[120px] text-center">
                {monthLabel(month, year)}
              </span>
              <button
                onClick={nextMonth}
                disabled={year === today.getFullYear() && month === today.getMonth()}
                className="px-1.5 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-30"
              >
                <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
          )}

          {/* Info Badge */}
          {reportView !== 'individual' && (
            <span className="text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full">
              {filtered.length} employees
            </span>
          )}
          {reportView !== 'daily' && (
            <span className="text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full">
              {workDays} working days
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>

          <button
            type="button"
            onClick={() => setHighlightMode(!highlightMode)}
            className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors cursor-pointer ${highlightMode
              ? 'bg-yellow-100 border-yellow-300 text-yellow-700 hover:bg-yellow-200'
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            title={highlightMode ? "Deactivate Highlighter Mode" : "Activate Highlighter Mode (Click rows to highlight)"}
          >
            <Highlighter className="w-4 h-4" />
          </button>
          <button
            onClick={exportExcel}
            disabled={loading || filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>
          <button
            onClick={exportPDF}
            disabled={loading || filtered.length === 0 || pdfLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40"
          >
            {pdfLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {pdfLoading ? 'Exporting PDF...' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mx-3 mb-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex-shrink-0">
          {error}
        </div>
      )}

      {/* ── Table area ── */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 flex-1 text-gray-400 text-sm" style={{ width: "100%" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading timesheets…
        </div>
      ) : reportView === 'daily' ? (
        /* ── DAILY REPORT VIEW ── */
        <div ref={tableAreaRef} className="flex-1 overflow-auto border-t border-gray-200 animate-fade-in">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 sticky top-0 z-10">
              <tr style={{ height: "2.5rem" }}>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-left" style={{ width: 140 }}>Date</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-left" style={{ width: 320, verticalAlign: 'middle' }}>
                  <div className="flex items-center gap-1.5 w-full">
                    <div className="relative flex-1 ">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="h-6 w-full border border-gray-300 rounded text-gray-700 bg-white pl-6 pr-2 py-0.5 outline-none focus:border-gray-400 transition-colors normal-case font-normal text-xs placeholder:text-gray-400"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-left" style={{ width: 170, verticalAlign: 'middle' }}>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 hover:bg-white/10 focus:ring-0 focus:ring-offset-0 focus:outline-none shadow-none px-2 rounded-md transition-colors font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide">
                      <span className="truncate">
                        {selectedDepartments.length === 0
                          ? 'Department'
                          : selectedDepartments.length === 1
                            ? selectedDepartments[0]
                            : `Dept (${selectedDepartments.length})`}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-80 shrink-0" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[200px] max-h-[300px] overflow-y-auto p-0 z-50">
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/95 backdrop-blur-xs"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedDepartments(departments);
                          }}
                          className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-left normal-case"
                          style={{ background: "none", flex: 1 }}
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedDepartments([]);
                          }}
                          className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-right normal-case"
                          style={{ background: "none", flex: 1 }}
                        >
                          Clear
                        </button>
                      </div>
                      {departments.map(dept => {
                        const isChecked = selectedDepartments.includes(dept);
                        return (
                          <DropdownMenuCheckboxItem
                            key={dept}
                            checked={isChecked}
                            onSelect={(e) => e.preventDefault()}
                            onCheckedChange={checked => {
                              if (checked) {
                                setSelectedDepartments([...selectedDepartments, dept]);
                              } else {
                                setSelectedDepartments(selectedDepartments.filter(item => item !== dept));
                              }
                            }}
                            style={{ fontWeight: 400 }}
                            className="rounded-md focus:bg-gray-50 cursor-pointer text-xs normal-case font-medium"
                          >
                            {dept}
                          </DropdownMenuCheckboxItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </th>
                {!isFocal && (
                  <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-left" style={{ width: 180, verticalAlign: 'middle' }}>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 hover:bg-white/10 focus:ring-0 focus:ring-offset-0 focus:outline-none shadow-none px-2 rounded-md transition-colors font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide">
                        <span className="truncate">
                          {selectedLocations.length === 0
                            ? 'Location (All)'
                            : selectedLocations.length === 1
                              ? selectedLocations[0]
                              : `Location (${selectedLocations.length})`}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-80 shrink-0" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[200px] max-h-[300px] overflow-y-auto p-0 z-50">
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/95 backdrop-blur-xs"
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedLocations(locations);
                            }}
                            className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-left normal-case"
                            style={{ background: "none", flex: 1 }}
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedLocations([]);
                            }}
                            className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-right normal-case"
                            style={{ background: "none", flex: 1 }}
                          >
                            Clear
                          </button>
                        </div>
                        {locations.map(loc => {
                          const isChecked = selectedLocations.includes(loc);
                          return (
                            <DropdownMenuCheckboxItem
                              key={loc}
                              checked={isChecked}
                              onSelect={(e) => e.preventDefault()}
                              onCheckedChange={checked => {
                                if (checked) {
                                  setSelectedLocations([...selectedLocations, loc]);
                                } else {
                                  setSelectedLocations(selectedLocations.filter(item => item !== loc));
                                }
                              }}
                              style={{ fontWeight: 400 }}
                              className="rounded-md focus:bg-gray-50 cursor-pointer text-xs normal-case font-medium"
                            >
                              {loc}
                            </DropdownMenuCheckboxItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </th>
                )}
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-left" style={{ width: 150, verticalAlign: 'middle' }}>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 hover:bg-white/10 focus:ring-0 focus:ring-offset-0 focus:outline-none shadow-none px-2 rounded-md transition-colors font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide">
                      <span className="truncate">
                        {selectedStatuses.length === 0
                          ? 'Status'
                          : selectedStatuses.length === 1
                            ? selectedStatuses[0]
                            : `Status (${selectedStatuses.length})`}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-80 shrink-0" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[180px] max-h-[300px] overflow-y-auto p-0 z-50">
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/95 backdrop-blur-xs"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedStatuses(['Present', 'Absent', 'Weekend', 'Holiday', 'Leave', 'Off']);
                          }}
                          className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-left normal-case"
                          style={{ background: "none", flex: 1 }}
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedStatuses([]);
                          }}
                          className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-right normal-case"
                          style={{ background: "none", flex: 1 }}
                        >
                          Clear
                        </button>
                      </div>
                      {['Present', 'Absent', 'Weekend', 'Holiday', 'Leave', 'Off'].map(status => {
                        const isChecked = selectedStatuses.includes(status);
                        return (
                          <DropdownMenuCheckboxItem
                            key={status}
                            checked={isChecked}
                            onSelect={(e) => e.preventDefault()}
                            onCheckedChange={checked => {
                              if (checked) {
                                setSelectedStatuses([...selectedStatuses, status]);
                              } else {
                                setSelectedStatuses(selectedStatuses.filter(item => item !== status));
                              }
                            }}
                            style={{ fontWeight: 400 }}
                            className="rounded-md focus:bg-gray-50 cursor-pointer text-xs normal-case font-medium"
                          >
                            {status}
                          </DropdownMenuCheckboxItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-left">In</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-left">Out</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-center" style={{ width: 85 }} title="Excludes 1 hour lunch break">Hours (-1)</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-center" style={{ width: 80 }}>Overtime</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-left" style={{ width: 180 }}>Remarks</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-left" style={{ width: 140 }}>Approved By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {dateListInRange.length === 0 || filtered.length === 0 ? (
                <tr>
                  <td colSpan={isFocal ? 10 : 11} className="py-20 text-center text-gray-400 font-medium bg-white">
                    No employees found.
                  </td>
                </tr>
              ) : (
                <>
                  {dateListInRange.map((dateStr) => {
                    const [y, m, d] = dateStr.split('-').map(Number);
                    const dateObj = new Date(y, m - 1, d);
                    const displayDate = dateObj.toLocaleDateString('en-OM', { day: '2-digit', month: 'short', year: 'numeric' });
                    const isHolidayDay = holidays.some(h => h.day === d && year === y && month === (m - 1));

                    return filtered.slice(0, limit).map((emp) => {
                      const isWeekendDay = isWeekend(y, m - 1, d, emp);
                      const c = matrix[emp.device_user_id]?.[dateStr];

                      let statusBadge = null;
                      let checkInText = '—';
                      let checkOutText = '—';
                      let hoursText = '—';
                      let locDisplay = '—';

                      if (c?.status) {
                        if (c.status === 'leave') {
                          statusBadge = <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 font-semibold">Leave</span>;
                        } else if (c.status === 'off') {
                          statusBadge = <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 font-semibold">Off</span>;
                        } else if (c.status === 'absent') {
                          statusBadge = <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 font-semibold">Absent</span>;
                        } else if (c.status === 'weekend') {
                          statusBadge = <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 font-semibold">Weekend</span>;
                        } else if (c.status === 'holiday') {
                          statusBadge = <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 font-semibold">Holiday</span>;                          
                        } else if (c.status === 'present' || c.status === 'present with ot') {
                          statusBadge = <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 font-semibold">Present</span>;
                        }
                      } else if (isWeekendDay) {
                        statusBadge = <span className="text-gray-400 text-xs">Weekend</span>;
                      } else if (isHolidayDay) {
                        statusBadge = c?.isPresent ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">Worked (H)</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">Holiday</span>
                        );
                      } else {
                        const isFuture = dateObj > today;
                        statusBadge = isFuture ? (
                          <span className="text-gray-300 text-xs">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">
                            Absent
                          </span>
                        );
                      }

                      if (c?.isPresent) {
                        if (useFirstLast) {
                          checkInText = formatTime(c.firstPunch) || '✓';
                          checkOutText = c.firstPunch === c.lastPunch ? '—' : (formatTime(c.lastPunch) || '—');
                        } else {
                          checkInText = formatTime(c.firstIn) || '✓';
                          checkOutText = formatTime(c.lastOut) || '—';
                        }

                        // Location mapping
                        const inLoc = useFirstLast ? c.firstPunchLocation : c.firstInLocation;
                        const outLoc = useFirstLast ? c.lastPunchLocation : c.lastOutLocation;

                        if (inLoc && outLoc && inLoc !== outLoc && c.firstPunch !== c.lastPunch) {
                          locDisplay = `${inLoc} / ${outLoc}`;
                        } else {
                          locDisplay = inLoc || outLoc || '—';
                        }

                        hoursText = getDayHours(c);
                      }

                      const overtimeText = getOvertime(c, emp.emp_type);
                      const isApproved = c?.approved_by || c?.approval;
                      const timeColor = isApproved ? 'text-indigo-600 font-semibold' : 'text-slate-500 font-semibold';
                      const rowBg = isApproved ? 'bg-indigo-50/30' : '';
                      const isRowHighlighted = highlightedRows.has(emp.device_user_id);

                      return (
                        <tr
                          key={`${dateStr}-${emp.id}`}
                          style={{ height: ROW_H }}
                          onClick={() => {
                            if (highlightMode) {
                              toggleRowHighlight(emp.device_user_id);
                            }
                          }}
                          className={`hover:bg-gray-55/50 transition-colors border-b border-gray-100 ${rowBg} ${isRowHighlighted ? 'highlighted-row' : ''
                            } ${highlightMode ? 'cursor-pointer' : ''}`}
                        >
                          <td className="px-4 py-2 text-gray-500 font-medium text-xs text-left">{displayDate}</td>
                          <td className="px-4 py-2 font-medium text-gray-900 text-left" style={{ textTransform: 'capitalize' }}>
                            <div>{(emp.name || '').toLowerCase()}</div>
                            {emp.emp_id && <div className="text-[11px] font-normal text-gray-400 leading-tight">{emp.emp_id}</div>}
                          </td>
                          <td className="px-4 py-2 text-gray-500 text-left">{emp.department ?? '—'}</td>
                          {!isFocal && <td className="px-4 py-2 text-gray-500 text-left">{locDisplay}</td>}
                          <td className="px-4 py-2 text-left">{statusBadge}</td>
                          <td className={`px-4 py-2 tabular-nums text-xs text-left ${timeColor}`}>{checkInText}</td>
                          <td className={`px-4 py-2 tabular-nums text-xs text-left ${timeColor}`}>{checkOutText}</td>
                          <td className="px-4 py-2 text-gray-600 font-semibold tabular-nums text-xs text-center">{hoursText}</td>
                          <td className="px-4 py-2 text-gray-600 font-semibold tabular-nums text-xs text-center">{overtimeText}</td>
                          <td className="px-4 py-2 text-slate-500 font-medium text-xs text-left whitespace-nowrap" title={c?.remarks || '—'}>
                            {c?.remarks || '—'}
                          </td>
                          <td className="px-4 py-2 text-slate-500 font-medium text-xs text-left whitespace-nowrap" title={c?.approved_by || '—'}>
                            {c?.approved_by || '—'}
                          </td>
                        </tr>
                      );
                    });
                  })}
                  {filtered.length > limit && (
                    <tr >
                      <td colSpan={isFocal ? 10 : 11} className="p-4 text-center bg-white/80 backdrop-blur-xs sticky bottom-0 z-10 border-t border-gray-150">
                        <div className="flex items-center justify-center gap-4 w-full">
                          <span className="text-xs text-gray-500 font-medium text-center">
                            Showing {limit} of {filtered.length} records
                          </span>
                          <button
                            type="button"
                            onClick={() => setRenderLimit(prev => prev + 100)}
                            className="text-xs font-semibold h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors shadow-xs px-4 text-gray-700 cursor-pointer"
                          >
                            Load More
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      ) : reportView === 'individual' ? (
        /* ── INDIVIDUAL REPORT VIEW ── */
        <div ref={tableAreaRef} className="flex-1 overflow-auto border-t border-gray-200 animate-fade-in">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 sticky top-0 z-10">
              <tr style={{ height: "2.5rem" }}>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-left" style={{ width: 130 }}>Date</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-left" style={{ width: 100 }}>Day</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-left" style={{ width: 120 }}>Status</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-left">Check In</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-left">Check Out</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-center" style={{ width: 85 }} title="Excludes 1 hour lunch break">Hours (-1)</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-center" style={{ width: 80 }}>Overtime</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-left" style={{ width: 180 }}>Remarks</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-left" style={{ width: 140 }}>Approved By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {!selectedEmp ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center text-gray-400 font-medium bg-white">
                    No employee selected.
                  </td>
                </tr>
              ) : (
                dayList.map((d) => {
                  const pad = (n: number) => String(n).padStart(2, '0');
                  const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
                  const dateObj = new Date(year, month, d);
                  const displayDate = dateObj.toLocaleDateString('en-OM', { day: '2-digit', month: 'short', year: 'numeric' });
                  const displayDayName = getDayName(year, month, d);

                  const c = matrix[selectedEmp.device_user_id]?.[dateStr];
                  const isWeekendDay = isWeekend(year, month, d, selectedEmp);
                  const isHolidayDay = isHoliday(d);
                  const holiday = holidayMap[d];

                  let statusBadge = null;
                  let checkInText = '—';
                  let checkOutText = '—';
                  let hoursText = '—';
                  let overtimeText = '—';

                  if (c?.status) {
                    if (c.status === 'leave') {
                      statusBadge = <span className="text-base font-normal text-slate-950">Leave</span>;
                    } else if (c.status === 'off') {
                      statusBadge = <span className="text-base font-normal text-slate-950">Off</span>;
                    } else if (c.status === 'absent') {
                      statusBadge = <span className="text-base font-normal text-red-700">Absent</span>;
                    } else if (c.status === 'present' || c.status === 'present with ot') {
                      statusBadge = <span className="text-base font-normal text-slate-950">Present</span>;
                    }
                  } else if (isWeekendDay) {
                    statusBadge = c?.isPresent ? (
                      <span className="text-base font-normal text-slate-950">Worked (Weekend)</span>
                    ) : (
                      <span className="text-base font-normal text-slate-950">Weekend</span>
                    );
                  } else if (isHolidayDay) {
                    statusBadge = c?.isPresent ? (
                      <span className="text-base font-normal text-slate-950">Worked (H)</span>
                    ) : (
                      <span className="text-base font-normal text-slate-950">Holiday ({holiday?.name})</span>
                    );
                  } else {
                    const isFuture = dateObj > today;
                    statusBadge = isFuture ? (
                      <span className="text-base font-normal text-slate-700">—</span>
                    ) : (
                      <span className="text-base font-normal text-red-700">
                        Absent
                      </span>
                    );
                  }

                  if (c?.isPresent) {
                    if (useFirstLast) {
                      checkInText = formatTime(c.firstPunch) || '✓';
                      checkOutText = c.firstPunch === c.lastPunch ? '—' : (formatTime(c.lastPunch) || '—');
                    } else {
                      checkInText = formatTime(c.firstIn) || '✓';
                      checkOutText = formatTime(c.lastOut) || '—';
                    }

                    const inLoc = useFirstLast ? c.firstPunchLocation : c.firstInLocation;
                    const outLoc = useFirstLast ? c.lastPunchLocation : c.lastOutLocation;

                    if (!isFocal) {
                      if (inLoc) checkInText += ` (${inLoc})`;
                      if (outLoc && c.firstPunch !== c.lastPunch) checkOutText += ` (${outLoc})`;
                    }

                    hoursText = getDayHours(c);
                    overtimeText = getOvertime(c, selectedEmp.emp_type);
                  }

                  const isApproved = c?.approved_by || c?.approval;
                  const timeColor = 'text-slate-950 font-semibold';
                  const rowBg = isApproved ? 'bg-indigo-50/30' : '';

                  return (
                    <tr key={d} style={{ height: ROW_H }} className={`hover:bg-gray-55/50 transition-colors border-b border-gray-100 ${rowBg}`}>
                      <td className="px-4 py-2 text-slate-950 font-medium text-base text-left">{displayDate}</td>
                      <td className="px-4 py-2 text-slate-950 font-medium text-left capitalize">{displayDayName.toLowerCase()}</td>
                      <td className="px-4 py-2 text-slate-950 font-normal text-left">{statusBadge}</td>
                      <td className={`px-4 py-2 tabular-nums text-base font-medium text-left ${timeColor}`}>{checkInText}</td>
                      <td className={`px-4 py-2 tabular-nums text-base font-medium text-left ${timeColor}`}>{checkOutText}</td>
                      <td className="px-4 py-2 text-slate-950 font-normal tabular-nums text-base text-center">{hoursText}</td>
                      <td className="px-4 py-2 text-slate-950 font-normal tabular-nums text-base text-center">{overtimeText}</td>
                      <td className="px-4 py-2 text-slate-950 font-normal text-base text-left whitespace-nowrap" title={c?.remarks || '—'}>
                        {c?.remarks || '—'}
                      </td>
                      <td className="px-4 py-2 text-slate-950 font-normal text-base text-left whitespace-nowrap" title={c?.approved_by || '—'}>
                        {c?.approved_by ? (c.approved_by.includes('@') ? c.approved_by.split('@')[0] : c.approved_by) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {selectedEmp && (
              <tfoot className="sticky bottom-0 z-10 border-t-2 border-gray-300 shadow-[0_-2px_5px_rgba(0,0,0,0.05)]">
                <tr style={{ height: ROW_H }} className="font-bold text-base bg-gray-100 text-gray-800">
                  <td className="px-4 py-2 text-left bg-gray-100 text-slate-950" colSpan={3}>TOTALS</td>
                  <td className="px-4 py-2 text-left bg-gray-100 text-slate-950">—</td>
                  <td className="px-4 py-2 text-left bg-gray-100 text-slate-950">—</td>
                  <td className="px-4 py-2 text-center bg-gray-100 text-slate-950 font-bold tabular-nums">
                    {totalHours(selectedEmp.device_user_id)}
                  </td>
                  <td className="px-4 py-2 text-center bg-gray-100 text-slate-950 font-bold tabular-nums">
                    {totalOvertime(selectedEmp.device_user_id, selectedEmp.emp_type)}
                  </td>
                  <td className="px-4 py-2 text-left bg-gray-100 text-slate-950">—</td>
                  <td className="px-4 py-2 text-left bg-gray-100 text-slate-950">—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        /* ── MONTHLY SCROLLABLE ATTENDANCE GRID VIEW ── */
        <div ref={tableAreaRef} className="animate-fade-in" style={{ display: 'flex', flex: 1, overflow: 'hidden', borderTop: '1px solid #f3f4f6' }}>

          {/* ── LEFT FROZEN PANEL ── */}
          <div
            ref={leftRef}
            style={{
              flexShrink: 0,
              overflowY: 'hidden',
              overflowX: 'hidden',
              boxShadow: '3px 0 8px -3px rgba(0,0,0,0.10)',
              zIndex: 10,
            }}
          >
            <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: (reportType === 'hourly' ? 636 : 584) - (isFocal ? 170 : 0) }}>
              <colgroup>
                <col style={{ width: 28 }} />
                <col style={{ width: 270 }} />
                {!isFocal && <col style={{ width: 170 }} />}
                <col style={{ width: 52 }} />
                <col style={{ width: 52 }} />
                {reportType === 'hourly' && <col style={{ width: 52 }} />}
                <col style={{ width: 12 }} />
              </colgroup>
              <thead>
                {/* Row 1: day number */}
                <tr style={{ background: '#f1f5f9', color: '#334155', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 5, paddingBottom: "1rem", height: "2.5rem" }}>
                  <th className="text-[13px] font-medium text-center px-1 py-2">#</th>
                  <th className="text-[13px] font-medium text-left px-3 py-2" style={{ verticalAlign: 'middle' }}>
                    <div className="flex items-center gap-1.5 w-full">
                      <div className="relative flex-1">
                        <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search"
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="h-6 w-full border border-gray-300 rounded text-gray-700 bg-white pl-6 pr-2 py-0.5 outline-none focus:border-gray-400 transition-colors normal-case font-normal text-xs placeholder:text-gray-400"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Filter Emp ID Button */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={`h-6 w-6 shrink-0 flex items-center justify-center border rounded transition-colors ${selectedEmpPrefixes.length > 0
                              ? 'border-amber-500 text-amber-500 hover:bg-amber-500/10'
                              : 'border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400'
                              }`}
                            title="Filter Emp ID"
                          >
                            <Hash size={20} className="" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[180px] max-h-[300px] overflow-y-auto p-0 z-50">
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/95 backdrop-blur-xs"
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedEmpPrefixes(empCodePrefixes);
                              }}
                              className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-left normal-case"
                              style={{ background: "none", flex: 1 }}
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedEmpPrefixes([]);
                              }}
                              className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-right normal-case"
                              style={{ background: "none", flex: 1 }}
                            >
                              Clear
                            </button>
                          </div>
                          {empCodePrefixes.map(prefix => {
                            const isChecked = selectedEmpPrefixes.includes(prefix);
                            return (
                              <DropdownMenuCheckboxItem
                                key={prefix}
                                checked={isChecked}
                                onSelect={(e) => e.preventDefault()}
                                onCheckedChange={checked => {
                                  if (checked) {
                                    setSelectedEmpPrefixes([...selectedEmpPrefixes, prefix]);
                                  } else {
                                    setSelectedEmpPrefixes(selectedEmpPrefixes.filter(item => item !== prefix));
                                  }
                                }}
                                style={{ fontWeight: 400 }}
                                className="rounded-md focus:bg-gray-50 cursor-pointer text-xs normal-case font-medium"
                              >
                                {prefix}
                              </DropdownMenuCheckboxItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Filter Type Button */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={`h-6 w-6 shrink-0 flex items-center justify-center border rounded transition-colors ${selectedTypes.length > 0
                              ? 'border-indigo-500 text-indigo-500 hover:bg-indigo-500/10'
                              : 'border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400'
                              }`}
                            title="Filter Type (Staff/Worker)"
                          >
                            <User size={14} className="" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[180px] p-0 z-50 bg-white border border-gray-200 rounded-lg shadow-md">
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/95 backdrop-blur-xs"
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedTypes(['staff', 'worker']);
                              }}
                              className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-left normal-case"
                              style={{ background: "none", flex: 1 }}
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedTypes([]);
                              }}
                              className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-right normal-case"
                              style={{ background: "none", flex: 1 }}
                            >
                              Clear
                            </button>
                          </div>
                          {['staff', 'worker'].map(type => {
                            const isChecked = selectedTypes.includes(type);
                            return (
                              <DropdownMenuCheckboxItem
                                key={type}
                                checked={isChecked}
                                onSelect={(e) => e.preventDefault()}
                                onCheckedChange={checked => {
                                  if (checked) {
                                    setSelectedTypes([...selectedTypes, type]);
                                  } else {
                                    setSelectedTypes(selectedTypes.filter(item => item !== type));
                                  }
                                }}
                                style={{ fontWeight: 400 }}
                                className="rounded-md focus:bg-gray-50 cursor-pointer text-xs capitalize font-medium"
                              >
                                {type}
                              </DropdownMenuCheckboxItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Filter Nationality Button */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={`h-6 w-6 shrink-0 flex items-center justify-center border rounded transition-colors ${nationalityFilter !== 'ALL'
                              ? 'border-indigo-500 text-indigo-500 hover:bg-indigo-500/10'
                              : 'border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400'
                              }`}
                            title="Filter Nationality"
                          >
                            <Globe size={14} className="" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[180px] p-0 z-50 bg-white border border-gray-200 rounded-lg shadow-md">
                          <div className="py-1">
                            <DropdownMenuCheckboxItem
                              checked={nationalityFilter === 'ALL'}
                              onCheckedChange={() => setNationalityFilter('ALL')}
                              className="rounded-md focus:bg-gray-50 cursor-pointer text-xs font-medium"
                            >
                              All Nationalities
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem
                              checked={nationalityFilter === 'OMANI'}
                              onCheckedChange={() => setNationalityFilter('OMANI')}
                              className="rounded-md focus:bg-gray-50 cursor-pointer text-xs font-medium"
                            >
                              Omani Only
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem
                              checked={nationalityFilter === 'NON_OMANI'}
                              onCheckedChange={() => setNationalityFilter('NON_OMANI')}
                              className="rounded-md focus:bg-gray-50 cursor-pointer text-xs font-medium"
                            >
                              Non-Omani Only
                            </DropdownMenuCheckboxItem>
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </th>
                  {!isFocal && (
                    <th className="text-[13px] font-medium text-left px-1 py-1" style={{ width: 170 }}>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 text-slate-700 hover:bg-slate-200/50 focus:ring-0 focus:ring-offset-0 focus:outline-none shadow-none px-2 rounded-md transition-colors font-medium w-full justify-between flex items-center outline-none">
                          <span className="truncate">
                            {selectedLocations.length === 0
                              ? 'Location (All)'
                              : selectedLocations.length === 1
                                ? selectedLocations[0]
                                : `Location (${selectedLocations.length})`}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-80 shrink-0" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[200px] max-h-[300px] overflow-y-auto p-0 z-50">
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/95 backdrop-blur-xs"
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedLocations(locations);
                              }}
                              className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-left"
                              style={{ background: "none", flex: 1 }}
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedLocations([]);
                              }}
                              className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-right"
                              style={{ background: "none", flex: 1 }}
                            >
                              Clear
                            </button>
                          </div>
                          {locations.map(loc => {
                            const isChecked = selectedLocations.includes(loc);
                            return (
                              <DropdownMenuCheckboxItem
                                key={loc}
                                checked={isChecked}
                                onSelect={(e) => e.preventDefault()}
                                onCheckedChange={checked => {
                                  if (checked) {
                                    setSelectedLocations([...selectedLocations, loc]);
                                  } else {
                                    setSelectedLocations(selectedLocations.filter(item => item !== loc));
                                  }
                                }}
                                style={{ fontWeight: 400 }}
                                className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                              >
                                {loc}
                              </DropdownMenuCheckboxItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </th>
                  )}
                  <th className="text-[13px] font-medium text-center py-2" style={{ background: '#d1fae5', color: '#065f46' }}>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-full bg-transparent border-0 text-emerald-800 hover:bg-emerald-200/50 px-1 py-1 rounded-md text-[13px] font-semibold outline-none flex items-center gap-1 mx-auto">
                        P
                        <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[180px] p-0 z-50">
                        <div className="py-1">
                          <DropdownMenuCheckboxItem
                            checked={presenceFilter === 'ALL'}
                            onCheckedChange={() => setPresenceFilter('ALL')}
                            className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                          >
                            All
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem
                            checked={presenceFilter === 'ZERO'}
                            onCheckedChange={() => setPresenceFilter('ZERO')}
                            className="rounded-md focus:bg-gray-50 cursor-pointer text-xs font-semibold text-red-600 focus:text-red-700"
                          >
                            Zero Punches
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem
                            checked={presenceFilter === 'NON_ZERO'}
                            onCheckedChange={() => setPresenceFilter('NON_ZERO')}
                            className="rounded-md focus:bg-gray-50 cursor-pointer text-xs font-semibold text-emerald-700 focus:text-emerald-800"
                          >
                            Non Zero Punches
                          </DropdownMenuCheckboxItem>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </th>
                  <th className="text-[13px] font-medium text-center py-2" style={{ background: '#fee2e2', color: '#991b1b' }}>A</th>
                  {reportType === 'hourly' && <th className="text-[13px] font-medium text-center py-2" style={{ background: '#fef3c7', color: '#92400e' }}>OT</th>}
                  <th style={{ background: '#f1f5f9' }} />
                </tr>
                {/* Row 2: In/Out sub-label spacer */}
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: HEAD_R1, zIndex: 5, border: "", height: HEAD_R2 }}>
                  <th style={{ padding: '4px 0' }} />
                  <th style={{ padding: '4px 0' }} />
                  {!isFocal && <th style={{ padding: '4px 0' }} />}
                  <th style={{ background: '#ecfdf5' }} />
                  <th style={{ background: '#fef2f2' }} />
                  {reportType === 'hourly' && <th style={{ background: '#fffbeb' }} />}
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={(reportType === 'hourly' ? 7 : 6) - (isFocal ? 1 : 0)} className="py-20 text-center text-gray-400 font-medium bg-white">
                      No employee found.
                    </td>
                  </tr>
                ) : (
                  <>
                    {filtered.slice(0, limit).map((emp, idx) => (
                      <FrozenRow
                        key={emp.id}
                        emp={emp}
                        index={idx}
                        locationList={employeeLocations[emp.device_user_id] || '—'}
                        presenceCount={presenceDays(emp.device_user_id)}
                        absentCount={absentDays(emp.device_user_id)}
                        overtimeCount={totalOvertime(emp.device_user_id, emp.emp_type)}
                        showOvertime={reportType === 'hourly'}
                        isHighlighted={highlightedRows.has(emp.device_user_id)}
                        onClick={() => {
                          if (highlightMode) {
                            toggleRowHighlight(emp.device_user_id);
                          }
                        }}
                        highlightMode={highlightMode}
                        isFocal={isFocal}
                      />
                    ))}
                    {filtered.length > limit && (
                      <tr style={{ height: ROW_H }}>
                        <td colSpan={(reportType === 'hourly' ? 7 : 6) - (isFocal ? 1 : 0)} className="p-2 text-center bg-white/95 backdrop-blur-xs sticky bottom-0 z-10 border-t border-gray-150" style={{ height: ROW_H }}>
                          <div className="flex items-center justify-center gap-4 w-full h-full">
                            <span className="text-base text-gray-500 font-medium whitespace-nowrap text-center">
                              Showing {limit} of {filtered.length} rows
                            </span>
                            <button
                              type="button"
                              onClick={() => setRenderLimit(prev => prev + 100)}
                              className="text-xs font-semibold h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors shadow-xs px-3 text-gray-700 cursor-pointer"
                            >
                              Load More
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* ── RIGHT SCROLLABLE PANEL ── */}
          <div
            ref={rightRef}
            style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}
          >
            <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: `${dayList.length * (reportType === 'location_inout' ? 240 : reportType === 'inout' ? 92 : 46)}px`, borderSpacing: 0 }}>
              <colgroup>
                {dayList.map(d => (
                  reportType === 'inout' || reportType === 'location_inout' ? (
                    <Fragment key={`col-${d}`}>
                      <col style={{ width: reportType === 'location_inout' ? 120 : 46 }} />
                      <col style={{ width: reportType === 'location_inout' ? 120 : 46 }} />
                    </Fragment>
                  ) : (
                    <col key={`col-${d}`} style={{ width: 46 }} />
                  )
                ))}
              </colgroup>
              <thead
                style={{ cursor: isDayHeaderDragging ? 'grabbing' : 'grab', userSelect: isDayHeaderDragging ? 'none' : 'auto' }}
                onPointerDown={handleDayHeaderPointerDown}
                onPointerMove={handleDayHeaderPointerMove}
                onPointerUp={handleDayHeaderPointerUp}
                onPointerCancel={handleDayHeaderPointerUp}
              >
                {/* Row 1: day number + weekday */}
                <tr style={{ background: '#f1f5f9', color: '#334155', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 5, height: HEAD_R1 }}>
                  {dayList.map(d => {
                    const holiday = holidayMap[d];
                    const bg = isWeekend(year, month, d)
                      ? '#cbd5e1'
                      : holiday
                        ? '#bfdbfe'
                        : '#f1f5f9';
                    return (
                      <th
                        key={d}
                        colSpan={reportType === 'inout' || reportType === 'location_inout' ? 2 : 1}
                        className="text-center text-[13px] font-medium text-slate-700"
                        style={{ background: bg }}
                        title={holiday ? `Holiday: ${holiday.name}` : undefined}
                      >
                        <div className="leading-tight">{d}</div>
                        <div className="text-[10px] font-normal opacity-60 leading-tight">{getDayName(year, month, d)}</div>
                      </th>
                    );
                  })}
                </tr>
                {/* Row 2: In / Out labels */}
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: HEAD_R1, zIndex: 5, height: HEAD_R2 }}>
                  {dayList.map(d => {
                    const holiday = holidayMap[d];
                    const bg = isWeekend(year, month, d) ? '#f3f4f6' : holiday ? '#eef2ff' : '#f9fafb';
                    if (reportType === 'hourly') {
                      return <th key={`lbl-${d}`} className="text-[11px] text-gray-400 font-medium text-center" style={{ background: bg }}>Hrs</th>;
                    }
                    if (reportType === 'pa') {
                      return <th key={`lbl-${d}`} className="text-[11px] text-gray-400 font-medium text-center" style={{ background: bg }}></th>;
                    }
                    return (
                      <Fragment key={`lbl-${d}`}>
                        <th className="text-[11px] text-gray-400 font-medium text-center" style={{ background: bg }}>In</th>
                        <th className="text-[11px] text-gray-400 font-medium text-center" style={{ background: bg }}>Out</th>
                      </Fragment>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={dayList.length * (reportType === 'inout' || reportType === 'location_inout' ? 2 : 1)} className="py-20 text-center text-gray-300 font-medium bg-white" style={{ height: ROW_H }}>
                      —
                    </td>
                  </tr>
                ) : (
                  <>
                    {filtered.slice(0, limit).map(emp => (
                      <ScrollableRow
                        key={emp.id}
                        emp={emp}
                        dayList={dayList}
                        reportType={reportType}
                        useFirstLast={useFirstLast}
                        matrixForEmployee={matrix[emp.device_user_id]}
                        year={year}
                        month={month}
                        today={today}
                        holidayMap={holidayMap}
                        isHighlighted={highlightedRows.has(emp.device_user_id)}
                        onClick={() => {
                          if (highlightMode) {
                            toggleRowHighlight(emp.device_user_id);
                          }
                        }}
                        highlightMode={highlightMode}
                      />
                    ))}
                    {filtered.length > limit && (
                      <tr style={{ height: ROW_H }}>
                        <td colSpan={dayList.length * (reportType === 'inout' || reportType === 'location_inout' ? 2 : 1)} className="bg-white/95 backdrop-blur-xs sticky bottom-0 z-10 border-t border-gray-150" style={{ height: ROW_H }}>
                          <div style={{ height: '100%' }} />
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Legend ── */}
      <div className="text-center text-[10px] text-gray-300 py-1 flex-shrink-0">
        — = Friday off · A = Absent · H = Holiday · Green = In · Orange = Out · All times GMT+4
      </div>

      {/* Holiday Dialog */}
      <ResponsiveModal
        open={isHolidayModalOpen}
        onOpenChange={setIsHolidayModalOpen}
        title={`Declare Holidays for ${monthLabel(month, year)}`}
        description=""
      >
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }} className="border-b border-gray-100 pb-4">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4b5563' }}>Day of Month</label>
              <Select
                value={String(newHolidayDay)}
                onValueChange={val => setNewHolidayDay(parseInt(val))}
              >
                <SelectTrigger className="h-9 w-[80px] bg-white border-gray-300 rounded-md text-xs">
                  <SelectValue placeholder="Day" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {dayList.map(d => (
                    <SelectItem style={{ justifyContent: "flex-start" }} key={d} value={String(d)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4b5563' }}>Holiday Name</label>
              <input
                type="text"
                placeholder="e.g. National Day"
                value={newHolidayName}
                onChange={e => setNewHolidayName(e.target.value)}
                style={{ height: '2.25rem', fontSize: '0.85rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', padding: '0 0.75rem', outline: 'none' }}
              />
            </div>

            <button
              onClick={async () => {
                if (!newHolidayName.trim()) {
                  toast.error("Please enter a holiday name");
                  return;
                }
                setHolidaySubmitting(true);
                try {
                  await addDoc(collection(db, 'attendance_holidays'), {
                    year,
                    month,
                    day: newHolidayDay,
                    name: newHolidayName.trim(),
                    created_at: new Date().toISOString()
                  });
                  setNewHolidayName('');
                  toast.success("Holiday declared successfully");
                } catch (err) {
                  console.error("Error adding holiday:", err);
                  toast.error("Failed to declare holiday");
                } finally {
                  setHolidaySubmitting(false);
                }
              }}
              disabled={holidaySubmitting}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-4 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              {holidaySubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Add
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h5 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Declared Holidays ({holidays.length})</h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '200px', overflowY: 'auto' }}>
              {holidays.map((h) => (
                <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', border: '1px solid #e5e7eb', padding: '0.4rem 0.75rem', borderRadius: '0.375rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#1f2937' }}>
                    <strong style={{ marginRight: '0.5rem' }}>Day {h.day}:</strong> {h.name}
                  </span>
                  <button
                    onClick={async () => {
                      if (confirm(`Are you sure you want to delete the holiday on day ${h.day}?`)) {
                        try {
                          await deleteDoc(doc(db, 'attendance_holidays', h.id));
                          toast.success("Holiday deleted");
                        } catch (err) {
                          console.error("Error deleting holiday:", err);
                          toast.error("Failed to delete holiday");
                        }
                      }
                    }}
                    style={{ color: '#ef4444' }}
                    className="p-1 hover:bg-red-50 rounded transition-colors bg-transparent border-0 cursor-pointer"
                  >
                    <CircleMinus className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {holidays.length === 0 && (
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', padding: '1rem 0' }}>No public holidays declared for this month.</p>
              )}
            </div>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}
