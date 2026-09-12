
// Push/notifications removed — no firestore notification imports here.
import { lazy, Suspense, useEffect, useRef } from "react";
import { Route, Routes } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import { useAuth } from "./components/AuthProvider";
import ProtectedRoutes from "./components/protectedRoute";
import { useBackgroundProcess } from "./context/BackgroundProcessContext";
import { preloadMrzWorker } from "./utils/mrzWorker";
import { preloadOcrWorker } from "./utils/ocrWorker";
import { refreshPhonebookCache } from "./utils/phonebookCache";

// Import critical startup pages immediately (no lazy loading)
import { Loader2 } from "lucide-react";
import CreateAccount from "./pages/create-account";
import Login from "./pages/login";
import PageNotFound from "./pages/page-not-found";
import RequestAccess from "./pages/request-access";
import UserReset from "./pages/user-reset";


// Lazy load protected pages only (loaded after authentication)
const Index = lazy(() => import("./pages"));
const AccessControl = lazy(() => import("./pages/access-control"));
const AccessRequests = lazy(() => import("./pages/access-requests"));
const AddRemarks = lazy(() => import("./pages/add-remarks"));
const AdminPage = lazy(() => import("./pages/admin-page"));
const Agreements = lazy(() => import("./pages/agreements"));
const Archives = lazy(() => import("./pages/archives"));
const History = lazy(() => import("./pages/history"));
const Inbox = lazy(() => import("./pages/inbox"));
const LPO = lazy(() => import("./pages/lpo"));
const Medicals = lazy(() => import("./pages/medicals"));
const MovementRegister = lazy(() => import("./pages/movement-register"));
const NewHire = lazy(() => import("./pages/new-hire"));
const OfferLetters = lazy(() => import("./pages/offer-letters"));
const EmployeeClearanceForm = lazy(() => import("./pages/employee-clearance-form"));
const Openings = lazy(() => import("./pages/openings"));
const Profile = lazy(() => import("./pages/profile"));
const ProjectLPO = lazy(() => import("./pages/project-lpo"));
const QRCodeGenerator = lazy(() => import("./pages/qr-code"));
const Projects = lazy(() => import("./pages/projects"));
const QuickLinks = lazy(() => import("./pages/quick-links"));
const RecordList = lazy(() => import("./pages/record-list"));
const Records = lazy(() => import("./pages/records"));
const Shortlist = lazy(() => import("./pages/shortlist"));
const UserPage = lazy(() => import("./pages/user"));
const Users = lazy(() => import("./pages/users"));
const ValeRecords = lazy(() => import("./pages/vale-records"));
const Website = lazy(() => import("./pages/website"));
const Phonebook = lazy(() => import("./pages/phonebook"));
const Supervisor = lazy(() => import("./pages/supervisor"));
const SiteCoordinator = lazy(() => import("./pages/site-coordinator"));
const Devices = lazy(() => import("./pages/devices"));
const ValeMobilisation = lazy(() => import("./pages/vale-mobilisation"));
const RecordDetail = lazy(() => import("./pages/record-detail"));
const FuelLog = lazy(() => import("./pages/fuel-log"));
const Passports = lazy(() => import("./pages/passports"));
const AssetMaster = lazy(() => import("./pages/asset-master"));
const VehicleLogBook = lazy(() => import("./pages/vehicle-log-book"));
const Tasks = lazy(() => import("./pages/tasks"));
const ShiftLogs = lazy(() => import("./pages/shift-logs"));
const SiteAdminWorkers = lazy(() => import("./pages/site-admin-workers"));
const TransferRequests = lazy(() => import("./pages/transfer-requests"));
const SimCards = lazy(() => import("./pages/sim-cards"));
const AttendanceDashboard = lazy(() => import("./pages/AttendanceDashboard"));
const Tickets = lazy(() => import("./pages/tickets"));
const MobilePunch = lazy(() => import("./pages/mobile-punch"));
         

const ManpowerRequirements = lazy(() => import("./pages/manpower-requirements"));
const Offboarding = lazy(() => import("./pages/offboarding"));
const DocumentEditor = lazy(() => import("./pages/document-editor"));
const EmployeeTimesheetSummaryReport = lazy(() => import("./pages/EmployeeTimesheetSummaryReport"));
const TimesheetEdit = lazy(() => import("./pages/TimesheetEdit"));
const ProjectTimingBreak = lazy(() => import("./pages/ProjectTimingBreak"));

// Loading fallback component
const PageLoader = () => (
  <div style={{ 
    display: "flex", 
    justifyContent: "center", 
    alignItems: "center", 
    height: "100svh"
  }}>
    <Loader2 className="animate-spin" style={{ fontSize: 24 }} />
  </div>
);

export default function App() {
  const { addProcess, updateProcess } = useBackgroundProcess();
  const { user, userData, cachedAuthState } = useAuth();
  const phonebookInitialized = useRef(false);
  
  // Initialize phonebook cache in the background on app launch (only once)
  useEffect(() => {
    if (!phonebookInitialized.current) {
      phonebookInitialized.current = true;
      const processId = "phonebook-cache-init";
      addProcess(processId, "Phonebook Sync");
      
      refreshPhonebookCache((status, message) => {
        updateProcess(processId, { status, message });
      });
    }
  }, []); // Empty dependency array ensures this only runs once

  // Push/notifications feature removed — no runtime listeners or SW cleanup here.

  useEffect(() => {
    const isAuthenticated = Boolean((user && userData) || cachedAuthState);
    if (!isAuthenticated) {
      return;
    }

    const warmup = () => {
      void preloadOcrWorker().catch((error) => {
        console.warn("OCR warmup skipped:", error);
      });

      if (navigator.onLine) {
        void preloadMrzWorker().catch((error) => {
          console.warn("MRZ warmup skipped:", error);
        });
      }
    };

    if (typeof globalThis !== "undefined" && "requestIdleCallback" in globalThis) {
      const requestIdle = globalThis.requestIdleCallback as (callback: IdleRequestCallback) => number;
      const cancelIdle = globalThis.cancelIdleCallback as (handle: number) => void;
      const handle = requestIdle(() => warmup());
      return () => {
        cancelIdle(handle);
      };
    }

    const timer = setTimeout(warmup, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [user, userData, cachedAuthState]);

  return (
    <AuthGuard>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public routes */}
        <Route path="/" element={<Login />} />
        <Route path="/user-reset" element={<UserReset />} />
        <Route path="/request-access" element={<RequestAccess />} />
        <Route path="/create-account" element={<CreateAccount />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/supervisor" element={<Supervisor />} />
        <Route path="/quick-links" element={<QuickLinks />} />

        {/* Protected routes */}
        <Route
          element={
            <AuthGuard>
              <ProtectedRoutes />
            </AuthGuard>
          }
        >
          <Route path="/index" element={<Index />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/shift-logs" element={<ShiftLogs />} />
          <Route path="/site-admin-workers" element={<SiteAdminWorkers />} />
          
          <Route path="/record-list" element={<RecordList />} />
          <Route path="/mobilizacao" element={<ValeMobilisation />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/users" element={<Users />} />
          <Route path="/archives" element={<Archives />} />
          <Route path="/site-coordinator" element={<SiteCoordinator />} />
          <Route path="/access-control" element={<AccessControl />} />
          <Route path="access-requests" element={<AccessRequests />} />
          <Route path="/user" element={<UserPage />} />
          <Route path="/new-hire" element={<NewHire />} />
          <Route path="/offer-letters" element={<OfferLetters />} />
          <Route path="/employee-clearance-form" element={<EmployeeClearanceForm />} />
          <Route path="/phonebook" element={<Phonebook />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/agreements" element={<Agreements />} />
          <Route path="/shortlist" element={<Shortlist />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/openings" element={<Openings />} />
          <Route path="/website" element={<Website />} />
          <Route path="/add-remarks" element={<AddRemarks />} />
          <Route path="/lpos" element={<LPO />} />
          <Route path="/qr-code-generator" element={<QRCodeGenerator />} />
          <Route path="/fuel-log" element={<FuelLog />} />
          <Route path="/passports" element={<Passports />} />
          <Route path="/asset-master" element={<AssetMaster />} />
          <Route path="/vehicles" element={<VehicleLogBook />} />
          <Route path="/vehicle-log-book" element={<VehicleLogBook />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/project-lpo" element={<ProjectLPO />} />
          <Route path="/movement-register" element={<MovementRegister />} />
          <Route path="/transfer-requests" element={<TransferRequests />} />
          <Route path="/sim-cards" element={<SimCards />} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/attendance" element={<AttendanceDashboard />} />
          <Route path="/employee-timesheet-summary" element={<EmployeeTimesheetSummaryReport />} />
          <Route path="/timesheet-edit" element={<TimesheetEdit />} />   
          <Route path="/project-timing-break" element={<ProjectTimingBreak />} />                 
          <Route path="/mobile-punch" element={<MobilePunch />} />
          <Route path="/manpower-requirements" element={<ManpowerRequirements />} />
          <Route path="/offboarding" element={<Offboarding />} />
          <Route path="/document-editor" element={<DocumentEditor />} />
          <Route path="/records" element={<Records />} />
          <Route path="/record/:id" element={<RecordDetail />} />
          <Route path="/vale-records" element={<ValeRecords />} />
          <Route path="/medicals" element={<Medicals />} />
          <Route path="/history" element={<History />} />
        </Route>

        <Route path="*" element={<PageNotFound />} />
      </Routes>
      </Suspense>
    </AuthGuard>
  );
}
