import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import Directive from "@/components/directive";
import IOMenu from "@/components/editorMenu";
import RefreshButton from "@/components/refresh-button";
import { ResponsiveModal } from "@/components/responsive-modal";
import RoleSelect from "@/components/role-select";
import DefaultDialog from "@/components/ui/default-dialog";
import { message } from "antd";
import { createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { supabase } from "@/lib/supabase";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightLeft,
  BookMarked,
  Car,
  ChevronDown,
  ChevronRight,
  Clock3,
  Eye,
  FileArchive,
  FileText,
  Fingerprint,
  Fuel,
  KeyRound,
  Laptop2,
  Link,
  Loader2,
  LogOut,
  MinusCircle,
  Notebook,
  Package,
  PenLine,
  Plus,
  QrCode,
  ShieldPlus,
  Smartphone,
  Ticket,
  User,
  UserCheck,
  Users as UsersIcon,
  Wallet,
  Search,
} from "lucide-react";
import { useEffect, useRef, useState, useMemo } from "react";
import { toast } from "sonner";

// Constants for localStorage keys
const CACHED_USER_KEY = "cached_user_data";

// Module definitions
const MODULES = [
  { id: 'records_master', name: 'Records Master', icon: FileArchive },
  { id: 'user_management', name: 'Users', icon: UsersIcon },
  { id: 'new_hire', name: 'New Hire', icon: UserCheck },
  { id: 'phonebook', name: 'Phonebook', icon: Notebook },
  { id: 'quick_links', name: 'Links', icon: Link },
  { id: 'qr_generator', name: 'QR Generator', icon: QrCode },
  { id: 'fuel_log', name: 'Fuel Log', icon: Fuel },
  { id: 'passports', name: 'Passports', icon: BookMarked },
  { id: 'asset_master', name: 'Devices', icon: Laptop2 },
  { id: 'projects', name: 'Projects', icon: Package },
  { id: 'attendance', name: 'Attendance', icon: Clock3 },
  { id: 'shift_logs', name: 'Shift Logs', icon: Clock3 },
  { id: 'vehicle_log_book', name: 'Vehicles', icon: Car },
  { id: 'petty_cash', name: 'Petty Cash', icon: Wallet },
  { id: 'offer_letters', name: 'Offer Letters', icon: FileText },
  { id: 'employee_clearance_form', name: 'Employee Clearance', icon: FileText },
  { id: 'transfer_requests', name: 'Transfers', icon: ArrowRightLeft },
  { id: 'sim_cards', name: 'SIM Cards', icon: Smartphone },
  { id: 'offboarding', name: 'Offboarding', icon: LogOut },
  { id: 'manpower_requirements', name: 'Manpower Requirements', icon: UsersIcon },
  { id: 'tickets', name: 'Tickets', icon: Ticket },
  { id: 'document_editor', name: 'Document Editor', icon: FileText },
  { id: 'mobile_punch', name: 'Mobile Punch', icon: Fingerprint },
];

const OFFER_LETTERS_EDIT_KEY = "offer_letters_edit";
const TICKETS_HANDLER_KEY = "tickets_handler";
const ATTENDANCE_EDIT_KEY = "attendance_edit";
const ATTENDANCE_TRANSFERS_KEY = "attendance_transfers";
const ATTENDANCE_BREAKDOWN_KEY = "attendance_breakdown";
const ATTENDANCE_MANAGE_KEY = "attendance_manage";
const ATTENDANCE_REPORTS_KEY = "attendance_reports";
const ATTENDANCE_PROJECTS_KEY = "attendance_projects";
const ATTENDANCE_FINALIZE_KEY = "attendance_finalize";
const ATTENDANCE_LEAVE_LOG_KEY = "attendance_leave_log";
const TIMESHEET_FINALIZER_KEY = "timesheet_finalizer";
const TIMESHEET_VIEWER_KEY = "timesheet_viewer";
const TIMESHEET_SUMMARY_REPORT_KEY = "timesheet_summary_report";

const ATTENDANCE_SUBOPTIONS = [
  { key: ATTENDANCE_EDIT_KEY, label: 'Editing Privileges' },
  { key: ATTENDANCE_TRANSFERS_KEY, label: 'Transfers Page' },
  { key: ATTENDANCE_BREAKDOWN_KEY, label: 'Detailed Breakdown' },
  { key: ATTENDANCE_MANAGE_KEY, label: 'Employee Management' },
  { key: ATTENDANCE_REPORTS_KEY, label: 'Reports Page' },
  { key: ATTENDANCE_PROJECTS_KEY, label: 'Projects Page' },
  { key: ATTENDANCE_LEAVE_LOG_KEY, label: 'Leave Log Page' },
  { key: TIMESHEET_FINALIZER_KEY, label: 'Timesheet Finalizer' },
  { key: TIMESHEET_VIEWER_KEY, label: 'Timesheet Viewer' },
  { key: TIMESHEET_SUMMARY_REPORT_KEY, label: 'Timesheet Summary Report' },  
];

const countEnabledModules = (permissions: Record<string, boolean>) =>
  MODULES.filter((module) => permissions[module.id] === true).length;

const CONTROL_THEME = {
  panelBg: "linear-gradient(145deg, rgba(9, 22, 76, 0.95), rgba(15, 44, 126, 0.9) 45%, rgba(12, 28, 92, 0.96))",
  panelGlow: "0 18px 50px rgba(13, 37, 112, 0.34), inset 0 1px 0 rgba(255,255,255,0.4)",
  accentText: "rgba(214, 230, 255, 0.96)",
  mutedText: "rgba(214, 230, 255, 0.78)",
  actionBg: "linear-gradient(145deg, rgba(15, 5, 130, 0.96), rgba(25, 12, 170, 0.94) 45%, rgba(12, 3, 105, 0.98))",
  actionShadow: "inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -10px 16px rgba(8,30,120,0.45), 0 14px 30px rgba(9,13,75,0.38)",
} as const;

// Shared User Details Content Component
interface UserDetailsContentProps {
  display_name: string;
  display_email: string;
  role: string;
  setRole: (role: string) => void;
  clearance: string;
  setClearance: (clearance: string) => void;
  editor: string;
  setEditor: (editor: string) => void;
  sensitive_data: string;
  setSensitiveData: (data: string) => void;
  loading: boolean;
  onUpdate: () => void;
  onDelete: () => void;
  isMobile: boolean;
  onOpenClearanceDrawer: () => void;
}

const UserDetailsContent: React.FC<UserDetailsContentProps> = ({
  display_name,
  display_email,
  role,
  setRole,
  clearance,

  editor,
  setEditor,
  sensitive_data,
  setSensitiveData,
  loading,
  onUpdate,
  onDelete,

  onOpenClearanceDrawer,
}) => {
  // Parse clearance to count enabled modules
  const getEnabledModulesCount = () => {
    try {
      const modules = JSON.parse(clearance || '{}') as Record<string, boolean>;
      return countEnabledModules(modules);
    } catch {
      return 0;
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", maxHeight: "75vh", width: "100%" }}>
      {/* Fixed Header */}
      <div style={{
        paddingTop: "0rem",
        padding: "1.5rem",
        paddingBottom: "1rem",
        borderBottom: "1px solid rgba(100, 100, 100, 0.1)",
        background: "var(--background)",
        boxSizing: "border-box",
        width: "100%"
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "", gap: "", flexFlow: "column" }}>
            {/* <div style={{
              background: "black",
              padding: "0.75rem",
              borderRadius: "0.75rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <User color="white" width="1.5rem" />
            </div> */}
            <h2 style={{ fontSize: "1.5rem", letterSpacing: "-0.02em", }}>{display_name}</h2>
            <div style={{ fontSize: "0.8rem", marginLeft: "0.25rem" }}>{display_email}</div>
          </div>
          {
            display_email != "it@soharstar.com" &&
            <button
              onClick={onDelete}
              style={{
                fontSize: "0.75rem",
                paddingLeft: "1rem",
                paddingRight: "1rem",
                height: "2rem",
                background: "rgba(220, 38, 38, 0.1)",
                // border: "1px solid rgba(220, 38, 38, 0.3)",
                borderRadius: "0.5rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                color: "crimson"
              }}
            >
              <MinusCircle width={"1rem"} color="crimson" />
              Remove
            </button>
          }

        </div>
      </div>

      {/* Scrollable Content */}
      <div style={{
        flex: 1,
        padding: "1.5rem",
        paddingTop: "1.5rem",
        paddingBottom: "0",
        width: "100%",
        boxSizing: "border-box",
        overflowY: "auto",
        minHeight: 0
      }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%", paddingBottom: "1.5rem" }}>
            {/* <Directive
              notName
              title={display_email}
              noArrow
              icon={<AtSign width={"1.24rem"} color="mediumslateblue" />}
            /> */}
            <Directive
              onClick={onOpenClearanceDrawer}
              title="Module Clearance"
              icon={<Package width="1.25rem" color="mediumslateblue" />}
              id_subtitle={`${getEnabledModulesCount()} modules enabled`}
            />
            <RoleSelect
              value={role.toLowerCase()}
              onChange={(newRole) => {
                setRole(newRole);
              }}
            />

            <IOMenu
              title="Editing"
              placeholder="Clearance"
              icon={<PenLine color="mediumslateblue" width={"1.25rem"} />}
              value={editor == "true" ? "true" : "false"}
              onChange={setEditor}
            />
            <IOMenu
              title="Sensitive Data"
              placeholder="Sensitive Data"
              value={sensitive_data == "true" ? "true" : "false"}
              onChange={setSensitiveData}
              icon={<Eye color="mediumslateblue" width={"1.25rem"} />}
            />
          </div>
        </motion.div>
      </div>

      {/* Fixed Footer with Update Button */}
      <div style={{
        padding: "1rem",
        paddingBottom: "2rem",
        background: "var(--background)",
        boxSizing: "border-box",
        borderTop: "1px solid rgba(100, 100, 100, 0.1)",
        width: "100%"
      }}>
        <motion.button
          type="button"
          disabled={loading}
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.01 }}
          onClick={onUpdate}
          style={{
            width: "100%",
            padding: "1rem",
            borderRadius: "1rem",
            background: loading ? "rgba(100, 100, 100, 0.3)" : "black",
            color: "white",
            fontSize: "1.0625rem",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            fontWeight: "500"
          }}
        >
          {loading ? (
            <Loader2 className="animate-spin" width="1.25rem" />
          ) : (
            <span>Update</span>
          )}
        </motion.button>
      </div>
    </div>
  );
};

// Module Clearance Content Component
interface ModuleClearanceContentProps {
  modulePermissions: Record<string, boolean>;
  onToggleModule: (moduleId: string) => void;
  onSave: () => void;
  showIcon?: boolean;
}

const ModuleClearanceContent: React.FC<ModuleClearanceContentProps> = ({
  modulePermissions,
  onToggleModule,
  onSave,

}) => {
  const [offerLettersOptionsOpen, setOfferLettersOptionsOpen] = useState(false);
  const [ticketOptionsOpen, setTicketOptionsOpen] = useState(false);
  const [attendanceOptionsOpen, setAttendanceOptionsOpen] = useState(false);

  const prevPermissionsRef = useRef(modulePermissions);

  useEffect(() => {
    const prev = prevPermissionsRef.current;

    if (modulePermissions.offer_letters && !prev.offer_letters) {
      setOfferLettersOptionsOpen(true);
    } else if (!modulePermissions.offer_letters && prev.offer_letters) {
      setOfferLettersOptionsOpen(false);
    }

    if (modulePermissions.tickets && !prev.tickets) {
      setTicketOptionsOpen(true);
    } else if (!modulePermissions.tickets && prev.tickets) {
      setTicketOptionsOpen(false);
    }

    if (modulePermissions.attendance && !prev.attendance) {
      setAttendanceOptionsOpen(true);
    } else if (!modulePermissions.attendance && prev.attendance) {
      setAttendanceOptionsOpen(false);
    }

    prevPermissionsRef.current = modulePermissions;
  }, [modulePermissions]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem", justifyContent: "center" }}>

        <h2 style={{ fontSize: "1.25rem", fontWeight: "600" }}>Module Clearance</h2>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "50vh", overflowY: "auto" }}>
        {MODULES.map((module) => {
          const Icon = module.icon;
          const isEnabled = modulePermissions[module.id] || false;
          const isImageIcon = typeof Icon === "string";
          const isOfferLettersModule = module.id === "offer_letters";
          return (
            <div key={module.id} style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <motion.div
                whileTap={{ scale: 0.98 }}
                style={{
                  borderRadius: "0.75rem",
                  background: isEnabled ? "rgba(100, 100, 100, 0.1)" : "rgba(100, 100, 100, 0.05)",
                  transition: "all 0.2s",
                  overflow: "hidden",
                }}
              >
                <div
                  onClick={() => onToggleModule(module.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "1rem",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    {isOfferLettersModule ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isEnabled) return;
                          setOfferLettersOptionsOpen((prev) => !prev);
                        }}
                        style={{
                          width: "1.5rem",
                          height: "1.5rem",
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: isEnabled ? "rgba(15, 23, 42, 0.85)" : "rgba(100, 100, 100, 0.65)",
                          cursor: isEnabled ? "pointer" : "not-allowed",
                        }}
                        title={offerLettersOptionsOpen ? "Collapse Offer Letters" : "Expand Offer Letters"}
                      >
                        {offerLettersOptionsOpen && isEnabled ? (
                          <ChevronDown width="1.05rem" />
                        ) : (
                          <ChevronRight width="1.05rem" />
                        )}
                      </button>
                    ) : module.id === 'attendance' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isEnabled) return;
                          setAttendanceOptionsOpen((prev) => !prev);
                        }}
                        style={{
                          width: "1.5rem",
                          height: "1.5rem",
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: isEnabled ? "rgba(15, 23, 42, 0.85)" : "rgba(100, 100, 100, 0.65)",
                          cursor: isEnabled ? "pointer" : "not-allowed",
                        }}
                        title={attendanceOptionsOpen ? "Collapse Attendance Options" : "Expand Attendance Options"}
                      >
                        {attendanceOptionsOpen && isEnabled ? (
                          <ChevronDown width="1.05rem" />
                        ) : (
                          <ChevronRight width="1.05rem" />
                        )}
                      </button>
                    ) : module.id === 'tickets' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isEnabled) return;
                          setTicketOptionsOpen((prev) => !prev);
                        }}
                        style={{
                          width: "1.5rem",
                          height: "1.5rem",
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: isEnabled ? "rgba(15, 23, 42, 0.85)" : "rgba(100, 100, 100, 0.65)",
                          cursor: isEnabled ? "pointer" : "not-allowed",
                        }}
                        title={ticketOptionsOpen ? "Collapse Ticket Handler" : "Expand Ticket Handler"}
                      >
                        {ticketOptionsOpen && isEnabled ? (
                          <ChevronDown width="1.05rem" />
                        ) : (
                          <ChevronRight width="1.05rem" />
                        )}
                      </button>
                    ) : (
                      <div style={{ width: "1.5rem", height: "1.5rem" }} />
                    )}
                    {isImageIcon ? (
                      <img
                        src={Icon as string}
                        alt={module.name}
                        style={{
                          width: "1.25rem",
                          height: "1.25rem",
                          objectFit: "contain",
                          opacity: isEnabled ? 1 : 0.7,
                        }}
                      />
                    ) : (
                      <Icon width="1.25rem" style={{ color: isEnabled ? "inherit" : "rgba(100, 100, 100, 0.7)" }} />
                    )}
                    <span style={{ fontSize: "1rem", color: isEnabled ? "inherit" : "rgba(100, 100, 100, 0.7)" }}>{module.name}</span>
                  </div>

                  <div
                    style={{
                      width: "2.5rem",
                      height: "1.5rem",
                      borderRadius: "0.75rem",
                      background: isEnabled ? "black" : "rgba(100, 100, 100, 0.2)",
                      position: "relative",
                      transition: "all 0.3s"
                    }}
                  >
                    <div
                      style={{
                        width: "1.25rem",
                        height: "1.25rem",
                        borderRadius: "50%",
                        background: "white",
                        position: "absolute",
                        top: "0.125rem",
                        left: isEnabled ? "1.125rem" : "0.125rem",
                        transition: "all 0.3s"
                      }}
                    />
                  </div>
                </div>

                {isOfferLettersModule && isEnabled && (
                  <AnimatePresence initial={false}>
                    {offerLettersOptionsOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        style={{
                          overflow: "hidden",
                          borderTop: "1px solid rgba(100, 100, 100, 0.14)",
                        }}
                      >
                        <motion.div
                          whileTap={{ scale: 0.98 }}
                          onClick={() => onToggleModule(OFFER_LETTERS_EDIT_KEY)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0.75rem 1rem",
                            margin: "0.45rem",
                            borderRadius: "0.6rem",
                            background: modulePermissions[OFFER_LETTERS_EDIT_KEY]
                              ? "rgba(0, 0, 0, 0.08)"
                              : "rgba(100, 100, 100, 0.05)",
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.9rem",
                              color: modulePermissions[OFFER_LETTERS_EDIT_KEY]
                                ? "inherit"
                                : "rgba(100, 100, 100, 0.8)",
                            }}
                          >
                            Editing Privileges
                          </span>
                          <div
                            style={{
                              width: "2.25rem",
                              height: "1.35rem",
                              borderRadius: "0.7rem",
                              background: modulePermissions[OFFER_LETTERS_EDIT_KEY]
                                ? "black"
                                : "rgba(100, 100, 100, 0.2)",
                              position: "relative",
                              transition: "all 0.3s",
                            }}
                          >
                            <div
                              style={{
                                width: "1.1rem",
                                height: "1.1rem",
                                borderRadius: "50%",
                                background: "white",
                                position: "absolute",
                                top: "0.125rem",
                                left: modulePermissions[OFFER_LETTERS_EDIT_KEY]
                                  ? "1.025rem"
                                  : "0.125rem",
                                transition: "all 0.3s",
                              }}
                            />
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}

                {module.id === 'attendance' && isEnabled && (
                  <AnimatePresence initial={false}>
                    {attendanceOptionsOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        style={{
                          overflow: "hidden",
                          borderTop: "1px solid rgba(100, 100, 100, 0.14)",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        {ATTENDANCE_SUBOPTIONS.map((subopt) => (
                          <motion.div
                            key={subopt.key}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => onToggleModule(subopt.key)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "0.75rem 1rem",
                              margin: "0.45rem",
                              borderRadius: "0.6rem",
                              background: modulePermissions[subopt.key]
                                ? "rgba(0, 0, 0, 0.08)"
                                : "rgba(100, 100, 100, 0.05)",
                              cursor: "pointer",
                              transition: "all 0.2s",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "0.9rem",
                                color: modulePermissions[subopt.key]
                                  ? "inherit"
                                  : "rgba(100, 100, 100, 0.8)",
                              }}
                            >
                              {subopt.label}
                            </span>
                            <div
                              style={{
                                width: "2.25rem",
                                height: "1.35rem",
                                borderRadius: "0.7rem",
                                background: modulePermissions[subopt.key]
                                  ? "black"
                                  : "rgba(100, 100, 100, 0.2)",
                                position: "relative",
                                transition: "all 0.3s",
                              }}
                            >
                              <div
                                style={{
                                  width: "1.1rem",
                                  height: "1.1rem",
                                  borderRadius: "50%",
                                  background: "white",
                                  position: "absolute",
                                  top: "0.125rem",
                                  left: modulePermissions[subopt.key]
                                    ? "1.025rem"
                                    : "0.125rem",
                                  transition: "all 0.3s",
                                }}
                              />
                            </div>
                          </motion.div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}

                {module.id === 'tickets' && isEnabled && (
                  <AnimatePresence initial={false}>
                    {ticketOptionsOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        style={{
                          overflow: "hidden",
                          borderTop: "1px solid rgba(100, 100, 100, 0.14)",
                        }}
                      >
                        <motion.div
                          whileTap={{ scale: 0.98 }}
                          onClick={() => onToggleModule(TICKETS_HANDLER_KEY)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0.75rem 1rem",
                            margin: "0.45rem",
                            borderRadius: "0.6rem",
                            background: modulePermissions[TICKETS_HANDLER_KEY]
                              ? "rgba(0, 0, 0, 0.08)"
                              : "rgba(100, 100, 100, 0.05)",
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.9rem",
                              color: modulePermissions[TICKETS_HANDLER_KEY]
                                ? "inherit"
                                : "rgba(100, 100, 100, 0.8)",
                            }}
                          >
                            Ticket Handler
                          </span>
                          <div
                            style={{
                              width: "2.25rem",
                              height: "1.35rem",
                              borderRadius: "0.7rem",
                              background: modulePermissions[TICKETS_HANDLER_KEY]
                                ? "black"
                                : "rgba(100, 100, 100, 0.2)",
                              position: "relative",
                              transition: "all 0.3s",
                            }}
                          >
                            <div
                              style={{
                                width: "1.1rem",
                                height: "1.1rem",
                                borderRadius: "50%",
                                background: "white",
                                position: "absolute",
                                top: "0.125rem",
                                left: modulePermissions[TICKETS_HANDLER_KEY]
                                  ? "1.025rem"
                                  : "0.125rem",
                                transition: "all 0.3s",
                              }}
                            />
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </motion.div>
            </div>
          );
        })}
      </div>
      <motion.button
        whileTap={{ scale: 0.97 }}
        whileHover={{ scale: 1.01 }}
        onClick={onSave}
        style={{
          width: "100%",
          padding: "1rem",
          borderRadius: "1rem",
          background: "black",
          color: "white",
          fontSize: "1.0625rem",
          border: "none",
          cursor: "pointer",
          marginTop: "0.5rem"
        }}
      >
        Save
      </motion.button>
    </div>
  );
};

export default function Users() {
  const [addUserDialog, setAddUserDialog] = useState(false);
  // Track hovered module id for icon highlight
  const [hoveredModuleId, setHoveredModuleId] = useState<string | null>(null);
  // Toggle for showing module icons
  const [showModuleIcons, setShowModuleIcons] = useState(false);
  const [fetchingData, setfetchingData] = useState(false);
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const query = searchQuery.toLowerCase().trim();
    return users.filter((user: any) => {
      const nameMatch = (user.name || "").toLowerCase().includes(query);
      const emailMatch = (user.email || "").toLowerCase().includes(query);
      return nameMatch || emailMatch;
    });
  }, [users, searchQuery]);
  const [userDialog, setUserDialog] = useState(false);
  const { userData: currentUserData } = useAuth();

  const [refreshCompleted, setRefreshCompleted] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passconfirm, setpassconfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const [display_name, setDisplayName] = useState("");
  const [display_email, setDisplayEmail] = useState("");
  const [docid, setDocid] = useState("");
  const [deleteConfirmDiaog, setDeleteConfirmDialog] = useState(false);
  const [role, setRole] = useState("");
  const [clearance, setClearance] = useState("");
  const [editor, setEditor] = useState("");
  const [sensitive_data, setSensitiveData] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Clearance drawer states
  const [clearanceDrawerOpen, setClearanceDrawerOpen] = useState(false);
  const [modulePermissions, setModulePermissions] = useState<Record<string, boolean>>({});
  const [createUserClearanceDrawerOpen, setCreateUserClearanceDrawerOpen] = useState(false);
  const [createUserModulePermissions, setCreateUserModulePermissions] = useState<Record<string, boolean>>({});

  const auth = getAuth();

  // const privilegedUsersCount = users.filter((user: any) =>
  //   ["admin", "site_admin", "hr"].includes(String(user.role || "").toLowerCase())
  // ).length;

  // Parse module permissions from clearance string
  useEffect(() => {
    try {
      const parsed = JSON.parse(clearance || '{}');
      setModulePermissions(parsed);
    } catch {
      setModulePermissions({});
    }
  }, [clearance]);

  // Toggle module permission
  const toggleModulePermission = (moduleId: string) => {
    setModulePermissions(prev => {
      const nextValue = !prev[moduleId];
      const updated = {
        ...prev,
        [moduleId]: nextValue,
      };

      if (moduleId === "offer_letters" && !nextValue) {
        updated[OFFER_LETTERS_EDIT_KEY] = false;
      }
      if (moduleId === "tickets" && !nextValue) {
        updated[TICKETS_HANDLER_KEY] = false;
      }
      if (moduleId === "attendance" && !nextValue) {
        updated[ATTENDANCE_EDIT_KEY] = false;
        updated[ATTENDANCE_TRANSFERS_KEY] = false;
        updated[ATTENDANCE_BREAKDOWN_KEY] = false;
        updated[ATTENDANCE_MANAGE_KEY] = false;
        updated[ATTENDANCE_REPORTS_KEY] = false;
        updated[ATTENDANCE_PROJECTS_KEY] = false;
        updated[ATTENDANCE_FINALIZE_KEY] = false;
        updated[ATTENDANCE_LEAVE_LOG_KEY] = false;
        updated[TIMESHEET_FINALIZER_KEY] = false;
        updated[TIMESHEET_VIEWER_KEY] = false;
        updated[TIMESHEET_SUMMARY_REPORT_KEY] = false;        
      }

      return updated;
    });
  };

  // Toggle module permission for create user
  const toggleCreateUserModulePermission = (moduleId: string) => {
    setCreateUserModulePermissions(prev => {
      const nextValue = !prev[moduleId];
      const updated = {
        ...prev,
        [moduleId]: nextValue,
      };

      if (moduleId === "offer_letters" && !nextValue) {
        updated[OFFER_LETTERS_EDIT_KEY] = false;
      }
      if (moduleId === "tickets" && !nextValue) {
        updated[TICKETS_HANDLER_KEY] = false;
      }
      if (moduleId === "attendance" && !nextValue) {
        updated[ATTENDANCE_EDIT_KEY] = false;
        updated[ATTENDANCE_TRANSFERS_KEY] = false;
        updated[ATTENDANCE_BREAKDOWN_KEY] = false;
        updated[ATTENDANCE_MANAGE_KEY] = false;
        updated[ATTENDANCE_REPORTS_KEY] = false;
        updated[ATTENDANCE_PROJECTS_KEY] = false;
        updated[ATTENDANCE_FINALIZE_KEY] = false;
        updated[ATTENDANCE_LEAVE_LOG_KEY] = false;
        updated[TIMESHEET_FINALIZER_KEY] = false;
        updated[TIMESHEET_VIEWER_KEY] = false;
        updated[TIMESHEET_SUMMARY_REPORT_KEY] = false;        
      }

      return updated;
    });
  };

  // Save module permissions to clearance
  const saveClearance = () => {
    setClearance(JSON.stringify(modulePermissions));
    setClearanceDrawerOpen(false);
  };

  // Handle add user dialog close and reset form
  const handleAddUserDialogChange = (open: boolean) => {
    setAddUserDialog(open);
    if (!open) {
      // Reset form fields when dialog closes
      setName("");
      setEmail("");
      setPassword("");
      setpassconfirm("");
      setCreateUserModulePermissions({});
    }
  };

  // Detect mobile/desktop
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Use refreshCurrentUserData from AuthProvider context


  const updateLocalCache = async (email: string, updatedData: any) => {
    try {
      // Only update cache if the updated user is the current logged-in user
      if (currentUserData?.email === email) {
        const cachedUser = localStorage.getItem(CACHED_USER_KEY);
        if (cachedUser) {
          const parsedUser = JSON.parse(cachedUser);
          const updatedUser = { ...parsedUser, ...updatedData };
          localStorage.setItem(CACHED_USER_KEY, JSON.stringify(updatedUser));


        }
      }
    } catch (error) {
      console.error("Error updating local cache:", error);
    }
  };

  const createUser = async () => {
    try {
      setLoading(true);

      const { data: recordsSnapshot, error: recordsError } = await supabase
        .from("employees")
        .select("*")
        .eq("email", email.trim());

      if (recordsError || !recordsSnapshot || recordsSnapshot.length === 0) {
        setLoading(false);
        message.error("Cannot create user. Record Master entry is required first.");
        return;
      }

      const recordData = recordsSnapshot[0];
      await createUserWithEmailAndPassword(auth, email, password);
      await supabase.from("users").insert({
        name: recordData.name || name,
        email: email.trim(),
        role: "profile",  // system access role
        designation: recordData.designation || "",  // job title
        clearance: JSON.stringify(createUserModulePermissions),
        editor: "false",
        sensitive_data: "false",
      });
      message.success("User created");
      setLoading(false);
      setAddUserDialog(false);
      setCreateUserModulePermissions({});
      // Reset create user form fields
      setName("");
      setEmail("");
      setPassword("");
      setpassconfirm("");
      fetchUsers();
    } catch (error) {
      setLoading(false);
      message.error(String(error));
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const deleteUser = async () => {
    setLoading(true);
    await supabase.from("users").delete().eq("id", docid);
    fetchUsers();
    setLoading(false);
    setDeleteConfirmDialog(false);
    setUserDialog(false);
  };

  const fetchUsers = async () => {
    setfetchingData(true);
    const { data: querySnapshot, error } = await supabase
      .from("users")
      .select("*");

    if (error) {
      console.error(error);
      setfetchingData(false);
      return;
    }

    const fetchedData: any = querySnapshot || [];

    // Sort users by last active time descending, putting inactive users at the end
    fetchedData.sort((a: any, b: any) => {
      const timeA = a.last_active ? new Date(a.last_active).getTime() : 0;
      const timeB = b.last_active ? new Date(b.last_active).getTime() : 0;
      return timeB - timeA;
    });
    setfetchingData(false);
    setUsers(fetchedData);
    setRefreshCompleted(true);
    setTimeout(() => {
      setRefreshCompleted(false);
    }, 1000);
  };

  const updateUser = async () => {
    try {
      setLoading(true);
      const { data: recordsSnapshot, error: recordsError } = await supabase
        .from("employees")
        .select("*")
        .eq("email", display_email.trim());

      if (recordsError || !recordsSnapshot || recordsSnapshot.length === 0) {
        setLoading(false);
        message.error("Cannot update user. Record Master entry is required.");
        return;
      }

      const recordId = recordsSnapshot[0].id;
      const updatedData: Record<string, any> = {
        role: role || "profile",  // system access role
        clearance: clearance || "{}",
        editor: editor || "false",
        sensitive_data: sensitive_data || "false",
      };

      // Filter out any undefined values to prevent Firestore errors
      const filteredData = Object.entries(updatedData).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, any>);

      // Update both the user doc and the corresponding record with the role
      await supabase.from("users").update(filteredData).eq("id", docid);
      await supabase.from("employees").update({ role: filteredData.role }).eq("id", recordId);

      // Update local cache if the updated user is the current user
      await updateLocalCache(display_email, filteredData);

      setLoading(false);
      setUserDialog(false);
      message.success("Updated User");
      fetchUsers();
    } catch (error) {
      setLoading(false);
      console.error("Error updating user:", error);
      message.error(String(error));
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at 12% -8%, rgba(35, 84, 220, 0.26), rgba(255,255,255,0) 42%), radial-gradient(circle at 86% 8%, rgba(42, 110, 255, 0.2), rgba(255,255,255,0) 40%), var(--background)",
      }}
    >
      <style>{`
        .search-input-field::placeholder {
          color: rgba(255, 255, 255, 0.5) !important;
        }
      `}</style>
      <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>
        <Back
          blurBG
          fixed
          title="Users"
          extra={
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <RefreshButton
                fetchingData={fetchingData}
                onClick={fetchUsers}
                refreshCompleted={refreshCompleted}
              />
            </div>
          }
        />

        <br />

        <div
          style={{
            top: "5rem",
            left: "1.25rem",
            right: "1.25rem",
            borderRadius: "1.1rem",
            overflow: "hidden",
            background: CONTROL_THEME.panelBg,
            position: "fixed",
            zIndex: 18,
            WebkitBackdropFilter: "blur(12px)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(160deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.06) 38%, rgba(255,255,255,0) 100%)",
              pointerEvents: "none"
            }}
          />
          <div style={{ position: "relative", padding: "1rem 1.5rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "0.9rem",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <span style={{ fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: CONTROL_THEME.mutedText }}>
                  Access Control Module
                </span>
                <h2 style={{ fontSize: isMobile ? "1.34rem" : "1.34rem", fontWeight: 500, color: "white", lineHeight: 1.2, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>User Clearance</span>
                  <span style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    background: "rgba(255, 255, 255, 0.15)",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "0.5rem",
                    color: CONTROL_THEME.accentText
                  }}>
                    {searchQuery.trim() ? `${filteredUsers.length} of ${users.length}` : users.length} users
                  </span>
                </h2>
              </div>
              <div style={{ display: "flex", gap: "0.7rem", alignItems: "center" }}>
                <label style={{ color: CONTROL_THEME.accentText, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", userSelect: "none" }}>
                  {/* <input
                    type="checkbox"
                    checked={showModuleIcons}
                    onChange={e => setShowModuleIcons(e.target.checked)}
                    style={{ accentColor: "#1e40af", width: "1.1rem", height: "1.1rem", marginRight: "0.3rem" }}
                  /> */}
                  <KeyRound style={{ scale: "0.8" }} onClick={() => setShowModuleIcons(!showModuleIcons)} />
                </label>
              </div>
            </div>

            {/* Search Input Row */}
            <div style={{ marginTop: "0.8rem", position: "relative", display: "flex", alignItems: "center" }}>
              <Search
                style={{
                  position: "absolute",
                  left: "0.75rem",
                  width: "1rem",
                  height: "1rem",
                  color: CONTROL_THEME.mutedText,
                  pointerEvents: "none"
                }}
              />
              <input
                className="search-input-field"
                type="text"
                placeholder="Search users by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.55rem 1rem 0.55rem 2.2rem",
                  borderRadius: "0.6rem",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(255, 255, 255, 0.08)",
                  color: "white",
                  fontSize: "0.85rem",
                  outline: "none",
                  transition: "border-color 0.2s, background-color 0.2s",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "rgba(255, 255, 255, 0.35)";
                  e.target.style.backgroundColor = "rgba(255, 255, 255, 0.12)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(255, 255, 255, 0.15)";
                  e.target.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
                }}
              />
            </div>
          </div>
        </div>

        {fetchingData && users.length < 1 ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              border: "",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100svh",

            }}
          >
            <Loader2 className="animate-spin" style={{ color: "darkblue", scale: "1.5" }} />
          </div>
        ) : (
          <div
            className=""

            style={{
              display: isMobile ? "flex" : "grid",
              flexFlow: isMobile ? "column" : undefined,
              gridTemplateColumns: isMobile ? undefined : "repeat(4, 1fr)",
              gap: "0.75rem",
              border: "",
              height: "",
              overflowY: "auto",
              padding: "1.25rem",
              paddingTop: isMobile ? "13.2rem" : "14rem",
              paddingBottom: "7rem"
            }}
          >
            {filteredUsers.length === 0 && searchQuery.trim() && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "4rem 2rem",
                  color: "rgba(17, 24, 39, 0.6)",
                  textAlign: "center",
                  width: "100%",
                }}
              >
                <Search style={{ width: "2rem", height: "2rem", opacity: 0.5, marginBottom: "1rem" }} />
                <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>No users found matching "{searchQuery}"</span>
              </div>
            )}
            {filteredUsers.map((user: any) => {
              // Parse clearance for this user
              let userModulePermissions: Record<string, boolean> = {};
              try {
                userModulePermissions = JSON.parse(user.clearance || '{}');
              } catch { }
              return (

                <div key={user.id} style={{ display: "flex", flexDirection: "column", height: "100%", border: "" }}>
                  <div style={{ display: "flex", flexDirection: "column", border: "", height: "fit-content" }}>

                    <Directive
                      height="fit-content"
                      onClick={() => {
                        // Restrict viewing of special developer account to the developer only
                        if (user.email === "it@soharstar.com" && currentUserData?.email !== "it@soharstar.com") {
                          toast.error("Action blocked");
                          return;
                        }
                        setDocid(user.id);
                        setUserDialog(true);
                        setDisplayName(user.name || "");
                        setDisplayEmail(user.email || "");
                        setRole(user.role || "profile");
                        setClearance(user.clearance || "{}");
                        setEditor(user.editor || "false");
                        setSensitiveData(user.sensitive_data || "false");
                      }}
                      icon={
                        user.role == "admin" || user.role == "site_admin" ? (
                          <Eye width={"1.25rem"} color="darkblue" />
                        ) : user.role == "hr" ? (
                          <ShieldPlus width={"1.25rem"} color="darkblue" />
                        ) : (
                          <User width={"1.25rem"} color="darkblue" />
                        )
                      }
                      title={user.name}
                      // tag={user.email=="it@soharstar.com"?"Developer":""}
                      status={true}
                      id_subtitle={user.email}
                      subtext={
                        user.last_active
                          ? (() => {
                            const d = new Date(user.last_active);
                            const now = new Date();
                            const diffMs = now.getTime() - d.getTime();
                            const diffMins = Math.floor(diffMs / 60000);
                            const diffHours = Math.floor(diffMins / 60);
                            const diffDays = Math.floor(diffHours / 24);
                            if (diffMins < 1) return "Active just now";
                            if (diffMins < 60) return `Active ${diffMins}m ago`;
                            if (diffHours < 24) return `Active ${diffHours}h ago`;
                            if (diffDays < 30) return `Active ${diffDays}d ago`;
                            return `Last active ${d.toLocaleDateString()}`;
                          })()
                          : "No Activity Yet"
                      }
                    />
                  </div>
                  {showModuleIcons && (
                    <div style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.4rem",
                      justifyContent: "flex-start",
                      alignItems: "center",
                      padding: "0.2rem 0.5rem",
                      background: "rgba(246 248 252 / 0.68)",
                      borderRadius: "0.5rem",
                      marginTop: "0.25rem",

                    }}>
                      {MODULES.filter(m => userModulePermissions[m.id]).map((m) => {
                        const Icon = m.icon;
                        const isImageIcon = typeof Icon === "string";
                        const isHighlighted = hoveredModuleId === m.id;
                        return (
                          <span
                            key={m.id}
                            title={m.name}
                            style={{
                              borderRadius: "0.5rem",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.1rem",
                              fontSize: "0.8rem",
                              color: isHighlighted ? "darkblue" : "darkslategrey",
                              // background: isHighlighted ? "rgba(30,144,255,0.13)" : undefined,
                              cursor: "pointer",
                              transition: "color 0.15s, background 0.15s",
                              height: "1.25rem"
                            }}
                            onMouseEnter={() => setHoveredModuleId(m.id)}
                            onMouseLeave={() => setHoveredModuleId(null)}
                          >
                            {isImageIcon ? (
                              <img src={Icon as string} alt={m.name} style={{ width: "1.1rem", height: "1.1rem", objectFit: "contain", marginRight: "0.2rem", filter: isHighlighted ? "drop-shadow(0 0 2px dodgerblue)" : undefined }} />
                            ) : (
                              <Icon width="1.1rem" style={{ scale: "0.65", color: isHighlighted ? "red" : undefined }} />
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* User Details - Responsive Modal */}
      <ResponsiveModal
        open={userDialog}
        onOpenChange={setUserDialog}
        title=""
        description=""
        hideHeader={true}
      >
        <UserDetailsContent
          display_name={display_name}
          display_email={display_email}
          role={role}
          setRole={setRole}
          clearance={clearance}
          setClearance={setClearance}
          editor={editor}
          setEditor={setEditor}
          sensitive_data={sensitive_data}
          setSensitiveData={setSensitiveData}
          loading={loading}
          onUpdate={updateUser}
          onDelete={() => setDeleteConfirmDialog(true)}
          isMobile={isMobile}
          onOpenClearanceDrawer={() => setClearanceDrawerOpen(true)}
        />
      </ResponsiveModal>

      <DefaultDialog
        destructive
        open={deleteConfirmDiaog}
        onCancel={() => setDeleteConfirmDialog(false)}
        title={"Delete User?"}
        OkButtonText="Delete"
        onOk={deleteUser}
        updating={loading}
        disabled={loading}
      />

      {/* Clearance Drawer for Editing User - Responsive Modal */}
      <ResponsiveModal
        open={clearanceDrawerOpen}
        onOpenChange={setClearanceDrawerOpen}
        title=""
        description=""
        hideHeader={true}
        contentStyle={isMobile ? { padding: "1rem" } : { padding: "1.5rem" }}
      >
        <div style={{ width: "100%", boxSizing: "border-box" }}>
          <ModuleClearanceContent
            modulePermissions={modulePermissions}
            onToggleModule={toggleModulePermission}
            onSave={saveClearance}
            showIcon={true}
          />
        </div>
      </ResponsiveModal>

      {/* Create User Dialog - Responsive Modal */}
      <ResponsiveModal
        open={addUserDialog}
        onOpenChange={handleAddUserDialogChange}
        title=""
        description=""
        hideHeader={true}
      >
        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", width: "100%", boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem", justifyContent: "center" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "600" }}>Add User</h2>
          </div>
          <input
            placeholder="Enter Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              borderRadius: "0.5rem",
              backgroundColor: "rgba(100, 100, 100, 0.05)",
              border: "1px solid rgba(100, 100, 100, 0.1)",
              padding: "0.875rem 1rem",
              color: "inherit",
              fontSize: "1rem"
            }}
          />
          <input
            placeholder="Enter Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            style={{
              borderRadius: "0.5rem",
              backgroundColor: "rgba(100, 100, 100, 0.05)",
              border: "1px solid rgba(100, 100, 100, 0.1)",
              padding: "0.875rem 1rem",
              color: "inherit",
              fontSize: "1rem"
            }}
          />
          <input
            placeholder="Enter Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            style={{
              borderRadius: "0.5rem",
              backgroundColor: "rgba(100, 100, 100, 0.05)",
              border: "1px solid rgba(100, 100, 100, 0.1)",
              padding: "0.875rem 1rem",
              color: "inherit",
              fontSize: "1rem"
            }}
          />
          <input
            placeholder="Confirm Password"
            type="password"
            value={passconfirm}
            onChange={(e) => setpassconfirm(e.target.value)}
            autoComplete="new-password"
            style={{
              borderRadius: "0.5rem",
              backgroundColor: "rgba(100, 100, 100, 0.05)",
              border: "1px solid rgba(100, 100, 100, 0.1)",
              padding: "0.875rem 1rem",
              color: "inherit",
              fontSize: "1rem"
            }}
          />
          <Directive
            onClick={() => setCreateUserClearanceDrawerOpen(true)}
            title="Module Clearance"
            icon={<KeyRound width="1.25rem" color="mediumslateblue" />}
            id_subtitle={`${countEnabledModules(createUserModulePermissions)} modules enabled`}
          />
          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.01 }}
            onClick={createUser}
            disabled={!name || !email || !passconfirm || password !== passconfirm || loading}
            style={{
              width: "100%",
              padding: "1rem",
              borderRadius: "1rem",
              background: (!name || !email || !passconfirm || password !== passconfirm || loading) ? "rgba(100, 100, 100, 0.3)" : "black",
              color: "white",
              fontSize: "1.0625rem",
              border: "none",
              cursor: (!name || !email || !passconfirm || password !== passconfirm || loading) ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              marginTop: "0.5rem"
            }}
          >
            {loading ? <Loader2 className="animate-spin" width="1.25rem" /> : <span>Add</span>}
          </motion.button>
        </div>
      </ResponsiveModal>

      {/* Clearance Drawer for Create User - Responsive Modal */}
      <ResponsiveModal
        open={createUserClearanceDrawerOpen}
        onOpenChange={setCreateUserClearanceDrawerOpen}
        title=""
        description=""
        hideHeader={true}
        contentStyle={isMobile ? { padding: "0.75rem" } : undefined}
      >
        <div style={{ padding: "0.25rem", width: "100%", boxSizing: "border-box" }}>
          <ModuleClearanceContent
            modulePermissions={createUserModulePermissions}
            onToggleModule={toggleCreateUserModulePermission}
            onSave={() => setCreateUserClearanceDrawerOpen(false)}
            showIcon={true}
          />
        </div>
      </ResponsiveModal>

      {/* Floating Add User Button */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.05 }}
        onClick={() => setAddUserDialog(true)}
        style={{
          position: "fixed",
          bottom: "2rem",
          right: "2rem",
          width: "3.5rem",
          height: "3.5rem",
          borderRadius: "0.9rem",
          background: CONTROL_THEME.actionBg,
          boxShadow: CONTROL_THEME.actionShadow,
          color: "white",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",


        }}
      >
        <Plus width="1.5rem" />
      </motion.button>
    </div>
  );
}
