import AddRecordButton from "@/components/add-record-button";
import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import CivilID from "@/components/civil-id";
import Directive from "@/components/directive";
import DropDown from "@/components/dropdown";
import InputDialog from "@/components/input-dialog";
import MedicalID from "@/components/medical-id";
import Passport from "@/components/passport";
import { ResponsiveModal } from "@/components/responsive-modal";
import VehicleID from "@/components/vehicle-id";
import { db, storage } from "@/firebase";
import RoleSelect from "@/components/role-select";
import SearchBar from "@/components/search-bar";
import DefaultDialog from "@/components/ui/default-dialog";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabase";
import {
  exportExpiringRecords,
} from "@/utils/excelUtils";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
  writeBatch
} from "firebase/firestore";
import { fetchAndCacheRecords, getCachedRecords } from "@/utils/recordsCache";
import { LoadingOutlined } from "@ant-design/icons";
import * as XLSX from "@e965/xlsx";
import { message, Tooltip } from "antd";
import {
  deleteObject,
  ref
} from "firebase/storage";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowDownAZ,
  Book,
  Car,
  Check,
  CheckSquare2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Disc,
  Download,
  DownloadCloud,
  EllipsisVerticalIcon,
  File,
  FileArchive,
  FileDown,
  Filter,
  FolderKanban,
  Globe,
  GraduationCap,
  HeartPulse,
  Inbox,
  Info,
  ListStart,
  Loader,
  Loader2,
  LoaderCircle,
  PackageOpen,
  PenLine,
  Plus,
  RadioTower,
  RefreshCcw,
  Sparkles,
  Table2,
  Trash,
  UploadCloud,
  UserCircle,
  X
} from "lucide-react";
import moment from "moment";
import { useEffect, useMemo, useRef, useState } from "react";
import "react-lazy-load-image-component/src/effects/blur.css";
import { useNavigate } from "react-router-dom";
import ReactTimeAgo from "react-time-ago";
import { toast } from "sonner";
import useKeyboardShortcut from "use-keyboard-shortcut";
import { exportDatabase, exportRaw, getBlank } from "./component-functions";
import DbDropDown from "./db-dropdown";
import RefreshButton from "./refresh-button";
import SheetComponent from "./sheet-component";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./ui/select";

type Record = {
  id: string;
  name: string;
  employeeCode?: string;
  // Add other potential fields
};

// Running Notes
// Check whether expiry date minus 3 is equals to today - 3 month reminder

interface Props {
  title?: string;
  dbCategory?: string;
  loader?: any;
  noTraining?: boolean;
}

// interface DbDropDownProps {
//   onUpload: () => void;
//   onExport: () => void;
//   onInbox: () => void;
//   onArchives: () => void;
//   onExportExpiring: () => void;
//   onImportExpiring: () => void;
//   exportLoading?: boolean;
//   importLoading?: boolean;
//   trigger: React.ReactNode;
// }

// Shared Record Form Content Component
interface RecordFormContentProps {
  name: string;
  setName: (value: string) => void;
  displayName: string;
  setDisplayName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  employeeCode: string;
  setEmployeeCode: (value: string) => void;
  companyName: string;
  setCompanyName: (value: string) => void;
  dateofJoin: string;
  setDateofJoin: (value: string) => void;
  salaryBasic: number;
  setSalaryBasic: (value: any) => void;
  allowance: number;
  setAllowance: (value: any) => void;
  contact: string;
  setContact: (value: string) => void;
  cug: string;
  setCug: (value: string) => void;
  designation: string;
  setDesignation: (value: string) => void;
  workerType: string;
  setWorkerType: (value: string) => void;
  site: string;
  setSite: (value: string) => void;
  project: string;
  setProject: (value: string) => void;
  systemRole: string;
  setSystemRole: (value: string) => void;
  loading: boolean;
  onSave: () => void;
  isEditMode?: boolean;
}

const RecordFormContent: React.FC<RecordFormContentProps> = ({
  name,
  setName,
  displayName,
  setDisplayName,
  email,
  setEmail,
  employeeCode,
  setEmployeeCode,
  companyName,
  setCompanyName,
  dateofJoin,
  setDateofJoin,
  salaryBasic,
  setSalaryBasic,
  allowance,
  setAllowance,
  contact,
  setContact,
  cug,
  setCug,
  designation,
  setDesignation,
  workerType,
  setWorkerType,
  site,
  setSite,
  project,
  setProject,
  systemRole,
  setSystemRole,
  loading,
  onSave,
  isEditMode = false,
}) => {
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <FileArchive/>
          <p style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
            {isEditMode ? "Edit Record" : "Add Record"}
          </p>
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
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%", paddingBottom: "1.5rem" }}>
          <input
            placeholder="Enter Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%" }}
          />
          
          <input
            placeholder="Enter Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ width: "100%" }}
          />
          
          <input
            placeholder="Enter Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%" }}
          />
          
          <input
            placeholder="Enter Employee Code"
            value={employeeCode}
            onChange={(e) => setEmployeeCode(e.target.value)}
            style={{ width: "100%" }}
          />
          
          <input
            placeholder="Enter Company Name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            style={{ width: "100%" }}
          />
          
          <input
            placeholder="Enter Date of Join"
            value={dateofJoin}
            onChange={(e) => setDateofJoin(e.target.value)}
            style={{ width: "100%" }}
          />
          
          <input
            placeholder="Basic Salary"
            value={salaryBasic.toString()}
            onChange={(e) => setSalaryBasic(e.target.value)}
            style={{ width: "100%" }}
          />
          
          <input
            placeholder="Allowance"
            value={allowance.toString()}
            onChange={(e) => setAllowance(e.target.value)}
            style={{ width: "100%" }}
          />
          
          <input
            placeholder="Enter Contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            style={{ width: "100%" }}
          />
          
          <input
            placeholder="Enter CUG"
            value={cug}
            onChange={(e) => setCug(e.target.value)}
            style={{ width: "100%" }}
          />
          
          <input
            placeholder="Enter Site"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            style={{ width: "100%" }}
          />
          
          <input
            placeholder="Enter Project"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            style={{ width: "100%" }}
          />
          
          <input
            placeholder="Enter Designation"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            style={{ width: "100%" }}
          />
          <Select value={workerType} onValueChange={(value) => setWorkerType(value)}>
            <SelectTrigger style={{ width: "100%", justifyContent: "space-between" }}>
              <span style={{ opacity: workerType ? 1 : 0.5 }}>
                {workerType === "staff" ? "Staff" : workerType === "worker" ? "Worker" : "Select Employee Type"}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="worker">Worker</SelectItem>
            </SelectContent>
          </Select>
          
          <RoleSelect 
            value={systemRole || 'profile'} 
            onChange={(value) => setSystemRole(value)}
          />
        </div>
      </div>

      {/* Fixed Footer */}
      <div style={{
        padding: "1rem 1rem",
        borderTop: "1px solid rgba(100, 100, 100, 0.1)",
        background: "var(--background)",
        display: "flex",
        paddingBottom:"2rem",
        gap: "0.5rem",
        boxSizing: "border-box",
        width: "100%"
      }}>
        <button
          onClick={onSave}
          disabled={loading}
          style={{
            padding: "1rem 1rem",
            background: "black",
            color: "white",
            borderRadius: "0.5rem",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            opacity: loading ? 0.5 : 1,
            width: "100%"
          }}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" width="1rem" />
              
            </>
          ) : (
            <>
              <Plus width="1rem" />
              {isEditMode ? "Update Record" : "Add Record"}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default function DbComponent(props: Props) {
  const { windowName } = useCurrentUser();
  const { userData } = useAuth();
  

  // Memoized function to check if record is expiring (within 2 months)
  const isRecordExpiring = useMemo(() => {
    return (post: any) => {
      const expiryFields = [
        post.civil_expiry,
        post.license_expiry,
        post.medical_due_on,
        post.passportExpiry,
        post.vt_hse_induction,
        post.vt_car_1,
        post.vt_car_2,
        post.vt_car_3,
        post.vt_car_4,
        post.vt_car_5,
        post.vt_car_6,
        post.vt_car_7,
        post.vt_car_8,
        post.vt_car_9,
        post.vt_car_10,
      ];
      
      return expiryFields.some(date => {
        if (!date || date === "") return false;
        return moment(date, "DD/MM/YYYY").diff(moment(), "months") < 2;
      });
    };
  }, []);
  
 
  const [selectAll, setSelectAll] = useState(false);
  const [deleteKey, setDeleteKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [jsonData, setJsonData] = useState<any>([]);
  const [companyName, setCompanyName] = useState("");

 

  const [archivePrompt, setArchivePrompt] = useState(false);
  const [state, setState] = useState("");
 

  const [contact, setContact] = useState("");
  const [displayName, setDisplayName] = useState("");
  
  const [nativePhone, setNativePhone] = useState("");
  const [nativeAddress, setNativeAddress] = useState("");
  const [editedNativePhone, setEditedNativePhone] = useState("");
  const [editedNativeAddress, setEditedNativeAddress] = useState("");
 
  
 

  const usenavigate = useNavigate();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // BASIC PAGE VARIABLES
  // const [pageLoad, setPageLoad] = useState(false)
  const [records, setRecords] = useState<Record[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [name, setName] = useState("");
  const [doc_id] = useState("");

  const [civil, setCivil] = useState(false);
  const [vehicle, setVehicle] = useState(false);
  const [addcivil, setAddcivil] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteMedicalIDdialog, setDeleteMedicalIDdialog] = useState(false);
  const [email, setEmail] = useState("");
  
  

  // CIVIL ID VARIABLES
  const [civil_number, setCivilNumber] = useState<any>();
  const [new_civil_number, setNewCivilNumber] = useState<any>();
  const [new_civil_expiry, setNewCivilExpiry] = useState<any>();
  const [civil_expiry, setCivilExpiry] = useState<any>();
  const [civil_DOB, setCivilDOB] = useState<any>();

  //EDIT CIVIL ID VARIABLES
  const [edited_civil_number, setEditedCivilNumber] = useState("");
  const [edited_civil_expiry, setEditedCivilExpiry] = useState<any>();
  const [edited_civil_DOB, setEditedCivilDOB] = useState("");
  const [civilDelete, setCivilDelete] = useState(false);

  const [edited_vehicle_number, setEditedVehicleNumber] = useState("");
  const [edited_vehicle_issue, setEditedVehicleIssue] = useState("");
  const [edited_vehicle_expiry, setEditedVehicleExpiry] = useState("");

  const [editedPassportID, setEditedPassportID] = useState("");
  const [editedPassportIssue, setEditedPassportIssue] = useState("");
  const [editedPassportExpiry, setEditedPassportExpiry] = useState<any>();

  const [passportDialog, setPassportDialog] = useState(false);

  const [editedCompletedOn, setEditedCompletedOn] = useState("");
  const [editedDueOn, setEditedDueOn] = useState<any>();

  //MAIL CONFIG VARIABLES
  const [addDialog, setAddDialog] = useState(false);
 
  const [editcivilprompt, setEditcivilprompt] = useState(false);
  const [valeTrainingDialog, setValeTrainingDialog] = useState(false);
  const [renewMedicalIDdialog, setRenewMedicalIDdialog] = useState(false);
  const [renewPassportDialog, setRenewPassportDialog] = useState(false);

  //VEHICLE ID VARIABLES
  const [vehicle_number, setVehicleNumber] = useState("");
  const [vehicle_issue, setVehicleIssue] = useState("");
  const [vehicle_expiry, setVehicleExpiry] = useState<any>();

  const [medical_completed_on, setCompletedOn] = useState("");
  const [medical_due_on, setDueOn] = useState<any>();
  const [MedicalIDdialog, setMedicalIDdialog] = useState(false);

  const [passportID, setPassportID] = useState("");
  const [passportIssue, setPassportIssue] = useState("");
  const [passportExpiry, setPassportExpiry] = useState<any>();

  const [addPassportDialog, setAddPassportDialog] = useState(false);

  const [vehicleIdDelete, setVehicleIdDelete] = useState(false);
  const [edit_vehicle_id_prompt, setEditVehicleIDprompt] = useState(false);
  const [editMedicalIDdialog, setEditMedicalIDdialog] = useState(false);
  const [editPassportDialog, setEditPassportDialog] = useState(false);

  const [DeletePassportDialog, setDeletePassportDialog] = useState(false);

  const [trainingAddDialog, setTrainingAddDialog] = useState(false);
  const [trainingAddDialogTitle, setTrainingAddDialogTitle] = useState("");
  const [EditedTrainingAddDialogInput, setEditedTrainingAddDialogInput] =
    useState("");
  const [trainingAddDialogInputValue, setTrainingAddDialogInputValue] =
    useState("");

  const [add_vehicle_id, setAddVehicleID] = useState(false);

  const [selectable, setSelectable] = useState(false);
  const [viewMode, setViewMode] = useState<"directive" | "table">("directive");
  const [search, setSearch] = useState("");

  const [checked, setChecked] = useState<string[]>([]);
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false);
  const [bulkEditDialogOpen, setBulkEditDialogOpen] = useState(false);
  const [bulkEditField, setBulkEditField] = useState<"name" | "site">("name");
  const [bulkEditValue, setBulkEditValue] = useState("");
  const [bulkEditLoading, setBulkEditLoading] = useState(false);

  // Project allocation mode
  const [projectAllocMode, setProjectAllocMode] = useState(false);
  const [projectDrawerExpanded, setProjectDrawerExpanded] = useState(true);
  const [projectsList, setProjectsList] = useState<{ id: string; name: string }[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [allocatingProject, setAllocatingProject] = useState<string | null>(null);
  const [pendingProject, setPendingProject] = useState<{ id: string; name: string } | null>(null);
  
  // Project personnel viewer
  const [viewingProject, setViewingProject] = useState<{ id: string; name: string } | null>(null);
  const [projectPersonnel, setProjectPersonnel] = useState<Record[]>([]);
  const [loadingPersonnel, setLoadingPersonnel] = useState(false);

  // const [recipientsDialog, setRecipientsDialog] = useState(false)

  const [progress, setProgress] = useState("");

  const [fetchingData, setfetchingData] = useState(false);
  const [hasInitialData, setHasInitialData] = useState(false);
  const [status, setStatus] = useState("");

  const [renewDocDialog, setRenewDocDialog] = useState(false);
  const [renewVehicleDialog, setRenewVehicleDialog] = useState(false);

  const [newExpiry, setNewExpiry] = useState<any>();

  const today = new Date();

  const [progressItem, setProgressItem] = useState("");
  const [trainingDialog, setTrainingDialog] = useState(false);
  const [healthDialog, setHealthDialog] = useState(false);

  

  const [trainingType, setTrainingType] = useState("");

  const [vt_hse_induction, setHseInduction] = useState<any>();
  const [vt_car_1, setVtCar1] = useState<any>();
  const [vt_car_2, setVtCar2] = useState<any>();
  const [vt_car_3, setVtCar3] = useState<any>();
  const [vt_car_4, setVtCar4] = useState<any>();
  const [vt_car_5, setVtCar5] = useState<any>();
  const [vt_car_6, setVtCar6] = useState<any>();
  const [vt_car_7, setVtCar7] = useState<any>();
  const [vt_car_8, setVtCar8] = useState<any>();
  const [vt_car_9, setVtCar9] = useState<any>();
  const [vt_car_10, setVtCar10] = useState<any>();

  const [imageUpload] = useState(null);
  const [fileName, setFileName] = useState("");

  const [employeeCode, setEmployeeCode] = useState("");
  const [dateofJoin, setDateofJoin] = useState("");
  const [salaryBasic, setSalaryBasic] = useState(0);
  const [allowance, setAllowance] = useState(0);
  const [cug, setCug] = useState("");
  const [systemRole, setSystemRole] = useState("");  // system access role
  const [designation, setDesignation] = useState("");  // job title
  const [workerType, setWorkerType] = useState("");  // staff or worker
  const [site, setSite] = useState("");
  const [project, setProject] = useState("");


  // Collect all Firestore fields for tabular view
  const allKeys = useMemo(() => {
    const preferredColumnOrder = [
      "employeeCode",
      "name",
      "display_name",
      "designation",
      "workerType",
      "companyName",
      "project",
      "site",
      "type",
      "state",
      "systemRole",
      "email",
      "contact",
      "cug",
      "dateofJoin",
      "salaryBasic",
      "allowance",
      "civil_id",
      "civil_expiry",
      "license_number",
      "license_expiry",
      "passportNumber",
      "passportExpiry",
      "medical_due_on",
      "vt_hse_induction",
      "vt_car_1",
      "vt_car_2",
      "vt_car_3",
      "vt_car_4",
      "vt_car_5",
      "vt_car_6",
      "vt_car_7",
      "vt_car_8",
      "vt_car_9",
      "vt_car_10",
      "created_on",
      "modified_on",
      "notify",
    ];

    const keys = new Set<string>();
    records.forEach((record: any) => {
      if (!record) return;
      Object.keys(record).forEach((key) => {
        if (key !== "id") {
          keys.add(key);
        }
      });
    });

    const orderedKeys = preferredColumnOrder.filter((key) => keys.has(key));
    const remainingKeys = Array.from(keys)
      .filter((key) => !preferredColumnOrder.includes(key))
      .sort();

    return [...orderedKeys, ...remainingKeys];
  }, [records]);

  const [filterProject, setFilterProject] = useState("");
  const [filterDesignation, setFilterDesignation] = useState("");
  const [filterCompany, setFilterCompany] = useState("");

  // Unique values for filter dropdowns
  const uniqueProjects = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r: any) => { if (r.project) set.add(r.project); });
    return Array.from(set).sort();
  }, [records]);

  const uniqueDesignations = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r: any) => { if (r.designation) set.add(r.designation); });
    return Array.from(set).sort();
  }, [records]);

  const uniqueCompanies = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r: any) => { if (r.companyName) set.add(r.companyName); });
    return Array.from(set).sort();
  }, [records]);

  const activeFilterCount = [filterProject, filterDesignation, filterCompany].filter(Boolean).length;

  // Memoized filtered records for search + filters
  const filteredRecords = useMemo(() => {
    return records.filter((record: any) => {
      // Search filter
      if (search !== "") {
        const lowerSearch = search.toLowerCase();
        const matchesSearch =
          (record.name && record.name.toLowerCase().includes(lowerSearch)) ||
          (record.civil_number && String(record.civil_number).toLowerCase().includes(lowerSearch)) ||
          (record.display_name && record.display_name.toLowerCase().includes(lowerSearch)) ||
          (record.email && record.email.toLowerCase().includes(lowerSearch)) ||
          (record.employeeCode && String(record.employeeCode).toLowerCase().includes(lowerSearch)) ||
          (record.designation && record.designation.toLowerCase().includes(lowerSearch)) ||
          (record.contact && String(record.contact).includes(lowerSearch));
        if (!matchesSearch) return false;
      }

      // Field filters
      if (filterProject && record.project !== filterProject) return false;
      if (filterDesignation && record.designation !== filterDesignation) return false;
      if (filterCompany && record.companyName !== filterCompany) return false;

      return true;
    });
  }, [records, search, filterProject, filterDesignation, filterCompany]);

 



  // const [recordDeleteStatus, setRecordDeleteStatus] = useState("");

 

  const [importDialog, setImportDialog] = useState(false);
  const [sortby, setSortBy] = useState("name");
  const [access, setAccess] = useState(false);
  const [refreshCompleted, setRefreshCompleted] = useState(false);
  const [exportDialog, setExportDialog] = useState(false);


  const [pageSize] = useState(100);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);

  // const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Set access permissions from cached user data
  useEffect(() => {
    if (userData) {
      const hasEditorAccess = userData.editor === "true" || userData.editor === true;
      const hasSensitiveAccess = userData.sensitive_data === "true" || userData.sensitive_data === true;
      
      setAccess(hasEditorAccess);
     
      
      console.log("⚡ Access permissions loaded from cache:", {
        editor: hasEditorAccess,
        sensitiveData: hasSensitiveAccess
      });
    }
  }, [userData]);

  // Online/Offline handling
  useEffect(() => {
    window.addEventListener("online", () => {
      setStatus("online");
      fetchData();
    });
    window.addEventListener("offline", () => {
      setStatus("offline");
    });

    setStatus(navigator.onLine ? "online" : "offline");

    return () => {
      window.removeEventListener("online", () => setStatus("online"));
      window.removeEventListener("offline", () => setStatus("offline"));
    };
  }, []);

  useEffect(() => {
    if (status === "online") {
      fetchData();
    } else if (status === "offline") {
      toast.warning(
         "You are offline. Some features may be limited."
        
      );
    }
  }, [status]);

  // Keyboard shortcuts
  const { flushHeldKeys } = useKeyboardShortcut(["Control", "A"], () => {
    setAddDialog(!addDialog);
    setName("");
    flushHeldKeys;
  });

  useKeyboardShortcut(["Control", "I"], () => {
    usenavigate("/inbox");
    flushHeldKeys;
  });

  // History tracking
  const AddHistory = async (
    method: string,
    newValue?: any,
    previousValue?: any,
    fieldAltered?: any
  ) => {
    await addDoc(collection(db, "history"), {
      created_on: new Date(),
      user: windowName,
      newValue: newValue,
      previousValue: previousValue,
      fieldAltered: fieldAltered,
      doc_owner: name,
      type: props.dbCategory,
      method: method,
    });
  };

  // File upload handling
  const uploadFile = async () => {
    if (imageUpload === null) {
      // message.info("No image attached");
      return;
    }
    

    console.log("Uploading ", fileName);
    if (fileName === "") {
      console.log("Skipped Upload");
      return;
    }

    try {
    
    
      setFileName("");
    } catch (error: any) {
      toast.error(error.message);
      console.log(error.message);
    }
  };

  const fetchBlank = () => {
    getBlank(props.dbCategory);
  };

  // Real-time updates
  useEffect(() => {
    fetchData();
  }, []);

  // Combine initial essential data fetch
  const fetchInitialData = async (silent: boolean = false) => {
    try {
      if (!silent) {
        setfetchingData(true);
      }
      const { data: recordsData, error: recordsError } = await supabase
        .from("employees")
        .select("*")
        .in("emp_type", [props.dbCategory, "omni"])
        .order(sortby)
        .limit(pageSize);
        
      if (recordsError) {
        console.error("Supabase fetchInitialData error:", recordsError);
        return; // Don't overwrite state with empty if query failed
      }
      
      const fetchedData: Record[] = recordsData || [];
      
      setLastDoc(fetchedData.length > 0 ? fetchedData.length : null);
      setHasMore(fetchedData.length === pageSize);

      // Update records
      setRecords(fetchedData);
      setHasInitialData(true);

      // Preserve selection state in project allocation mode
      if (!projectAllocMode) {
        // Only reset selection state when not in project allocation mode
        setChecked([]);
        setSelectable(false);
      } else {
        console.log("Preserving selection state in project allocation mode during initial/background fetch");
      }

      // Cache the data
      if (props.dbCategory) {
        fetchAndCacheRecords(props.dbCategory, sortby, pageSize).catch(err =>
          console.error("Failed to cache records:", err)
        );
      }

      // Get total count in background
      const { count } = await supabase.from("employees").select("*", { count: "exact" }).in("emp_type", [props.dbCategory, "omni"]);
      setTotalRecords(count || 0);

      // Show offline warning if needed
      if (!navigator.onLine) {
      //   toast.warning(
      //     "You are offline. Showing cached data.",
      // );
      } else {
        message.destroy("offline-warning");
      }

      setStatus(navigator.onLine ? "online" : "offline");
    } catch (error: any) {
      console.error("Error fetching initial data:", error);
      setStatus("error");
      toast.error(`Error fetching data: ${error.message}`);
    } finally {
      setfetchingData(false);
    }
  };

  // Initial load - check cache first, then fetch
  useEffect(() => {
    if (props.dbCategory) {
      const cachedData = getCachedRecords(props.dbCategory);
      if (cachedData && cachedData.sortby === sortby) {
        console.log("Loading records from cache");
        setRecords(cachedData.records);
        setTotalRecords(cachedData.totalRecords);
        setHasInitialData(true);
        // Fetch fresh data in background silently
        fetchInitialData(true);
      } else {
        // No cache, show loader and fetch
        fetchInitialData(false);
      }
    } else {
      fetchInitialData(false);
    }
  }, []);

  // Handle sort changes
  useEffect(() => {
    fetchData();
  }, [sortby]);

  // Modify the existing fetchData function to not verify access again
  const fetchData = async (loadMore = false) => {
    console.log("Record Fetch", { loadMore, selectableState: selectable, projectAllocMode, checkedCount: checked.length });
    try {
      setfetchingData(true);
      let query = supabase
        .from("employees")
        .select("*")
        .in("emp_type", [props.dbCategory, "omni"])
        .order(sortby)
        .limit(pageSize);
        
      if (loadMore && lastDoc) {
        query = query.range(records.length, records.length + pageSize - 1);
      }
      
      const { data: recordsData, error: recordsError } = await query;
      if (recordsError) {
        console.error("Supabase fetchData error:", recordsError);
        setfetchingData(false);
        setRefreshCompleted(true);
        return;
      }
      const fetchedData: Record[] = recordsData || [];
      
      setLastDoc(fetchedData.length > 0 ? records.length + fetchedData.length : null);
      setHasMore(fetchedData.length === pageSize);

      setfetchingData(false);
      setRefreshCompleted(true);

      if (loadMore) {
        setRecords((prevRecords: Record[]) => {
          // Deduplicate by id when loading more records
          const combinedRecords = [...prevRecords, ...fetchedData];
          const uniqueRecords = combinedRecords.filter((record, index, self) =>
            index === self.findIndex((r) => r.id === record.id)
          );
          return uniqueRecords;
        });
        // If in selection mode and selectAll is true, add new records to checked array
        if (selectable && selectAll) {
          setChecked((prev: any) => {
            const existingIds = new Set(prev);
            const newIds = fetchedData
              .map((record) => record.id)
              .filter((id) => !existingIds.has(id));
            return [...prev, ...newIds];
          });
        }
        // Note: when loadMore is true, we preserve selectable and checked states
        // This is important for project allocation mode and other selection scenarios
      } else {
        setRecords(fetchedData);
        // Only reset selection state on fresh load (not pagination)
        // Preserve selection in project allocation mode entirely
        if (projectAllocMode) {
          // Keep both selectable and checked unchanged
          console.log("Preserving selection state in project allocation mode");
        } else {
          // Not in project allocation mode - safe to reset
          setChecked([]);
          setSelectable(false);
        }
      }

      setTimeout(() => {
        setRefreshCompleted(false);
      }, 1000);

      message.destroy("offline-warning");
    } catch (error: any) {
      console.error("Error fetching data:", error);
      if (!navigator.onLine) {
        // toast.warning(
        //   "You are offline. Showing cached data."
        
        // );
      } else {
        toast.error(
        `Error fetching data: ${error.message}`,
          );
      }
      setStatus(navigator.onLine ? "error" : "offline");
    } finally {
      setfetchingData(false);
    }
  };

  // Add an intersection observer for infinite scroll
  useEffect(() => {
    // Restore scroll position when coming back from record detail
    // Only restore after records have been loaded
    if (records.length > 0) {
      const savedScrollPosition = sessionStorage.getItem('database-scroll-position');
      if (savedScrollPosition && scrollContainerRef.current) {
        // Use setTimeout to ensure DOM is fully rendered
        setTimeout(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = parseInt(savedScrollPosition);
            sessionStorage.removeItem('database-scroll-position');
          }
        }, 100);
      }
    }
  }, [records.length]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !fetchingData) {
          fetchData(true);
        }
      },
      { threshold: 0.5 }
    );

    const loadMoreTrigger = document.getElementById("load-more-trigger");
    if (loadMoreTrigger) {
      observer.observe(loadMoreTrigger);
    }

    return () => {
      if (loadMoreTrigger) {
        observer.unobserve(loadMoreTrigger);
      }
    };
  }, [hasMore, fetchingData, lastDoc]);


  {
    /*///////////////////////////////////////////////////////////////////////////////////////////////////////*/
  }

 
  const RenewID = async () => {
    setLoading(true);
    await supabase.from("employees").update({
      civil_expiry: newExpiry,
      modified_on: new Date(),
    }).eq("id", doc_id);
    await AddHistory("renew", newExpiry, "", "Civil ID");
    setCivilExpiry(newExpiry);
    setLoading(false);
    setRenewDocDialog(false);
    fetchData();
    setNewExpiry("");
    
  };

  const archiveRecord = async () => {
    setLoading(true);
    try {
      await supabase.from("employees").update({
        state: state == "active" ? "archived" : "active",
        notify: state == "active" ? false : true,
      }).eq("id", doc_id);
      setLoading(false);
      setArchivePrompt(false);
      setState(state == "active" ? "archived" : "active");
    
    } catch (error) {
      setLoading(false);
    }
  };

  const exportDB = async () => {
    setLoading(true);
    try {
      // Fetch all records
      const RecordCollection = collection(db, "records");
      const recordQuery = query(
        RecordCollection,
        where("type", "in", [props.dbCategory, "omni"]),
        orderBy(sortby)
      );

      const querySnapshot = await getDocs(recordQuery);
      const allRecords: Record[] = [];
      querySnapshot.forEach((doc: any) => {
        allRecords.push({ id: doc.id, ...doc.data() });
      });

      await AddHistory("export", "", "", "Database Export");
      setLoading(false);
      exportDatabase(allRecords, props.dbCategory);
    } catch (err: any) {
      console.error("Error exporting database:", err);
      toast.error("Failed to export database");
      setLoading(false);
    }
  };

  const exportRawDB = async () => {
    await AddHistory("export", "", "", "Raw Database Data");
    exportRaw(records);
  };

 

  // FUNCTION TO ADD A RECORD
  const addRecord = async () => {
    setLoading(true);
    await uploadFile();
    await supabase.from("employees").insert({
      name: name,
      display_name: displayName,
      email: email,
      employeeCode: employeeCode,
      companyName: companyName,
      dateofJoin: dateofJoin,
      salaryBasic: salaryBasic,
      initialSalary: salaryBasic,
      allowance: allowance,
      initialAllowance: allowance,
      contact: contact,
      created_on: new Date(),
      modified_on: new Date(),
      emp_type: props.dbCategory,
      notify: true,
      profile_name: fileName,
      cug: cug,
      role: systemRole || 'profile',  // system access role
      designation: designation,  // job title
      workerType: workerType,  // staff or worker
      site: site,
      project: project,
      civil_number: "",
      civil_expiry: "",
      civil_DOB: "",
      license_number: "",
      license_issue: "",
      license_expiry: "",
      medical_completed_on: "",
      medical_due_on: "",
      passportID: "",
      passportIssue: "",
      passportExpiry: "",
      vt_hse_induction: "",
      vt_car_1: "",
      vt_car_2: "",
      vt_car_3: "",
      vt_car_4: "",
      vt_car_5: "",
      vt_car_6: "",
      vt_car_7: "",
      vt_car_8: "",
      vt_car_9: "",
      vt_car_10: "",
      state: "active",
      remarks: "",
    });
    await AddHistory("addition", "Created", "", "Record");
    setAddDialog(false);
    setLoading(false);
    fetchData();
    
    // Clear form fields after adding
    setName("");
    setDisplayName("");
    setEmail("");
    setEmployeeCode("");
    setCompanyName("");
    setDateofJoin("");
    setSalaryBasic(0);
    setAllowance(0);
    setContact("");
    setCug("");
    setDesignation("");
    setSite("");
    setProject("");
    setSystemRole("");
  }; 

  {
    /* ////////////////////////////////////////////////////////////////////////////////////////////////////////////// */
  }

  // FUNCTION TO ADD A CIVIL ID
  const addCivilID = async () => {
    setAddcivil(false);
    setLoading(true);
    try {
      await supabase.from("employees").update({
        civil_number: edited_civil_number,
        civil_expiry: edited_civil_expiry ? edited_civil_expiry : "",
        civil_DOB: edited_civil_DOB,
        modified_on: new Date(),
      }).eq("id", doc_id);
      await AddHistory("addition", "Added", "", "Civil ID");
      setCivilNumber(edited_civil_number);
      setCivilExpiry(edited_civil_expiry);
      setCivilDOB(edited_civil_DOB);
      setLoading(false);
      fetchData();
     
    } catch (error) {
      console.log(error);
      setCivilNumber("");
      setCivilExpiry("");
      setCivilDOB("");
      setNewCivilExpiry("");
      setNewCivilNumber("");
      setLoading(false);
      toast.info("ID generation failed " + String(error));
    }
  };

  // FUNCTION TO DELETE A CIVIL ID
  const deleteCivilID = async () => {
    setLoading(true);
    await supabase.from("employees").update({
      civil_number: "",
      civil_expiry: "",
      civil_DOB: "",
      modified_on: new Date(),
    }).eq("id", doc_id);
    setLoading(true);
    await AddHistory("deletion", "Deleted", "", "Civil ID");
    setCivilDelete(false);
    setLoading(false);
    setCivilNumber("");
    setCivilNumber("");
    setCivilExpiry("");
    setCivilDOB("");
    setNewCivilExpiry("");
    setNewCivilNumber("");
    fetchData();
   
  };

  // FUNCTION TO EDIT A CIVIL ID
  const EditCivilID = async () => {
    setLoading(true);
    try {
      await supabase.from("employees").update({
        civil_number: edited_civil_number ? edited_civil_number : civil_number,
        civil_expiry: edited_civil_expiry ? edited_civil_expiry : civil_expiry,
        civil_DOB: edited_civil_DOB ? edited_civil_DOB : civil_DOB,
        modified_on: new Date(),
      }).eq("id", doc_id);
      setLoading(true);
      await AddHistory("addition", "Updated", "", "Civil ID");
      setCivilNumber(edited_civil_number ? edited_civil_number : civil_number);
      setCivilExpiry(edited_civil_expiry ? edited_civil_expiry : civil_expiry);
      setCivilDOB(edited_civil_DOB ? edited_civil_DOB : civil_DOB);

      setEditcivilprompt(false);
      setLoading(false);
      fetchData();
     
    } catch (error) {
      console.log(error);
      setLoading(false);
      toast.info(String(error));
    }
  };

  {
    /* ///////////////////////////////////////////////////////////////////////////////////////////////// */
  }

  // FUNCTION TO ADD A VEHICLE ID
  const addVehicleID = async () => {
    setAddVehicleID(false);
    setLoading(true);
    try {
      await supabase.from("employees").update({
        license_number: vehicle_number,
        license_expiry: vehicle_expiry,
        license_issue: vehicle_issue,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      await AddHistory("addition", "Added", "", "Vehicle ID");
      setLoading(false);
      fetchData();
     
    } catch (error) {
      console.log(error);
      setCivilNumber("");
      setCivilExpiry("");
      setCivilDOB("");
      setNewCivilExpiry("");
      setNewCivilNumber("");
      setLoading(false);
      toast.info("ID generation failed " + String(error));
    }
  };

  // FUNCTION TO DELETE A VEHICLE ID
  const deleteVehicleID = async () => {
    setLoading(true);
    await supabase.from("employees").update({
      license_number: "",
      license_expiry: "",
      license_issue: "",
      modified_on: Timestamp.fromDate(new Date()),
    }).eq("id", doc_id);
    await AddHistory("deletion", "Deleted", "", "Vehicle ID");
    setVehicleIdDelete(false);
    setLoading(false);
    setVehicleNumber("");
    setVehicleExpiry("");
    setVehicleIssue("");
    fetchData();
   
  };

  // FUNCTION TO DELETE A MEDICAL ID
  const deleteMedicalID = async () => {
    setLoading(true);
    await supabase.from("employees").update({
      medical_completed_on: "",
      medical_due_on: "",
      modified_on: Timestamp.fromDate(new Date()),
    }).eq("id", doc_id);
    await AddHistory("deletion", "Deleted", "", "Medical");
    setDeleteMedicalIDdialog(false);
    setLoading(false);
    setCompletedOn("");
    setDueOn("");
    fetchData();
    
  };

  //FUNCTION TO EDIT VEHICLE ID
  const EditVehicleID = async () => {
    setLoading(true);
    try {
      await supabase.from("employees").update({
        license_number: edited_vehicle_number
          ? edited_vehicle_number
          : vehicle_number,
        license_expiry: edited_vehicle_expiry
          ? edited_vehicle_expiry
          : vehicle_expiry,
        license_issue: edited_vehicle_issue
          ? edited_vehicle_issue
          : vehicle_issue,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);

      await AddHistory("addition", "Updated", "", "Vehicle ID");

      setVehicleNumber(
        edited_vehicle_number ? edited_vehicle_number : vehicle_number
      );
      setVehicleExpiry(
        edited_vehicle_expiry ? edited_vehicle_expiry : vehicle_expiry
      );
      setVehicleIssue(
        edited_vehicle_issue ? edited_vehicle_issue : vehicle_issue
      );

      setEditVehicleIDprompt(false);
      setLoading(false);
      fetchData();
     
    } catch (error) {
      console.log(error);
      setLoading(false);
      toast.info(String(error));
    }
  };

  const renewVehicleID = async () => {
    setLoading(true);
    try {
      await supabase.from("employees").update({
        license_issue: edited_vehicle_issue,
        license_expiry: edited_vehicle_expiry
          ? edited_vehicle_expiry
          : vehicle_expiry,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      await AddHistory("renew", edited_vehicle_expiry, "", "Vehicle ID");
      setVehicleIssue(
        edited_vehicle_issue ? edited_vehicle_issue : vehicle_issue
      );
      setVehicleExpiry(
        edited_vehicle_expiry ? edited_vehicle_expiry : vehicle_expiry
      );
      setLoading(false);
      setRenewVehicleDialog(false);
      fetchData();
      
    } catch (error) {
      toast.error(String(error));
      setLoading(false);
    }
  };

  const addMedicalID = async () => {
    setMedicalIDdialog(false);
    setLoading(true);
    try {
      await supabase.from("employees").update({
        medical_completed_on: medical_completed_on,
        medical_due_on: medical_due_on,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      await AddHistory("addition", "Added", "", "Medical ID");
      setLoading(false);
      fetchData();
      
    } catch (error) {
      console.log(error);
      setCompletedOn("");
      setDueOn("");
      setLoading(false);
      toast.info("ID generation failed " + String(error));
    }
  };

  const EditMedicalID = async () => {
    setLoading(true);
    try {
      await supabase.from("employees").update({
        medical_completed_on: editedCompletedOn
          ? editedCompletedOn
          : medical_completed_on,
        medical_due_on: editedDueOn ? editedDueOn : medical_due_on,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      await AddHistory("addition", "Updated", "", "Medical");

      setDueOn(editedDueOn ? editedDueOn : medical_due_on);
      setCompletedOn(
        editedCompletedOn ? editedCompletedOn : medical_completed_on
      );
      setLoading(false);
      setEditMedicalIDdialog(false);
      fetchData();
    
    } catch (error) {
      toast.error(String(error));
    }
  };

  const EditPassport = async () => {
    setLoading(true);
    try {
      await supabase.from("employees").update({
        passportID: editedPassportID
          ? editedPassportID
          : passportID
          ? passportID
          : "",
        passportIssue: editedPassportIssue
          ? editedPassportIssue
          : passportIssue
          ? passportIssue
          : "",
        passportExpiry: editedPassportExpiry
          ? editedPassportExpiry
          : passportExpiry
          ? passportExpiry
          : "",
        nativePhone: editedNativePhone
          ? editedNativePhone
          : nativePhone
          ? nativePhone
          : "",
        nativeAddress: editedNativeAddress
          ? editedNativeAddress
          : nativeAddress
          ? nativeAddress
          : "",
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      await AddHistory("addition", "Updated", "", "Passport");
      setPassportID(editedPassportID ? editedPassportID : passportID);
      setPassportIssue(
        editedPassportIssue
          ? editedPassportIssue
          : passportIssue
          ? passportIssue
          : ""
      );
      setPassportExpiry(
        editedPassportExpiry
          ? editedPassportExpiry
          : passportExpiry
          ? passportExpiry
          : ""
      );
      setNativePhone(
        editedNativePhone ? editedNativePhone : nativePhone ? nativePhone : ""
      );
      setNativeAddress(
        editedNativeAddress
          ? editedNativeAddress
          : nativeAddress
          ? nativeAddress
          : ""
      );
      setLoading(false);
      setEditPassportDialog(false);
      fetchData();
     
    } catch (error) {
      toast.error(String(error));
      setLoading(false);
    }
  };

  const renewMedicalID = async () => {
    setLoading(true);
    try {
      await supabase.from("employees").update({
        medical_completed_on: editedCompletedOn
          ? editedCompletedOn
          : medical_completed_on,
        medical_due_on: editedDueOn ? editedDueOn : medical_due_on,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      await AddHistory("renew", editedCompletedOn, "", "Medical");
      setCompletedOn(
        editedCompletedOn ? editedCompletedOn : medical_completed_on
      );
      setDueOn(editedDueOn ? editedDueOn : medical_due_on);

      setLoading(false);
      setRenewMedicalIDdialog(false);
      fetchData();
     
    } catch (error) {
      toast.error(String(error));
      setLoading(false);
    }
  };

  const addPassport = async () => {
    setAddPassportDialog(false);
    setLoading(true);
    try {
      await supabase.from("employees").update({
        passportID: passportID ? passportID : "",
        passportIssue: passportIssue ? passportIssue : "",
        passportExpiry: passportExpiry,
        nativePhone: nativePhone ? nativePhone : "",
        nativeAddress: nativeAddress ? nativeAddress : "",
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      await AddHistory("addition", "Added", "", "Passport");
      setLoading(false);
      fetchData();
    
    } catch (error) {
      toast.error(String(error));
      setLoading(false);
    }
  };

  const deletePassport = async () => {
    setLoading(true);
    await supabase.from("employees").update({
      passportID: "",
      passportExpiry: "",
      passportIssue: "",
      modified_on: Timestamp.fromDate(new Date()),
    }).eq("id", doc_id);
    await AddHistory("deletion", "Deleted", "", "Passport");
    setDeletePassportDialog(false);
    setLoading(false);
    setPassportID("");
    setPassportExpiry("");
    setPassportIssue("");
    fetchData();
    
  };

  const renewPassport = async () => {
    setLoading(true);
    await supabase.from("employees").update({
      passportExpiry: editedPassportExpiry
        ? editedPassportExpiry
        : passportExpiry,
      passportIssue: editedPassportIssue ? editedPassportIssue : passportIssue,
      modified_on: Timestamp.fromDate(new Date()),
    }).eq("id", doc_id);
    await AddHistory("renew", editedPassportExpiry, "", "Passport");
    setPassportIssue(editedPassportIssue ? editedPassportIssue : passportIssue);
    setPassportExpiry(
      editedPassportExpiry ? editedPassportExpiry : passportExpiry
    );
    setLoading(false);
    setRenewPassportDialog(false);
    fetchData();
  
  };
  {
    /* ////////////////////////////////////////////////////////////////////////////////////////////////////////////// */
  }
  {
    /* ////////////////////////////////////////////////////////////////////////////////////////////////////////////// */
  }

  const handleSelect = (id: any) => {
    const index = checked.indexOf(id);
    if (index === -1) {
      setChecked((prev: any) => [...prev, id]);
    } else {
      setChecked((prev: any) => prev.filter((item: any) => item !== id));
    }
    // Update selectAll state based on whether all items are now selected
    const allSelected = records.every(
      (record: any) => checked.includes(record.id) || record.id === id
    );
    setSelectAll(allSelected);
  };

  const fetchProjects = async () => {
    try {
      setProjectsLoading(true);
      const projectSnap = await getDocs(collection(db, "projects"));
      const fetched: { id: string; name: string }[] = [];
      projectSnap.forEach((d) => {
        const data = d.data();
        if (data.name) fetched.push({ id: d.id, name: data.name });
      });
      fetched.sort((a, b) => a.name.localeCompare(b.name));
      setProjectsList(fetched);
    } catch (error) {
      console.error("Error fetching projects:", error);
      toast.error("Failed to load projects");
    } finally {
      setProjectsLoading(false);
    }
  };

  const toggleProjectAllocMode = () => {
    if (!projectAllocMode) {
      setSelectable(true);
      setProjectAllocMode(true);
      setProjectDrawerExpanded(true);
      fetchProjects();
    } else {
      setProjectAllocMode(false);
    }
  };

  const openBulkEditDialog = (field: "name" | "site") => {
    if (checked.length < 1) {
      toast.error("Select at least one record");
      return;
    }
    setBulkEditField(field);
    setBulkEditValue("");
    setBulkEditDialogOpen(true);
  };

  const handleBulkEdit = async () => {
    const value = bulkEditValue.trim();
    if (!value) {
      toast.error("Value is required");
      return;
    }
    if (checked.length < 1) {
      toast.error("Select at least one record");
      return;
    }

    try {
      setBulkEditLoading(true);
      const batch = writeBatch(db);

      checked.forEach((recordId) => {
        const recordRef = doc(db, "records", recordId);
        batch.update(recordRef, {
          [bulkEditField]: value,
          modified_on: new Date(),
        });
      });

      await batch.commit();
      toast.success(
        `${checked.length} record(s) updated: ${bulkEditField === "name" ? "Name" : "Location"}`
      );
      setBulkEditDialogOpen(false);
      setBulkEditValue("");
      setChecked([]);
      fetchData();
    } catch (error) {
      console.error("Error updating selected records:", error);
      toast.error("Failed to update selected records");
    } finally {
      setBulkEditLoading(false);
    }
  };

  const allocateToProject = async (projectId: string, projectName: string) => {
    if (checked.length < 1) {
      toast.error("Select at least one record");
      return;
    }
    try {
      setAllocatingProject(projectId);
      const batch = writeBatch(db);

      // Update each selected record's project field
      checked.forEach((recordId) => {
        const recordRef = doc(db, "records", recordId);
        batch.update(recordRef, { project: projectName });
      });

      // Update the project's assigned lists
      const selectedRecords = records.filter((r: any) => checked.includes(r.id));
      const selectedPeople = selectedRecords.map((r: any) => r.name || r.email || r.id).filter(Boolean);
      const projectRef = doc(db, "projects", projectId);
      batch.update(projectRef, {
        assignedRecordIds: checked,
        assignedUserIds: checked,
        assignedPeople: selectedPeople,
        assignedUsers: selectedPeople,
        updatedAt: new Date(),
      });

      await batch.commit();
      toast.success(`${checked.length} record(s) allocated to ${projectName}`);
      setChecked([]);
      fetchData();
    } catch (error) {
      console.error("Error allocating to project:", error);
      toast.error("Failed to allocate records");
    } finally {
      setAllocatingProject(null);
    }
  };

  const fetchProjectPersonnel = async (projectName: string) => {
    setLoadingPersonnel(true);
    try {
      const RecordCollection = collection(db, "records");
      const personnelQuery = query(
        RecordCollection,
        where("project", "==", projectName),
        where("type", "in", [props.dbCategory, "omni"])
      );
      
      const snapshot = await getDocs(personnelQuery);
      const personnel: Record[] = [];
      snapshot.forEach((doc: any) => {
        personnel.push({ id: doc.id, ...doc.data() });
      });
      
      setProjectPersonnel(personnel);
    } catch (error) {
      console.error("Error fetching project personnel:", error);
      toast.error("Failed to load project personnel");
    } finally {
      setLoadingPersonnel(false);
    }
  };

  const handleBulkDelete = async () => {
    try {
      let counts = 0;
      let percentage = 100 / checked.length;
      setLoading(true);

      const { data } = await supabase.from("employees").select("*");
      const snapshot = { docs: data?.map((d: any) => ({ id: d.id, data: () => d })) || [] };
      snapshot.docs.forEach((e: any) => {
        const itemData = e.data();
        if (itemData && itemData.profile_name) {
          deleteObject(ref(storage, itemData.profile_name)).catch(console.error);
        }
      });

      await checked.forEach(async (item: any) => {
        // console.log(item)
        await supabase.from("employees").delete().eq("id", item);
        counts++;
        setProgress(String(percentage * counts) + "%");
        setProgressItem(item);

        if (checked.length == counts) {
          setLoading(false);
          setBulkDeleteDialog(false);
          setSelectable(false);
          fetchData();
          setProgress("");
        }
      });
      await AddHistory(
        "export",
        "Bulk Deletion",
        "",
        "Bulk Deletion " + checked.length + " record(s)"
      );
    } catch (error) {
      setLoading(false);
      toast.info(String(error));
    }
  };

 

  const addTraining = async (type: any) => {
    setLoading(true);

    if (type == "hse_induction") {
      await supabase.from("employees").update({
        vt_hse_induction: EditedTrainingAddDialogInput,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      setHseInduction(EditedTrainingAddDialogInput);
    }

    if (type == "car_1") {
      await supabase.from("employees").update({
        vt_car_1: EditedTrainingAddDialogInput,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      setVtCar1(EditedTrainingAddDialogInput);
    }

    if (type == "car_2") {
      await supabase.from("employees").update({
        vt_car_2: EditedTrainingAddDialogInput,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      setVtCar2(EditedTrainingAddDialogInput);
    }

    if (type == "car_3") {
      await supabase.from("employees").update({
        vt_car_3: EditedTrainingAddDialogInput,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      setVtCar3(EditedTrainingAddDialogInput);
    }

    if (type == "car_4") {
      await supabase.from("employees").update({
        vt_car_4: EditedTrainingAddDialogInput,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      setVtCar4(EditedTrainingAddDialogInput);
    }

    if (type == "car_5") {
      await supabase.from("employees").update({
        vt_car_5: EditedTrainingAddDialogInput,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      setVtCar5(EditedTrainingAddDialogInput);
    }

    if (type == "car_6") {
      await supabase.from("employees").update({
        vt_car_6: EditedTrainingAddDialogInput,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      setVtCar6(EditedTrainingAddDialogInput);
    }

    if (type == "car_7") {
      await supabase.from("employees").update({
        vt_car_7: EditedTrainingAddDialogInput,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      setVtCar7(EditedTrainingAddDialogInput);
    }

    if (type == "car_8") {
      await supabase.from("employees").update({
        vt_car_8: EditedTrainingAddDialogInput,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      setVtCar8(EditedTrainingAddDialogInput);
    }

    if (type == "car_9") {
      await supabase.from("employees").update({
        vt_car_9: EditedTrainingAddDialogInput,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      setVtCar9(EditedTrainingAddDialogInput);
    }

    if (type == "car_10") {
      await supabase.from("employees").update({
        vt_car_10: EditedTrainingAddDialogInput,
        modified_on: Timestamp.fromDate(new Date()),
      }).eq("id", doc_id);
      setVtCar10(EditedTrainingAddDialogInput);
    }

    setLoading(false);
   
    setTrainingAddDialog(false);
    fetchData();
  };

  const handleImport = () => {
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        try {
          const data = e.target.result;
          const workbook = XLSX.read(data, {
            type: "array",
            cellDates: true,
            dateNF: "DD/MM/YYYY",
          });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];

          // Convert all date cells to DD/MM/YYYY format
          const dateColumns = [
            "civil_expiry",
            "license_expiry",
            "medical_due_on",
            "passportExpiry",
            "vt_hse_induction",
            "vt_car_1",
            "vt_car_2",
            "vt_car_3",
            "vt_car_4",
            "vt_car_5",
            "vt_car_6",
            "vt_car_7",
            "vt_car_8",
            "vt_car_9",
            "vt_car_10",
          ];
          const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");

          // Get header row to find column indices
          const headers: { [key: string]: number } = {};
          const headerRow = range.s.r;
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({ r: headerRow, c: C });
            const headerCell = worksheet[cellRef];
            if (headerCell && headerCell.v) {
              headers[headerCell.v] = C;
            }
          }

          // Process date cells
          for (let R = range.s.r + 1; R <= range.e.r; ++R) {
            for (const dateCol of dateColumns) {
              if (headers[dateCol] !== undefined) {
                const cellRef = XLSX.utils.encode_cell({
                  r: R,
                  c: headers[dateCol],
                });
                const cell = worksheet[cellRef];
                if (cell && cell.v) {
                  let formattedDate;
                  if (cell.t === "d") {
                    // Handle Excel date cells
                    formattedDate = moment(cell.v).format("DD/MM/YYYY");
                  } else {
                    // Handle string dates
                    const parsedDate = moment(cell.v, [
                      "DD/MM/YYYY",
                      "M/D/YYYY",
                      "YYYY-MM-DD",
                    ]);
                    if (parsedDate.isValid()) {
                      formattedDate = parsedDate.format("DD/MM/YYYY");
                    }
                  }
                  if (formattedDate) {
                    cell.v = formattedDate;
                    cell.t = "s"; // Set type to string
                  }
                }
              }
            }
          }

          const parsedJson = XLSX.utils.sheet_to_json(worksheet);
          const jsonString = JSON.stringify(parsedJson, null, 2);
          const parsedData = JSON.parse(jsonString);
          setJsonData(parsedData);

          // Note: This only checks against currently loaded records in memory
          // Actual duplicate check happens during upload against all database records
          const duplicates = parsedData.filter(
            (newRecord: any) =>
              newRecord.id && // Has ID field
              records.some(
                (existingRecord) => existingRecord.id === newRecord.id
              )
          );

          setDuplicateRecords(duplicates);
        } catch (error) {
          console.error(error);
          toast.error("Error reading file");
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  // const [overwriteDialog, setOverwriteDialog] = useState(false);
  // const [existingRecords, setExistingRecords] = useState<any[]>([]);
  // const [pendingImport, setPendingImport] = useState<any[]>([]);

  const uploadJson = async () => {
    setLoading(true);
    setProgress("0%");
    setProgressItem("Preparing import...");

    try {
      let newCount = 0;
      let updateCount = 0;
      let errorCount = 0;
      const totalRecords = jsonData.length;

      setProgress("5%");
      await AddHistory(
        "import",
        "",
        "",
        jsonData.length + " records from XLSX"
      );

      // OPTIMIZATION 1: Batch fetch all existing IDs upfront
      setProgress("10%");
      setProgressItem("Checking for existing records...");
      const idsToCheck = jsonData
        .map((r: any) => r.id)
        .filter((id: string) => id && id.trim() !== "");
      
      const existingIds = new Set<string>();
      if (idsToCheck.length > 0) {
        // Fetch in chunks of 10 due to Firestore 'in' query limit
        const chunkSize = 10;
        const totalChunks = Math.ceil(idsToCheck.length / chunkSize);
        
        for (let i = 0; i < idsToCheck.length; i += chunkSize) {
          const chunk = idsToCheck.slice(i, i + chunkSize);
          const { data } = await supabase.from("employees").select("id").in("id", chunk);
          data?.forEach((doc) => existingIds.add(doc.id));
          
          // Show progress during ID checking (10% to 20%)
          const chunkProgress = Math.floor(i / chunkSize) + 1;
          const idsChecked = Math.min(i + chunkSize, idsToCheck.length);
          const checkProgress = 10 + Math.round((chunkProgress / totalChunks) * 10);
          setProgress(`${checkProgress}%`);
          setProgressItem(`Checked ${idsChecked}/${idsToCheck.length} IDs - Found ${existingIds.size} existing`);
        }
      }

      setProgress("20%");
      setProgressItem("Processing records...");
      
      const batchSize = 500;
      const batches = [];
      let currentBatch = writeBatch(db);
      let currentBatchSize = 0;
      let processedCount = 0;
      
      // OPTIMIZATION 2: Update progress every 10 records or 2% progress, whichever is more frequent
      const progressUpdateInterval = Math.min(10, Math.max(1, Math.floor(totalRecords / 50)));
      let lastUpdate = 0;

      for (const record of jsonData) {
        try {
          const { id, ...recordWithoutId } = record;
          
          processedCount++;
          
          // Update progress more frequently (20% to 90% range)
          if (processedCount - lastUpdate >= progressUpdateInterval || processedCount === totalRecords) {
            const processingProgress = (processedCount / totalRecords);
            const progressPercent = Math.round(20 + (processingProgress * 70)); // 20% to 90%
            setProgress(`${progressPercent}%`);
            setProgressItem(`Processing ${processedCount}/${totalRecords} (${newCount} new, ${updateCount} updates)`);
            lastUpdate = processedCount;
          }
          
          const processedRecord = {
            ...recordWithoutId,
            emp_type: record.type == "omni" ? "omni" : props.dbCategory,
            modified_on: new Date(),
            notify: true,
            state: "active",
            email: record.email || "",
            dateofJoin: record.dateofJoin
              ? moment(record.dateofJoin, "DD/MM/YYYY").format("DD/MM/YYYY")
              : "",
            salaryBasic: record.initialSalary || 0,
            allowance: record.initialAllowance || 0,
          };

          let docRef;
          let isUpdate = false;

          // OPTIMIZATION 3: Use pre-fetched existingIds instead of individual getDoc
          if (id && id.trim() !== "") {
            if (existingIds.has(id)) {
              // Update existing record
              docRef = doc(db, "records", id);
              isUpdate = true;
            } else {
              // ID provided but doesn't exist, create new with generated ID
              docRef = doc(collection(db, "records"));
              processedRecord.created_on = new Date();
            }
          } else {
            // No ID provided, create new record
            docRef = doc(collection(db, "records"));
            processedRecord.created_on = new Date();
          }

          currentBatch.set(docRef, processedRecord, { merge: isUpdate });
          currentBatchSize++;
          
          if (isUpdate) {
            updateCount++;
          } else {
            newCount++;
          }

          if (currentBatchSize === batchSize) {
            batches.push(currentBatch);
            currentBatch = writeBatch(db);
            currentBatchSize = 0;
          }
        } catch (error) {
          console.error("Error processing record:", error);
          errorCount++;
        }
      }

      if (currentBatchSize > 0) {
        batches.push(currentBatch);
      }

      setProgress("95%");
      setProgressItem(`Saving to database... (${newCount} new, ${updateCount} updates)`);
      await Promise.all(batches.map((batch) => batch.commit()));
      
      setProgress("100%");
      setProgressItem(`Complete! ${newCount} new records added, ${updateCount} records updated`);

      const messages = [];
      if (newCount > 0) messages.push(`${newCount} new`);
      if (updateCount > 0) messages.push(`${updateCount} updated`);
      
      toast.success(`Imported ${messages.join(", ")} records successfully`);
      if (errorCount > 0) {
        toast.warning(`Failed to import ${errorCount} records`);
      }

      
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to import records");
    } finally {
      setLoading(false);
      setProgress("");
      setProgressItem("");
      setImportDialog(false);
      setFile(null);
      setJsonData([]);
      fetchData();
    }
  };

  

  // Add effect to handle sort changes
  useEffect(() => {
    fetchData();
  }, [sortby]);




 





 

 

  const handleExportExpiring = async () => {
    try {
      setExportLoading(true);
      
      // Fetch ALL records to ensure we get all expiring documents
      const RecordCollection = collection(db, "records");
      const recordQuery = query(
        RecordCollection,
        where("type", "in", [props.dbCategory, "omni"]),
        where("state", "==", "active")
      );
      const querySnapshot = await getDocs(recordQuery);
      const allRecords: any[] = [];
      
      querySnapshot.forEach((doc: any) => {
        allRecords.push({ id: doc.id, ...doc.data() });
      });
      
      await exportExpiringRecords(allRecords);
      setExportDialog(false);
      
    } catch (error) {
      console.error("Error exporting expiring records:", error);
      toast.error("Failed to export expiring records");
    } finally {
      setExportLoading(false);
    }
  };

  // const handleImportExpiring = async (
  //   e: React.ChangeEvent<HTMLInputElement>
  // ) => {
  //   const file = e.target.files?.[0];
  //   if (file) {
  //     try {
  //       setImportLoading(true);
  //       await importExpiringRecords(file);
  //       setImportDialog(false);
  //       window.location.reload();
  //       fetchData();
  //     } catch (error) {
  //       console.error("Error importing updates:", error);
  //       message.error("Failed to import updates");
  //     } finally {
  //       setImportLoading(false);
  //     }
  //   }
  // };

  // Add state for tracking duplicate records near other state declarations
  const [duplicateRecords, setDuplicateRecords] = useState<any[]>([]);

  return (
    <>
      {status == "false" ? (
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>
          <div
            style={{
              display: "flex",
              width: "100%",
              background: "crimson",
              height: "1.5rem",
              justifyContent: "center",
              alignItems: "center",
              position: "fixed",
              bottom: 0,
            }}
          >
            <div
              style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
            >
              <RadioTower width={"0.75rem"} />
              <p style={{ fontSize: "0.75rem" }}>No Internet</p>
            </div>
          </div>
        </motion.div>
      ) : null}

      {/* Main Container */}
      <div
        style={{
          padding: "1.25rem",
          height: "100svh",
          border: "",
          // background:
          //   "linear-gradient(rgba(67 57 129/ 30%), rgba(100 100 100/ 0%)",
        }}
      >
        {/* Main Component */}
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>
          {/* BACK BUTTON */}
          <Back
            editMode={access}
            title={props.title}
            subtitle={totalRecords}
            extra={
              !selectable ? (
                <div
                  className="transitions"
                  style={{ display: "flex", gap: "0.5rem", height: "2.75rem" }}
                >
                  {/* <button style={{cursor:"default", width:"5rem", fontSize:"0.9rem", opacity:0.5}}>
                            
                            Ctrl + I
                        </button> */}

                  <RefreshButton
                    onClick={() => fetchData()}
                    refreshCompleted={refreshCompleted}
                    fetchingData={fetchingData}
                  />

                  {access && (
                    <div style={{ display: "flex" }} className="transitions">
                      <DbDropDown
                      
                        onUpload={() => setImportDialog(true)}
                        onExport={() => setExportDialog(true)}
                        onInbox={() => usenavigate("/inbox")}
                        onArchives={() => usenavigate("/archives")}
                        onExportExpiring={handleExportExpiring}
                        onImportExpiring={() =>
                          document.getElementById("excelImport")?.click()
                        }
                        trigger={<EllipsisVerticalIcon width={"1rem"} />}
                      />
                    </div>
                  )}
                  {!access && (
                    <div style={{ display: "flex" }} className="transitions">
                      <Tooltip title="Ctrl + I">
                        <button
                          className=""
                          onClick={() => usenavigate("/inbox")}
                          style={{
                            width: "3rem",
                            background: "rgba(220 20 60/ 20%)",
                          }}
                        >
                          <Inbox
                            className=""
                            color="crimson"
                            width={"1.25rem"}
                          />
                        </button>
                      </Tooltip>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="transitions"
                  onClick={() => {
                    const newSelectAll = !selectAll;
                    setSelectAll(newSelectAll);
                    if (newSelectAll) {
                      const allIds = records.map((item: any) => item.id);
                      setChecked(allIds);
                    } else {
                      setChecked([]);
                    }
                  }}
                  style={{
                    height: "2.25rem",
                    border: "",
                    width: "",
                    background: "rgba(100 100 100/ 10%)",
                    padding: "0.5rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingLeft: "1rem",
                    paddingRight: "1rem",
                    borderRadius: "0.5rem",
                    cursor: "pointer",
                    marginTop: "0.25rem",
                    marginBottom: "0.25rem",
                    gap: "1rem",
                  }}
                >
                  <Check color="mediumslateblue" />
                  <p style={{ fontWeight: 600 }}>{checked.length}</p>
                </div>
              )
            }
          />
          <br />

          {
            // if page doesn't load :

            // IF NUMBER OF RECORDS IS LESS THAN 1
            records.length < 1 ? (
              status == "false" ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "75svh",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      border: "",
                      flexFlow: "column",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "0.25rem",
                        opacity: "0.5",
                      }}
                    >
                      <RadioTower width={"1rem"} />
                      <p>No Internet Connection</p>
                    </div>
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                    >
                      <p style={{ opacity: 0.5, fontSize: "0.7rem" }}>
                        Please check your internet connectivity
                      </p>
                    </motion.div>
                  </div>
                </motion.div>
              ) : fetchingData && !hasInitialData ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "75svh",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      border: "",
                    }}
                  >
                    <div
                      style={{
                        border: "",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {props.loader}
                    </div>
                  </div>
                </motion.div>
              ) : (
                // DISPLAY EMPTY SET - PAGE
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "75svh",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      border: "",
                      flexFlow: "column",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "0.25rem",
                        opacity: "0.5",
                      }}
                    >
                      <PackageOpen width={"1rem"} />
                      <p>No Data</p>
                    </div>

                    <p style={{ opacity: 0.5, fontSize: "0.7rem" }}>
                      Add a record using + Add Record
                    </p>
                  </div>
                </motion.div>
              )
            ) : (
              //else

              //DISPLAY Page Beginning
              <div
                style={{
                  display: "flex",
                  flexFlow: "column",
                  gap: "0.5rem",
                  marginTop: "1",
                }}
              >
                {/* Searchbar */}
                <div
                  className="transitions"
                  style={{
                    display: "flex",
                    gap: "0.35rem",
                    padding: "",

                    borderRadius: "0.85rem",
                    flex: 1,
                  }}
                >
                  {access && (
                    <button
                      
                      style={{background:selectable?"darkblue":""}}
                      onClick={() => {
                        if (selectable) {
                          setProjectAllocMode(false);
                          setSelectable(false);
                          setChecked([]);
                          setSelectAll(false);
                        } else {
                          setSelectable(true);
                        }
                      }}
                      title={selectable ? "Exit Selection" : "Select Records"}
                    >
                      <CheckSquare2
                        color={selectable? "white" : "darkblue"}
                      />
                    </button>
                  )}
                  {access && selectable && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          style={{
                            minWidth: "2.5rem",
                        
                            paddingInline: "0.65rem",
                            background: "rgba(100 100 100/ 10%)",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.35rem",
                          }}
                          title="Actions for selected"
                        >
                          <EllipsisVerticalIcon width="1rem" color="mediumslateblue" />
                          {/* <span style={{ fontSize: "0.75rem", color: "mediumslateblue", fontWeight: 600 }}>
                            {checked.length}
                          </span> */}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" style={{ width: "230px", padding: "0.5rem" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                          <p style={{ fontSize: "0.72rem", opacity: 0.6, padding: "0.15rem 0.35rem" }}>
                            Actions for selected items
                          </p>

                          <button
                            onClick={() => {
                              if (checked.length < 1) {
                                toast.error("Select at least one record");
                                return;
                              }
                              setProjectAllocMode(true);
                              setProjectDrawerExpanded(true);
                              fetchProjects();
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-start",
                              gap: "0.5rem",
                              padding: "0.6rem 0.65rem",
                              borderRadius: "0.5rem",
                              // border: "1px solid rgba(100,100,100,0.12)",
                              background: projectAllocMode ? "rgba(30,144,255,0.12)" : "rgba(100,100,100,0.03)",
                            }}
                          >
                            <FolderKanban width="0.95rem" color="mediumslateblue" />
                            <span style={{ fontSize: "0.82rem" }}>Allocate Project</span>
                          </button>

                          <button
                            onClick={() => openBulkEditDialog("site")}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-start",
                              gap: "0.5rem",
                              padding: "0.6rem 0.65rem",
                              borderRadius: "0.5rem",
                              // border: "1px solid rgba(100,100,100,0.12)",
                              background: "rgba(100,100,100,0.03)",
                            }}
                          >
                            <Globe width="0.95rem" color="mediumslateblue" />
                            <span style={{ fontSize: "0.82rem" }}>Set Location (Site)</span>
                          </button>

                          <button
                            onClick={() => openBulkEditDialog("name")}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-start",
                              gap: "0.5rem",
                              padding: "0.6rem 0.65rem",
                              borderRadius: "0.5rem",
                              // border: "1px solid rgba(100,100,100,0.12)",
                              background: "rgba(100,100,100,0.03)",
                            }}
                          >
                            <PenLine width="0.95rem" color="darkblue" />
                            <span style={{ fontSize: "0.82rem" }}>Rename Selected</span>
                          </button>

                          <button
                            onClick={() => {
                              if (checked.length < 1) {
                                toast.error("Select at least one record");
                                return;
                              }
                              setBulkDeleteDialog(true);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-start",
                              gap: "0.5rem",
                              padding: "0.6rem 0.65rem",
                              borderRadius: "0.5rem",
                              // border: "1px solid rgba(220,20,60,0.2)",
                              background: "rgba(220,20,60,0.08)",
                            }}
                          >
                            <Trash width="0.95rem" color="crimson" />
                            <span style={{ fontSize: "0.82rem", color: "crimson" }}>Delete Selected</span>
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}

                  <SearchBar
                    placeholder="Search"
                    onChange={(e: any) => {
                      setSearch(e.target.value.toLowerCase());
                    }}
                  />
                  <button 
                    onClick={() => setViewMode(viewMode === "directive" ? "table" : "directive")}
                    style={{width:"2.5rem", background:viewMode === "table" ? "mediumslateblue" : "rgba(100 100 100/ 10%)"}}
                    className={viewMode === "table" ? "" : ""}
                  >
                    {viewMode === "directive" ? (
                      <Table2 width={"1rem"} color="darkblue" />
                    ) : (
                      <Table2 width={"1rem"} color="white" />
                    )}
                  </button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button style={{ width: "2.5rem", position: "relative" }}>
                        <Filter color="darkblue" width={"1rem"} />
                        {activeFilterCount > 0 && (
                          <span
                            style={{
                              position: "absolute",
                              top: "0.2rem",
                              right: "0.2rem",
                              background: "darkblue",
                              color: "white",
                              fontSize: "0.6rem",
                              fontWeight: 700,
                              width: "0.95rem",
                              height: "0.95rem",
                              borderRadius: "999px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {activeFilterCount}
                          </span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" style={{ width: "260px", padding: 0 }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {/* Sort Section */}
                        <div style={{ padding: "0.75rem 1rem 0.5rem" }}>
                          <p style={{ fontSize: "0.7rem", fontWeight: 600, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>Sort by</p>
                          <div style={{ display: "flex", gap: "0.375rem" }}>
                            {[
                              { value: "name", label: "Name", icon: <ArrowDownAZ width="0.875rem" /> },
                              { value: "created_on", label: "Date", icon: <ListStart width="0.875rem" /> },
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => {
                                  setSortBy(opt.value);
                                  setLastDoc(null);
                                }}
                                style={{
                                  flex: 1,
                                  padding: "0.5rem",
                                  borderRadius: "0.5rem",
                                  fontSize: "0.8rem",
                                  fontWeight: 500,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "0.35rem",
                                  background: sortby === opt.value ? "darkblue" : "rgba(100,100,100,0.06)",
                                  color: sortby === opt.value ? "white" : "inherit",
                                  cursor: "pointer",
                                  border: sortby === opt.value ? "1px solid rgba(30,144,255,0.25)" : "1px solid transparent",
                                }}
                              >
                                {opt.icon}
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div style={{ height: "1px", background: "rgba(100,100,100,0.1)", margin: "0.25rem 1rem" }} />

                        {/* Filter Section */}
                        <div style={{ padding: "0.5rem 1rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <p style={{ fontSize: "0.7rem", fontWeight: 600, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Filter</p>
                            {activeFilterCount > 0 && (
                              <button
                                onClick={() => {
                                  setFilterProject("");
                                  setFilterDesignation("");
                                  setFilterCompany("");
                                }}
                                style={{ fontSize: "0.7rem", color: "mediumslateblue", background: "none", border: "none", cursor: "pointer", padding: "0.15rem 0.35rem", borderRadius: "0.25rem" }}
                              >
                                Clear all
                              </button>
                            )}
                          </div>

                          {/* Project filter */}
                          <Select value={filterProject} onValueChange={(v) => setFilterProject(v === "__all__" ? "" : v)}>
                            <SelectTrigger style={{ width: "100%", fontSize: "0.8rem", justifyContent: "space-between" }}>
                              <span style={{ opacity: filterProject ? 1 : 0.5 }}>
                                {filterProject || "Project"}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__" style={{ justifyContent: "flex-start" }}>All Projects</SelectItem>
                              {uniqueProjects.map((p) => (
                                <SelectItem key={p} value={p} style={{ justifyContent: "flex-start" }}>{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Designation filter */}
                          <Select value={filterDesignation} onValueChange={(v) => setFilterDesignation(v === "__all__" ? "" : v)}>
                            <SelectTrigger style={{ width: "100%", fontSize: "0.8rem", justifyContent: "space-between" }}>
                              <span style={{ opacity: filterDesignation ? 1 : 0.5 }}>
                                {filterDesignation || "Designation"}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__" style={{ justifyContent: "flex-start" }}>All Designations</SelectItem>
                              {uniqueDesignations.map((d) => (
                                <SelectItem key={d} value={d} style={{ justifyContent: "flex-start" }}>{d}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Company filter */}
                          <Select value={filterCompany} onValueChange={(v) => setFilterCompany(v === "__all__" ? "" : v)}>
                            <SelectTrigger style={{ width: "100%", fontSize: "0.8rem", justifyContent: "space-between" }}>
                              <span style={{ opacity: filterCompany ? 1 : 0.5 }}>
                                {filterCompany || "Company"}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__" style={{ justifyContent: "flex-start" }}>All Companies</SelectItem>
                              {uniqueCompanies.map((c) => (
                                <SelectItem key={c} value={c} style={{ justifyContent: "flex-start" }}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* <button
                    onClick={() => setThumbnails(!thumbnails)}
                    style={{
                      width: "fit-content",
                      fontSize: "0.7rem",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {thumbnails ? (
                      <ImageOff style={{ opacity: 0.5 }} width={"1.5rem"} />
                    ) : (
                      <Image color="mediumslateblue" width={"1.5rem"} />
                    )}
                  
                  </button> */}

              
                 


                  {/* <button onClick={()=>setImportDialog(true)}>
                            <UploadCloud color="salmon"/>
                        </button> */}

                  {/* <button>
                            <ArrowDownAZ color="mediumslateblue"/>
                        </button> */}
                </div>

                <p style={{ height: "0.25rem" }} />

                <div
                  ref={scrollContainerRef}
                  className="record-list"
                  style={{
                    overflowY: "auto",
                    overflowX: viewMode === "table" ? "auto" : "hidden",
                    height: "74svh",
                    padding: "0.25rem",
                    willChange: "scroll-position",
                    contain: viewMode === "table" ? "none" : "paint",
                  }}
                >
                  {viewMode === "directive" ? (
                    // DIRECTIVE VIEW (GRID)
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      style={{
                        display: "grid",
                        gap: "0.75rem",
                        gridTemplateColumns: "repeat(auto-fill, minmax(min(350px, 100%), 1fr))",
                        maxWidth: "100%",
                        paddingTop:"1rem",
                        paddingBottom:"5rem"
                      }}
                    >
                    {
                      // RECORD DATA MAPPING
                      filteredRecords
                        .map((post: any) => (
                          // <motion.div
                          //   key={post.id}
                          //   initial={{ opacity: 0 }}
                          //   whileInView={{ opacity: 1 }}
                          // >
                          <Directive
                            icon={<FileArchive color="darkblue"/>}
                            noArrow
id_subtitle={[post.emp_id ? `ID: ${post.emp_id}` : "", post.phone ? `Ph: ${post.phone}` : "", (post.CUG || post.cug) ? `CUG: ${post.CUG || post.cug}` : ""].filter(Boolean).join(" | ") || "No details"}
                            className="record-item"
                            space
                            dotColor={selectable ? "violet" : "mediumslateblue"}
                            notify={!post.notify}
                            archived={post.state == "archived" ? true : false}
                            expiring={isRecordExpiring(post)}
                            // tag={
                            //   post.civil_expiry != "" ||
                            //   post.license_expiry != "" ||
                            //   post.medical_due_on != "" ||
                            //   post.passportExpiry != "" ||
                            //   post.vt_hse_induction != "" ||
                            //   post.vt_car_1 != "" ||
                            //   post.vt_car_2 != "" ||
                            //   post.vt_car_3 != "" ||
                            //   post.vt_car_4 != "" ||
                            //   post.vt_car_5 != "" ||
                            //   post.vt_car_6 != "" ||
                            //   post.vt_car_7 != "" ||
                            //   post.vt_car_8 != "" ||
                            //   post.vt_car_9 != "" ||
                            //   post.vt_car_10 != "" ? (
                            //     ""
                            //   ) : (
                            //     <FileWarning width={"1rem"} />
                            //   )
                            // }
                            selected={checked.includes(post.id)}
                            selectable={selectable}
                            status
                            // ON CLICK
                            onSelect={() => {
                              handleSelect(post.id);
                            }}
                            onClick={() => {
                              // Save scroll position before navigating
                              if (scrollContainerRef.current) {
                                sessionStorage.setItem('database-scroll-position', scrollContainerRef.current.scrollTop.toString());
                              }
                              usenavigate(`/record/${post.id}`, { state: { record: post } });
                            }}
                            key={post.id}
                            title={post.name.toLowerCase()}
                            // icon={
                            //   thumbnails ? (
                            //     <UserCircle
                            //       color="mediumslateblue"
                            //       width={"1.75rem"}
                            //       height={"1.75rem"}
                            //     />
                            //   ) : (
                            //     <div
                                  
                            //     >
                            //       <LazyLoader
                            //         gradient
                            //         name={post.name}
                            //         type={post.type}
                            //         profile={post.profile}
                            //         block
                            //         state={post.state}
                            //         omni={post.type == "omni"}
                            //       />
                            //     </div>
                            //   )
                            // }
                          />
                          // </motion.div>
                        ))
                    }
                    {hasMore && (
                      <div
                        id="load-more-trigger"
                        style={{
                          width: "100%",
                          padding: "2rem 0",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          opacity: fetchingData ? 1 : 0.3,
                          gridColumn: "1 / -1",
                        }}
                      >
                        {fetchingData && (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", opacity: 0.6 }}>
                            <Loader className="animate-spin" width="1.25rem" />
                            <span style={{ fontSize: "0.875rem" }}></span>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                  ) : (
                    // TABLE VIEW
                    <motion.div
                      // initial={{ opacity: 0 }}
                      // whileInView={{ opacity: 1 }}
                      style={{
                        paddingTop: "0.25rem",
                        paddingBottom: "5rem",
                        position: "relative"
                      }}
                    >
                      <table style={{
                        width: "100%",
                        borderCollapse: "separate",
                        borderSpacing: 0,
                        fontSize: "0.9rem"
                      }}>
                        <thead style={{backdropFilter:"blur(16px)"}}>
                          <tr style={{
                            borderBottom: "2px solid rgba(100 100 100/ 20%)"
                          }}>
                            {selectable && (
                              <th style={{ padding: "0.75rem", textAlign: "left", width: "40px", position: "sticky", top: 0, left: 0, zIndex: 4, background: "color-mix(in srgb, var(--background) 94%, rgba(100, 100, 100, 0.12))", boxShadow: "inset 0 -1px 0 rgba(100 100 100/ 20%), 1px 0 0 rgba(100 100 100/ 10%)" }}>
                                <CheckSquare2 width="1rem" color="darkblue" />
                              </th>
                            )}
                            {allKeys.map((key) => (
                              <th
                                key={key}
                                style={{
                                  padding: "0.75rem",
                                  textAlign: "left",
                                  whiteSpace: "nowrap",
                                  position: "sticky",
                                  top: 0,
                                  zIndex: 2,
                                  background: "color-mix(in srgb, var(--background) 94%, rgba(100, 100, 100, 0.12))",
                                  boxShadow: "inset 0 -1px 0 rgba(100 100 100/ 20%)"
                                }}
                              >
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRecords
                            .map((post: any) => (
                              <tr
                                key={post.id}
                                style={{
                                  borderBottom: "1px solid rgba(100 100 100/ 10%)",
                                  cursor: "pointer",
                                  transition: "background 0.2s",
                                  background: checked.includes(post.id) ? "rgba(138 43 226/ 10%)" : "transparent"
                                }}
                                onMouseEnter={(e) => {
                                  if (!checked.includes(post.id)) {
                                    e.currentTarget.style.background = "rgba(100 100 100/ 5%)";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!checked.includes(post.id)) {
                                    e.currentTarget.style.background = "transparent";
                                  }
                                }}
                                onClick={() => {
                                  if (!selectable) {
                                    // Save scroll position before navigating
                                    if (scrollContainerRef.current) {
                                      sessionStorage.setItem('database-scroll-position', scrollContainerRef.current.scrollTop.toString());
                                    }
                                    usenavigate(`/record/${post.id}`, { state: { record: post } });
                                  }
                                }}
                              >
                                {selectable && (
                                  <td 
                                    style={{ padding: "0.75rem", position: "sticky", left: 0, zIndex: 1, background: "var(--background)" }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelect(post.id);
                                    }}
                                  >
                                    <div style={{
                                      width: "1.25rem",
                                      height: "1.25rem",
                                      borderRadius: "0.25rem",
                                      border: checked.includes(post.id) ? "2px solid violet" : "2px solid rgba(100 100 100/ 30%)",
                                      background: checked.includes(post.id) ? "violet" : "transparent",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center"
                                    }}>
                                      {checked.includes(post.id) && <Check width="0.85rem" color="white" />}
                                    </div>
                                  </td>
                                )}
                                {allKeys.map((key) => {
                                  const value = (post as any)[key];

                                  // Special handling for created_on field
                                  if (key === "created_on") {
                                    if (!value) {
                                      return (
                                        <td key={key} style={{ padding: "0.75rem", fontSize: "0.85rem", color: "rgba(0 0 0/ 60%)" }}>
                                          -
                                        </td>
                                      );
                                    }

                                    let content: React.ReactNode = "-";
                                    try {
                                      const dateObj = typeof value.toDate === "function" ? value.toDate() : new Date(value);
                                      if (!isNaN(dateObj.getTime())) {
                                        content = <ReactTimeAgo date={dateObj} locale="en-US" />;
                                      }
                                    } catch (e) {
                                      content = "Invalid Date";
                                    }

                                    return (
                                      <td key={key} style={{ padding: "0.75rem", fontSize: "0.85rem", color: "rgba(0 0 0/ 60%)" }}>
                                        {content}
                                      </td>
                                    );
                                  }

                                  // Default rendering for all other fields
                                  let displayValue: React.ReactNode;
                                  if (value === null || value === undefined || value === "") {
                                    displayValue = "-";
                                  } else if (typeof value === "object") {
                                    displayValue = JSON.stringify(value);
                                  } else {
                                    displayValue = String(value);
                                  }

                                  return (
                                    <td key={key} style={{ padding: "0.75rem", fontSize: "0.85rem", textTransform: key === "type" ? "capitalize" : "none" }}>
                                      {displayValue}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))
                          }
                        </tbody>
                      </table>
                      {hasMore && (
                        <div
                          id="load-more-trigger"
                          style={{
                            width: "100%",
                            padding: "2rem 0",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            opacity: fetchingData ? 1 : 0.3,
                            marginTop: "1rem"
                          }}
                        >
                          {fetchingData && (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", opacity: 0.6 }}>
                              <Loader2 className="animate-spin" width="1.25rem" />
                              <span style={{ fontSize: "0.875rem" }}>Loading more records...</span>
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              </div>
            )
          }

       

          {/* <Pagination style={{cursor:"pointer"}}>
                    <PaginationContent>

                        <PaginationItem>
                            <PaginationLink>
                                <ChevronLeft width="1rem" height="1rem"/>
                            </PaginationLink>
                        </PaginationItem>

                        <PaginationItem>
                            <PaginationLink isActive>1</PaginationLink>
                        </PaginationItem>

                        <PaginationItem>
                            <PaginationLink>2</PaginationLink>
                        </PaginationItem>
                        
                        <PaginationItem>
                            <PaginationLink><Ellipsis width="1rem" height="1rem"/></PaginationLink>
                        </PaginationItem>

                        <PaginationItem>
                            <PaginationNext/>
                        </PaginationItem>

                    </PaginationContent>
                </Pagination> */}
        </motion.div>

        {/* ADD RECORD BUTTON */}

        {access && !projectAllocMode && (
          <AddRecordButton
            onClickSwap={selectable}
            onClick={() => {
              setAddDialog(true);
              setName("");
              setEmail("");
              setEmployeeCode("");
              setCompanyName("");
              setDateofJoin("");
              setSalaryBasic(0);
              setAllowance(0);
              setContact("");
            }}
            alternateOnClick={() => {
              checked.length < 1 ? null : setBulkDeleteDialog(true);
            }}
            icon={
              selectable ? (
                <Trash color={checked.length < 1 ? "#5a5a5a" : "crimson"} />
              ) : (
                <Plus color="mediumslateblue" />
              )
            }
          />
        )}

        {/* PROJECT ALLOCATION DRAWER */}
        {projectAllocMode && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 50,
              background: "white",
              borderTop: "1px solid rgba(100, 100, 100, 0.15)",
              boxShadow: "0 -4px 24px rgba(0, 0, 0, 0.12)",
              borderRadius: "1.25rem 1.25rem 0 0",
              display: "flex",
              flexDirection: "column",
              maxHeight: projectDrawerExpanded ? "40vh" : "3.5rem",
              transition: "max-height 0.3s ease",
            }}
          >
            {/* Drawer Header */}
            <div
              onClick={() => setProjectDrawerExpanded(!projectDrawerExpanded)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.875rem 1.25rem",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
             
                <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                  Allocate to Project
                </span>
                {checked.length > 0 && (
                  <span
                    style={{
                      background: "mediumslateblue",
                      color: "white",
                      fontSize: "0.75rem",
                      fontWeight: 500,
                      padding: "0.15rem 0.55rem",
                      borderRadius: "999px",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {checked.length} selected
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleProjectAllocMode();
                  }}
                  style={{
                    background: "rgba(100,100,100,0.08)",
                    border: "none",
                    borderRadius: "0.5rem",
                    padding: "0.375rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <X width="1rem" height="1rem" />
                </button>
                {projectDrawerExpanded ? (
                  <ChevronDown width="1.125rem" height="1.125rem" style={{ opacity: 0.5 }} />
                ) : (
                  <ChevronUp width="1.125rem" height="1.125rem" style={{ opacity: 0.5 }} />
                )}
              </div>
            </div>

            {/* Drawer Content */}
            {projectDrawerExpanded && (
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "0 1.25rem 1.25rem",
                  minHeight: 0,
                }}
              >
                {projectsLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "1.5rem" }}>
                    <Loader2 className="animate-spin" width="1.25rem" />
                  </div>
                ) : projectsList.length === 0 ? (
                  <p style={{ textAlign: "center", opacity: 0.5, fontSize: "0.875rem", padding: "1rem" }}>
                    No projects found
                  </p>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                      gap: "0.625rem",
                    }}
                  >
                    {projectsList.map((project) => (
                      <div
                        key={project.id}
                        style={{
                          position: "relative",
                          display: "flex",
                          borderRadius: "0.75rem",
                          background:
                            allocatingProject === project.id
                              ? "rgba(123, 104, 238, 0.15)"
                              : checked.length < 1
                              ? "rgba(100, 100, 100, 0.04)"
                              : "rgba(100, 100, 100, 0.06)",
                        }}
                      >
                        <motion.button
                          whileTap={{ scale: 0.96 }}
                          onClick={() => {
                            if (checked.length < 1) {
                              toast.error("Select at least one record");
                              return;
                            }
                            setPendingProject(project);
                          }}
                          disabled={checked.length < 1 || allocatingProject !== null}
                          style={{
                            flex: 1,
                            padding: "0.75rem 0.75rem 0.75rem 1rem",
                            borderRadius: "0.75rem 0 0 0.75rem",
                            background: "transparent",
                            border: "none",
                            cursor: checked.length < 1 ? "not-allowed" : "pointer",
                            textAlign: "left",
                            display: "flex",
                            justifyContent: "flex-start",
                            alignItems: "center",
                            gap: "0.5rem",
                            opacity: checked.length < 1 ? 0.5 : 1,
                            transition: "all 0.15s ease",
                          }}
                        >
                          {allocatingProject === project.id ? (
                            <Loader2 className="animate-spin" width="1rem" height="1rem" />
                          ) : (
                            <FolderKanban width="1rem" height="1rem" color="mediumslateblue" />
                          )}
                          <span
                            style={{
                              fontSize: "0.85rem",
                              fontWeight: 500,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {project.name}
                          </span>
                        </motion.button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingProject(project);
                            fetchProjectPersonnel(project.name);
                          }}
                          style={{
                            padding: "0.75rem",
                            borderRadius: "0 0.75rem 0.75rem 0",
                            background: "transparent",
                            border: "none",
                            borderLeft: "1px solid rgba(100, 100, 100, 0.1)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "background 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(100, 100, 100, 0.08)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <Info width="1rem" height="1rem" color="mediumslateblue" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* PROJECT ALLOCATION CONFIRMATION */}
        <ResponsiveModal
          open={!!pendingProject}
          onOpenChange={(open) => { if (!open) setPendingProject(null); }}
          title="Confirm Allocation"
          description={`Allocate ${checked.length} record(s) to ${pendingProject?.name || ""}?`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1.5rem", paddingTop: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.875rem 1rem", borderRadius: "0.75rem", background: "rgba(30, 144, 255, 0.08)" }}>
              <FolderKanban width="1.125rem" height="1.125rem" color="mediumslateblue" />
              <span style={{ fontWeight: 600, fontSize: "1rem" }}>{pendingProject?.name}</span>
            </div>
            <p style={{ fontSize: "0.875rem", opacity: 0.6 }}>
              {checked.length} record(s) will have their project updated.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={() => setPendingProject(null)}
                style={{
                  flex: 1,
                  padding: "0.875rem",
                  borderRadius: "0.75rem",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  background: "rgba(100,100,100,0.08)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (pendingProject) {
                    setPendingProject(null);
                    await allocateToProject(pendingProject.id, pendingProject.name);
                  }
                }}
                disabled={allocatingProject !== null}
                style={{
                  flex: 1,
                  padding: "0.875rem",
                  borderRadius: "0.75rem",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  background: "black",
                  color: "white",
                  cursor: allocatingProject ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
              >
                {allocatingProject ? (
                  <Loader2 className="animate-spin" width="1.125rem" />
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </ResponsiveModal>

        {/* BULK EDIT SELECTED */}
        <ResponsiveModal
          open={bulkEditDialogOpen}
          onOpenChange={(open) => {
            setBulkEditDialogOpen(open);
            if (!open) setBulkEditValue("");
          }}
          title={bulkEditField === "name" ? "Rename Selected" : "Set Location (Site)"}
          description={`${checked.length} selected record(s)`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", padding: "1.25rem" }}>
            <input
              placeholder={bulkEditField === "name" ? "Enter new name" : "Enter location/site"}
              value={bulkEditValue}
              onChange={(e) => setBulkEditValue(e.target.value)}
              style={{
                borderRadius: "0.55rem",
                border: "1px solid rgba(100,100,100,0.2)",
                padding: "0.8rem",
                background: "rgba(100,100,100,0.05)",
                fontSize: "0.92rem",
              }}
            />
            <button
              onClick={handleBulkEdit}
              disabled={bulkEditLoading || checked.length < 1 || !bulkEditValue.trim()}
              style={{
                border: "none",
                background: "black",
                color: "white",
                padding: "0.8rem",
                borderRadius: "0.6rem",
                fontWeight: 500,
                cursor: bulkEditLoading ? "not-allowed" : "pointer",
                opacity: bulkEditLoading ? 0.65 : 1,
              }}
            >
              {bulkEditLoading ? "Updating..." : "Apply to Selected"}
            </button>
          </div>
        </ResponsiveModal>

        {/* PROJECT PERSONNEL VIEWER */}
        <ResponsiveModal
          open={!!viewingProject}
          onOpenChange={(open) => { 
            if (!open) {
              setViewingProject(null);
              setProjectPersonnel([]);
            }
          }}
          title={viewingProject?.name || "Project Personnel"}
          description={`People allocated to this project`}
        >
          <div style={{ padding: "1.5rem", paddingTop: "0.5rem", maxHeight: "60vh", overflowY: "auto" }}>
            {loadingPersonnel ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
                <Loader2 className="animate-spin" width="1.5rem" />
              </div>
            ) : projectPersonnel.length === 0 ? (
              <div style={{ textAlign: "center", padding: "2rem", opacity: 0.5 }}>
                <PackageOpen width="2.5rem" height="2.5rem" style={{ margin: "0 auto 0.5rem" }} />
                <p style={{ fontSize: "0.875rem" }}>No personnel allocated to this project</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "0.5rem", 
                  padding: "0.5rem 0.75rem",
                  marginBottom: "0.5rem",
                  background: "rgba(123, 104, 238, 0.08)",
                  borderRadius: "0.5rem"
                }}>
                  <UserCircle width="1rem" height="1rem" color="mediumslateblue" />
                  <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                    {projectPersonnel.length} {projectPersonnel.length === 1 ? "person" : "people"}
                  </span>
                </div>
                {projectPersonnel.map((person) => (
                  <div
                    key={person.id}
                    onClick={() => {
                      usenavigate(`/record-detail/${person.id}`);
                      setViewingProject(null);
                      setProjectPersonnel([]);
                    }}
                    style={{
                      padding: "0.875rem 1rem",
                      borderRadius: "0.75rem",
                      background: "rgba(100, 100, 100, 0.04)",
                      border: "1px solid rgba(100, 100, 100, 0.08)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(100, 100, 100, 0.08)";
                      e.currentTarget.style.borderColor = "rgba(100, 100, 100, 0.15)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(100, 100, 100, 0.04)";
                      e.currentTarget.style.borderColor = "rgba(100, 100, 100, 0.08)";
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                      <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                        {(person as any).name || "Unnamed"}
                      </span>
                      {(person as any).designation && (
                        <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>
                          {(person as any).designation}
                        </span>
                      )}
                      {(person as any).civilId && (
                        <span style={{ fontSize: "0.75rem", opacity: 0.5, fontFamily: "monospace" }}>
                          {(person as any).civilId}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ResponsiveModal>

        {/* ////////////////////////////////////////////////////////////////////////////////////////////////////////////// */}

        {/* Dialog Boxes 👇*/}

        <DefaultDialog
          close
          codeIcon={<File width={"1rem"} color="mediumslateblue" />}
          onCancel={() => {
            setExportDialog(false);
            
          }}
          open={exportDialog}
          title_extra={
            <button
              onClick={exportRawDB}
              style={{ fontSize: "0.8rem", width: "9rem" }}
            >
              {loading ? (
                <LoaderCircle className="animate-spin" width={"1rem"} />
              ) : (
                <DownloadCloud color="mediumslateblue" width={"1rem"} />
              )}
              Raw Data
            </button>
          }
          title={"Export Data"}
          titleIcon={<DownloadCloud color="lightgreen" />}
          extra={
            <div
              style={{
                width: "100%",
                display: "flex",
                flexFlow: "column",
                gap: "0.5rem",
              }}
            >
              <Directive
                loading={loading}
                icon={<File width={"1.25rem"} color="mediumslateblue" />}
                title={"Export Records"}
                status
                onClick={exportDB}
              />
              {/* <Directive
                icon={<BarChart3Icon color="violet" width={"1.25rem"} />}
                title={"Export Leave Log"}
                status
              />
              <Directive
                title={"Export Salary Log"}
                icon={<CircleDollarSign width={"1.25rem"} color="lightgreen" />}
                status
              />
              <Directive
                notName
                title={"Export Allowance Log"}
                icon={<HandHelping color="salmon" />}
                status
              /> */}
              <Directive
                icon={
                  exportLoading ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <AlertCircle width={"1.25rem"} color="orange" />
                  )
                }
                title={"Export Expiring Documents"}
                status
                loading={exportLoading}
                onClick={handleExportExpiring}
              />
            </div>
          }
        />

        <DefaultDialog
          progress={progress}
          progressItem={progressItem}
          open={importDialog}
          created_on={jsonData.length === 0 ? "" : jsonData.length.toString()}
          title={"Upload XLSX"}
          titleIcon={<UploadCloud color="salmon" />}
          codeIcon={<File width={"0.8rem"} />}
          code=".xls, .xlsx"
          OkButtonText="Upload"
          onCancel={() => {
            setImportDialog(false);
            setFile(null);
            setProgress("");
            setProgressItem("");
            setJsonData([]);
            setDuplicateRecords([]);
          }}
          disabled={!jsonData.length}
          updating={loading}
          onOk={() => uploadJson()}
          title_extra={
            <div style={{ display: "flex", flexFlow: "column", gap: "0.5rem" }}>
              <button
                onClick={fetchBlank}
                style={{
                  fontSize: "0.8rem",
                  height: "2rem",
                  paddingLeft: "1rem",
                  paddingRight: "1rem",
                }}
              >
                <FileDown color="lightgreen" width={"1rem"} />
                Template
              </button>
            </div>
          }
          extra={
            <>
              {jsonData.length === 0 ? (
                <div
                  style={{
                    width: "100%",
                    border: "3px dashed rgba(100 100 100/ 50%)",
                    height: "2.5rem",
                    borderRadius: "0.5rem",
                    marginBottom: "0.5rem",
                  }}
                />
              ) : (
                <div
                  className="recipients"
                  style={{
                    width: "100%",
                    display: "flex",
                    flexFlow: "column",
                    gap: "0.35rem",
                    maxHeight: "11.25rem",
                    overflowY: "auto",
                    paddingRight: "0.5rem",
                    minHeight: "2.25rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  {jsonData.map((record: Record, index: number) => (
                    <motion.div
                      key={record.id || record.employeeCode || `record-${index}`}
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                    >
                      <Directive
                        status={true}
                        noArrow
                        onClick={() => {}}
                        tag={record.employeeCode}
                        title={record.name.toLowerCase()}
                        titleSize="0.75rem"
                        icon={<UserCircle width={"1.25rem"} color="salmon" />}
                      />
                    </motion.div>
                  ))}
                </div>
              )}
              {jsonData.length != 0 && duplicateRecords.length > 0 && (
                <div
                  style={{
                    border: "",
                    display: "flex",
                    flexFlow: "column",
                    gap: "0.5rem",
                    padding: "0.75rem",
                    background: "rgba(255, 165, 0, 0.1)",
                    borderRadius: "0.5rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  <p style={{ fontSize: "0.8rem", textAlign: "center", color: "orange" }}>
                    At least {duplicateRecords.length} existing record(s) detected (based on loaded data)
                  </p>
                </div>
              )}

              <p
                style={{
                  display: "flex",
                  alignItems:"center",
                  gap:"0.5rem",
                  fontSize: "0.75rem",
                  fontWeight: 400,
                  marginBottom: "0.5rem",
                }}
              >
                <Info width={"3rem"}/>
                Records with existing document IDs will be updated. Records without IDs will be added as new.
              </p>

              <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                <input
                  style={{ fontSize: "0.8rem" }}
                  type="file"
                  accept=".xls, .xlsx"
                  onChange={(e: any) => {
                    if (e.target.files?.[0]) {
                      setFile(e.target.files[0]);
                      setJsonData([]);
                    }
                  }}
                />
                <button
                  className={file ? "" : "disabled"}
                  onClick={() => {
                    if (jsonData.length > 0) {
                      setJsonData([]);
                    } else {
                      handleImport();

                      // const hasDuplicates = records.some((item2) =>
                      //   jsonData.some(
                      //     (item1: any) =>
                      //       item1.employeeCode === item2.employeeCode
                      //   )
                      // );
                      // message.info(
                      //   hasDuplicates ? "Duplicates Found" : "No Duplicates"
                      // );
                    }
                  }}
                  style={{
                    fontSize: "0.8rem",
                    paddingRight: "1rem",
                    paddingLeft: "1rem",
                  }}
                >
                  {jsonData.length > 0 ? "Clear" : "Add"}
                </button>
              </div>

              <div style={{ marginTop: "1rem" }}>
                {/* <Directive
                  icon={<RefreshCcw width={"1.25rem"} color="orange" />}
                  title={"Import as Updates"}
                  subtext={"Include ID"}
                  id_subtitle={"Update existing records with new data"}
                  status={true}
                  loading={importLoading}
                  onClick={() => {
                    if (file) {
                      setImportLoading(true);
                      importExpiringRecords(file)
                        .then(() => {
                          setImportDialog(false);
                          setFile(null);
                          setJsonData([]);
                          setImportLoading(false);
                          fetchData();
                        })
                        .catch(() => {
                          setImportLoading(false);
                        });
                    }
                  }}
                /> */}
              </div>
            </>
          }
        />

        <SheetComponent title={name} />
        {/* ////////////////////////////////////////////////////////////////////////////////////////////////////////////// */}


        <DefaultDialog
          titleIcon={<Download />}
          title={state == "active" ? "Archive Record?" : "Unarchive?"}
          open={archivePrompt}
          onCancel={() => setArchivePrompt(false)}
          OkButtonText={state == "active" ? "Archive" : "Confirm"}
          onOk={archiveRecord}
          updating={loading}
          disabled={loading}
        />

       

        

       

        {/* ADD RECORD DIALOG - Responsive Modal */}
        <ResponsiveModal
          open={addDialog}
          onOpenChange={(open) => {
            if (!open) {
              // Clear all form fields when closing
              setName("");
              setDisplayName("");
              setEmail("");
              setEmployeeCode("");
              setCompanyName("");
              setDateofJoin("");
              setSalaryBasic(0);
              setAllowance(0);
              setContact("");
              setCug("");
              setDesignation("");
              setWorkerType("");
              setSite("");
              setProject("");
              setSystemRole("");
            }
            setAddDialog(open);
          }}
          title=""
          description=""
        >
          <RecordFormContent
            name={name}
            setName={setName}
            displayName={displayName}
            setDisplayName={setDisplayName}
            email={email}
            setEmail={setEmail}
            employeeCode={employeeCode}
            setEmployeeCode={setEmployeeCode}
            companyName={companyName}
            setCompanyName={setCompanyName}
            dateofJoin={dateofJoin}
            setDateofJoin={setDateofJoin}
            salaryBasic={salaryBasic}
            setSalaryBasic={setSalaryBasic}
            allowance={allowance}
            setAllowance={setAllowance}
            contact={contact}
            setContact={setContact}
            cug={cug}
            setCug={setCug}
            designation={designation}
            setDesignation={setDesignation}
            workerType={workerType}
            setWorkerType={setWorkerType}
            site={site}
            setSite={setSite}
            project={project}
            setProject={setProject}
            systemRole={systemRole}
            setSystemRole={setSystemRole}
            loading={loading}
            onSave={addRecord}
            isEditMode={false}
          />
        </ResponsiveModal>

       

        

        {/* ////////////////////////////////////////////////////////////////////////////////////////////////////////////// */}

        {/*DISPLAY CIVIL ID DIALOG */}
        <DefaultDialog
          back
          close
          titleIcon={<CreditCard color="mediumslateblue" />}
          title="Civil ID"
          open={civil}
          onCancel={() => {setCivil(false)}}
          OkButtonText="Add"
          title_extra={
            civil_expiry ? (
              <div
                style={{ display: "flex", gap: "0.5rem", height: "2.25rem" }}
              >
                {moment(civil_expiry, "DD/MM/YYYY").diff(
                  moment(today),
                  "months"
                ) +
                  1 <=
                3 ? (
                  <button
                    onClick={() => {
                      setRenewDocDialog(true);
                    }}
                    className=""
                    style={{
                      fontSize: "0.85rem",
                      width: "6rem",
                      display: "flex",
                      gap: "0.5rem",
                      background: "goldenrod",
                      color: "black",
                    }}
                  >
                    <Sparkles width={"0.85rem"} color="black" />
                    Renew
                  </button>
                ) : null}
                {access && (
                  <DropDown
                    onDelete={() => {
                      setCivilDelete(true);
                    }}
                    onEdit={() => {
                      setEditcivilprompt(true);
                    }}
                    trigger={<EllipsisVerticalIcon width={"1.1rem"} />}
                  />
                )}
              </div>
            ) : null
          }
          extra={
            <div
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
                paddingBottom: "1rem",
              }}
            >
              {!civil_expiry || loading ? (
                <div style={{ height: "19ch", width: "32ch", display: "flex" }}>
                  <button
                    onClick={() => setAddcivil(true)}
                    style={{
                      width: "100%",
                      // border: "2px solid rgba(100 100 100/ 50%)",
                    }}
                  >
                    {!loading ? (
                      <>
                        <Plus width={"1rem"} />
                        Add ID
                      </>
                    ) : (
                      <>
                        <LoadingOutlined />
                        Generating ID
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div>
                  <CivilID
                    name={name}
                    expirydate={
                      new_civil_expiry ? new_civil_expiry : civil_expiry
                    }
                    civilid={new_civil_number ? new_civil_number : civil_number}
                    DOB={civil_DOB}
                  />
                  {/* <br/>
                        <button style={{width:"100%"}}>Edit</button> */}
                </div>
              )}

              <br />
            </div>
          }
        />

        {/* ADD CIVIL ID DIALOG */}
        <InputDialog
          open={addcivil}
          title="Add Civil ID"
          titleIcon={<CreditCard />}
          inputplaceholder="Civil Number"
          input2placeholder="Expiry Date"
          input3placeholder="Date of Birth"
          OkButtonText="Add"
          onCancel={() => setAddcivil(false)}
          onOk={addCivilID}
          inputOnChange={(e: any) => setEditedCivilNumber(e.target.value)}
          input2OnChange={(e: any) => setEditedCivilExpiry(e.target.value)}
          input3OnChange={(e: any) => setEditedCivilDOB(e.target.value)}
          updating={loading}
          disabled={loading}
        />

        {/* EDIT CIVIL ID DIALOG */}
        <InputDialog
          open={editcivilprompt}
          title="Edit Civil ID"
          titleIcon={<PenLine />}
          OkButtonText="Update"
          onCancel={() => {
            setEditcivilprompt(false);
            setEditedCivilNumber("");
            setEditedCivilExpiry(null);
            setEditedCivilDOB("");
          }}
          inputplaceholder="Enter New Civil ID"
          input2placeholder="Enter Expiry Date"
          input3placeholder="Enter Date of Birth"
          inputOnChange={(e: any) => setEditedCivilNumber(e.target.value)}
          input2OnChange={(e: any) => {
            setEditedCivilExpiry(e.target.value);
          }}
          input3OnChange={(e: any) => setEditedCivilDOB(e.target.value)}
          onOk={EditCivilID}
          updating={loading}
          disabled={loading}
          input1Value={civil_number}
          input2Value={civil_expiry}
          input3Value={civil_DOB}
          input1Label="Civil Number : "
          input2Label="Expiry Date : "
          input3Label="Date of Birth : "
        />

        {/* DELETE CIVIL ID DIALOG */}
        <DefaultDialog
          destructive
          updating={loading}
          open={civilDelete}
          title="Delete Civil ID?"
          OkButtonText="Delete"
          onCancel={() => setCivilDelete(false)}
          onOk={deleteCivilID}
          disabled={loading}
        />

        {/* ////////////////////////////////////////////////////////////////////////////////////////////////////////////// */}

        {/*DISPLAY VEHICLE ID DIALOG */}
        <DefaultDialog
          close
          titleIcon={<Car color="violet" />}
          title="License"
          open={vehicle}
          onCancel={() => setVehicle(false)}
          OkButtonText="Add"
          back
          title_extra={
            vehicle_number ? (
              <div
                style={{ display: "flex", gap: "0.5rem", height: "2.25rem" }}
              >
                {moment(vehicle_expiry, "DD/MM/YYYY").diff(
                  moment(today),
                  "months"
                ) <= 2 ? (
                  <button
                    onClick={() => {
                      setRenewVehicleDialog(true);
                    }}
                    className=""
                    style={{
                      fontSize: "0.85rem",
                      width: "6rem",
                      display: "flex",
                      gap: "0.5rem",
                      background: "goldenrod",
                      color: "black",
                    }}
                  >
                    <Sparkles width={"0.85rem"} color="black" />
                    Renew
                  </button>
                ) : null}

                {/* <DropDown onDelete={()=>{setVehicleIdDelete(true)}} 
                onEdit={()=>{setEditVehicleIDprompt(true)}} 
                trigger={<EllipsisVerticalIcon width={"1.1rem"}/>} */}
                {access && (
                  <DropDown
                    onDelete={() => {
                      setVehicleIdDelete(true);
                    }}
                    onEdit={() => {
                      setEditVehicleIDprompt(true);
                    }}
                    trigger={<EllipsisVerticalIcon width={"1.1rem"} />}
                  />
                )}
              </div>
            ) : null
          }
          extra={
            <div
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
                paddingBottom: "1rem",
              }}
            >
              {!vehicle_expiry || loading ? (
                <div style={{ height: "19ch", width: "32ch", display: "flex" }}>
                  <button
                    onClick={() => setAddVehicleID(true)}
                    style={{
                      width: "100%",
                      // border: "2px solid rgba(100 100 100/ 50%)",
                    }}
                  >
                    {!loading ? (
                      <>
                        <Plus width={"1rem"} />
                        Add ID
                      </>
                    ) : (
                      <>
                        <LoadingOutlined />
                        Generating ID
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div>
                  <VehicleID
                    name={name}
                    expirydate={vehicle_expiry}
                    issuedate={vehicle_issue}
                    reg_no={vehicle_number ? vehicle_number : vehicle_number}
                    year={"XXXX"}
                  />
                  {/* <br/>
                        <button style={{width:"100%"}}>Edit</button> */}
                </div>
              )}
              <br />
            </div>
          }
        />

        {/* ADD VEHICLE ID DIALOG */}
        <InputDialog
          open={add_vehicle_id}
          title="Add License"
          titleIcon={<Car />}
          inputplaceholder="License Number"
          input2placeholder="Expiry Date"
          input3placeholder="Issue Date"
          OkButtonText="Add"
          onCancel={() => {
            setAddVehicleID(false);
          }}
          onOk={addVehicleID}
          inputOnChange={(e: any) => setVehicleNumber(e.target.value)}
          input2OnChange={(e: any) => setVehicleExpiry(e.target.value)}
          input3OnChange={(e: any) => setVehicleIssue(e.target.value)}
          updating={loading}
          disabled={loading}
        />

        {/* EDIT VEHICLE ID DIALOG */}
        <InputDialog
          open={edit_vehicle_id_prompt}
          title="Edit Vehicle ID"
          titleIcon={<PenLine />}
          OkButtonText="Update"
          onCancel={() => {
            setEditVehicleIDprompt(false);
          }}
          inputplaceholder="Enter Vehicle Number"
          input2placeholder="Enter Expiry Date"
          input3placeholder="Enter Issue Date"
          inputOnChange={(e: any) => setEditedVehicleNumber(e.target.value)}
          input2OnChange={(e: any) => {
            setEditedVehicleExpiry(e.target.value);
          }}
          input3OnChange={(e: any) => setEditedVehicleIssue(e.target.value)}
          onOk={EditVehicleID}
          updating={loading}
          disabled={loading}
          input1Value={vehicle_number}
          input2Value={vehicle_expiry}
          input3Value={vehicle_issue}
          input1Label="License No : "
          input2Label="Expiry Date"
          input3Label="Issue Date"
        />

        {/* DELETE VEHICLE ID DIALOG */}
        <DefaultDialog
          updating={loading}
          open={vehicleIdDelete}
          title="Delete License?"
          OkButtonText="Delete"
          onCancel={() => setVehicleIdDelete(false)}
          onOk={deleteVehicleID}
          disabled={loading}
          destructive
        />

        {/* BULK DELETE DIALOG */}
        <DefaultDialog
          progressItem={progressItem}
          progress={progress}
          destructive
          updating={loading}
          title="Delete record(s)?"
          open={bulkDeleteDialog}
          OkButtonText="Confirm"
          onCancel={() => setBulkDeleteDialog(false)}
          onOk={() => deleteKey == "root" && handleBulkDelete()}
          disabled={loading || deleteKey != "root" ? true : false}
          extra={
            <input
              placeholder="Enter Key"
              onChange={(e) => setDeleteKey(e.target.value)}
            />
          }
        />

        {/* RENEW CIVIL ID */}
        <InputDialog
          titleIcon={<Sparkles color="goldenrod" fill="goldenrod" />}
          title={"Renew Document"}
          open={renewDocDialog}
          onCancel={() => {
            setRenewDocDialog(false);
            setNewExpiry("");
          }}
          inputplaceholder="New Expiry"
          OkButtonText="Renew"
          inputOnChange={(e: any) => setNewExpiry(e.target.value)}
          onOk={RenewID}
          updating={loading}
          disabled={loading || newExpiry ? false : true}
          input1Value={civil_expiry}
          input1Label="New Expiry : "
          OkButtonIcon={<Sparkles width={"1rem"} />}
        />

        {/* RENEW VEHICLE ID DIALOG */}
        <InputDialog
          title="Renew Vehicle ID"
          open={renewVehicleDialog}
          onCancel={() => setRenewVehicleDialog(false)}
          inputplaceholder="New Issue Date"
          input1Label="New Issue"
          input2placeholder="New Expiry"
          input2Label="New Expiry"
          input1Value={vehicle_issue}
          input2Value={vehicle_expiry}
          OkButtonText="Renew"
          OkButtonIcon={<Sparkles width={"1rem"} />}
          disabled={loading}
          onOk={renewVehicleID}
          inputOnChange={(e: any) => setEditedVehicleIssue(e.target.value)}
          input2OnChange={(e: any) => setEditedVehicleExpiry(e.target.value)}
          updating={loading}
        />

        {/* TRAINING DIALOG */}
        <DefaultDialog
          close
          back
          open={trainingDialog}
          onCancel={() => setTrainingDialog(false)}
          title={"Training"}
          titleIcon={<GraduationCap color="lightgreen" />}
          extra={
            <div
              style={{
                width: "100%",
                display: "flex",
                flexFlow: "column",
                gap: "0.5rem",
              }}
            >
              <Directive
                icon={
                  <img
                    src="/vale-logo.png"
                    style={{ width: "1.25rem", paddingBottom: "0.25rem" }}
                  />
                }
                title="Vale Training"
                onClick={() => {
                  setValeTrainingDialog(true);
                }}
              />
              <Directive
                icon={<Globe width={"1rem"} color="grey" />}
                title="Other"
              />
            </div>
          }
        />

        {/* MEDICAL ID DIALOG */}
        <DefaultDialog
          close
          titleIcon={<HeartPulse color="tomato" />}
          title="Medical ID"
          open={healthDialog}
          onCancel={() => {setHealthDialog(false)}}
          back
          title_extra={
            medical_due_on ? (
              <div
                style={{ display: "flex", gap: "0.5rem", height: "2.25rem" }}
              >
                {moment(medical_due_on, "DD/MM/YYYY").diff(
                  moment(today),
                  "months"
                ) <= 2 ? (
                  <button
                    onClick={() => {
                      setRenewMedicalIDdialog(true);
                    }}
                    className=""
                    style={{
                      fontSize: "0.85rem",
                      width: "6rem",
                      display: "flex",
                      gap: "0.5rem",
                      background: "goldenrod",
                      color: "black",
                    }}
                  >
                    <Sparkles width={"0.85rem"} color="black" />
                    Renew
                  </button>
                ) : null}

                {access && (
                  <DropDown
                    onDelete={() => {
                      setDeleteMedicalIDdialog(true);
                    }}
                    onEdit={() => {
                      setEditMedicalIDdialog(true);
                    }}
                    trigger={<EllipsisVerticalIcon width={"1.1rem"} />}
                  />
                )}
              </div>
            ) : null
          }
          extra={
            <div
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
                paddingBottom: "1rem",
              }}
            >
              {!medical_due_on || loading ? (
                <div style={{ height: "19ch", width: "32ch", display: "flex" }}>
                  <button
                    onClick={() => setMedicalIDdialog(true)}
                    style={{
                      width: "100%",
                      // border: "2px solid rgba(100 100 100/ 50%)",
                    }}
                  >
                    {!loading ? (
                      <>
                        <Plus width={"1rem"} />
                        Add ID
                      </>
                    ) : (
                      <>
                        <LoadingOutlined />
                        Generating ID
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div>
                  <MedicalID
                    // tooltip={
                    //   moment(medical_due_on, "DD/MM/YYYY").diff(
                    //     moment(today),
                    //     "months"
                    //   ) <= 2
                    // }
                    name={name}
                    completedOn={medical_completed_on}
                    dueOn={medical_due_on}
                  />
                </div>
              )}
              <br />
            </div>
          }
        />

        {/* ADD MEDICAL ID DIALOG */}
        <InputDialog
          open={MedicalIDdialog}
          OkButtonText="Add"
          onCancel={() => setMedicalIDdialog(false)}
          title="Add Medical ID"
          titleIcon={<HeartPulse color="tomato" />}
          inputplaceholder="Completed On"
          input2placeholder="Due On"
          inputOnChange={(e: any) => setCompletedOn(e.target.value)}
          input2OnChange={(e: any) => setDueOn(e.target.value)}
          onOk={addMedicalID}
          updating={loading}
        />

        {/* EDIT MEDICAl ID DIALOG */}
        <InputDialog
          open={editMedicalIDdialog}
          title="Edit Medical ID"
          titleIcon={<PenLine />}
          OkButtonText="Update"
          onCancel={() => {
            setEditMedicalIDdialog(false);
          }}
          inputplaceholder="Completed On"
          input2placeholder="Due on"
          inputOnChange={(e: any) => setEditedCompletedOn(e.target.value)}
          input2OnChange={(e: any) => {
            setEditedDueOn(e.target.value);
          }}
          onOk={EditMedicalID}
          updating={loading}
          disabled={loading}
          input1Value={medical_completed_on}
          input2Value={medical_due_on}
          input3Value={vehicle_issue}
          input1Label="Completed : "
          input2Label="Due On : "
        />

        {/* DELETE MEDICAL ID */}
        <DefaultDialog
          title={"Delete Medical ID?"}
          destructive
          OkButtonText="Delete"
          open={deleteMedicalIDdialog}
          onCancel={() => setDeleteMedicalIDdialog(false)}
          updating={loading}
          disabled={loading}
          onOk={deleteMedicalID}
        />

        {/* RENEW MEDICAL ID DIALOG */}
        <InputDialog
          titleIcon={<Sparkles color="goldenrod" />}
          title="Renew Medical ID"
          open={renewMedicalIDdialog}
          onCancel={() => setRenewMedicalIDdialog(false)}
          inputplaceholder="Completed On"
          input1Label="Completed : "
          input2placeholder="New Due"
          input2Label="New Due : "
          OkButtonIcon={<Sparkles width={"1rem"} />}
          OkButtonText="Renew"
          input1Value={medical_completed_on}
          input2Value={medical_due_on}
          onOk={renewMedicalID}
          updating={loading}
          inputOnChange={(e: any) => setEditedCompletedOn(e.target.value)}
          input2OnChange={(e: any) => setEditedDueOn(e.target.value)}
          disabled={loading}
        />

        {/* VALE TRAINING DIALOG */}
        <DefaultDialog
          open={valeTrainingDialog}
          titleIcon={
            <img
              src="/vale-logo.png"
              style={{ width: "1.75rem", paddingBottom: "0.5rem" }}
            />
          }
          title={"Vale Training"}
        onCancel={() => {setValeTrainingDialog(false)}}
          close
          back
          title_extra={
            <>
              {/* <button style={{fontSize:"0.8rem"}}><Plus color="mediumslateblue"/></button> */}
            </>
          }
          extra={
            <div
              className="recipients"
              style={{
                width: "100%",
                display: "flex",
                flexFlow: "column",
                gap: "0.45rem",
                maxHeight: "17.5rem",
                overflowY: "auto",
                paddingRight: "0.5rem",
                minHeight: "2.25rem",
              }}
            >
              <Directive
                tag={vt_hse_induction}
                icon={<Disc color="mediumslateblue" />}
                title="HSE Induction"
                onClick={() => {
                  access&&
                  setTrainingAddDialog(true);
                  setTrainingAddDialogTitle("HSE Induction");
                  setTrainingType("hse_induction");
                  setTrainingAddDialogInputValue(vt_hse_induction)
                }}
                status={
                  moment(vt_hse_induction, "DD/MM/YYYY").diff(
                    moment(today),
                    "months"
                  ) <= 3
                    ? false
                    : true
                }
              />

              <Directive
                tag={vt_car_1}
                icon={<Disc color="mediumslateblue" />}
                title="CAR - 1"
                onClick={() => {
                  access&&
                  setTrainingAddDialog(true);
                  setTrainingAddDialogTitle("CAR - 1");
                  
                  setTrainingType("car_1");
                  setTrainingAddDialogInputValue(vt_car_1);
                }}
                status={
                  moment(vt_car_1, "DD/MM/YYYY").diff(
                    moment(today),
                    "months"
                  ) <= 3
                    ? false
                    : true
                }
              />

              <Directive
                tag={vt_car_2}
                icon={<Disc color="mediumslateblue" />}
                title="CAR - 2"
                onClick={() => {
                  access&&
                  setTrainingAddDialog(true);
                  setTrainingAddDialogTitle("CAR - 2");
                  
                  setTrainingType("car_2");
                  setTrainingAddDialogInputValue(vt_car_2);
                }}
                status={
                  moment(vt_car_2, "DD/MM/YYYY").diff(
                    moment(today),
                    "months"
                  ) <= 3
                    ? false
                    : true
                }
              />

              <Directive
                tag={vt_car_3}
                icon={<Disc color="mediumslateblue" />}
                title="CAR - 3"
                onClick={() => {
                  access&&
                  setTrainingAddDialog(true);
                  setTrainingAddDialogTitle("CAR - 3");
                  
                  setTrainingType("car_3");
                  setTrainingAddDialogInputValue(vt_car_3);
                }}
                status={
                  moment(vt_car_3, "DD/MM/YYYY").diff(
                    moment(today),
                    "months"
                  ) <= 3
                    ? false
                    : true
                }
              />

              <Directive
                tag={vt_car_4}
                icon={<Disc color="mediumslateblue" />}
                title="CAR - 4"
                onClick={() => {
                  access&&
                  setTrainingAddDialog(true);
                  setTrainingAddDialogTitle("CAR - 4");
                  
                  setTrainingType("car_4");
                  setTrainingAddDialogInputValue(vt_car_4);
                }}
                status={
                  moment(vt_car_4, "DD/MM/YYYY").diff(
                    moment(today),
                    "months"
                  ) <= 3
                    ? false
                    : true
                }
              />

              <Directive
                tag={vt_car_5}
                icon={<Disc color="mediumslateblue" />}
                title="CAR - 5"
                onClick={() => {
                  access&&
                  setTrainingAddDialog(true);
                  setTrainingAddDialogTitle("CAR - 5");
                  
                  setTrainingType("car_5");
                  setTrainingAddDialogInputValue(vt_car_5);
                }}
                status={
                  moment(vt_car_5, "DD/MM/YYYY").diff(
                    moment(today),
                    "months"
                  ) <= 3
                    ? false
                    : true
                }
              />

              <Directive
                tag={vt_car_6}
                icon={<Disc color="mediumslateblue" />}
                title="CAR - 6"
                onClick={() => {
                  access&&
                  setTrainingAddDialog(true);
                  setTrainingAddDialogTitle("CAR - 6");
                  
                  setTrainingType("car_6");
                  setTrainingAddDialogInputValue(vt_car_6);
                }}
                status={
                  moment(vt_car_6, "DD/MM/YYYY").diff(
                    moment(today),
                    "months"
                  ) <= 3
                    ? false
                    : true
                }
              />

              <Directive
                tag={vt_car_7}
                icon={<Disc color="mediumslateblue" />}
                title="CAR - 7"
                onClick={() => {
                  access&&
                  setTrainingAddDialog(true);
                  setTrainingAddDialogTitle("CAR - 7");
                  
                  setTrainingType("car_7");
                  setTrainingAddDialogInputValue(vt_car_7);
                }}
                status={
                  moment(vt_car_7, "DD/MM/YYYY").diff(
                    moment(today),
                    "months"
                  ) <= 3
                    ? false
                    : true
                }
              />

              <Directive
                tag={vt_car_8}
                icon={<Disc color="mediumslateblue" />}
                title="CAR - 8"
                onClick={() => {
                  access&&
                  setTrainingAddDialog(true);
                  setTrainingAddDialogTitle("CAR - 8");
                  
                  setTrainingType("car_8");
                  setTrainingAddDialogInputValue(vt_car_8);
                }}
                status={
                  moment(vt_car_8, "DD/MM/YYYY").diff(
                    moment(today),
                    "months"
                  ) <= 3
                    ? false
                    : true
                }
              />

              <Directive
                tag={vt_car_9}
                icon={<Disc color="mediumslateblue" />}
                title="CAR - 9"
                onClick={() => {
                  access&&
                  setTrainingAddDialog(true);
                  setTrainingAddDialogTitle("CAR - 9");
                  
                  setTrainingType("car_9");
                  setTrainingAddDialogInputValue(vt_car_9);
                }}
                status={
                  moment(vt_car_9, "DD/MM/YYYY").diff(
                    moment(today),
                    "months"
                  ) <= 3
                    ? false
                    : true
                }
              />

              <Directive
                tag={vt_car_10}
                icon={<Disc color="mediumslateblue" />}
                title="CAR - 10"
                onClick={() => {
                  access&&
                  setTrainingAddDialog(true);
                  setTrainingAddDialogTitle("CAR - 10");
                  
                  setTrainingType("car_10");
                  setTrainingAddDialogInputValue(vt_car_10);
                }}
                status={
                  moment(vt_car_10, "DD/MM/YYYY").diff(
                    moment(today),
                    "months"
                  ) <= 3
                    ? false
                    : true
                }
              />
            </div>
          }
        />

        <DefaultDialog
          close
          titleIcon={<Book color="goldenrod" />}
          title="Passport"
          open={passportDialog}
          onCancel={() => {setPassportDialog(false)}}
          back
          title_extra={
            passportExpiry ? (
              <div
                style={{ display: "flex", gap: "0.5rem", height: "2.25rem" }}
              >
                {moment(passportExpiry, "DD/MM/YYYY").diff(
                  moment(today),
                  "months"
                ) <= 6 && !loading ? (
                  <button
                    onClick={() => {
                      setRenewPassportDialog(true);
                    }}
                    className=""
                    style={{
                      fontSize: "0.85rem",
                      width: "6rem",
                      display: "flex",
                      gap: "0.5rem",
                      background: "goldenrod",
                      color: "black",
                    }}
                  >
                    <Sparkles width={"0.85rem"} color="black" />
                    Renew
                  </button>
                ) : null}

                {access && (
                  <DropDown
                    onDelete={() => {
                      setDeletePassportDialog(true);
                    }}
                    onEdit={() => {
                      setEditPassportDialog(true);
                    }}
                    trigger={<EllipsisVerticalIcon width={"1.1rem"} />}
                  />
                )}
              </div>
            ) : null
          }
          extra={
            <div
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
                paddingBottom: "1rem",
              }}
            >
              {!passportExpiry || loading ? (
                <div style={{ height: "19ch", width: "32ch", display: "flex" }}>
                  <button
                    onClick={() => setAddPassportDialog(true)}
                    style={{
                      width: "100%",
                      // border: "2px solid rgba(100 100 100/ 50%)",
                    }}
                  >
                    {!loading ? (
                      <>
                        <Plus width={"1rem"} />
                        Add Passport
                      </>
                    ) : (
                      <>
                        <LoadingOutlined />
                        Generating Passport
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div>
                  <Passport
                    nativePhone={nativePhone}
                    name={name}
                    passport_id={passportID}
                    issue={passportIssue}
                    nativeAddress={nativeAddress}
                    expiry={passportExpiry}
                  />
                  {/* <br/>
                        <button style={{width:"100%"}}>Edit</button> */}
                </div>
              )}
              <br />
            </div>
          }
        />

        {/* ADD PASSPORT ID DIALOG */}
        <InputDialog
          open={addPassportDialog}
          OkButtonText="Add"
          onCancel={() => setAddPassportDialog(false)}
          title="Add Passport"
          titleIcon={<Book color="goldenrod" />}
          inputplaceholder="Passport ID"
          input2placeholder="Issue Date"
          input3placeholder="Expiry Date"
          inputOnChange={(e: any) => setPassportID(e.target.value)}
          input2OnChange={(e: any) => setPassportIssue(e.target.value)}
          input3OnChange={(e: any) => setPassportExpiry(e.target.value)}
          input4placeholder="Native Phone ( with Country code )"
          input5placeholder="Native Address"
          input4OnChange={(e: any) => setNativePhone(e.target.value)}
          input5OnChange={(e: any) => setNativeAddress(e.target.value)}
          onOk={addPassport}
          updating={loading}
        />

        {/* EDIT PASSPORT DIALOG */}
        <InputDialog
          open={editPassportDialog}
          title="Edit Passport"
          titleIcon={<PenLine />}
          OkButtonText="Update"
          onCancel={() => {
            setEditPassportDialog(false);
          }}
          inputplaceholder="Passport ID"
          input2placeholder="Issue Date"
          input3placeholder="Expiry Date"
          inputOnChange={(e: any) => setEditedPassportID(e.target.value)}
          input2OnChange={(e: any) => {
            setEditedPassportIssue(e.target.value);
          }}
          input3OnChange={(e: any) => setEditedPassportExpiry(e.target.value)}
          onOk={EditPassport}
          updating={loading}
          disabled={loading}
          input1Value={passportID}
          input2Value={passportIssue}
          input3Value={passportExpiry}
          input1Label="Passport ID : "
          input2Label="Issue Date : "
          input3Label="Expiry Date"
          input4placeholder="Native Phone Number"
          input4Label="Native Phone : "
          input4Value={nativePhone}
          input5placeholder="Native Address"
          input5Label="Address : "
          input5Value={nativeAddress}
          input4OnChange={(e: any) => setEditedNativePhone(e.target.value)}
          input5OnChange={(e: any) => setEditedNativeAddress(e.target.value)}
        />

        <DefaultDialog
          title={"Delete Passport?"}
          destructive
          OkButtonText="Delete"
          open={DeletePassportDialog}
          onCancel={() => setDeletePassportDialog(false)}
          updating={loading}
          disabled={loading}
          onOk={deletePassport}
        />

        {/* RENEW PASSPORT DIALOG */}
        <InputDialog
          titleIcon={<Sparkles color="goldenrod" />}
          title="Renew Passport"
          open={renewPassportDialog}
          onCancel={() => setRenewPassportDialog(false)}
          inputplaceholder="New Issue Date"
          input1Label="New Issue : "
          input2placeholder="New Expiry"
          input2Label="New Expiry : "
          OkButtonIcon={<Sparkles width={"1rem"} />}
          OkButtonText="Renew"
          input1Value={passportIssue}
          input2Value={passportExpiry}
          onOk={renewPassport}
          updating={loading}
          inputOnChange={(e: any) => setEditedPassportIssue(e.target.value)}
          input2OnChange={(e: any) => setEditedPassportExpiry(e.target.value)}
          disabled={loading}
        />

        <InputDialog
          open={trainingAddDialog}
          onOk={() => {
            addTraining(trainingType);
          }}
          onCancel={() => {
            setTrainingAddDialog(false);
            setEditedTrainingAddDialogInput("");
          }}
          title={trainingAddDialogTitle}
          inputplaceholder="Expiry Date"
          OkButtonText="Update"
          inputOnChange={(e: any) =>
            setEditedTrainingAddDialogInput(e.target.value)
          }
          OkButtonIcon={<RefreshCcw width={"1rem"} />}
          updating={loading}
          disabled={loading || !EditedTrainingAddDialogInput ? true : false}
          input1Value={trainingAddDialogInputValue}
        />


      

        

     
      </div>

      

      

     
      {/* Add hidden file input for Excel import */}
      {/* <input
        type="file"
        id="excelImport"
        accept=".xlsx,.xls" 
        style={{ display: "none" }}
        onChange={handleImportExpiring}
      /> */}
      {/* <DefaultDialog
        title="Existing Records Found"
        open={overwriteDialog}
        onCancel={() => {
          setOverwriteDialog(false);
          // Process only new records
          uploadJson(false);
        }}
        OkButtonText="Overwrite"
        onOk={() => {
          // Process all records with overwrite
          uploadJson(true);
        }}
        extra={
          <div>
            <p style={{ marginBottom: "1rem" }}>
              {existingRecords.length} record(s) with matching Employee Codes
              already exist.
            </p>
            <p>
              • Click "Overwrite" to update existing records
              <br />
              • Click "Cancel" to import only new records
              <br />• Records without Employee Codes will be imported as new
              records
            </p>
          </div>
        }
      /> */}
      {/* <DefaultDialog
        title={"Import Records"}
        open={importDialog}
        onCancel={() => {
          setImportDialog(false);
          setFile(null);
          setJsonData([]);
          setImportMode(null);
        }}
        OkButtonText="Add"
        onOk={() => {
          if (file) {
            setImportLoading(true);
            uploadJson(importMode === "overwrite");
          }
        }}
        extra={
          <div style={{ display: "flex", flexFlow: "column", gap: "1rem" }}>
            <div style={{ display: "flex", flexFlow: "column", gap: "0.5rem" }}>
              <p style={{ opacity: 0.75, fontSize: "0.9rem" }}>
                How should duplicate records be handled?
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={() => setImportMode("overwrite")}
                  style={{
                    background:
                      importMode === "overwrite"
                        ? "rgba(30, 144, 255, 0.2)"
                        : "",
                    color: importMode === "overwrite" ? "mediumslateblue" : "",
                  }}
                >
                  Overwrite
                </button>
                <button
                  onClick={() => setImportMode("ignore")}
                  style={{
                    background:
                      importMode === "ignore" ? "rgba(30, 144, 255, 0.2)" : "",
                    color: importMode === "ignore" ? "mediumslateblue" : "",
                  }}
                >
                  Ignore
                </button>
              </div>
            </div>
            <div
              style={{
                width: "100%",
                height: "1px",
                background: "rgba(255 255 255/ 10%)",
              }}
            />
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                handleImport();
                setFile(e.target.files?.[0] || null);
              }}
              style={{ fontSize: "0.85rem" }}
            />
          </div>
        }
        disabled={!file || !importMode}
        updating={importLoading}
      /> */}
    </>
  );
}
