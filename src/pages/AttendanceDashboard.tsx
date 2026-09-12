import Back from '@/components/back';
import { DatePicker } from '@/components/date-picker';
import Directive from '@/components/directive';
import RefreshButton from '@/components/refresh-button';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRightLeft, BarChart3, Calendar, ChartLine, Check, Database, FileCheck, FolderKanban, Laptop2, LayoutGrid, List, Loader2, PenLine, Sidebar, Table, Terminal as TerminalIcon, TrendingUp, UserCog, UserPlus, Zap, FileSpreadsheet, Pointer, PlaneTakeoff, Clock3 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmployeeTable } from '../components/EmployeeTable';
import { PunchLog } from '../components/PunchLog';
import DetailedBreakdown from '../components/DetailedBreakdown';
import { useAttendance } from '../lib/useAttendance';
import { todayISO } from '../lib/utilis';
import AddEmployee from './AddEmployee';
import DataManagement from './DataManagement';
import DevicesMaster from './DevicesMaster';
import EmployeeManage from './employee-manage';
import ProjectsMaster from './ProjectsMaster';
import ReportsPage from './ReportsPage';
import Terminal from './Terminal';
import TimesheetFinalizer from './TimesheetFinalizer';
import TransferRequests from './transfer-requests';
import LeaveLog from './LeaveLog';
import TimesheetViewer from '../components/TimesheetViewer';

import { useAuth } from '@/components/AuthProvider';
import { supabase } from '../lib/supabase';

const ROW_SIZE_BYTES = 185;
const FREE_TIER_QUOTA_BYTES = 500 * 1024 * 1024; // 500 MB

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

type Tab = 'summary' | 'log' | 'reports' | 'devices' | 'add' | 'manage' | 'terminal' | 'data-management' | 'analytics' | 'transfers' | 'projects' | 'finalize' | 'breakdown' | 'leave-log' | 'timesheets' | 'summary-report' | 'timesheet-edit' | 'project-timing-break';

export default function AttendanceDashboard() {
  const navigate = useNavigate();
  const [date, setDate] = useState<string>(todayISO());
  const [tab, setTab] = useState<Tab>('summary');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [tabLoading, setTabLoading] = useState(false);
  const [terminalHasPendingTasks, setTerminalHasPendingTasks] = useState(false);

  const { punches, employees, employeeSummaries, loading, refetch, useFirstLast, setUseFirstLast, activeCount, inactiveCount } = useAttendance(date);
  const { userData } = useAuth();
  const [navVisible, setNavVisible] = useState(true);
  const [dbCount, setDbCount] = useState<number | null>(null);
  const [biometricsSpace, setBiometricsSpace] = useState<number>(0);
  const [isFocalPoint, setIsFocalPoint] = useState(false);
  const [isTimesheetApprover, setIsTimesheetApprover] = useState(false);

  useEffect(() => {
    const checkFocalPointAndApprover = async () => {
      if (userData?.role !== 'admin' && userData?.email) {
        // Query focal point
        const { data: focalData } = await supabase
          .from('projects')
          .select('project_code')
          .eq('focal_point_email', userData.email);
        if (focalData && focalData.length > 0) {
          setIsFocalPoint(true);
        }

        // Query approver
        const { data: approverData } = await supabase
          .from('projects')
          .select('project_code')
          .eq('approver_email', userData.email);
        if (approverData && approverData.length > 0) {
          setIsTimesheetApprover(true);
        }
      }
    };
    checkFocalPointAndApprover();
  }, [userData]);

  useEffect(() => {
    setTabLoading(false);
  }, [tab]);

  const isFetching = (tab === 'summary' || tab === 'log') ? loading : tabLoading;

  const handleGlobalRefresh = () => {
    if (tab === 'summary' || tab === 'log') {
      refetch();
    } else {
      setRefreshTrigger(prev => prev + 1);
    }
  };

  const fetchTerminalPendingStatus = useCallback(async () => {
    try {
      const { count, error } = await supabase
        .from('device_commands')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'sent']);

      if (!error) {
        setTerminalHasPendingTasks((count ?? 0) > 0);
      }
    } catch {
      // Keep the last known state if the check fails.
    }
  }, []);

  const fetchDbCount = () => {
    supabase
      .from('punches')
      .select('*', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (!error && count !== null) {
          setDbCount(count);
        }
      });

    supabase
      .from('employees')
      .select('fingerprint_templates, face_templates')
      .then(({ data, error }) => {
        if (!error && data) {
          let space = 0;
          data.forEach((emp: any) => {
            if (emp.fingerprint_templates) {
              Object.values(emp.fingerprint_templates).forEach((val: any) => {
                if (val && val.template) {
                  space += val.template.length;
                }
              });
            }
            if (emp.face_templates) {
              Object.values(emp.face_templates).forEach((val: any) => {
                if (val && val.template) {
                  space += val.template.length;
                }
              });
            }
          });
          setBiometricsSpace(space);
        }
      });
  };

  const canEditAttendance = useMemo(() => {
    try {
      const permissions = JSON.parse(userData?.clearance || "{}") as Record<string, boolean>;
      const hasStructuredClearance = Object.keys(permissions).length > 0;
      const hasAttendanceModule = permissions.attendance === true;
      const hasAttendanceEdit = permissions.attendance_edit === true;
      const hasExplicitEditBlock = permissions.attendance_edit === false;

      if (hasAttendanceModule) {
        return hasAttendanceEdit;
      }

      if (permissions.attendance === false || hasExplicitEditBlock) {
        return false;
      }

      if (userData?.role === "admin" || userData?.role === "site_admin") {
        return !hasStructuredClearance;
      }

      return false;
    } catch {
      return userData?.role === "admin" || userData?.role === "site_admin";
    }
  }, [userData]);

  const viewOptions = useMemo(() => {
    let permissions: Record<string, boolean> = {};
    try {
      permissions = JSON.parse(userData?.clearance || "{}");
    } catch {
      // Fallback
    }

    let finalizeLabel = 'Finalize Timesheets';
    if (isTimesheetApprover) {
      finalizeLabel = 'Approvals';
    } else if (permissions.timesheet_finalizer === true) {
      finalizeLabel = 'Finalize Timesheets';
    } else if (permissions.timesheet_viewer === true) {
      finalizeLabel = 'View Timesheets';
    } else if (isFocalPoint) {
      finalizeLabel = 'Verify Timesheets';
    }

    const options = [
      { value: 'summary', label: 'Dashboard', icon: <LayoutGrid color="darkblue" className="w-4 h-4" /> },
      { value: 'transfers', label: 'Transfers', icon: <ArrowRightLeft color="darkblue" className="w-4 h-4" /> },
      { value: 'breakdown', label: 'Detailed Breakdown', icon: <Table color="darkblue" className="w-4 h-4" /> },
      { value: 'analytics', label: 'Analytics', icon: <BarChart3 color="darkblue" className="w-4 h-4" /> },
      { value: 'manage', label: canEditAttendance ? 'Manage' : 'Master', icon: <UserPlus color="darkblue" className="w-4 h-4" /> },
      { value: 'log', label: 'Punch Log', icon: <Pointer color="darkblue" className="w-4 h-4" /> },
      { value: 'reports', label: 'Reports', icon: <TrendingUp color="darkblue" className="w-4 h-4" /> },
      { value: 'devices', label: 'Devices', icon: <Laptop2 color="darkblue" className="w-4 h-4" /> },
      { value: 'projects', label: 'Projects', icon: <FolderKanban color="darkblue" className="w-4 h-4" /> },
      { value: 'finalize', label: finalizeLabel, icon: <FileCheck color="darkblue" className="w-4 h-4" /> },
      { value: 'timesheets', label: 'Timesheets', icon: <FileSpreadsheet color="darkblue" className="w-4 h-4" /> },
      { value: 'summary-report', label: 'Summary Report', icon: <FileSpreadsheet color="darkblue" className="w-4 h-4" /> },
      { value: 'timesheet-edit', label: 'Edit Timesheet', icon: <PenLine color="darkblue" className="w-4 h-4" /> },
      { value: 'project-timing-break', label: 'Project Break Timings', icon: <Clock3 color="darkblue" className="w-4 h-4" /> },      
      { value: 'leave-log', label: 'Leave Log', icon: <Calendar color="darkblue" className="w-4 h-4" /> },
      { value: 'terminal', label: 'Terminal', icon: <TerminalIcon color="darkblue" className="w-4 h-4" /> },
      { value: 'data-management', label: 'Data Management', icon: <Database color="darkblue" className="w-4 h-4" /> },
    ];

    const hasStructuredClearance = Object.keys(permissions).length > 0;
    if (hasStructuredClearance) {
      return options.filter(opt => {
        if (opt.value === 'transfers') return permissions.attendance_transfers === true;
        if (opt.value === 'breakdown') return permissions.attendance_breakdown === true;
        if (opt.value === 'manage') return permissions.attendance_manage === true;
        if (opt.value === 'reports') return permissions.attendance_reports === true;
        if (opt.value === 'projects') return permissions.attendance_projects === true;
        if (opt.value === 'terminal') return permissions.attendance_manage === true;
        if (opt.value === 'finalize') return permissions.timesheet_finalizer === true || isTimesheetApprover || permissions.timesheet_viewer === true || isFocalPoint;
        if (opt.value === 'leave-log') return permissions.attendance_leave_log === true;
        if (opt.value === 'timesheets') return permissions.timesheet_viewer === true || permissions.timesheet_finalizer === true || permissions.attendance === true || isTimesheetApprover || isFocalPoint;
        if (opt.value === 'summary-report') return permissions.timesheet_summary_report === true;        
        if (opt.value === 'timesheet-edit') return canEditAttendance;        
        if (opt.value === 'project-timing-break') return canEditAttendance;        
        return true;
      });
    }

    if (!canEditAttendance && !isFocalPoint && !isTimesheetApprover) {
      return options.filter(opt => opt.value !== 'manage' && opt.value !== 'finalize' && opt.value !== 'leave-log' && opt.value !== 'timesheets');
    }
    return options;
  }, [canEditAttendance, userData?.clearance, isFocalPoint, isTimesheetApprover]);

  const isAllowed = (tabValue: Tab) => {
    return viewOptions.some(opt => opt.value === tabValue);
  };

  useEffect(() => {
    if (!isAllowed(tab)) {
      setTab('summary');
    }
  }, [viewOptions, tab]);

  useEffect(() => {
    fetchDbCount();
  }, []);

  useEffect(() => {
    if (tab === 'data-management') {
      fetchDbCount();
    }
  }, [tab]);

  useEffect(() => {
    if (!loading) {
      fetchDbCount();
    }
  }, [loading]);

  useEffect(() => {
    fetchTerminalPendingStatus();

    const channel = supabase
      .channel('attendance_dashboard_terminal_pending')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'device_commands' },
        () => {
          fetchTerminalPendingStatus();
        }
      )
      .subscribe();

    const intervalId = window.setInterval(() => {
      fetchTerminalPendingStatus();
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(intervalId);
    };
  }, [fetchTerminalPendingStatus]);



  const activeViewLabel = useMemo(
    () => viewOptions.find(opt => opt.value === tab)?.label,
    [tab, viewOptions]
  );

  return (
    <div style={{ height: "100svh", display: "flex", flexDirection: "column" }}>
      <Back

        customTitle={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginLeft: "0.25rem" }}>
            <h1>Attendance</h1>
            {canEditAttendance && <PenLine size={14} className="text-gray-400 opacity-80" />}
            {/* <p style={{ fontSize: "0.8rem", color: "green", background: "rgba(0 255 0/ 0.1)", padding: "0.05rem 0.5rem", borderRadius: "0.5rem", fontWeight: 500 }}>LIVE</p> */}
          </div>
        }
        fixed
        extra={<RefreshButton onClick={handleGlobalRefresh} fetchingData={isFetching} />} />

      {/* ✅ CRITICAL FIX: minWidth + overflow hidden */}
      <div
        id="content-body"
        style={{
          display: "flex",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          border: "1px solid rgba(100 100 100 / 0.1)",
          borderRadius: "1rem",
          margin: "1rem",
          marginTop: "5rem",
          padding: "0.5rem",
        }}
      >
        {/* LEFT NAV */}
        <AnimatePresence initial={false}>
          {navVisible && (
            <motion.div
              initial={{ width: 0, opacity: 0, x: -20, paddingLeft: 0, paddingRight: 0, marginRight: 0, borderWidth: 0 }}
              animate={{ width: "25ch", opacity: 1, x: 0, paddingLeft: "0.5rem", paddingRight: "0.5rem", marginRight: "0.75rem", borderWidth: 1 }}
              exit={{ width: 0, opacity: 0, x: -20, paddingLeft: 0, paddingRight: 0, marginRight: 0, borderWidth: 0 }}
              transition={{ type: "spring", stiffness: 350, damping: 35 }}
              style={{
                borderStyle: "solid",
                borderColor: "rgba(100 100 100 / 0.1)",
                borderRadius: "0.5rem",
                paddingTop: "0.5rem",
                paddingBottom: "0.5rem",
                flexShrink: 0,
                overflow: "hidden",
                whiteSpace: "nowrap",
                display: "flex",
                flexDirection: "column",
                height: "100%"
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem", flex: 1, minHeight: 0 }}>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1, overflowY: "auto", minHeight: 0 }}>
                  {isAllowed('summary') && (
                    <Directive bg={tab === 'summary' ? "rgba(100 100 100/ 0.05)" : "rgba(100 100 100/ 0)"} width="100%" height='3rem' titleSize="0.9rem" onClick={() => setTab('summary')} title="Dashboard" icon={<ChartLine size={16} />} />
                  )}

                  {isAllowed('transfers') && (
                    <Directive bg={tab === 'transfers' ? "rgba(100 100 100/ 0.05)" : "rgba(100 100 100/ 0)"} width="100%" height='3rem' titleSize="0.9rem" onClick={() => setTab('transfers')} title="Transfers" icon={<ArrowRightLeft size={16} />} />
                  )}

                  {isAllowed('breakdown') && (
                    <Directive bg={tab === 'breakdown' ? "rgba(100 100 100/ 0.05)" : "rgba(100 100 100/ 0)"} width="100%" height='3rem' titleSize="0.9rem" onClick={() => setTab('breakdown')} title="Detailed Breakdown" icon={<Table size={16} />} />
                  )}

                  {isAllowed('manage') && (
                    <Directive bg={tab === 'manage' ? "rgba(100 100 100/ 0.05)" : "rgba(100 100 100/ 0)"} width="100%" height='3rem' titleSize="0.9rem" onClick={() => setTab('manage')} title={canEditAttendance ? "Manage" : "Master"} icon={<UserCog size={16} />} />
                  )}

                  {isAllowed('log') && (
                    <Directive bg={tab === 'log' ? "rgba(100 100 100/ 0.05)" : "rgba(100 100 100/ 0)"} width="100%" height='3rem' titleSize="0.9rem" onClick={() => setTab('log')} title="Punch Log" icon={<List size={16} />} />
                  )}

                  {isAllowed('reports') && (
                    <Directive bg={tab === 'reports' ? "rgba(100 100 100/ 0.05)" : "rgba(100 100 100/ 0)"} width="100%" height='3rem' titleSize="0.9rem" onClick={() => setTab('reports')} title="Reports" icon={<TrendingUp size={16} />} />
                  )}

                  {isAllowed('devices') && (
                    <Directive bg={tab === 'devices' ? "rgba(100 100 100/ 0.05)" : "rgba(100 100 100/ 0)"} width="100%" height='3rem' titleSize="0.9rem" onClick={() => setTab('devices')} title="Devices" icon={<Laptop2 size={16} />} />
                  )}

                  {isAllowed('projects') && (
                    <Directive bg={tab === 'projects' ? "rgba(100 100 100/ 0.05)" : "rgba(100 100 100/ 0)"} width="100%" height='3rem' titleSize="0.9rem" onClick={() => setTab('projects')} title="Projects" icon={<FolderKanban size={16} />} />
                  )}

                  {isAllowed('leave-log') && (
                    <Directive bg={tab === 'leave-log' ? "rgba(100 100 100/ 0.05)" : "rgba(100 100 100/ 0)"} width="100%" height='3rem' titleSize="0.9rem" onClick={() => setTab('leave-log')} title="Leave Log" icon={<PlaneTakeoff size={16} />} />
                  )}

                  {isAllowed('terminal') && (
                    <Directive bg={tab === 'terminal' ? "rgba(100 100 100/ 0.05)" : "rgba(100 100 100/ 0)"} width="100%" height='3rem' titleSize="0.9rem" onClick={() => setTab('terminal')} title="Terminal" icon={<TerminalIcon size={16} />} loading={terminalHasPendingTasks} />
                  )}

                  {isAllowed('finalize') && (
                    <Directive bg={tab === 'finalize' ? "rgba(100 100 100/ 0.05)" : "rgba(100 100 100/ 0)"} width="100%" height='3rem' titleSize="0.9rem" onClick={() => setTab('finalize')} title={isTimesheetApprover ? "Approvals" : (isFocalPoint ? "Verify" : "Finalize")} icon={<Check size={16} />} />
                  )}

                  {isAllowed('timesheets') && (
                    <Directive bg={tab === 'timesheets' ? "rgba(100 100 100/ 0.05)" : "rgba(100 100 100/ 0)"} width="100%" height='3rem' titleSize="0.9rem" onClick={() => setTab('timesheets')} title="Timesheets" icon={<FileSpreadsheet size={16} />} />
                  )}
                  
                  {isAllowed('summary-report') && (
                    <Directive bg="rgba(100 100 100/ 0)" width="100%" height='3rem' titleSize="0.9rem" onClick={() => navigate('/employee-timesheet-summary')} title="Summary Report" icon={<FileSpreadsheet size={16} />} />
                  )}
                  {isAllowed('timesheet-edit') && (
                    <Directive bg="rgba(100 100 100/ 0)" width="100%" height='3rem' titleSize="0.9rem" onClick={() => navigate('/timesheet-edit')} title="Edit Timesheet" icon={<PenLine size={16} />} />
                  )}
                  {isAllowed('project-timing-break') && (
                    <Directive bg="rgba(100 100 100/ 0)" width="100%" height='3rem' titleSize="0.9rem" onClick={() => navigate('/project-timing-break')} title="Project Break Timings" icon={<Clock3 size={16} />} />
                  )}                 
                </div>

                <div style={{ width: "100%", paddingTop: "0.2rem", flexShrink: 0 }}>
                  <motion.div
                    whileTap={canEditAttendance ? { scale: 0.98 } : undefined}
                    onClick={canEditAttendance ? () => setTab('data-management') : undefined}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      padding: "0.75rem",
                      gap: "0.5rem",
                      background: tab === 'data-management' ? "#E0F2F1" : "rgba(246, 248, 252, 0.78)",
                      backdropFilter: "blur(10px)",
                      WebkitBackdropFilter: "blur(10px)",
                      borderRadius: "0.5rem",

                      transition: "all 0.2s ease",
                      cursor: canEditAttendance ? "pointer" : "default",
                      position: "relative",
                      overflow: "hidden",
                      boxShadow: tab === 'data-management' ? "0 2px 10px rgba(0, 150, 136, 0.08)" : "0 2px 10px rgba(15, 23, 42, 0.04)",
                    }}
                  >
                    {/* Top row: Icon & Title */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                      <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                        <Zap size={16} className={"text-teal-600"} />
                      </div>
                      <span
                        style={{
                          fontWeight: tab === 'data-management' ? 500 : 400,
                          fontSize: "0.85rem",
                          color: tab === 'data-management' ? "#004D40" : "#1F2937",
                          flex: 1,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        Usage
                      </span>
                      {dbCount === null && (
                        <Loader2 size={12} className="animate-spin text-gray-400" />
                      )}
                    </div>

                    {/* Middle row: Progress bar */}
                    {dbCount !== null && (() => {
                      const totalSpaceUsed = dbCount * ROW_SIZE_BYTES + biometricsSpace;
                      const quotaPercent = (totalSpaceUsed / FREE_TIER_QUOTA_BYTES) * 100;
                      return (
                        <>
                          <div style={{ width: "100%", height: "5px", backgroundColor: tab === 'data-management' ? "#B2DFDB" : "#E5E7EB", borderRadius: "9999px", overflow: "hidden" }}>
                            <div
                              style={{
                                width: `${Math.min(100, quotaPercent)}%`,
                                height: "100%",
                                background: quotaPercent > 85
                                  ? "linear-gradient(to right, #EF4444, #F43F5E)"
                                  : quotaPercent > 50
                                    ? "linear-gradient(to right, #F59E0B, #F97316)"
                                    : "linear-gradient(to right, #10B981, #14B8A6)",
                                borderRadius: "9999px",
                                transition: "width 0.5s ease-out"
                              }}
                            />
                          </div>
                          {/* Bottom row: Usage labels */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.7rem", color: tab === 'data-management' ? "#00695C" : "#6B7280", fontWeight: 500, marginTop: "0.25rem" }}>
                            <span>{formatSize(totalSpaceUsed)} / 500 MB</span>
                            <span>{Math.min(100, parseFloat(quotaPercent.toFixed(2)))}%</span>
                          </div>
                        </>
                      );
                    })()}
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>


        {/* RIGHT PANEL */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 0, // ✅ IMPORTANT
            gap: "0.5rem",
          }}
        >
          {/* HEADER */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "", padding: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "0.25rem" }}>
              <button style={{ background: "rgba(100 100 100/ 0.05)" }} onClick={() => setNavVisible(v => !v)}>
                <Sidebar size={14} />
              </button>

              <h3 style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginLeft: "", fontSize: "1.25rem", fontWeight: 500 }}>
                {/* {viewOptions.find(opt => opt.value === tab)?.icon} */}
                {activeViewLabel}
              </h3>
            </div>


            {
              tab === 'summary' || tab === 'log' || tab === 'breakdown' ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {tab === 'summary' && (
                    <button
                      onClick={() => setUseFirstLast(!useFirstLast)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 hover:bg-gray-50 rounded-lg shadow-sm transition-colors text-gray-700 h-8"
                    >
                      <span className="text-gray-400 font-normal">Mode </span>
                      <span className="text-teal-600 font-medium">
                        {useFirstLast ? "First In / Last Out" : "Check-in/out"}
                      </span>
                    </button>
                  )}
                  <DatePicker value={date} onChange={setDate} />
                </div>
              ) : null
            }

          </div>

          {/* CONTENT */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              border: "1px solid rgba(100 100 100 / 0.1)",
              borderRadius: "0.75rem",
              overflow: "hidden",
              display: "flex",
              flexFlow: "column",
            }}
          >
            {/* Stat Card */}


            {/* Stat Card */}
            {
              tab === "log" ? (
                <div style={{ width: "100%", display: "flex", justifyContent: "space-between", padding: "0.75rem", gap: "0.75rem", }}>

                  <div style={{ display: "flex", flex: 1, background: "rgba(100 100 100/ 0.05)", borderRadius: "0.5rem", padding: "0.5rem", justifyContent: "center", flexFlow: "column", alignItems: "center", height: "6rem" }}>
                    <p style={{ fontSize: "0.8rem", fontWeight: 400, color: "grey" }}>Check Ins</p>
                    <h1 style={{ fontWeight: 600, fontSize: "2rem" }}>{punches.filter((p) => p.punch_type === 0).length}</h1>
                  </div>

                  <div style={{ display: "flex", flex: 1, background: "rgba(100 100 100/ 0.05)", borderRadius: "0.5rem", padding: "0.5rem", justifyContent: "center", flexFlow: "column", alignItems: "center", height: "6rem" }}>
                    <p style={{ fontSize: "0.8rem", fontWeight: 400, color: "grey" }}>Check Outs</p>
                    <h1 style={{ fontWeight: 600, fontSize: "2rem" }}>{punches.filter((p) => p.punch_type === 1).length}</h1>
                  </div>

                  {/* <div style={{ display: "flex", flex: 1, background: "rgba(100 100 100/ 0.05)", borderRadius: "0.5rem", padding: "0.5rem", justifyContent: "center", flexFlow: "column", alignItems: "center" }}>
                    <p style={{ fontSize: "0.8rem", fontWeight: 400, color: "grey" }}>Total</p>
                    <h1 style={{ fontWeight: 600, fontSize: "2rem" }}>{punches.length}</h1>
                  </div> */}
                </div>)
                : null
            }

            {tab === 'summary' ? (
              loading ? (
                <div style={{ margin: "auto" }}>
                  <Loader2 className="animate-spin" />
                </div>
              ) : (
                <EmployeeTable
                  summaries={employeeSummaries}
                  date={date}
                  useFirstLast={useFirstLast}
                  activeCount={activeCount}
                  inactiveCount={inactiveCount}
                  onTotalClick={() => setTab('manage')}
                />
              )
            ) : tab === 'breakdown' ? (
              loading ? (
                <div style={{ margin: "auto" }}>
                  <Loader2 className="animate-spin" />
                </div>
              ) : (
                <DetailedBreakdown summaries={employeeSummaries} date={date} />
              )
            ) : tab === 'log' ? (
              loading ? (
                <div style={{ margin: "auto" }}>
                  <Loader2 className="animate-spin" />
                </div>
              ) : (
                <PunchLog punches={punches} employees={employees} onEmployeeAdded={refetch} />
              )
            ) : tab === 'transfers' ? (
              <TransferRequests embedMode={true} refreshTrigger={refreshTrigger} onLoadingChange={setTabLoading} />
            ) : tab === 'devices' ? (
              <DevicesMaster refreshTrigger={refreshTrigger} onLoadingChange={setTabLoading} />
            ) : tab === 'projects' ? (
              <ProjectsMaster refreshTrigger={refreshTrigger} onLoadingChange={setTabLoading} employeeSummaries={employeeSummaries} />
            ) : tab === 'finalize' ? (() => {
              let permissions: Record<string, boolean> = {};
              try {
                permissions = JSON.parse(userData?.clearance || "{}");
              } catch (e) { }

              let finalizerMode: 'verify' | 'approve' | 'finalize' | 'view' = 'verify';
              if (permissions.timesheet_finalizer === true) {
                finalizerMode = 'finalize';
              } else if (isTimesheetApprover) {
                finalizerMode = 'approve';
              } else if (permissions.timesheet_viewer === true) {
                finalizerMode = 'view';
              } else if (isFocalPoint) {
                finalizerMode = 'verify';
              } else if (userData?.role === 'admin' || userData?.role === 'site_admin') {
                finalizerMode = 'finalize';
              }

              return (
                <TimesheetFinalizer
                  mode={finalizerMode}
                  refreshTrigger={refreshTrigger}
                  onLoadingChange={setTabLoading}
                />
              );
            })() : tab === 'leave-log' ? (
              <LeaveLog refreshTrigger={refreshTrigger} onLoadingChange={setTabLoading} />
            ) : tab === 'terminal' ? (
              <Terminal />
            ) : tab === 'data-management' ? (
              <DataManagement />
            ) : tab === 'add' ? (
              <AddEmployee />
            ) : tab === 'manage' ? (
              <EmployeeManage refreshTrigger={refreshTrigger} onLoadingChange={setTabLoading} />
            ) : tab === 'timesheets' ? (
              <TimesheetViewer />
            ) : (
              <ReportsPage refreshTrigger={refreshTrigger} onLoadingChange={setTabLoading} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
