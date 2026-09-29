import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import CivilID from "@/components/civil-id";
import Directive from "@/components/directive";
import DropDown from "@/components/dropdown";
import ImageDialog from "@/components/image-dialog";
import InputDialog from "@/components/input-dialog";
import MedicalID from "@/components/medical-id";
import Passport from "@/components/passport";
import ProjectSelect from "@/components/project-select";
import CompanySelect from "@/components/company-select";
import RefreshButton from "@/components/refresh-button";
import DefaultDialog from "@/components/ui/default-dialog";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { db, storage } from "@/firebase";
import { Tooltip } from "antd";
import { deleteDoc, doc, getDoc, updateDoc } from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import {
  Archive,
  BellOff,
  BellRing,
  Book,
  CreditCard,
  EllipsisVertical,
  FileArchive,
  GraduationCap,
  HeartPulse,
  Loader2,
  PenLine,
  RefreshCcw,
  X
} from "lucide-react";
import moment from "moment";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import ReactTimeAgo from "react-time-ago";
import { toast } from "sonner";

// Edit Record Form Component Props
interface EditRecordFormContentProps {
  record: any;
  editedName: string | undefined;
  editedDepartment: string | undefined;
  editedEmail: string | undefined;
  editedEmpId: string | undefined;
  editedEmpType: string | undefined;
  editedNationality: string | undefined;
  editedDesignation: string | undefined;
  editedProject: string | undefined;
  editedOtEligible: boolean | undefined;
  editedCompany: string | undefined;
  editedCivilId: string | undefined;
  editedStatus: string | undefined;
  editedShift: string | undefined;
  editedDoj: string | undefined;
  editedPhone: string | undefined;
  editedCug: string | undefined;
  setEditedName: (value: string) => void;
  setEditedDepartment: (value: string) => void;
  setEditedEmail: (value: string) => void;
  setEditedEmpId: (value: string) => void;
  setEditedEmpType: (value: string) => void;
  setEditedNationality: (value: string) => void;
  setEditedDesignation: (value: string) => void;
  setEditedProject: (value: string) => void;
  setEditedOtEligible: (value: boolean) => void;
  setEditedCompany: (value: string) => void;
  setEditedCivilId: (value: string) => void;
  setEditedStatus: (value: string) => void;
  setEditedShift: (value: string) => void;
  setEditedDoj: (value: string) => void;
  setEditedPhone: (value: string) => void;
  setEditedCug: (value: string) => void;
  loading: boolean;
  handleSubmit: () => void;
}

// Shared Edit Record Form Component
const EditRecordFormContent: React.FC<EditRecordFormContentProps> = ({
  record,
  editedName,
  editedDepartment,
  editedEmail,
  editedEmpId,
  editedEmpType,
  editedNationality,
  editedDesignation,
  editedProject,
  editedOtEligible,
  editedCompany,
  editedCivilId,
  editedStatus,
  editedShift,
  editedDoj,
  editedPhone,
  editedCug,
  setEditedName,
  setEditedDepartment,
  setEditedEmail,
  setEditedEmpType,
  setEditedNationality,
  setEditedDesignation,
  setEditedProject,
  setEditedOtEligible,
  setEditedCompany,
  setEditedCivilId,
  setEditedStatus,
  setEditedShift,
  setEditedDoj,
  setEditedPhone,
  setEditedCug,
  loading,
  handleSubmit,
}) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", maxHeight: "75vh", width: "100%" }}>
      {/* Fixed Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "1.5rem",
        paddingBottom: "1rem",
        borderBottom: "1px solid rgba(100, 100, 100, 0.1)",
        background: "var(--background)",
        boxSizing: "border-box",
        alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{
            background: "black",
            padding: "0.75rem",
            borderRadius: "0.75rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <PenLine color="white" width="1.5rem" />
          </div>
          <h2 style={{ fontSize: "1.5rem", letterSpacing: "-0.02em" }}>Edit Record</h2>
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
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%", paddingBottom: "1.5rem" }}>
          {/* Employee Code (Read Only) */}
          <div>
            <label style={{ fontSize: "0.875rem", fontWeight: "600", opacity: 0.9, marginBottom: "0.5rem", display: "block" }}>Employee Code</label>
            <input type="text" value={editedEmpId !== undefined ? editedEmpId : record?.emp_id || ""} readOnly placeholder="Employee Code (Read Only)" style={{ width: "100%", padding: "0.875rem 1rem", borderRadius: "0.75rem", fontSize: "1rem", fontWeight: "500", background: "rgba(100, 100, 100, 0.2)", cursor: "not-allowed" }} />
          </div>

          {/* Full Name */}
          <div>
            <label style={{ fontSize: "0.875rem", fontWeight: "600", opacity: 0.9, marginBottom: "0.5rem", display: "block" }}>Full Name</label>
            <input type="text" value={editedName !== undefined ? editedName : record?.name || ""} onChange={(e) => setEditedName(e.target.value)} placeholder="Enter Full Name" style={{ width: "100%", padding: "0.875rem 1rem", borderRadius: "0.75rem", fontSize: "1rem", fontWeight: "500", background: "rgba(100, 100, 100, 0.08)" }} />
          </div>

          {/* Date of Join */}
          <div>
            <label style={{ fontSize: "0.875rem", fontWeight: "600", opacity: 0.9, marginBottom: "0.5rem", display: "block" }}>Date of Join</label>
            <input type="date" value={editedDoj !== undefined ? editedDoj : record?.doj || record?.DOJ || ""} onChange={(e) => setEditedDoj(e.target.value)} placeholder="YYYY-MM-DD" style={{ width: "100%", padding: "0.875rem 1rem", borderRadius: "0.75rem", fontSize: "1rem", fontWeight: "500", background: "rgba(100, 100, 100, 0.08)" }} />
          </div>

          {/* Phone */}
          <div>
            <label style={{ fontSize: "0.875rem", fontWeight: "600", opacity: 0.9, marginBottom: "0.5rem", display: "block" }}>Phone</label>
            <input type="text" value={editedPhone !== undefined ? editedPhone : record?.phone || ""} onChange={(e) => setEditedPhone(e.target.value)} placeholder="Enter Phone Number" style={{ width: "100%", padding: "0.875rem 1rem", borderRadius: "0.75rem", fontSize: "1rem", fontWeight: "500", background: "rgba(100, 100, 100, 0.08)" }} />
          </div>

          {/* CUG */}
          <div>
            <label style={{ fontSize: "0.875rem", fontWeight: "600", opacity: 0.9, marginBottom: "0.5rem", display: "block" }}>CUG</label>
            <input type="number" value={editedCug !== undefined ? editedCug : record?.cug || record?.CUG || ""} onChange={(e) => setEditedCug(e.target.value)} placeholder="Enter CUG Number" style={{ width: "100%", padding: "0.875rem 1rem", borderRadius: "0.75rem", fontSize: "1rem", fontWeight: "500", background: "rgba(100, 100, 100, 0.08)" }} />
          </div>

          {/* Email */}
          <div>
            <label style={{ fontSize: "0.875rem", fontWeight: "600", opacity: 0.9, marginBottom: "0.5rem", display: "block" }}>Email</label>
            <input type="email" value={editedEmail !== undefined ? editedEmail : record?.email || ""} onChange={(e) => setEditedEmail(e.target.value)} placeholder="Enter Email" style={{ width: "100%", padding: "0.875rem 1rem", borderRadius: "0.75rem", fontSize: "1rem", fontWeight: "500", background: "rgba(100, 100, 100, 0.08)" }} />
          </div>

          {/* Department */}
          <div>
            <label style={{ fontSize: "0.875rem", fontWeight: "600", opacity: 0.9, marginBottom: "0.5rem", display: "block" }}>Department</label>
            <input type="text" value={editedDepartment !== undefined ? editedDepartment : record?.department || ""} onChange={(e) => setEditedDepartment(e.target.value)} placeholder="Enter Department" style={{ width: "100%", padding: "0.875rem 1rem", borderRadius: "0.75rem", fontSize: "1rem", fontWeight: "500", background: "rgba(100, 100, 100, 0.08)" }} />
          </div>

          {/* Employee Type */}
          <div>
            <label style={{ fontSize: "0.875rem", fontWeight: "600", opacity: 0.9, marginBottom: "0.5rem", display: "block" }}>Employee Type</label>
            <Select value={editedEmpType !== undefined ? editedEmpType : record?.emp_type || record?.workerType || ""} onValueChange={(value) => setEditedEmpType(value)}>
              <SelectTrigger style={{ width: "100%", padding: "0.875rem 1rem", borderRadius: "0.75rem", fontSize: "1rem", fontWeight: "500", background: "rgba(100, 100, 100, 0.08)", border: "1px solid rgba(100, 100, 100, 0.1)", justifyContent: "space-between" }}>
                <span style={{ opacity: (editedEmpType !== undefined ? editedEmpType : record?.emp_type || record?.workerType) ? 1 : 0.5 }}>
                  {(editedEmpType !== undefined ? editedEmpType : record?.emp_type || record?.workerType) || "Select Employee Type"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="worker">Worker</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Nationality */}
          <div>
            <label style={{ fontSize: "0.875rem", fontWeight: "600", opacity: 0.9, marginBottom: "0.5rem", display: "block" }}>Nationality</label>
            <input type="text" value={editedNationality !== undefined ? editedNationality : record?.nationality || ""} onChange={(e) => setEditedNationality(e.target.value)} placeholder="Enter Nationality" style={{ width: "100%", padding: "0.875rem 1rem", borderRadius: "0.75rem", fontSize: "1rem", fontWeight: "500", background: "rgba(100, 100, 100, 0.08)" }} />
          </div>

          {/* Designation */}
          <div>
            <label style={{ fontSize: "0.875rem", fontWeight: "600", opacity: 0.9, marginBottom: "0.5rem", display: "block" }}>Designation</label>
            <input type="text" value={editedDesignation !== undefined ? editedDesignation : record?.designation || ""} onChange={(e) => setEditedDesignation(e.target.value)} placeholder="Enter Designation" style={{ width: "100%", padding: "0.875rem 1rem", borderRadius: "0.75rem", fontSize: "1rem", fontWeight: "500", background: "rgba(100, 100, 100, 0.08)" }} />
          </div>

          {/* Project */}
          <div>
            <label style={{ fontSize: "0.875rem", fontWeight: "600", opacity: 0.9, marginBottom: "0.5rem", display: "block" }}>Project</label>
            <ProjectSelect value={editedProject !== undefined ? editedProject : record?.project || ""} onChange={(value) => setEditedProject(value)} />
          </div>

          {/* OT Eligible */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" id="ot_eligible" checked={editedOtEligible !== undefined ? editedOtEligible : (record?.ot_eligible === true || record?.ot_eligible === "true")} onChange={(e) => setEditedOtEligible(e.target.checked)} style={{ width: "1.2rem", height: "1.2rem" }} />
            <label htmlFor="ot_eligible" style={{ fontSize: "0.875rem", fontWeight: "600", opacity: 0.9, cursor: "pointer" }}>OT Eligible</label>
          </div>

          {/* Company */}
          <div>
            <label style={{ fontSize: "0.875rem", fontWeight: "600", opacity: 0.9, marginBottom: "0.5rem", display: "block" }}>Company Name</label>
            <CompanySelect value={editedCompany !== undefined ? editedCompany : record?.company || ""} onChange={(value) => setEditedCompany(value)} />
          </div>

          {/* Civil ID */}
          <div>
            <label style={{ fontSize: "0.875rem", fontWeight: "600", opacity: 0.9, marginBottom: "0.5rem", display: "block" }}>Civil ID</label>
            <input type="text" value={editedCivilId !== undefined ? editedCivilId : record?.civil_id || ""} onChange={(e) => setEditedCivilId(e.target.value)} placeholder="Enter Civil ID" style={{ width: "100%", padding: "0.875rem 1rem", borderRadius: "0.75rem", fontSize: "1rem", fontWeight: "500", background: "rgba(100, 100, 100, 0.08)" }} />
          </div>

          {/* Status */}
          <div>
            <label style={{ fontSize: "0.875rem", fontWeight: "600", opacity: 0.9, marginBottom: "0.5rem", display: "block" }}>Status</label>
            <Select value={editedStatus !== undefined ? editedStatus : record?.status || ""} onValueChange={(value) => setEditedStatus(value)}>
              <SelectTrigger style={{ width: "100%", padding: "0.875rem 1rem", borderRadius: "0.75rem", fontSize: "1rem", fontWeight: "500", background: "rgba(100, 100, 100, 0.08)", border: "1px solid rgba(100, 100, 100, 0.1)" }}>
                <span style={{ opacity: (editedStatus !== undefined ? editedStatus : record?.status) ? 1 : 0.5 }}>
                  {(editedStatus !== undefined ? editedStatus : record?.status) || "Select Status"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Shift */}
          <div>
            <label style={{ fontSize: "0.875rem", fontWeight: "600", opacity: 0.9, marginBottom: "0.5rem", display: "block" }}>Shift</label>
            <input type="text" value={editedShift !== undefined ? editedShift : record?.shift || ""} onChange={(e) => setEditedShift(e.target.value)} placeholder="Enter Shift" style={{ width: "100%", padding: "0.875rem 1rem", borderRadius: "0.75rem", fontSize: "1rem", fontWeight: "500", background: "rgba(100, 100, 100, 0.08)" }} />
          </div>
        </div>
      </div>

      {/* Fixed Footer with Buttons */}
      <div style={{
        padding: "1rem 1.5rem",
        paddingBottom: "1.5rem",
        borderTop: "1px solid rgba(100, 100, 100, 0.1)",
        background: "var(--background)",
        display: "flex",
        gap: "0.75rem"
      }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          style={{
            flex: 1,
            padding: "0.875rem",
            borderRadius: "0.75rem",
            fontSize: "1rem",
            fontWeight: "500",
            background: loading ? "rgba(100, 100, 100, 0.3)" : "black",
            color: "white",
            cursor: loading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem"
          }}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" width="1.125rem" />

            </>
          ) : (
            <>

              Update Record
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default function RecordDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { userData } = useAuth();
  const [record, setRecord] = useState<any>(location.state?.record || null);
  const [loading, setLoading] = useState(!record);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCompleted, setRefreshCompleted] = useState(false);

  // Dialog states
  const [archivePrompt, setArchivePrompt] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState(false);
  const [editPrompt, setEditPrompt] = useState(false);
  const [recordDeleteStatus, setRecordDeleteStatus] = useState("");

  // Edited values for edit dialog
  const [editedName, setEditedName] = useState<string | undefined>();
  const [editedDepartment, setEditedDepartment] = useState<string | undefined>();
  const [editedEmail, setEditedEmail] = useState<string | undefined>();
  const [editedEmpId, setEditedEmpId] = useState<string | undefined>();
  const [editedEmpType, setEditedEmpType] = useState<string | undefined>();
  const [editedNationality, setEditedNationality] = useState<string | undefined>();
  const [editedDesignation, setEditedDesignation] = useState<string | undefined>();
  const [editedProject, setEditedProject] = useState<string | undefined>();
  const [editedOtEligible, setEditedOtEligible] = useState<boolean | undefined>();
  const [editedCompany, setEditedCompany] = useState<string | undefined>();
  const [editedCivilId, setEditedCivilId] = useState<string | undefined>();
  const [editedStatus, setEditedStatus] = useState<string | undefined>();
  const [editedShift, setEditedShift] = useState<string | undefined>();
  const [editedDoj, setEditedDoj] = useState<string | undefined>();
  const [editedPhone, setEditedPhone] = useState<string | undefined>();
  const [editedCug, setEditedCug] = useState<string | undefined>();

  // Document states
  const [civil, setCivil] = useState(false);
  const [passportDialog, setPassportDialog] = useState(false);
  const [healthDialog, setHealthDialog] = useState(false);
  const [imageDialog, setImageDialog] = useState(false);
  const [remarksDialog, setRemarksDialog] = useState(false);
  const [notify, setNotify] = useState(true);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [remarks, setRemarks] = useState("");

  const today = new Date();

  const refreshData = async () => {
    if (!id) return;
    try {
      setRefreshing(true);
      const docRef = doc(db, "records", id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data: any = { id: docSnap.id, ...docSnap.data() };
        setRecord(data);
        setNotify(data.notify !== false); // Default to true if not set
        setRefreshCompleted(true);
      } else {
        console.error("Record not found");
        toast.error("Record not found");
        navigate(-1);
      }
    } catch (error) {
      console.error("Error fetching record:", error);
      toast.error("Failed to fetch record");
    } finally {
      setRefreshing(false);
    }
  };

  const handleNotify = async () => {
    if (!id) return;
    try {
      setNotifyLoading(true);
      const docRef = doc(db, "records", id);
      await updateDoc(docRef, {
        notify: !notify
      });
      setNotify(!notify);
      setRecord((prev: any) => ({ ...prev, notify: !notify }));
      toast.success(notify ? "Notifications disabled" : "Notifications enabled");
    } catch (error) {
      console.error("Error updating notifications:", error);
      toast.error("Failed to update notifications");
    } finally {
      setNotifyLoading(false);
    }
  };

  const addRemark = async () => {
    if (!id || !remarks.trim()) return;
    try {
      setLoading(true);
      const docRef = doc(db, "records", id);
      await updateDoc(docRef, {
        remarks: remarks
      });
      setRecord((prev: any) => ({ ...prev, remarks: remarks }));
      toast.success("Remark added successfully");
      setRemarksDialog(false);
      setRemarks("");
    } catch (error) {
      console.error("Error adding remark:", error);
      toast.error("Failed to add remark");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // If record wasn't passed via state, fetch it
    if (!record && id) {
      const fetchRecord = async () => {
        try {
          setLoading(true);
          const docRef = doc(db, "records", id);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data: any = { id: docSnap.id, ...docSnap.data() };
            setRecord(data);
            setNotify(data.notify !== false); // Default to true if not set
          } else {
            console.error("Record not found");
            navigate(-1);
          }
        } catch (error) {
          console.error("Error fetching record:", error);
          navigate(-1);
        } finally {
          setLoading(false);
        }
      };
      fetchRecord();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh"
      }}>
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  //   const getInitials = (name: string) => {
  //     return name[0]?.toUpperCase() || "?";
  //   };

  if (!record) {
    return null;
  }

  //   const today = moment();
  //   const isExpiring = (dateStr: string, months: number = 2) => {
  //     if (!dateStr) return false;
  //     return moment(dateStr, "DD/MM/YYYY").diff(today, "months") <= months;
  //   };


  const handleArchive = () => {
    setArchivePrompt(true);
  };

  const handleDelete = () => {
    setDeletePrompt(true);
  };

  const resetEditedStates = () => {
    setEditedName(undefined);
    setEditedDepartment(undefined);
    setEditedEmail(undefined);
    setEditedEmpId(undefined);
    setEditedEmpType(undefined);
    setEditedNationality(undefined);
    setEditedDesignation(undefined);
    setEditedProject(undefined);
    setEditedOtEligible(undefined);
    setEditedCompany(undefined);
    setEditedCivilId(undefined);
    setEditedStatus(undefined);
    setEditedShift(undefined);
    setEditedDoj(undefined);
    setEditedPhone(undefined);
    setEditedCug(undefined);
  };

  const archiveRecord = async () => {
    if (!id) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "records", id), {
        state: record.state === "active" ? "archived" : "active",
        notify: record.state === "active" ? false : true,
      });
      setRecord({ ...record, state: record.state === "active" ? "archived" : "active" });
      toast.success(record.state === "active" ? "Record archived" : "Record unarchived");
      setArchivePrompt(false);
    } catch (error) {
      console.error("Error archiving record:", error);
      toast.error("Failed to archive record");
    } finally {
      setLoading(false);
    }
  };

  const deleteRecord = async () => {
    if (!id) return;
    setLoading(true);
    try {
      setRecordDeleteStatus("Deleting Record (1/2)");
      await deleteDoc(doc(db, "records", id));

      if (record.profile_name) {
        setRecordDeleteStatus("Deleting Image (2/2)");
        try {
          await deleteObject(ref(storage, record.profile_name));
        } catch (error) {
          console.error("Error deleting image:", error);
        }
      }

      toast.success("Record deleted successfully");
      navigate(-1); // Go back to previous page
    } catch (error) {
      console.error("Error deleting record:", error);
      toast.error("Failed to delete record");
      setLoading(false);
      setRecordDeleteStatus("");
    }
  };

  const editRecord = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const updatedFields = {
        name: editedName !== undefined ? editedName : (record.name || ""),
        department: editedDepartment !== undefined ? editedDepartment : (record.department || ""),
        email: editedEmail !== undefined ? editedEmail : (record.email || ""),
        emp_id: editedEmpId !== undefined ? editedEmpId : (record.emp_id || ""),
        emp_type: editedEmpType !== undefined ? editedEmpType : (record.emp_type || record.workerType || ""),
        nationality: editedNationality !== undefined ? editedNationality : (record.nationality || ""),
        designation: editedDesignation !== undefined ? editedDesignation : (record.designation || ""),
        project: editedProject !== undefined ? editedProject : (record.project || ""),
        ot_eligible: editedOtEligible !== undefined ? editedOtEligible : (record.ot_eligible || false),
        company: editedCompany !== undefined ? editedCompany : (record.company || ""),
        civil_id: editedCivilId !== undefined ? editedCivilId : (record.civil_id || ""),
        status: editedStatus !== undefined ? editedStatus : (record.status || ""),
        shift: editedShift !== undefined ? editedShift : (record.shift || ""),
        doj: editedDoj !== undefined ? editedDoj : (record.doj || record.DOJ || ""),
        phone: editedPhone !== undefined ? editedPhone : (record.phone || ""),
        cug: editedCug !== undefined ? editedCug : (record.cug || record.CUG || ""),
        modified_on: new Date().toISOString(),
      };

      // Since we are restricting editing to only the fields in the `employees` table,
      // we save them to the Firebase document as expected.
      try {
        await updateDoc(doc(db, "records", id), updatedFields);
      } catch (fbError) {
        console.error("Firebase update failed, continuing to Supabase:", fbError);
        // Continue even if Firebase fails, in case it's disabled due to migration
      }

      if (updatedFields.emp_id) {
        const { error: sbError } = await supabase
          .from('employees')
          .update({
            name: updatedFields.name || null,
            department: updatedFields.department || null,
            email: updatedFields.email || null,
            emp_id: updatedFields.emp_id || null,
            emp_type: updatedFields.emp_type || null,
            nationality: updatedFields.nationality || null,
            designation: updatedFields.designation || null,
            project: updatedFields.project || null,
            ot_eligible: updatedFields.ot_eligible || false,
            company: updatedFields.company || null,
            civil_id: updatedFields.civil_id || null,
            status: updatedFields.status || 'active',
            shift: updatedFields.shift || null,
            doj: updatedFields.doj || null,
            phone: updatedFields.phone || null,
            cug: updatedFields.cug || null,
          })
          .eq('emp_id', updatedFields.emp_id);

        if (sbError) {
          throw new Error("Supabase Error: " + sbError.message);
        }
      }

      // Update local record state
      setRecord({
        ...record,
        ...updatedFields,
      });

      toast.success("Record updated successfully");
      setEditPrompt(false);
      resetEditedStates();
    } catch (error) {
      console.error("Error updating record:", error);
      toast.error("Failed to update record: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ border: "", height: "100svh", display: "flex", flexFlow: "column" }}>
        <Back


          fixed
          blurBG
          //   subtitle={record.id} 
          extra={
            <>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {(userData?.editor === "true" || userData?.editor === true) && (
                  <Tooltip title={notify ? "Notifications enabled" : "Notifications disabled"}>
                    <button

                      onClick={handleNotify}
                      style={{
                        paddingLeft: "1rem",
                        paddingRight: "1rem",

                        fontSize: "0.8rem"
                      }}
                    >
                      Notify
                      {notifyLoading ? (
                        <Loader2 className="animate-spin" width="0.9rem" color="mediumslateblue" />
                      ) : notify ? (
                        <BellRing color={"black"} width={"0.9rem"} fill="black" />
                      ) : (
                        <BellOff width={"0.9rem"} color="grey" />
                      )}
                    </button>
                  </Tooltip>
                )}
                <RefreshButton
                  onClick={refreshData}
                  refreshCompleted={refreshCompleted}
                  fetchingData={refreshing}
                />
                {(userData?.editor === "true" || userData?.editor === true) && (
                  <DropDown
                    trigger={<EllipsisVertical width="1.1rem" />}
                    // onEdit={handleEdit} // Editing is now handled in Attendance -> Manage
                    onDelete={handleDelete}
                    onExtra={handleArchive}
                    extraText={record?.state === "active" ? "Archive" : "Unarchive"}
                  />
                )}
              </div>

            </>
          }
        />
        <div style={{ border: "", marginTop: "5rem", height: "100%", overflow: "auto" }}>
          <div style={{ padding: "1rem", display: "flex", flexFlow: "column", gap: "1rem" }}>
            <div style={{ display: "flex", background: "rgba(100 100 100/ 0.1)", padding: "1rem", borderRadius: "0.5rem", gap: "1rem", alignItems: "center", position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(20px)" }}>
              {/* <div onClick={() => record?.image && setImageDialog(true)} style={{cursor: record?.image ? "pointer" : "default"}}>
                      <LazyLoader
                        profile={record?.image}
                        gradient
                        block
                        width="4rem"
                        height="4rem"
                        name={record?.name}
                        loading={false}
                        state={record?.state}
                        omni={record?.omni}
                      />
                    </div> */}

              <div style={{ display: "flex", flexFlow: "column", flex: 1, minWidth: 0 }}>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <FileArchive />
                  <h2 style={{ textTransform: "capitalize", margin: 0, textAlign: "left" }}>{record?.name?.toLowerCase() || "Unknown"}</h2>
                </div>
                <p style={{ margin: 0, opacity: 0.7 }}>{record.emp_id}</p>
                {record?.modified_on && moment(record.modified_on, "DD/MM/YYYY", true).isValid() && (
                  <p style={{ fontSize: "0.75rem", opacity: 0.5, margin: 0 }}>
                    Last modified <ReactTimeAgo date={moment(record.modified_on, "DD/MM/YYYY").toDate()} timeStyle={"twitter"} locale="en-us" />
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <div style={{ background: "rgba(100 100 100/ 0.1)", padding: "0.5rem 1rem", display: "flex", fontSize: "0.8rem", borderRadius: "0.5rem", gap: "0.5rem", flex: "1", minWidth: "fit-content" }}>
                <b>Joined</b> {record?.DOJ || "N/A"}
              </div>
              <div style={{ background: "rgba(100 100 100/ 0.1)", padding: "0.5rem 1rem", display: "flex", fontSize: "0.8rem", borderRadius: "0.5rem", gap: "0.5rem", flex: "1", minWidth: "fit-content", textAlign: "left" }}>
                <b>Company</b> {record?.company || "N/A"}
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
              <div style={{ background: "rgba(100 100 100/ 0.1)", padding: "1rem", flex: "1", minWidth: "250px", borderRadius: "0.5rem", display: "flex", gap: "1rem" }}>
                <div style={{ flex: "1" }}>
                  <p style={{ opacity: 0.6, fontSize: "0.85rem" }}>Contact</p>
                  <p style={{ fontWeight: "600" }}>{record?.phone || "N/A"}</p>
                </div>
                <div style={{ borderLeft: "1px solid rgba(100 100 100/ 0.2)", paddingLeft: "1rem", flex: "1" }}>
                  <p style={{ opacity: 0.6, fontSize: "0.85rem" }}>CUG</p>
                  <p style={{ fontWeight: "600" }}>{record?.CUG || "N/A"}</p>
                </div>
              </div>
              <div style={{ background: "rgba(100 100 100/ 0.1)", padding: "1rem", flex: "1", minWidth: "250px", borderRadius: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <p style={{ opacity: 0.6, fontSize: "0.85rem" }}>Email</p>
                <p style={{ fontWeight: "600", fontSize: "0.9rem" }}>{record?.email || "N/A"}</p>
              </div>
              <div style={{ background: "rgba(100 100 100/ 0.1)", padding: "1rem", flex: "1", minWidth: "250px", borderRadius: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <p style={{ opacity: 0.6, fontSize: "0.85rem" }}>Nationality</p>
                <p style={{ fontWeight: "600" }}>{record?.nationality || "N/A"}</p>
              </div>
              <div style={{ background: "rgba(100 100 100/ 0.1)", padding: "1rem", flex: "1", minWidth: "250px", borderRadius: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <p style={{ opacity: 0.6, fontSize: "0.85rem" }}>Role</p>
                <p style={{ fontWeight: "600" }}>{record?.role || "N/A"}</p>
              </div>
              <div style={{ background: "rgba(100 100 100/ 0.1)", padding: "1rem", flex: "1", minWidth: "250px", borderRadius: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <p style={{ opacity: 0.6, fontSize: "0.85rem" }}>Department</p>
                <p style={{ fontWeight: "600" }}>{record?.department || "N/A"}</p>
              </div>
              <div style={{ background: "rgba(100 100 100/ 0.1)", padding: "1rem", flex: "1", minWidth: "250px", borderRadius: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <p style={{ opacity: 0.6, fontSize: "0.85rem" }}>Designation</p>
                <p style={{ fontWeight: "600" }}>{record?.designation || "N/A"}</p>
              </div>
              <div style={{ background: "rgba(100 100 100/ 0.1)", padding: "1rem", flex: "1", minWidth: "250px", borderRadius: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <p style={{ opacity: 0.6, fontSize: "0.85rem" }}>Location</p>
                <p style={{ fontWeight: "600" }}>{record?.location || "N/A"}</p>
              </div>
              <div style={{ background: "rgba(100 100 100/ 0.1)", padding: "1rem", flex: "1", minWidth: "250px", borderRadius: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <p style={{ opacity: 0.6, fontSize: "0.85rem" }}>Project</p>
                <p style={{ fontWeight: "600" }}>{record?.project || "N/A"}</p>
              </div>
              {
                record?.allocated_vehicle &&
                <div style={{ background: "rgba(100 100 100/ 0.1)", padding: "1rem", flex: "1", minWidth: "250px", borderRadius: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <p style={{ opacity: 0.6, fontSize: "0.85rem" }}>Allocated Vehicle</p>
                  <p style={{ fontWeight: "600" }}>{record?.allocated_vehicle || "N/A"}</p>
                </div>
              }

            </div>

            {/* Remarks Section */}
            <div style={{ background: "rgba(100 100 100/ 0.1)", padding: "1rem", borderRadius: "0.5rem" }}>
              <p style={{ opacity: 0.6, fontSize: "0.85rem", marginBottom: "0.5rem" }}>Remarks</p>
              <p style={{ fontWeight: "500" }}>{record?.remarks || "N/A"}</p>
            </div>

            {/* Documents Section */}
            <div style={{ display: "flex", flexFlow: "column", gap: "0.5rem" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: "600", opacity: 0.8, margin: "0.5rem 0" }}>Documents</h3>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", width: "100%", minWidth: 0, maxWidth: "100%", flexWrap: "wrap" }}>
                <Directive
                  noArrow
                  id_subtitle={record?.civil_expiry ? record.civil_expiry : "No Data"}
                  onClick={() => setCivil(true)}
                  icon={<CreditCard color="mediumslateblue" />}
                  title="Civil ID"
                  expiring={
                    record?.civil_expiry && moment(record.civil_expiry, "DD/MM/YYYY").diff(moment(today), "months") <= 2
                      ? true
                      : false
                  }
                />

                <Directive
                  noArrow
                  id_subtitle={record?.passportExpiry ? record.passportExpiry : "No Data"}
                  onClick={() => setPassportDialog(true)}
                  icon={<Book color="goldenrod" />}
                  title="Passport"
                  expiring={
                    record?.passportExpiry && moment(record.passportExpiry, "DD/MM/YYYY").diff(moment(today), "months") <= 6
                      ? true
                      : false
                  }
                />
              </div>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", width: "100%", minWidth: 0, maxWidth: "100%", flexWrap: "wrap" }}>
                {(record?.type === "vale" || record?.omni) && (
                  <Directive
                    noArrow
                    id_subtitle={record?.medical_due_on ? record.medical_due_on : "No Data"}
                    onClick={() => setHealthDialog(true)}
                    icon={<HeartPulse color="tomato" />}
                    title="Medical"
                    expiring={
                      record?.medical_due_on && moment(record.medical_due_on, "DD/MM/YYYY").diff(moment(today), "months") <= 2
                        ? true
                        : false
                    }
                  />
                )}

                {(record?.omni || record?.vt_hse_induction || record?.vt_car_1) && (
                  <Directive
                    noArrow
                    id_subtitle={
                      (record?.vt_hse_induction && moment(record.vt_hse_induction, "DD/MM/YYYY").diff(moment(today), "months") <= 2) ||
                        (record?.vt_car_1 && moment(record.vt_car_1, "DD/MM/YYYY").diff(moment(today), "months") <= 2) ||
                        (record?.vt_car_2 && moment(record.vt_car_2, "DD/MM/YYYY").diff(moment(today), "months") <= 2)
                        ? "Expiring"
                        : "No Alerts"
                    }
                    onClick={() => toast.info("Training details")}
                    icon={<GraduationCap color="lightgreen" />}
                    title="Training"
                    expiring={
                      (record?.vt_hse_induction && moment(record.vt_hse_induction, "DD/MM/YYYY").diff(moment(today), "months") <= 2) ||
                        (record?.vt_car_1 && moment(record.vt_car_1, "DD/MM/YYYY").diff(moment(today), "months") <= 2) ||
                        (record?.vt_car_2 && moment(record.vt_car_2, "DD/MM/YYYY").diff(moment(today), "months") <= 2)
                        ? true
                        : false
                    }
                  />
                )}
              </div>
            </div>

          </div>

        </div>
      </motion.div>

      {/* Archive Dialog */}
      <DefaultDialog
        titleIcon={<Archive color="orange" />}
        title={record?.state === "active" ? "Archive Record?" : "Unarchive?"}
        open={archivePrompt}
        onCancel={() => setArchivePrompt(false)}
        OkButtonText={record?.state === "active" ? "Archive" : "Confirm"}
        onOk={archiveRecord}
        updating={loading}
        disabled={loading}
      />

      {/* Delete Dialog */}
      <DefaultDialog
        open={deletePrompt}
        titleIcon={<X />}
        destructive
        title="Delete Record?"
        desc={id}
        OkButtonText="Delete"
        onCancel={() => setDeletePrompt(false)}
        onOk={deleteRecord}
        updating={loading}
        disabled={loading}
        extra={
          recordDeleteStatus ? (
            <div style={{ width: "100%" }}>
              <p style={{ fontSize: "0.7rem", opacity: 0.5 }}>
                {recordDeleteStatus}
              </p>
            </div>
          ) : null
        }
      />

      {/* Edit Dialog/Drawer - Responsive Modal */}
      {editPrompt && (
        <ResponsiveModal
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              resetEditedStates();
              setEditPrompt(false);
            }
          }}
          title=""
          description=""
        >
          <EditRecordFormContent
            record={record}
            editedName={editedName}
            editedDepartment={editedDepartment}
            editedEmail={editedEmail}
            editedEmpId={editedEmpId}
            editedEmpType={editedEmpType}
            editedNationality={editedNationality}
            editedDesignation={editedDesignation}
            editedProject={editedProject}
            editedOtEligible={editedOtEligible}
            editedCompany={editedCompany}
            editedCivilId={editedCivilId}
            editedStatus={editedStatus}
            editedShift={editedShift}
            editedDoj={editedDoj}
            editedPhone={editedPhone}
            editedCug={editedCug}
            setEditedName={setEditedName}
            setEditedDepartment={setEditedDepartment}
            setEditedEmail={setEditedEmail}
            setEditedEmpId={setEditedEmpId}
            setEditedEmpType={setEditedEmpType}
            setEditedNationality={setEditedNationality}
            setEditedDesignation={setEditedDesignation}
            setEditedProject={setEditedProject}
            setEditedOtEligible={setEditedOtEligible}
            setEditedCompany={setEditedCompany}
            setEditedCivilId={setEditedCivilId}
            setEditedStatus={setEditedStatus}
            setEditedShift={setEditedShift}
            setEditedDoj={setEditedDoj}
            setEditedPhone={setEditedPhone}
            setEditedCug={setEditedCug}
            loading={loading}
            handleSubmit={editRecord}
          />
        </ResponsiveModal>
      )}

      {/* Remarks Dialog */}
      <InputDialog
        title="Add Remark"
        inputplaceholder="Enter remarks"
        OkButtonText="Update"
        OkButtonIcon={<RefreshCcw width={"1rem"} />}
        open={remarksDialog}
        onCancel={() => setRemarksDialog(false)}
        inputOnChange={(e: any) => setRemarks(e.target.value)}
        onOk={addRemark}
        updating={loading}
        disabled={loading}
        input1Value={remarks}
      />

      {/* Image Dialog */}
      <ImageDialog
        open={imageDialog}
        src={record?.image}
        onCancel={() => setImageDialog(false)}
      />

      {/* Civil ID Dialog */}
      <DefaultDialog
        close
        titleIcon={<CreditCard color="mediumslateblue" />}
        title="Civil ID"
        open={civil}
        onCancel={() => setCivil(false)}
        extra={
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "20ch" }}>
            {record?.civil_id ? (
              <CivilID
                name={record?.name}
                expirydate={record?.civil_expiry}
                civilid={record?.civil_id}
                DOB={record?.civil_DOB}
              />
            ) : (
              <div style={{ opacity: 0.5, textAlign: "center" }}>
                <CreditCard width="3rem" height="3rem" style={{ margin: "1rem auto" }} />
                <p>No Civil ID data</p>
              </div>
            )}
          </div>
        }
      />

      {/* Passport Dialog */}
      <DefaultDialog
        close
        titleIcon={<Book color="goldenrod" />}
        title="Passport"
        open={passportDialog}
        onCancel={() => setPassportDialog(false)}
        extra={
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "20ch" }}>
            {record?.passportID ? (
              <Passport
                name={record?.name}
                expiry={record?.passportExpiry}
                passport_id={record?.passportID}
                issue={record?.passportIssue}
              />
            ) : (
              <div style={{ opacity: 0.5, textAlign: "center" }}>
                <Book width="3rem" height="3rem" style={{ margin: "1rem auto" }} />
                <p>No Passport data</p>
              </div>
            )}
          </div>
        }
      />

      {/* Medical Dialog */}
      <DefaultDialog
        close
        titleIcon={<HeartPulse color="tomato" />}
        title="Medical"
        open={healthDialog}
        onCancel={() => setHealthDialog(false)}
        extra={
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "20ch" }}>
            {record?.medical_due_on ? (
              <MedicalID
                name={record?.name}
                dueOn={record?.medical_due_on}
                completedOn={record?.medical_completed_on}
              />
            ) : (
              <div style={{ opacity: 0.5, textAlign: "center" }}>
                <HeartPulse width="3rem" height="3rem" style={{ margin: "1rem auto" }} />
                <p>No Medical data</p>
              </div>
            )}
          </div>
        }
      />

    </>

    // <div style={{ paddingBottom: "2rem", border:"solid" }}>
    //   <div style={{ padding: "1.25rem", border:"solid"}}>
    //     <Back  title={record.name} />
    //   </div>

    //   <div style={{ padding: "1.25rem", paddingTop: 0 }}>
    //     {/* Basic Information */}
    //     <div style={{ 
    //       display: "flex", 
    //       flexDirection: "column", 
    //       gap: "0.75rem",
    //       marginBottom: "1.5rem"
    //     }}>
    //       <h3 style={{ opacity: 0.7, fontSize: "0.9rem", marginBottom: "0.25rem" }}>Basic Information</h3>

    //       {record.email && (
    //         <Directive 
    //           icon={<Mail width="1.25rem" color="mediumslateblue" />}
    //           title={record.email}
    //           notName
    //           onClick={() => window.location.href = `mailto:${record.email}`}
    //         />
    //       )}

    //       {record.phone && (
    //         <Directive 
    //           icon={<Phone width="1.25rem" color="mediumslateblue" />}
    //           title={record.phone}
    //           onClick={() => window.location.href = `tel:${record.phone}`}
    //         />
    //       )}

    //       {record.CUG && (
    //         <Directive 
    //           icon={<Building2 width="1.25rem" color="mediumslateblue" />}
    //           title={`CUG: ${record.CUG}`}
    //           onClick={() => window.location.href = `tel:${record.CUG}`}
    //         />
    //       )}

    //       {record.designation && (
    //         <Directive 
    //           icon={<Briefcase width="1.25rem" color="mediumslateblue" />}
    //           title={record.designation}
    //           subtext="Designation"
    //         />
    //       )}

    //       {record.site && (
    //         <Directive 
    //           icon={<MapPin width="1.25rem" color="mediumslateblue" />}
    //           title={record.site}
    //           subtext="Site"
    //         />
    //       )}

    //       {record.project && (
    //         <Directive 
    //           icon={<Building2 width="1.25rem" color="mediumslateblue" />}
    //           title={record.project}
    //           subtext="Project"
    //         />
    //       )}
    //     </div>

    //     {/* Documents Section */}
    //     <div style={{ 
    //       display: "flex", 
    //       flexDirection: "column", 
    //       gap: "0.75rem" 
    //     }}>
    //       <h3 style={{ opacity: 0.7, fontSize: "0.9rem", marginBottom: "0.25rem" }}>Documents</h3>

    //       <div style={{ display: "flex", gap: "0.75rem" }}>
    //         <Directive 
    //           noArrow
    //           icon={<CreditCard width="1.25rem" color="mediumslateblue" />}
    //           title="Civil ID"
    //           id_subtitle={record.civil_expiry || "No Data"}
    //           expiring={isExpiring(record.civil_expiry, 2)}
    //         />

    //         <Directive 
    //           noArrow
    //           icon={<Book width="1.25rem" color="goldenrod" />}
    //           title="Passport"
    //           id_subtitle={record.passportExpiry || "No Data"}
    //           expiring={isExpiring(record.passportExpiry, 6)}
    //         />
    //       </div>

    //       {record.medical_due_on && (
    //         <Directive 
    //           noArrow
    //           icon={<HeartPulse width="1.25rem" color="tomato" />}
    //           title="Medical"
    //           id_subtitle={record.medical_due_on || "No Data"}
    //           expiring={isExpiring(record.medical_due_on, 2)}
    //         />
    //       )}

    //       {(record.vt_hse_induction || record.vt_car_1) && (
    //         <Directive 
    //           noArrow
    //           icon={<GraduationCap width="1.25rem" color="lightgreen" />}
    //           title="Training"
    //           id_subtitle={
    //             isExpiring(record.vt_hse_induction, 2) || 
    //             isExpiring(record.vt_car_1, 2) || 
    //             isExpiring(record.vt_car_2, 2)
    //               ? "Expiring"
    //               : "No Alerts"
    //           }
    //           expiring={
    //             isExpiring(record.vt_hse_induction, 2) || 
    //             isExpiring(record.vt_car_1, 2) || 
    //             isExpiring(record.vt_car_2, 2)
    //           }
    //         />
    //       )}
    //     </div>

    //     {record.emp_id && (
    //       <div style={{ marginTop: "1.5rem", opacity: 0.5, fontSize: "0.85rem", border:"solid" }}>
    //         Employee Code: {record.emp_id}
    //       </div>
    //     )}
    //   </div>
    // </div>
  );
}
