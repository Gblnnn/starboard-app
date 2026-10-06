import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import BackgroundProcessDropdown from "@/components/background-process-dropdown";
import GridTile from "@/components/grid-tile";
import IndexDropDown from "@/components/index-dropdown";
import InputDialog from "@/components/input-dialog";
import DefaultDialog from "@/components/ui/default-dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useBackgroundProcess } from "@/context/BackgroundProcessContext";
import { auth, db } from "@/firebase";
import { fetchAndCacheFuelLogs } from "@/utils/fuelLogsCache";
import { getPendingFuelLogsCount, syncAllPendingFuelLogs } from "@/utils/offlineFuelLogs";
import { LoadingOutlined } from "@ant-design/icons";
import emailjs from "@emailjs/browser";
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { motion } from "framer-motion";
import {
  ArrowRightLeft,
  BookMarked,
  Bug,
  Car,
  Clock3,
  Clock3Icon,
  File,
  FileArchive,
  FileText,
  Laptop2,
  KeyRound,
  Link,
  LogOut,
  Mail,
  Package,
  QrCode,
  Smartphone,
  Ticket,
  UserCheck,
  Users,
  Wallet
} from "lucide-react";
import moment from "moment";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function Index() {
  const [requestDialog, setRequestDialog] = useState(false);
  const [bugDialog, setBugDialog] = useState(false);
  const [loginPrompt, setLoginPrompt] = useState(false);
  const [valeLoginPrompt, setValeLoginPrompt] = useState(false);
  const [logoutPrompt, setLogoutPrompt] = useState(false);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const navigate = useNavigate();
  const [issue, setIssue] = useState("");
  const [loading, setLoading] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [modulePermissions, setModulePermissions] = useState<Record<string, boolean>>({});
  const { userData, logoutUser: logOut } = useAuth();
  const { addProcess, updateProcess } = useBackgroundProcess();
  const [openTicketsCount, setOpenTicketsCount] = useState<number | null>(null);

  const hasTicketHandler = (() => {
    try {
      const c = userData?.clearance || '{}';
      const parsed = typeof c === 'string' ? JSON.parse(c) : c;
      return !!parsed?.tickets_handler;
    } catch (e) { return false; }
  })();

  useEffect(() => {
    // listen for open tickets count
    try {
      const q = query(collection(db, 'tickets'), where('status', '==', 'open'));
      const unsub = onSnapshot(q, (snap) => {
        setOpenTicketsCount(snap.size);
      }, (err) => { console.error(err); });
      return () => unsub();
    } catch (e) { /* ignore */ }
  }, []);

  const serviceId = "service_fixajl8";
  const templateId = "template_0f3zy3e";

  const sendBugReport = async () => {
    setLoading(true);
    await emailjs.send(serviceId, templateId, {
      name: auth.currentUser?.email,
      subject:
        "Bug Report - " +
        moment().format("ll") +
        " from " +
        auth.currentUser?.email,
      recipient: "it@soharstar.com",
      message: issue,
    });
    setLoading(false);
    toast.success("Bug Report sent");
    setBugDialog(false);
  };

  useEffect(() => {
    if (userData) {
      // Parse module permissions from clearance JSON
      try {
        const permissions = JSON.parse(userData.clearance || '{}');
        setModulePermissions(permissions);
      } catch {
        // Fallback for old clearance system

        setModulePermissions({});
      }
      setAdmin(userData.role === "admin" || userData.role === "site_admin");

      if (userData.role === "profile") {
        navigate("/profile");
      }
    }
  }, [userData, navigate]);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Determine grid columns based on screen size
  const getGridColumns = () => {
    if (screenWidth < 768) return "1fr";
    if (screenWidth < 1200) return "repeat(2, minmax(0, 1fr))";
    return "repeat(4, minmax(0, 1fr))";
  };

  // Sync pending fuel logs on app launch
  useEffect(() => {
    const syncPendingLogs = async () => {
      if (!navigator.onLine) return;

      const count = getPendingFuelLogsCount();
      if (count === 0) return;

      const processId = `sync_fuel_logs_${Date.now()}`;
      addProcess(processId, `Syncing ${count} fuel log${count > 1 ? 's' : ''}`);
      updateProcess(processId, { status: "in-progress", message: "Uploading to cloud..." });

      try {
        const result = await syncAllPendingFuelLogs((current, total) => {
          const progress = Math.round((current / total) * 100);
          updateProcess(processId, {
            progress,
            message: `Uploaded ${current} of ${total}...`
          });
        });

        // If sync was skipped (already in progress), silently complete
        if (result.skipped) {
          updateProcess(processId, {
            status: "completed",
            message: "Sync already running"
          });
          return;
        }

        if (result.success > 0) {
          updateProcess(processId, {
            status: "completed",
            message: `${result.success} fuel log${result.success > 1 ? 's' : ''} synced successfully`
          });
        }

        if (result.failed > 0) {
          updateProcess(processId, {
            status: "error",
            message: `${result.failed} fuel log${result.failed > 1 ? 's' : ''} failed to sync`
          });
        }
      } catch (error) {
        console.error("Error syncing fuel logs:", error);
        updateProcess(processId, { status: "error", message: "Sync failed" });
      }
    };

    syncPendingLogs();
  }, [addProcess, updateProcess]);

  // Cache fuel logs on app launch
  useEffect(() => {
    const cacheFuelLogs = async () => {
      if (!navigator.onLine || !userData?.email) return;

      try {
        console.log("🔄 Caching fuel logs on app launch...");
        await fetchAndCacheFuelLogs(userData.email);
        console.log("✅ Fuel logs cached successfully");
      } catch (error) {
        console.error("Error caching fuel logs on app launch:", error);
      }
    };

    cacheFuelLogs();
  }, [userData?.email]);



  // Helper function to check module access
  const hasModuleAccess = (moduleId: string) => {
    return modulePermissions[moduleId] === true;
  };

  // Check if user has any modules allocated
  const hasAnyModules = () => {
    const hasRecordsMaster = hasModuleAccess('records_master');
    const hasUsers = admin || hasModuleAccess('user_management');
    const hasNewHire = hasModuleAccess('new_hire');
    const hasQuickLinks = hasModuleAccess('quick_links');
    const hasQRGenerator = hasModuleAccess('qr_generator');
    const hasVehicleMaster = hasModuleAccess('asset_master');
    const hasVehicleLogBook = hasModuleAccess('vehicle_log_book');
    const hasAttendance = hasModuleAccess('attendance');
    const hasPettyCash = hasModuleAccess('petty_cash');
    const hasOfferLetters = hasModuleAccess('offer_letters');
    const hasTickets = admin || hasModuleAccess('tickets') || hasTicketHandler;
    const hasEmployeeClearanceForm = hasModuleAccess('employee_clearance_form');
    const hasShiftLogs = hasModuleAccess('shift_logs');
    const hasTransferRequests = hasModuleAccess('transfer_requests');
    const hasSimCards = hasModuleAccess('sim_cards');
    const hasOffboarding = hasModuleAccess('offboarding');
    const hasDocumentEditor = hasModuleAccess('document_editor');
    const hasShiftManagement = admin || hasModuleAccess('shift_management') || Boolean(userData?.emp_id);

    return hasRecordsMaster || hasUsers || hasNewHire || hasQuickLinks ||
      hasQRGenerator || hasVehicleMaster || hasVehicleLogBook || hasAttendance ||
      hasPettyCash || hasOfferLetters || hasEmployeeClearanceForm || hasShiftLogs ||
      hasTransferRequests || hasSimCards || hasOffboarding || hasTickets || hasDocumentEditor || hasShiftManagement;
  };

  const hasTickets = admin || hasModuleAccess('tickets') || hasTicketHandler;
  const hasShiftManagement = admin || hasModuleAccess('shift_management') || Boolean(userData?.emp_id);

  // const getAccessibleModuleCount = () => {
  //   let count = 0;
  //   if (hasModuleAccess("records_master")) count++;
  //   if (admin && (!userData || userData.role !== "user")) count++;
  //   if (hasModuleAccess("new_hire")) count++;
  //   if (hasModuleAccess("quick_links")) count++;
  //   if (hasModuleAccess("qr_generator")) count++;
  //   if (hasModuleAccess("projects")) count++;
  //   if (hasModuleAccess("asset_master")) count++;
  //   if (hasModuleAccess("vehicle_log_book")) count++;
  //   if (hasModuleAccess("timetaag")) count++;
  //   if (hasModuleAccess("passports")) count++;
  //   if (hasModuleAccess("petty_cash")) count++;
  //   if (hasModuleAccess("offer_letters")) count++;
  //   if (hasModuleAccess("shift_logs")) count++;
  //   if (hasModuleAccess("transfer_requests")) count++;
  //   return count;
  // };

  // Authenticate for specific module
  const authenticateModule = (moduleId: string, path: string, moduleName: string) => {
    if (hasModuleAccess(moduleId)) {
      navigate(path);
    } else {
      toast.error(`No clearance to access ${moduleName}`);
    }
  };

  const handleLogout = async () => {
    try {
      setLogoutPrompt(false);
      await logOut();
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Failed to logout. Please try again.");
    }
  };

  return (
    <>
      {/* <div style={{border:"", display:"flex", alignItems:"center", justifyContent:'center'}}>
        <ConfettiExplosion/>
        </div> */}

      <Back
        //  fontFamily="'Britney', cursive"
        //  fontSize="1.5rem"
        blurBG
        fixed
        editMode={userData?.editor === true ? true : false}
        title="Starboard"
        subtitle={"1.99"}

        icon={<img src="/stardox-bg.png" style={{ width: "2rem" }} alt="Starboard" />}
        noback
        extra={
          <div
            style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
          >
            {/* <button
                  onClick={() => window.location.reload()}
                  style={{
                    paddingLeft: "1rem",
                    paddingRight: "1rem",
                    fontSize: "0.75rem",
                    opacity: "0.75",
                  }}
                >
                  <RefreshCcw width={"1rem"} color="mediumslateblue" />
                  <p style={{ opacity: 0.5, letterSpacing: "0.15rem" }}>
                    v1.18
                  </p>
                </button> */}

            {/* <button onClick={()=>usenavigate("/inbox")} style={{ width:"3rem", background:"rgba(220 20 60/ 20%)"}}>
                            <Inbox className="" color="crimson"/>
                        </button> */}

            {/* <button
                  onClick={() => {
                    setLogoutPrompt(true);
                  }}
                  style={{ width: "3rem" }}
                >
                  <LogOut width={"1rem"} color="lightcoral" />
                </button> */}

            {/* {admin && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                  >
                    <button
                      onClick={() => navigate("/admin")}
                      style={{
                        fontSize: "0.75rem",
                        paddingLeft: "1rem",
                        paddingRight: "1rem",
                        height: "2.5rem",
                        width: "3rem",
                      }}
                    >
                      {loading ? (
                        <LoadingOutlined color="mediumslateblue" />
                      ) : (
                        <KeyRound color="mediumslateblue" width={"1rem"} />
                      )}
                    </button>
                  </motion.div>
                )
                
                } */}

            <BackgroundProcessDropdown />

            <IndexDropDown
              onLogout={() => setLogoutPrompt(true)}
              onProfile={() => { }}
            />
          </div>
        }
      />
      {/* {newVersionAvailable && (
        <div style={{ position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 99999 }}>
          <div style={{ background: '', border: '', padding: '0.5rem 1rem', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center', boxShadow: '0 6px 20px rgba(0,0,0,0.08)' }}>
            <div style={{ fontWeight: 600, marginRight: 8 }}>New version available</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => applyUpdate()} style={{ padding: '0.4rem 0.8rem', background: '#0b76ef', color: 'white', border: 'none', borderRadius: 6 }}>Update</button>
              <button onClick={() => setNewVersionAvailable(false)} style={{ padding: '0.4rem 0.8rem', background: 'transparent', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6 }}>Dismiss</button>
            </div>
          </div>
        </div>
      )} */}
      <div
        style={{
          padding: "1.25rem",
          height: "100svh",
          paddingTop: "5.75rem",
          paddingBottom: "7.5rem",
          overflowY: "auto",
          // background:"url('/bg.webp')",
          // backgroundSize:"cover"
          // background:
          //   "linear-gradient(180deg, rgba(252, 252, 252, 1), rgba(244, 246, 249, 1))",
        }}
      >
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ paddingBottom: "2rem" }}>
          {/* <div
            style={{
              borderRadius: "1rem",
              padding: "1rem",
              marginBottom: "1rem",
              border: "1px solid rgba(22, 28, 36, 0.12)",
              background:
                "linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(242, 247, 245, 0.96))",
              boxShadow: "0 12px 20px rgba(15, 23, 42, 0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
                marginBottom: "0.75rem",
              }}
            >
              <p style={{ fontSize: "0.72rem", opacity: 0.65, letterSpacing: "0.14rem", textTransform: "uppercase", fontWeight: 700 }}>
                Operations Board
              </p>
              <div
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "0.28rem 0.6rem",
                  borderRadius: "999px",
                  background: "rgba(0, 120, 90, 0.14)",
                  color: "rgb(0, 98, 74)",
                }}
              >
                {getAccessibleModuleCount()} ACTIVE
              </div>
            </div>
            <p style={{ fontSize: "1.28rem", fontWeight: 700, marginTop: "0.1rem", marginBottom: "0.35rem", lineHeight: 1.15 }}>
              {userData?.name || userData?.email?.split("@")[0] || "User"}
            </p>
            <p style={{ fontSize: "0.82rem", opacity: 0.72, marginBottom: "0.75rem" }}>
              Use shortcuts below to report issues or request a feature.
            </p>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <button
                onClick={() => setRequestDialog(true)}
                style={{
                  border: "1px solid rgba(0, 98, 74, 0.2)",
                  borderRadius: "0.7rem",
                  padding: "0.55rem 0.85rem",
                  fontSize: "0.8rem",
                  background: "rgba(0, 128, 128, 0.1)",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Request Feature
              </button>
              <button
                onClick={() => setBugDialog(true)}
                style={{
                  border: "1px solid rgba(153, 27, 27, 0.2)",
                  borderRadius: "0.7rem",
                  padding: "0.55rem 0.85rem",
                  fontSize: "0.8rem",
                  background: "rgba(220, 20, 60, 0.09)",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Report Bug
              </button>
            </div>
          </div> */}

          {loading ? (
            <div
              style={{
                border: "",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "75svh",
              }}
            >
              <LoadingOutlined style={{ color: "mediumslateblue", scale: "2" }} />
            </div>
          ) : (
            hasAnyModules() ? (
              <>
                <div style={{ marginBottom: "0.65rem", paddingTop: "0.15rem" }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.82rem",
                      letterSpacing: "0.12rem",
                      textTransform: "uppercase",
                      opacity: 0.72,
                      fontWeight: 600,
                      marginLeft: "0.75rem"
                    }}
                  >
                    Modules
                  </p>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: getGridColumns(),
                    columnGap: "0.6rem",
                    rowGap: "0.6rem",
                    paddingBottom: "1rem",
                    paddingTop: "0.5rem"
                  }}
                >
                  {hasModuleAccess('records_master') && (
                    <GridTile
                      title="Records"
                      description="Employee records and profile updates"
                      icon={<FileArchive width="2.5rem" />}
                      onClick={() => navigate('/records')}
                    />
                  )}

                  {(admin || hasModuleAccess('user_management')) && (
                    <GridTile
                      title="Users"
                      description="Roles, clearances and access controls"
                      icon={<Users width="2.5rem" />}
                      onClick={() => navigate('/users')}
                    />
                  )}

                  {hasModuleAccess('new_hire') && (
                    <GridTile
                      title="New Hire"
                      description="Onboarding and new joiner workflow"
                      icon={<UserCheck width="2.5rem" />}
                      onClick={() => authenticateModule('new_hire', '/new-hire', 'New Hire')}
                    />
                  )}

                  {hasModuleAccess('quick_links') && (
                    <GridTile
                      title="Links"
                      description="Frequently used operational shortcuts"
                      icon={<Link width="2.5rem" />}
                      onClick={() => authenticateModule('quick_links', '/quick-links', 'Links')}
                    />
                  )}

                  {hasModuleAccess('qr_generator') && (
                    <GridTile
                      title="QR"
                      description="Generate QR codes for assets and docs"
                      icon={<QrCode width="2.5rem" />}
                      onClick={() => authenticateModule('qr_generator', '/qr-code-generator', 'QR Generator')}
                    />
                  )}


                  {hasTickets && (
                    <GridTile
                      title={hasTicketHandler ? "Tickets" : "IT Support"}
                      description="Report Issues and track resolutions"
                      icon={<Ticket width="2.5rem" />}
                      onClick={() => navigate('/tickets')}
                      badge={hasTicketHandler && openTicketsCount !== null && openTicketsCount > 0 ? openTicketsCount : undefined}
                    />
                  )}


                  {hasModuleAccess('manpower_requirements') && (
                    <GridTile
                      title="Manpower Requirements"
                      description="Workforce planning and requirements"
                      icon={<Users width="2.5rem" />}
                      onClick={() => authenticateModule('manpower_requirements', '/manpower-requirements', 'Manpower Requirements')}
                    />
                  )}

                  {hasModuleAccess('projects') && (
                    <GridTile
                      title="Projects"
                      description="Project planning and status overview"
                      icon={<Package width="2.5rem" />}
                      onClick={() => authenticateModule('projects', '/projects', 'Projects')}
                    />
                  )}

                  {hasModuleAccess('attendance') && (
                    <GridTile
                      title="Attendance"
                      description="Attendance and workforce time tracking"
                      icon={<Clock3Icon width="2.5rem" />}
                      onClick={() => authenticateModule('attendance', '/attendance', 'Attendance')}
                    />
                  )}

                  {hasShiftManagement && (
                    <GridTile
                      title="Shift Management"
                      description="Project shifts, rosters and daily attendance"
                      icon={<Clock3 width="2.5rem" />}
                      onClick={() => navigate('/shift-management')}
                    />
                  )}

                  {hasModuleAccess('asset_master') && (
                    <GridTile
                      title="Devices"
                      description="Device register, assignment and lifecycle"
                      icon={<Laptop2 width="2.5rem" />}
                      onClick={() => authenticateModule('asset_master', '/asset-master', 'Devices')}
                    />
                  )}

                  {hasModuleAccess('vehicle_log_book') && (
                    <GridTile
                      title="Vehicles"
                      description="Vehicle records, logs and movement"
                      icon={<Car width="2.5rem" />}
                      onClick={() => authenticateModule('vehicle_log_book', '/vehicles', 'Vehicles')}
                    />
                  )}

                  {hasModuleAccess('passports') && (
                    <GridTile
                      title="Passports"
                      description="Passport tracking and renewals"
                      icon={<BookMarked width="2.5rem" />}
                      onClick={() => authenticateModule('passports', '/passports', 'Passports')}
                    />
                  )}

                  {hasModuleAccess('petty_cash') && (
                    <GridTile
                      title="Petty Cash"
                      description="Expense logging and petty cash control"
                      icon={<Wallet width="2.5rem" />}
                      onClick={() => authenticateModule('petty_cash', '/petty-cash', 'Petty Cash')}
                    />
                  )}

                  {hasModuleAccess('offer_letters') && (
                    <GridTile
                      title="Offer Letters"
                      description="Compose, format and export offers"
                      icon={<FileText width="2.5rem" />}
                      onClick={() => authenticateModule('offer_letters', '/offer-letters', 'Offer Letters')}
                    />
                  )}

                  {hasModuleAccess('employee_clearance_form') && (
                    <GridTile
                      title="Forms"
                      description="Forms and approvals"
                      icon={<File width="2.5rem" />}
                      onClick={() => authenticateModule('employee_clearance_form', '/employee-clearance-form', 'Forms')}
                    />
                  )}

                  {hasModuleAccess('shift_logs') && (
                    <GridTile
                      title="Mobile Punching Logs"
                      description="Mobile punch-in and punch-out records"
                      icon={<Clock3 width="2.5rem" />}
                      onClick={() => authenticateModule('shift_logs', '/shift-logs', 'Mobile Punching Logs')}
                    />
                  )}

                  {hasModuleAccess('transfer_requests') && (
                    <GridTile
                      title="Transfers"
                      description="Staff movement and transfer requests"
                      icon={<ArrowRightLeft width="2.5rem" />}
                      onClick={() => authenticateModule('transfer_requests', '/transfer-requests', 'Transfers')}
                    />
                  )}

                  {hasModuleAccess('sim_cards') && (
                    <GridTile
                      title="SIM Cards"
                      description="SIM allocation and status management"
                      icon={<Smartphone width="2.5rem" />}
                      onClick={() => authenticateModule('sim_cards', '/sim-cards', 'SIM Cards')}
                    />
                  )}

                  {hasModuleAccess('offboarding') && (
                    <GridTile
                      title="Offboarding"
                      description="Exit process and clearance closure"
                      icon={<LogOut width="2.5rem" />}
                      onClick={() => authenticateModule('offboarding', '/offboarding', 'Offboarding')}
                    />
                  )}

                  {hasModuleAccess('document_editor') && (
                    <GridTile
                      title="Document Editor"
                      description="Create, format and manage rich documents"
                      icon={<FileText width="2.5rem" />}
                      onClick={() => authenticateModule('document_editor', '/document-editor', 'Document Editor')}
                    />
                  )}
                </div>
              </>
            ) : (
              <div style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "70vh"
              }}>
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia>
                      <Package />
                    </EmptyMedia>
                    <EmptyTitle>No Modules Allocated</EmptyTitle>
                    <EmptyDescription>You don't have access to any modules yet. Please contact your administrator to request module access.</EmptyDescription>
                  </EmptyHeader>
                  {/* <EmptyContent>
                    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
                      <button
                        onClick={() => navigate("/profile")}
                        style={{
                          padding: "0.5rem 1.5rem",
                          background: "mediumslateblue",
                          color: "white",
                          borderRadius: "0.5rem",
                          border: "none",
                          cursor: "pointer"
                        }}
                      >
                        View Profile
                      </button>
                    </div>
                  </EmptyContent> */}
                </Empty>
              </div>
            )
          )}
        </motion.div>

        <DefaultDialog
          title={"Report a Bug"}
          titleIcon={<Bug color="lightgreen" />}
          extra={
            <div
              style={{
                display: "flex",
                width: "100%",
                flexFlow: "column",
                gap: "0.75rem",
                paddingBottom: "0.5rem",
              }}
            >
              <textarea
                onChange={(e) => setIssue(e.target.value)}
                rows={5}
                placeholder="Describe issue"
              />
            </div>
          }
          open={bugDialog}
          onCancel={() => setBugDialog(false)}
          OkButtonText="Report"
          disabled={issue == ""}
          onOk={() => {
            issue != "" ? sendBugReport() : "";
          }}
          updating={loading}
        />

        <DefaultDialog
          titleIcon={<Mail />}
          title="Request Feature"
          extra={
            <p
              style={{
                fontSize: "0.85rem",
                opacity: 0.5,
                marginBottom: "0.5rem",
              }}
            >
              Reach out to the developer to request a new feature? You will be
              redirected to your e-mail client
            </p>
          }
          open={requestDialog}
          OkButtonText="Reach out"
          onCancel={() => setRequestDialog(false)}
          sendmail
        />

        <InputDialog
          title={"Protected Route"}
          input1Type="password"
          desc="Enter key to continue"
          titleIcon={<KeyRound color="mediumslateblue" />}
          open={loginPrompt}
          onCancel={() => setLoginPrompt(false)}
          OkButtonText="Continue"
          inputplaceholder="Password"
          onOk={() => navigate("/records")}
        />

        <InputDialog
          title={"Protected Route"}
          input1Type="password"
          desc="Enter key to continue"
          titleIcon={
            <img
              src="/vale-logo.png"
              width={"28rem"}
              style={{ paddingBottom: "0.25rem", marginRight: "0.25rem" }}
            />
          }
          open={valeLoginPrompt}
          onCancel={() => setValeLoginPrompt(false)}
          OkButtonText="Continue"
          inputplaceholder="Password"
          onOk={() => navigate("/vale-records")}
        />

        <DefaultDialog
          destructive
          title={"Confirm Logout"}
          OkButtonText="Logout"
          open={logoutPrompt}
          onCancel={() => setLogoutPrompt(false)}
          onOk={handleLogout}
        />
      </div>
      {/* Force update debug button */}
      {/* <button onClick={() => forceCheckForUpdate()} title="Force check for updates" style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 99999, padding: '0.45rem 0.6rem', borderRadius: 8, background: '#111827', color: 'white', border: 'none', boxShadow: '0 8px 20px rgba(0,0,0,0.12)' }}>Check updates</button> */}
      {/* <ReleaseNote /> */}
    </>
  );
}
