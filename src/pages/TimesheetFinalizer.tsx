import { useAuth } from '@/components/AuthProvider';
import { DatePicker } from '@/components/date-picker';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  Laptop2,
  Loader2,
  Lock,
  Search,
  Stamp,
  Unlock,
  X,
  SquareCheck,
  Undo2,
  Redo2,
  Users,
  Sparkles,
  ArrowRightLeft,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { toast } from 'sonner';
import { parsePunchLocation, parseLocationGeofence } from '../lib/geofence';
import { supabase } from '../lib/supabase';


interface Employee {
  id: number;
  device_user_id: string;
  name: string;
  department: string | null;
  emp_id: string;
  emp_type: 'staff' | 'worker' | null;
  nationality: string | null;
}

interface Punch {
  id: number;
  user_id: string;
  punch_time: string;
  verify_type: number;
  punch_type: number;
  device_serial: string;
  raw: string;
  mobile_location?: string;
}

interface Project {
  project_code: string;
  project_name: string;
  project_in_time?: string | null;
  project_out_time?: string | null;
  project_location?: string | null;
  focal_point_email?: string | null;
  approver_email?: string | null;
}

const isProjectDualRole = (projectCode: string | null | undefined, projectsList: Project[], userEmail?: string | null): boolean => {
  if (!projectCode) return false;
  const p = projectsList.find(proj => proj.project_code === projectCode);
  if (!p) return false;

  if (p.focal_point_email && p.approver_email && p.focal_point_email.toLowerCase().trim() === p.approver_email.toLowerCase().trim()) {
    return true;
  }

  if (userEmail && p.focal_point_email && p.approver_email) {
    const userNorm = userEmail.toLowerCase().trim();
    if (p.focal_point_email.toLowerCase().trim() === userNorm && p.approver_email.toLowerCase().trim() === userNorm) {
      return true;
    }
  }

  return false;
};

const normalizeString = (str: string) => {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
};

const findProjectCode = (currentProject: string | null | undefined, projectList: Project[]): string => {
  if (!currentProject || currentProject === 'No Project Assigned') return '';

  const normCp = normalizeString(currentProject);
  let bestMatch: Project | null = null;
  let bestScore = 0;

  for (const p of projectList) {
    const normCode = normalizeString(p.project_code);
    const normName = normalizeString(p.project_name);
    const normLoc = p.project_location ? normalizeString(parseLocationGeofence(p.project_location).name) : '';

    let score = 0;

    // 1. Exact Match (Score: 100)
    if (normCode === normCp || normName === normCp || (normLoc && normLoc === normCp)) {
      score = 100;
    } else {
      // Tokenize for word-boundary matches
      const cpTokens = currentProject.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const codeTokens = p.project_code.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const nameTokens = p.project_name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const locTokens = p.project_location ? parseLocationGeofence(p.project_location).name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) : [];

      const hasCodeToken = codeTokens.length > 0 && codeTokens.every(t => cpTokens.includes(t));
      const hasNameToken = nameTokens.length > 0 && nameTokens.every(t => cpTokens.includes(t));
      const hasLocToken = locTokens.length > 0 && locTokens.every(t => cpTokens.includes(t));

      // 2. Token-level/Word-level match (Score: 80)
      if (hasCodeToken || hasNameToken || hasLocToken) {
        score = 80;
      } else {
        // 3. Substring match (Score: 50, but ignore short codes < 3 chars to prevent false positives like 'ng')
        const isCodeMatch = normCode.includes(normCp) || normCp.includes(normCode);
        const isNameMatch = normName.includes(normCp) || normCp.includes(normName);
        const isLocMatch = normLoc && (normLoc.includes(normCp) || normCp.includes(normLoc));

        if (isCodeMatch || isNameMatch || isLocMatch) {
          let isTooShort = false;
          if (isCodeMatch && normCode.length < 3) isTooShort = true;
          if (isNameMatch && normName.length < 3) isTooShort = true;
          if (isLocMatch && normLoc.length < 3) isTooShort = true;

          if (!isTooShort) {
            score = 50;
          }
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = p;
    }
  }

  return bestMatch ? bestMatch.project_code : '';
};

interface TimesheetRow {
  employee_code: string;
  employee_name: string;
  department: string | null;
  nationality: string | null;
  punch_in: string; // "HH:MM" or ""
  punch_out: string; // "HH:MM" or ""
  project_code: string;
  overtime: number;
  remarks: string;
  verify_type: string;
  attested_by: string;
  isEdited: boolean;
  original_in_punch?: Punch | null;
  original_out_punch?: Punch | null;
  status?: string;
  isApproved?: boolean;
  isVerified?: boolean;
  approval?: boolean;
  inDatabase?: boolean;
  machine?: string | null;
  verified_by?: string | null;
  approved_by?: string | null;
  lastLocalEdit?: number;
  created_at?: string | null;
}
const isHolidayOrWeekendRecord = (row: TimesheetRow): boolean => {
  const status = row.status?.trim().toLowerCase();
  const remarks = row.remarks?.trim().toLowerCase();
  return (status === 'holiday' && remarks === 'holiday') ||
    (status === 'weekend' && remarks === 'weekend');
};
type SourceFilter = 'ALL' | 'MANUAL' | 'LEAVE_LOG' | 'DEVICE' | 'NO_SOURCE';

const getYesterdayString = () => {
  const yesterday = new Date(Date.now() - 86400000);
  const yyyy = yesterday.getFullYear();
  const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
  const dd = String(yesterday.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatTwitterTimeAgo = (dateStr: string | null | undefined) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

const extractTime = (timestampStr: string | null) => {
  if (!timestampStr) return '';
  try {
    const dateObj = new Date(timestampStr);
    // Format to local HH:MM (using local browser time)
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return '';
  }
};

const buildTimestamp = (dateStr: string, timeStr: string) => {
  if (!timeStr) return null;
  // Assumes local timezone offset (Asia/Muscat = +04:00)
  return `${dateStr}T${timeStr}:00+04:00`;
};

const calculateTotalHours = (punchIn: string, punchOut: string) => {
  if (!punchIn || !punchOut) return '—';
  try {
    const [inH, inM] = punchIn.split(':').map(Number);
    const [outH, outM] = punchOut.split(':').map(Number);
    if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return '—';
    let diffMin = (outH * 60 + outM) - (inH * 60 + inM);
    if (diffMin < 0) diffMin += 24 * 60;
    // Deduct 1 hour (60 minutes) for lunch break
    diffMin = Math.max(0, diffMin - 60);
    const hrs = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    const formattedHrs = String(hrs).padStart(2, '0');
    const formattedMins = String(mins).padStart(2, '0');
    return `${formattedHrs}:${formattedMins}`;
  } catch {
    return '—';
  }
};

const getVerifyTypeLabel = (punch: Punch | null): string => {
  if (!punch) return 'Manual Input';
  if (punch.mobile_location || (punch.raw && punch.raw.includes('MOBILE'))) {
    return 'Mobile Punch';
  }
  if (punch.verify_type === 1) return 'Fingerprint';
  if (punch.verify_type === 4 || punch.verify_type === 15) return 'Face';
  if (punch.verify_type === 0 || punch.verify_type === 3) return 'Password';
  return 'Password';
};

const parseAttestedBy = (attestedBy: string | null | undefined, isApproved: boolean) => {
  const str = attestedBy || '';
  if (str.includes('|')) {
    const parts = str.split('|');
    return {
      verifier: parts[0] || null,
      approver: parts[1] || null,
      machineCode: parts[2] || null
    };
  }
  if (str.includes('@')) {
    if (isApproved) {
      return {
        verifier: null,
        approver: str,
        machineCode: null
      };
    } else {
      return {
        verifier: str,
        approver: null,
        machineCode: null
      };
    }
  }
  return {
    verifier: null,
    approver: null,
    machineCode: str || null
  };
};

const getSourceCategory = (row: TimesheetRow): Exclude<SourceFilter, 'ALL'> => {
  if (row.isEdited) return 'MANUAL';

  const { machineCode } = parseAttestedBy(row.attested_by, !!row.isApproved);
  if (machineCode === 'Leave Log') return 'LEAVE_LOG';

  const hasDevice = machineCode && machineCode !== 'Un-Mapped' && machineCode !== 'Timekeeper';
  return hasDevice ? 'DEVICE' : 'NO_SOURCE';
};


const getApprovalBadge = (row: TimesheetRow) => {
  if (!row.isApproved) return null;
  const { approver } = parseAttestedBy(row.attested_by, !!row.isApproved);
  const displayText = approver || 'Approved';
  if (!displayText) return null;
  return (
    <span style={{ borderBottom: "2px solid #4f46e5", gap: "0.25rem" }} className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold text-indigo-800 bg-indigo-50/50 rounded-t-[3px]">
      <Stamp size={12} />
      {displayText}
    </span>
  );
};

const getDbAttestedAndVerified = (r: TimesheetRow, userEmail: string | null | undefined) => {
  const email = userEmail || '';
  const devSerials: string[] = [];
  if (r.original_in_punch) devSerials.push(r.original_in_punch.device_serial);
  if (r.original_out_punch) devSerials.push(r.original_out_punch.device_serial);
  const uniqueSerials = Array.from(new Set(devSerials)).filter(Boolean);

  let deviceCode = uniqueSerials.join('/');
  if (!deviceCode && r.machine && r.machine !== 'Un-Mapped' && r.machine !== 'Timekeeper') {
    deviceCode = r.machine;
  }
  if (!deviceCode && r.attested_by && r.attested_by !== 'Timekeeper' && !r.attested_by.includes('@') && r.attested_by !== 'Un-Mapped') {
    deviceCode = r.attested_by;
  }

  const finalMachine = deviceCode || r.machine || null;
  const finalAttestedBy = deviceCode || r.attested_by || email || 'Timekeeper';

  if (r.original_in_punch && r.original_out_punch) {
    const inM = extractTime(r.original_in_punch.punch_time);
    const outM = extractTime(r.original_out_punch.punch_time);
    const isUnmodified = r.punch_in === inM && r.punch_out === outM && !r.isEdited;
    if (isUnmodified) {
      return {
        attested_by: finalAttestedBy,
        machine: finalMachine,
        verified_by: null
      };
    } else {
      return {
        attested_by: finalAttestedBy,
        machine: finalMachine,
        verified_by: email || null
      };
    }
  } else if (r.original_in_punch || r.original_out_punch) {
    return {
      attested_by: finalAttestedBy,
      machine: finalMachine,
      verified_by: email || null
    };
  } else {
    return {
      attested_by: finalAttestedBy,
      machine: finalMachine,
      verified_by: email || null
    };
  }
};

const employeeEmailCache: Record<string, any> = {};

const TimesheetRowComponent = memo(({
  emp,
  row,
  isSelected,
  isSelectionMode,
  isLocked,
  canUserEdit,
  isFocalFiltered,
  resolvedMode,
  saving,
  onRowSelect,
  onUpdateRow,
  onUndoRow,
  onApproveRow,
  onRevokeApproveRow,
  isVerifying,
  onVerifyBiometricRow,
  projectsWithDevices,
  projects,
  employeeAssignedProjects,
}: {
  emp: Employee;
  row: TimesheetRow;
  isSelected: boolean;
  isSelectionMode: boolean;
  isLocked: boolean;
  canUserEdit: boolean;
  isFocalFiltered: boolean;
  resolvedMode: 'verify' | 'approve' | 'finalize' | 'view';
  saving: boolean;
  onRowSelect: (userId: string) => void;
  onUpdateRow: (userId: string, key: keyof TimesheetRow | 'swap_punches', value?: any) => void;
  onUndoRow: (userId: string) => void;
  onApproveRow: (userId: string) => void;
  onRevokeApproveRow: (userId: string) => void;
  isVerifying?: boolean;
  onVerifyBiometricRow?: (userId: string) => void;
  projectsWithDevices: Set<string>;
  projects: Project[];
  employeeAssignedProjects: Record<string, string>;
}) => {
  const { userData } = useAuth();

  const [swapClicks, setSwapClicks] = useState(0);
  const [isHighlighting, setIsHighlighting] = useState(false);

  const parentCustomText = useMemo(() => {
    if (!row.remarks) return '';
    return row.remarks.startsWith('Custom: ') ? row.remarks.substring(8) : '';
  }, [row.remarks]);

  const [localRemarks, setLocalRemarks] = useState(parentCustomText);

  useEffect(() => {
    setLocalRemarks(parentCustomText);
  }, [parentCustomText]);

  const [hoveredEmail, setHoveredEmail] = useState<string | null>(null);
  const [hoveredEmpDetails, setHoveredEmpDetails] = useState<any>(null);
  const [loadingHover, setLoadingHover] = useState(false);
  const [popupDirection, setPopupDirection] = useState<'up' | 'down'>('up');
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleEmailMouseEnter = async (email: string, e: React.MouseEvent) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredEmail(email);

    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.top < 180) {
      setPopupDirection('down');
    } else {
      setPopupDirection('up');
    }

    if (employeeEmailCache[email]) {
      setHoveredEmpDetails(employeeEmailCache[email]);
      return;
    }

    setLoadingHover(true);
    setHoveredEmpDetails(null);
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('name, emp_id, department, designation, company, status')
        .eq('email', email)
        .maybeSingle();

      if (error) throw error;

      const details = data || { name: 'Unknown User', emp_id: '—' };
      employeeEmailCache[email] = details;
      setHoveredEmpDetails(details);
    } catch (err) {
      console.error('Error fetching employee hover details:', err);
      setHoveredEmpDetails({ name: 'Error Loading', emp_id: '—' });
    } finally {
      setLoadingHover(false);
    }
  };

  const handleEmailMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredEmail(null);
      setHoveredEmpDetails(null);
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const empProjCode = row.project_code || employeeAssignedProjects[emp.emp_id] || '';
  const isDual = isProjectDualRole(empProjCode, projects, userData?.email);
  const isUserFocalOnly = resolvedMode === 'verify' && !isDual;
  const isRecordApproved = row.isApproved || !!row.approved_by || row.approval;
  const isRowEditable = canUserEdit && !isLocked && !(isUserFocalOnly && isRecordApproved);
  const isSaved = row.inDatabase && row.status !== 'no status' && !!row.status;

  const isRemarksInvalid = useMemo(() => {
    const isBiometricFullyPopulated = !!row.original_in_punch && !!row.original_out_punch;
    const needsRemarks = row.status === 'absent' ||
      ((row.status === 'present' || row.status === 'present with OT') && !isBiometricFullyPopulated);

    return needsRemarks && (!row.remarks || row.remarks.trim() === '' || row.remarks === 'Custom: ' || row.remarks.trim() === 'Custom:');
  }, [row.status, row.remarks, row.original_in_punch, row.original_out_punch]);

  const hasNoRedBorders = useMemo(() => {
    const isHolidayOrWeekend = isHolidayOrWeekendRecord(row);
    // 1. Status check
    const isStatusRed = !row.status || row.status === 'no status';
    if (isStatusRed) return false;

    // 2. Project & Punch check (only when status is not absent/no status)
    if (!isHolidayOrWeekend && row.status !== 'absent' && row.status !== 'no status') {
      const isProjectRed = !row.project_code || row.project_code === '' || row.project_code === 'UNASSIGNED';
      if (isProjectRed) return false;

      // Both punch times must be filled
      if (!row.punch_in || !row.punch_out) return false;
    }

    // 3. Remarks check
    if (isRemarksInvalid) return false;

    return true;
  }, [row.status, row.project_code, row.punch_in, row.punch_out, isRemarksInvalid]);

  const isApproveModeReadOnly = resolvedMode === 'approve' && !isDual && !(!row.status || row.status === 'no status' || !hasNoRedBorders);



  return (
    <tr data-row-id={emp.device_user_id} className={row.isApproved ? 'indigo-row-highlight' : ((row.inDatabase && hasNoRedBorders) ? 'green-row-highlight' : undefined)}>
      <td
        className="sticky-checkbox transition-[width,opacity] duration-200 ease-in-out overflow-hidden"
        style={{
          width: isSelectionMode ? "48px" : "0px",
          minWidth: isSelectionMode ? "48px" : "0px",
          maxWidth: isSelectionMode ? "48px" : "0px",
          opacity: isSelectionMode ? 1 : 0,
          pointerEvents: isSelectionMode ? "auto" : "none",
          textAlign: 'center',
          padding: '0'
        }}
      >
        <div className="w-12 h-12 flex items-center justify-center overflow-hidden">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onRowSelect(emp.device_user_id)}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border border-slate-400 bg-white data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 data-[state=checked]:text-white focus-visible:ring-indigo-500 cursor-pointer shrink-0"
          />
        </div>
      </td>
      {/* Employee Info */}
      <td className="sticky-name transition-[left] duration-200 ease-in-out" style={{ left: isSelectionMode ? '48px' : '0' }} onClick={() => {
        if (isSelectionMode) {
          onRowSelect(emp.device_user_id);
        }
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: '#f1f5f9',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 500,
              letterSpacing: '0.05em',
              border: 'none',
              flexShrink: 0
            }}
            title={emp.name}
          >
            {(() => {
              const parts = emp.name ? emp.name.trim().split(/\s+/) : [];
              if (parts.length === 0) return '??';
              if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
              return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
            })()}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#0f172a', textTransform: "uppercase" }}>{emp.name.toLowerCase()}</div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              <span style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '4px' }}>
                {emp.device_user_id}
              </span>
              <span>·</span>
              <span style={{ textTransform: 'capitalize' }}>
                {emp.emp_type || 'undefined'}
              </span>
            </div>
          </div>
        </div>
      </td>

      {/* Status Select */}
      <td style={{ textAlign: 'center' }}>
        {(!isRowEditable || isApproveModeReadOnly || isSaved || !!row.original_in_punch || !!row.original_out_punch) ? (
          <span className={`text-xs font-semibold px-2 py-1 rounded inline-flex items-center justify-center ${row.status === 'present' ? 'text-emerald-700 bg-emerald-50/80 border border-emerald-200' :
            row.status === 'present with OT' ? 'text-indigo-700 bg-indigo-50/80 border border-indigo-200' :
              row.status === 'absent' ? 'text-rose-700 bg-rose-50/80 border border-rose-200' :
                row.status === 'weekend' ? 'text-amber-900 bg-amber-50/80 border border-amber-200' :
                  row.status === 'holiday' ? 'text-orange-950 bg-orange-50/80 border border-orange-200' :
                'text-slate-500 bg-slate-100 border border-slate-200'
            }`}>
            {row.status ? (row.status === 'present with OT' ? 'Present (OT)' : row.status.charAt(0).toUpperCase() + row.status.slice(1)) : 'No Status'}
          </span>
        ) : (
          <Select
            value={row.status || 'no status'}
            onValueChange={(val) => onUpdateRow(emp.device_user_id, 'status', val)}
          >
            <SelectTrigger className={`w-[140px] text-xs h-8 bg-white border focus:ring-1 ${(!row.status || row.status === 'no status')
              ? 'border-red-500 focus:ring-red-500 bg-red-50/30'
              : 'border-slate-300 focus:ring-slate-300'
              }`}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-white border border-slate-200 z-50">
              <SelectItem value="no status" className="text-xs cursor-pointer focus:bg-slate-50">No Status</SelectItem>
              <SelectItem value="present" className="text-xs cursor-pointer focus:bg-slate-50">Present</SelectItem>
              <SelectItem value="absent" className="text-xs cursor-pointer focus:bg-slate-50">Absent</SelectItem>
              <SelectItem value="weekend" className="text-xs cursor-pointer focus:bg-slate-50">Weekend</SelectItem>
              <SelectItem value="holiday" className="text-xs cursor-pointer focus:bg-slate-50">Holiday</SelectItem>
              {emp.emp_type !== 'staff' && (
                <SelectItem value="present with OT" className="text-xs cursor-pointer focus:bg-slate-50">Present with OT</SelectItem>
              )}
            </SelectContent>
          </Select>
        )}
      </td>

      {/* Punch In Input */}
      <td style={{ textAlign: 'center' }}>
        <div className="relative w-full flex items-center justify-center">
          {(!isRowEditable || isApproveModeReadOnly || isSaved || !!row.original_in_punch) ? (
            <span className="text-xs text-slate-800 font-semibold px-2 py-1 block text-center">
              {row.punch_in || '—'}
            </span>
          ) : (
            <Input
              type="time"
              value={row.punch_in}
//              onChange={(e) => onUpdateRow(emp.device_user_id, 'punch_in', e.target.value)}
              style={((row.status === 'present' || row.status === 'present with OT') && !row.punch_in) ? {
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#ef4444',
                backgroundColor: 'rgba(254, 242, 242, 0.3)'
              } : undefined}
              className="h-8 text-xs w-[120px] bg-white border border-slate-300 focus:ring-1 focus:ring-slate-300"
            />
          )}

          {/* Swap In/Out Button */}
          {(((row.punch_in && !row.punch_out) || (!row.punch_in && row.punch_out)) && row.status && row.status !== 'no status' && !isSaved && !isLocked && canUserEdit && !isApproveModeReadOnly) && (
            <button
              type="button"
              onClick={() => {
                setSwapClicks(prev => prev + 1);
                setIsHighlighting(true);
                onUpdateRow(emp.device_user_id, 'swap_punches');
                setTimeout(() => setIsHighlighting(false), 500);
              }}
              className="absolute flex items-center justify-center rounded-md cursor-pointer focus:outline-none transition-all duration-200 hover:scale-125 active:scale-90"
              style={{
                right: '-26px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '28px',
                height: '28px',
                background: "none"
              }}
              title="Swap In and Out times"
            >
              <ArrowRightLeft
                className={`w-4 h-4 text-slate-400 hover:text-slate-600 transition-all duration-300 ease-out ${isHighlighting ? 'text-emerald-500 scale-75' : ''
                  }`}
                style={{
                  transform: `rotate(${swapClicks * 180}deg)`,
                  transition: 'transform 0.5s ease-out'
                }}
              />
            </button>
          )}
        </div>
      </td>

      {/* Punch Out Input */}
      <td style={{ textAlign: 'center' }}>
        {(!isRowEditable || isApproveModeReadOnly || isSaved || !!row.original_out_punch) ? (
          <span className="text-xs text-slate-800 font-semibold px-2 py-1 block text-center">
            {row.punch_out || '—'}
          </span>
        ) : (
          <Input
            type="time"
            value={row.punch_out}
//            onChange={(e) => onUpdateRow(emp.device_user_id, 'punch_out', e.target.value)}
            style={((row.status === 'present' || row.status === 'present with OT') && !row.punch_out) ? {
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: '#ef4444',
              backgroundColor: 'rgba(254, 242, 242, 0.3)'
            } : undefined}
            className="h-8 text-xs w-[120px] bg-white border border-slate-300 focus:ring-1 focus:ring-slate-300"
          />
        )}
      </td>

      {/* Total Hours */}
      <td style={{ fontSize: '12px', fontWeight: 600, color: '#334155', textAlign: 'center' }}>
        {calculateTotalHours(row.punch_in, row.punch_out)}
      </td>

      {/* Overtime Input */}
      <td style={{ textAlign: 'center' }}>
        {(!isRowEditable || (resolvedMode === 'approve' && !isDual) || isRecordApproved || emp.emp_type === 'staff') ? (
          <span className="text-xs text-slate-800 font-semibold px-2 py-1 block text-center">
            {emp.emp_type === 'staff' ? '—' : (row.overtime ?? 0)}
          </span>
        ) : (
          <input
            type="number"
            step="0.5"
            min="0"
            max="24"
            value={row.overtime}
//            onChange={(e) => onUpdateRow(emp.device_user_id, 'overtime', parseFloat(e.target.value) || 0)}
            className="table-input"
            style={{ width: '70px' }}
          />
        )}
      </td>

      {/* Project Allocation Text */}
      {!(isFocalFiltered || resolvedMode === 'approve') && (
        <td style={{ textAlign: 'center' }}>
          <span className="text-xs font-medium text-slate-600">
            {row.project_code || <span className="text-slate-400 font-normal italic">Unassigned</span>}
          </span>
        </td>
      )}

      {/* Remarks Input */}
      <td>
        {(!isRowEditable || isApproveModeReadOnly || isSaved) ? (
          <span className="text-xs text-slate-800 font-medium px-2 py-1">
            {row.remarks ? (row.remarks.startsWith('Custom: ') ? row.remarks.substring(8) : row.remarks) : '—'}
          </span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <Select
              disabled={!row.status || row.status === 'no status'}
              value={
                row.remarks === ''
                  ? 'NONE'
                  : (row.remarks === 'Present' || row.remarks === 'Forgot to Punch' || row.remarks === 'Forgot to Punch In' || row.remarks === 'Forgot to Punch Out' || row.remarks === 'Sick Leave' || row.remarks === 'Unpaid Leave' || row.remarks === 'Casual Leave' || row.remarks === 'Emergency Leave' || row.remarks === 'No Device' || row.remarks === 'Half Day' || row.remarks === 'Weekend' || row.remarks === 'Holiday')
                    ? row.remarks
                    : 'CUSTOM'
              }
              onValueChange={(val) => {
                if (val === 'NONE') {
                  onUpdateRow(emp.device_user_id, 'remarks', '');
                } else if (val === 'CUSTOM') {
                  onUpdateRow(emp.device_user_id, 'remarks', 'Custom: ');
                } else {
                  onUpdateRow(emp.device_user_id, 'remarks', val);
                }
              }}
            >
              <SelectTrigger className={`w-[150px] text-xs h-8 bg-white border focus:ring-1 ${isRemarksInvalid
                ? 'border-red-500 focus:ring-red-500 bg-red-50/30'
                : 'border-slate-300 focus:ring-slate-300'
                }`}>
                <SelectValue placeholder="No Remark" />
              </SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 z-50">
                <SelectItem value="NONE" className="text-xs cursor-pointer focus:bg-slate-50">No Remark</SelectItem>

                {(row.status === 'present' || row.status === 'present with OT') ? (
                  <>
                    {!projectsWithDevices.has(empProjCode) ? (
                      <SelectItem value="No Device" className="text-xs cursor-pointer focus:bg-slate-50">No Device</SelectItem>
                    ) : (
                      <>
                        {(row.original_in_punch && !row.original_out_punch) ? (
                          <SelectItem value="Forgot to Punch Out" className="text-xs cursor-pointer focus:bg-slate-50">Forgot to Punch Out</SelectItem>
                        ) : (!row.original_in_punch && row.original_out_punch) ? (
                          <SelectItem value="Forgot to Punch In" className="text-xs cursor-pointer focus:bg-slate-50">Forgot to Punch In</SelectItem>
                        ) : (
                          <SelectItem value="Forgot to Punch" className="text-xs cursor-pointer focus:bg-slate-50">Forgot to Punch</SelectItem>
                        )}
                      </>
                    )}
                    <SelectItem value="Half Day" className="text-xs cursor-pointer focus:bg-slate-50">Half Day</SelectItem>
                  </>
                ) : row.status === 'absent' ? (
                  <>
                    <SelectItem value="Sick Leave" className="text-xs cursor-pointer focus:bg-slate-50">Sick Leave</SelectItem>
                    <SelectItem value="Unpaid Leave" className="text-xs cursor-pointer focus:bg-slate-50">Unpaid Leave</SelectItem>
                    <SelectItem value="Casual Leave" className="text-xs cursor-pointer focus:bg-slate-50">Casual Leave</SelectItem>
                    <SelectItem value="Emergency Leave" className="text-xs cursor-pointer focus:bg-slate-50">Emergency Leave</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="Forgot to Punch" className="text-xs cursor-pointer focus:bg-slate-50">Forgot to Punch</SelectItem>
                    <SelectItem value="Forgot to Punch In" className="text-xs cursor-pointer focus:bg-slate-50">Forgot to Punch In</SelectItem>
                    <SelectItem value="Forgot to Punch Out" className="text-xs cursor-pointer focus:bg-slate-50">Forgot to Punch Out</SelectItem>
                    <SelectItem value="Sick Leave" className="text-xs cursor-pointer focus:bg-slate-50">Sick Leave</SelectItem>
                    <SelectItem value="Unpaid Leave" className="text-xs cursor-pointer focus:bg-slate-50">Unpaid Leave</SelectItem>
                    <SelectItem value="Casual Leave" className="text-xs cursor-pointer focus:bg-slate-50">Casual Leave</SelectItem>
                    <SelectItem value="Emergency Leave" className="text-xs cursor-pointer focus:bg-slate-50">Emergency Leave</SelectItem>
                    <SelectItem value="No Device" className="text-xs cursor-pointer focus:bg-slate-50">No Device</SelectItem>
                    <SelectItem value="Holiday" className="text-xs cursor-pointer focus:bg-slate-50">Holiday</SelectItem>
                    <SelectItem value="Weekend" className="text-xs cursor-pointer focus:bg-slate-50">Weekend</SelectItem>
                  </>
                )}

                <SelectItem value="CUSTOM" className="text-xs cursor-pointer focus:bg-slate-50">Custom...</SelectItem>
              </SelectContent>
            </Select>

            {(row.remarks !== '' && row.remarks !== 'Present' && row.remarks !== 'Forgot to Punch' && row.remarks !== 'Forgot to Punch In' && row.remarks !== 'Forgot to Punch Out' && row.remarks !== 'Sick Leave' && row.remarks !== 'Unpaid Leave' && row.remarks !== 'Casual Leave' && row.remarks !== 'Emergency Leave' && row.remarks !== 'No Device' && row.remarks !== 'Half Day' && row.remarks !== 'Holiday' && row.remarks !== 'Weekend') && (
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <Input
                  type="text"
                  value={localRemarks}
//                  onChange={(e) => setLocalRemarks(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onUpdateRow(emp.device_user_id, 'remarks', 'Custom: ' + localRemarks);
                    }
                  }}
                  placeholder="Enter remark"
                  className={`h-8 text-xs w-[112px] bg-white border focus:ring-1 ${isRemarksInvalid
                    ? 'border-red-500 focus:ring-red-500 bg-red-50/30'
                    : 'border-slate-300 focus:ring-slate-300'
                    }`}
                />
                <button
                  type="button"
                  onClick={() => {
                    onUpdateRow(emp.device_user_id, 'remarks', 'Custom: ' + localRemarks);
                  }}
                  className="flex items-center justify-center hover:bg-emerald-100 rounded-md text-emerald-700 h-8 w-8 cursor-pointer shadow-xs shrink-0 transition-colors"
                  title="Save custom remark"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </td>

      {/* Nationality Display */}
      <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
        <span className="text-xs text-slate-700 font-medium px-2 py-1 block">
          {row.nationality || '—'}
        </span>
      </td>

      {/* Source & Actions */}
      <td className="sticky-action" style={{ right: '0', zIndex: hoveredEmail ? 99999 : undefined }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px 6px' }}>
          {/* 1. Source Badge (Original & Unchanged - Full Width) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
            {(() => {
              const showApproverButtons = resolvedMode === 'approve' && !isFocalFiltered && (row.isVerified || row.approval || hasNoRedBorders) && !row.isApproved && row.approved_by !== 'review';
              if (showApproverButtons) {
                return (
                  <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onApproveRow(emp.device_user_id)}
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: '#0d9488',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        flex: 1,
                        justifyContent: 'center',
                        height: '24px',
                      }}
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onUndoRow(emp.device_user_id)}
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '4px',

                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        flex: 1,
                        justifyContent: 'center',
                        height: '24px',
                      }}
                      title="Revoke verification & revert to original"
                    >
                      <Undo2 className="w-3.5 h-3.5" /> Revoke
                    </button>
                  </div>
                );
              }

              if (row.isVerified || row.isApproved || row.approved_by === 'review' || row.approval || row.isEdited) {
                let badgeBg = 'teal';
                let badgeText = 'Verified';

                if (row.approved_by === 'review') {
                  badgeBg = '#ea580c';
                  badgeText = 'Needs Review';
                } else if (row.isApproved || row.approval || (row.approved_by && row.approved_by !== 'review')) {
                  badgeBg = '#4f46e5';
                  badgeText = 'Verified & Approved';
                } else if (row.isVerified || hasNoRedBorders) {
                  badgeBg = '#0d9488';
                  badgeText = 'Verified';
                } else if (row.isEdited) {
                  badgeBg = '#d97706';
                  badgeText = 'Manual';
                }

                return (
                  <span
                    style={{
                      fontSize: "0.7rem",
                      background: badgeBg,
                      color: 'white',
                      border: "none",
                      fontWeight: 500,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: 'space-between',
                      padding: "1px 6px",
                      borderRadius: "3px",
                      flex: 1,
                      width: '100%'
                    }}
                    className="source-badge"
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {(badgeText === 'Verified' || badgeText === 'Verified & Approved') && <Check className="w-3 h-3 shrink-0" />}
                      {badgeText === 'Approved' && <Stamp className="w-3 h-3 shrink-0" />}
                      {badgeText === 'Finalized' && <SquareCheck className="w-3 h-3 shrink-0" />}
                      {badgeText === 'Needs Review' && <AlertCircle className="w-3 h-3 shrink-0" />}
                      {badgeText}
                    </span>
                    {(badgeText === 'Verified' || badgeText === 'Verified & Approved') && row.created_at && (
                      <span className="opacity-75 text-[9px] font-normal pl-2 shrink-0">
                        {formatTwitterTimeAgo(row.created_at)}
                      </span>
                    )}
                  </span>
                );
              }

              const { machineCode } = parseAttestedBy(row.attested_by, !!row.isApproved);
              const hasDevice = machineCode && machineCode !== 'Un-Mapped' && machineCode !== 'Timekeeper';
              if (machineCode === 'Leave Log') {
                return (
                  <span style={{ fontSize: "0.7rem", background: "#6366f1", color: "white", fontWeight: 500, display: "flex", alignItems: "center", gap: "8px", padding: "1px 6px", borderRadius: "3px", flex: 1 }} className="source-badge source-leave" title={row.attested_by}>
                    <Calendar className="w-3 h-3 shrink-0" />
                    Leave Log
                  </span>
                );
              } else if (hasDevice) {
                return (
                  <span style={{ fontSize: "0.7rem", background: "teal", color: "white", fontWeight: 500, display: "flex", alignItems: "center", gap: "8px", padding: "1px 6px", borderRadius: "3px", flex: 1 }} className="source-badge source-auto" title={row.attested_by}>
                    <Laptop2 className="w-3 h-3 shrink-0" />
                    {machineCode}
                  </span>
                );
              } else {
                return (
                  <span style={{ fontSize: "0.7rem", background: "slategray", color: "white", fontWeight: 500, display: "flex", alignItems: "center", gap: "8px", padding: "1px 6px", borderRadius: "3px", flex: 1 }} className="source-badge source-nosource" title={row.attested_by || "No source found"}>
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    No Source
                  </span>
                );
              }
            })()}

            {(() => {
              if (isVerifying) {
                return (
                  <button
                    type="button"
                    disabled
                    className="p-1 text-teal-600 bg-teal-50 rounded border border-teal-300 flex items-center justify-center shrink-0 shadow-2xs"
                    style={{ width: "20px", height: "20px" }}
                    title="Uploading and verifying record..."
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  </button>
                );
              }

              const isApproverOnlyMode = resolvedMode === 'approve' && !isFocalFiltered;

              if (isApproverOnlyMode) {
                if ((row.isApproved || !!row.approved_by) && !isLocked && canUserEdit) {
                  return (
                    <button
                      type="button"
                      onClick={() => onRevokeApproveRow(emp.device_user_id)}
                      disabled={saving}
                      className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-all cursor-pointer border border-slate-200 bg-white flex items-center justify-center shrink-0"
                      title="Revoke approval & revert to verified"
                      style={{ width: "20px", height: "20px" }}
                    >
                      <Undo2 className="w-3 h-3" />
                    </button>
                  );
                }
                return null;
              }

              const isSavedOrVerified = row.inDatabase || row.isVerified || row.isApproved || !!row.verified_by || !!row.approved_by;
              const canRevoke = !(isUserFocalOnly && isRecordApproved);

              if (isSavedOrVerified && !isLocked && canUserEdit && canRevoke) {
                return (
                  <button
                    type="button"
                    onClick={() => onUndoRow(emp.device_user_id)}
                    disabled={saving}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-all cursor-pointer border border-slate-200 bg-white flex items-center justify-center shrink-0"
                    title={row.inDatabase ? "Revoke verification & revert to original" : "Undo manual changes back to original"}
                    style={{ width: "20px", height: "20px" }}
                  >
                    <Undo2 className="w-3 h-3" />
                  </button>
                );
              }

              const { machineCode } = parseAttestedBy(row.attested_by, !!row.isApproved);
              const hasDevice = machineCode && machineCode !== 'Un-Mapped' && machineCode !== 'Timekeeper';
              const isBiometricFullyPopulated = (!!row.original_in_punch && !!row.original_out_punch) || (hasDevice && !!row.punch_in && !!row.punch_out);

              if (isBiometricFullyPopulated && !isLocked && canUserEdit && !isSavedOrVerified && resolvedMode !== 'approve') {
                return (
                  <button
                    type="button"
                    onClick={() => {
                      if (onVerifyBiometricRow) {
                        onVerifyBiometricRow(emp.device_user_id);
                      } else {
                        onUpdateRow(emp.device_user_id, 'isEdited', true);
                      }
                    }}
                    disabled={saving}
                    className="p-1 text-white hover:text-white hover:bg-teal-700 rounded transition-all cursor-pointer bg-teal-600 flex items-center justify-center shrink-0 shadow-2xs"
                    title="Verify record fully populated by biometric machine"
                    style={{ width: "20px", height: "20px" }}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                );
              }

              return null;
            })()}
          </div>

          {/* 2. Attestation Details & Status/Actions inline underneath */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {(row.isEdited || row.verified_by || row.approved_by || row.isVerified || (row.inDatabase && hasNoRedBorders)) ? (
              <span className={row.isApproved ? 'text-indigo-600 font-semibold' : (hasNoRedBorders ? 'text-teal-600' : 'text-amber-700')} style={{ fontSize: '10px', whiteSpace: 'nowrap', fontWeight: 555, display: 'inline-flex', alignItems: 'center' }}>
                {(() => {
                  const emails: string[] = [];
                  if (row.verified_by && row.verified_by.includes('@')) emails.push(row.verified_by);
                  if (row.approved_by && row.approved_by.includes('@')) emails.push(row.approved_by);
                  if (emails.length === 0 && row.attested_by && row.attested_by.includes('@')) {
                    emails.push(row.attested_by);
                  }
                  if (emails.length === 0 && userData?.email) {
                    emails.push(userData.email);
                  }
                  const uniqueEmails = Array.from(new Set(emails));
                  if (uniqueEmails.length === 0) {
                    return <span>{userData?.email || 'Timekeeper'}</span>;
                  }
                  return uniqueEmails.map((email, idx) => (
                    <span key={email} className="inline-flex items-center">
                      {idx > 0 && <span style={{ color: '#94a3b8', margin: '0 4px', fontWeight: 'normal' }}>|</span>}
                      <span
                        onMouseEnter={(e) => handleEmailMouseEnter(email, e)}
                        onMouseLeave={handleEmailMouseLeave}
                        className="cursor-help hover:underline decoration-dotted relative inline-block"
                      >
                        {email}
                        {hoveredEmail === email && (
                          <div className={`absolute ${popupDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'} right-0 z-[9999] bg-white text-slate-800 border border-slate-200 rounded-xl p-3 shadow-xl w-64 text-xs font-normal normal-case leading-relaxed pointer-events-none transition-all duration-200 animate-in fade-in slide-in-from-bottom-2`}>
                            {loadingHover ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                                <span className="ml-2 text-slate-500">Loading details...</span>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="min-w-0">
                                  <h4 className="font-semibold text-slate-900 text-sm leading-none truncate">
                                    {hoveredEmpDetails?.name || 'Unknown User'}
                                  </h4>
                                  <p className="text-slate-400 text-[10px] truncate mt-0.5">
                                    {email}
                                  </p>
                                </div>
                                <div className="h-px bg-slate-100 my-1" />
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px] text-left">
                                  <div>
                                    <span className="text-slate-400 block font-medium">Emp ID</span>
                                    <span className="text-slate-700 font-semibold">{hoveredEmpDetails?.emp_id || '—'}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 block font-medium">Department</span>
                                    <span className="text-slate-700 font-semibold">{hoveredEmpDetails?.department || '—'}</span>
                                  </div>
                                  {hoveredEmpDetails?.designation && (
                                    <div className="col-span-2">
                                      <span className="text-slate-400 block font-medium">Designation</span>
                                      <span className="text-slate-700 font-semibold truncate block">{hoveredEmpDetails.designation}</span>
                                    </div>
                                  )}
                                  {hoveredEmpDetails?.company && (
                                    <div className="col-span-2">
                                      <span className="text-slate-400 block font-medium">Company</span>
                                      <span className="text-slate-700 font-semibold truncate block">{hoveredEmpDetails.company}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </span>
                    </span>
                  ));
                })()}
              </span>
            ) : (
              <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500 }}>
                {row.verify_type}
              </span>
            )}

            {isLocked && getApprovalBadge(row)}
          </div>
        </div>
      </td>

    </tr>
  );
});

interface TimesheetFinalizerProps {
  refreshTrigger?: number;
  onLoadingChange?: (loading: boolean) => void;
  mode?: 'verify' | 'approve' | 'finalize' | 'view';
}

export default function TimesheetFinalizer({
  refreshTrigger,
  onLoadingChange,
  mode
}: TimesheetFinalizerProps = {}) {
  const [date, setDate] = useState<string>(getYesterdayString());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<Record<string, TimesheetRow>>({});
  const initialRowsRef = useRef<Record<string, TimesheetRow>>({});
  const [isLocked, setIsLocked] = useState(false);
  const [lockedBy, setLockedBy] = useState<string | null>(null);

  const [punchMode] = useState<'first_last' | 'check_in_out'>('first_last');
  const [punchGroups, setPunchGroups] = useState<Record<string, Punch[]>>({});
  const [deviceProjectMap, setDeviceProjectMap] = useState<Record<string, string>>({});
  const [employeeAssignedProjects, setEmployeeAssignedProjects] = useState<Record<string, string>>({});

  const projectsWithDevices = useMemo(() => {
    return new Set(Object.values(deviceProjectMap).filter(Boolean));
  }, [deviceProjectMap]);

  // Selection and bulk states
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const [isBulkPunchTimeOpen, setIsBulkPunchTimeOpen] = useState(false);
  const [bulkPunchInValue, setBulkPunchInValue] = useState('');
  const [bulkPunchOutValue, setBulkPunchOutValue] = useState('');

  const [isBulkOvertimeOpen, setIsBulkOvertimeOpen] = useState(false);
  const [bulkOvertimeValue, setBulkOvertimeValue] = useState(0);

  const [isBulkProjectOpen, setIsBulkProjectOpen] = useState(false);
  const [bulkProjectValue, setBulkProjectValue] = useState('');

  const [isBulkStatusOpen, setIsBulkStatusOpen] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState<'present' | 'absent' | 'present with OT' | 'holiday'| 'weekend'| 'no status'>('no status');

  const [isBulkRemarksOpen, setIsBulkRemarksOpen] = useState(false);
  const [bulkRemarksValue, setBulkRemarksValue] = useState('');
  const [bulkCustomRemarksValue, setBulkCustomRemarksValue] = useState('');

  const punchModeRef = useRef(punchMode);
  useEffect(() => {
    punchModeRef.current = punchMode;
  }, [punchMode]);

  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const reloadTimerRef = useRef<any>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Synchronize loading with parent via onLoadingChange
  useEffect(() => {
    if (onLoadingChange) {
      onLoadingChange(loading);
    }
  }, [loading, onLoadingChange]);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [punchInFilter, setPunchInFilter] = useState<'all' | 'null' | 'not_null'>('all');
  const [punchOutFilter, setPunchOutFilter] = useState<'all' | 'null' | 'not_null'>('all');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL');
  const [empTypeFilter, setEmpTypeFilter] = useState<'all' | 'staff' | 'worker'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'absent' | 'present with OT' | 'holiday'| 'weekend'| 'no status'>('all');
  const [nationalityFilter, setNationalityFilter] = useState<string>('ALL');
  const [roundOT] = useState(true);
  const [focalProjectCodes, setFocalProjectCodes] = useState<string[]>([]);
  const [isFocalFiltered, setIsFocalFiltered] = useState(false);
  const [approverProjectCodes, setApproverProjectCodes] = useState<string[]>([]);
  const [isApproverFiltered, setIsApproverFiltered] = useState(false);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('ALL');

  // History and Redo state for Undo / Redo actions
  const [history, setHistory] = useState<Record<string, TimesheetRow>[]>([]);
  const [redoStack, setRedoStack] = useState<Record<string, TimesheetRow>[]>([]);
  const [verifyingRowIds, setVerifyingRowIds] = useState<Set<string>>(new Set());

  const pushHistory = useCallback((currentRows: Record<string, TimesheetRow>) => {
    setHistory(prev => [...prev.slice(-29), { ...currentRows }]);
    setRedoStack([]);
  }, []);

  const { userData } = useAuth();

  const resolvedMode = useMemo(() => {
    if (mode) return mode;
    try {
      const permissions = JSON.parse(userData?.clearance || "{}") as Record<string, boolean>;
      const hasStructuredClearance = Object.keys(permissions).length > 0;
      if (permissions.timesheet_finalizer === true) return 'finalize';
      if (permissions.timesheet_approver === true) return 'approve';
      if (permissions.timesheet_viewer === true) return 'view';

      if (!hasStructuredClearance && (userData?.role === 'admin' || userData?.role === 'site_admin')) {
        return 'finalize';
      }
    } catch (e) { }
    return 'verify';
  }, [mode, userData?.clearance, userData?.role]);

  const canUserEdit = useMemo(() => {
    try {
      const permissions = JSON.parse(userData?.clearance || "{}") as Record<string, boolean>;
      const hasStructuredClearance = Object.keys(permissions).length > 0;
      const isAdmin = userData?.role === "admin" || userData?.role === "site_admin";

      if (resolvedMode === 'view') {
        return false;
      }
      if (isFocalFiltered || focalProjectCodes.length > 0) {
        return true;
      }
      if (resolvedMode === 'verify') {
        return isFocalFiltered || isAdmin || (hasStructuredClearance && permissions.attendance === true);
      }
      if (resolvedMode === 'finalize') {
        return permissions.timesheet_finalizer === true || isAdmin;
      }
      if (resolvedMode === 'approve') {
        return isApproverFiltered || approverProjectCodes.length > 0 || focalProjectCodes.length > 0 || isAdmin || (hasStructuredClearance && permissions.timesheet_approver === true);
      }
      return false;
    } catch {
      return userData?.role === "admin" || userData?.role === "site_admin";
    }
  }, [userData, resolvedMode, isFocalFiltered, focalProjectCodes, isApproverFiltered, approverProjectCodes]);

  const canUserAction = useMemo(() => {
    try {
      const permissions = JSON.parse(userData?.clearance || "{}") as Record<string, boolean>;
      const hasStructuredClearance = Object.keys(permissions).length > 0;
      const isAdmin = userData?.role === "admin" || userData?.role === "site_admin";

      if (resolvedMode === 'view') {
        return false;
      }
      if (resolvedMode === 'verify') {
        return isFocalFiltered || isAdmin || (hasStructuredClearance && permissions.attendance === true);
      }
      if (resolvedMode === 'approve') {
        return true;
      }
      if (resolvedMode === 'finalize') {
        return permissions.timesheet_finalizer === true || isAdmin;
      }
      return false;
    } catch {
      return userData?.role === "admin" || userData?.role === "site_admin";
    }
  }, [userData, resolvedMode, isFocalFiltered]);

  const employeesMap = useMemo(() => {
    return Object.fromEntries(employees.map(e => [e.device_user_id, e]));
  }, [employees]);

  const [renderLimit, setRenderLimit] = useState(100);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setRenderLimit(100);
  }, [search, punchInFilter, punchOutFilter, selectedProjects]);

  const guessRow = useCallback((
    emp: Employee,
    empPunches: Punch[],
    mode: 'first_last' | 'check_in_out',
    currentProjects: Project[],
    currentDeviceProjectMap: Record<string, string>,
    assignedProjectsMap: Record<string, string>
  ) => {
    let firstPunch: Punch | null = null;
    let lastPunch: Punch | null = null;
    let computedProject = '';

    if (empPunches.length > 0) {
      if (mode === 'first_last') {
        firstPunch = empPunches[0];
        if (empPunches.length > 1) {
          const last = empPunches[empPunches.length - 1];
          const diffMs = new Date(last.punch_time).getTime() - new Date(firstPunch.punch_time).getTime();
          if (diffMs > 5 * 60 * 1000) { // 5 minutes threshold
            lastPunch = last;
          }
        }
      } else {
        const checkInPunches = empPunches.filter(p => p.punch_type === 0);
        const checkOutPunches = empPunches.filter(p => p.punch_type === 1);
        firstPunch = checkInPunches.length > 0 ? checkInPunches[0] : null;
        const lastOutPunch = checkOutPunches.length > 0 ? checkOutPunches[checkOutPunches.length - 1] : null;

        if (firstPunch && lastOutPunch) {
          const diffMs = new Date(lastOutPunch.punch_time).getTime() - new Date(firstPunch.punch_time).getTime();
          if (diffMs > 5 * 60 * 1000) {
            lastPunch = lastOutPunch;
          }
        } else if (lastOutPunch) {
          lastPunch = lastOutPunch;
        }
      }
    }

    const assignedProj = assignedProjectsMap[emp.emp_id] || '';
    if (assignedProj) {
      computedProject = assignedProj;
    } else if (firstPunch) {
      const isMobilePunch = firstPunch.mobile_location || (firstPunch.raw && firstPunch.raw.includes('MOBILE'));

      if (isMobilePunch) {
        computedProject = '';
        if (firstPunch.mobile_location) {
          const { location: projName } = parsePunchLocation(firstPunch.mobile_location, undefined);
          if (projName && projName !== '—' && projName !== 'Un-Mapped') {
            const matchedProj = (currentProjects || []).find(p => p.project_name.toLowerCase().trim() === projName.toLowerCase().trim());
            if (matchedProj) {
              computedProject = matchedProj.project_code;
            }
          }
        }
      } else {
        computedProject = currentDeviceProjectMap[firstPunch.device_serial] || '';
      }
    }

    const inTime = firstPunch ? extractTime(firstPunch.punch_time) : '';
    const outTime = lastPunch ? extractTime(lastPunch.punch_time) : '';

    let resolvedAttestedBy = firstPunch ? firstPunch.device_serial : (userData?.email || 'Timekeeper');
    if (firstPunch && (firstPunch.mobile_location || (firstPunch.raw && firstPunch.raw.includes('MOBILE')))) {
      const { location: projName } = parsePunchLocation(firstPunch.mobile_location, undefined);
      if (projName === 'Un-Mapped') {
        resolvedAttestedBy = 'Un-Mapped';
      } else {
        resolvedAttestedBy = projName || 'Mobile';
      }
    }

    const defaultStatus = (inTime || outTime)
      ? 'present'
      : 'no status';

    return {
      employee_code: emp.device_user_id,
      employee_name: emp.name,
      department: emp.department,
      nationality: emp.nationality,
      punch_in: inTime,
      punch_out: outTime,
      project_code: computedProject,
      overtime: 0,
      remarks: '',
      verify_type: firstPunch ? getVerifyTypeLabel(firstPunch) : 'Manual Input',
      attested_by: resolvedAttestedBy,
      isEdited: false,
      original_in_punch: firstPunch,
      original_out_punch: lastPunch,
      status: defaultStatus,
      isApproved: false
    };
  }, [userData?.email]);



  const loadTimesheet = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
    }
    setError(null);
    try {
      // 1. Fetch employees, projects, devices, latest employee project mappings, and punches for the selected date
      const start = `${date}T00:00:00`;
      const end = `${date}T23:59:59`;

      const [
        { data: empData, error: empErr },
        { data: projData, error: projErr },
        { data: devData, error: devErr },
        { data: latestProjData, error: latestProjErr },
        { data: punchesData, error: punchErr },
        { data: transfersData, error: transfersErr }
      ] = await Promise.all([
        supabase.from('employees').select('id, device_user_id, name, department, emp_id, emp_type, nationality').or('status.ilike.active,status.is.null').order('name'),
        supabase.from('projects').select('project_code, project_name, project_in_time, project_out_time, project_location, focal_point_email, approver_email').order('project_code'),
        supabase.from('devices').select('serial_no, project_code'),
        supabase.from('v_employee_latest_project').select('emp_id, current_project'),
        supabase.from('punches').select('*').gte('punch_time', start).lte('punch_time', end).order('punch_time', { ascending: true }),
        supabase.from('transfers').select('emp_id, transfer_date, from_project, to_project, created_at').order('transfer_date', { ascending: false })
      ]);

      if (empErr) throw empErr;
      if (projErr) throw projErr;
      if (devErr) throw devErr;
      if (latestProjErr) throw latestProjErr;
      if (punchErr) throw punchErr;
      if (transfersErr) throw transfersErr;

      const assignedProjMap: Record<string, string> = {};
      if (latestProjData) {
        latestProjData.forEach(item => {
          if (item.emp_id && item.current_project) {
            let activeProjectName = item.current_project;

            if (transfersData) {
              const matchedEmp = (empData || []).find(e => e.emp_id === item.emp_id || String(e.id) === item.emp_id);
              if (matchedEmp) {
                const empTransfers = transfersData
                  .filter(t => t.emp_id === matchedEmp.emp_id || String(t.emp_id) === String(matchedEmp.id))
                  .sort((a: any, b: any) => {
                    const dateA = a.transfer_date ? a.transfer_date.slice(0, 10) : '';
                    const dateB = b.transfer_date ? b.transfer_date.slice(0, 10) : '';
                    if (dateA !== dateB) return dateA.localeCompare(dateB);
                    return (a.created_at || '').localeCompare(b.created_at || '');
                  });

                if (empTransfers.length > 0) {
                  const queryDateStr = date;
                  let lastEffectiveTransfer = null;
                  for (const t of empTransfers) {
                    const tDateStr = t.transfer_date ? t.transfer_date.slice(0, 10) : '';
                    if (tDateStr <= queryDateStr) {
                      lastEffectiveTransfer = t;
                    }
                  }

                  if (lastEffectiveTransfer) {
                    activeProjectName = lastEffectiveTransfer.to_project;
                  } else {
                    activeProjectName = empTransfers[0].from_project;
                  }
                }
              }
            }

            assignedProjMap[item.emp_id] = findProjectCode(activeProjectName, projData || []);
          }
        });
      }
      setEmployeeAssignedProjects(assignedProjMap);

      // 1. Determine if focal point filter is active
      let focalProjectCodesLocal: string[] = [];
      let isFocalFilteredLocal = false;

      if (resolvedMode === 'verify' && userData?.role !== 'admin' && userData?.email) {
        const { data: focalProjects } = await supabase
          .from('projects')
          .select('project_code')
          .eq('focal_point_email', userData.email);

        if (focalProjects && focalProjects.length > 0) {
          focalProjectCodesLocal = focalProjects.map(p => p.project_code);
          isFocalFilteredLocal = true;
        }
      }

      setFocalProjectCodes(focalProjectCodesLocal);
      setIsFocalFiltered(isFocalFilteredLocal);

      // 1b. Determine if approver filter is active
      let approverProjectCodesLocal: string[] = [];
      let isApproverFilteredLocal = false;

      if (resolvedMode === 'approve' && userData?.role !== 'admin' && userData?.email) {
        const { data: approverProjects } = await supabase
          .from('projects')
          .select('project_code')
          .eq('approver_email', userData.email);

        if (approverProjects && approverProjects.length > 0) {
          approverProjectCodesLocal = approverProjects.map(p => p.project_code);
          isApproverFilteredLocal = true;
        }
      }

      setApproverProjectCodes(approverProjectCodesLocal);
      setIsApproverFiltered(isApproverFilteredLocal);

      const projectDeviceSerials = (devData ?? [])
        .filter(d => d.project_code && focalProjectCodesLocal.includes(d.project_code))
        .map(d => d.serial_no);

      const punchedOnProjectDevicesToday = new Set<string>();
      if (isFocalFilteredLocal && punchesData && projectDeviceSerials.length > 0) {
        punchesData.forEach(p => {
          if (p.user_id && p.device_serial && projectDeviceSerials.includes(p.device_serial)) {
            punchedOnProjectDevicesToday.add(p.user_id);
          }
        });
      }

      let allowedEmpIds = new Set<number>();
      let allowedDeviceUserIds = new Set<string>();

      if (isFocalFilteredLocal) {
        if (projectDeviceSerials.length > 0) {
          const { data: cmdData } = await supabase
            .from('device_commands')
            .select('employee_id')
            .in('device_serial', projectDeviceSerials);

          if (cmdData) {
            cmdData.forEach(c => {
              if (c.employee_id) allowedEmpIds.add(c.employee_id);
            });
          }

          const { data: punchUserIds } = await supabase
            .from('punches')
            .select('user_id')
            .in('device_serial', projectDeviceSerials)
            .limit(5000);

          if (punchUserIds) {
            punchUserIds.forEach(p => {
              if (p.user_id) allowedDeviceUserIds.add(p.user_id);
            });
          }
        }
      }

      const filteredEmployees = isFocalFilteredLocal
        ? (empData || []).filter(emp => {
          const hasProjectMatch = emp.emp_id && assignedProjMap[emp.emp_id] && focalProjectCodesLocal.includes(assignedProjMap[emp.emp_id]);
          if (hasProjectMatch) return true;

          const empProjCode = emp.emp_id ? assignedProjMap[emp.emp_id] : '';
          const hasDifferentProjectAssigned = empProjCode && !focalProjectCodesLocal.includes(empProjCode);
          if (hasDifferentProjectAssigned) {
            return punchedOnProjectDevicesToday.has(emp.device_user_id);
          }

          return allowedEmpIds.has(emp.id) ||
            allowedDeviceUserIds.has(emp.device_user_id);
        })
        : isApproverFilteredLocal
          ? (empData || []).filter(emp => {
            const empProjCode = emp.emp_id ? assignedProjMap[emp.emp_id] : '';
            return empProjCode && approverProjectCodesLocal.includes(empProjCode);
          })
          : (empData || []);

      const filteredProjects = isFocalFilteredLocal
        ? (projData || []).filter(p => focalProjectCodesLocal.includes(p.project_code))
        : isApproverFilteredLocal
          ? (projData || []).filter(p => approverProjectCodesLocal.includes(p.project_code))
          : (projData || []);

      setEmployees(filteredEmployees);
      setProjects(filteredProjects);

      const devProjMap = Object.fromEntries(
        (devData || []).map(d => [d.serial_no, d.project_code])
      );
      setDeviceProjectMap(devProjMap);

      const visibleDeviceUserIds = new Set(filteredEmployees.map(emp => emp.device_user_id).filter(Boolean));
      const filteredPunches = isFocalFilteredLocal
        ? (punchesData || []).filter(p =>
          (p.user_id && visibleDeviceUserIds.has(p.user_id)) ||
          (p.device_serial && projectDeviceSerials.includes(p.device_serial))
        )
        : isApproverFilteredLocal
          ? (punchesData || []).filter(p => p.user_id && visibleDeviceUserIds.has(p.user_id))
          : (punchesData || []);

      // Group punches by employee device_user_id
      const pGroups: Record<string, Punch[]> = {};
      filteredPunches.forEach((p: Punch) => {
        if (!pGroups[p.user_id]) {
          pGroups[p.user_id] = [];
        }
        pGroups[p.user_id].push(p);
      });
      setPunchGroups(pGroups);

      // 3. Fetch existing finalized timesheet rows
      const { data: existingRows, error: existingErr } = await supabase
        .from('timesheet')
        .select('*')
        .eq('date', date);
      if (existingErr) throw existingErr;

      // 4. Fetch leave logs
      const { data: leavesData, error: leavesErr } = await supabase
        .from('leave_log')
        .select('*')
        .lte('from', date);
      if (leavesErr) throw leavesErr;

      // Filter perpetual leaves and fetch their punches
      const perpetualEmpIds = (leavesData || [])
        .filter(l => l.till === null)
        .map(l => l.emp_id);

      let punchesAfterLeaveStart: any[] = [];
      if (perpetualEmpIds.length > 0) {
        const minFromDate = (leavesData || [])
          .filter(l => l.till === null)
          .reduce((min, l) => l.from < min ? l.from : min, date);

        const { data: punchCheckData } = await supabase
          .from('punches')
          .select('user_id, punch_time')
          .in('user_id', perpetualEmpIds)
          .gte('punch_time', `${minFromDate}T00:00:00`)
          .lte('punch_time', `${date}T23:59:59`);
        punchesAfterLeaveStart = punchCheckData || [];
      }

      const activeLeaves = (leavesData || []).filter(l => {
        if (l.from > date) return false;
        if (l.till !== null) {
          return l.till >= date;
        } else {
          const hasPunched = punchesAfterLeaveStart.some(p => {
            if (p.user_id !== l.emp_id) return false;
            const punchDate = new Date(p.punch_time).toLocaleDateString('en-CA', { timeZone: 'Asia/Muscat' });
            return punchDate >= l.from && punchDate <= date;
          });
          return !hasPunched;
        }
      });

      const filteredExistingRows = isFocalFilteredLocal
        ? (existingRows || []).filter(row => row.project_code && focalProjectCodesLocal.includes(row.project_code))
        : isApproverFilteredLocal
          ? (existingRows || []).filter(row => row.project_code && approverProjectCodesLocal.includes(row.project_code))
          : (existingRows || []);

      // Calculate global lock: locked if all employees have a matching timesheet database record
      // Calculate global lock: finalized records, or a fully approved holiday/weekend day, are locked.
      // Under new flow:
      // - Focal point (verify mode): locked if a record exists.
      // - Approver (approve mode): locked if a record exists AND approved_by is not null.
      // - Finalizer (finalize mode): locked if a record exists AND approval === true.
      const allRowsAreApprovedHolidayOrWeekend = filteredExistingRows.length > 0 &&
        filteredEmployees.length > 0 &&
        filteredEmployees.every(emp => filteredExistingRows.some(row =>
          row.employee_code === emp.device_user_id &&
          isHolidayOrWeekendRecord(row) &&
          !!row.approved_by &&
          row.approved_by !== 'review'
        ));
      const isDayLocked = filteredExistingRows.length > 0 && filteredEmployees.every(emp =>
        filteredExistingRows.some(row => {
          if (row.employee_code !== emp.device_user_id) return false;
          if (resolvedMode === 'finalize' || resolvedMode === 'view') return !!row.approval || resolvedMode === 'view';
          return false;
        })     
         ) || allRowsAreApprovedHolidayOrWeekend;
      setIsLocked(isDayLocked);

      // Find locked metadata from the first record if any
      if (filteredExistingRows.length > 0) {
        const sampleRow = filteredExistingRows[0];
        if (sampleRow.approved_by === 'review') {
          setLockedBy('Review Required');
        } else {
          setLockedBy(sampleRow.attested_by && sampleRow.attested_by.includes('@') ? sampleRow.attested_by : 'Biometric System');
        }
      } else {
        setLockedBy(null);
      }

      // Map loaded rows
      const existingRowsMap = Object.fromEntries(
        filteredExistingRows.map(r => [r.employee_code, r])
      );
      const initialRows: Record<string, TimesheetRow> = {};
      filteredEmployees.forEach(emp => {
        const matched = existingRowsMap[emp.device_user_id];
        if (matched) {
          const empPunches = pGroups[emp.device_user_id] || [];
          const sorted = [...empPunches].sort((a, b) => a.punch_time.localeCompare(b.punch_time));
          const original_in_punch = sorted.length > 0 ? sorted[0] : null;
          const original_out_punch = sorted.length > 1 ? sorted[sorted.length - 1] : null;

          const guessed = guessRow(emp, empPunches, punchModeRef.current, filteredProjects, devProjMap, assignedProjMap);
          initialRows[emp.device_user_id] = {
            employee_code: emp.device_user_id,
            employee_name: emp.name,
            department: emp.department,
            nationality: emp.nationality,
            punch_in: extractTime(matched.punch_in),
            punch_out: extractTime(matched.punch_out),
            project_code: guessed.project_code || matched.project_code || '',
            overtime: matched.overtime ?? 0,
            remarks: matched.remarks ?? '',
            verify_type: matched.verify_type || 'Manual Input',
            attested_by: matched.attested_by || '',
            isEdited: matched.verify_type === 'Manual Input' || !!matched.verified_by,
            status: matched.status || (matched.overtime > 0 ? 'present with OT' : (matched.punch_in || matched.punch_out ? 'present' : 'no status')),
            isVerified: !!matched.verified_by,
            isApproved: !!matched.approved_by && matched.approved_by !== 'review',
            approval: !!matched.approval,
            inDatabase: true,
            machine: matched.machine,
            verified_by: matched.verified_by,
            approved_by: matched.approved_by,
            original_in_punch,
            original_out_punch,
            created_at: matched.last_updated || null
          };
        } else {
          // Guess initial values from raw punches
          const empPunches = pGroups[emp.device_user_id] || [];
          const guessed = guessRow(emp, empPunches, punchModeRef.current, filteredProjects, devProjMap, assignedProjMap);

          // Check if employee is on leave on this date
          const employeeLeave = activeLeaves.find(l => l.emp_id === emp.device_user_id);
          if (employeeLeave && guessed.status === 'absent') {
            guessed.remarks = employeeLeave.status; // e.g. "Annual Leave", "Sick Leave"
            guessed.verify_type = 'Manual Input';
            guessed.attested_by = 'Leave Log';
          }

          initialRows[emp.device_user_id] = {
            ...guessed,
            isApproved: false,
            approval: false,
            inDatabase: false
          };
        }
      });
      setRows(prev => {
        let hasChanges = false;
        const next = { ...prev };

        Object.keys(initialRows).forEach(userId => {
          const prevRow = prev[userId];
          const nextRow = initialRows[userId];

          if (!prevRow) {
            next[userId] = nextRow;
            hasChanges = true;
          } else {
            // Keep local changes if the user is actively focusing an input in this row,
            // or if it was recently edited (within the last 10 seconds) to prevent overwriting active user typing
            const activeEl = document.activeElement;
            const isCurrentlyEditing = activeEl && activeEl.closest(`[data-row-id="${userId}"]`);

            if (isCurrentlyEditing || (prevRow.lastLocalEdit && (Date.now() - prevRow.lastLocalEdit < 10000))) {
              next[userId] = prevRow;
            } else {
              const isDifferent =
                prevRow.inDatabase !== nextRow.inDatabase ||
                prevRow.punch_in !== nextRow.punch_in ||
                prevRow.punch_out !== nextRow.punch_out ||
                prevRow.remarks !== nextRow.remarks ||
                prevRow.status !== nextRow.status ||
                prevRow.overtime !== nextRow.overtime ||
                prevRow.project_code !== nextRow.project_code ||
                prevRow.isVerified !== nextRow.isVerified ||
                prevRow.isApproved !== nextRow.isApproved ||
                prevRow.approval !== nextRow.approval ||
                prevRow.verified_by !== nextRow.verified_by ||
                prevRow.approved_by !== nextRow.approved_by ||
                prevRow.attested_by !== nextRow.attested_by;

              if (isDifferent) {
                next[userId] = nextRow;
                hasChanges = true;
              }
            }
          }
        });

        Object.keys(prev).forEach(userId => {
          if (!initialRows[userId]) {
            delete next[userId];
            hasChanges = true;
          }
        });

        return hasChanges ? next : prev;
      });
      initialRowsRef.current = initialRows;
    } catch (err: any) {
      setError(err.message || 'Failed to load timesheet finalizer data.');
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
      setIsInitialLoad(false);
    }
  }, [date, userData?.email]);

  useEffect(() => {
    loadTimesheet();
  }, [loadTimesheet, refreshTrigger]);

  useEffect(() => {
    console.log('Subscribing to realtime updates for TimesheetFinalizer...');

    const debouncedReload = () => {
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
      }
      reloadTimerRef.current = setTimeout(() => {
        console.log('Executing debounced loadTimesheet (silent)...');
        loadTimesheet(true);
      }, 400);
    };

    const handleTimesheetChange = (rec: any, isDelete: boolean) => {
      if (!rec) return;

      // Extract and normalize date (YYYY-MM-DD)
      const targetDate = rec.date ? rec.date.substring(0, 10) : '';
      if (targetDate !== date) {
        console.log(`Ignoring event: Date ${targetDate} does not match current view date ${date}`);
        return;
      }

      if (isDelete) {
        console.log('Timesheet record deleted, scheduling reload...');
        debouncedReload();
        return;
      }

      const localRow = rowsRef.current[rec.employee_code];
      if (!localRow) {
        console.log('New timesheet record found, scheduling reload...');
        debouncedReload();
        return;
      }

      const dbPunchIn = rec.punch_in ? extractTime(rec.punch_in) : '';
      const dbPunchOut = rec.punch_out ? extractTime(rec.punch_out) : '';
      const dbRemarks = rec.remarks || '';
      const localRemarks = (localRow.remarks || '').startsWith('Custom: ')
        ? (localRow.remarks || '').substring(8).trim()
        : (localRow.remarks || '').trim();

      const isDifferent =
        !localRow.inDatabase ||
        dbPunchIn !== (localRow.punch_in || '') ||
        dbPunchOut !== (localRow.punch_out || '') ||
        dbRemarks !== localRemarks ||
        rec.status !== (localRow.status || null) ||
        rec.overtime !== (localRow.overtime || 0) ||
        rec.verified_by !== (localRow.verified_by || null) ||
        rec.approved_by !== (localRow.approved_by || null) ||
        rec.approval !== (localRow.approval || false) ||
        rec.project_code !== (localRow.project_code || null);

      if (isDifferent) {
        console.log('Difference detected between database and local state, scheduling reload...');
        debouncedReload();
      } else {
        console.log('Database change matches local optimistic update, ignoring reload.');
      }
    };

    const channel = supabase
      .channel('timesheet_finalizer_realtime_sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'timesheet' },
        (payload) => {
          console.log('Realtime timesheet INSERT received:', payload);
          handleTimesheetChange(payload.new, false);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'timesheet' },
        (payload) => {
          console.log('Realtime timesheet UPDATE received:', payload);
          handleTimesheetChange(payload.new, false);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'timesheet' },
        (payload) => {
          console.log('Realtime timesheet DELETE received:', payload);
          handleTimesheetChange(payload.old, true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'punches' },
        (payload) => {
          console.log('Realtime punches change received, scheduling reload...', payload);
          debouncedReload();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leave_log' },
        (payload) => {
          console.log('Realtime leave_log change received, scheduling reload...', payload);
          debouncedReload();
        }
      )
      .subscribe((status, err) => {
        console.log(`Realtime subscription status: ${status}`, err || '');
      });

    return () => {
      console.log('Unsubscribing from realtime updates...');
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [loadTimesheet, date]);



  const handleUndoRow = useCallback(async (userId: string) => {
    const currentVal = rows[userId];
    if (!currentVal) return;

    if (!canUserEdit) {
      toast.error('You do not have clearance to modify this.');
      return;
    }

    const emp = employeesMap[userId];
    const empProjCode = currentVal.project_code || (emp ? employeeAssignedProjects[emp.emp_id] : '') || '';
    const isDual = isProjectDualRole(empProjCode, projects, userData?.email);
    const isUserFocalOnly = resolvedMode === 'verify' && !isDual;
    const isRecordApproved = currentVal.isApproved || !!currentVal.approved_by || currentVal.approval;

    if (isUserFocalOnly && isRecordApproved) {
      toast.error('Cannot revoke a record that has already been approved.');
      return;
    }

    if (currentVal.inDatabase) {
      if (resolvedMode === 'finalize' && currentVal.approval) {
        toast.loading(`Revoking verification...`, { id: `undo-${userId}` });
        try {
          const { error: updErr } = await supabase
            .from('timesheet')
            .update({
              approval: false,
              last_updated: new Date().toISOString()
            })
            .eq('date', date)
            .eq('employee_code', userId);
          if (updErr) throw updErr;

          setRows(prev => ({
            ...prev,
            [userId]: {
              ...prev[userId],
              approval: false
            }
          }));
          toast.success(`Verification for ${currentVal.employee_name} revoked.`, { id: `undo-${userId}` });
          return;
        } catch (err: any) {
          console.error(err);
          toast.error(err.message || `Failed to revoke verification.`, { id: `undo-${userId}` });
          return;
        }
      }

      const actionText = isFocalFiltered ? 'verification' : 'approval';
      toast.loading(`Revoking ${actionText} and reverting...`, { id: `undo-${userId}` });
      try {
        const { error: delErr } = await supabase
          .from('timesheet')
          .delete()
          .eq('date', date)
          .eq('employee_code', userId);
        if (delErr) throw delErr;
        toast.success(`Verification/Approval for ${currentVal.employee_name} revoked & reverted.`, { id: `undo-${userId}` });
      } catch (err: any) {
        console.error(err);
        toast.error(err.message || `Failed to revoke ${actionText}.`, { id: `undo-${userId}` });
        return;
      }
    }

    setRows(prev => {
      const current = prev[userId];
      if (!current) return prev;

      const emp = employeesMap[userId];
      if (!emp) return prev;
      const empPunches = punchGroups[userId] || [];
      const guessed = guessRow(emp, empPunches, punchMode, projects, deviceProjectMap, employeeAssignedProjects);

      return {
        ...prev,
        [userId]: {
          ...guessed,
          isApproved: false,
          approval: false,
          inDatabase: false
        }
      };
    });

    if (!currentVal.inDatabase) {
      toast.success("Changes reverted to original.");
    }
  }, [rows, date, isFocalFiltered, canUserEdit, employeesMap, punchGroups, punchMode, projects, deviceProjectMap, employeeAssignedProjects, guessRow, resolvedMode, userData?.email]);

  const handleApproveRow = useCallback(async (userId: string) => {
    if (!canUserAction) {
      toast.error('You do not have clearance to approve timesheets.');
      return;
    }

    const currentRow = rows[userId];
    if (!currentRow) return;

    const isMachineLoggedComplete = !!currentRow.original_in_punch && !!currentRow.original_out_punch;
    const isRowVerified =  isHolidayOrWeekendRecord(currentRow) || currentRow.isVerified || !!currentRow.verified_by || isMachineLoggedComplete || resolvedMode === 'approve';
    if (!isRowVerified) {
      toast.error(`Cannot approve ${currentRow.employee_name}. Timesheet must be verified first.`);
      return;
    }

    setSaving(true);
    try {
      const inTimestamp = buildTimestamp(date, currentRow.punch_in);
      const outTimestamp = buildTimestamp(date, currentRow.punch_out);
      const dbFields = getDbAttestedAndVerified(currentRow, userData?.email);

      const payload = {
        date: date,
        project_code: currentRow.project_code || null,
        employee_code: currentRow.employee_code,
        punch_in: inTimestamp,
        punch_out: outTimestamp,
        overtime: currentRow.overtime,
        verify_type: currentRow.verify_type,
        attested_by: dbFields.attested_by,
        machine: dbFields.machine,
        verified_by: currentRow.verified_by || dbFields.verified_by || null,
        approved_by: userData?.email || null,
        remarks: (currentRow.remarks || '').startsWith('Custom: ')
          ? ((currentRow.remarks || '').substring(8).trim() || null)
          : ((currentRow.remarks || '').trim() || null),
        status: currentRow.status || null,
        last_updated: new Date().toISOString(),
      };

      // Upsert (delete + insert) for this single employee
      const { error: delErr } = await supabase
        .from('timesheet')
        .delete()
        .eq('date', date)
        .eq('employee_code', userId);
      if (delErr) throw delErr;

      const { error: insErr } = await supabase
        .from('timesheet')
        .insert([payload]);
      if (insErr) throw insErr;

      // Update local state
      setRows(prev => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          isApproved: true,
          approved_by: userData?.email || null,
          inDatabase: true,
          created_at: prev[userId]?.created_at || new Date().toISOString()
        }
      }));

      toast.success(`Approved for ${currentRow.employee_name}.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve.');
    } finally {
      setSaving(false);
    }
  }, [canUserAction, rows, date, userData?.email, setSaving, setRows]);



  const handleRevokeApproveRow = useCallback(async (userId: string) => {
    if (!canUserAction) {
      toast.error('You do not have clearance to update timesheets.');
      return;
    }

    const currentRow = rows[userId];
    if (!currentRow) return;

    setSaving(true);
    try {
      if (currentRow.inDatabase) {
        const { error: updErr } = await supabase
          .from('timesheet')
          .update({
            approved_by: null,
            last_updated: new Date().toISOString()
          })
          .eq('date', date)
          .eq('employee_code', userId);

        if (updErr) throw updErr;
      }

      setRows(prev => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          isApproved: false,
          approved_by: null,
        }
      }));

      toast.success(`Approval revoked for ${currentRow.employee_name}. Reverted back to verified state.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to revoke approval.');
    } finally {
      setSaving(false);
    }
  }, [canUserAction, rows, date, setSaving, setRows]);

  const autoPostRowsBatch = useCallback(async (updatedRows: TimesheetRow[]) => {
    if (!canUserEdit || updatedRows.length === 0) return;

    const validPayloads: any[] = [];
    const invalidEmployeeCodesToDelete: string[] = [];

    // Helper validation check
    const checkRowValidity = (r: TimesheetRow): boolean => {
      // 1. Status check
      if (!r.status || r.status === 'no status') return false;
      if (r.status === 'holiday' || r.status === 'weekend')
      {
        return isHolidayOrWeekendRecord(r);
      }
      // 2. Project & Punch check (only when status is not absent/no status)
      if (r.status !== 'absent' && r.status !== 'no status') {
        const isProjectRed = !r.project_code || r.project_code === '' || r.project_code === 'UNASSIGNED';
        if (isProjectRed) return false;

        // Both punch times must be filled
        if (!r.punch_in || !r.punch_out) return false;
      }

      // 3. Remarks check
      const isBiometricFullyPopulated = !!r.original_in_punch && !!r.original_out_punch;
      const needsRemarks = r.status === 'absent' ||
        ((r.status === 'present' || r.status === 'present with OT') && !isBiometricFullyPopulated);

      const isRemarksInvalid = needsRemarks && (!r.remarks || r.remarks.trim() === '' || r.remarks === 'Custom: ' || r.remarks.trim() === 'Custom:');
      if (isRemarksInvalid) return false;

      return true;
    };

    updatedRows.forEach(r => {
      const isValid = checkRowValidity(r);
      if (isValid) {
        const inTimestamp = buildTimestamp(date, r.punch_in);
        const outTimestamp = buildTimestamp(date, r.punch_out);
        const dbFields = getDbAttestedAndVerified(r, userData?.email);
        const emp = r.employee_code ? employeesMap[r.employee_code] : null;
        const empProjCode = r.project_code || (emp ? employeeAssignedProjects[emp.emp_id] : '') || '';
        const isDual = isProjectDualRole(empProjCode, projects, userData?.email);
        const isUserFocal = isFocalFiltered || focalProjectCodes.length > 0 || isDual;
        const isUserApprover = resolvedMode === 'approve' || isApproverFiltered || approverProjectCodes.length > 0 || isDual;
        const isDualUserOrProj = isDual || (isUserFocal && isUserApprover);
        const isHolidayOrWeekend = isHolidayOrWeekendRecord(r);

        const verifiedBy = (isHolidayOrWeekend || r.isVerified || r.isEdited || !!r.verified_by || resolvedMode === 'verify' || isUserFocal)
          ? (r.verified_by || userData?.email || dbFields.verified_by || null)
          : null;

    //    const approvedBy = (isHolidayOrWeekend || r.isApproved || !!r.approved_by || isDualUserOrProj || resolvedMode === 'approve' || resolvedMode === 'finalize')
      //    ? (r.approved_by || userData?.email || null)
        const isHolidayWeekend = isHolidayOrWeekendRecord(r);
        const approvedBy = (isHolidayWeekend || r.isApproved || !!r.approved_by || isDualUserOrProj || resolvedMode === 'approve' || resolvedMode === 'finalize')
          ? (r.approved_by || userData?.email || 'System')        
          : null;

        validPayloads.push({
          date: date,
          project_code: r.project_code || null,
          employee_code: r.employee_code,
          punch_in: inTimestamp,
          punch_out: outTimestamp,
          overtime: r.overtime,
          verify_type: r.verify_type,
          attested_by: dbFields.attested_by || r.attested_by || 'Timekeeper',
          machine: r.machine || dbFields.machine || null,
          verified_by: verifiedBy,
          approved_by: approvedBy,
          remarks: (r.remarks || '').startsWith('Custom: ')
            ? ((r.remarks || '').substring(8).trim() || null)
            : ((r.remarks || '').trim() || null),
          status: r.status || null,
          ...(isHolidayOrWeekend ? { approval: true } : {}),
          last_updated: new Date().toISOString(),
        });
      } else {
        if (r.inDatabase) {
          invalidEmployeeCodesToDelete.push(r.employee_code);
        }
      }
    });

    if (validPayloads.length === 0 && invalidEmployeeCodesToDelete.length === 0) return;

    try {
      // 1. Handle Deletions for Invalid Rows
      if (invalidEmployeeCodesToDelete.length > 0) {
        const { error: delErr } = await supabase
          .from('timesheet')
          .delete()
          .eq('date', date)
          .in('employee_code', invalidEmployeeCodesToDelete);
        if (delErr) throw delErr;

        setRows(prev => {
          const next = { ...prev };
          invalidEmployeeCodesToDelete.forEach(userId => {
            const curr = next[userId];
            if (curr) {
              next[userId] = {
                ...curr,
                inDatabase: false,
                isVerified: false,
                isApproved: false,
                approval: false,
                verified_by: null,
                approved_by: null,
                isEdited: false
              };
            }
          });
          return next;
        });
      }

      // 2. Handle Upsert/Insert for Valid Rows
      if (validPayloads.length > 0) {
        const employeeCodes = validPayloads.map(p => p.employee_code);
        const { error: delErr } = await supabase
          .from('timesheet')
          .delete()
          .eq('date', date)
          .in('employee_code', employeeCodes);
        if (delErr) throw delErr;

        const { error: insErr } = await supabase
          .from('timesheet')
          .insert(validPayloads);
        if (insErr) throw insErr;

        setRows(prev => {
          const next = { ...prev };
          validPayloads.forEach(payload => {
            const userId = payload.employee_code;
            const curr = next[userId];
            if (curr) {
              next[userId] = {
                ...curr,
                inDatabase: true,
                isVerified: !!payload.verified_by,
                isApproved: !!payload.approved_by,
                approval: !!payload.approved_by,
                machine: payload.machine,
                verified_by: payload.verified_by,
                approved_by: payload.approved_by,
                attested_by: payload.attested_by,
                isEdited: payload.verify_type === 'Manual Input' || !!payload.verified_by,
                created_at: curr.created_at || new Date().toISOString()
              };
            }
          });
          return next;
        });
      }

      toast.success('Changes saved to timesheet.', { id: 'autosave' });
    } catch (err: any) {
      console.error('Batch auto-post failed:', err);
      toast.error('Failed to auto-save changes.', { id: 'autosave' });
    } finally {
      setVerifyingRowIds(prev => {
        const next = new Set(prev);
        updatedRows.forEach(r => next.delete(r.employee_code));
        return next;
      });
    }
  }, [date, resolvedMode, isFocalFiltered, canUserEdit, userData?.email, projects, employeeAssignedProjects, focalProjectCodes, isApproverFiltered, approverProjectCodes, projectsWithDevices, employeesMap]);

  const updateRow = useCallback((userId: string, key: keyof TimesheetRow | 'swap_punches', value?: any) => {
    pushHistory(rows);
    const current = rows[userId];
    if (!current) return;

    const emp = employeesMap[userId];
    const empProjCode = current.project_code || (emp ? employeeAssignedProjects[emp.emp_id] : '') || '';
    const isDual = isProjectDualRole(empProjCode, projects, userData?.email);
    const isUserFocalOnly = resolvedMode === 'verify' && !isDual;
    const isRecordApproved = current.isApproved || !!current.approved_by || current.approval;

    if (isUserFocalOnly && isRecordApproved) {
      toast.error('Cannot modify a record that has already been approved.');
      return;
    }

    const updated = { ...current, lastLocalEdit: Date.now() };

    if (key === 'swap_punches') {
      const tempTime = current.punch_in || '';
      const tempOriginal = current.original_in_punch;

      updated.punch_in = current.punch_out || '';
      updated.original_in_punch = current.original_out_punch || null;
      updated.punch_out = tempTime;
      updated.original_out_punch = tempOriginal || null;
      updated.isEdited = true;
      updated.verify_type = 'Manual Input';
      updated.attested_by = userData?.email || 'Timekeeper';

      const inTime = updated.punch_in;
      const outTime = updated.punch_out;
      if (inTime || outTime) {
        updated.status = (updated.overtime > 0) ? 'present with OT' : 'present';
      } else {
        updated.status = 'absent';
        updated.overtime = 0;
        updated.remarks = '';
        if (emp) {
          updated.project_code = employeeAssignedProjects[emp.emp_id] || '';
        }
      }
    } else {
      (updated as any)[key] = value;

      if (key === 'punch_in' || key === 'punch_out' || key === 'overtime' || key === 'project_code' || key === 'status' || key === 'remarks') {
        updated.isEdited = true;
        updated.verify_type = 'Manual Input';
        updated.attested_by = userData?.email || 'Timekeeper';
      }
    }

    if (key === 'status') {
      const emp = employeesMap[userId];
      const isStaff = emp?.emp_type === 'staff';
      const statusVal = (value === 'present with OT' && isStaff) ? 'present' : (value as 'present' | 'absent' | 'present with OT' | 'holiday' | 'weekend' | 'no status');
      updated.status = statusVal;

      if (statusVal === 'absent') {
        updated.punch_in = '';
        updated.punch_out = '';
        updated.overtime = 0;
        updated.remarks = '';
        if (emp) {
          updated.project_code = employeeAssignedProjects[emp.emp_id] || '';
        }
      } else if (statusVal === 'no status') {
        updated.punch_in = '';
        updated.punch_out = '';
        updated.overtime = 0;
        updated.remarks = '';
      } else if (statusVal === 'present' || statusVal === 'present with OT' || statusVal === 'holiday' || statusVal === 'weekend') {
        const emp = employeesMap[userId];
        const projCode = current.project_code || (emp ? employeeAssignedProjects[emp.emp_id] : '') || '';
        const targetProj = projects.find(p => p.project_code === projCode);
        const inTime = targetProj?.project_in_time ? extractTime(targetProj.project_in_time) : '08:00';
        const outTime = targetProj?.project_out_time ? extractTime(targetProj.project_out_time) : '17:00';

        if (!current.punch_in && !current.punch_out) {
          updated.punch_in = inTime;
          updated.punch_out = outTime;
        }
        if (current.remarks === 'Absent') {
          updated.remarks = '';
        }
      }
       // Automatically verify records with 'weekend' or 'holiday' status
      if (statusVal === 'weekend' || statusVal === 'holiday') {
        updated.isVerified = true;
        updated.verified_by = userData?.email || 'System';
        updated.isApproved = true;
        updated.approved_by = userData?.email || 'System';
        updated.remarks = statusVal === 'holiday' ? 'Holiday' : 'Weekend';
      }
    }

    if (key === 'punch_in' || key === 'punch_out') {
      const inTime = key === 'punch_in' ? value : current.punch_in;
      const outTime = key === 'punch_out' ? value : current.punch_out;

      if (inTime || outTime) {
        updated.status = (updated.overtime > 0) ? 'present with OT' : 'present';
      } else {
        updated.status = 'absent';
        updated.overtime = 0;
        updated.remarks = '';
        const emp = employeesMap[userId];
        if (emp) {
          updated.project_code = employeeAssignedProjects[emp.emp_id] || '';
        }
      }
    }

    if (key === 'overtime') {
      const otVal = value as number;
      if (otVal > 0) {
        updated.status = 'present with OT';
        if (!current.punch_in && !current.punch_out) {
          const emp = employeesMap[userId];
          const projCode = current.project_code || (emp ? employeeAssignedProjects[emp.emp_id] : '') || '';
          const targetProj = projects.find(p => p.project_code === projCode);
          const inTime = targetProj?.project_in_time ? extractTime(targetProj.project_in_time) : '08:00';
          const outTime = targetProj?.project_out_time ? extractTime(targetProj.project_out_time) : '17:00';
          updated.punch_in = inTime;
          updated.punch_out = outTime;
        }
      } else {
        updated.status = (updated.punch_in || updated.punch_out) ? 'present' : 'absent';
      }
    }

    if (updated.status === 'present' || updated.status === 'present with OT') {
      const emp = employeesMap[userId];
      const projCode = updated.project_code || (emp ? employeeAssignedProjects[emp.emp_id] : '') || '';
      const hasDevice = projCode && Object.values(deviceProjectMap).includes(projCode);
      const isBiometricFullyPopulated = !!updated.original_in_punch && !!updated.original_out_punch;

      if (!hasDevice) {
        const shouldDefaultRemark = resolvedMode !== 'approve' && key !== 'swap_punches' && (!updated.remarks || key === 'status' || key === 'project_code');
        if (shouldDefaultRemark) {
          updated.remarks = '';
        }
      } else {
        if (!isBiometricFullyPopulated) {
          const shouldDefaultRemark = resolvedMode !== 'approve' && key !== 'swap_punches' && (!updated.remarks || key === 'status' || key === 'project_code');
          if (shouldDefaultRemark) {
            if (updated.original_in_punch && !updated.original_out_punch) {
              updated.remarks = 'Forgot to Punch Out';
            } else if (!updated.original_in_punch && updated.original_out_punch) {
              updated.remarks = 'Forgot to Punch In';
            } else {
              updated.remarks = '';
            }
          }
        } else {
          if (updated.remarks === 'Forgot to Punch' || updated.remarks === 'Forgot to Punch In' || updated.remarks === 'Forgot to Punch Out' || updated.remarks === 'No Device') {
            updated.remarks = '';
          }
        }
      }
    }

    setRows(prev => ({ ...prev, [userId]: updated }));
    autoPostRowsBatch([updated]);
  }, [rows, employeesMap, employeeAssignedProjects, userData?.email, projects, autoPostRowsBatch, pushHistory, deviceProjectMap, resolvedMode]);

  const handleVerifyBiometricRow = useCallback((userId: string) => {
    setVerifyingRowIds(prev => new Set(prev).add(userId));
    updateRow(userId, 'isEdited', true);
  }, [updateRow]);

  const handleRowSelect = useCallback((userId: string) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const handleBulkUpdate = (
    field: keyof TimesheetRow,
    value: any,
    options?: { remarks?: string; punchIn?: string; punchOut?: string }
  ) => {
    if (selectedRowIds.size === 0) {
      toast.error('No rows selected.');
      return;
    }

    pushHistory(rows);

    const updatedRows: TimesheetRow[] = [];
    setRows(prev => {
      const next = { ...prev };
      selectedRowIds.forEach(userId => {
        const current = next[userId];
        if (!current) return;

        let updated = { ...current, [field]: value };

        // Set isEdited flag if user modifies main fields
        if (field === 'punch_in' || field === 'punch_out' || field === 'overtime' || field === 'project_code' || field === 'status' || field === 'remarks') {
          updated.isEdited = true;
          updated.verify_type = 'Manual Input';
          updated.attested_by = userData?.email || 'Timekeeper';
        }

        // Automatically handle status adjustments
        if (field === 'status') {
          const emp = employeesMap[userId];
          const isStaff = emp?.emp_type === 'staff';
          const statusVal = (value === 'present with OT' && isStaff) ? 'present' : (value as 'present' | 'absent' | 'present with OT' | 'holiday' | 'weekend' | 'no status');
          updated.status = statusVal;

          if (statusVal === 'absent') {
            updated.punch_in = '';
            updated.punch_out = '';
            updated.overtime = 0;
            updated.remarks = options?.remarks !== undefined ? options.remarks : '';
            const emp = employeesMap[userId];
            if (emp) {
              updated.project_code = employeeAssignedProjects[emp.emp_id] || '';
            }
          } else if (statusVal === 'no status') {
            updated.punch_in = '';
            updated.punch_out = '';
            updated.overtime = 0;
            updated.remarks = '';
          } else if (statusVal === 'present' || statusVal === 'present with OT') {
            const emp = employeesMap[userId];
            const projCode = current.project_code || (emp ? employeeAssignedProjects[emp.emp_id] : '') || '';
            const targetProj = projects.find(p => p.project_code === projCode);
            const inTime = targetProj?.project_in_time ? extractTime(targetProj.project_in_time) : '08:00';
            const outTime = targetProj?.project_out_time ? extractTime(targetProj.project_out_time) : '17:00';

            const finalPunchIn = (options?.punchIn !== undefined && options.punchIn !== '') ? options.punchIn : (current.punch_in || inTime);
            const finalPunchOut = (options?.punchOut !== undefined && options.punchOut !== '') ? options.punchOut : (current.punch_out || outTime);

            updated.punch_in = finalPunchIn;
            updated.punch_out = finalPunchOut;

            if (current.remarks === 'Absent') {
              updated.remarks = '';
            }

            if (statusVal === 'present') {
              updated.overtime = 0;
            } else {
              const inTimeVal = updated.punch_in;
              const outTimeVal = updated.punch_out;
              if (inTimeVal && outTimeVal && emp?.emp_type !== 'staff') {
                const [inH, inM] = inTimeVal.split(':').map(Number);
                const [outH, outM] = outTimeVal.split(':').map(Number);
                let diffMin = (outH * 60 + outM) - (inH * 60 + inM);
                if (diffMin < 0) diffMin += 24 * 60;
                const hours = diffMin / 60;
                if (hours > 10) {
                  const rawOT = hours - 10;
                  updated.overtime = roundOT
                    ? Math.round(rawOT * 2) / 2
                    : parseFloat(rawOT.toFixed(1));
                } else {
                  updated.overtime = 1.0;
                }
              } else {
                updated.overtime = emp?.emp_type !== 'staff' ? 1.0 : 0;
              }
            }
          } else if (statusVal === 'holiday' || statusVal === 'weekend') {
          // Update remarks to match status for holiday/weekend
          updated.remarks = statusVal === 'holiday' ? 'Holiday' : 'Weekend';
          updated.isVerified = true;
          updated.verified_by = userData?.email || 'System';
          }         
        }
        
        // Sync status on input change without auto-calculating overtime
        if (field === 'punch_in' || field === 'punch_out') {
          const inTime = field === 'punch_in' ? value : current.punch_in;
          const outTime = field === 'punch_out' ? value : current.punch_out;

          if (inTime || outTime) {
            updated.status = (updated.overtime > 0) ? 'present with OT' : 'present';
          } else {
            updated.status = 'absent';
            updated.overtime = 0;
            updated.remarks = '';
            const emp = employeesMap[userId];
            if (emp) {
              updated.project_code = employeeAssignedProjects[emp.emp_id] || '';
            }
          }
        }

        if (field === 'overtime') {
          const otVal = value as number;
          if (otVal > 0) {
            updated.status = 'present with OT';
            if (!current.punch_in && !current.punch_out) {
              const emp = employeesMap[userId];
              const projCode = current.project_code || (emp ? employeeAssignedProjects[emp.emp_id] : '') || '';
              const targetProj = projects.find(p => p.project_code === projCode);
              const inTime = targetProj?.project_in_time ? extractTime(targetProj.project_in_time) : '08:00';
              const outTime = targetProj?.project_out_time ? extractTime(targetProj.project_out_time) : '17:00';
              updated.punch_in = inTime;
              updated.punch_out = outTime;
            }
          } else {
            updated.status = (updated.punch_in || updated.punch_out) ? 'present' : 'absent';
          }
        }

        if (updated.status === 'present' || updated.status === 'present with OT') {
          const emp = employeesMap[userId];
          const projCode = updated.project_code || (emp ? employeeAssignedProjects[emp.emp_id] : '') || '';
          const hasDevice = projCode && Object.values(deviceProjectMap).includes(projCode);
          const isBiometricFullyPopulated = !!updated.original_in_punch && !!updated.original_out_punch;

          if (!hasDevice) {
            const shouldDefaultRemark = !updated.remarks || field === 'status' || field === 'project_code';
            if (shouldDefaultRemark) {
              updated.remarks = '';
            }
          } else {
            if (!isBiometricFullyPopulated) {
              const shouldDefaultRemark = !updated.remarks || field === 'status' || field === 'project_code';
              if (shouldDefaultRemark) {
                if (updated.original_in_punch && !updated.original_out_punch) {
                  updated.remarks = 'Forgot to Punch Out';
                } else if (!updated.original_in_punch && updated.original_out_punch) {
                  updated.remarks = 'Forgot to Punch In';
                } else {
                  updated.remarks = '';
                }
              }
            } else {
              if (updated.remarks === 'Forgot to Punch' || updated.remarks === 'Forgot to Punch In' || updated.remarks === 'Forgot to Punch Out' || updated.remarks === 'No Device') {
                updated.remarks = '';
              }
            }
          }
        }

        next[userId] = updated;
        updatedRows.push(updated);
      });
      return next;
    });

    toast.success(`Bulk updated selected rows.`);
    setSelectedRowIds(new Set());
    setIsSelectionMode(false);

    if (updatedRows.length > 0) {
      autoPostRowsBatch(updatedRows);
    }
  };

  const handleBulkPunchTimeUpdate = (inTime: string, outTime: string) => {
    if (selectedRowIds.size === 0) {
      toast.error('No rows selected.');
      return;
    }

    pushHistory(rows);

    const updatedRows: TimesheetRow[] = [];
    setRows(prev => {
      const next = { ...prev };
      selectedRowIds.forEach(userId => {
        const current = next[userId];
        if (!current) return;

        let updated = { ...current };

        const updateIn = inTime !== '';
        const updateOut = outTime !== '';

        if (!updateIn && !updateOut) return;

        if (updateIn) {
          updated.punch_in = inTime;
        }
        if (updateOut) {
          updated.punch_out = outTime;
        }

        updated.isEdited = true;
        updated.verify_type = 'Manual Input';
        updated.attested_by = userData?.email || 'Timekeeper';

        const currentIn = updated.punch_in;
        const currentOut = updated.punch_out;

        if (currentIn || currentOut) {
          updated.status = (updated.overtime > 0) ? 'present with OT' : 'present';
        } else {
          updated.status = 'absent';
          updated.overtime = 0;
        }

        if (updated.status === 'present' || updated.status === 'present with OT') {
          const emp = employeesMap[userId];
          const projCode = updated.project_code || (emp ? employeeAssignedProjects[emp.emp_id] : '') || '';
          const hasDevice = projCode && Object.values(deviceProjectMap).includes(projCode);
          const isBiometricFullyPopulated = !!updated.original_in_punch && !!updated.original_out_punch;

          if (!hasDevice) {
            const shouldDefaultRemark = !updated.remarks;
            if (shouldDefaultRemark) {
              updated.remarks = '';
            }
          } else {
            if (!isBiometricFullyPopulated) {
              const shouldDefaultRemark = !updated.remarks;
              if (shouldDefaultRemark) {
                if (updated.original_in_punch && !updated.original_out_punch) {
                  updated.remarks = 'Forgot to Punch Out';
                } else if (!updated.original_in_punch && updated.original_out_punch) {
                  updated.remarks = 'Forgot to Punch In';
                } else {
                  updated.remarks = '';
                }
              }
            } else {
              if (updated.remarks === 'Forgot to Punch' || updated.remarks === 'Forgot to Punch In' || updated.remarks === 'Forgot to Punch Out' || updated.remarks === 'No Device') {
                updated.remarks = '';
              }
            }
          }
        }

        next[userId] = updated;
        updatedRows.push(updated);
      });
      return next;
    });

    toast.success(`Bulk updated selected rows.`);
    setSelectedRowIds(new Set());
    setIsSelectionMode(false);

    if (updatedRows.length > 0) {
      autoPostRowsBatch(updatedRows);
    }
  };


  const handleBulkRevoke = useCallback(async () => {
    if (selectedRowIds.size === 0) {
      toast.error('No rows selected.');
      return;
    }

    if (!canUserEdit) {
      toast.error('You do not have clearance to modify this.');
      return;
    }

    const userIds = Array.from(selectedRowIds);

    const recordsToRevoke = userIds.filter(userId => {
      const r = rows[userId];
      if (!r) return false;

      const emp = employeesMap[userId];
      const empProjCode = r.project_code || (emp ? employeeAssignedProjects[emp.emp_id] : '') || '';
      const isDual = isProjectDualRole(empProjCode, projects, userData?.email);
      const isUserFocalOnly = resolvedMode === 'verify' && !isDual;
      const isRecordApproved = r.isApproved || !!r.approved_by || r.approval;

      if (isUserFocalOnly && isRecordApproved) return false;
      return true;
    });

    if (recordsToRevoke.length === 0) {
      toast.error('No revocable records selected.');
      return;
    }

    const recordsInDb = recordsToRevoke.filter(userId => rows[userId]?.inDatabase);
    const finalizeRecordsInDb = resolvedMode === 'finalize'
      ? recordsInDb.filter(userId => rows[userId]?.approval)
      : [];
    const deleteRecordsInDb = resolvedMode === 'finalize'
      ? recordsInDb.filter(userId => !rows[userId]?.approval)
      : recordsInDb;

    if (recordsInDb.length > 0) {
      const actionText = isFocalFiltered ? 'verification' : 'approval';
      toast.loading(`Revoking ${actionText} for ${recordsInDb.length} records...`, { id: 'bulk-revoke' });
      try {
        if (finalizeRecordsInDb.length > 0) {
          const { error: updErr } = await supabase
            .from('timesheet')
            .update({
              approved_by: null,
              last_updated: new Date().toISOString()
            })
            .eq('date', date)
            .in('employee_code', finalizeRecordsInDb);
          if (updErr) throw updErr;
        }

        if (deleteRecordsInDb.length > 0) {
          const { error: delErr } = await supabase
            .from('timesheet')
            .delete()
            .eq('date', date)
            .in('employee_code', deleteRecordsInDb);
          if (delErr) throw delErr;
        }
        toast.success(`Verification/Approval for selected records revoked & reverted.`, { id: 'bulk-revoke' });
      } catch (err: any) {
        console.error(err);
        toast.error(err.message || `Failed to revoke.`, { id: 'bulk-revoke' });
        return;
      }
    }

    setRows(prev => {
      const next = { ...prev };
      recordsToRevoke.forEach(userId => {
        const current = next[userId];
        if (!current) return;

        if (resolvedMode === 'finalize' && current.approval) {
          next[userId] = {
            ...current,
            approval: false
          };
        } else {
          const emp = employeesMap[userId];
          if (!emp) return;
          const empPunches = punchGroups[userId] || [];
          const guessed = guessRow(emp, empPunches, punchMode, projects, deviceProjectMap, employeeAssignedProjects);

          next[userId] = {
            ...guessed,
            isApproved: false,
            approval: false,
            inDatabase: false
          };
        }
      });
      return next;
    });

    if (recordsInDb.length === 0) {
      toast.success("Changes reverted to original.");
    }

  }, [selectedRowIds, rows, date, isFocalFiltered, canUserEdit, employeesMap, punchGroups, punchMode, projects, deviceProjectMap, employeeAssignedProjects, guessRow, resolvedMode, userData?.email]);

  const handleFinalize = async () => {
    if (!canUserAction) {
      toast.error('You do not have clearance to finalize timesheets.');
      return;
    }

    setSaving(true);
    const actionPastText = resolvedMode === 'verify'
      ? 'verified'
      : (resolvedMode === 'approve' ? 'approved' : 'verified');
    try {
      if (resolvedMode === 'approve') {
        const unverifiedCount = Object.values(rows).filter(r => !r.isVerified && !r.verified_by).length;
        if (unverifiedCount > 0) {
          toast.error(`Cannot approve day. ${unverifiedCount} record(s) have not been verified yet.`);
          setSaving(false);
          return;
        }
      }

      const hasNoSourceRows = Object.values(rows).some(r => {
        const { machineCode } = parseAttestedBy(r.attested_by, !!r.isApproved);
        const hasDevice = machineCode && machineCode !== 'Un-Mapped' && machineCode !== 'Timekeeper';
        return r.status !== 'absent' && r.status !== 'no status' && !r.isEdited && !hasDevice;
      });

      if (hasNoSourceRows) {
        toast.error("Cannot finalize. Some records have no biometric source. Please review items labeled 'No Source'.");
        setSaving(false);
        return;
      }

      const hasNoStatusRows = Object.values(rows).some(r => {
        return !r.status || r.status === 'no status';
      });

      if (hasNoStatusRows) {
        toast.error("Cannot finalize. Some records do not have a status selected.");
        setSaving(false);
        return;
      }

      const hasNoRemarksAbsentRows = Object.values(rows).some(r => {
        return r.status === 'absent' && (!r.remarks || r.remarks.trim() === '' || r.remarks === 'Custom: ');
      });

      if (hasNoRemarksAbsentRows) {
        toast.error("Cannot finalize. All absent employees must have a reason selected in remarks.");
        setSaving(false);
        return;
      }

      const hasNoRemarksManualRows = Object.values(rows).some(r => {
        const isManualInput = r.verify_type === 'Manual Input';
        return (r.status === 'present' || r.status === 'present with OT') &&
          isManualInput &&
          (!r.remarks || r.remarks.trim() === '' || r.remarks === 'Custom: ' || r.remarks.trim() === 'Custom:');
      });

      if (hasNoRemarksManualRows) {
        toast.error(`Cannot process. All manually set or edited present employees must have a remark/reason selected.`);
        setSaving(false);
        return;
      }

      const hasMissingPunchTimes = Object.values(rows).some(r => {
        return !isHolidayOrWeekendRecord(r) &&
          (r.status === 'present' || r.status === 'present with OT') && (!r.punch_in || !r.punch_out);
        //return (r.status === 'present' || r.status === 'present with OT') && (!r.punch_in || !r.punch_out);
      });

      if (hasMissingPunchTimes) {
        toast.error("Cannot finalize. Some present employees do not have both punch in and punch out times.");
        setSaving(false);
        return;
      }

      // 1. Construct payloads for insertion
      const payloads = Object.values(rows)
        .filter(r => r.punch_in || r.punch_out || r.remarks || r.isEdited || r.status)
        .map(r => {
          const inTimestamp = buildTimestamp(date, r.punch_in);
          const outTimestamp = buildTimestamp(date, r.punch_out);
          const dbFields = getDbAttestedAndVerified(r, userData?.email);

          const emp = r.employee_code ? employeesMap[r.employee_code] : null;
          const empProjCode = r.project_code || (emp ? employeeAssignedProjects[emp.emp_id] : '') || '';
          const isDual = isProjectDualRole(empProjCode, projects, userData?.email);
          const isUserFocal = isFocalFiltered || focalProjectCodes.length > 0 || isDual;
          const isUserApprover = resolvedMode === 'approve' || isApproverFiltered || approverProjectCodes.length > 0 || isDual;
          const isHolidayOrWeekend = isHolidayOrWeekendRecord(r);

          const verifiedBy = (isHolidayOrWeekend || resolvedMode === 'verify' || isUserFocal)
            ? (r.verified_by || userData?.email || dbFields.verified_by || null)
            : (r.verified_by || dbFields.verified_by || null);

          const approvedBy = (isHolidayOrWeekend || isUserApprover)
            ? (r.approved_by || userData?.email || null)
            : (r.approved_by || null);

          const approvalVal = resolvedMode === 'finalize'
            ? true
            : (r.approval || false);

          return {
            date: date,
            project_code: r.project_code || null,
            employee_code: r.employee_code,
            punch_in: inTimestamp,
            punch_out: outTimestamp,
            overtime: r.overtime,
            verify_type: r.verify_type,
            attested_by: dbFields.attested_by,
            machine: dbFields.machine,
            verified_by: verifiedBy,
            approved_by: approvedBy,
            remarks: (r.remarks || '').startsWith('Custom: ')
              ? ((r.remarks || '').substring(8).trim() || null)
              : ((r.remarks || '').trim() || null),
            status: r.status || null,
            last_updated: new Date().toISOString(),
            //approval: approvalVal
            approval: isHolidayOrWeekend ? true : approvalVal
          };
        });

      if (payloads.length === 0) {
        throw new Error('No employee shifts to finalize.');
      }

      // 2. Delete any existing entries for this date
      let deleteQuery = supabase.from('timesheet').delete().eq('date', date);

      const projectCodesToSave = Array.from(new Set(payloads.map(p => p.project_code).filter(Boolean)));
      if (projectCodesToSave.length > 0) {
        deleteQuery = deleteQuery.in('project_code', projectCodesToSave);
      } else if (isFocalFiltered && focalProjectCodes.length > 0) {
        deleteQuery = deleteQuery.in('project_code', focalProjectCodes);
      } else if (isApproverFiltered && approverProjectCodes.length > 0) {
        deleteQuery = deleteQuery.in('project_code', approverProjectCodes);
      }
      const { error: delErr } = await deleteQuery;
      if (delErr) throw delErr;

      // 3. Insert newly approved/finalized records
      const { error: insErr } = await supabase
        .from('timesheet')
        .insert(payloads);
      if (insErr) throw insErr;

      toast.success(`Timesheets for ${date} ${actionPastText} for payroll!`);
      loadTimesheet();
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify timesheet.');
    } finally {
      setSaving(false);
    }
  };



  const handleUnlock = async () => {
    if (!canUserAction) {
      toast.error('You do not have clearance to unlock timesheets.');
      return;
    }

    setSaving(true);
    try {
      if (resolvedMode === 'verify') {
        // Delete existing rows for this date to unlock it
        let deleteQuery = supabase.from('timesheet').delete().eq('date', date);
        if (isFocalFiltered && focalProjectCodes.length > 0) {
          deleteQuery = deleteQuery.in('project_code', focalProjectCodes);
        }
        const { error: delErr } = await deleteQuery;
        if (delErr) throw delErr;
      } else if (resolvedMode === 'approve') {
        // Revert approval by setting approved_by to null
        let updateQuery = supabase.from('timesheet').update({ approved_by: null }).eq('date', date);
        if (isFocalFiltered && focalProjectCodes.length > 0) {
          updateQuery = updateQuery.in('project_code', focalProjectCodes);
        } else if (isApproverFiltered && approverProjectCodes.length > 0) {
          updateQuery = updateQuery.in('project_code', approverProjectCodes);
        }
        const { error: updErr } = await updateQuery;
        if (updErr) throw updErr;
      } else if (resolvedMode === 'finalize') {
        // Revert finalization by setting approval to false
        let updateQuery = supabase.from('timesheet').update({ approved_by: null }).eq('date', date);
        if (isFocalFiltered && focalProjectCodes.length > 0) {
          updateQuery = updateQuery.in('project_code', focalProjectCodes);
        }
        const { error: updErr } = await updateQuery;
        if (updErr) throw updErr;
      }

      const actionText = resolvedMode === 'verify'
        ? 'unlocked'
        : (resolvedMode === 'approve' ? 'approval revoked' : 'verification revoked');

      toast.success(`Timesheets for ${date} ${actionText}.`);
      loadTimesheet();
    } catch (err: any) {
      toast.error(err.message || 'Failed to unlock timesheet.');
    } finally {
      setSaving(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const row = rows[emp.device_user_id];
      if (!row) return false;

      const matchesSearch =
        emp.name.toLowerCase().includes(search.toLowerCase()) ||
        emp.device_user_id.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (punchInFilter !== 'all') {
        const hasPunchIn = row.punch_in && row.punch_in.trim() !== '';
        if (punchInFilter === 'null' && hasPunchIn) return false;
        if (punchInFilter === 'not_null' && !hasPunchIn) return false;
      }

      if (punchOutFilter !== 'all') {
        const hasPunchOut = row.punch_out && row.punch_out.trim() !== '';
        if (punchOutFilter === 'null' && hasPunchOut) return false;
        if (punchOutFilter === 'not_null' && !hasPunchOut) return false;
      }

      // Filter by Project Allocation
      const matchesProject =
        selectedProjects.length === 0 ||
        (selectedProjects.includes('UNASSIGNED') && !row.project_code) ||
        (row.project_code && selectedProjects.includes(row.project_code));

      if (!matchesProject) return false;

      if (sourceFilter !== 'ALL') {
        const category = getSourceCategory(row);
        if (category !== sourceFilter) return false;
      }

      if (empTypeFilter !== 'all') {
        const empType = emp.emp_type?.toLowerCase().trim();
        if (empTypeFilter === 'staff' && empType !== 'staff') return false;
        if (empTypeFilter === 'worker' && empType !== 'worker') return false;
      }

      if (nationalityFilter !== 'ALL' && emp.nationality !== nationalityFilter) return false;

      if (statusFilter !== 'all') {
        const currentStatus = row.status || 'no status';
        if (currentStatus !== statusFilter) return false;
      }

      // Filter by Top Header Project Select (for multi-project approvers/focals)
      if (selectedProjectFilter !== 'ALL') {
        if (row.project_code !== selectedProjectFilter) return false;
      }

      return true;
    });
  }, [employees, rows, search, punchInFilter, punchOutFilter, selectedProjects, sourceFilter, empTypeFilter, statusFilter, selectedProjectFilter, nationalityFilter]);

  const handleAutoFillEmptyPunchIn = useCallback(() => {
    if (!canUserEdit) {
      toast.error('You do not have clearance to modify this.');
      return;
    }

    pushHistory(rows);

    const updatedRows: TimesheetRow[] = [];
    const updatedMap: Record<string, TimesheetRow> = {};

    filteredEmployees.forEach(emp => {
      const userId = emp.device_user_id;
      const r = rows[userId];
      if (!r) return;

      if (!r.punch_in || r.punch_in.trim() === '') {
        const empProjCode = r.project_code || employeeAssignedProjects[emp.emp_id] || '';
        const targetProj = projects.find(p => p.project_code === empProjCode);
        const defaultInTime = targetProj?.project_in_time ? extractTime(targetProj.project_in_time) : '08:00';

        if (defaultInTime) {
          const effectiveStatus = (r.overtime && r.overtime > 0) ? 'present with OT' : 'present';
          const updated: TimesheetRow = {
            ...r,
            punch_in: defaultInTime,
            project_code: empProjCode,
            status: effectiveStatus,
            isEdited: true,
            verify_type: 'Manual Input',
            attested_by: userData?.email || 'Timekeeper',
          };

          const hasDevice = empProjCode && Object.values(deviceProjectMap).includes(empProjCode);
          const isBiometricFullyPopulated = !!updated.original_in_punch && !!updated.original_out_punch;

          if (!hasDevice) {
            const shouldDefaultRemark = !updated.remarks;
            if (shouldDefaultRemark) {
              updated.remarks = '';
            }
          } else {
            if (!isBiometricFullyPopulated) {
              const shouldDefaultRemark = !updated.remarks;
              if (shouldDefaultRemark) {
                if (updated.original_in_punch && !updated.original_out_punch) {
                  updated.remarks = 'Forgot to Punch Out';
                } else if (!updated.original_in_punch && updated.original_out_punch) {
                  updated.remarks = 'Forgot to Punch In';
                } else {
                  updated.remarks = '';
                }
              }
            } else {
              if (updated.remarks === 'Forgot to Punch' || updated.remarks === 'Forgot to Punch In' || updated.remarks === 'Forgot to Punch Out' || updated.remarks === 'No Device') {
                updated.remarks = '';
              }
            }
          }

          updatedMap[userId] = updated;
          updatedRows.push(updated);
        }
      }
    });

    if (updatedRows.length > 0) {
      setRows(prev => ({ ...prev, ...updatedMap }));
      toast.success(`Auto-filled default Punch In for ${updatedRows.length} empty field(s).`);
      autoPostRowsBatch(updatedRows);
    } else {
      toast.info('No empty Punch In fields to fill.');
    }
  }, [filteredEmployees, projects, employeeAssignedProjects, rows, canUserEdit, pushHistory, userData?.email, autoPostRowsBatch, deviceProjectMap]);

  const handleAutoFillEmptyPunchOut = useCallback(() => {
    if (!canUserEdit) {
      toast.error('You do not have clearance to modify this.');
      return;
    }

    pushHistory(rows);

    const updatedRows: TimesheetRow[] = [];
    const updatedMap: Record<string, TimesheetRow> = {};

    filteredEmployees.forEach(emp => {
      const userId = emp.device_user_id;
      const r = rows[userId];
      if (!r) return;

      const hasInTime = !!(r.punch_in && r.punch_in.trim() !== '');
      if (hasInTime && (!r.punch_out || r.punch_out.trim() === '')) {
        const empProjCode = r.project_code || employeeAssignedProjects[emp.emp_id] || '';
        const targetProj = projects.find(p => p.project_code === empProjCode);
        const defaultOutTime = targetProj?.project_out_time ? extractTime(targetProj.project_out_time) : '17:00';

        if (defaultOutTime) {
          const effectiveStatus = (r.overtime && r.overtime > 0) ? 'present with OT' : 'present';
          const updated: TimesheetRow = {
            ...r,
            punch_out: defaultOutTime,
            project_code: empProjCode,
            status: effectiveStatus,
            isEdited: true,
            verify_type: 'Manual Input',
            attested_by: userData?.email || 'Timekeeper',
          };

          const hasDevice = empProjCode && Object.values(deviceProjectMap).includes(empProjCode);
          const isBiometricFullyPopulated = !!updated.original_in_punch && !!updated.original_out_punch;

          if (!hasDevice) {
            const shouldDefaultRemark = !updated.remarks;
            if (shouldDefaultRemark) {
              updated.remarks = '';
            }
          } else {
            if (!isBiometricFullyPopulated) {
              const shouldDefaultRemark = !updated.remarks;
              if (shouldDefaultRemark) {
                updated.remarks = '';
              }
            } else {
              if (updated.remarks === 'Forgot to Punch' || updated.remarks === 'No Device') {
                updated.remarks = '';
              }
            }
          }

          updatedMap[userId] = updated;
          updatedRows.push(updated);
        }
      }
    });

    if (updatedRows.length > 0) {
      setRows(prev => ({ ...prev, ...updatedMap }));
      toast.success(`Auto-filled default Punch Out for ${updatedRows.length} empty field(s).`);
      autoPostRowsBatch(updatedRows);
    } else {
      toast.info('No empty Punch Out fields with existing In times to fill.');
    }
  }, [filteredEmployees, projects, employeeAssignedProjects, rows, canUserEdit, pushHistory, userData?.email, autoPostRowsBatch, deviceProjectMap]);

  const handleApproveAllValidRecords = useCallback(() => {
    if (!canUserEdit) {
      toast.error('You do not have clearance to modify this.');
      return;
    }

    pushHistory(rows);

    const validRowsToPost: TimesheetRow[] = [];
    const updatedMap: Record<string, TimesheetRow> = {};
    const isApproverMode = resolvedMode === 'approve';

    filteredEmployees.forEach(emp => {
      const userId = emp.device_user_id;
      const r = rows[userId];
      if (!r) return;

      // Skip processed records depending on role
      if (isApproverMode) {
        if (r.isApproved) return;
      } else {
        if (r.inDatabase || r.isVerified) return;
      }

      const currentStatus = r.status || 'no status';
      const isStatusValid = currentStatus !== 'no status';
      if (!isStatusValid) return;

      const effectiveProjectCode = r.project_code || employeeAssignedProjects[emp.emp_id] || '';
      let finalRemarks = r.remarks;

      if (currentStatus !== 'absent') {
        const isProjectValid = !!effectiveProjectCode && effectiveProjectCode !== 'UNASSIGNED';
        const isPunchesValid = !!(r.punch_in && r.punch_out);
        if (!isProjectValid || !isPunchesValid) return;

        const isManualInput = r.verify_type === 'Manual Input';
        if (isManualInput) {
          const isRemarksValid = r.remarks && r.remarks.trim() !== '' && r.remarks !== 'Custom: ' && r.remarks.trim() !== 'Custom:';
          if (!isRemarksValid) {
            const isDual = isProjectDualRole(effectiveProjectCode, projects, userData?.email);
            const isProjectWithoutDevice = !projectsWithDevices.has(effectiveProjectCode);
            if (isDual && isProjectWithoutDevice) {
              finalRemarks = 'No Device';
            } else {
              return;
            }
          }
        }
      } else {
        const isRemarksValid = r.remarks && r.remarks.trim() !== '' && r.remarks !== 'Custom: ' && r.remarks.trim() !== 'Custom:';
        if (!isRemarksValid) return;
      }

      const updated: TimesheetRow = {
        ...r,
        project_code: effectiveProjectCode,
        remarks: finalRemarks,
        isEdited: true,
        isVerified: true,
        isApproved: isApproverMode ? true : false,
        verified_by: r.verified_by || userData?.email || 'Timekeeper',
        approved_by: isApproverMode ? (r.approved_by || userData?.email || 'Timekeeper') : null
      };

      updatedMap[userId] = updated;
      validRowsToPost.push(updated);
    });

    if (validRowsToPost.length > 0) {
      setRows(prev => ({ ...prev, ...updatedMap }));
      if (isApproverMode) {
        toast.success(`Approved ${validRowsToPost.length} valid record(s).`);
      } else {
        toast.success(`Verified ${validRowsToPost.length} valid record(s).`);
      }
      autoPostRowsBatch(validRowsToPost);
    } else {
      if (isApproverMode) {
        toast.info('No valid unapproved records to process.');
      } else {
        toast.info('No valid unverified records to process.');
      }
    }
  }, [filteredEmployees, rows, canUserEdit, pushHistory, userData?.email, autoPostRowsBatch, employeeAssignedProjects, resolvedMode]);

  const handleRevokeAllRecords = useCallback(async () => {
    if (!canUserEdit) {
      toast.error('You do not have clearance to modify this.');
      return;
    }

    const isFinalizerMode = resolvedMode === 'finalize';
    const isApproverMode = resolvedMode === 'approve';
    const dualRowsToProcess: string[] = [];
    const nonDualRowsToProcess: string[] = [];
    const finalizeRowsToProcess: string[] = [];

    filteredEmployees.forEach(emp => {
      const userId = emp.device_user_id;
      const r = rows[userId];
      if (!r) return;

      const empProjCode = r.project_code || employeeAssignedProjects[emp.emp_id] || '';
      const isDual = isProjectDualRole(empProjCode, projects, userData?.email);

      if (isFinalizerMode) {
        if (r.inDatabase && r.approval) {
          finalizeRowsToProcess.push(userId);
        }
      } else if (isApproverMode) {
        if (isDual) {
          // Dual roles: select any record that has been verified/approved (in database)
          if (r.inDatabase) {
            dualRowsToProcess.push(userId);
          }
        } else {
          // Standard Approvers: only approved records
          if (r.inDatabase && (r.isApproved || !!r.approved_by || r.approval)) {
            nonDualRowsToProcess.push(userId);
          }
        }
      } else {
        // Focal points: revoke verified records (inDatabase is true) that are not approved
        const isUserFocalOnly = resolvedMode === 'verify' && !isDual;
        const isRecordApproved = r.isApproved || !!r.approved_by || r.approval;

        if (isUserFocalOnly && isRecordApproved) {
          // Cannot revoke approved records
          return;
        }

        if (r.inDatabase) {
          dualRowsToProcess.push(userId);
        }
      }
    });

    const totalCount = dualRowsToProcess.length + nonDualRowsToProcess.length + finalizeRowsToProcess.length;
    if (totalCount === 0) {
      toast.info(isFinalizerMode ? 'No verified records to revoke.' : (isApproverMode ? 'No approved records to revoke.' : 'No verified records to revoke.'));
      return;
    }

    setSaving(true);
    const actionText = isFinalizerMode ? 'verification' : (isApproverMode ? 'approval' : 'verification');
    toast.loading(`Revoking ${actionText} for ${totalCount} record(s)...`, { id: 'bulk-revoke' });

    try {
      // 0. Update rows setting approval to false for finalizer revokes
      if (finalizeRowsToProcess.length > 0) {
        const { error: updErr } = await supabase
          .from('timesheet')
          .update({
            approval: false,
            last_updated: new Date().toISOString()
          })
          .eq('date', date)
          .in('employee_code', finalizeRowsToProcess);

        if (updErr) throw updErr;
      }

      // 1. Delete rows from database for dual-role/focal revokes
      if (dualRowsToProcess.length > 0) {
        const { error: delErr } = await supabase
          .from('timesheet')
          .delete()
          .eq('date', date)
          .in('employee_code', dualRowsToProcess);

        if (delErr) throw delErr;
      }

      // 2. Set approved_by to null for standard approver revokes
      if (nonDualRowsToProcess.length > 0) {
        const { error: updErr } = await supabase
          .from('timesheet')
          .update({
            approved_by: null,
            last_updated: new Date().toISOString()
          })
          .eq('date', date)
          .in('employee_code', nonDualRowsToProcess);

        if (updErr) throw updErr;
      }

      // Revert local state rows
      setRows(prev => {
        const next = { ...prev };

        finalizeRowsToProcess.forEach(userId => {
          const current = prev[userId];
          if (!current) return;
          next[userId] = {
            ...current,
            approval: false
          };
        });

        nonDualRowsToProcess.forEach(userId => {
          const current = prev[userId];
          if (!current) return;
          next[userId] = {
            ...current,
            isApproved: false,
            approval: false,
            approved_by: null
          };
        });

        dualRowsToProcess.forEach(userId => {
          const current = prev[userId];
          if (!current) return;

          const emp = employeesMap[userId];
          if (!emp) return;
          const empPunches = punchGroups[userId] || [];
          const guessed = guessRow(emp, empPunches, punchMode, projects, deviceProjectMap, employeeAssignedProjects);

          next[userId] = {
            ...guessed,
            isApproved: false,
            approval: false,
            inDatabase: false
          };
        });

        return next;
      });

      toast.success(`Successfully revoked ${actionText} for ${totalCount} record(s).`, { id: 'bulk-revoke' });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || `Failed to revoke ${actionText} in bulk.`, { id: 'bulk-revoke' });
    } finally {
      setSaving(false);
    }
  }, [filteredEmployees, rows, canUserEdit, date, supabase, setRows, employeesMap, punchGroups, punchMode, projects, deviceProjectMap, employeeAssignedProjects, resolvedMode, userData?.email]);

  const baseRelevantEmployees = useMemo(() => {
    return employees.filter(emp => {
      const row = rows[emp.device_user_id];
      if (!row) return false;

      if (selectedProjectFilter !== 'ALL') {
        if (row.project_code !== selectedProjectFilter) return false;
      }

      return true;
    });
  }, [employees, rows, selectedProjectFilter]);

  const progressStats = useMemo(() => {
    const total = baseRelevantEmployees.length;
    if (total === 0) {
      return { total: 0, completed: 0, remaining: 0, percentage: 0, isComplete: false };
    }

    let completed = 0;
    baseRelevantEmployees.forEach(emp => {
      const r = rows[emp.device_user_id];
      if (!r) return;

      if (resolvedMode === 'approve') {
        if (r.isApproved) completed++;
      } else if (resolvedMode === 'verify') {
        if (r.isVerified || !!r.verified_by || r.inDatabase) completed++;
      } else if (resolvedMode === 'finalize') {
        if (r.approval) completed++;
      } else {
        if (r.isApproved || r.isVerified) completed++;
      }
    });

    const remaining = Math.max(0, total - completed);
    const percentage = Math.round((completed / total) * 100);
    const isComplete = completed >= total && total > 0;

    return { total, completed, remaining, percentage, isComplete };
  }, [baseRelevantEmployees, rows, resolvedMode]);

  const handleUndo = useCallback(async () => {
    if (history.length === 0) return;

    const previousRows = history[history.length - 1];
    const currentRows = rows;

    setHistory(prev => prev.slice(0, prev.length - 1));
    setRedoStack(prev => [...prev, { ...currentRows }]);
    setRows(previousRows);

    const userIds = Object.keys(currentRows);
    const rowsToDelete: string[] = [];
    const rowsToUpsert: TimesheetRow[] = [];

    userIds.forEach(userId => {
      const prevR = previousRows[userId];
      const currR = currentRows[userId];
      if (!prevR || !currR) return;

      const wasInDb = currR.inDatabase || currR.isApproved || currR.isVerified || currR.isEdited;
      const isNowInDb = prevR.inDatabase || prevR.isApproved || prevR.isVerified || prevR.isEdited;

      if (wasInDb && !isNowInDb) {
        rowsToDelete.push(currR.employee_code || userId);
      } else if (wasInDb && isNowInDb) {
        rowsToUpsert.push(prevR);
      }
    });

    try {
      if (rowsToDelete.length > 0) {
        await supabase
          .from('timesheet')
          .delete()
          .eq('date', date)
          .in('employee_code', rowsToDelete);
      }
      if (rowsToUpsert.length > 0) {
        await autoPostRowsBatch(rowsToUpsert);
      }
      toast.info('Undo applied & changes revoked.');
    } catch (err) {
      console.error('Undo sync failed:', err);
    }
  }, [history, rows, date, autoPostRowsBatch]);

  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0) return;

    const nextRows = redoStack[redoStack.length - 1];
    const currentRows = rows;

    setRedoStack(prev => prev.slice(0, prev.length - 1));
    setHistory(prev => [...prev, { ...currentRows }]);
    setRows(nextRows);

    const userIds = Object.keys(nextRows);
    const rowsToDelete: string[] = [];
    const rowsToUpsert: TimesheetRow[] = [];

    userIds.forEach(userId => {
      const currR = currentRows[userId];
      const nextR = nextRows[userId];
      if (!currR || !nextR) return;

      const wasInDb = currR.inDatabase || currR.isApproved || currR.isVerified || currR.isEdited;
      const isNowInDb = nextR.inDatabase || nextR.isApproved || nextR.isVerified || nextR.isEdited;

      if (wasInDb && !isNowInDb) {
        rowsToDelete.push(currR.employee_code || userId);
      } else if (isNowInDb) {
        rowsToUpsert.push(nextR);
      }
    });

    try {
      if (rowsToDelete.length > 0) {
        await supabase
          .from('timesheet')
          .delete()
          .eq('date', date)
          .in('employee_code', rowsToDelete);
      }
      if (rowsToUpsert.length > 0) {
        await autoPostRowsBatch(rowsToUpsert);
      }
      toast.info('Redo applied.');
    } catch (err) {
      console.error('Redo sync failed:', err);
    }
  }, [redoStack, rows, date, autoPostRowsBatch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  return (
    <div className="bg-white animate-fade-in" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.35s ease-out forwards;
        }
        .finalizer-container {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          flex: 1;
          overflow: hidden;
        }
        .table-scroll-container {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          overflow: auto;
          flex: 1;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }
        .date-navigator {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 8px 16px;
          border-radius: 12px;
          width: fit-content;
        }
        .date-navigator input[type="date"]::-webkit-calendar-picker-indicator {
          cursor: pointer;
          filter: brightness(0) saturate(100%) invert(30%);
          opacity: 0.85;
          transition: opacity 0.15s ease;
        }
        .date-navigator input[type="date"]::-webkit-calendar-picker-indicator:hover {
          opacity: 1;
        }
        .nav-btn {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 6px;
          cursor: pointer;
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }
        .nav-btn:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-radius: 12px;
          font-size: 13px;
        }
        
        .timesheet-table {
          width: max-content;
          min-width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 13px;
        }
        .timesheet-table th {
          position: sticky;
          top: 0;
          z-index: 10;
          box-shadow: inset 0 -1px 0 #e2e8f0;
          background: #f8fafc;
          padding: 12px 16px;
          color: #475569;
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .timesheet-table td {
          padding: 14px 16px;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
          vertical-align: middle;
        }
        .timesheet-table tr:hover td {
          background: #fafafb;
        }
        .table-input {
          font-size: 12px;
          padding: 6px 8px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          outline: none;
          background: #ffffff;
          transition: all 0.15s ease;
        }
        .table-input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
        }
        .table-input:disabled {
          background: #f8fafc;
          border-color: #e2e8f0;
          color: #94a3b8;
          cursor: not-allowed;
        }
        .timesheet-table input[type="time"]::-webkit-calendar-picker-indicator {
          cursor: pointer;
          filter: brightness(0) saturate(100%) invert(30%);
          opacity: 0.75;
          transition: opacity 0.15s ease;
        }
        .timesheet-table input[type="time"]::-webkit-calendar-picker-indicator:hover {
          opacity: 1;
        }
        .source-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
        }
        .source-auto {
          background: #f0fdf4;
          color: #15803d;
          border: 1px solid #dcfce7;
        }
        .source-manual {
          background: #eff6ff;
          color: #1d4ed8;
          border: 1px solid #dbeafe;
        }
        .btn-finalize {
          background: #0f172a;
          color: #ffffff;
          font-weight: 600;
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background 0.15s ease;
        }
        .btn-finalize:hover {
          background: #334155;
        }
        .btn-finalize:disabled {
          background: #94a3b8;
          cursor: not-allowed;
        }
        .btn-unlock {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #334155;
          font-weight: 600;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.15s ease;
        }
        .btn-unlock:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }
        .timesheet-table tr.green-row-highlight td,
        .timesheet-table tr.green-row-highlight td.sticky-name,
        .timesheet-table tr.green-row-highlight td.sticky-action,
        .timesheet-table tr.green-row-highlight td.sticky-approver-action,
        .timesheet-table tr.green-row-highlight td.sticky-checkbox {
          background-color: #f1fbf7 !important;
        }
        .timesheet-table tr.green-row-highlight:hover td,
        .timesheet-table tr.green-row-highlight:hover td.sticky-name,
        .timesheet-table tr.green-row-highlight:hover td.sticky-action,
        .timesheet-table tr.green-row-highlight:hover td.sticky-approver-action,
        .timesheet-table tr.green-row-highlight:hover td.sticky-checkbox {
          background-color: #e2f7f0 !important;
        }
        .timesheet-table tr.indigo-row-highlight td,
        .timesheet-table tr.indigo-row-highlight td.sticky-name,
        .timesheet-table tr.indigo-row-highlight td.sticky-action,
        .timesheet-table tr.indigo-row-highlight td.sticky-approver-action,
        .timesheet-table tr.indigo-row-highlight td.sticky-checkbox {
          background-color: #f0f3ff !important;
        }
        .timesheet-table tr.indigo-row-highlight:hover td,
        .timesheet-table tr.indigo-row-highlight:hover td.sticky-name,
        .timesheet-table tr.indigo-row-highlight:hover td.sticky-action,
        .timesheet-table tr.indigo-row-highlight:hover td.sticky-approver-action,
        .timesheet-table tr.indigo-row-highlight:hover td.sticky-checkbox {
          background-color: #e0e7ff !important;
        }
        .timesheet-table td {
          transition: background-color 0.5s ease-in-out;
        }
        .source-badge {
          transition: background-color 0.5s ease-in-out;
        }
        @keyframes fade-in-only {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .badge-text-fade {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          animation: fade-in-only 0.3s ease-out forwards;
        }
        .timesheet-table td.sticky-action {
          position: sticky;
          right: 0;
          background-color: #ffffff;
          z-index: 5;
          box-shadow: -2px 0 5px -2px rgba(0,0,0,0.05), inset 1px 0 0 #f1f5f9;
        }
        .timesheet-table tr:hover td.sticky-action {
          background-color: #fafafb !important;
        }
        .timesheet-table th.sticky-action {
          position: sticky;
          right: 0;
          top: 0;
          z-index: 15;
          background-color: #f8fafc;
          box-shadow: -2px 0 5px -2px rgba(0,0,0,0.05), inset 1px 0 0 #e2e8f0, inset 0 -1px 0 #e2e8f0;
        }
        .timesheet-table td.sticky-approver-action {
          position: sticky;
          right: 0;
          background-color: #ffffff;
          z-index: 5;
          box-shadow: -2px 0 5px -2px rgba(0,0,0,0.08);
        }
        .timesheet-table tr:hover td.sticky-approver-action {
          background-color: #fafafb !important;
        }
        .timesheet-table th.sticky-approver-action {
          position: sticky;
          right: 0;
          top: 0;
          z-index: 15;
          background-color: #f8fafc;
          box-shadow: -2px 0 5px -2px rgba(0,0,0,0.08), inset 0 -1px 0 #e2e8f0;
        }
        .timesheet-table td.sticky-name {
          position: sticky;
          left: 0;
          background-color: #ffffff;
          z-index: 5;
          box-shadow: 2px 0 5px -2px rgba(0,0,0,0.05);
        }
        .timesheet-table tr:hover td.sticky-name {
          background-color: #fafafb !important;
        }
        .timesheet-table th.sticky-name {
          position: sticky;
          left: 0;
          top: 0;
          z-index: 15;
          background-color: #f8fafc;
          box-shadow: 2px 0 5px -2px rgba(0,0,0,0.05), inset 0 -1px 0 #e2e8f0;
        }
        .timesheet-table td.sticky-checkbox {
          position: sticky;
          left: 0;
          background-color: #ffffff;
          z-index: 5;
          transition: width 200ms ease-in-out, min-width 200ms ease-in-out, max-width 200ms ease-in-out, opacity 200ms ease-in-out, padding 200ms ease-in-out;
        }
        .timesheet-table tr:hover td.sticky-checkbox {
          background-color: #fafafb !important;
        }
        .timesheet-table th.sticky-checkbox {
          position: sticky;
          left: 0;
          top: 0;
          z-index: 15;
          background-color: #f8fafc;
          box-shadow: inset 0 -1px 0 #e2e8f0;
          transition: width 200ms ease-in-out, min-width 200ms ease-in-out, max-width 200ms ease-in-out, opacity 200ms ease-in-out, padding 200ms ease-in-out;
        }
      `}</style>

      <div className="finalizer-container">

        {/* Lock State Banner with Date Navigator */}
        <div style={{
          border: '1px solid rgba(100 100 100/ 0.15)', padding: "0.35rem 0.5rem"
        }} className={`banner ${isLocked ? 'banner-locked' : 'banner-unlocked'}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Date Navigator */}
            <div className="date-navigator" style={{
              border: 'none',
              background: 'transparent', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '12px', fontSize: '1rem'
            }}>
              {/* <button className="nav-btn" onClick={() => changeDate(-1)} disabled={loading || saving}>
                <ChevronLeft size={16} />
              </button> */}

              {canUserEdit && !isLocked && (
                <button
                  type="button"
                  onClick={() => {
                    setIsSelectionMode(!isSelectionMode);
                    setSelectedRowIds(new Set());
                  }}
                  className={`h-8 w-8 p-0 rounded-lg flex items-center justify-center border transition-all cursor-pointer ${isSelectionMode
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm'
                    : 'bg-white border-slate-300 text-slate-555 hover:bg-slate-50 hover:text-slate-700'
                    }`}
                  title="Toggle Selection Mode"
                >
                  <SquareCheck className="w-4 h-4" />
                </button>
              )}

              {/* Undo / Redo Action Buttons */}
              {resolvedMode !== 'view' && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={history.length === 0 || saving || loading}
                    onClick={handleUndo}
                    className="h-8 w-8 p-0 rounded-lg flex items-center justify-center border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-2xs"
                    title="Undo last change (Ctrl+Z)"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={redoStack.length === 0 || saving || loading}
                    onClick={handleRedo}
                    className="h-8 w-8 p-0 rounded-lg flex items-center justify-center border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-2xs"
                    title="Redo action (Ctrl+Y)"
                  >
                    <Redo2 className="w-4 h-4" />
                  </button>
                </div>
              )}

              <DatePicker
                value={date}
                onChange={setDate as any}
                disabled={loading || saving}
                className="h-8 text-sm font-medium bg-white border border-slate-300 w-[160px] p-4"
              />
              <span className="text-xs text-gray-555 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-full font-medium shrink-0">
                {filteredEmployees.length} rows
              </span>

              {/* Project Badge / Select Component */}
              {(() => {
                const activeProjectsList = isFocalFiltered
                  ? focalProjectCodes
                  : (isApproverFiltered || resolvedMode === 'approve' ? approverProjectCodes : []);

                if (activeProjectsList.length === 1) {
                  return (
                    <span className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 rounded-full font-medium shrink-0">
                      Project: {activeProjectsList[0]}
                    </span>
                  );
                }

                if (activeProjectsList.length > 1) {
                  return (
                    <Select
                      value={selectedProjectFilter}
                      onValueChange={setSelectedProjectFilter}
                    >
                      <SelectTrigger className="h-8 text-xs font-medium bg-indigo-50/80 border border-indigo-200 text-indigo-800 rounded-full px-3 w-[170px] shrink-0 outline-none">
                        <SelectValue placeholder="All Projects" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-slate-200 z-50">
                        <SelectItem value="ALL" className="text-xs cursor-pointer focus:bg-slate-50 font-medium">
                          All Projects ({activeProjectsList.length})
                        </SelectItem>
                        {activeProjectsList.map(code => (
                          <SelectItem key={code} value={code} className="text-xs cursor-pointer focus:bg-slate-50">
                            Project: {code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }

                return null;
              })()}



              {isSelectionMode && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      disabled={selectedRowIds.size === 0}
                      className="h-8 px-3 select-none border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed active:bg-slate-100 rounded-lg flex items-center justify-center cursor-pointer font-medium text-[12px] text-slate-700 gap-1.5 shrink-0"
                    >
                      <span>Selected ({selectedRowIds.size})</span>
                      <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[180px] bg-white border border-slate-200 z-50 p-1">

                    <DropdownMenuItem
                      onClick={() => {
                        setBulkOvertimeValue(0);
                        setIsBulkOvertimeOpen(true);
                      }}
                      className="text-xs cursor-pointer focus:bg-slate-50 rounded-md p-2"
                    >
                      Allocate Overtime
                    </DropdownMenuItem>
                    {!isFocalFiltered && (
                      <DropdownMenuItem
                        onClick={() => {
                          setBulkProjectValue('');
                          setIsBulkProjectOpen(true);
                        }}
                        className="text-xs cursor-pointer focus:bg-slate-50 rounded-md p-2"
                      >
                        Allocate Project
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => {
                        setBulkStatusValue('present');
                        setBulkPunchInValue('08:00');
                        setBulkPunchOutValue('17:00');
                        setBulkRemarksValue('');
                        setBulkCustomRemarksValue('');
                        setIsBulkStatusOpen(true);
                      }}
                      className="text-xs cursor-pointer focus:bg-slate-50 rounded-md p-2"
                    >
                      Allocate Status
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setBulkRemarksValue('');
                        setBulkCustomRemarksValue('');
                        setIsBulkRemarksOpen(true);
                      }}
                      className="text-xs cursor-pointer focus:bg-slate-50 rounded-md p-2"
                    >
                      Allocate Remarks
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleBulkRevoke}
                      className="text-xs cursor-pointer text-red-600 hover:text-red-700 focus:bg-red-50 focus:text-red-700 rounded-md p-2 font-medium"
                    >
                      Revoke Changes
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Lock Status Details */}
            {isLocked && !loading && (
              <span style={{ fontSize: '12px', opacity: 0.85, display: 'flex', alignItems: 'center', gap: '6px', color: '#92400e' }}>
                <Lock size={13} />
                <span>Locked by {lockedBy}</span>
              </span>
            )}
          </div>

          {/* Action Buttons */}
          {canUserAction && (
            isLocked ? (
              <button disabled={loading || saving} className="btn-unlock" onClick={handleUnlock}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />}
                {resolvedMode === 'verify' ? 'Unlock Verification' : (resolvedMode === 'approve' ? 'Unlock Approval' : 'Unlock Timesheet')}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* Progress Button replacing Approve/Verify/Set as Review buttons */}
                <button
                  type="button"
                  disabled={loading || saving}
                  onClick={handleFinalize}
                  className="relative overflow-hidden rounded-lg px-4 h-8 text-xs font-semibold select-none border transition-all duration-300 flex items-center justify-center cursor-pointer shadow-xs"
                  style={{
                    minWidth: '210px',
                    border: "none",
                    backgroundColor: progressStats.isComplete
                      ? '#059669'
                      : '#f8fafc',
                    color: progressStats.isComplete
                      ? '#ffffff'
                      : (resolvedMode === 'approve' ? '#3730a3' : '#0f766e'),
                  }}
                  title={
                    progressStats.isComplete
                      ? `${resolvedMode === 'approve' ? 'Approval' : 'Verification'} Complete`
                      : `Click to process remaining ${progressStats.remaining} record(s)`
                  }
                >
                  {/* Progress Fill Background Layer */}
                  {!progressStats.isComplete && (
                    <div
                      className="absolute left-0 top-0 bottom-0 transition-all duration-500 ease-out"
                      style={{
                        width: `${progressStats.percentage}%`,
                        backgroundColor: resolvedMode === 'approve'
                          ? 'rgba(99, 102, 241, 0.22)'
                          : 'rgba(13, 148, 136, 0.22)',
                      }}
                    />
                  )}

                  {/* Button Label & Icon */}
                  <span className="relative z-10 flex items-center gap-1.5 font-semibold tracking-wide">
                    {saving ? (
                      <>
                        <Loader2 size={14} className="animate-spin shrink-0" />
                        <span>Processing…</span>
                      </>
                    ) : progressStats.isComplete ? (
                      <>
                        <Check size={15} className="shrink-0 text-white" />
                        <span>
                          {resolvedMode === 'approve'
                            ? 'Approval Complete'
                            : 'Verification Complete'}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="tabular-nums font-bold">
                          {progressStats.percentage}% {resolvedMode === 'approve' ? 'Approved' : 'Verified'}
                        </span>
                        <span className="opacity-75 text-[11px] font-normal">
                          ({progressStats.remaining} remaining)
                        </span>
                      </>
                    )}
                  </span>
                </button>
              </div>
            )
          )}
        </div>

        {/* Loading Indicator */}
        {loading && isInitialLoad ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '80px 0', gap: '8px', color: '#94a3b8', fontSize: '13px', border: "1px solid rgba(100 100 100/ 0.15)", height: "100%", borderRadius: "12px" }}>
            <Loader2 className="animate-spin" size={20} />
            Loading Daily Shifts…
          </div>
        ) : error ? (
          <div style={{ padding: '20px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '12px', fontSize: '13px' }}>
            {error}
          </div>
        ) : (
          <div className="table-scroll-container animate-fade-in" style={{ opacity: loading ? 0.65 : 1, transition: 'opacity 0.15s ease' }}>
            <table className="timesheet-table">
              <thead>
                <tr>
                  <th
                    className="sticky-checkbox transition-[width,opacity] duration-200 ease-in-out overflow-hidden"
                    style={{
                      width: isSelectionMode ? "48px" : "0px",
                      minWidth: isSelectionMode ? "48px" : "0px",
                      maxWidth: isSelectionMode ? "48px" : "0px",
                      opacity: isSelectionMode ? 1 : 0,
                      pointerEvents: isSelectionMode ? "auto" : "none",
                      textAlign: 'center',
                      padding: '0'
                    }}
                  >
                    <div className="w-12 h-10 flex items-center justify-center overflow-hidden">
                      <Checkbox
                        checked={
                          filteredEmployees.length > 0 &&
                          filteredEmployees.every(emp => selectedRowIds.has(emp.device_user_id))
                        }
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedRowIds(new Set(filteredEmployees.map(emp => emp.device_user_id)));
                          } else {
                            setSelectedRowIds(new Set());
                          }
                        }}
                        className="w-4 h-4 rounded border border-slate-400 bg-white data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 data-[state=checked]:text-white focus-visible:ring-indigo-500 cursor-pointer shrink-0"
                      />
                    </div>
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs uppercase tracking-wide sticky-name transition-[left] duration-200 ease-in-out" style={{ width: '320px', left: isSelectionMode ? '48px' : '0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                      <div className="relative flex items-center group flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-focus-within:text-darkblue transition-colors" />
                        <input
                          type="text"
                          placeholder="Search Employee..."
                          value={search}
                          style={{ fontSize: "0.8rem", fontWeight: "400" }}
                          onChange={(e) => setSearch(e.target.value)}
                          className="w-full pl-8 pr-6 py-1.5 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors tracking-wide text-gray-700 font-normal normal-case"
                        />
                        {search && (
                          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600">
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={`w-[30px] h-[30px] rounded-lg border flex items-center justify-center cursor-pointer transition-all shrink-0 focus:outline-none ${empTypeFilter === 'all'
                              ? 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                              : empTypeFilter === 'staff'
                                ? 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                              }`}
                            title={
                              empTypeFilter === 'all'
                                ? 'Filter: All Types'
                                : empTypeFilter === 'staff'
                                  ? 'Filter: Staff only'
                                  : 'Filter: Workers only'
                            }
                          >
                            <Users className="w-3.5 h-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-white border border-gray-100 shadow-xl rounded-lg z-[100] w-[130px] p-1">
                          <DropdownMenuItem
                            onClick={() => setEmpTypeFilter('all')}
                            className={`text-xs cursor-pointer focus:bg-gray-50 rounded-md p-2 font-medium ${empTypeFilter === 'all' ? 'text-indigo-600 bg-indigo-50/50 font-semibold' : 'text-gray-700'}`}
                          >
                            ALL TYPES
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setEmpTypeFilter('staff')}
                            className={`text-xs cursor-pointer focus:bg-gray-50 rounded-md p-2 font-medium ${empTypeFilter === 'staff' ? 'text-indigo-600 bg-indigo-50/50 font-semibold' : 'text-gray-700'}`}
                          >
                            STAFF ONLY
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setEmpTypeFilter('worker')}
                            className={`text-xs cursor-pointer focus:bg-gray-50 rounded-md p-2 font-medium ${empTypeFilter === 'worker' ? 'text-indigo-600 bg-indigo-50/50 font-semibold' : 'text-gray-700'}`}
                          >
                            WORKERS ONLY
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </th>

                  <th className="text-left px-1 py-1 font-medium text-xs tracking-wide" style={{ width: '140px' }}>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 text-gray-555 hover:bg-gray-100 transition-colors px-2 rounded-md font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide cursor-pointer">
                        <span className="truncate">
                          {statusFilter === 'all'
                            ? 'Status (All)'
                            : statusFilter === 'present'
                              ? 'Present'
                              : statusFilter === 'absent'
                                ? 'Absent'
                                : statusFilter === 'present with OT'
                                  ? 'Present with OT'
                                    : statusFilter === 'holiday'
                                      ? 'Holiday'
                                        : statusFilter === 'weekend'
                                          ? 'Weekend'
                                            : 'No Status'}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-60 shrink-0 ml-1" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[140px] p-1 bg-white border border-slate-200 z-50">
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={statusFilter === 'all'}
                          onCheckedChange={() => setStatusFilter('all')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          All Statuses
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={statusFilter === 'present'}
                          onCheckedChange={() => setStatusFilter('present')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          Present
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={statusFilter === 'present with OT'}
                          onCheckedChange={() => setStatusFilter('present with OT')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          Present with OT
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={statusFilter === 'absent'}
                          onCheckedChange={() => setStatusFilter('absent')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          Absent
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={statusFilter === 'holiday'}
                          onCheckedChange={() => setStatusFilter('holiday')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          Holiday
                          </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={statusFilter === 'weekend'}
                          onCheckedChange={() => setStatusFilter('weekend')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          Weekend
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={statusFilter === 'no status'}
                          onCheckedChange={() => setStatusFilter('no status')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          No Status
                        </DropdownMenuCheckboxItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </th>
                  <th className="text-left px-1 py-1 font-medium text-xs tracking-wide" style={{ width: '110px' }}>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 text-gray-555 hover:bg-gray-100 transition-colors px-2 rounded-md font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide cursor-pointer">
                        <span className="truncate">
                          {punchInFilter === 'all'
                            ? 'In (All)'
                            : punchInFilter === 'null'
                              ? 'In (Empty)'
                              : 'In (Filled)'}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-60 shrink-0 ml-1" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[120px] p-1 bg-white border border-slate-200 z-50">
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={punchInFilter === 'all'}
                          onCheckedChange={() => setPunchInFilter('all')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          All
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={punchInFilter === 'null'}
                          onCheckedChange={() => setPunchInFilter('null')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          Empty
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={punchInFilter === 'not_null'}
                          onCheckedChange={() => setPunchInFilter('not_null')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          Filled
                        </DropdownMenuCheckboxItem>
                        {isFocalFiltered && (
                          <>
                            <div className="my-1 border-t border-slate-100" />
                            <DropdownMenuItem
                              onClick={handleAutoFillEmptyPunchIn}
                              className="text-xs cursor-pointer text-indigo-600 font-medium focus:bg-indigo-50 focus:text-indigo-700 rounded-md p-1.5 flex items-center gap-1.5"
                            >
                              <Sparkles className="w-3.5 h-3.5" /> Autofill Empty
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </th>
                  <th className="text-left px-1 py-1 font-medium text-xs tracking-wide" style={{ width: '110px' }}>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 text-gray-555 hover:bg-gray-100 transition-colors px-2 rounded-md font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide cursor-pointer">
                        <span className="truncate">
                          {punchOutFilter === 'all'
                            ? 'Out (All)'
                            : punchOutFilter === 'null'
                              ? 'Out (Empty)'
                              : 'Out (Filled)'}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-60 shrink-0 ml-1" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[120px] p-1 bg-white border border-slate-200 z-50">
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={punchOutFilter === 'all'}
                          onCheckedChange={() => setPunchOutFilter('all')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          All
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={punchOutFilter === 'null'}
                          onCheckedChange={() => setPunchOutFilter('null')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          Empty
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={punchOutFilter === 'not_null'}
                          onCheckedChange={() => setPunchOutFilter('not_null')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          Filled
                        </DropdownMenuCheckboxItem>
                        {isFocalFiltered && (
                          <>
                            <div className="my-1 border-t border-slate-100" />
                            <DropdownMenuItem
                              onClick={handleAutoFillEmptyPunchOut}
                              className="text-xs cursor-pointer text-indigo-600 font-medium focus:bg-indigo-50 focus:text-indigo-700 rounded-md p-1.5 flex items-center gap-1.5"
                            >
                              <Sparkles className="w-3.5 h-3.5" /> Autofill Empty
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </th>
                  <th style={{ width: '85px', textAlign: 'center' }} title="Excludes 1 hour lunch break">Total (-1)</th>
                  <th style={{ width: '90px' }}>Overtime</th>
                  {!(isFocalFiltered || resolvedMode === 'approve') && (
                    <th className="text-left px-1 py-1 font-medium text-xs tracking-wide" style={{ width: '160px' }}>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 text-gray-555 hover:bg-gray-100 transition-colors px-2 rounded-md font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide cursor-pointer">
                          <span className="truncate">
                            {selectedProjects.length === 0
                              ? 'Project (All)'
                              : selectedProjects.length === 1
                                ? (selectedProjects[0] === 'UNASSIGNED' ? 'Unassigned' : selectedProjects[0])
                                : `Proj (${selectedProjects.length})`}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[200px] max-h-[300px] overflow-y-auto p-0 z-50 bg-white border border-slate-200">
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/95 backdrop-blur-xs"
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedProjects([...projects.map(p => p.project_code), 'UNASSIGNED']);
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
                                setSelectedProjects([]);
                              }}
                              className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-right"
                              style={{ background: "none", flex: 1 }}
                            >
                              Clear All
                            </button>
                          </div>
                          <div className="py-1">
                            <DropdownMenuCheckboxItem
                              style={{ justifyContent: "flex-start" }}
                              checked={selectedProjects.includes('UNASSIGNED')}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedProjects([...selectedProjects, 'UNASSIGNED']);
                                } else {
                                  setSelectedProjects(selectedProjects.filter(item => item !== 'UNASSIGNED'));
                                }
                              }}
                              onSelect={(e) => e.preventDefault()}
                              className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                            >
                              Unassigned
                            </DropdownMenuCheckboxItem>
                            {projects.map(p => {
                              const isChecked = selectedProjects.includes(p.project_code);
                              return (
                                <DropdownMenuCheckboxItem
                                  style={{ justifyContent: "flex-start" }}
                                  key={p.project_code}
                                  checked={isChecked}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedProjects([...selectedProjects, p.project_code]);
                                    } else {
                                      setSelectedProjects(selectedProjects.filter(item => item !== p.project_code));
                                    }
                                  }}
                                  onSelect={(e) => e.preventDefault()}
                                  className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                                >
                                  {p.project_code}
                                </DropdownMenuCheckboxItem>
                              );
                            })}
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </th>
                  )}
                  <th style={{ width: '200px' }}>Remarks</th>
                  <th className="text-left px-1 py-1 font-medium text-xs tracking-wide" style={{ width: '130px' }}>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 text-gray-555 hover:bg-gray-100 transition-colors px-2 rounded-md font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide cursor-pointer">
                        <span className="truncate">
                          {nationalityFilter === 'ALL'
                            ? 'Nationality (All)'
                            : nationalityFilter}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-60 shrink-0 ml-1" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[150px] p-1 bg-white border border-slate-200 z-50">
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={nationalityFilter === 'ALL'}
                          onCheckedChange={() => setNationalityFilter('ALL')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          All Nationalities
                        </DropdownMenuCheckboxItem>
                        {employees.length > 0 && Array.from(new Set(employees.map(e => e.nationality).filter((n): n is string => n !== null && n !== undefined))).sort().map(nationality => (
                          <DropdownMenuCheckboxItem
                            key={nationality}
                            style={{ justifyContent: "flex-start" }}
                            checked={nationalityFilter === nationality}
                            onCheckedChange={() => setNationalityFilter(nationality)}
                            className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                          >
                            {nationality}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </th>
                  <th className="sticky-action text-left px-1 py-1 font-medium text-xs tracking-wide" style={{ width: '250px', right: '0' }}>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 text-gray-555 hover:bg-gray-100 transition-colors px-2 rounded-md font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide cursor-pointer">
                        <span className="truncate">
                          {sourceFilter === 'ALL'
                            ? 'Source (All)'
                            : sourceFilter === 'MANUAL'
                              ? 'Source (Manual)'
                              : sourceFilter === 'LEAVE_LOG'
                                ? 'Source (Leave Log)'
                                : sourceFilter === 'DEVICE'
                                  ? 'Source (Device)'
                                  : 'Source (No Source)'}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-60 shrink-0 ml-1" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[190px] p-1 bg-white border border-slate-200 z-50">
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={sourceFilter === 'ALL'}
                          onCheckedChange={() => setSourceFilter('ALL')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          All Sources
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={sourceFilter === 'MANUAL'}
                          onCheckedChange={() => setSourceFilter('MANUAL')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          Manual
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={sourceFilter === 'LEAVE_LOG'}
                          onCheckedChange={() => setSourceFilter('LEAVE_LOG')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          Leave Log
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={sourceFilter === 'DEVICE'}
                          onCheckedChange={() => setSourceFilter('DEVICE')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          Device
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          style={{ justifyContent: "flex-start" }}
                          checked={sourceFilter === 'NO_SOURCE'}
                          onCheckedChange={() => setSourceFilter('NO_SOURCE')}
                          className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                        >
                          No Source
                        </DropdownMenuCheckboxItem>
                        <div className="h-px bg-slate-200 my-1" />
                        <DropdownMenuItem
                          onClick={handleApproveAllValidRecords}
                          disabled={saving || loading || !canUserEdit}
                          className="rounded-md focus:bg-teal-50 text-teal-700 font-semibold cursor-pointer text-xs flex items-center gap-1.5 p-2"
                        >
                          <SquareCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          <span>{resolvedMode === 'approve' ? 'Approve Valid Records' : 'Verify Valid Records'}</span>
                        </DropdownMenuItem>
                        {resolvedMode === 'approve' && (
                          <DropdownMenuItem
                            onClick={handleRevokeAllRecords}
                            disabled={saving || loading || !canUserEdit}
                            className="rounded-md focus:bg-rose-50 text-rose-700 font-semibold cursor-pointer text-xs flex items-center gap-1.5 p-2"
                          >
                            <Undo2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>Revoke Approval for All</span>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </th>

                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={isFocalFiltered ? 10 : 11} className="py-20 text-center text-gray-400 font-medium bg-white">
                      No matching records found.
                    </td>
                  </tr>
                ) : (
                  <>
                    {filteredEmployees.slice(0, renderLimit).map(emp => {
                      const row = rows[emp.device_user_id];
                      if (!row) return null;

                      return (
                        <TimesheetRowComponent
                          key={emp.device_user_id}
                          emp={emp}
                          row={row}
                          isSelected={selectedRowIds.has(emp.device_user_id)}
                          isSelectionMode={isSelectionMode}
                          isLocked={isLocked}
                          canUserEdit={canUserEdit}
                          isFocalFiltered={isFocalFiltered}
                          resolvedMode={resolvedMode}
                          saving={saving}
                          onRowSelect={handleRowSelect}
                          onUpdateRow={updateRow}
                          onUndoRow={handleUndoRow}
                          onApproveRow={handleApproveRow}
                          onRevokeApproveRow={handleRevokeApproveRow}
                          isVerifying={verifyingRowIds.has(emp.device_user_id)}
                          onVerifyBiometricRow={handleVerifyBiometricRow}
                          projectsWithDevices={projectsWithDevices}
                          projects={projects}
                          employeeAssignedProjects={employeeAssignedProjects}
                        />
                      );
                    })}
                    {filteredEmployees.length > renderLimit && (
                      <tr>
                        <td colSpan={isFocalFiltered ? 9 : 10} style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderRadius: "1rem" }} className="p-4 text-center bg-white/80 backdrop-blur-xs sticky bottom-0 z-10 border-t border-gray-150">
                          <div className="flex items-center justify-center gap-4 w-full">
                            <span className="text-xs text-gray-500 font-medium text-center">
                              Showing {renderLimit} of {filteredEmployees.length} records
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setLoadingMore(true);
                                setTimeout(() => {
                                  setRenderLimit(prev => prev + 100);
                                  setLoadingMore(false);
                                }, 50);
                              }}
                              disabled={loadingMore}
                              className="text-xs font-semibold h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors shadow-xs px-4 text-gray-755 cursor-pointer flex items-center justify-center gap-1.5 min-w-[100px]"
                            >
                              {loadingMore ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Loading...
                                </>
                              ) : (
                                "Load More"
                              )}
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
        )}

      </div>

      {/* Bulk Allocate Punch Time Dialog */}
      <Dialog open={isBulkPunchTimeOpen} onOpenChange={(open) => { if (!open) setIsBulkPunchTimeOpen(false); }}>
        <DialogContent className="sm:max-w-[425px] bg-white z-[100]">
          <DialogHeader>
            <DialogTitle>Bulk Update Punch Time</DialogTitle>
            <DialogDescription>
              Enter a new Punch In and/or Punch Out time for the {selectedRowIds.size} selected employee(s). Leaving either field blank will keep its original value.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600 block">Punch In Time</label>
              <Input
                type="time"
                value={bulkPunchInValue}
                onChange={(e) => setBulkPunchInValue(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600 block">Punch Out Time</label>
              <Input
                type="time"
                value={bulkPunchOutValue}
                onChange={(e) => setBulkPunchOutValue(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsBulkPunchTimeOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                handleBulkPunchTimeUpdate(bulkPunchInValue, bulkPunchOutValue);
                setIsBulkPunchTimeOpen(false);
              }}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Update Punch Time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Allocate Overtime Dialog */}
      <Dialog open={isBulkOvertimeOpen} onOpenChange={(open) => { if (!open) setIsBulkOvertimeOpen(false); }}>
        <DialogContent className="sm:max-w-[425px] bg-white z-[100]">
          <DialogHeader>
            <DialogTitle>Bulk Update Overtime</DialogTitle>
            <DialogDescription>
              Enter overtime hours for the {selectedRowIds.size} selected employee(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600 block">Overtime Hours</label>
              <Input
                type="number"
                step="0.5"
                min="0"
                max="24"
                value={bulkOvertimeValue}
                onChange={(e) => setBulkOvertimeValue(parseFloat(e.target.value) || 0)}
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsBulkOvertimeOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                handleBulkUpdate('overtime', bulkOvertimeValue);
                setIsBulkOvertimeOpen(false);
              }}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Update Overtime
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Allocate Project Dialog */}
      <Dialog open={isBulkProjectOpen} onOpenChange={(open) => { if (!open) setIsBulkProjectOpen(false); }}>
        <DialogContent className="sm:max-w-[425px] bg-white z-[100]">
          <DialogHeader>
            <DialogTitle>Bulk Update Project</DialogTitle>
            <DialogDescription>
              Select a project to allocate for the {selectedRowIds.size} selected employee(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600 block">Project Allocation</label>
              <Select
                value={bulkProjectValue || 'UNASSIGNED'}
                onValueChange={(val) => setBulkProjectValue(val === 'UNASSIGNED' ? '' : val)}
              >
                <SelectTrigger className="w-full text-xs h-9 bg-white border border-slate-300">
                  <SelectValue placeholder="Choose Project" />
                </SelectTrigger>
                <SelectContent className="bg-white border border-slate-200 z-[120]">
                  <SelectItem value="UNASSIGNED" className="text-xs cursor-pointer focus:bg-slate-50">-- Choose Project --</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.project_code} value={p.project_code} className="text-xs cursor-pointer focus:bg-slate-50">
                      {p.project_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsBulkProjectOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                handleBulkUpdate('project_code', bulkProjectValue);
                setIsBulkProjectOpen(false);
              }}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Update Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Allocate Status Dialog */}
      <Dialog open={isBulkStatusOpen} onOpenChange={(open) => { if (!open) setIsBulkStatusOpen(false); }}>
        <DialogContent className="sm:max-w-[425px] bg-white z-[100]">
          <DialogHeader>
            <DialogTitle>Bulk Update Status</DialogTitle>
            <DialogDescription>
              Select status for the {selectedRowIds.size} selected employee(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600 block">Status</label>
              <Select
                value={bulkStatusValue}
                onValueChange={(val: any) => setBulkStatusValue(val)}
              >
                <SelectTrigger className="w-full text-xs h-9 bg-white border border-slate-300">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-white border border-slate-200 z-[120]">
                  <SelectItem value="no status" className="text-xs cursor-pointer focus:bg-slate-50">No Status</SelectItem>
                  <SelectItem value="present" className="text-xs cursor-pointer focus:bg-slate-50">Present</SelectItem>
                  <SelectItem value="absent" className="text-xs cursor-pointer focus:bg-slate-50">Absent</SelectItem>
                  <SelectItem value="present with OT" className="text-xs cursor-pointer focus:bg-slate-50">Present with OT</SelectItem>
                  <SelectItem value="holiday" className="text-xs cursor-pointer focus:bg-slate-50">Holiday</SelectItem>
                  <SelectItem value="weekend" className="text-xs cursor-pointer focus:bg-slate-50">Weekend</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {bulkStatusValue === 'absent' && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 block">Remark</label>
                <Select
                  value={
                    bulkRemarksValue === ''
                      ? 'NONE'
                      : (bulkRemarksValue === 'Present' || bulkRemarksValue === 'Forgot to Punch' || bulkRemarksValue === 'Forgot to Punch In' || bulkRemarksValue === 'Forgot to Punch Out' || bulkRemarksValue === 'Sick Leave' || bulkRemarksValue === 'Unpaid Leave' || bulkRemarksValue === 'Casual Leave' || bulkRemarksValue === 'Emergency Leave' || bulkRemarksValue === 'No Device' || bulkRemarksValue === 'Half Day' || bulkRemarksValue === 'Holiday' || bulkRemarksValue === 'Weekend')
                        ? bulkRemarksValue
                        : 'CUSTOM'
                  }
                  onValueChange={(val) => {
                    if (val === 'NONE') {
                      setBulkRemarksValue('');
                    } else if (val === 'CUSTOM') {
                      setBulkRemarksValue('Custom: ');
                    } else {
                      setBulkRemarksValue(val);
                    }
                  }}
                >
                  <SelectTrigger className="w-full text-xs h-9 bg-white border border-slate-300">
                    <SelectValue placeholder="No Remark" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-slate-200 z-[120]">
                    <SelectItem value="NONE" className="text-xs cursor-pointer focus:bg-slate-50">No Remark</SelectItem>
                    <SelectItem value="Forgot to Punch" className="text-xs cursor-pointer focus:bg-slate-50">Forgot to Punch</SelectItem>
                    <SelectItem value="Forgot to Punch In" className="text-xs cursor-pointer focus:bg-slate-50">Forgot to Punch In</SelectItem>
                    <SelectItem value="Forgot to Punch Out" className="text-xs cursor-pointer focus:bg-slate-50">Forgot to Punch Out</SelectItem>
                    <SelectItem value="Sick Leave" className="text-xs cursor-pointer focus:bg-slate-50">Sick Leave</SelectItem>
                    <SelectItem value="Unpaid Leave" className="text-xs cursor-pointer focus:bg-slate-50">Unpaid Leave</SelectItem>
                    <SelectItem value="Casual Leave" className="text-xs cursor-pointer focus:bg-slate-50">Casual Leave</SelectItem>
                    <SelectItem value="Emergency Leave" className="text-xs cursor-pointer focus:bg-slate-50">Emergency Leave</SelectItem>
                    <SelectItem value="No Device" className="text-xs cursor-pointer focus:bg-slate-50">No Device</SelectItem>
                    <SelectItem value="Holiday" className="text-xs cursor-pointer focus:bg-slate-50">Holiday</SelectItem>
                    <SelectItem value="Weekend" className="text-xs cursor-pointer focus:bg-slate-50">Weekend</SelectItem>
                    <SelectItem value="CUSTOM" className="text-xs cursor-pointer focus:bg-slate-50">Custom...</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {bulkStatusValue === 'absent' && bulkRemarksValue.startsWith('Custom: ') && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 block">Custom Remark</label>
                <Input
                  type="text"
                  value={bulkCustomRemarksValue}
                  onChange={(e) => setBulkCustomRemarksValue(e.target.value)}
                  placeholder="Type custom remark..."
                  className="h-9"
                />
              </div>
            )}

            {(bulkStatusValue === 'present' || bulkStatusValue === 'present with OT') && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-600 block">Punch In Time</label>
                  <Input
                    type="time"
                    value={bulkPunchInValue}
                    onChange={(e) => setBulkPunchInValue(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-600 block">Punch Out Time</label>
                  <Input
                    type="time"
                    value={bulkPunchOutValue}
                    onChange={(e) => setBulkPunchOutValue(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsBulkStatusOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                bulkStatusValue === 'absent' && (
                  !bulkRemarksValue || (bulkRemarksValue.startsWith('Custom: ') && !bulkCustomRemarksValue.trim())
                )
              }
              onClick={() => {
                const finalRemark = bulkRemarksValue.startsWith('Custom: ')
                  ? 'Custom: ' + bulkCustomRemarksValue.trim()
                  : bulkRemarksValue;
                handleBulkUpdate('status', bulkStatusValue, {
                  remarks: bulkStatusValue === 'absent' ? finalRemark : '',
                  punchIn: (bulkStatusValue === 'present' || bulkStatusValue === 'present with OT') ? bulkPunchInValue : '',
                  punchOut: (bulkStatusValue === 'present' || bulkStatusValue === 'present with OT') ? bulkPunchOutValue : ''
                });
                setIsBulkStatusOpen(false);
              }}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Allocate Remarks Dialog */}
      <Dialog open={isBulkRemarksOpen} onOpenChange={(open) => { if (!open) setIsBulkRemarksOpen(false); }}>
        <DialogContent className="sm:max-w-[425px] bg-white z-[100]">
          <DialogHeader>
            <DialogTitle>Bulk Update Remarks</DialogTitle>
            <DialogDescription>
              Set remark for the {selectedRowIds.size} selected employee(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600 block">Remark</label>
              <Select
                value={
                  bulkRemarksValue === ''
                    ? 'NONE'
                    : (bulkRemarksValue === 'Present' || bulkRemarksValue === 'Forgot to Punch' || bulkRemarksValue === 'Forgot to Punch In' || bulkRemarksValue === 'Forgot to Punch Out' || bulkRemarksValue === 'Sick Leave' || bulkRemarksValue === 'Unpaid Leave' || bulkRemarksValue === 'Casual Leave' || bulkRemarksValue === 'Emergency Leave' || bulkRemarksValue === 'No Device' || bulkRemarksValue === 'Half Day' || bulkRemarksValue === 'Holiday' || bulkRemarksValue === 'Weekend')
                      ? bulkRemarksValue
                      : 'CUSTOM'
                }
                onValueChange={(val) => {
                  if (val === 'NONE') {
                    setBulkRemarksValue('');
                  } else if (val === 'CUSTOM') {
                    setBulkRemarksValue('Custom: ');
                  } else {
                    setBulkRemarksValue(val);
                  }
                }}
              >
                <SelectTrigger className="w-full text-xs h-9 bg-white border border-slate-300">
                  <SelectValue placeholder="No Remark" />
                </SelectTrigger>
                <SelectContent className="bg-white border border-slate-200 z-[120]">
                  <SelectItem value="NONE" className="text-xs cursor-pointer focus:bg-slate-50">No Remark</SelectItem>
                  <SelectItem value="Forgot to Punch" className="text-xs cursor-pointer focus:bg-slate-50">Forgot to Punch</SelectItem>
                  <SelectItem value="Forgot to Punch In" className="text-xs cursor-pointer focus:bg-slate-50">Forgot to Punch In</SelectItem>
                  <SelectItem value="Forgot to Punch Out" className="text-xs cursor-pointer focus:bg-slate-50">Forgot to Punch Out</SelectItem>
                  <SelectItem value="Sick Leave" className="text-xs cursor-pointer focus:bg-slate-50">Sick Leave</SelectItem>
                  <SelectItem value="Unpaid Leave" className="text-xs cursor-pointer focus:bg-slate-50">Unpaid Leave</SelectItem>
                  <SelectItem value="Casual Leave" className="text-xs cursor-pointer focus:bg-slate-50">Casual Leave</SelectItem>
                  <SelectItem value="Emergency Leave" className="text-xs cursor-pointer focus:bg-slate-50">Emergency Leave</SelectItem>
                  <SelectItem value="No Device" className="text-xs cursor-pointer focus:bg-slate-50">No Device</SelectItem>
                  <SelectItem value="Half Day" className="text-xs cursor-pointer focus:bg-slate-50">Half Day</SelectItem>
                  <SelectItem value="Holiday" className="text-xs cursor-pointer focus:bg-slate-50">Holiday</SelectItem>
                  <SelectItem value="Weekend" className="text-xs cursor-pointer focus:bg-slate-50">Weekend</SelectItem>                  
                  <SelectItem value="CUSTOM" className="text-xs cursor-pointer focus:bg-slate-50">Custom...</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {bulkRemarksValue.startsWith('Custom: ') && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 block">Custom Remark</label>
                <Input
                  type="text"
                  value={bulkCustomRemarksValue}
                  onChange={(e) => setBulkCustomRemarksValue(e.target.value)}
                  placeholder="Type custom remark..."
                  className="h-9"
                />
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsBulkRemarksOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                const finalRemark = bulkRemarksValue.startsWith('Custom: ')
                  ? 'Custom: ' + bulkCustomRemarksValue
                  : bulkRemarksValue;
                handleBulkUpdate('remarks', finalRemark);
                setIsBulkRemarksOpen(false);
              }}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Update Remarks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
