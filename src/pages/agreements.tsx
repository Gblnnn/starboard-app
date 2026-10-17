import Back from "@/components/back";
import DefaultDialog from "@/components/ui/default-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { message } from "antd";
import { motion } from "framer-motion";
import jsPDF from "jspdf";
import {
  FileText,
  FileX,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCcw,
  Save,
  TextCursor,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

const styles = {
  inputForm: {
    width: "30%",
    borderRadius: "0.5rem",
  },
  preview: {
    flex: 1,
    borderRadius: "0.5rem",
  },
};

const inputStyle = {
  fontSize: "1rem",
};

type AgreementForm = {
  date: string;
  refNo: string;
  subcontractor: string;
  project: string;
  scope: string;
  startDate: string;
  endDate: string;
  paymentTerms: string;
  specialClauses: string;
  contactPerson: string;
  signature: string;
};

type Preset = {
  id: string;
  name: string;
  data: AgreementForm;
  created_at: string;
};

export default function Agreements() {
  const [formData, setFormData] = useState<AgreementForm>({
    date: new Date().toLocaleDateString(),
    refNo: "",
    subcontractor: "",
    project: "",
    scope: "",
    startDate: "",
    endDate: "",
    paymentTerms: "",
    specialClauses: "",
    contactPerson: "",
    signature: "",
  });
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState("");
  const [presetName, setPresetName] = useState("");
  const [presetDialogVisible, setPresetDialogVisible] = useState(false);
  const [renameDialogVisible, setRenameDialogVisible] = useState(false);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [originalPresetData, setOriginalPresetData] =
    useState<AgreementForm | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteId, setDeleteId] = useState("");

  useEffect(() => {
    fetchPresets();
  }, []);

  useEffect(() => {
    if (selectedPreset && originalPresetData) {
      setHasChanges(
        JSON.stringify(formData) !== JSON.stringify(originalPresetData)
      );
    } else {
      setHasChanges(false);
    }
  }, [formData, selectedPreset, originalPresetData]);

  const fetchPresets = async () => {
    try {
      setPresetsLoading(true);
      const { data, error } = await supabase
        .from("agreement_presets")
        .select("id, name, data, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setPresets((data ?? []) as Preset[]);
    } catch (err) {
      console.error("Failed to fetch agreement presets:", err);
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
      const { error } = await supabase.from("agreement_presets").insert({
        name: presetName.trim(),
        data: formData,
      });
      if (error) throw error;
      message.success("Preset saved successfully");
      setPresetDialogVisible(false);
      setPresetName("");
      await fetchPresets();
    } catch (err) {
      console.error("Failed to save agreement preset:", err);
      message.error("Failed to save preset");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadPreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      setFormData({ ...preset.data, date: formData.date });
      setSelectedPreset(presetId);
      setOriginalPresetData(preset.data);
      setHasChanges(false);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from("agreement_presets")
        .delete()
        .eq("id", presetId);
      if (error) throw error;
      message.success("Preset deleted successfully");
      setSelectedPreset("");
      setOriginalPresetData(null);
      setHasChanges(false);
      await fetchPresets();
    } catch (err) {
      console.error("Failed to delete agreement preset:", err);
      message.error("Failed to delete preset");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePreset = async () => {
    if (!selectedPreset || !hasChanges) return;
    try {
      setLoading(true);
      const { error } = await supabase
        .from("agreement_presets")
        .update({ data: formData })
        .eq("id", selectedPreset);
      if (error) throw error;
      message.success("Preset updated successfully");
      setHasChanges(false);
      setOriginalPresetData(formData);
      await fetchPresets();
    } catch (err) {
      console.error("Failed to update agreement preset:", err);
      message.error("Failed to update preset");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (selectedPreset) setHasChanges(true);
  };

  const handleClearForm = () => {
    setFormData({
      date: new Date().toLocaleDateString(),
      refNo: "",
      subcontractor: "",
      project: "",
      scope: "",
      startDate: "",
      endDate: "",
      paymentTerms: "",
      specialClauses: "",
      contactPerson: "",
      signature: "",
    });
    setSelectedPreset("");
    setOriginalPresetData(null);
    setHasChanges(false);
  };

  const handlePrintPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(12);
    doc.text("SUBCONTRACT AGREEMENT", 105, 20, { align: "center" });
    doc.setFontSize(10);
    let y = 35;
    doc.text(`Date: ${formData.date}`, 15, y);
    y += 8;
    doc.text(`Reference No: ${formData.refNo}`, 15, y);
    y += 8;
    doc.text(`Subcontractor: ${formData.subcontractor}`, 15, y);
    y += 8;
    doc.text(`Project: ${formData.project}`, 15, y);
    y += 8;
    doc.text(`Scope of Work: ${formData.scope}`, 15, y, { maxWidth: 180 });
    y += 16;
    doc.text(`Start Date: ${formData.startDate}`, 15, y);
    y += 8;
    doc.text(`End Date: ${formData.endDate}`, 15, y);
    y += 8;
    doc.text(`Payment Terms: ${formData.paymentTerms}`, 15, y, {
      maxWidth: 180,
    });
    y += 16;
    doc.text(`Special Clauses: ${formData.specialClauses}`, 15, y, {
      maxWidth: 180,
    });
    y += 16;
    doc.text(`Contact Person: ${formData.contactPerson}`, 15, y);
    y += 8;
    doc.text(`Signature: ${formData.signature}`, 15, y);
    doc.save(
      `Subcontract_Agreement_${formData.subcontractor || "Agreement"}.pdf`
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ minHeight: "100svh", background: "", padding: 0 }}
    >
      <Back
        extra={
          <button
            onClick={handlePrintPDF}
            style={{
              background: "mediumslateblue",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.75rem 1.5rem",
              fontSize: "1rem",
              cursor: "pointer",
              boxShadow: "1px 1px 10px rgba(0 0 0/ 30%)",
            }}
          >
            Download PDF
          </button>
        }
        fixed
        blurBG
        title="Subcontract Agreement"
      />
      {loading ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "75svh",
          }}
        >
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: "1rem",
            height: "calc(100vh - 8rem)",
            justifyContent: "center",
            paddingTop: "5rem",
          }}
        >
          {/* Input Form - Hidden on mobile */}
          <div className="input-form" style={styles.inputForm}>
            {/* Form Section */}
            <div
              style={{
                position: "fixed",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                height: "100%",
                overflowY: "auto",
                fontSize: "0.8rem",
                maxHeight: "72%",
                width: "30%",
              }}
            >
              <div
                style={{
                  width: "",
                  display: "flex",
                  padding: "1.25rem",
                  WebkitBackdropFilter: "blur(16px)",
                  backdropFilter: "blur(16px)",
                  borderTopLeftRadius: "1rem",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <h2>Subcontract Agreement</h2>
                </div>
                <button
                  onClick={handleClearForm}
                  style={{
                    background: "rgba(100 100 100/ 40%)",
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
              </div>
              {/* Presets Section */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  marginBottom: "1.5rem",
                  padding: "0.75rem",
                  background: "rgba(100 100 100/ 5%)",
                  borderRadius: "0.75rem",
                  border: "1px solid rgba(100 100 100/ 10%)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontSize: "0.9rem",
                      fontWeight: "500",
                    }}
                  >
                    <FileText width="1rem" color="mediumslateblue" />
                    <span>Presets</span>
                    <div style={{ width: "7rem" }}></div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      onClick={() => setPresetDialogVisible(true)}
                      style={{
                        color: "mediumslateblue",
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
                      onMouseOver={(e) => {
                        e.currentTarget.style.background =
                          "rgba(100 100 100/ 50%)";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background =
                          "rgba(100 100 100/ 40%)";
                      }}
                    >
                      <Plus width={"0.8rem"} />
                      Add New
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  <Select
                    value={selectedPreset}
                    onValueChange={handleLoadPreset}
                  >
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
                    <SelectContent position="popper" className="">
                      {presets.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
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
                          <MoreVertical
                            color="mediumslateblue"
                            width={"0.8rem"}
                          />
                        </motion.button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onClick={() => setRenameDialogVisible(true)}
                        >
                          <TextCursor className="w-4" />
                          <span>Rename</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={handleUpdatePreset}
                          disabled={!hasChanges}
                          className={
                            !hasChanges ? "opacity-50 cursor-not-allowed" : ""
                          }
                        >
                          <RefreshCcw color="mediumslateblue" className="w-4" />
                          <span>Update</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setDeleteId(selectedPreset);
                            setDeleteDialogVisible(true);
                          }}
                          className="text-red-500"
                        >
                          <Trash2 className="w-4" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              {/* Form Fields */}
              <div
                style={{
                  padding: "1.5rem",
                  display: "flex",
                  flexFlow: "column",
                  gap: "0.75rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <label>Date</label>
                  <input
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleInputChange}
                    style={inputStyle}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <label>Reference Number</label>
                  <input
                    type="text"
                    name="refNo"
                    value={formData.refNo}
                    onChange={handleInputChange}
                    placeholder="Enter Reference Number"
                    style={inputStyle}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <label>Subcontractor Name</label>
                  <input
                    type="text"
                    name="subcontractor"
                    value={formData.subcontractor}
                    onChange={handleInputChange}
                    placeholder="Enter Subcontractor Name"
                    style={inputStyle}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <label>Project Name</label>
                  <input
                    type="text"
                    name="project"
                    value={formData.project}
                    onChange={handleInputChange}
                    placeholder="Enter Project Name"
                    style={inputStyle}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <label>Scope of Work</label>
                  <textarea
                    name="scope"
                    value={formData.scope}
                    onChange={handleInputChange}
                    rows={3}
                    placeholder="Enter Scope of Work"
                    style={inputStyle}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <label>Start Date</label>
                  <input
                    type="date"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleInputChange}
                    style={inputStyle}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <label>End Date</label>
                  <input
                    type="date"
                    name="endDate"
                    value={formData.endDate}
                    onChange={handleInputChange}
                    style={inputStyle}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <label>Payment Terms</label>
                  <textarea
                    name="paymentTerms"
                    value={formData.paymentTerms}
                    onChange={handleInputChange}
                    rows={2}
                    placeholder="Enter Payment Terms"
                    style={inputStyle}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <label>Special Clauses</label>
                  <textarea
                    name="specialClauses"
                    value={formData.specialClauses}
                    onChange={handleInputChange}
                    rows={2}
                    placeholder="Enter Special Clauses"
                    style={inputStyle}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <label>Contact Person</label>
                  <input
                    type="text"
                    name="contactPerson"
                    value={formData.contactPerson}
                    onChange={handleInputChange}
                    placeholder="Enter Contact Person"
                    style={inputStyle}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <label>Signature</label>
                  <input
                    type="text"
                    name="signature"
                    value={formData.signature}
                    onChange={handleInputChange}
                    placeholder="Enter Signature"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          </div>
          {/* Preview Section */}
          <div className="preview" style={styles.preview}>
            <div
              style={{
                border: "",
                width: "100%",
                maxWidth: 800,
                boxSizing: "border-box",
                padding: "4rem",
                background: "white",
                color: "black",
                borderRadius: "0.5rem",
                boxShadow: "0 0 10px rgba(0 0 0/ 10%)",
                minHeight: "900px",
                fontFamily: "Aptos",
                fontSize: "0.9rem",
                margin: "1 auto",
                overflowX: "auto",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <p style={{ fontWeight: 600, textTransform: "uppercase" }}>
                  {formData.refNo && "REF: " + formData.refNo}
                </p>
                <p style={{ fontWeight: 600 }}>{formData.date}</p>
              </div>
              <h2
                style={{
                  textAlign: "center",
                  fontWeight: "600",
                  fontSize: "1.2rem",
                  marginBottom: "1rem",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                SUBCONTRACT AGREEMENT
              </h2>
              <p
                style={{
                  marginBottom: "1.25rem",
                  textAlign: "justify",
                  fontSize: "0.95rem",
                }}
              >
                This Subcontract Agreement is made between{" "}
                <b>{formData.subcontractor || "[Subcontractor Name]"}</b> and
                the main contractor for the project{" "}
                <b>{formData.project || "[Project Name]"}</b> under the
                following terms and conditions:
              </p>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  marginBottom: "2rem",
                  fontSize: "0.95rem",
                  border: "1px solid",
                }}
              >
                <tbody>
                  <tr>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontWeight: 500,
                        background: "#f7f7f7",
                        width: 180,
                      }}
                    >
                      Subcontractor
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      {formData.subcontractor || "[Subcontractor Name]"}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontWeight: 500,
                        background: "#f7f7f7",
                      }}
                    >
                      Project
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      {formData.project || "[Project Name]"}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontWeight: 500,
                        background: "#f7f7f7",
                      }}
                    >
                      Start Date
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      {formData.startDate || "[Start Date]"}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontWeight: 500,
                        background: "#f7f7f7",
                      }}
                    >
                      End Date
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      {formData.endDate || "[End Date]"}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontWeight: 500,
                        background: "#f7f7f7",
                      }}
                    >
                      Contact Person
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      {formData.contactPerson || "[Contact Person]"}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div style={{ marginBottom: "1.5rem" }}>
                <h3
                  style={{
                    fontWeight: 600,
                    fontSize: "1rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  Scope of Work
                </h3>
                <p style={{ fontSize: "0.95rem", color: "#444" }}>
                  {formData.scope || "[Scope of Work]"}
                </p>
              </div>
              <div style={{ marginBottom: "1.5rem" }}>
                <h3
                  style={{
                    fontWeight: 600,
                    fontSize: "1rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  Payment Terms
                </h3>
                <p style={{ fontSize: "0.95rem", color: "#444" }}>
                  {formData.paymentTerms || "[Payment Terms]"}
                </p>
              </div>
              <div style={{ marginBottom: "1.5rem" }}>
                <h3
                  style={{
                    fontWeight: 600,
                    fontSize: "1rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  Special Clauses
                </h3>
                <p style={{ fontSize: "0.95rem", color: "#444" }}>
                  {formData.specialClauses || "[Special Clauses]"}
                </p>
              </div>
              <div
                style={{
                  marginTop: "3rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2rem",
                }}
              >
                <div>
                  <p style={{ fontWeight: 500, fontSize: "1rem" }}>
                    Signature:
                  </p>
                  <div
                    style={{
                      borderBottom: "1px solid #888",
                      width: 300,
                      margin: "1rem 0 0.5rem 0",
                    }}
                  ></div>
                  <p style={{ fontSize: "0.95rem", color: "#444" }}>
                    {formData.signature || "[Signature]"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Preset Dialogs */}
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
            <label style={{ fontSize: "0.9rem", fontWeight: 500 }}>
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
              }}
            />
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
          handleUpdatePreset();
          setRenameDialogVisible(false);
          setPresetName("");
        }}
        title="Rename Preset"
        titleIcon={<FileText color="mediumslateblue" />}
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
    </motion.div>
  );
}
