import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import { ResponsiveModal } from "@/components/responsive-modal";
import { RichTextEditor } from "@/components/rich-text-editor";
import DefaultDialog from "@/components/ui/default-dialog";
import {
  Drawer,
  DrawerContent,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { LoadingOutlined } from "@ant-design/icons";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import emailjs from "@emailjs/browser";
import { Drawer as AntDrawer, Input, message, Modal } from "antd";
import { AnimatePresence, motion } from "framer-motion";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CloudOff,
  CreditCard,
  Database,
  Dot,
  Expand,
  Eye,
  EyeOff,
  File,
  FilePlus,
  FilePlus2,
  FileText,
  FileX,
  Gift,
  GripVertical,
  Loader2,
  LoaderCircle,
  Menu,
  MinusCircle,
  MoreVertical,
  MoveVertical,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Shield,
  Sidebar,
  Sparkles,
  TextCursor,
  Trash2,
  User,
  X
} from "lucide-react";
import moment from "moment";
import React, { useEffect, useRef, useState } from "react";

// Add styles at the top of the file
const styles = {
  mobileMenuButton: {
    display: "none",
  },
  inputForm: {
    width: "30%",
    // background: "rgba(255 255 255/ 5%)",
    borderRadius: "0.5rem",
  },
  preview: {
    flex: 1,
    // background: "rgba(255 255 255/ 5%)",
    borderRadius: "0.5rem",
  },
};

// Input style for all fields
const inputStyle = {
  width: "100%",
  fontSize: "0.92rem",
  lineHeight: 1.4,
  padding: "0.65rem 0.75rem",
  borderRadius: "0.6rem",
  border: "1px solid rgba(15 23 42/ 18%)",
  background: "rgba(255 255 255/ 96%)",
  color: "rgba(17 24 39/ 92%)",
  outline: "none",
  boxShadow: "0 1px 2px rgba(15 23 42/ 6%)",
  transition: "border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease",
};

// Table cell style for preview
const tableCellStyle = {
  border: "1px solid rgba(100 100 100/ 50%)",
  padding: "4.75px 10px 12px 10px",
  fontWeight: 500,
  textTransform: "uppercase" as const,
  verticalAlign: "top",
  fontFamily: "",
  background: "none",
};

const leftColumnStyle = {
  ...tableCellStyle,
  width: "35%",
  maxWidth: "200px",
};

const PREVIEW_BASE_WIDTH = 800;
const PREVIEW_MOBILE_GUTTER = 32;
const FORM_PANEL_BREAKPOINT = 1300;

const PREVIEW_JUMP_TIP_DISMISSED_KEY = "offerLetters.previewJumpTipDismissed";

const PREVIEW_FIELD_ORDER = [
  "candidateName",
  "passportNumber",
  "position",
  "workLocation",
  "salary",
  "allowance",
  "attendance",
  "probation",
  "reportingDate",
  "contractPeriod",
  "noticePeriod",
  "accomodation",
  "food",
  "transport",
  "communication",
  "insurance",
  "annualLeave",
  "gratuity",
  "leaveEncashment",
  "grossSalary",
  "airPassage",
  "sectorOfTravel",
  "classOfTravel",
  "visaStatus",
  "medicalTerms",
  "incrementTerms",
  "workingHours",
  "medical",
];

const PREVIEW_FIELD_ORDER_INDEX = new Map(
  PREVIEW_FIELD_ORDER.map((fieldId, index) => [fieldId, index])
);

type FieldType = "text" | "textarea" | "number" | "date";

type FieldConfig = {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  rows?: number;
  enabled: boolean;
  isCustom?: boolean;
  section?: "table" | "paragraph";
};

type FormData = {
  date: string;
  refNo: string;
  candidateName: string;
  passportNumber: string;
  position: string;
  workLocation: string;
  salary: string;
  allowance: string;
  grossSalary: string;
  attendance: string;
  probation: string;
  reportingDate: string;
  contractPeriod: string;
  noticePeriod: string;
  noticePeriodSubsections: string[];
  accomodation: string;
  food: string;
  transport: string;
  visaStatus: string;
  communication: string;
  medical: string;
  insurance: string;
  annualLeave: string;
  gratuity: string;
  leaveEncashment: string;
  workingHours: string;
  airPassage: string;
  sectorOfTravel: string;
  classOfTravel: string;
  medicalTerms: string;
  incrementTerms: string;
  roles: Array<{ title: string; description: string }>;
  allowances: Array<{ title: string; description: string }>;
  customFields?: { [key: string]: string };
};

type Preset = {
  id: string;
  name: string;
  data: FormData;
  created_at: string;
  fieldConfig?: FieldConfig[];
};

// Sortable table row component for drag and drop
interface SortableTableRowProps {
  id: string;
  children: React.ReactNode;
  dragEnabled?: boolean;
}

const SortableTableRow: React.FC<SortableTableRowProps> = ({
  id,
  children,
  dragEnabled = true,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !dragEnabled });

  const style = {
    transform: dragEnabled ? CSS.Transform.toString(transform) : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative" as const,
    cursor: "pointer",
  };

  return (
    <tr
      ref={setNodeRef}
      {...(dragEnabled ? attributes : {})}
      {...(dragEnabled ? listeners : {})}
      data-field-id={id}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {React.Children.map(children, (child, index) => {
        if (index === 0 && React.isValidElement(child)) {
          // Add drag handle to the first cell
          return React.cloneElement(child as React.ReactElement<any>, {
            style: {
              ...(child.props.style || {}),
              position: "relative",
            },
            children: (
              <>
                <div
                  style={{
                    position: "absolute",
                    left: "-20px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    cursor: dragEnabled ? "grab" : "default",
                    opacity: dragEnabled && (isHovered || isDragging) ? 1 : 0,
                    transition: "opacity 0.4s ease",
                    display: "flex",
                    alignItems: "center",
                    color: "rgba(0 0 139/ 55%)",
                    pointerEvents: dragEnabled ? "auto" : "none",
                    zIndex: 2,
                  }}
                >
                  <GripVertical size={13} />
                </div>
                {child.props.children}
              </>
            ),
          });
        }
        return child;
      })}
    </tr>
  );
};

export default function OfferLetters() {
  //   const usenavigate = useNavigate();
const [searchTerm, setSearchTerm] = useState("");
  const { userData } = useAuth();
  const [bugDialog, setBugDialog] = useState(false);
  const [issue, setIssue] = useState("");
  const [loading, setLoading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [hideDesktopInputSection, setHideDesktopInputSection] = useState(true);
  const [responsiveFormDrawerOpen, setResponsiveFormDrawerOpen] = useState(false);
  const [previewContentHeight, setPreviewContentHeight] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const canEditOfferLetters = (() => {
    try {
      const permissions = JSON.parse(userData?.clearance || "{}") as Record<string, boolean>;
      const hasStructuredClearance = Object.keys(permissions).length > 0;
      const hasOfferLettersModule = permissions.offer_letters === true;
      const hasOfferLettersEdit = permissions.offer_letters_edit === true;
      const hasExplicitEditBlock = permissions.offer_letters_edit === false;

      if (hasOfferLettersModule) {
        return hasOfferLettersEdit;
      }

      if (permissions.offer_letters === false || hasExplicitEditBlock) {
        return false;
      }

      if (userData?.role === "admin" || userData?.role === "site_admin") {
        // Preserve legacy admin behavior only for accounts without structured module clearance.
        return !hasStructuredClearance;
      }

      return false;
    } catch {
      return userData?.role === "admin" || userData?.role === "site_admin";
    }
  })();
  const previewScale =
    screenWidth < FORM_PANEL_BREAKPOINT
      ? Math.min(
          1,
          Math.max(
            0.32,
            (screenWidth - PREVIEW_MOBILE_GUTTER) / PREVIEW_BASE_WIDTH
          )
        )
      : 1;
  const showPreviewSpacingControls =
    canEditOfferLetters &&
    (screenWidth < FORM_PANEL_BREAKPOINT
      ? responsiveFormDrawerOpen
      : !hideDesktopInputSection);
  const getNextReferenceNumber = (existingLetters: Array<{refNo?: string}>) => {
    // Extract existing reference numbers and find the highest one
    const numbers = existingLetters
      .map((letter: {refNo?: string}) => {
        const match = letter.refNo?.match(/SSU\/HO\/(\d+)\/\d+/);
        return match ? parseInt(match[1]) : 316;  // Start from 316 if no matches found
      })
      .filter((num: number) => !isNaN(num));

    const highestNumber = Math.max(316, ...numbers);
    // Format: SSU/HO/XXX/YY where XXX is sequential and YY is last two digits of year
    const year = new Date().getFullYear().toString().slice(-2);
    const nextNumber = (highestNumber + 1).toString();
    return `SSU/HO/${nextNumber}/${year}`;
  };

  const [formData, setFormData] = useState<FormData>({
    date: new Date().toISOString().split('T')[0],
    refNo: "",
    candidateName: "",
    passportNumber: "",
    position: "",
    workLocation: "",
    salary: "",
    allowance: "",
    grossSalary: "",
    attendance: "",
    probation: "",
    reportingDate: "",
    contractPeriod: "",
    noticePeriod: "",
    noticePeriodSubsections: [],
    accomodation: "",
    food: "",
    transport: "",
    visaStatus: "",
    communication: "",
    medical: "",
    insurance: "",
    annualLeave: "",
    gratuity: "",
    leaveEncashment: "",
    workingHours: "",
    airPassage: "",
    sectorOfTravel: "",
    classOfTravel: "",
    medicalTerms: "",
    incrementTerms: "",
    roles: [],
    allowances: [],
    customFields: {},
  });

  useEffect(() => {
    // Fetch letters and set initial reference number when component mounts
    fetchOfferLetters();
  }, []);

  useEffect(() => {
    // Track screen width for responsive layout
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const node = previewContentRef.current;
    if (!node) return;

    const updateHeight = () => {
      setPreviewContentHeight(node.scrollHeight || 1);
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateHeight();
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!canEditOfferLetters) {
      setResponsiveFormDrawerOpen(false);
      setDrawerVisible(false);
      setHideDesktopInputSection(true);
    }
  }, [canEditOfferLetters]);

  const tableRef = useRef<HTMLDivElement>(null);
  const rolesRef = useRef<HTMLDivElement>(null);
  const restRef = useRef<HTMLDivElement>(null);
  const signatureRef = useRef<HTMLDivElement>(null);
  const previewContentRef = useRef<HTMLDivElement>(null);
  const lastRoleRef = useRef<HTMLDivElement>(null);
  const lastAllowanceRef = useRef<HTMLDivElement>(null);
  const lastSubsectionRef = useRef<HTMLDivElement>(null);
  
  // Section refs for scroll-to functionality
  const basicSectionRef = useRef<HTMLDivElement>(null);
  const compensationSectionRef = useRef<HTMLDivElement>(null);
  const benefitsSectionRef = useRef<HTMLDivElement>(null);
  const termsSectionRef = useRef<HTMLDivElement>(null);
  const rolesSectionRef = useRef<HTMLDivElement>(null);
  const additionalTermsSectionRef = useRef<HTMLDivElement>(null);
  const customSectionRef = useRef<HTMLDivElement>(null);

  const serviceId = "service_fixajl8";
  const templateId = "template_0f3zy3e";

  const [offerLettersDrawerVisible, setOfferLettersDrawerVisible] =
    useState(false);
  const [offerLetters, setOfferLetters] = useState<any[]>([]);
  const [offerLettersLoading, setOfferLettersLoading] = useState(false);
  const [editingLetter, setEditingLetter] = useState<any>(null);
  // const [addingToShortlist, setAddingToShortlist] = useState(false);
  const [editDialogVisible, setEditDialogVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadedLetterId, setLoadedLetterId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalFormData, setOriginalFormData] = useState<any>(null);
  const [air_passage, setAirPassage] = useState(true);
  const [comm, setComm] = useState(true);
  const [visaS, setVisaS] = useState(true);
  const [offerLettersCache, setOfferLettersCache] = useState<any[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState("");
  const [presetName, setPresetName] = useState("");
  const [presetDialogVisible, setPresetDialogVisible] = useState(false);
  const [renameDialogVisible, setRenameDialogVisible] = useState(false);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [originalPresetData, setOriginalPresetData] = useState<FormData | null>(
    null
  );
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  const [joiningDate, setJoiningDate] = useState(true);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end for reordering fields
  const handleFieldDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFieldConfig((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Default field configuration
  const defaultFieldConfig: FieldConfig[] = [
    // Table section fields - in order of appearance in the table
    { id: "candidateName", label: "Candidate Name", type: "text", placeholder: "Enter candidate name", enabled: true, section: "table" },
    { id: "passportNumber", label: "Passport Number", type: "text", placeholder: "Enter passport number", enabled: false, section: "table" },
    { id: "position", label: "Job Title", type: "text", placeholder: "Enter Job Title", enabled: true, section: "table" },
    { id: "workLocation", label: "Location", type: "text", placeholder: "Enter work location", enabled: true, section: "table" },
    { id: "salary", label: "Basic Salary (OMR)", type: "number", placeholder: "Enter salary", enabled: true, section: "table" },
    { id: "allowance", label: "Allowance (OMR)", type: "number", placeholder: "Enter Allowance", enabled: true, section: "table" },
    { id: "grossSalary", label: "Gross Salary (OMR)", type: "number", placeholder: "Enter Gross Salary", enabled: true, section: "table" },
    { id: "attendance", label: "Attendance", type: "textarea", placeholder: "Enter Attendance Terms", rows: 4, enabled: true, section: "table" },
    { id: "probation", label: "Probation", type: "textarea", placeholder: "Enter Probation Terms", rows: 4, enabled: true, section: "table" },
    { id: "reportingDate", label: "Joining Date", type: "date", placeholder: "Enter Reporting Date", enabled: false, section: "table" },
    { id: "contractPeriod", label: "Contract Period", type: "textarea", placeholder: "Enter Contract Period", rows: 4, enabled: true, section: "table" },
    { id: "noticePeriod", label: "Notice Period", type: "textarea", placeholder: "Enter Notice Period", rows: 4, enabled: true, section: "table" },
    { id: "accomodation", label: "Accomodation", type: "textarea", placeholder: "Enter Accomodation Terms", rows: 4, enabled: true, section: "table" },
    { id: "food", label: "Food", type: "textarea", placeholder: "Enter Food Terms", rows: 4, enabled: true, section: "table" },
    { id: "transport", label: "Transport", type: "textarea", placeholder: "Enter Transport Terms", rows: 4, enabled: true, section: "table" },
    { id: "communication", label: "Communications", type: "textarea", placeholder: "Enter Communication Terms", rows: 4, enabled: true, section: "table" },
    { id: "insurance", label: "Insurance", type: "textarea", placeholder: "Enter Insurance Terms", rows: 4, enabled: true, section: "table" },
    { id: "annualLeave", label: "Annual Leave", type: "text", placeholder: "Enter Annual Leave Terms", enabled: false, section: "table" },
    { id: "gratuity", label: "Gratuity", type: "text", placeholder: "Enter Gratuity", enabled: false, section: "table" },
    { id: "leaveEncashment", label: "Leave Encashment", type: "text", placeholder: "Enter Leave Encashment Terms", enabled: false, section: "table" },
    // Paragraph section fields - fields that appear outside the table (in order of appearance in preview)
    { id: "airPassage", label: "Air Passage", type: "textarea", placeholder: "Enter Air Passage Terms", rows: 4, enabled: true, section: "paragraph" },
    { id: "sectorOfTravel", label: "Sector of Travel", type: "text", placeholder: "e.g., MUSCAT - DELHI", enabled: true, section: "paragraph" },
    { id: "classOfTravel", label: "Class of Travel", type: "text", placeholder: "e.g., Economy Class by any Airline", enabled: true, section: "paragraph" },
    { id: "visaStatus", label: "Visa Status", type: "textarea", placeholder: "Enter Visa Terms", rows: 4, enabled: true, section: "paragraph" },
    { id: "medicalTerms", label: "Medical Terms", type: "textarea", placeholder: "Enter detailed medical terms", rows: 4, enabled: true, section: "paragraph" },
    { id: "incrementTerms", label: "Increment Terms", type: "textarea", placeholder: "Enter increment terms", rows: 4, enabled: true, section: "paragraph" },
    { id: "workingHours", label: "Working Hours", type: "textarea", placeholder: "Enter Working Terms", enabled: true, section: "paragraph" },
    { id: "medical", label: "Medical", type: "textarea", placeholder: "Enter Medical Terms", rows: 4, enabled: false, section: "paragraph" },
  ];

  // Keep this map for backward compatibility when field IDs are renamed in code.
  const FIELD_ID_ALIASES: Record<string, string> = {
    // Example: oldId: "newId"
  };

  const normalizeLabel = (label?: string) =>
    (label || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const getMergedFieldConfig = (
    savedConfig?: FieldConfig[],
    passportNumberValue?: string
  ): FieldConfig[] => {
    const defaultWithFallback = defaultFieldConfig.map((field) =>
      field.id === "passportNumber" && passportNumberValue
        ? { ...field, enabled: true }
        : field
    );

    if (!savedConfig || savedConfig.length === 0) {
      return defaultWithFallback;
    }

    const defaultMap = new Map(defaultWithFallback.map((field) => [field.id, field]));
    const seenIds = new Set<string>();
    const merged: FieldConfig[] = [];

    const getResolvedId = (field: FieldConfig): string | null => {
      if (defaultMap.has(field.id)) return field.id;

      const aliasedId = FIELD_ID_ALIASES[field.id];
      if (aliasedId && defaultMap.has(aliasedId)) return aliasedId;

      const fieldKey = `${field.section}|${field.type}|${normalizeLabel(field.label)}`;
      const fallbackMatch = defaultWithFallback.find(
        (defaultField) =>
          !seenIds.has(defaultField.id) &&
          `${defaultField.section}|${defaultField.type}|${normalizeLabel(defaultField.label)}` === fieldKey
      );

      return fallbackMatch?.id || null;
    };

    savedConfig.forEach((field) => {
      const resolvedId = getResolvedId(field);

      if (!resolvedId) {
        if (!seenIds.has(field.id)) {
          merged.push(field);
          seenIds.add(field.id);
        }
        return;
      }

      if (seenIds.has(resolvedId)) {
        return;
      }

      merged.push({
        ...defaultMap.get(resolvedId),
        ...field,
        id: resolvedId,
      });
      seenIds.add(resolvedId);
    });

    defaultWithFallback.forEach((field) => {
      if (!seenIds.has(field.id)) {
        merged.push(field);
      }
    });

    return merged;
  };

  const [fieldConfig, setFieldConfig] = useState<FieldConfig[]>(defaultFieldConfig);
  
  // Collapsible sections state
  const [sectionsCollapsed, setSectionsCollapsed] = useState<{[key: string]: boolean}>({
    basic: false,
    compensation: false,
    benefits: false,
    terms: false,
    additionalTerms: false,
    roles: false,
    custom: false,
  });

  // PDF generation progress
  const [pdfProgress, setPdfProgress] = useState(0);
  
  // Highlighted field state
  const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(null);
  const [showPreviewJumpTip, setShowPreviewJumpTip] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(PREVIEW_JUMP_TIP_DISMISSED_KEY) !== "1";
  });
  const [fieldConfigDialogVisible, setFieldConfigDialogVisible] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editingFieldLabel, setEditingFieldLabel] = useState("");
  const [editingFieldType, setEditingFieldType] = useState<FieldType>("text");
  const [newFieldType, setNewFieldType] = useState<FieldType>("text");
  const [newFieldSection, setNewFieldSection] = useState<"table" | "paragraph">("table");
  const [draggedFieldIndex, setDraggedFieldIndex] = useState<number | null>(null);
  const [fieldConfigSectionsCollapsed, setFieldConfigSectionsCollapsed] = useState<{ table: boolean; paragraph: boolean }>({
    table: false,
    paragraph: false,
  });
  const [addCustomFieldDialogVisible, setAddCustomFieldDialogVisible] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [showInputScrollTopButton, setShowInputScrollTopButton] = useState(false);
  const [previewDragEnabled, setPreviewDragEnabled] = useState(false);
  const [firstPageFontSizeRem] = useState(0.8);
  const [firstPageTableFontSizeRem, setFirstPageTableFontSizeRem] = useState(0.7);
  const [firstPageGapPt, setFirstPageGapPt] = useState(0);
  const [rolesPageGapPt, setRolesPageGapPt] = useState(0);

  const clampFirstPageTableFontRem = (value: number) => {
    if (!Number.isFinite(value)) return 0.7;
    return Math.min(1, Math.max(0.5, value));
  };

  const setFirstPageTableFontPt = (pt: number) => {
    setFirstPageTableFontSizeRem(clampFirstPageTableFontRem(pt / 10));
  };

  const adjustFirstPageTableFontPt = (deltaPt: number) => {
    setFirstPageTableFontSizeRem((prev) =>
      clampFirstPageTableFontRem(prev + deltaPt / 10)
    );
  };

  const adjustRolesPageGapPt = (deltaPt: number) => {
    setRolesPageGapPt((prev) => Math.max(-4, Math.min(12, prev + deltaPt)));
  };

  const adjustFirstPageGapPt = (deltaPt: number) => {
    setFirstPageGapPt((prev) => Math.max(-4, Math.min(12, prev + deltaPt)));
  };

  const firstPageGap = (baseRem: number) => `calc(${baseRem}rem + ${firstPageGapPt}pt)`;
  const rolesPageGap = (baseRem: number) => `calc(${baseRem}rem + ${rolesPageGapPt}pt)`;
  const fieldListScrollRef = useRef<HTMLDivElement>(null);
  const inputFormScrollRef = useRef<HTMLDivElement>(null);
  const inputScrollRafRef = useRef<number | null>(null);
  const sectionHighlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoScrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialFieldConfigLoad = useRef(true);
  
  // Role editor dialog state
  const [roleEditorDialogVisible, setRoleEditorDialogVisible] = useState(false);
  const [editingRoleIndex, setEditingRoleIndex] = useState<number | null>(null);
  const [editingRoleContent, setEditingRoleContent] = useState("");

  const SECTION_FIELD_IDS: Record<string, string[]> = {
    basic: ["candidateName", "passportNumber", "position", "workLocation", "reportingDate"],
    compensation: ["salary", "allowance", "grossSalary"],
    benefits: ["accomodation", "food", "transport", "communication", "insurance", "airPassage", "sectorOfTravel", "classOfTravel"],
    terms: [
      "attendance",
      "probation",
      "contractPeriod",
      "noticePeriod",
    ],
    additionalTerms: [
      "annualLeave",
      "gratuity",
      "leaveEncashment",
      "visaStatus",
      "medicalTerms",
      "incrementTerms",
      "workingHours",
      "medical",
    ],
  };

  // Add this after other useEffect hooks
  useEffect(() => {
    fetchPresets();
  }, []);

  // Add this new useEffect to track changes
  useEffect(() => {
    if (selectedPreset && originalPresetData) {
      const hasFormChanges =
        JSON.stringify(formData) !== JSON.stringify(originalPresetData);
      setHasChanges(hasFormChanges);
    } else {
      setHasChanges(false);
    }
  }, [formData, selectedPreset, originalPresetData]);

  // Auto-save field visibility state whenever fieldConfig changes
  useEffect(() => {
    // Skip on initial load
    if (isInitialFieldConfigLoad.current) {
      isInitialFieldConfigLoad.current = false;
      return;
    }

    // Only auto-save if we're editing an existing letter
    if (!loadedLetterId || !canEditOfferLetters) {
      return;
    }

    const autoSaveFieldConfig = async () => {
      try {
        const { error } = await supabase.rpc("merge_offer_letter_data", {
          p_id: loadedLetterId,
          p_patch: { fieldConfig },
        });
        if (error) throw error;
        console.log("Field visibility state saved automatically");
      } catch (error) {
        console.error("Error auto-saving field config:", error);
      }
    };

    autoSaveFieldConfig();
  }, [fieldConfig, loadedLetterId, canEditOfferLetters]);

  const fetchPresets = async () => {
    try {
      setPresetsLoading(true);
      const { data, error } = await supabase
        .from("offer_letter_presets")
        .select("id, name, data, field_config, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setPresets(
        (data ?? []).map((preset) => ({
          id: preset.id,
          name: preset.name,
          data: preset.data as FormData,
          fieldConfig: preset.field_config as FieldConfig[] | undefined,
          created_at: preset.created_at,
        }))
      );
    } catch (err) {
      console.error("Failed to fetch offer letter presets:", err);
      message.error("Failed to fetch presets");
    } finally {
      setPresetsLoading(false);
    }
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      message.error("Please enter a preset name");
      return;
    }

    try {
      setLoading(true);
      // Create a copy of formData without the date field
      const { date, ...presetData } = formData;

      const { error } = await supabase.from("offer_letter_presets").insert({
        name: presetName.trim(),
        data: presetData,
        field_config: fieldConfig,
      });
      if (error) throw error;
      message.success("Preset saved successfully");
      setPresetDialogVisible(false);
      setPresetName("");
      await fetchPresets();
    } catch (err) {
      console.error("Failed to save offer letter preset:", err);
      message.error("Failed to save preset");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadPreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      // Merge the preset data with the current date
      setFormData({
        ...preset.data,
        date: formData.date, // Keep the current date
      });
      // Load field configuration if available
      setFieldConfig(
        getMergedFieldConfig(preset.fieldConfig, preset.data?.passportNumber)
      );
      isInitialFieldConfigLoad.current = true; // Reset flag for new preset
      setSelectedPreset(presetId);
      setOriginalPresetData(preset.data);
      setHasChanges(false);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from("offer_letter_presets")
        .delete()
        .eq("id", presetId);
      if (error) throw error;
      message.success("Preset deleted successfully");
      setSelectedPreset("");
      setOriginalPresetData(null);
      setHasChanges(false);
      await fetchPresets();
    } catch (err) {
      console.error("Failed to delete offer letter preset:", err);
      message.error("Failed to delete preset");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePreset = async () => {
    if (!selectedPreset || !hasChanges) return;

    try {
      setLoading(true);
      // Create a copy of formData without the date field
      const { date, ...presetData } = formData;

      const { error } = await supabase
        .from("offer_letter_presets")
        .update({ data: presetData, field_config: fieldConfig })
        .eq("id", selectedPreset);
      if (error) throw error;
      message.success("Preset updated successfully");
      setHasChanges(false);
      // Add the current date back to the preset data for state management
      setOriginalPresetData({ ...presetData, date: formData.date });
      await fetchPresets();
    } catch (err) {
      console.error("Failed to update offer letter preset:", err);
      message.error("Failed to update preset");
    } finally {
      setLoading(false);
    }
  };

  const sendBugReport = async () => {
    setLoading(true);
    await emailjs.send(serviceId, templateId, {
      name: userData?.email,
      subject:
        "Bug Report - " +
        moment().format("ll") +
        " from " +
        userData?.email,
      recipient: "goblinn688@gmail.com",
      message: issue,
    });
    setLoading(false);
    message.success("Bug Report sent");
    setBugDialog(false);
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (selectedPreset) {
      setHasChanges(true);
    }
  };

  const handleAddNoticePeriodSubsection = () => {
    setFormData((prev) => ({
      ...prev,
      noticePeriodSubsections: [...prev.noticePeriodSubsections, ""],
    }));
    if (selectedPreset) {
      setHasChanges(true);
    }
    // Scroll after a small delay to ensure the new input is rendered
    setTimeout(() => {
      lastSubsectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 100);
  };

  const handleRemoveNoticePeriodSubsection = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      noticePeriodSubsections: prev.noticePeriodSubsections.filter(
        (_, i) => i !== index
      ),
    }));
    if (selectedPreset) {
      setHasChanges(true);
    }
  };

  const handleNoticePeriodSubsectionChange = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      noticePeriodSubsections: prev.noticePeriodSubsections.map(
        (subsection, i) => (i === index ? value : subsection)
      ),
    }));
    if (selectedPreset) {
      setHasChanges(true);
    }
  };

  const handleAllowanceChange = (
    index: number,
    field: "title" | "description",
    value: string
  ) => {
    setFormData((prev) => {
      const newData = {
        ...prev,
        allowances: prev.allowances.map((role, i) =>
          i === index ? { ...role, [field]: value } : role
        ),
      };
      if (originalFormData) {
        const hasChanges =
          JSON.stringify(newData) !== JSON.stringify(originalFormData);
        setHasChanges(hasChanges);
      }
      return newData;
    });
  };

  const handleRoleChange = (
    index: number,
    field: "title" | "description",
    value: string
  ) => {
    setFormData((prev) => {
      const newData = {
        ...prev,
        roles: prev.roles.map((role, i) =>
          i === index ? { ...role, [field]: value } : role
        ),
      };
      if (originalFormData) {
        const hasChanges =
          JSON.stringify(newData) !== JSON.stringify(originalFormData);
        setHasChanges(hasChanges);
      }
      return newData;
    });
  };

  const handleAddAllowance = () => {
    setFormData((prev) => ({
      ...prev,
      allowances: [...prev.allowances, { title: "", description: "" }],
    }));
    // Scroll after a small delay to ensure the new input is rendered
    setTimeout(() => {
      lastAllowanceRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 100);
  };

  const handleRemoveAllowance = (index: number) => {
    setFormData((prev) => {
      const newData = {
        ...prev,
        allowances: prev.allowances.filter((_, i) => i !== index),
      };
      if (originalFormData) {
        const hasChanges =
          JSON.stringify(newData) !== JSON.stringify(originalFormData);
        setHasChanges(hasChanges);
      }
      return newData;
    });
  };

  const handleAddRole = () => {
    setFormData((prev) => ({
      ...prev,
      roles: [...prev.roles, { title: "", description: "" }],
    }));
    // Scroll after a small delay to ensure the new input is rendered
    setTimeout(() => {
      lastRoleRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 100);
  };

  const handleRemoveRole = (index: number) => {
    setFormData((prev) => {
      const newData = {
        ...prev,
        roles: prev.roles.filter((_, i) => i !== index),
      };
      if (originalFormData) {
        const hasChanges =
          JSON.stringify(newData) !== JSON.stringify(originalFormData);
        setHasChanges(hasChanges);
      }
      return newData;
    });
  };

  // Field configuration handlers
  const handleToggleField = (fieldId: string) => {
    setFieldConfig((prev) =>
      prev.map((field) =>
        field.id === fieldId ? { ...field, enabled: !field.enabled } : field
      )
    );
    setHasChanges(true);
  };

  const handleDragStart = (index: number) => {
    setDraggedFieldIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedFieldIndex === null || draggedFieldIndex === index) return;

    // Auto-scroll logic
    const container = fieldListScrollRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const scrollThreshold = 50; // pixels from edge to trigger scroll
      const scrollSpeed = 10;
      
      // Clear any existing interval
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }

      // Scroll up if near top
      if (e.clientY - rect.top < scrollThreshold && container.scrollTop > 0) {
        autoScrollIntervalRef.current = setInterval(() => {
          if (container.scrollTop > 0) {
            container.scrollTop -= scrollSpeed;
          } else {
            if (autoScrollIntervalRef.current) clearInterval(autoScrollIntervalRef.current);
          }
        }, 20);
      }
      // Scroll down if near bottom
      else if (rect.bottom - e.clientY < scrollThreshold && 
               container.scrollTop < container.scrollHeight - container.clientHeight) {
        autoScrollIntervalRef.current = setInterval(() => {
          if (container.scrollTop < container.scrollHeight - container.clientHeight) {
            container.scrollTop += scrollSpeed;
          } else {
            if (autoScrollIntervalRef.current) clearInterval(autoScrollIntervalRef.current);
          }
        }, 20);
      }
    }

    setFieldConfig((prev) => {
      const newConfig = [...prev];
      const draggedItem = newConfig[draggedFieldIndex];
      newConfig.splice(draggedFieldIndex, 1);
      newConfig.splice(index, 0, draggedItem);
      return newConfig;
    });
    setDraggedFieldIndex(index);
  };

  const handleDragEnd = () => {
    // Clear auto-scroll interval
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
    setDraggedFieldIndex(null);
    setHasChanges(true);
  };

  const handleAddCustomField = () => {
    if (!newFieldName.trim()) {
      message.error("Please enter a field name");
      return;
    }

    const fieldId = newFieldName.toLowerCase().replace(/\s+/g, "_");
    
    // Check if field already exists
    if (fieldConfig.some((f) => f.id === fieldId)) {
      message.error("A field with this name already exists");
      return;
    }

    const newField: FieldConfig = {
      id: fieldId,
      label: newFieldName,
      type: newFieldType,
      placeholder: `Enter ${newFieldName}`,
      rows: newFieldType === "textarea" ? 4 : undefined,
      enabled: true,
      isCustom: true,
      section: newFieldSection,
    };

    setFieldConfig((prev) => [...prev, newField]);
    setFormData((prev) => ({
      ...prev,
      customFields: { ...prev.customFields, [fieldId]: "" },
    }));

    setNewFieldName("");
    setNewFieldType("text");
    setNewFieldSection("table");
    message.success("Custom field added");
    setHasChanges(true);
  };

  const handleRemoveCustomField = (fieldId: string) => {
    setFieldConfig((prev) => prev.filter((f) => f.id !== fieldId));
    setFormData((prev) => {
      const { [fieldId]: removed, ...rest } = prev.customFields || {};
      return { ...prev, customFields: rest };
    });
    setHasChanges(true);
    message.success("Custom field removed");
  };

  const handleCustomFieldChange = (fieldId: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      customFields: { ...prev.customFields, [fieldId]: value },
    }));
    if (selectedPreset) {
      setHasChanges(true);
    }
  };

  const handleStartEditFieldLabel = (
    fieldId: string,
    currentLabel: string,
    currentType: FieldType
  ) => {
    setEditingFieldId(fieldId);
    setEditingFieldLabel(currentLabel);
    setEditingFieldType(currentType);
  };

  const handleSaveFieldLabel = () => {
    if (!editingFieldId || !editingFieldLabel.trim()) {
      setEditingFieldId(null);
      setEditingFieldLabel("");
      setEditingFieldType("text");
      return;
    }

    setFieldConfig((prev) =>
      prev.map((field) =>
        field.id === editingFieldId
          ? {
              ...field,
              label: editingFieldLabel.trim(),
              type: editingFieldType,
              rows: editingFieldType === "textarea" ? field.rows ?? 4 : undefined,
            }
          : field
      )
    );
    setEditingFieldId(null);
    setEditingFieldLabel("");
    setEditingFieldType("text");
  };

  const handleCancelEditFieldLabel = () => {
    setEditingFieldId(null);
    setEditingFieldLabel("");
    setEditingFieldType("text");
  };


  const fetchOfferLetters = async () => {
    // Immediately show cached letters if available
    if (offerLettersCache.length > 0) {
      setOfferLetters(offerLettersCache);
      // Set next reference number if form is empty
      if (!formData.refNo) {
        const nextRef = getNextReferenceNumber(offerLettersCache);
        setFormData(prev => ({...prev, refNo: nextRef}));
      }
    }

    setOfferLettersLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from("offer_letters")
        .select("id, data, generated_at, generated_by")
        .order("generated_at", { ascending: false });
      if (error) throw error;
      const data = (rows ?? []).map((row) => ({
        ...(row.data as Record<string, unknown>),
        id: row.id,
        generated_at: row.generated_at,
        generated_by: row.generated_by,
      }));
      
      // Set next reference number if form is empty
      if (!formData.refNo) {
        const nextRef = getNextReferenceNumber(
          data.map((letter: any) => ({ refNo: letter.refNo }))
        );
        setFormData(prev => ({...prev, refNo: nextRef}));
      }

      // Merge new letters with cached ones, avoiding duplicates
      const mergedLetters = [...data];
      offerLettersCache.forEach((cachedLetter) => {
        if (!mergedLetters.some((letter) => letter.id === cachedLetter.id)) {
          mergedLetters.push(cachedLetter);
        }
      });

      // Sort by generated_at
      // mergedLetters.sort((a, b) => {
      //   const dateA = a.generated_at?.toDate?.() || new Date(0);
      //   const dateB = b.generated_at?.toDate?.() || new Date(0);
      //   return dateB.getTime() - dateA.getTime();
      // });

      setOfferLetters(mergedLetters);
      setOfferLettersCache(mergedLetters);
    } catch (err) {
      console.error("Failed to fetch offer letters:", err);
      message.error("Failed to fetch offer letters");
    } finally {
      setOfferLettersLoading(false);
    }
  };

  const cleanData = (data: any) => {
    const cleaned: any = {};
    Object.keys(data).forEach(key => {
      if (data[key] !== undefined) {
        cleaned[key] = data[key];
      }
    });
    return cleaned;
  };

  const handleSave = async () => {
    if (!canEditOfferLetters) {
      message.error("Editing privileges are disabled for Offer Letters");
      return;
    }

    setSaving(true);
    try {
      // Validate required fields
      if (!formData.candidateName || !formData.position) {
        message.error(
          "Please fill in the required fields (Candidate Name and Position)"
        );
        setSaving(false);
        return;
      }

      // Get a fresh reference number for the new letter
      const nextRef = getNextReferenceNumber(offerLetters);
      
      const generatedAt = new Date().toISOString();
      const newLetter = cleanData({
        ...formData,
        refNo: nextRef,  // Use the new reference number
        fieldConfig: fieldConfig,
        air_passage: air_passage,
        comm: comm,
        visaS: visaS,
        joiningDate: joiningDate,
        generated_at: generatedAt,
        generated_by: userData?.email || null,
      });

      console.log("Attempting to save letter:", newLetter);

      // Always create a new document, regardless of loadedLetterId
      const { error, data: savedRow } = await supabase
        .from("offer_letters")
        .insert({
          data: newLetter,
          generated_at: generatedAt,
          generated_by: userData?.email || null,
        })
        .select("id, data, generated_at, generated_by")
        .single();
      if (error) throw error;
      const savedLetter = {
        ...(savedRow.data as Record<string, unknown>),
        id: savedRow.id,
        generated_at: savedRow.generated_at,
        generated_by: savedRow.generated_by,
      };

      // Update cache with new letter
      const updatedCache = [savedLetter, ...offerLettersCache];
      setOfferLettersCache(updatedCache);
      setOfferLetters(updatedCache);

      message.success(`Offer letter saved successfully with reference number: ${nextRef}`);

      // Reset form state after saving
      setLoadedLetterId(savedRow.id);
      setHasChanges(false);
      setOriginalFormData(null);
    } catch (error) {
      console.error("Error saving offer letter:", error);
      message.error(
        error instanceof Error ? error.message : "Failed to save offer letter"
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePrintPDF = async () => {
    setPdfLoading(true);
    setPdfProgress(0);

    // Off-screen container that is always at full 800 px width with no
    // parent CSS transform. We clone each page node into here so that
    // html2canvas captures at desktop resolution regardless of the
    // mobile previewScale applied to the visible preview container.
    const offscreen = document.createElement("div");
    offscreen.style.cssText =
      `position:fixed;top:0;left:-${PREVIEW_BASE_WIDTH + 100}px;` +
      `width:${PREVIEW_BASE_WIDTH}px;opacity:0;pointer-events:none;z-index:-9999;overflow:visible;`;
    document.body.appendChild(offscreen);

    try {
      const tableNode = tableRef.current;
      const rolesNode = rolesRef.current;
      const restNode = restRef.current;
      const signatureNode = signatureRef.current;
      if (!tableNode || !restNode || !signatureNode) {
        message.error("Failed to generate PDF: missing sections");
        return;
      }

      // Clone a node into the off-screen container, stripping any
      // inherited transform so html2canvas sees natural layout dimensions.
      const prepareClone = (node: HTMLElement) => {
        const clone = node.cloneNode(true) as HTMLElement;
        clone.style.transform = "none";
        clone.style.position = "relative";
        clone.style.width = `${PREVIEW_BASE_WIDTH}px`;
        offscreen.appendChild(clone);
        return clone;
      };

      const tableClone     = prepareClone(tableNode);
      const rolesClone     = rolesNode     ? prepareClone(rolesNode)     : null;
      const restClone      = prepareClone(restNode);
      const signatureClone = prepareClone(signatureNode);

      const html2canvasOptions = {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: null,
        windowWidth: PREVIEW_BASE_WIDTH,
      };

      const toJpeg = (canvas: HTMLCanvasElement) =>
        canvas.toDataURL("image/jpeg", 0.5);

      // Page 1 — terms table
      setPdfProgress(20);
      const tableImgData = toJpeg(await html2canvas(tableClone, html2canvasOptions));
      const pdf = new jsPDF({ unit: "px", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const tableProps = pdf.getImageProperties(tableImgData);
      pdf.addImage(tableImgData, "JPEG", 0, 0, pageWidth,
        (tableProps.height * pageWidth) / tableProps.width, undefined, "FAST");
      setPdfProgress(40);

      // Page 2 — roles (optional)
      if (rolesClone) {
        const rolesImgData = toJpeg(await html2canvas(rolesClone, html2canvasOptions));
        pdf.addPage();
        const rolesProps = pdf.getImageProperties(rolesImgData);
        pdf.addImage(rolesImgData, "JPEG", 0, 0, pageWidth,
          (rolesProps.height * pageWidth) / rolesProps.width, undefined, "FAST");
      }
      setPdfProgress(60);

      // Page 3 — clauses / rest
      const restImgData = toJpeg(await html2canvas(restClone, html2canvasOptions));
      pdf.addPage();
      const restProps = pdf.getImageProperties(restImgData);
      pdf.addImage(restImgData, "JPEG", 0, 0, pageWidth,
        (restProps.height * pageWidth) / restProps.width, undefined, "FAST");
      setPdfProgress(80);

      // Page 4 — signatures
      const signatureImgData = toJpeg(await html2canvas(signatureClone, html2canvasOptions));
      pdf.addPage();
      const signatureProps = pdf.getImageProperties(signatureImgData);
      pdf.addImage(signatureImgData, "JPEG", 0, 0, pageWidth,
        (signatureProps.height * pageWidth) / signatureProps.width, undefined, "FAST");
      setPdfProgress(90);

      pdf.save(`Offer_Letter_${formData.candidateName || "Candidate"}.pdf`);
      setPdfProgress(100);
    } catch (err) {
      message.error("Failed to generate PDF");
    } finally {
      document.body.removeChild(offscreen);
      setPdfLoading(false);
      setTimeout(() => setPdfProgress(0), 500);
    }
  };

  const handleEditLetter = async () => {
    if (!canEditOfferLetters) {
      message.error("Editing privileges are disabled for Offer Letters");
      return;
    }

    if (!editingLetter?.id) return;
    setSaving(true);
    try {
      const { id, ...letterData } = editingLetter;
      delete letterData.generated_at;
      const updatedAt = new Date().toISOString();
      const { error } = await supabase
        .from("offer_letters")
        .update({
          data: cleanData({ ...letterData, updated_at: updatedAt }),
          updated_at: updatedAt,
        })
        .eq("id", id);
      if (error) throw error;
      message.success("Offer letter updated");
      setEditDialogVisible(false);
      await fetchOfferLetters();
    } catch (err) {
      console.error("Failed to update offer letter:", err);
      message.error("Failed to update offer letter");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLetter = async (id: string) => {
    if (!canEditOfferLetters) {
      message.error("Editing privileges are disabled for Offer Letters");
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase.from("offer_letters").delete().eq("id", id);
      if (error) throw error;

      // Update cache by removing deleted letter
      const updatedCache = offerLettersCache.filter(
        (letter) => letter.id !== id
      );
      setOfferLettersCache(updatedCache);
      setOfferLetters(updatedCache);

      message.success("Offer letter deleted");
    } catch (err) {
      console.error("Failed to delete offer letter:", err);
      message.error("Failed to delete offer letter");
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!canEditOfferLetters) {
      message.error("Editing privileges are disabled for Offer Letters");
      return;
    }

    if (!loadedLetterId) return;

    try {
      setSaving(true);
      // Create a copy of formData without the date field for the preset
      const { date, ...presetData } = formData;
      const generatedAt = new Date().toISOString();
      const { error } = await supabase.rpc("merge_offer_letter_data", {
        p_id: loadedLetterId,
        p_patch: cleanData({
        ...presetData,
        fieldConfig: fieldConfig,
        air_passage: air_passage,
        comm: comm,
        visaS: visaS,
        joiningDate: joiningDate,
        generated_at: generatedAt,
        generated_by: userData?.email || null,
        }),
      });
      if (error) throw error;

      // Update the original form data to match the new state
      setOriginalFormData({
        ...formData,
        air_passage: air_passage,
        comm: comm,
        visaS: visaS,
        joiningDate: joiningDate,
      });

      setHasChanges(false);
      message.success("Offer letter updated successfully");

      // Refresh the offer letters list
      fetchOfferLetters();
    } catch (error) {
      console.error("Error updating offer letter:", error);
      message.error("Failed to update offer letter");
    } finally {
      setSaving(false);
    }
  };

  const handleLetterClick = (ol: any) => {
    setFormData({
      date: ol.date,
      refNo: ol.refNo,
      candidateName: ol.candidateName,
      passportNumber: ol.passportNumber,
      position: ol.position,
      workLocation: ol.workLocation,
      salary: ol.salary,
      allowance: ol.allowance,
      grossSalary: ol.grossSalary,
      attendance: ol.attendance,
      probation: ol.probation,
      reportingDate: ol.reportingDate,
      contractPeriod: ol.contractPeriod,
      noticePeriod: ol.noticePeriod,
      noticePeriodSubsections: ol.noticePeriodSubsections,
      accomodation: ol.accomodation,
      food: ol.food,
      transport: ol.transport,
      visaStatus: ol.visaStatus,
      communication: ol.communication,
      medical: ol.medical,
      insurance: ol.insurance,
      annualLeave: ol.annualLeave,
      gratuity: ol.gratuity,
      leaveEncashment: ol.leaveEncashment,
      workingHours: ol.workingHours,
      airPassage: ol.airPassage,
      sectorOfTravel: ol.sectorOfTravel || "",
      classOfTravel: ol.classOfTravel || "",
      medicalTerms: ol.medicalTerms || "",
      incrementTerms: ol.incrementTerms || "",
      roles: ol.roles,
      allowances: ol.allowances,
    });
    setAirPassage(ol.air_passage);
    setComm(ol.comm);
    setVisaS(ol.visaS);
    setJoiningDate(ol.joiningDate);
    setFieldConfig(getMergedFieldConfig(ol.fieldConfig, ol.passportNumber));
    isInitialFieldConfigLoad.current = true; // Reset flag so next changes will be auto-saved
    setOriginalFormData(ol);
    setLoadedLetterId(ol.id);
    // Reset preset related states
    setSelectedPreset("");
    setOriginalPresetData(null);
    setHasChanges(false);
    setOfferLettersDrawerVisible(false);
  };

  const handleClearForm = () => {
    const currentDate = new Date().toLocaleDateString();
    // Get the next reference number
    const nextRef = getNextReferenceNumber(offerLetters);
    setFormData({
      date: currentDate,
      refNo: nextRef,
      candidateName: "",
      passportNumber: "",
      position: "",
      workLocation: "",
      salary: "",
      allowance: "",
      grossSalary: "",
      attendance: "",
      probation: "",
      reportingDate: "",
      contractPeriod: "",
      noticePeriod: "",
      noticePeriodSubsections: [""],
      accomodation: "",
      food: "",
      transport: "",
      visaStatus: "",
      communication: "",
      medical: "",
      insurance: "",
      annualLeave: "",
      gratuity: "",
      leaveEncashment: "",
      workingHours: "",
      airPassage: "",
      sectorOfTravel: "",
      classOfTravel: "",
      medicalTerms: "",
      incrementTerms: "",
      roles: [{ title: "", description: "" }],
      allowances: [{ title: "", description: "" }],
      customFields: {},
    });
    setSelectedPreset("");
    setOriginalPresetData(null);
    setHasChanges(false);
    setLoadedLetterId(null);
    setOriginalFormData(null);
    setFieldConfig(defaultFieldConfig);
    isInitialFieldConfigLoad.current = true; // Reset flag for new letter
  };

  const normalizePreviewFieldId = (fieldId?: string) => {
    if (!fieldId) return "";
    if (fieldId === "allowance-main") return "allowance";
    if (fieldId === "noticePeriod-main") return "noticePeriod";
    return fieldId;
  };

  const getFirstEnabledFieldIdForSection = (sectionKey: string) => {
    const candidateIds = SECTION_FIELD_IDS[sectionKey] || [];
    const firstEnabled = candidateIds.find((id) => fieldConfig.some((f) => f.enabled && f.id === id));
    return firstEnabled || null;
  };

  // Scroll to and highlight section/field
  const scrollToSection = (sectionKey: string, preferredFieldId?: string) => {
    const sectionRefs: { [key: string]: React.RefObject<HTMLDivElement> } = {
      basic: basicSectionRef,
      compensation: compensationSectionRef,
      benefits: benefitsSectionRef,
      terms: termsSectionRef,
      additionalTerms: additionalTermsSectionRef,
      roles: rolesSectionRef,
      custom: customSectionRef,
    };

    const sectionRef = sectionRefs[sectionKey];
    const sectionElement = sectionRef?.current;
    if (sectionElement) {
      const normalizedPreferredFieldId = normalizePreviewFieldId(preferredFieldId);
      const targetFieldId =
        normalizedPreferredFieldId && fieldConfig.some((f) => f.enabled && f.id === normalizedPreferredFieldId)
          ? normalizedPreferredFieldId
          : getFirstEnabledFieldIdForSection(sectionKey);

      const doScrollAndHighlight = () => {
        const container = inputFormScrollRef.current;
        if (container) {
          const targetFieldElement = targetFieldId
            ? (container.querySelector(`[data-input-field-id="${targetFieldId}"]`) as HTMLDivElement | null)
            : null;

          const targetElement = targetFieldElement || sectionElement;
          const targetRect = targetElement.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const topOffset = 12;
          const nextTop =
            container.scrollTop + (targetRect.top - containerRect.top) - topOffset;

          container.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });

          const focusable = targetFieldElement?.querySelector("input, textarea") as
            | HTMLInputElement
            | HTMLTextAreaElement
            | null;
          if (focusable) {
            focusable.focus({ preventScroll: true });
          }
        } else {
          sectionElement.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        setHighlightedFieldId(targetFieldId || null);
        if (sectionHighlightTimeoutRef.current) {
          clearTimeout(sectionHighlightTimeoutRef.current);
        }
        sectionHighlightTimeoutRef.current = setTimeout(() => {
          setHighlightedFieldId(null);
        }, 1200);
      };

      // Expand section if collapsed
      if (sectionsCollapsed[sectionKey]) {
        setSectionsCollapsed(prev => ({ ...prev, [sectionKey]: false }));
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(doScrollAndHighlight);
        });
      } else {
        doScrollAndHighlight();
      }
    }
  };

  // Render section header with collapse functionality
  const renderSectionHeader = (
    sectionKey: string,
    title: string,
    icon: React.ReactNode,
    subtitle?: string
  ) => {
    const isCollapsed = sectionsCollapsed[sectionKey];
    return (
      <div
        onClick={() => setSectionsCollapsed(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }))}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.8rem 1rem",
          // background: "rgba(15 23 42/ 4%)",
          border: "1px solid rgba(15 23 42/ 12%)",
          borderRadius: "0.7rem",
          cursor: "pointer",
          marginTop: "1rem",
          marginBottom: "0.75rem",

          // boxShadow: "0 1px 2px rgba(2 6 23/ 6%)",
          // transition: "all 0.2s ease",
        }}
        
        
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ color: "darkblue", display: "flex", alignItems: "center" }}>
            {icon}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "black" }}>
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: "0.7rem", color: "rgba(0 0 0/ 50%)", marginTop: "0.15rem" }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
        <div style={{ color: "darkblue", display: "flex", alignItems: "center" }}>
          {isCollapsed ? <ChevronRight width="1.2rem" /> : <ChevronDown width="1.2rem" />}
        </div>
      </div>
    );
  };

  // Render a single field based on its configuration
  const renderField = (field: FieldConfig) => {
    if (!field.enabled) return null;

    const value = field.isCustom 
      ? (formData.customFields?.[field.id] || "")
      : (formData[field.id as keyof FormData] as string || "");

    const onChange = field.isCustom
      ? (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          handleCustomFieldChange(field.id, e.target.value)
      : handleInputChange;

    const handleFocusStyle = (
      e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
      e.currentTarget.style.borderColor = "rgba(0 0 139/ 55%)";
      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0 0 139/ 15%)";
      e.currentTarget.style.background = "rgba(255 255 255/ 100%)";
    };

    const handleBlurStyle = (
      e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
      e.currentTarget.style.borderColor = "rgba(15 23 42/ 18%)";
      e.currentTarget.style.boxShadow = "0 1px 2px rgba(15 23 42/ 6%)";
      e.currentTarget.style.background = "rgba(255 255 255/ 96%)";
    };

    return (
      <div
        key={field.id}
        data-input-field-id={field.id}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.45rem",
          padding: "0.65rem",
          borderRadius: "0.7rem",
          border: "1px solid rgba(100 116 139/ 20%)",
          background: "rgba(255 255 255/ 82%)",
          boxShadow: "0 1px 2px rgba(15 23 42/ 4%)",
          outline: "none",
          animation: highlightedFieldId === field.id ? "fieldFocusPulse 1s ease" : "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label
            style={{
              fontSize: "0.85rem",
              fontWeight: 500,
              color: "rgba(0 0 0/ 85%)",
              letterSpacing: "0.01em",
            }}
          >
            {field.label}
          </label>
          {field.isCustom && (
            <button
              onClick={() => handleRemoveCustomField(field.id)}
              style={{
                background: "none",
                border: "none",
                color: "indianred",
                cursor: "pointer",
                padding: "0",
                fontSize: "0.7rem",
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
            >
              <MinusCircle width="0.8rem" />
              Remove
            </button>
          )}
        </div>
        {field.type === "textarea" ? (
          <textarea
            name={field.id}
            value={value}
            onChange={onChange}
            onFocus={handleFocusStyle}
            onBlur={handleBlurStyle}
            placeholder={field.placeholder}
            rows={field.rows || 4}
            style={inputStyle}
          />
        ) : (
          <input
            type={field.type}
            name={field.id}
            value={value}
            onChange={onChange}
            onFocus={handleFocusStyle}
            onBlur={handleBlurStyle}
            placeholder={field.placeholder}
            style={inputStyle}
          />
        )}
      </div>
    );
  };

  const renderFieldConfigItem = (field: FieldConfig, index: number) => (
    <motion.div
      key={field.id}
      draggable
      onDragStart={() => handleDragStart(index)}
      onDragOver={(e) => handleDragOver(e, index)}
      onDragEnd={handleDragEnd}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.4rem",
        padding: "0.5rem 0.6rem",
        background: draggedFieldIndex === index
          ? "rgba(0 0 139/ 10%)"
          : field.enabled
          ? "rgba(255 255 255/ 90%)"
          : "rgba(15 23 42/ 3%)",
        borderRadius: "0.5rem",
        border: `1px solid ${
          draggedFieldIndex === index
            ? "rgba(0 0 139/ 30%)"
            : field.enabled
            ? "rgba(15 23 42/ 12%)"
            : "rgba(15 23 42/ 8%)"
        }`,
        opacity: draggedFieldIndex === index ? 0.6 : field.enabled ? 1 : 0.6,
        cursor: "grab",
        transition: "all 0.2s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
        <div
          style={{
            cursor: "grab",
            display: "flex",
            alignItems: "center",
            color: "rgba(0 0 139/ 55%)",
            flexShrink: 0,
          }}
          title="Drag to reorder"
        >
          <GripVertical width="0.85rem" />
        </div>

        <button
          onClick={() => handleToggleField(field.id)}
          title={field.enabled ? "Hide this field" : "Show this field"}
          style={{
            width: "2.35rem",
            height: "2.35rem",
            borderRadius: "0.7rem",
            border: "1px solid rgba(15 23 42/ 14%)",
            background: field.enabled ? "rgba(0 0 139/ 8%)" : "rgba(15 23 42/ 4%)",
            color: field.enabled ? "darkblue" : "rgba(15 23 42/ 55%)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginRight: "0.35rem",
          }}
        >
          {field.enabled ? <Eye width="1.35rem" /> : <EyeOff width="1.35rem" />}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          {editingFieldId === field.id ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <input
                type="text"
                value={editingFieldLabel}
                onChange={(e) => setEditingFieldLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveFieldLabel();
                  if (e.key === "Escape") handleCancelEditFieldLabel();
                }}
                autoFocus
                style={{
                  flex: 1,
                  minWidth: "100px",
                  padding: "0.3rem 0.5rem",
                  borderRadius: "0.4rem",
                  border: "1px solid rgba(0 0 139/ 40%)",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                }}
              />
              <select
                value={editingFieldType}
                onChange={(e) => setEditingFieldType(e.target.value as FieldType)}
                style={{
                  width: "6.25rem",
                  padding: "0.3rem 0.35rem",
                  borderRadius: "0.4rem",
                  border: "1px solid rgba(0 0 139/ 28%)",
                  fontSize: "0.72rem",
                  background: "rgba(255 255 255/ 96%)",
                  color: "rgba(15 23 42/ 90%)",
                }}
                title="Field type"
              >
                <option value="text">text</option>
                <option value="textarea">textarea</option>
                <option value="number">number</option>
                <option value="date">date</option>
              </select>
              <button
                onClick={handleSaveFieldLabel}
                style={{
                  background: "rgba(16 185 129/ 12%)",
                  // border: "1px solid rgba(16 185 129/ 35%)",
                  color: "#047857",
                  cursor: "pointer",
                  padding: "0.22rem",
                  borderRadius: "0.35rem",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                  width: "2rem",
                }}
                title="Save"
              >
                <Check width="0.75rem" />
              </button>
              <button
                onClick={handleCancelEditFieldLabel}
                style={{
                  background: "rgba(239 68 68/ 10%)",
                  // border: "1px solid rgba(239 68 68/ 35%)",
                  color: "#b91c1c",
                  cursor: "pointer",
                  padding: "0.22rem",
                  borderRadius: "0.35rem",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                  width: "2rem",
                }}
                title="Cancel"
              >
                <X width="0.75rem" />
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", overflow: "hidden" }}>
                <div style={{ fontWeight: 500, fontSize: "0.82rem", color: "rgba(15 23 42/ 92%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {field.label}
                </div>
                {field.isCustom && (
                  <span
                    style={{
                      fontSize: "0.6rem",
                      color: "darkblue",
                      background: "rgba(0 0 139/ 8%)",
                      border: "1px solid rgba(0 0 139/ 20%)",
                      padding: "0.08rem 0.3rem",
                      borderRadius: "999px",
                      flexShrink: 0,
                    }}
                  >
                    Custom
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: "0.65rem",
                  color: "rgba(15 23 42/ 55%)",
                  marginTop: "0.1rem",
                }}
              >
                {field.type}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexShrink: 0 }}>
        {editingFieldId !== field.id && !field.isCustom && (
          <button
            onClick={() => handleStartEditFieldLabel(field.id, field.label, field.type)}
            style={{
              background: "rgba(15 23 42/ 4%)",
              border: "1px solid rgba(15 23 42/ 12%)",
              color: "rgba(15 23 42/ 75%)",
              cursor: "pointer",
              width: "2.05rem",
              height: "2.05rem",
              borderRadius: "0.68rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
            title="Edit field"
          >
            <Pencil width="1.1rem" />
          </button>
        )}
        {field.isCustom && (
          <button
            onClick={() => handleRemoveCustomField(field.id)}
            style={{
              background: "rgba(220 38 38/ 8%)",
              border: "1px solid rgba(220 38 38/ 20%)",
              color: "#b91c1c",
              cursor: "pointer",
              padding: "0.22rem 0.35rem",
              borderRadius: "0.35rem",
              fontSize: "0.65rem",
              display: "flex",
              alignItems: "center",
              gap: "0.15rem",
              flexShrink: 0,
            }}
          >
            <Trash2 width="0.65rem" />
          </button>
        )}
      </div>
    </motion.div>
  );

  const renderFieldConfigSection = (
    section: "table" | "paragraph",
    title: string,
    icon: React.ReactNode
  ) => {
    const sectionFields = fieldConfig.filter((f) => f.section === section);
    const activeCount = sectionFields.filter((f) => f.enabled).length;
    const isCollapsed = fieldConfigSectionsCollapsed[section];

    return (
      <div
        style={{
          border: "1px solid rgba(15 23 42/ 10%)",
          borderRadius: "0.75rem",
          background: "rgba(255 255 255/ 88%)",
          padding: "0.75rem",
        }}
      >
        <button
          onClick={() =>
            setFieldConfigSectionsCollapsed((prev) => ({
              ...prev,
              [section]: !prev[section],
            }))
          }
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: isCollapsed ? 0 : "0.75rem",
            paddingBottom: "0.5rem",
            borderBottom: "1px solid rgba(15 23 42/ 10%)",
            width: "100%",
            background: "transparent",
            borderLeft: "none",
            borderRight: "none",
            borderTop: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {icon}
          <h4 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0, color: "rgba(15 23 42/ 85%)" }}>
            {title}
          </h4>
          <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "rgba(15 23 42/ 55%)" }}>
            {activeCount}/{sectionFields.length} active
          </span>
          <span style={{ display: "flex", alignItems: "center", color: "rgba(15 23 42/ 60%)" }}>
            {isCollapsed ? <ChevronRight width="0.95rem" /> : <ChevronDown width="0.95rem" />}
          </span>
        </button>

        {!isCollapsed && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {sectionFields.map((field) => renderFieldConfigItem(field, fieldConfig.indexOf(field)))}
          </div>
        )}
      </div>
    );
  };

  const handleFieldConfigDialogChange = (open: boolean) => {
    setFieldConfigDialogVisible(open);
  };

  useEffect(() => {
    return () => {
      if (inputScrollRafRef.current !== null) {
        cancelAnimationFrame(inputScrollRafRef.current);
      }
      if (sectionHighlightTimeoutRef.current) {
        clearTimeout(sectionHighlightTimeoutRef.current);
      }
    };
  }, []);

  const getSectionForFieldId = (fieldId: string) => {
    const normalizedId =
      fieldId === "allowance-main"
        ? "allowance"
        : fieldId === "noticePeriod-main"
        ? "noticePeriod"
        : fieldId;

    if (["candidateName", "passportNumber", "position", "workLocation", "reportingDate"].includes(normalizedId)) {
      return "basic";
    }

    if (["salary", "allowance", "grossSalary"].includes(normalizedId)) {
      return "compensation";
    }

    if (["accomodation", "food", "transport", "communication", "insurance", "airPassage", "sectorOfTravel", "classOfTravel"].includes(normalizedId)) {
      return "benefits";
    }

    if (["attendance", "probation", "contractPeriod", "noticePeriod"].includes(normalizedId)) {
      return "terms";
    }

    if (["annualLeave", "gratuity", "leaveEncashment", "visaStatus", "medicalTerms", "incrementTerms", "workingHours", "medical"].includes(normalizedId)) {
      return "additionalTerms";
    }

    return "custom";
  };

  const handleInputSectionScroll = () => {
    if (inputScrollRafRef.current !== null) return;

    const container = inputFormScrollRef.current;
    if (!container) return;

    inputScrollRafRef.current = window.requestAnimationFrame(() => {
      const scrollTop = container.scrollTop;

      // Hysteresis avoids rapid toggle flicker while users are near the boundary.
      setHeaderVisible((prev) => {
        if (prev && scrollTop > 52) return false;
        if (!prev && scrollTop < 6) return true;
        return prev;
      });
      setShowInputScrollTopButton(scrollTop > 180);
      inputScrollRafRef.current = null;
    });
  };

  const handleInputScrollToTop = () => {
    const container = inputFormScrollRef.current;
    if (!container) return;
    container.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePreviewTableClick = (event: React.MouseEvent<HTMLTableSectionElement>) => {
    const target = event.target as HTMLElement;
    const row = target.closest("tr[data-field-id]") as HTMLTableRowElement | null;
    if (!row) return;

    const fieldId = row.dataset.fieldId;
    if (!fieldId) return;

    scrollToSection(getSectionForFieldId(fieldId), fieldId);
  };

  const handlePreviewRolesClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const roleDiv = target.closest("[data-preview-role-index]") as HTMLElement | null;
    if (!roleDiv) return;

    const indexStr = roleDiv.dataset.previewRoleIndex;
    if (indexStr === undefined) return;
    const index = parseInt(indexStr, 10);

    // Expand the roles section if collapsed
    const doScroll = () => {
      const container = inputFormScrollRef.current;
      if (!container) return;
      const roleEl = container.querySelector(`[data-role-index="${index}"]`) as HTMLElement | null;
      if (!roleEl) return;
      const containerRect = container.getBoundingClientRect();
      const roleRect = roleEl.getBoundingClientRect();
      container.scrollTo({ top: container.scrollTop + (roleRect.top - containerRect.top) - 12, behavior: "smooth" });
      const input = roleEl.querySelector("input") as HTMLInputElement | null;
      if (input) input.focus({ preventScroll: true });
      setHighlightedFieldId(`role-${index}`);
      if (sectionHighlightTimeoutRef.current) clearTimeout(sectionHighlightTimeoutRef.current);
      sectionHighlightTimeoutRef.current = setTimeout(() => setHighlightedFieldId(null), 1200);
    };

    if (sectionsCollapsed.roles) {
      setSectionsCollapsed(prev => ({ ...prev, roles: false }));
      window.requestAnimationFrame(() => window.requestAnimationFrame(doScroll));
    } else {
      doScroll();
    }
  };

  const handleDismissPreviewJumpTip = () => {
    setShowPreviewJumpTip(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PREVIEW_JUMP_TIP_DISMISSED_KEY, "1");
    }
  };

  const getSortedFieldsForSection = (sectionFieldIds: string[]) => {
    const sectionFieldIdSet = new Set(sectionFieldIds);

    return fieldConfig
      .filter((field) => field.enabled && sectionFieldIdSet.has(field.id))
      .sort((a, b) => {
        const aOrder = PREVIEW_FIELD_ORDER_INDEX.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = PREVIEW_FIELD_ORDER_INDEX.get(b.id) ?? Number.MAX_SAFE_INTEGER;

        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }

        return fieldConfig.findIndex((field) => field.id === a.id) - fieldConfig.findIndex((field) => field.id === b.id);
      });
  };

  const renderFirstPageSpacingControl = () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        
        padding: "0.5rem 0.75rem",
        background: "rgba(100 100 100/ 5%)",
        borderTopLeftRadius: "0.75rem",
        borderTopRightRadius: "0.75rem",
        minHeight: "3.25rem",
      }}
    >
      {/* Font Size */}
      <TextCursor width="1rem" color="darkblue" style={{ flexShrink: 0 }} />
      <span style={{ fontSize: "0.82rem", fontWeight: "500", color: "rgba(0 0 0 / 70%)", whiteSpace: "nowrap" }}>
        Font Size
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
        <button
          type="button"
          onClick={() => adjustFirstPageTableFontPt(-0.5)}
          style={{ width: "2rem", height: "2rem", borderRadius: "0.5rem", background: "rgba(100 100 100/ 8%)", color: "rgba(0 0 0/ 72%)", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}
          title="Decrease by 0.5 pt"
        >-</button>
        <input
          type="number" min={5} max={10} step={0.1}
          value={(firstPageTableFontSizeRem * 10).toFixed(1)}
          onChange={(e) => setFirstPageTableFontPt(Number(e.target.value))}
          style={{ width: "4rem", height: "2rem", borderRadius: "0.5rem", padding: "0 0.45rem", fontSize: "0.8rem", background: "rgba(255 255 255/ 92%)", color: "rgba(0 0 0/ 80%)", textAlign: "center" }}
        />
        <button
          type="button"
          onClick={() => adjustFirstPageTableFontPt(0.5)}
          style={{ width: "2rem", height: "2rem", borderRadius: "0.5rem", background: "rgba(100 100 100/ 8%)", color: "rgba(0 0 0/ 72%)", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}
          title="Increase by 0.5 pt"
        >+</button>
      </div>

      <div style={{ width: "1px", height: "1.5rem", background: "rgba(0 0 0/ 12%)", flexShrink: 0 }} />

      {/* Line Spacing */}
      <MoveVertical width="1rem" color="darkblue" />
      <span style={{ fontSize: "0.82rem", fontWeight: "500", color: "rgba(0 0 0 / 70%)", whiteSpace: "nowrap" }}>
        Line Spacing
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
        <button
          type="button"
          onClick={() => adjustFirstPageGapPt(-1)}
          style={{ width: "2rem", height: "2rem", borderRadius: "0.5rem", background: "rgba(100 100 100/ 8%)", color: "rgba(0 0 0/ 72%)", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}
          title="Decrease by 1 pt"
        >-</button>
        <input
          type="number" min={-4} max={12} step={0.5}
          value={firstPageGapPt.toFixed(1)}
          onChange={(e) => setFirstPageGapPt(Math.max(-4, Math.min(12, Number(e.target.value))))}
          style={{ width: "4rem", height: "2rem", borderRadius: "0.5rem", padding: "0 0.45rem", fontSize: "0.8rem", background: "rgba(255 255 255/ 92%)", color: "rgba(0 0 0/ 80%)", textAlign: "center" }}
        />
        <button
          type="button"
          onClick={() => adjustFirstPageGapPt(1)}
          style={{ width: "2rem", height: "2rem", borderRadius: "0.5rem", background: "rgba(100 100 100/ 8%)", color: "rgba(0 0 0/ 72%)", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}
          title="Increase by 1 pt"
        >+</button>
      </div>

      {canEditOfferLetters && (
        <>
          <div style={{ width: "1px", height: "1.5rem", background: "rgba(0 0 0/ 12%)", flexShrink: 0, marginLeft: "auto" }} />
          <input
            className="preview-date-input"
            style={{ width: "fit-content", colorScheme: "light" }}
            type="date"
            name="date"
            value={formData.date}
            onChange={handleInputChange}
            placeholder="Enter Date"
          />
        </>
      )}
    </div>
  );

  const renderRolesSpacingControl = () => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        minHeight: "3.25rem",
        marginTop: "0.75rem",
        padding: "0.75rem",
        background: "rgba(100 100 100/ 5%)",
        borderTopLeftRadius: "0.75rem",
        borderTopRightRadius: "0.75rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
        <MoveVertical width="1rem" color="darkblue" />
        <span style={{ fontSize: "0.85rem", fontWeight: "500", color: "rgba(0 0 0 / 70%)" }}>
          Line Spacing
        </span>
       
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <button
          type="button"
          onClick={() => adjustRolesPageGapPt(-1)}
          style={{
            width: "2rem",
            height: "2rem",
            borderRadius: "0.5rem",
            background: "rgba(100 100 100/ 8%)",
            color: "rgba(0 0 0/ 72%)",
            cursor: "pointer",
            fontSize: "1rem",
            lineHeight: 1,
          }}
          title="Decrease by 1 pt"
        >
          -
        </button>
        <input
          type="number"
          min={-4}
          max={12}
          step={0.5}
          value={rolesPageGapPt.toFixed(1)}
          onChange={(e) => setRolesPageGapPt(Math.max(-4, Math.min(12, Number(e.target.value))))}
          style={{
            width: "4.2rem",
            height: "2rem",
            borderRadius: "0.5rem",
            padding: "0 0.45rem",
            fontSize: "0.8rem",
            background: "rgba(255 255 255/ 92%)",
            color: "rgba(0 0 0/ 80%)",
            textAlign: "center",
          }}
        />
        <button
          type="button"
          onClick={() => adjustRolesPageGapPt(1)}
          style={{
            width: "2rem",
            height: "2rem",
            borderRadius: "0.5rem",
            background: "rgba(100 100 100/ 8%)",
            color: "rgba(0 0 0/ 72%)",
            cursor: "pointer",
            fontSize: "1rem",
            lineHeight: 1,
          }}
          title="Increase by 1 pt"
        >
          +
        </button>
      </div>
    </div>
  );

  const renderInputForm = (isDrawer = false, animateDesktop = false) => {

    return (
    <motion.div
      initial={!isDrawer && animateDesktop ? { opacity: 0, x: -24, filter: "blur(2px)" } : false}
      animate={!isDrawer && animateDesktop ? { opacity: 1, x: 0, filter: "blur(0px)" } : undefined}
      exit={!isDrawer && animateDesktop ? { opacity: 0, x: -18, filter: "blur(2px)" } : undefined}
      transition={!isDrawer && animateDesktop ? { duration: 0.3, ease: [0.22, 1, 0.36, 1] } : undefined}
      style={{
        position: isDrawer ? "relative" : "fixed",
        display: "flex",
        flexDirection: "column",
        height: isDrawer ? "auto" : "100%",
        fontSize: "0.8rem",
        maxHeight: isDrawer ? "none" : "72%",
        width: isDrawer ? "100%" : "30%",
        border: isDrawer ? "none" : "1px solid rgba(100 116 139/ 22%)",
        borderRadius: isDrawer ? "0" : "1rem",
        background: isDrawer ? "transparent" : "linear-gradient(180deg, rgba(248 250 252/ 95%), rgba(241 245 249/ 90%))",
        boxShadow: isDrawer ? "none" : "0 16px 35px rgba(15 23 42/ 10%)",
        overflow: isDrawer ? "visible" : "hidden",
        
      }}
    >
      {/* Fixed Header Section */}
      <div
        style={{
          position: "relative",
          background: "",
          WebkitBackdropFilter: "blur(16px)",
          backdropFilter: "blur(16px)",
          borderRadius: "1rem",
          zIndex: 10,
          // boxShadow: "0 2px 8px rgba(0 0 0/ 10%)",
          display:"flex",
          alignItems:"stretch",
          justifyContent:"stretch",
          width: "100%",
        }}
      >
        {/* Toggle Button */}
        <button
          onClick={() => setHeaderVisible(!headerVisible)}
          style={{
          
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: headerVisible ? "auto" : "0.5rem",
            bottom: headerVisible ? "-0.75rem" : "auto",
            background: "darkblue",
            color: "white",
            border: "none",
            borderRadius: "50%",
            width: "2rem",
            height: "2rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 4px rgba(0 0 0/ 20%)",
            zIndex: 20,
            transition: "all 0.3s ease",
          }}
          title={headerVisible ? "Hide header" : "Show header"}
        >
          {headerVisible ? (
            <ChevronUp width="1.25rem" />
          ) : (
            <ChevronDown width="1.25rem" />
          )}
        </button>

        {/* Header Content */}
        <AnimatePresence mode="wait">
          {headerVisible && (
            <motion.div
              key="header-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              style={{ overflow: "hidden", width: "100%" }}
            >
              <div
                style={{
                  padding: isDrawer ? "0.75rem" : "1.25rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <h2>Offer Letter </h2>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  
                  <button
                    onClick={handleClearForm}
                    style={{
                      background: "rgba(100 100 100/ 10%)",
                      padding: "0.15rem 0.75rem",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontSize: "0.75rem",
                    }}
                  >
                    <FileX color="indianred" width="0.9rem" />
                    Clear Form
                  </button>
                  {!isDrawer && screenWidth >= FORM_PANEL_BREAKPOINT && (
                    <button
                      onClick={() => setHideDesktopInputSection(true)}
                      style={{
                        background: "rgba(100 100 100/ 10%)",
                        padding: "0.15rem 0.75rem",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        fontSize: "0.75rem",
                      }}
                    >
                      <Sidebar color="darkblue" width="0.9rem" />
                      Hide Section
                    </button>
                  )}
                </div>
              </div>

              <div style={{ padding: isDrawer ? "0 0.75rem 0.75rem 0.75rem" : "0 1.5rem 1.5rem 1.5rem" }}>
                {/* Presets section */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                    marginBottom: "1.5rem",
                    padding: "0.75rem",
                    background: "rgba(100 100 100/ 5%)",
                    borderRadius: "0.75rem",
                  }}
                >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.9rem",
                fontWeight: "500",
                color: "",
              }}
            >
              <FileText width="1rem" color="darkblue" />
              <span>Presets</span>
              <div style={{ width: "7rem" }}></div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => setPresetDialogVisible(true)}
                style={{
                  background: "rgba(100 100 100/ 0.025)",
                  color: "darkblue",
                  border: "none",
                  padding: "0.15rem 0.75rem",
                  borderRadius: "0.5rem",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  transition: "all 0.2s ease",
                }}
                
              >
                <Plus width={"0.8rem"} />
                Add New
              </button>
              {/* <button
                onClick={handleClearForm}
                style={{ padding: "0.15rem 0.75rem", fontSize: "0.75rem" }}
              >
                Clear
              </button> */}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <Select value={selectedPreset} onValueChange={handleLoadPreset}>
              <SelectTrigger
                disabled={presetsLoading}
                className="w-full h-[38px]"
                style={{ display: "flex", alignItems: "center" }}
              >
                {presetsLoading && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Fetching</span>
                  </div>
                )}
                {!presetsLoading && (
                  <SelectValue placeholder="Select a preset" />
                )}
              </SelectTrigger>
              <SelectContent
                position="popper"
                className=""
                style={{
                  display: "flex",
                  justifyContent: "flex-start",
                  border: "",
                }}
              >
                {presets.map((preset) => (
                  <SelectItem
                    style={{ display: "flex", justifyContent: "flex-start" }}
                    key={preset.id}
                    value={preset.id}
                  >
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPreset && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "none",
                      fontSize: "0.75rem",
                      border: "1px solid rgba(100 100 100/ 40%)",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                      cursor: "pointer",
                      height: "2.45rem",
                      willChange: "transform",
                    }}
                  >
                    <MoreVertical color="darkblue" width={"0.8rem"} />
                  </motion.button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    className="hover:bg-slate-800"
                    style={{
                      borderRadius: "0.25rem",
                      display: "flex",
                      justifyContent: "space-between",
                      width: "100%",
                      fontSize: "",
                      padding: "0.45rem",
                    }}
                    // onClick={() => setRenameDialogVisible(true)}
                  >
                    <TextCursor className="w-4" />
                    <span>Rename</span>
                    <p></p>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    style={{ display: "flex", justifyContent: "space-between" }}
                    onClick={handleUpdatePreset}
                    disabled={!hasChanges}
                    className={
                      !hasChanges ? "opacity-50 cursor-not-allowed" : ""
                    }
                  >
                    <RefreshCcw color="darkblue" className="w-4" />
                    <span>Update</span>
                    <p></p>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    style={{ display: "flex", justifyContent: "space-between" }}
                    onClick={() => {
                      setDeleteId(selectedPreset);
                      setDeleteDialogVisible(true);
                    }}
                    className="text-red-500"
                  >
                    <Trash2 className="w-4" />
                    <span>Delete</span>
                    <p></p>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* <div
            style={{
              display: "flex",
              gap: "0.5rem",
              marginTop: "0.5rem",
              fontSize: "0.6rem",
              flexFlow: "",
            }}
          >
            <button
              onClick={handleUpdatePreset}
              disabled={!selectedPreset || !hasChanges}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "rgba(100 100 100/ 40%)",
                color: "",
                border: "none",
                padding: "0.45rem 1rem",
                borderRadius: "0.5rem",
                cursor:
                  selectedPreset && hasChanges ? "pointer" : "not-allowed",
                opacity: selectedPreset && hasChanges ? 1 : 0.5,
                transition: "all 0.2s ease",
                flex: 1,
                justifyContent: "center",
                fontSize: "0.8rem",
              }}
              onMouseOver={(e) => {
                if (selectedPreset && hasChanges) {
                  e.currentTarget.style.background = "rgba(100 100 100/ 60%)";
                }
              }}
              onMouseOut={(e) => {
                if (selectedPreset && hasChanges) {
                  e.currentTarget.style.background = "rgba(100 100 100/ 40%)";
                }
              }}
            >
              <RefreshCcw color="darkblue" width={"0.8rem"} />
              Update
            </button>
            <button
              onClick={() => {
                if (selectedPreset) {
                  setDeleteDialogVisible(true);
                  setDeleteId(selectedPreset);
                }
              }}
              disabled={!selectedPreset}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "rgba(100 100 100/ 40%)",
                color: "",
                border: "none",
                padding: "0.25rem 1rem",
                borderRadius: "0.5rem",
                cursor: selectedPreset ? "pointer" : "not-allowed",
                opacity: selectedPreset ? 1 : 0.5,
                transition: "all 0.2s ease",
                flex: 1,
                justifyContent: "center",
                fontSize: "0.8rem",
              }}
              onMouseOver={(e) => {
                if (selectedPreset) {
                  e.currentTarget.style.background = "rgba(100 100 100/ 60%)";
                }
              }}
              onMouseOut={(e) => {
                if (selectedPreset) {
                  e.currentTarget.style.background = "rgba(100 100 100/ 40%)";
                }
              }}
            >
              <X color="indianred" width={"0.8rem"} />
              Delete Preset
            </button>
          </div> */}
        </div>

        {/* Field Configuration Section */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            minHeight: "3.25rem",
            padding: "0.75rem",
            background: "rgba(100 100 100/ 5%)",
            borderRadius: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Sparkles width="1rem" color="darkblue" />
            <span style={{ fontSize: "0.9rem", fontWeight: "500" }}>
              Manage Fields
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {!isDrawer && (
              <button
                onClick={() => setPreviewDragEnabled((prev) => !prev)}
                style={{
                  background: previewDragEnabled ? "rgba(0 0 139/ 10%)" : "rgba(100 100 100/ 0.08)",
                  color: previewDragEnabled ? "darkblue" : "rgba(0 0 0/ 65%)",
                 
                  padding: "0.15rem 0.75rem",
                  borderRadius: "0.5rem",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
                title={previewDragEnabled ? "Disable drag & drop in preview" : "Enable drag & drop in preview"}
              >
                <GripVertical width={"0.8rem"} />
                Drag: {previewDragEnabled ? "On" : "Off"}
              </button>
            )}
            <button
              onClick={() => setFieldConfigDialogVisible(true)}
              style={{
                background: "rgba(100 100 100/ 0.025)",
                color: "darkblue",
                border: "none",
                padding: "0.15rem 0.75rem",
                borderRadius: "0.5rem",
                cursor: "pointer",
                fontSize: "0.8rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Menu width={"0.8rem"} />
              Configure
            </button>
          </div>
        </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Scrollable Content Section */}
      <div
        ref={inputFormScrollRef}
        onScroll={handleInputSectionScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "1rem",
          paddingTop: headerVisible ? "0.75rem" : "2.75rem",
          paddingBottom: "1.5rem",
          transition: "padding-top 0.25s ease",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        {/* Reference Number - Always visible */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.45rem",
            padding: "0.75rem",
            borderRadius: "0.7rem",
            border: "1px solid rgba(100 116 139/ 20%)",
            background: "rgba(255 255 255/ 85%)",
          }}
        >
          <label
            style={{
              fontSize: "0.85rem",
              fontWeight: 500,
              color: "rgba(0 0 0/ 85%)",
              letterSpacing: "0.01em",
            }}
          >
            Reference Number
          </label>
          <input
            type="text"
            name="refNo"
            value={formData.refNo}
            onChange={handleInputChange}
            placeholder="Enter Reference Number"
            style={inputStyle}
          />
          <span style={{ fontSize: "0.72rem", color: "rgba(30 41 59/ 70%)" }}>
            Use a consistent format to keep references searchable.
          </span>
        </div>

        {/* Basic Information Section */}
        <div 
          ref={basicSectionRef}
          style={{
            order: 1,
            borderRadius: "0.8rem",
            padding: "0.65rem",
            border: "1px solid rgba(148 163 184/ 25%)",
            background: "rgba(255 255 255/ 84%)",
            transition: "background-color 0.3s ease",
            boxShadow: "0 1px 2px rgba(15 23 42/ 5%)",
          }}
        >
          {renderSectionHeader("basic", "Basic Information", <User width="1.1rem" />, "Candidate details")}
          {!sectionsCollapsed.basic && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {getSortedFieldsForSection(["candidateName", "passportNumber", "position", "workLocation", "reportingDate"]).map((field) => renderField(field))}
            </div>
          )}
        </div>

        {/* Compensation Section */}
        <div 
          ref={compensationSectionRef}
          style={{
            order: 2,
            borderRadius: "0.8rem",
            padding: "0.65rem",
            border: "1px solid rgba(148 163 184/ 25%)",
            background: "rgba(255 255 255/ 84%)",
            transition: "background-color 0.3s ease",
            boxShadow: "0 1px 2px rgba(15 23 42/ 5%)",
          }}
        >
          {renderSectionHeader("compensation", "Compensation", <CreditCard width="1.1rem" />, "Salary and allowances")}
          {!sectionsCollapsed.compensation && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {getSortedFieldsForSection(["salary", "allowance", "grossSalary"]).map((field) => (
                <React.Fragment key={field.id}>
                  {renderField(field)}
                  {/* Additional Allowances after allowance field */}
                  {field.id === "allowance" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginTop: "0.5rem",
                        }}
                      >
                        <h4 style={{ fontSize: "0.8rem", color: "rgba(0 0 0/ 70%)" }}>
                          Additional Allowances
                        </h4>
                      </div>
                      <AnimatePresence mode="sync">
                        {formData.allowances.map((allowance, index) => (
                          <motion.div
                            key={index}
                            ref={index === formData.allowances.length - 1 ? lastAllowanceRef : null}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                            style={{
                              display: "flex",
                              flexFlow: "column",
                              border: "1px solid rgba(100 100 100/ 20%)",
                              borderRadius: "0.5rem",
                              padding: "0.45rem",
                              marginBottom: "0.5rem",
                              background: "rgba(100 100 100/ 5%)",
                              willChange: "transform, opacity",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                              <input
                                type="text"
                                value={allowance.title}
                                onChange={(e) => handleAllowanceChange(index, "title", e.target.value)}
                                placeholder="Enter Allowance type"
                                style={{ ...inputStyle, fontSize: "0.92rem" }}
                              />
                              <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleRemoveAllowance(index)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "rgba(100 100 100/ 10%)",
                                  color: "indianred",
                                  border: "none",
                                  padding: "0.5rem 0.75rem",
                                  borderRadius: "0.45rem",
                                  cursor: "pointer",
                                  fontSize: "0.95rem",
                                  willChange: "transform",
                                }}
                              >
                                <MinusCircle width={"1rem"} />
                              </motion.button>
                            </div>
                            <input
                              value={allowance.description}
                              onChange={(e) => handleAllowanceChange(index, "description", e.target.value)}
                              placeholder="Enter Allowance Amount"
                              style={{ ...inputStyle, fontSize: "0.92rem" }}
                            />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleAddAllowance}
                        style={{
                          fontSize: "0.85rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.5rem",
                          background: "rgba(100 100 100/ 10%)",
                          color: "darkblue",
                          border: "none",
                          padding: "0.5rem 1rem",
                          borderRadius: "0.5rem",
                          cursor: "pointer",
                          width: "100%",
                          marginTop: "0.5rem",
                          willChange: "transform",
                        }}
                      >
                        <Plus width={"0.8rem"} />
                        Add Allowance
                      </motion.button>
                    </div>
                  )}
                </React.Fragment>
              ))}
          </div>
        )}
        </div>

        {/* Benefits & Perks Section */}
        <div 
          ref={benefitsSectionRef}
          style={{
            order: 4,
            borderRadius: "0.8rem",
            padding: "0.65rem",
            border: "1px solid rgba(148 163 184/ 25%)",
            background: "rgba(255 255 255/ 84%)",
            transition: "background-color 0.3s ease",
            boxShadow: "0 1px 2px rgba(15 23 42/ 5%)",
          }}
        >
          {renderSectionHeader("benefits", "Benefits & Perks", <Gift width="1.1rem" />, "Accommodation, food, transport & more")}
          {!sectionsCollapsed.benefits && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {getSortedFieldsForSection(["accomodation", "food", "transport", "communication", "insurance", "airPassage", "sectorOfTravel", "classOfTravel"]).map((field) => renderField(field))}
            </div>
          )}
        </div>

        {/* Terms & Conditions Section */}
        <div 
          ref={termsSectionRef}
          style={{
            order: 3,
            borderRadius: "0.8rem",
            padding: "0.65rem",
            border: "1px solid rgba(148 163 184/ 25%)",
            background: "rgba(255 255 255/ 84%)",
            transition: "background-color 0.3s ease",
            boxShadow: "0 1px 2px rgba(15 23 42/ 5%)",
          }}
        >
          {renderSectionHeader("terms", "Terms & Conditions", <Shield width="1.1rem" />, "Contract, probation & notice period")}
          {!sectionsCollapsed.terms && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {getSortedFieldsForSection(["attendance", "probation", "contractPeriod", "noticePeriod"]).map((field) => (
                  <React.Fragment key={field.id}>
                    {renderField(field)}
                    {/* Notice Period Subsections after noticePeriod field */}
                    {field.id === "noticePeriod" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginTop: "0.5rem",
                          }}
                        >
                          <h4 style={{ fontSize: "0.8rem", color: "rgba(0 0 0/ 70%)" }}>
                            Notice Period Subsections
                          </h4>
                        </div>
                        <AnimatePresence mode="sync">
                          {formData.noticePeriodSubsections.map((subsection, index) => (
                            <motion.div
                              key={index}
                              ref={index === formData.noticePeriodSubsections.length - 1 ? lastSubsectionRef : null}
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                border: "1px solid rgba(100 100 100/ 20%)",
                                borderRadius: "0.5rem",
                                padding: "0.45rem",
                                marginBottom: "0.5rem",
                                background: "rgba(100 100 100/ 5%)",
                                willChange: "transform, opacity",
                              }}
                            >
                              <textarea
                                value={subsection}
                                onChange={(e) => handleNoticePeriodSubsectionChange(index, e.target.value)}
                                placeholder="Enter notice period subsection"
                                style={{ ...inputStyle, fontSize: "0.92rem" }}
                                rows={2}
                              />
                              <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleRemoveNoticePeriodSubsection(index)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "rgba(100 100 100/ 10%)",
                                  color: "indianred",
                                  border: "none",
                                  padding: "0.5rem 0.75rem",
                                  borderRadius: "0.45rem",
                                  cursor: "pointer",
                                  fontSize: "0.95rem",
                                  willChange: "transform",
                                }}
                              >
                                <MinusCircle width={"1rem"} />
                              </motion.button>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleAddNoticePeriodSubsection}
                          style={{
                            fontSize: "0.85rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.5rem",
                            background: "rgba(100 100 100/ 10%)",
                            color: "darkblue",
                            border: "none",
                            padding: "0.5rem 1rem",
                            borderRadius: "0.5rem",
                            cursor: "pointer",
                            width: "100%",
                            marginTop: "0.5rem",
                            willChange: "transform",
                          }}
                        >
                          <Plus width={"0.8rem"} />
                          Add Subsection
                        </motion.button>
                      </div>
                    )}
                  </React.Fragment>
                ))}
            </div>
          )}
        </div>

        {/* Policies & Clauses Section */}
        <div
          ref={additionalTermsSectionRef}
          style={{
            order: 5,
            borderRadius: "0.8rem",
            padding: "0.65rem",
            border: "1px solid rgba(148 163 184/ 25%)",
            background: "rgba(255 255 255/ 84%)",
            transition: "background-color 0.3s ease",
            boxShadow: "0 1px 2px rgba(15 23 42/ 5%)",
          }}
        >
          {renderSectionHeader("additionalTerms", "Policies & Clauses", <Shield width="1.1rem" />, "Visa, medical, leave entitlements & more")}
          {!sectionsCollapsed.additionalTerms && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {getSortedFieldsForSection(["annualLeave", "gratuity", "leaveEncashment", "visaStatus", "medicalTerms", "incrementTerms", "workingHours", "medical"]).map((field) => renderField(field))}
            </div>
          )}
        </div>

        {/* Roles & Responsibilities Section */}
        <div 
          ref={rolesSectionRef}
          style={{
            order: 6,
            borderRadius: "0.8rem",
            padding: "0.65rem",
            border: "1px solid rgba(148 163 184/ 25%)",
            background: "rgba(255 255 255/ 84%)",
            transition: "background-color 0.3s ease",
            boxShadow: "0 1px 2px rgba(15 23 42/ 5%)",
          }}
        >
          {renderSectionHeader("roles", "Roles & Responsibilities", <FileText width="1.1rem" />, "Detailed job duties")}
          {!sectionsCollapsed.roles && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <AnimatePresence mode="sync">
              {formData.roles.map((role, index) => (
                <motion.div
                  key={index}
                  ref={index === formData.roles.length - 1 ? lastRoleRef : null}
                  data-role-index={index}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                  style={{
                    display: "flex",
                    flexFlow: "column",
                    border: highlightedFieldId === `role-${index}` ? "1px solid rgba(0 0 139/ 35%)" : "1px solid rgba(100 100 100/ 20%)",
                    borderRadius: "0.5rem",
                    padding: "0.45rem",
                    marginBottom: "0.5rem",
                    background: highlightedFieldId === `role-${index}` ? "rgba(0 0 139/ 6%)" : "rgba(100 100 100/ 5%)",
                    willChange: "transform, opacity",
                    animation: highlightedFieldId === `role-${index}` ? "fieldFocusPulse 1s ease" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <input
                      type="text"
                      value={role.title}
                      onChange={(e) => handleRoleChange(index, "title", e.target.value)}
                      placeholder="Enter role title"
                      style={{ ...inputStyle, fontSize: "0.92rem" }}
                    />
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setEditingRoleIndex(index);
                        setEditingRoleContent(role.description);
                        setRoleEditorDialogVisible(true);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(100 100 100/ 10%)",
                        color: "darkblue",
                        
                        padding: "0.5rem 0.75rem",
                        borderRadius: "0.45rem",
                        cursor: "pointer",
                        fontSize: "0.95rem",
                        willChange: "transform",
                      }}
                      title="Expand editor"
                    >
                      <Expand width={"1rem"} />
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleRemoveRole(index)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(100 100 100/ 10%)",
                        color: "indianred",
                        border: "none",
                        padding: "0.5rem 0.75rem",
                        borderRadius: "0.45rem",
                        cursor: "pointer",
                        fontSize: "0.95rem",
                        willChange: "transform",
                      }}
                    >
                      <MinusCircle width={"1rem"} />
                    </motion.button>
                  </div>
                  <RichTextEditor
                    value={role.description}
                    onChange={(value) => handleRoleChange(index, "description", value)}
                    placeholder="Enter role description"
                    minHeight="150px"
                    showPasteStyleToggle
                  />
                </motion.div>
              ))}
            </AnimatePresence>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleAddRole}
              style={{
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                background: "rgba(100 100 100/ 10%)",
                color: "darkblue",
                border: "none",
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                cursor: "pointer",
                width: "100%",
                marginTop: "0.5rem",
                willChange: "transform",
              }}
            >
              <Plus width={"0.8rem"} />
              Add Role
            </motion.button>
          </div>
        )}
        </div>

        {/* Custom Fields */}
        {fieldConfig.filter(f => f.enabled && f.isCustom).length > 0 && (
          <div 
            ref={customSectionRef}
            style={{
              order: 7,
              borderRadius: "0.8rem",
              padding: "0.65rem",
              border: "1px solid rgba(148 163 184/ 25%)",
              background: "rgba(255 255 255/ 84%)",
              transition: "background-color 0.3s ease",
              boxShadow: "0 1px 2px rgba(15 23 42/ 5%)",
            }}
          >
            {renderSectionHeader("custom", "Custom Fields", <Sparkles width="1.1rem" />, "Additional fields")}
            {!sectionsCollapsed.custom && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {fieldConfig
                  .filter(f => f.enabled && f.isCustom)
                  .map(field => renderField(field))}
              </div>
            )}
          </div>
        )}
      </div>

      {showInputScrollTopButton && (
        <button
          onClick={handleInputScrollToTop}
          title="Scroll to top"
          style={{
            position: "absolute",
            right: "1rem",
            bottom: "1rem",
            width: "2.2rem",
            height: "2.2rem",
            borderRadius: "0.65rem",
            border: "1px solid rgba(0 0 139/ 24%)",
            background: "rgba(0 0 139/ 92%)",
            color: "white",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 20px rgba(15 23 42/ 18%)",
            zIndex: 15,
          }}
        >
          <ChevronUp width="1rem" />
        </button>
      )}
    </motion.div>
  );
  };

  const renderPreview = () => (
    <div
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: screenWidth < FORM_PANEL_BREAKPOINT ? "100%" : "auto",
          maxWidth: `${PREVIEW_BASE_WIDTH * previewScale}px`,
          minWidth: 0,
        }}
      >
        {/* Info bar — letter ID + 
         */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.25rem",
            paddingRight:"0.6rem",
            marginBottom: "0.5rem",
            background: "rgba(248 250 252 / 0.92)",
            backdropFilter: "blur(8px)",
            borderRadius: "0.8rem",
            border: "1px solid rgba(100 116 139 / 18%)",
            width: "fit-content",
            justifyContent: "flex-start",
            
            // boxShadow: "0 1px 6px rgba(15 23 42 / 0.06)",
          }}
        >
          {loadedLetterId ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "rgba(0 0 0/ 70%)", paddingLeft: "0.75rem" }}>
              <File width="1rem" color="darkblue" />
              <span style={{ fontWeight: 500 }}>{loadedLetterId}</span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.78rem", color: "rgba(0 0 0/ 45%)", paddingLeft: "0.75rem" }}>
              <CloudOff width="1rem" />
              <span>Unsaved</span>
            </div>
          )
          }

          {hasChanges && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.72rem", color: "rgba(180 100 0 / 90%)", padding: "0.2rem 0.5rem", borderRadius: "0.4rem" }}>
              <span className="animate-ping" style={{ width: "0.45rem", height: "0.45rem", borderRadius: "50%", background: "currentColor", flexShrink: 0, display: "inline-block" }} />
              Unsaved changes
            </div>
          )}

          <div style={{ flex: 1 }} />
        </div>

        <div
          style={{
            position: "relative",
            width: `${PREVIEW_BASE_WIDTH * previewScale}px`,
            height: `${previewContentHeight * previewScale}px`,
          }}
        >
          <div
            ref={previewContentRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: `${PREVIEW_BASE_WIDTH}px`,
              transform: `scale(${previewScale})`,
              transformOrigin: "top left",
            }}
          >
      {canEditOfferLetters && showPreviewJumpTip && (
        <div
          style={{
            marginLeft: "1rem",
            marginBottom: "0.75rem",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            fontSize: "0.72rem",

            background: "linear-gradient(180deg, rgba(248 250 252/ 95%), rgba(241 245 249/ 90%))",
            border: "1px solid rgba(100 116 139/ 22%)",
            borderRadius: "0.5rem",
            padding: "0.35rem 0.55rem",
            fontWeight:"500"
          }}
        >
          <Sparkles color="darkblue" width="0.78rem" />
          <span><b style={{fontWeight:800}}>Tip </b> Click any row or clause title to jump to and highlight its input field.</span>
          <button
            type="button"
            onClick={handleDismissPreviewJumpTip}
            aria-label="Dismiss tip"
            style={{
              border: "none",
              background: "transparent",
              color: "rgba(15 23 42/ 68%)",
              cursor: "pointer",
              fontSize: "0.7rem",
              fontWeight: 600,
              padding: "0 0 0 0.25rem",
              lineHeight: 1,
            }}
          >
            <X size="0.9rem" />
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {showPreviewSpacingControls && (
          <motion.div
            key="first-page-spacing-control"
            initial={{ opacity: 0, y: -8, maxHeight: 0 }}
            animate={{ opacity: 1, y: 0, maxHeight: 96 }}
            exit={{ opacity: 0, y: -10, maxHeight: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden", willChange: "transform, opacity, max-height" }}
          >
            {renderFirstPageSpacingControl()}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={tableRef}
        style={{
          border: "",
          width: "100%",
          maxWidth: 800,
          boxSizing: "border-box",
          padding: "4rem",
          backgroundColor:"white",
          background: "url(/letter-head.png)",
          backgroundSize: "contain",
          backgroundPosition:"center",
          color: "black",
          // borderRadius: "0.5rem",
          height: "1100px",
          maxHeight: "1100px",
          fontFamily: "Aptos",
          fontSize: `${firstPageFontSizeRem}rem`,
          margin: "1 auto",
          marginBottom: "4rem",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* <div
          style={{
            position: "absolute",
            border: "",
            width: "100%",
            top: 0,
            left: 0,
            display: "flex",
            justifyContent: "center",
            marginTop: "2.5rem",
          }}
        >
          <img
            src="/sohar_star_logo.png"
            style={{
              width: "4rem",
              // position: "absolute",
              // top: 0,
              // left: 0,
              // margin: "2rem",
            }}
          />
        </div> */}

        <br />
        <br />
        <br />
        <br />
        <br/>
        
        {/* Scrollable content wrapper */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: firstPageGap(0.4) }}>
            {
              <div style={{ fontWeight: 600, textTransform: "uppercase" }}>
                REF: {formData.refNo || "[REF NO]"}
              </div>
            }

            <p style={{ fontWeight: 600 }}>
              {moment(new Date(formData.date)).format("DD/MM/YYYY")}
            </p>
          </div>
        {/* Title */}
        <h2
          style={{
            textAlign: "center",
            fontWeight: "",
            fontSize: `${(firstPageFontSizeRem * 1.25).toFixed(3)}rem`,
            marginBottom: firstPageGap(1),
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          JOB OFFER LETTER
        </h2>
        {/* Intro Paragraph */}
        <p
          style={{
            marginBottom: firstPageGap(1.25),
            textAlign: "justify",
            fontSize: `${firstPageFontSizeRem}rem`,
            fontWeight: 500,
            cursor: "pointer"
          }}
          onClick={() => scrollToSection("basic", "position")}
        >
          We at <b>Sohar Star United LLC</b>, Sohar, Sultanate of Oman, are
          delighted to offer you the position of{" "}
          <b style={{ textTransform: "uppercase" }}>
            {formData.position || "[Position]"}
          </b>{" "}
          in the organization, subject to the following terms and conditions:
        </p>
        {/* Details Table */}
        <table
          style={{
            width: "calc(100% - 22px)",
            marginLeft: "22px",
            borderCollapse: "collapse",
            marginBottom: firstPageGap(2),
            fontSize: `${firstPageTableFontSizeRem}rem`,
            border: "1px solid",
            textTransform: "uppercase",
            background:"none",
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            <col style={{ width: "35%" }} />
            <col style={{ width: "65%" }} />
          </colgroup>
          <DndContext
            sensors={previewDragEnabled ? sensors : []}
            collisionDetection={closestCenter}
            onDragEnd={previewDragEnabled ? handleFieldDragEnd : undefined}
          >
            <SortableContext
              items={fieldConfig.filter(f => f.enabled && f.section === "table").map(f => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <tbody style={{}} onClick={handlePreviewTableClick}>
                {/* Render fields dynamically based on fieldConfig order */}
                {fieldConfig
                  .filter(f => f.enabled && f.section === "table")
                  .map((field) => {
                    // Handle special field rendering
                    if (field.id === "candidateName") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        {formData.candidateName || "[Candidate Name]"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "passportNumber") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        {formData.passportNumber || "[Passport Number]"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "position") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        {formData.position || "[Position]"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "workLocation") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        {formData.workLocation || "Anywhere in Oman"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "salary") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        OMR {formData.salary || "[Basic Salary]"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "allowance") {
                  return (
                    <React.Fragment key={field.id}>
                      <SortableTableRow dragEnabled={previewDragEnabled} key="allowance-main" id={field.id}>
                        <td style={leftColumnStyle}>{field.label}</td>
                        <td style={tableCellStyle}>
                          {formData.allowance || "N/A"}
                        </td>
                      </SortableTableRow>
                      {/* Additional Allowances - shown right after allowance field */}
                      {formData.allowances.length > 0 &&
                        formData.allowances.map((role, index) => (
                          <tr key={`allowance-${index}`}>
                            <td style={leftColumnStyle}>
                              {role.title || "[ALLOWANCE TYPE]"}
                            </td>
                            <td style={tableCellStyle}>
                              {role.description || "[ALLOWANCE AMOUNT]"}
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                }
                if (field.id === "attendance") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={{ ...leftColumnStyle, textAlign: "left" }}>Site/ Office Attendance, including overtime</td>
                      <td style={tableCellStyle}>
                        {formData.attendance || "N/A"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "probation") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        {formData.probation || "N/A"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "reportingDate") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        {formData.reportingDate
                          ? `On or before ${moment(formData.reportingDate).format("DD MMMM YYYY")}`
                          : "[joining Date]"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "contractPeriod") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        {formData.contractPeriod || "N/A"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "noticePeriod") {
                  return (
                    <React.Fragment key={field.id}>
                      <SortableTableRow dragEnabled={previewDragEnabled} key="noticePeriod-main" id={field.id}>
                        <td style={{ ...leftColumnStyle, border: "none" }}>
                          {field.label}
                        </td>
                        <td style={tableCellStyle}>
                          {formData.noticePeriod || "No notice period shall be accepted until the end of the project"}
                        </td>
                      </SortableTableRow>
                      {formData.noticePeriodSubsections.map((subsection, index) => (
                        <tr key={`${field.id}-sub-${index}`}>
                          <td style={{ ...tableCellStyle, borderTop: "none", borderBottom: "none", borderRight: "none", background: "transparent" }}></td>
                          <td style={{ ...tableCellStyle, borderTop: "none" }}>
                            {subsection || "Enter subsection"}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                }
                if (field.id === "accomodation") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>Accommodation</td>
                      <td style={tableCellStyle}>
                        {formData.accomodation || "Single Room Bachelors Accommodation shall be provided by the Company"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "food") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        {formData.food || "Shall be provided by the Company in Site Office and at Camp"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "transport") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        {formData.transport || "A Car shall be provided by the Company for official use only"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "communication") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        {formData.communication || "A postpaid Company SIM shall be provided for official use only"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "insurance") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        {formData.insurance || "WC, Medical & Group Life Insurance, under the Company account"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "annualLeave") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        {formData.annualLeave || "No leave shall be granted throughout the project unless there is an extreme emergency."}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "gratuity") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={tableCellStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        {formData.gratuity || "N/A"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "leaveEncashment") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        {formData.leaveEncashment || "N/A"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "grossSalary") {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        OMR{" "}
                        {(formData.allowances?.reduce(
                          (sum: number, a: any) => sum + Number(a.description),
                          0
                        ) || 0) +
                          Number(formData.salary) +
                          Number(formData.allowance || 0) +
                          " (Monthly)" || "[Gross Salary]"}
                      </td>
                    </SortableTableRow>
                  );
                }
                if (field.id === "airPassage") {
                  return null; // Air passage is handled elsewhere
                }
                if (field.id === "visaStatus") {
                  return null; // Visa status is handled elsewhere
                }
                if (field.id === "workingHours") {
                  return null; // Working hours is handled elsewhere
                }
                // Custom fields
                if (field.isCustom) {
                  return (
                    <SortableTableRow dragEnabled={previewDragEnabled} key={field.id} id={field.id}>
                      <td style={leftColumnStyle}>{field.label}</td>
                      <td style={tableCellStyle}>
                        {formData.customFields?.[field.id] || "N/A"}
                      </td>
                    </SortableTableRow>
                  );
                }
                return null;
              })}
          </tbody>
            </SortableContext>
        </DndContext>
        </table>
        </div>
        {/* End scrollable content wrapper */}
        
        <img style={{ width:"7.5rem", marginLeft:"30rem", position:"absolute", bottom: "2rem", right: "2rem" }} src={"/ssu_stamp.png"}/>
      </div>
      {/* Page break for preview */}
      <div style={{ height: 40 }} />
      {/* Conditionally render Page 2: Roles and Responsibilities */}
      {formData.roles &&
        formData.roles.length > 0 &&
        formData.roles.some(
          (role) => role.title.trim() || role.description.trim()
        ) && (
          <>
            <AnimatePresence initial={false}>
              {showPreviewSpacingControls && (
                <motion.div
                  key="roles-spacing-control"
                  initial={{ opacity: 0, y: -8, maxHeight: 0 }}
                  animate={{ opacity: 1, y: 0, maxHeight: 96 }}
                  exit={{ opacity: 0, y: -10, maxHeight: 0 }}
                  transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                  style={{ overflow: "hidden", willChange: "transform, opacity, max-height" }}
                >
                  {renderRolesSpacingControl()}
                </motion.div>
              )}
            </AnimatePresence>
            {/* <div
              style={{
                width: "100%",
                textAlign: "center",
                color: "#aaa",
                fontSize: "0.9rem",
                marginBottom: "2rem",
              }}
            >
              --- Page 2 ---
            </div> */}
            <div
              ref={rolesRef}
              style={{
                border: "",
                width: "100%",
                maxWidth: 800,
                boxSizing: "border-box",
                padding: "4rem",
                background: "white",
                color: "black",
                // borderRadius: "0.5rem",
                boxShadow: "0 0 10px rgba(0 0 0/ 10%)",
                height: "1100px",
                maxHeight: "1100px",
                overflow: "hidden",
                fontFamily: "Aptos",
                fontSize: "0.8rem",
                margin: "1 auto",
                marginBottom: "4rem",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <br />

              <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
                <h2
                  style={{
                    fontWeight: "600",
                    marginBottom: "1rem",
                    fontSize: "0.85rem",
                    textTransform: "uppercase",
                    cursor: "pointer"
                  }}
                  onClick={() => scrollToSection("roles")}
                >
                  Roles & Responsibilities
                </h2>
                <div
                  onClick={handlePreviewRolesClick}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: rolesPageGap(1.5),
                  }}
                >
                  {formData.roles.map((role, index) =>
                    role.title.trim() || role.description.trim() ? (
                      <div
                        key={index}
                        data-preview-role-index={index}
                        style={{ cursor: "pointer" }}
                      >
                        {role.title.trim() ? (
                          <h3
                            style={{
                              fontSize: "0.9rem",
                              fontWeight: "600",
                              marginBottom: "0.5rem",
                            }}
                          >
                            {role.title}
                          </h3>
                        ) : null}
                        <div 
                          className="role-description-content"
                          style={{ fontSize: "0.8rem", fontWeight: 500, color: "#444" }}
                          dangerouslySetInnerHTML={{ 
                            __html: role.description || "[ROLE DESCRIPTION]" 
                          }}
                        />
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            </div>
            {/* Page break for preview */}
            <div style={{ height: 40 }} />
          </>
        )}
      {/* Page 3: Rest of content */}
      <div
        ref={restRef}
        style={{
          border: "",
          width: "100%",
          maxWidth: 800,
          boxSizing: "border-box",
          padding: "4rem",
          background: "white",
          color: "black",
          // borderRadius: "0.5rem",
          boxShadow: "0 0 10px rgba(0 0 0/ 10%)",
          // height: "1100px",
          // maxHeight: "1100px",
          
          display: "flex",
          flexDirection: "column",
          fontFamily: "Aptos",
          fontSize: "0.8rem",
          margin: "1 auto",
          marginBottom: "4rem",
        }}
      >
        <br />

        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          <img style={{display:"none", width:"7.5rem", bottom:"2rem", right:"2rem"}} src={"/ssu_stamp.png"}/>

        {/* Numbered main clauses */}
        {(() => {
          // Collect all main clause data in an array for numbering
          const clauses = [];
          if (air_passage)
            clauses.push({
              title: "Air Passage",
              content: (
                <>
                  <p>
                    {formData.airPassage || "While going on sanctioned leave, to and fro air ticket on a direct flight from Oman to the nearest international airport to your hometown, once on completion of 12 months."}
                  </p>
                  <br />
                  <p style={{textAlign:"left"}}>
                    <b>Sector of Travel : </b>
                    {formData.sectorOfTravel || "MUSCAT - (Nearest Hometown International Airport)"}
                  </p>
                  <br/>
                  <p style={{textAlign:"left"}}>
                    <b>Class of Travel : </b>
                    {formData.classOfTravel || "Economy Class by any Airline"}
                  </p>
                </>
              ),
            });
          if (visaS)
            clauses.push({
              title: "Visa Status",
              content: (
                <p>
                  {formData.visaStatus || "Work VISA shall be provided by the Company. Employee agrees that he shall not join any competing business until the end of the Contract Project"}
                </p>
              ),
            });
          clauses.push(
            {
              title: "Medical",
              content: (
                <p>
                  {formData.medicalTerms || "During the service period the company will bear all medical expenses for self - excluding dependents, dental, optical, gynecology and congenital."}
                </p>
              ),
            },
            {
              title: "Increment Terms",
              content: (
                <p>
                  {formData.incrementTerms || "Based on the performance of the individual and the company, at the discretion of management."}
                </p>
              ),
            },
            {
              title: "Working Hours",
              content: (
                <p>
                  {formData.workingHours || "As laid down by the company from time to time. Your post being a senior level executive in nature you are not eligible for any overtime; though you shall be available during 24 hours of the day on call basis."}
                </p>
              ),
            },
            {
              title: "Medical Fitness",
              content: (
                <p>
                  Your employment with us shall be subject to your medical
                  fitness, which will be ascertained after a medical examination
                  by the Ministry of Health, Sultanate of Oman, as soon as you
                  arrive and periodically thereafter, on being found medically
                  unfit, your services are liable to be terminated.
                </p>
              ),
            },
            {
              title: "Code of Conduct",
              content: (
                <p>
                  The Company maintains a strict non-alcoholic environment.
                  Unlawful possession of or being under the influence of alcohol
                  or any mind-altering substances will result in immediate
                  termination without prior notice. You are expected to act
                  professionally, ethically, and in a manner that upholds the
                  Company's image and welfare. Any misconduct or inappropriate
                  behavior will be formally communicated in writing, and you
                  will be given a chance to respond. However, the Company
                  reserves the right to terminate employment without notice or
                  pay if misconduct is confirmed. Your services may also be
                  terminated for breach of employment terms, unsatisfactory
                  performance, or if continued employment is deemed not in the
                  Company's interest.
                </p>
              ),
            },
            {
              title: "Documentary Evidence",
              content: (
                <p>
                  Your date of birth as recorded by the Company on the basis of
                  documentary evidence produced by you at the time of your
                  appointment is considered as the authenticated date of birth
                  for all purposes throughout your service with the Company and
                  will not be changed under any circumstances.
                </p>
              ),
            },
            {
              title: "Confidentiality",
              content: (
                <p>
                  During your contract, you may access confidential business
                  information. You must maintain strict confidentiality and not
                  disclose any such information without Company authorization,
                  both during your contract and for five years after. Any breach
                  of this obligation, during or after employment, may result in
                  the Company taking appropriate action to protect its
                  interests.
                </p>
              ),
            }
          );
          return clauses.map((clause, idx) => {
            // Map clause titles to sections
            const getTargetForClause = (title: string): { section: string; fieldId?: string } => {
              if (title === "Air Passage") return { section: "benefits", fieldId: "airPassage" };
              if (title === "Visa Status") return { section: "terms", fieldId: "visaStatus" };
              if (title === "Medical") return { section: "terms", fieldId: "medicalTerms" };
              if (title === "Increment Terms") return { section: "terms", fieldId: "incrementTerms" };
              if (title === "Working Hours") return { section: "terms", fieldId: "workingHours" };
              return { section: "terms" };
            };

            return (
              <div
                key={clause.title}
                style={{ marginBottom: "1rem", fontSize: "0.8rem" }}
              >
                <h3
                  style={{
                    fontWeight: "600",
                    marginBottom: "0.5rem",
                    fontSize: "0.9rem",
                    cursor: "pointer"
                  }}
                  onClick={() => {
                    const target = getTargetForClause(clause.title);
                    scrollToSection(target.section, target.fieldId);
                  }}
                >
                  ({idx + 1}) {clause.title}
                </h3>
                {clause.content}
                
              </div>
            );
          });
          
        })()}
        </div>
      </div>

      {/* Page break for preview */}
      <div style={{ height: 40 }} />
      {/* Page 3: Acknowledgment and Signatures */}
      <div
        ref={signatureRef}
        style={{
          border: "",
          width: "100%",
          maxWidth: 800,
          boxSizing: "border-box",
          padding: "4rem",
          background: "white",
          color: "black",
          // borderRadius: "0.5rem",
          boxShadow: "0 0 10px rgba(0 0 0/ 10%)",
          height: "1100px",
          maxHeight: "1100px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Aptos",
          fontSize: "0.8rem",
          margin: "1 auto",
          marginBottom: "4rem",
        }}
      >
        <br />
        <br />
        <br />

        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {/* Acknowledgment */}

        <div
          style={{
            marginBottom: "1.5rem",
            fontSize: "0.8rem",
            display: "flex",
            flexFlow: "column",
            gap: "0.5rem",
          }}
        >
          <h3
            style={{
              fontWeight: "600",
              marginBottom: "0.5rem",
              fontSize: "0.9rem",
              cursor: "pointer"
            }}
            onClick={() => scrollToSection("terms")}
          >
            General Terms
          </h3>
          <p style={{ cursor: "pointer" }} onClick={() => scrollToSection("terms")}>
            In the event of your resignation within two years from your date of
            joining the Company, the costs incurred by the Company towards your
            initial mobilization like recruitment fee, processing charges for
            visa and resident card and other related expenses, and/(or) subject
            to "Employment Bond" if any, will be recovered from you.
          </p>
          <p style={{ cursor: "pointer" }} onClick={() => scrollToSection("terms")}>
            You shall communicate to the Company any change in your address as
            well as details of next of kin. All communications sent to you in
            the normal course on the address given by you shall be deemed to
            have been received at your end.
          </p>
          <p style={{ cursor: "pointer" }} onClick={() => scrollToSection("terms")}>
            You are expected to give your whole time of service to us and not
            directly or indirectly enter into any other employment or business
            without our specific consent in writing during the tenure of this
            contract. However, you will be free to seek alternative employment
            after expiry of the period of employment of this contract. You also
            agree to work and reside where we require and to abide by all
            applicable regulations, practices and instructions in operation for
            the guidance and conduct of our staff and the business.
          </p>
        </div>

        {/* Other Terms & Conditions */}
        <h3
          style={{
            fontWeight: "600",
            marginBottom: "0.5rem",
            fontSize: "0.9rem",
            cursor: "pointer"
          }}
          onClick={() => scrollToSection("terms")}
        >
          Other Terms & Conditions
        </h3>
        <ul
          style={{
            marginBottom: "2rem",
            paddingLeft: 24,
            display: "flex",
            flexFlow: "column",
            gap: "0.75rem",
            fontSize: "0.8rem",
          }}
        >
          <li style={{ cursor: "pointer" }} onClick={() => scrollToSection("terms")}>
            Company Assets, if any in possession are to be returned at the end
            of services, else the cost shall be deducted from the final dues.
          </li>
          <li style={{ cursor: "pointer" }} onClick={() => scrollToSection("terms")}>
            VISA expenses will be borne by the Company even in case of
            termination during contract period, but not in case the employee
            resigns during the contract period.
          </li>
          <li style={{ cursor: "pointer" }} onClick={() => scrollToSection("terms")}>
            If you damage any company assets, furniture or vehicles, the company
            will have all rights to recover its compensation from your dues.
          </li>
          <li style={{ cursor: "pointer" }} onClick={() => scrollToSection("terms")}>
            If the employee does not sign this agreement within the seven days,
            the agreement shall be deemed null and void.
          </li>
          <li style={{ cursor: "pointer" }} onClick={() => scrollToSection("terms")}>
            In case of failure to report to duty in Oman, the offer letter shall
            become null and void after seven days from the date of the signed
            agreement.
          </li>
        </ul>
        <h3
          style={{
            fontWeight: "600",
            marginBottom: "0.5rem",
            fontSize: "0.9rem",
            cursor: "pointer"
          }}
          onClick={() => scrollToSection("terms")}
        >
          Acknowledgment:
        </h3>
        <p
          style={{
            marginBottom: "2rem",
            textAlign: "justify",
            fontSize: "0.8rem",
            cursor: "pointer"
          }}
          onClick={() => scrollToSection("terms")}
        >
          You hereby confirm and undertake that you shall not, at any time,
          either during the continuance of your employment or after the
          completion of your employment, divulge or use any information acquired
          in the course of your employment, about or relating to the Company, in
          any manner which may directly or indirectly be detrimental to the
          interest of Company.
        </p>
        {/* Signature Lines */}
        <div
          style={{
            marginTop: "4rem",
            display: "flex",
            flexFlow: "column",
            justifyContent: "flex-start",
          }}
        >
          <div style={{}}>
            <img style={{position:"absolute", width:"7.5rem", marginLeft:"15rem"}} src={"/ssu_stamp.png"}/>
            <img style={{position:"absolute", width:"6rem", marginLeft:"6rem", marginTop:"1rem"}} src={"/sunil_sign.png"}/>
            <div style={{ marginBottom: "2rem" }}>
              Employee Signature _____________________________________
            </div>
          </div>
          <div style={{}}>
            <div style={{ marginBottom: "2rem" }}>
              HR Manager _____________________________________________
            </div>
          </div>
          <div style={{}}>
            <div style={{ marginBottom: "2rem" }}>
              Managing Director ______________________________________
            </div>
          </div>
        </div>
        </div>
      </div>
          </div>
        </div>
      </div>
    </div>
  );

  const handleRenamePreset = async (newName: string) => {
    if (!selectedPreset) return;

    try {
      setPresetsLoading(true);
      const { error } = await supabase
        .from("offer_letter_presets")
        .update({ name: newName.trim() })
        .eq("id", selectedPreset);
      if (error) throw error;
      message.success("Preset renamed successfully");
      await fetchPresets();
    } catch (err) {
      console.error("Failed to rename offer letter preset:", err);
      message.error("Failed to rename preset");
    } finally {
      setPresetsLoading(false);
    }
  };

  return (
    <>
      <div className="desktop-only" style={{ display: "block" }}>
      {/* <div style={{border:"", display:"flex", alignItems:"center", justifyContent:'center'}}>
        <ConfettiExplosion/>
        </div> */}
      <div
        style={{
          padding: "",
          background:"rgba(100 100 100/ 8%)",
          // background:
          //   "linear-gradient(rgba(18 18 80/ 65%), rgba(100 100 100/ 0%))",
          height: "100svh",
          overflowY: "scroll",
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(100 100 100/ 40%) transparent",
        }}
      >
        <motion.div>
          {canEditOfferLetters && (
            <button
              style={{
                position: "fixed",
                bottom: 0,
                right: 0,
                zIndex: 10,
                margin: "2rem",
              }}
              onClick={() => setDrawerVisible(true)}
              className="mobile-menu-button"
            >
              <Menu color="black" width="1.5rem" />
            </button>
          )}
          <Back
            blurBG
            fixed
            // title={
            //   loadedLetterId && (
            //     <div
            //       style={{
            //         display: "flex",
            //         alignItems: "center",
            //         gap: "0.5rem",
            //         fontSize: "0.9rem",
            //       }}
            //     >
            //       {saving ? (
            //         <LoaderCircle className="animate-spin" width={"1rem"} />
            //       ) : (
            //         <Database width={"1rem"} color="darkblue" />
            //       )}
            //       <p>{loadedLetterId}</p>
            //     </div>
            //   )
            // }
            // title="Doc"
            // icon={<File color="darkblue" />}
            // subtitle={
            //   formData.position && (
            //     <p style={{ textTransform: "uppercase" }}>
            //       {formData.position}
            //     </p>
            //   )
            // }
            title={
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <p
                  style={{
                    fontSize: "1rem",
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    textTransform: "uppercase",
                  }}
                >
                  {/* {saving ? (
                    <LoaderCircle className="animate-spin" width={"1rem"} />
                  ) : (
                    loadedLetterId && (
                      <Database color="darkblue" width={"1rem"} />
                    )
                  )} */}

                  {/* {loadedLetterId} */}
                </p>
                {/* {hasChanges && loadedLetterId && (
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "#f59e0b",
                      background: "rgba(245 158 11/ 15%)",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "0.25rem",
                      fontWeight: 500,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    <Dot color="#f59e0b" width="1rem" />
                    Unsaved Changes
                  </div>
                )} */}
              </div>
            }
            extra={
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  border: "",
                  height: "2.75rem",
                }}
              >
                <button
                  onClick={handlePrintPDF}
                  style={{
                    width: "100%",
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    letterSpacing: "0.01em",
                    padding: "0.55rem 1.3rem",
                    background: pdfLoading
                      ? "linear-gradient(145deg, rgba(21, 12, 112, 0.94), rgba(24, 12, 125, 0.9) 45%, rgba(13, 7, 88, 0.95))"
                      : "linear-gradient(145deg, rgba(15, 5, 130, 0.96), rgba(25, 12, 170, 0.94) 45%, rgba(12, 3, 105, 0.98))",
                    color: "white",
                   
                    borderRadius: "0.8rem",
                    cursor: pdfLoading ? "not-allowed" : "pointer",
                    opacity: pdfLoading ? 0.7 : 1,
                    boxShadow:
                      "inset 0 1px 0 rgba(255,255,255,0.62), inset 0 -10px 16px rgba(8,30,120,0.5), 0 10px 22px rgba(4,16,60,0.4), 0 0 18px rgba(52,110,255,0.24), 0 0 0 1px rgba(160,204,255,0.18)",
                    position: "relative",
                    overflow: "hidden",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease",
                  }}
                  disabled={pdfLoading}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: "0.08rem",
                      bottom: "0.08rem",
                      left: "0.08rem",
                      right: "0.08rem",
                      borderRadius: "0.8rem",
                      pointerEvents: "none",
                      background:
                        "linear-gradient(165deg, rgba(255,255,255,0.25) 0%, rgba(188,222,255,0.12) 18%, rgba(255,255,255,0) 52%), radial-gradient(135% 80% at 14% -10%, rgba(255,255,255,0.42), rgba(255,255,255,0) 58%)",
                    }}
                  />

                  {pdfLoading && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        height: "100%",
                        width: `${pdfProgress}%`,
                        background: "rgba(255 255 255/ 20%)",
                        transition: "width 0.3s ease",
                      }}
                    />
                  )}
                  <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                    {pdfLoading ? (
                      <>
                        <LoaderCircle className="animate-spin" width="1rem" />
                        <span>({pdfProgress}%)</span>
                      </>
                    ) : (
                      <>
                        <FilePlus color="white" width={"1rem"} />
                        Generate 
                      </>
                    )}
                  </div>
                </button>

                {/* <button
                  onClick={!loadedLetterId ? handleSave : handleSaveChanges}
                >
                  {saving ? (
                    <LoaderCircle className="animate-spin" />
                  ) : !loadedLetterId ? (
                    <Save color="darkblue" />
                  ) : (
                    <CloudUpload color="darkblue" />
                  )}
                </button> */}

                {canEditOfferLetters && (
                  !loadedLetterId ? (
                    <motion.button
                      onClick={!loadedLetterId ? handleSave : handleSaveChanges}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(100 100 100/ 10%)",
                        fontSize: "0.75rem",
                        // border: "1px solid rgba(100 100 100/ 40%)",
                        padding: "0.5rem 1rem",
                        borderRadius: "0.5rem",
                        cursor: "pointer",
                        height: "",
                        willChange: "transform",
                      }}
                    >
                      {saving ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Save width={"1.25rem"} color="darkblue" />
                      )}
                    </motion.button>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <motion.button
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(100 100 100/ 10%)",
                            fontSize: "0.75rem",
                            // border: "1px solid rgba(100 100 100/ 40%)",
                            padding: "0.65rem 1rem",
                            borderRadius: "0.5rem",
                            cursor: "pointer",
                            height: "",
                            willChange: "transform",
                          }}
                        >
                          {saving ? (
                            <LoaderCircle className="animate-spin" />
                          ) : !loadedLetterId ? (
                            <Save color="darkblue" width={"1.25rem"} />
                          ) : (
                            <Save color="darkblue" width={"1.25rem"} />
                          )}

                          <ChevronDown width={"1rem"} />
                        </motion.button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          style={{
                            display: "flex",
                            justifyContent: "flex-start",
                          }}
                          onClick={handleSaveChanges}
                        >
                          <Save color="royalblue" className="w-4" />
                          <span>Save Changes</span>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          style={{
                            display: "flex",
                            justifyContent: "flex-start",
                          }}
                          onClick={handleSave}
                        >
                          <FilePlus2 className="w-4" />
                          <span>Save as New</span>
                          <p></p>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )
                )}

                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    // border: "1px solid rgba(100 100 100/ 30%)",
                    background: "rgba(100 100 100/ 10%)",
                    padding: "0.5rem 0.75rem",
                  }}
                  onClick={() => {
                    // Show cached letters immediately
                    if (offerLettersCache.length > 0) {
                      setOfferLetters(offerLettersCache);
                    }
                    setOfferLettersDrawerVisible(true);
                    // Fetch new letters in background
                    fetchOfferLetters();
                  }}
                >
                  <Database color="darkblue" width={"1.25rem"} />
                </motion.button>
              </div>
            }
          />
          <br />

          {loading ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "75svh",
              }}
            >
              <LoadingOutlined style={{ color: "darkblue", scale: "2" }} />
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                gap: "1rem",
                height: "calc(100vh - 8rem)",
                border: "",
                justifyContent: "center",
                alignItems: "flex-start",
                paddingTop: "5rem",
                position: "relative",
              }}
            >
              {/* Input Form - Visible on wide screens */}
              <AnimatePresence mode="sync">
                {canEditOfferLetters && screenWidth >= FORM_PANEL_BREAKPOINT && !hideDesktopInputSection && (
                  <motion.div
                    key="desktop-input-section"
                    initial={{ opacity: 0, x: -28, scale: 0.98, width: 0 }}
                    animate={{ opacity: 1, x: 0, scale: 1, width: "30%" }}
                    exit={{ opacity: 0, x: -22, scale: 0.985, width: 0 }}
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    style={{ overflow: "hidden", flexShrink: 0 }}
                  >
                    <div className="input-form" style={{ ...styles.inputForm, width: "100%", overflow: "auto", maxHeight: "calc(100vh - 8rem - 5rem)" }}>
                      {renderInputForm(false, true)}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Preview */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                style={{
                  flex: screenWidth < FORM_PANEL_BREAKPOINT ? "0 1 90%" : "0 1 auto",
                  maxWidth: screenWidth < FORM_PANEL_BREAKPOINT ? "800px" : "100%",
                }}
              >
                {renderPreview()}
              </motion.div>

              {/* Floating button for narrow screens */}
              {canEditOfferLetters && (screenWidth < FORM_PANEL_BREAKPOINT || hideDesktopInputSection) && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (screenWidth >= FORM_PANEL_BREAKPOINT && hideDesktopInputSection) {
                      setHideDesktopInputSection(false);
                    } else {
                      setResponsiveFormDrawerOpen(true);
                    }
                  }}
                  style={{
                    position: "fixed",
                    bottom: "2rem",
                    right: "2rem",
                    width: "3.5rem",
                    height: "3.5rem",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, rgba(15, 5, 130, 0.96), rgba(25, 12, 170, 0.94))",
                    border: "1.5px solid rgba(186, 218, 255, 0.5)",
                    color: "white",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 40,
                    boxShadow: "0 8px 24px rgba(37, 99, 235, 0.3), inset 0 1px 3px rgba(255, 255, 255, 0.7)",
                  }}
                  title={screenWidth >= FORM_PANEL_BREAKPOINT && hideDesktopInputSection ? "Show section" : "Edit form"}
                >
                  <Pencil width="1.2rem" />
                </motion.button>
              )}
            </div>
          )}
        </motion.div>

        {canEditOfferLetters && (
          <AntDrawer
            style={{ background: "black", color: "white" }}
            title="Offer Letter Details"
            placement="left"
            onClose={() => setDrawerVisible(false)}
            open={drawerVisible}
            width="100%"
          >
            {renderInputForm(true)}
          </AntDrawer>
        )}

        {/* Responsive Form Drawer (shadcn) for narrow screens */}
        {canEditOfferLetters && (
          <Drawer open={responsiveFormDrawerOpen} onOpenChange={setResponsiveFormDrawerOpen}>
            <DrawerContent
              style={{
                padding: "0.75rem",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                height: "85vh",
                maxHeight: "85vh",
              }}
            >
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  width: "100%",
                  overflowY: "auto",
                  overflowX: "hidden",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {renderInputForm(true)}
              </div>
            </DrawerContent>
          </Drawer>
        )}

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

        {/* Offer Letters Drawer */}
        <AntDrawer
      title="Offer Letters"
      placement="right"
      onClose={() => {
        setOfferLettersDrawerVisible(false);
    
      }}
      open={offerLettersDrawerVisible}
      width={window.innerWidth <= 768 ? "100%" : 500}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Search Bar */}
        <div style={{ position: "sticky", top: 0, background: "white", zIndex: 10, paddingBottom: "" }}>
          <div style={{ position: "relative" }}>
            <input
              style={{
                background: "rgba(100 100 100/0.08)",
                color: "black",
                width: "100%",
                padding: "0.6rem 2.5rem 0.6rem 1rem",
                borderRadius: "0.5rem",
                border: "1px solid rgba(100 100 100/ 15%)",
                fontSize: "1rem",
                outline: "none",
                transition: "all 0.2s ease",
              }}
              placeholder="Search by name or position..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "darkblue";
                e.currentTarget.style.background = "rgba(0 0 139/ 0.05)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(100 100 100/ 15%)";
                e.currentTarget.style.background = "rgba(100 100 100/0.08)";
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                style={{
                  position: "absolute",
                  right: "0.5rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "rgba(0 0 0/ 50%)",
                  padding: "0.25rem",
                  display: "flex",
                  alignItems: "center",
                  borderRadius: "0.25rem",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(100 100 100/ 10%)";
                  e.currentTarget.style.color = "black";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                  e.currentTarget.style.color = "rgba(0 0 0/ 50%)";
                }}
              >
                <FileX width="1rem" />
              </button>
            )}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            display: "flex",
            color: "black",
            fontSize: "0.8rem",
            gap: "0.5rem",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: "1rem",
            height: "1rem",
          }}
        >
        {
        offerLettersLoading ? (
          <>
            <LoaderCircle
              width={"0.8rem"}
              color="darkblue"
              className="animate-spin"
            />
            <p>Fetching</p>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            style={{ display: "flex", alignItems: "center" }}
          >
            <Dot color="darkblue" />
            {"Fetched " + offerLetters.length + " "}
            {offerLetters.length > 1 ? "Items" : "Item"}
          </motion.div>
        )}
      </motion.div>

      {offerLetters.length === 0 ? (
        <Empty style={{ maxHeight: "70vh", paddingBottom: "4rem" }}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle style={{ marginTop: "1rem", fontSize: "1.1rem" }}>
              No offer letters saved yet
            </EmptyTitle>
            <EmptyDescription style={{ marginTop: "0.5rem", fontSize: "0.9rem", opacity: 0.7 }}>
              {offerLettersLoading 
                ? "Loading saved letters..." 
                : "Create and save your first offer letter to see it here"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div style={{ maxHeight: "70vh", overflowY: "auto", paddingBottom: "4rem" }}>
          {offerLetters
          .filter((ol) =>
    (ol.candidateName + " " + ol.position)
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  )
          .map((ol:any) => (
            <div
              key={ol.id}
              style={{
                border: "1px solid #eee",
                borderRadius: 8,
                padding: 16,
                marginBottom: 12,
                background: "#fafbfc",
                cursor: "pointer",
                transition: "box-shadow 0.2s",
                display: "flex",
                gap: "1rem"
              }}
            >
              
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "1rem",
                  
                  width:"100%"
                }}
              >
                {/* <Checkbox 
                  checked={selectedLetters.includes(ol.id)}
                  onChange={(e) => {
                    const target = e.target as HTMLInputElement;
                    if (target.checked) {
                      setSelectedLetters(prev => [...prev, ol.id]);
                    } else {
                      setSelectedLetters(prev => prev.filter(id => id !== ol.id));
                    }
                  }}
                  style={{ marginTop: "4px" }}
                /> */}
                <div style={{ flex: 1 }} onClick={() => handleLetterClick(ol)}>
                  <div
                    style={{
                      fontWeight: 500,
                      fontSize: 14,
                      color: "black",
                      textTransform: "capitalize",
                      display: "flex",
                      gap: "0.5rem",
                      alignItems: "center",
                    }}
                  >
                    {ol.candidateName || "[No Name]"}
                  </div>
                  {/* <div
                    style={{
                      fontWeight: 500,
                      fontSize: 14,
                      color: "black",
                      textTransform: "capitalize",
                      display: "flex",
                      gap: "0.5rem",
                      alignItems: "center",
                    }}
                  >
                    {ol.passportNumber || "[No Passport Number]"}
                  </div> */}
                  <div
                    style={{
                      color:"black",
                      opacity:"0.45",
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: "uppercase",
                    }}
                  >
                    {ol.refNo || "[No Reference Number]"}
                  </div>
                  {/* <div
                    style={{
                      color: "royalblue",
                      fontWeight: 500,
                      fontSize: 11,
                      textTransform: "uppercase",
                    }}
                  >
                    {ol.position || "[No Position]"}
                  </div> */}
                  

                  <div style={{ color: "#888", fontSize: 10 }}>
                    {ol.generated_at
                      ? "Last Modified : " +
                        moment(ol.generated_at.toDate?.() ?? ol.generated_at).format(
                          "DD MMM YYYY, h:mm A"
                        )
                      : ""}
                  </div>
                </div>
                {canEditOfferLetters && (
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginLeft: "1rem",
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        Modal.confirm({
                          title: "Delete Offer Letter",
                          content:
                            "Are you sure you want to delete this offer letter?",
                          okText: "Yes",
                          okType: "danger",
                          cancelText: "No",
                          onOk: () => handleDeleteLetter(ol.id),
                        });
                      }}
                      style={{
                        background: "rgba(150 150 150/ 10%)",
                        border: "none",
                        cursor: "pointer",
                        padding: "0.15rem 0.5rem",
                        color: "indianred",
                        fontSize: "0.7rem",
                      }}
                    >
                      {deleting ? <LoadingOutlined /> : "Delete"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </AntDrawer>
        {/* {loadedLetterId && (
          <button
            onClick={handleSaveChanges}
            style={{
              margin: "1.5rem",
              position: "fixed",
              bottom: 0,
              right: 0,
              width: "",
              fontSize: "0.9rem",
              padding: "0.5rem 1rem",
              background: "rgba(100 100 100/ 40%)",
              WebkitBackdropFilter: "blur(16px)",
              backdropFilter: "blur(16px)",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              cursor: saving ? "not-allowed" : "pointer",
            }}
            disabled={saving}
          >
            <CloudUpload width={"1.25rem"} />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        )} */}
      </div>
      {/* <ReleaseNote /> */}

      <style>{`
        .mobile-menu-button {
          display: none;
        }
        .input-form {
          width: 30%;
        }
        .preview {
          flex: 1;
        }
        @media (max-width: 768px) {
          .mobile-menu-button {
            display: block;
          }
          .input-form {
            display: none;
          }
          .preview {
            width: 100%;
          }
        }
        /* Custom scrollbar styles */
        ::-webkit-scrollbar {
          width: 8px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(100 100 100/ 40%);
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(100 100 100/ 60%);
        }
        /* Styles for rich text formatted content in preview */
        .role-description-content ul {
          list-style-type: disc !important;
          list-style-position: outside !important;
          margin-left: 1.5rem;
          margin-top: 0.5rem;
          margin-bottom: 0.5rem;
          padding-left: 0.5rem;
        }
        .role-description-content ol {
          list-style-type: decimal !important;
          list-style-position: outside !important;
          margin-left: 1.5rem;
          margin-top: 0.5rem;
          margin-bottom: 0.5rem;
          padding-left: 0.5rem;
        }
        .role-description-content li {
          margin-bottom: 0.25rem;
          line-height: 1.6;
          display: list-item !important;
          margin-left: 1rem;
        }
        .preview p {
          margin: 0.5rem 0;
        }
        .preview strong,
        .preview b {
          font-weight: 600;
        }
        .preview em,
        .preview i {
          font-style: italic;
        }
        .preview-date-input {
          border: 1px solid rgba(15 23 42/ 18%);
          border-radius: 0.5rem;
          padding: 0.35rem 0.55rem;
          color: rgba(15 23 42/ 92%);
          background: rgba(255 255 255/ 95%);
        }
        .preview-date-input::-webkit-calendar-picker-indicator {
          cursor: pointer;
          filter: brightness(0) saturate(100%) invert(12%) sepia(97%) saturate(2524%) hue-rotate(236deg) brightness(91%) contrast(115%);
          opacity: 0.95;
        }
        @keyframes fieldFocusPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(0 0 139/ 0%);
            background: rgba(255 255 255/ 82%);
          }
          45% {
            box-shadow: 0 0 0 5px rgba(0 0 139/ 16%);
            background: rgba(237 244 255/ 95%);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(0 0 139/ 0%);
            background: rgba(255 255 255/ 82%);
          }
        }
      `}</style>

      <Modal
        title="Edit Offer Letter"
        open={editDialogVisible}
        onCancel={() => setEditDialogVisible(false)}
        onOk={handleEditLetter}
        confirmLoading={saving}
        okText="Save"
        cancelText="Cancel"
      >
        {editingLetter && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label>Candidate Name</label>
              <Input
                value={editingLetter.candidateName}
                onChange={(e) =>
                  setEditingLetter((prev: any) => ({
                    ...prev,
                    candidateName: e.target.value,
                  }))
                }
                placeholder="Enter candidate name"
              />
            </div>
            <div>
              <label>Passport Number</label>
              <Input
                value={editingLetter.passportNumber}
                onChange={(e) =>
                  setEditingLetter((prev: any) => ({
                    ...prev,
                    passportNumber: e.target.value,
                  }))
                }
                placeholder="Enter passport number"
              />
            </div>
            <div>
              <label>Position</label>
              <Input
                value={editingLetter.position}
                onChange={(e) =>
                  setEditingLetter((prev: any) => ({
                    ...prev,
                    position: e.target.value,
                  }))
                }
                placeholder="Enter position"
              />
            </div>
            <div>
              <label>Reference Number</label>
              <Input
                value={editingLetter.refNo}
                onChange={(e) =>
                  setEditingLetter((prev: any) => ({
                    ...prev,
                    refNo: e.target.value,
                  }))
                }
                placeholder="Enter reference number"
              />
            </div>
            <div>
              <label>Work Location</label>
              <Input
                value={editingLetter.workLocation}
                onChange={(e) =>
                  setEditingLetter((prev: any) => ({
                    ...prev,
                    workLocation: e.target.value,
                  }))
                }
                placeholder="Enter work location"
              />
            </div>
            <div>
              <label>Salary (OMR)</label>
              <Input
                type="number"
                value={editingLetter.salary}
                onChange={(e) =>
                  setEditingLetter((prev: any) => ({
                    ...prev,
                    salary: e.target.value,
                  }))
                }
                placeholder="Enter salary"
              />
            </div>
            <div>
              <label>Allowance (OMR)</label>
              <Input
                type="number"
                value={editingLetter.allowance}
                onChange={(e) =>
                  setEditingLetter((prev: any) => ({
                    ...prev,
                    allowance: e.target.value,
                  }))
                }
                placeholder="Enter allowance"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Add Preset Dialog */}
      <DefaultDialog
        titleIcon={<Save />}
        title="Save as Preset"
        updating={loading}
        disabled={loading}
        open={presetDialogVisible}
        onCancel={() => {
          setPresetDialogVisible(false);
          setPresetName("");
        }}
        onOk={handleSavePreset}
        OkButtonText="Save"
        CancelButtonText="Cancel"
        extra={
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              padding: "1rem 0",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <label
                style={{
                  fontSize: "0.9rem",
                  color: "",
                  fontWeight: "500",
                }}
              >
                Preset Name
              </label>
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Enter preset name"
                style={{
                  padding: "0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid rgba(100 100 100/ 20%)",
                  fontSize: "1rem",
                  transition: "all 0.2s ease",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = "rgba(100 100 100/ 40%)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = "rgba(100 100 100/ 20%)";
                }}
                onFocus={(e) => {
                  e.currentTarget.style.outline = "none";
                  e.currentTarget.style.borderColor = "darkblue";
                  e.currentTarget.style.boxShadow =
                    "0 0 0 2px rgba(0 0 139/ 0.15)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(100 100 100/ 20%)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>
          </div>
        }
      />

      <DefaultDialog
        open={deleteDialogVisible}
        onCancel={() => {
          setDeleteDialogVisible(false);
          setDeleteId("");
        }}
        onOk={() => {
          handleDeletePreset(deleteId);
          setDeleteDialogVisible(false);
          setDeleteId("");
        }}
        title="Delete Preset"
        titleIcon={<Trash2 />}
        extra={
          <p style={{ fontSize: "0.8rem", padding: "0.5rem", opacity: 0.7 }}>
            Are you sure you want to delete this preset? This action cannot be
            undone.
          </p>
        }
        OkButtonText="Delete"
        CancelButtonText="Cancel"
        destructive
      />

      <DefaultDialog
        open={renameDialogVisible}
        onCancel={() => {
          setRenameDialogVisible(false);
          setPresetName("");
        }}
        onOk={() => {
          handleRenamePreset(presetName);
          setRenameDialogVisible(false);
          setPresetName("");
        }}
        title="Rename Preset"
        titleIcon={<FileText color="darkblue" />}
        extra={
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Enter new preset name"
            style={{
              width: "100%",
              padding: "0.5rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(100 100 100/ 20%)",
              fontSize: "1rem",
              background: "none",
            }}
          />
        }
        OkButtonText="Rename"
        CancelButtonText="Cancel"
        disabled={!presetName.trim()}
        updating={loading}
      />

      {/* Role Editor Dialog */}
      <DefaultDialog
        open={roleEditorDialogVisible}
        onCancel={() => {
          setRoleEditorDialogVisible(false);
          setEditingRoleIndex(null);
          setEditingRoleContent("");
        }}
        onOk={() => {
          if (editingRoleIndex !== null) {
            handleRoleChange(editingRoleIndex, "description", editingRoleContent);
          }
          setRoleEditorDialogVisible(false);
          setEditingRoleIndex(null);
          setEditingRoleContent("");
        }}
        title={editingRoleIndex !== null ? `Edit: ${formData.roles[editingRoleIndex]?.title || "Role Description"}` : "Edit Role Description"}
        titleIcon={<FileText color="darkblue" />}
        extra={
          <div style={{ width: "100%", minHeight: "400px" }}>
            <RichTextEditor
              value={editingRoleContent}
              onChange={(value) => setEditingRoleContent(value)}
              placeholder="Enter role description"
              minHeight="400px"
              showPasteStyleToggle
            />
          </div>
        }
        OkButtonText="Save"
        CancelButtonText="Cancel"
      />

      {/* Field Configuration Dialog */}
      <ResponsiveModal
        open={fieldConfigDialogVisible}
        onOpenChange={handleFieldConfigDialogChange}
        title="Manage Fields"
        contentStyle={{ maxWidth: "560px" }}
      
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "70vh",
            maxHeight: "700px",
            overflow: "hidden",
            background: "rgba(248 250 252/ 75%)",
            gap: "1rem",
          }}
        >
          {/* <div
            style={{
              padding: "0.75rem 1.25rem",
              borderBottom: "1px solid rgba(15 23 42/ 10%)",
              background: "rgba(255 255 255/ 94%)",
              flexShrink: 0,
            }}
          >
            <p style={{ margin: 0, fontSize: "0.75rem", color: "rgba(15 23 42/ 60%)" }}>
              Drag rows to reorder and toggle visibility.
            </p>
          </div> */}

          <div
            ref={fieldListScrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              paddingLeft: "0.75rem",
              paddingRight: "0.75rem",
              paddingTop: "0.6rem",
              paddingBottom: "0.6rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            {renderFieldConfigSection(
              "table",
              "Table Fields",
              <Database width="1rem" style={{ color: "darkblue" }} />
            )}

            {renderFieldConfigSection(
              "paragraph",
              "Paragraph Fields",
              <FileText width="1rem" style={{ color: "darkblue" }} />
            )}
          </div>

          {/* Bottom button area */}
          <div
            style={{
              paddingLeft: "0.75rem",
              paddingRight: "0.75rem",
              paddingBottom: "0.6rem",
              paddingTop: "0.5rem",
              borderTop: "1px solid rgba(15 23 42/ 10%)",
              background: "rgba(255 255 255/ 94%)",
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => setAddCustomFieldDialogVisible(true)}
              style={{
                width: "100%",
                background: "rgba(255 255 255/ 10%)",
                color: "darkblue",
                border: "1px solid rgba(0 0 139/ 20%)",
                padding: "0.5rem",
                borderRadius: "0.45rem",
                cursor: "pointer",
                fontSize: "0.8rem",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
              }}
            >
             <Plus size={15}/>
              Add Custom Field
            </button>
          </div>
        </div>
      </ResponsiveModal>

      {/* Add Custom Field Dialog */}
      <ResponsiveModal
        open={addCustomFieldDialogVisible}
        onOpenChange={setAddCustomFieldDialogVisible}
        title="Add Custom Field"
        // description="Create a new field to add to your offer letter"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "rgba(15 23 42/ 80%)", marginBottom: "0.3rem", display: "block" }}>
              Field Name
            </label>
            <input
              type="text"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCustomField();
              }}
              placeholder="Enter field name"
              autoFocus
              style={{
                width: "100%",
                padding: "0.5rem 0.6rem",
                borderRadius: "0.45rem",
                border: "1px solid rgba(15 23 42/ 15%)",
                background: "rgba(255 255 255/ 95%)",
                fontSize: "0.9rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "rgba(15 23 42/ 80%)", marginBottom: "0.3rem", display: "block" }}>
                Field Type
              </label>
              <Select value={newFieldType} onValueChange={(value: FieldType) => setNewFieldType(value)}>
                <SelectTrigger style={{ padding: "0.5rem 0.6rem", fontSize: "0.9rem" }}>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="textarea">Text Area</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "rgba(15 23 42/ 80%)", marginBottom: "0.3rem", display: "block" }}>
                Section
              </label>
              <Select value={newFieldSection} onValueChange={(value: "table" | "paragraph") => setNewFieldSection(value)}>
                <SelectTrigger style={{ padding: "0.5rem 0.6rem", fontSize: "0.9rem" }}>
                  <SelectValue placeholder="Section" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="table">Table</SelectItem>
                  <SelectItem value="paragraph">Paragraph</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.2rem" }}>
            <button
              onClick={() => {
                setAddCustomFieldDialogVisible(false);
                setNewFieldName("");
                setNewFieldType("text");
                setNewFieldSection("table");
              }}
              style={{
                flex: 1,
                padding: "0.5rem",
                borderRadius: "0.4rem",
                border: "1px solid rgba(15 23 42/ 15%)",
                background: "rgba(15 23 42/ 4%)",
                color: "rgba(15 23 42/ 80%)",
                cursor: "pointer",
                fontSize: "0.9rem",
                fontWeight: 500,
              }}
            >
              Cancel
            </button>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => {
                handleAddCustomField();
                setAddCustomFieldDialogVisible(false);
              }}
              style={{
                flex: 1,
                padding: "0.5rem",
                borderRadius: "0.4rem",
                background: "darkblue",
                color: "white",
                border: "none",
                cursor: "pointer",
                fontSize: "0.9rem",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
              }}
            >
              {/* <Plus width="0.7rem" /> */}
              Add Field
            </motion.button>
          </div>
        </div>
      </ResponsiveModal>

      </div>{/* end desktop-only */}
    </>
  );
}
