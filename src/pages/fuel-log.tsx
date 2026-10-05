import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import Directive from "@/components/directive";
import DropDown from "@/components/dropdown";
import AreaCharter from "@/components/bar-chart";
import NumberPlate from "@/components/number-plate";
import RefreshButton from "@/components/refresh-button";
import { ResponsiveModal } from "@/components/responsive-modal";
import DefaultDialog from "@/components/ui/default-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useBackgroundProcess } from "@/context/BackgroundProcessContext";
import { supabase } from "@/lib/supabase";
import { fetchAndCacheFuelLogs, getCachedFuelLogs, type FuelLog as FuelLogType } from "@/utils/fuelLogsCache";
import { addPendingFuelLog, getPendingFuelLogs, getPendingFuelLogsCount, syncAllPendingFuelLogs } from "@/utils/offlineFuelLogs";
import { getCachedProfile } from "@/utils/profileCache";
import { getCachedVehicle, type VehicleData } from "@/utils/vehicleCache";
import { motion } from "framer-motion";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Calendar, ChevronLeft, ChevronRight, DollarSign, EllipsisVertical, Fuel, Gauge, Loader2, Printer, WifiOff } from "lucide-react";
import moment from "moment";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface FuelProjectOption {
  key: string;
  name: string;
}

interface FuelReportEmployee {
  empId: string;
  name: string;
}

interface FuelReportRow {
  id: string | number;
  date: string;
  employee_code: string | null;
  employee_name: string | null;
  project: string | null;
  vehicle_number: string | null;
  litres: number | string | null;
  odometer_reading: number | string | null;
  amount_spent: number | string | null;
}

const FuelLogPrintableReport = ({
  rows,
  employees,
  fromDate,
  toDate,
  printOnly = false,
}: {
  rows: FuelReportRow[];
  employees: FuelReportEmployee[];
  fromDate: string;
  toDate: string;
  printOnly?: boolean;
}) => {
  const employeeNames = new Map(employees.map((employee) => [employee.empId, employee.name]));
  const totalAmount = rows.reduce((total, row) => total + (Number(row.amount_spent) || 0), 0);
  const totalLitres = rows.reduce((total, row) => total + (Number(row.litres) || 0), 0);
  const projects = Array.from(new Set(rows.map((row) => String(row.project || "").trim()).filter(Boolean)));
  const blankRows = Math.max(0, 20 - rows.length);
  const dateLabel = fromDate === toDate
    ? moment(fromDate).format("DD MMMM YYYY")
    : `${moment(fromDate).format("DD MMM YYYY")} - ${moment(toDate).format("DD MMM YYYY")}`;

  return (
    <section className={`fuel-report-document ${printOnly ? "fuel-report-print-only" : ""}`} aria-label="Fuel reimbursement report">
      <header className="fuel-report-heading">
        <img src="/sohar_star_logo.png" alt="Sohar Star logo" />
        <div>
          <h1>Sohar Star United LLC</h1>
          <p>PB No:153, Falaj Al Qabail, Sohar, Sultanate of Oman</p>
          <h2>Fuel Bills Reimbursement Form (to be settled weekly)</h2>
        </div>
      </header>
      <div className="fuel-report-summary">
        <div><span>Date</span><strong>{dateLabel}</strong></div>
        <div><span>Project</span><strong>{projects.length ? projects.join(", ") : ""}</strong></div>
        <div><span>Total Amount (OMR)</span><strong>OMR {totalAmount.toFixed(3)}</strong></div>
      </div>
      <table className="fuel-report-table">
        <thead><tr>
          <th>S.No.</th><th>Date</th><th>Employee ID / Name</th><th>Project</th>
          <th>Vehicle #</th><th>Qty in L</th><th>Odometer Reading</th><th>Amount (OMR)</th>
        </tr></thead>
        <tbody>
          {rows.map((row, index) => {
            const empId = String(row.employee_code || "");
            return <tr key={`${empId}-${row.date}-${index}`}>
              <td>{index + 1}</td>
              <td>{moment(row.date).format("DD-MMM-YY")}</td>
              <td>{[empId, employeeNames.get(empId) || row.employee_name || ""].filter(Boolean).join(" ")}</td>
              <td>{String(row.project || "").trim()}</td>
              <td>{row.vehicle_number || ""}</td>
              <td>{row.litres === null ? "" : Number(row.litres).toFixed(3)}</td>
              <td>{row.odometer_reading ?? ""}</td>
              <td>{Number(row.amount_spent || 0).toFixed(3)}</td>
            </tr>;
          })}
          {Array.from({ length: blankRows }, (_, index) => <tr key={`blank-${index}`} className="fuel-report-blank-row">{Array.from({ length: 8 }, (_, column) => <td key={column}>&nbsp;</td>)}</tr>)}
          <tr className="fuel-report-total-row">
            <td colSpan={5}>Total</td><td>{totalLitres.toFixed(3)}</td><td></td><td>OMR {totalAmount.toFixed(3)}</td>
          </tr>
        </tbody>
      </table>
      <footer className="fuel-report-signatures">
        <div><span>Prepared By</span><strong>(Site In Charge / Admin)</strong></div>
        <div><span>Approved By</span><strong>Project Manager / HOD</strong></div>
      </footer>
    </section>
  );
};

// Shared Fuel Log Form Component
interface FuelLogFormContentProps {
  date: string;
  vehicleNumber: string | undefined;
  isPrivateVehicle: boolean;
  vehicleCount: number;
  onPrevVehicle: () => void;
  onNextVehicle: () => void;
  odometerReading: string;
  setOdometerReading: (reading: string) => void;
  amountSpent: string;
  setAmountSpent: (amount: string) => void;
  litres: string;
  setLitres: (litres: string) => void;
  project: string;
  setProject: (project: string) => void;
  projects: FuelProjectOption[];
  projectsLoading: boolean;
  setShowDatePicker: (show: boolean) => void;
  dateSectionRef: React.RefObject<HTMLDivElement>;
  editingLog: FuelLogType | null;
  submitting: boolean;
  userProfile: any;
  handleSubmit: (e: React.FormEvent) => void;
}

const FuelLogFormContent: React.FC<FuelLogFormContentProps> = ({
  date,
  vehicleNumber,
  isPrivateVehicle,
  vehicleCount,
  onPrevVehicle,
  onNextVehicle,
  odometerReading,
  setOdometerReading,
  amountSpent,
  setAmountSpent,
  litres,
  setLitres,
  project,
  setProject,
  projects,
  projectsLoading,
  setShowDatePicker,
  dateSectionRef,
  editingLog,
  submitting,
  userProfile,
  handleSubmit,
}) => {
  const [fuelPrice, setFuelPrice] = useState<number>(0.229); // Default Oman fuel price (OMR/L)
  const [isAutoCalculating, setIsAutoCalculating] = useState(false);

  // Fetch current fuel price for Oman
  useEffect(() => {
    const fetchFuelPrice = async () => {
      try {
        // Try to fetch from a fuel price API
        // Using Open-Meteo or similar free API - fallback to Oman average
        const response = await fetch('https://api.api-ninjas.com/v1/fuelprices?city=muscat&country=om', {
          headers: { 'X-Api-Key': 'YOUR_API_KEY' }, // Replace with actual API key if needed
        }).catch(() => null);

        if (response?.ok) {
          const data = await response.json();
          if (data && data[0]?.diesel) {
            setFuelPrice(parseFloat(data[0].diesel) || 0.229);
          }
        }
      } catch (error) {
        // Silently fail and use default price
        console.log('Using default fuel price for Oman');
      }
    };

    // Fetch on component mount
    fetchFuelPrice();
  }, []);

  // Auto-calculate litres when amount changes
  useEffect(() => {
    if (amountSpent && fuelPrice > 0) {
      setIsAutoCalculating(true);
      const calculatedLitres = (parseFloat(amountSpent) / fuelPrice).toFixed(2);
      setLitres(calculatedLitres);
      setIsAutoCalculating(false);
    }
  }, [amountSpent, fuelPrice]);

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", maxHeight: "82vh", width: "100%" }}>
      {/* Fixed Header */}
      <div style={{
        border: "",
        display: "flex",
        justifyContent: "space-between",
        padding: "1rem",
        paddingBottom: "0.5rem",
        borderBottom: "1px solid rgba(100, 100, 100, 0.1)",
        background: "var(--background)",
        boxSizing: "border-box",
        alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>

          <h2 style={{ fontSize: "1.5rem", letterSpacing: "-0.02em", paddingLeft: "1rem" }}>{editingLog ? "Edit Log" : "Log Fuel"}</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          {vehicleNumber && vehicleCount > 1 && (
            <button
              type="button"
              onClick={onPrevVehicle}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "0.25rem", display: "flex", alignItems: "center", opacity: 0.6 }}
            >
              <ChevronLeft width="1.1rem" />
            </button>
          )}
          {vehicleNumber && <NumberPlate private={isPrivateVehicle} number={vehicleNumber} />}
          {vehicleNumber && vehicleCount > 1 && (
            <button
              type="button"
              onClick={onNextVehicle}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "0.25rem", display: "flex", alignItems: "center", opacity: 0.6 }}
            >
              <ChevronRight width="1.1rem" />
            </button>
          )}
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
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", width: "100%", paddingBottom: "1.5rem" }}>
            {/* Date Input with Quick Actions */}
            <motion.div
              ref={dateSectionRef}
              whileTap={{ scale: 0.99 }}
              style={{
                background: "rgba(100, 100, 100, 0.05)",
                padding: "1rem",
                borderRadius: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <Calendar width="1.125rem" height="1.125rem" style={{ opacity: 0.7 }} />
                <label
                  htmlFor="date"
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: "600",
                    opacity: 0.9,
                  }}
                >
                  Date
                </label>
              </div>

              <div onClick={() => setShowDatePicker(true)} style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.875rem 1rem",
                borderRadius: "0.75rem",
                background: "rgba(100, 100, 100, 0.08)",
                cursor: "pointer"
              }}>
                <span style={{ fontSize: "1.125rem", fontWeight: "600", flex: 1 }}>
                  {moment(date).format("DD MMM YYYY")}
                </span>
                <motion.div
                  whileTap={{ scale: 0.95 }}
                  style={{
                    padding: "0.375rem 0.75rem",
                    borderRadius: "0.5rem",
                    background: "rgba(100, 100, 100, 0.1)",
                    fontSize: "0.75rem",
                    fontWeight: "600",
                  }}
                >
                  Change
                </motion.div>
              </div>
            </motion.div>

            <div style={{ padding: "1rem", borderRadius: "1rem", background: "rgba(100, 100, 100, 0.05)" }}>
              <label htmlFor="fuel-project" style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>Project</label>
              <select
                id="fuel-project"
                value={project}
                onChange={(event) => setProject(event.target.value)}
                disabled={projectsLoading}
                style={{ width: "100%", padding: "0.875rem 1rem", borderRadius: "0.75rem", fontSize: "1rem", background: "rgba(100, 100, 100, 0.08)" }}
              >
                <option value="">Select a project</option>
                {projects.map((option) => <option key={option.key} value={option.name}>{option.name}</option>)}
              </select>
            </div>

            {/* Odometer Reading Input */}
            <motion.div
              whileTap={{ scale: 0.99 }}
              style={{
                background: "rgba(100, 100, 100, 0.05)",
                padding: "1rem",
                borderRadius: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <Gauge width="1.125rem" height="1.125rem" style={{ opacity: 0.7 }} />
                <label
                  htmlFor="odometer"
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: "600",
                    opacity: 0.9,
                  }}
                >
                  Odometer Reading
                </label>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  id="odometer"
                  type="number"
                  step="0.1"
                  value={odometerReading}
                  onChange={(e) => setOdometerReading(e.target.value)}
                  placeholder="Enter reading (optional)"
                  style={{
                    width: "100%",
                    padding: "0.875rem 1rem",
                    paddingRight: "3rem",
                    borderRadius: "0.75rem",
                    fontSize: "1.0625rem",
                    fontWeight: "500",
                    background: "rgba(100, 100, 100, 0.08)",
                    transition: "all 0.2s",
                  }}
                />
                <span style={{
                  position: "absolute",
                  right: "1rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  opacity: 0.5,
                }}>
                  km
                </span>
              </div>
            </motion.div>

            {/* Amount Spent Input */}
            <motion.div
              whileTap={{ scale: 0.99 }}
              style={{
                padding: "1rem",
                borderRadius: "1rem",
                background: "rgba(100, 100, 100, 0.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <DollarSign width="1.125rem" height="1.125rem" style={{ opacity: 0.7 }} />
                <label
                  htmlFor="amount"
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: "600",
                    opacity: 0.9,
                  }}
                >
                  Amount Spent
                </label>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  id="amount"
                  type="number"
                  step="0.001"
                  value={amountSpent}
                  onChange={(e) => setAmountSpent(e.target.value)}
                  placeholder="Enter amount"
                  required
                  style={{
                    width: "100%",
                    padding: "0.875rem 1rem",
                    paddingRight: "4rem",
                    borderRadius: "0.75rem",
                    fontSize: "1.0625rem",
                    fontWeight: "500",
                    transition: "all 0.2s",
                  }}
                />
                <span style={{
                  position: "absolute",
                  right: "1rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  opacity: 0.7,
                }}>
                  OMR
                </span>
              </div>
            </motion.div>

            {/* Fuel Price Display & Override */}
            <div style={{
              padding: "0.75rem 1rem",
              borderRadius: "0.75rem",
              background: "rgba(100, 100, 100, 0.05)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.85rem",
            }}>
              <span style={{ fontWeight: 500, fontSize: "1rem", paddingLeft: "0.5rem" }}>Fuel Price / Litre</span>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="number"
                  step="0.01"
                  value={fuelPrice}
                  onChange={(e) => setFuelPrice(parseFloat(e.target.value) || 0.229)}
                  style={{
                    width: "5rem",
                    padding: "0.4rem 0.5rem",
                    borderRadius: "0.5rem",
                    border: "1px solid rgba(100, 100, 100, 0.2)",
                    fontSize: "1rem",
                    textAlign: "right",
                  }}
                />
                <span style={{ fontWeight: 600 }}>OMR/L</span>
              </div>
            </div>

            {/* Litres Input */}
            <motion.div
              whileTap={{ scale: 0.99 }}
              style={{
                padding: "1rem",
                borderRadius: "1rem",
                background: "rgba(100, 100, 100, 0.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <Fuel width="1.125rem" height="1.125rem" style={{ opacity: 0.7 }} />
                <label
                  htmlFor="litres"
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: "600",
                    opacity: 0.9,
                  }}
                >
                  Litres Filled
                </label>
                {isAutoCalculating && (
                  <span style={{
                    fontSize: "0.7rem",
                    background: "rgba(72, 61, 139, 0.15)",
                    color: "darkblue",
                    padding: "0.2rem 0.5rem",
                    borderRadius: "0.3rem",
                    fontWeight: 600,
                  }}>
                    Auto
                  </span>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <input
                  id="litres"
                  type="number"
                  step="0.01"
                  value={litres}
                  onChange={(e) => setLitres(e.target.value)}
                  placeholder="Enter litres"
                  style={{
                    width: "100%",
                    padding: "0.875rem 1rem",
                    paddingRight: "3.5rem",
                    borderRadius: "0.75rem",
                    fontSize: "1.0625rem",
                    fontWeight: "500",
                    transition: "all 0.2s",
                  }}
                />
                <span style={{
                  position: "absolute",
                  right: "1rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  opacity: 0.7,
                }}>
                  L
                </span>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Fixed Submit Button */}
      <div style={{
        padding: "1rem",
        paddingBottom: "1rem",
        background: "var(--background)",
        boxSizing: "border-box"
      }}>
        <motion.button
          type="submit"
          disabled={submitting || !userProfile || !date || !amountSpent || !vehicleNumber || !litres}
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.01 }}
          style={{
            width: "100%",
            padding: "1rem",
            borderRadius: "1rem",
            background: submitting || !userProfile || !date || !amountSpent || !vehicleNumber || !litres
              ? "rgba(100, 100, 100, 1)"
              : "black",
            color: "white",
            fontSize: "1.0625rem",
            border: "none",
            cursor: submitting || !userProfile || !date || !amountSpent || !vehicleNumber || !litres ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            fontWeight: "600"
          }}
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" width="1.25rem" />
            </>
          ) : (
            <span>{editingLog ? "Update" : "Add"}</span>
          )}
        </motion.button>
      </div>
    </form>
  );
};

interface FuelLogDetailContentProps {
  selectedLog: FuelLogType;
  handleEdit: () => void;
  handleDelete: () => void;
  isPrivateVehicle: boolean;
}

const FuelLogDetailContent: React.FC<FuelLogDetailContentProps> = ({
  selectedLog,
  handleEdit,
  handleDelete,
  isPrivateVehicle,
}) => {
  const [tripSummaries, setTripSummaries] = useState<Array<{ id: string; summary: string; kms: string }>>([]);
  const [tripSummary, setTripSummary] = useState("");
  const [tripKms, setTripKms] = useState("");

  const handleAddTripSummary = (e: React.FormEvent) => {
    e.preventDefault();
    if (tripSummary.trim() && tripKms.trim()) {
      const newTrip = {
        id: Date.now().toString(),
        summary: tripSummary.trim(),
        kms: tripKms.trim(),
      };
      setTripSummaries([...tripSummaries, newTrip]);
      setTripSummary("");
      setTripKms("");
    }
  };

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Compact Header */}
      <div style={{
        width: "100%",
        padding: "0.75rem 1rem",
        borderBottom: "1px solid rgba(100, 100, 100, 0.1)",
        background: "var(--background)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: "600", letterSpacing: "-0.02em", marginLeft: "0.5rem" }}>Summary</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {selectedLog.vehicle_number && (
              <NumberPlate private={isPrivateVehicle} number={selectedLog.vehicle_number} />
            )}
            <DropDown
              trigger={<EllipsisVertical width="1.1rem" />}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          </div>
        </div>
      </div>

      {/* Compact Summary Content */}
      <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem", flexShrink: 0 }}>

        {/* 2x2 Grid Layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <div style={{ background: "rgba(100, 100, 100, 0.05)", borderRadius: "0.75rem", padding: "0.75rem" }}>
            <div style={{ fontSize: "0.7rem", opacity: 0.6, marginBottom: "0.25rem" }}>Date</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>{moment(selectedLog.date).format("DD MMM YYYY")}</div>
          </div>

          <div style={{ background: "rgba(100, 100, 100, 0.05)", borderRadius: "0.75rem", padding: "0.75rem" }}>
            <div style={{ fontSize: "0.7rem", opacity: 0.6, marginBottom: "0.25rem" }}>Amount</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>{selectedLog.amount_spent ? `OMR ${selectedLog.amount_spent}` : "-"}</div>
          </div>

          <div style={{ background: "rgba(100, 100, 100, 0.05)", borderRadius: "0.75rem", padding: "0.75rem" }}>
            <div style={{ fontSize: "0.7rem", opacity: 0.6, marginBottom: "0.25rem" }}>Litres</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>{selectedLog.litres ? `${selectedLog.litres} L` : "-"}</div>
          </div>

          <div style={{ background: "rgba(100, 100, 100, 0.05)", borderRadius: "0.75rem", padding: "0.75rem" }}>
            <div style={{ fontSize: "0.7rem", opacity: 0.6, marginBottom: "0.25rem" }}>Odometer</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>{selectedLog.odometer_reading ? `${selectedLog.odometer_reading} km` : "-"}</div>
          </div>

          <div style={{ background: "rgba(100, 100, 100, 0.05)", borderRadius: "0.75rem", padding: "0.75rem" }}>
            <div style={{ fontSize: "0.7rem", opacity: 0.6, marginBottom: "0.25rem" }}>Project</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>{String(selectedLog.project || "").trim() || "-"}</div>
          </div>
        </div>
      </div>

      {/* Compact Trip Summaries Interface */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "0 0.75rem 0.5rem" }}>
          <div style={{ fontSize: "0.72rem", opacity: 0.65, fontWeight: 600 }}>Trip Summaries</div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 0.75rem 0.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem",
          }}
        >
          {tripSummaries.length === 0 ? (
            <div style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(100, 100, 100, 0.4)",
              fontSize: "0.8rem",
              textAlign: "center",
              padding: "0.75rem",
            }}>
              No trip summaries yet.
            </div>
          ) : (
            tripSummaries.map((trip, index) => (
              <div
                key={trip.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "0.5rem",
                  alignItems: "start",
                  background: "rgba(72, 61, 139, 0.08)",
                  border: "1px solid rgba(72, 61, 139, 0.2)",
                  borderRadius: "0.6rem",
                  padding: "0.55rem 0.6rem",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "0.66rem", opacity: 0.55, marginBottom: "0.2rem" }}>Trip {index + 1}</div>
                  <div style={{ fontSize: "0.82rem", lineHeight: "1.25", wordBreak: "break-word" }}>
                    {trip.summary}
                  </div>
                </div>
                <div style={{
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  color: "darkblue",
                  whiteSpace: "nowrap",
                  paddingTop: "0.1rem",
                }}>
                  {trip.kms} km
                </div>
              </div>
            ))
          )}
        </div>

        <form
          onSubmit={handleAddTripSummary}
          style={{
            padding: "0.65rem 0.75rem 0.75rem",
            borderTop: "1px solid rgba(100, 100, 100, 0.1)",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "0.45rem",
            background: "var(--background)",
          }}
        >
          <input
            type="text"
            value={tripSummary}
            onChange={(e) => setTripSummary(e.target.value)}
            placeholder="Trip summary..."
            style={{
              flex: 1,
              padding: "0.5rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(100, 100, 100, 0.1)",
              fontSize: "1rem",
              fontFamily: "inherit",
              backgroundColor: "rgba(100, 100, 100, 0.02)",
              outline: "none",
            }}
            onFocus={(e) => (e.target.style.border = "1px solid darkblue")}
            onBlur={(e) => (e.target.style.border = "1px solid rgba(100, 100, 100, 0.1)")}
          />

          <input
            type="number"
            value={tripKms}
            onChange={(e) => setTripKms(e.target.value)}
            placeholder="km"
            step="0.1"
            style={{
              width: "4.2rem",
              padding: "0.5rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(100, 100, 100, 0.1)",
              fontSize: "1rem",
              backgroundColor: "rgba(100, 100, 100, 0.02)",
              outline: "none",
            }}
            onFocus={(e) => (e.target.style.border = "1px solid darkblue")}
            onBlur={(e) => (e.target.style.border = "1px solid rgba(100, 100, 100, 0.1)")}
          />

          <button
            type="submit"
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "0.5rem",
              background: "darkblue",
              color: "white",
              border: "none",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "filter 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.92)")}
            onMouseLeave={(e) => (e.currentTarget.style.filter = "brightness(1)")}
          >
            Add
          </button>
        </form>
      </div>
    </div>
  );
};

export default function FuelLog() {
  const { userData } = useAuth();
  const [date, setDate] = useState(moment().format("YYYY-MM-DD"));
  const [odometerReading, setOdometerReading] = useState("");
  const [amountSpent, setAmountSpent] = useState("");
  const [litres, setLitres] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [projectOptions, setProjectOptions] = useState<FuelProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fuelLogs, setFuelLogs] = useState<FuelLogType[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCompleted, setRefreshCompleted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [drawerDetailOpen, setDrawerDetailOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<FuelLogType | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [viewingMonth, setViewingMonth] = useState(moment());
  const dateSectionRef = useRef<HTMLDivElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingLog, setEditingLog] = useState<FuelLogType | null>(null);
  const [vehicleRegistrationType, setVehicleRegistrationType] = useState<string>("Private");
  const [allocatedVehicles, setAllocatedVehicles] = useState<VehicleData[]>([]);
  const [selectedVehicleIndex, setSelectedVehicleIndex] = useState(0);
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState(false);
  const [noVehicleModal, setNoVehicleModal] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [activeChart, setActiveChart] = useState(0);
  const [fuelReportOpen, setFuelReportOpen] = useState(false);
  const [fuelReportEmployees, setFuelReportEmployees] = useState<FuelReportEmployee[]>([]);
  const [fuelReportEmployeesLoading, setFuelReportEmployeesLoading] = useState(false);
  const [fuelReportEmployeeId, setFuelReportEmployeeId] = useState(userData?.role === "admin" ? "ALL" : "");
  const [fuelReportFromDate, setFuelReportFromDate] = useState(moment().startOf("month").format("YYYY-MM-DD"));
  const [fuelReportToDate, setFuelReportToDate] = useState(moment().format("YYYY-MM-DD"));
  const [fuelReportRows, setFuelReportRows] = useState<FuelReportRow[] | null>(null);
  const [fuelReportLoading, setFuelReportLoading] = useState(false);
  const { addProcess, updateProcess } = useBackgroundProcess();
  // Vehicle number comes exclusively from vehicle_master.assigned_to via Supabase
  // (never from cached userProfile.allocated_vehicle — that was Firebase-era data)
  const vehicleNumber: string | undefined =
    allocatedVehicles[selectedVehicleIndex]?.vehicle_number || undefined;

  useEffect(() => {
    let cancelled = false;
    const loadProjectOptions = async () => {
      setProjectsLoading(true);
      try {
        const { data, error } = await supabase
          .from("projects")
          .select("project_name")
          .order("project_name", { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        const projectsByName = new Map<string, FuelProjectOption>();
        (data || []).forEach((row) => {
          const name = String(row.project_name || "").trim();
          const key = name.toLocaleLowerCase();
          if (name && !projectsByName.has(key)) projectsByName.set(key, { key, name });
        });
        setProjectOptions(Array.from(projectsByName.values()));
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load projects.");
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    };
    void loadProjectOptions();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!drawerOpen || projectsLoading) return;
    setSelectedProject("");
    if (editingLog) {
      const savedProject = String(editingLog.project || "").trim();
      const matchingSavedProject = projectOptions.find((option) => option.name.toLocaleLowerCase() === savedProject.toLocaleLowerCase());
      setSelectedProject(matchingSavedProject?.name || "");
      return;
    }

    const empId = userData?.emp_id ? String(userData.emp_id) : "";
    if (!empId) return;
    let cancelled = false;
    const loadCurrentProject = async () => {
      try {
        const { data, error } = await supabase
          .from("v_employee_latest_project")
          .select("current_project")
          .eq("emp_id", empId)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        const currentProject = String(data?.current_project || "").trim();
        if (!currentProject || currentProject.toLocaleLowerCase() === "unassigned") return;
        const matchingProject = projectOptions.find((option) => option.name.toLocaleLowerCase() === currentProject.toLocaleLowerCase());
        if (matchingProject) setSelectedProject(matchingProject.name);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load your current project.");
      }
    };
    void loadCurrentProject();
    return () => { cancelled = true; };
  }, [drawerOpen, editingLog, projectOptions, projectsLoading, userData?.emp_id]);

  useEffect(() => {
    if (!fuelReportOpen) return;
    let cancelled = false;
    const isAdmin = userData?.role === "admin";
    const loadFuelReportEmployees = async () => {
      setFuelReportEmployeesLoading(true);
      try {
        let query = supabase
          .from("employees")
          .select("emp_id, name")
          .not("emp_id", "is", null)
          .not("name", "is", null)
          .order("name", { ascending: true });
        if (!isAdmin) {
          if (userData?.emp_id) query = query.eq("emp_id", String(userData.emp_id));
          else if (userData?.email) query = query.eq("email", userData.email);
          else throw new Error("Your employee ID could not be identified.");
        }
        const { data, error } = await query;
        if (error) throw error;
        if (cancelled) return;
        const employeeOptions = (data || [])
          .filter((employee) => employee.emp_id !== null && employee.name)
          .map((employee) => ({ empId: String(employee.emp_id), name: String(employee.name) }));
        if (!isAdmin && !employeeOptions.length) {
          setFuelReportEmployees([]);
          setFuelReportEmployeeId("");
          toast.error("No employee record was found for your account.");
          return;
        }
        const employeeCodesWithLogs = new Set<string>();
        let offset = 0;
        let logPage: Array<{ employee_code: string | null }>;
        do {
          if (cancelled) return;
          let logsQuery = supabase.from("fuel_log").select("employee_code");
          if (!isAdmin) logsQuery = logsQuery.eq("employee_code", employeeOptions[0]?.empId || "");
          const { data: logData, error: logError } = await logsQuery.range(offset, offset + 499);
          if (logError) throw logError;
          if (cancelled) return;
          logPage = (logData || []) as Array<{ employee_code: string | null }>;
          logPage.forEach((log) => {
            if (log.employee_code) employeeCodesWithLogs.add(String(log.employee_code));
          });
          offset += 500;
        } while (logPage.length === 500);
        if (cancelled) return;
        const employees = employeeOptions.filter((employee) => employeeCodesWithLogs.has(employee.empId));
        setFuelReportEmployees(employees);
        if (isAdmin) {
          setFuelReportEmployeeId((current) => current || "ALL");
        } else if (employees[0]) {
          setFuelReportEmployeeId(employees[0].empId);
        } else {
          setFuelReportEmployeeId("");
          toast.error("No fuel logs were found for your employee record.");
        }
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load employees for the report.");
      } finally {
        if (!cancelled) setFuelReportEmployeesLoading(false);
      }
    };
    void loadFuelReportEmployees();
    return () => { cancelled = true; };
  }, [fuelReportOpen, userData?.email, userData?.emp_id, userData?.role]);

  // Calculate monthly fuel consumption and mileage
  const monthlyData = (() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentYear = new Date().getFullYear();
    const data = months.map((month) => ({
      name: month,
      fuel: 0,
      mileage: 0,
    }));

    fuelLogs.forEach((log) => {
      const logDate = new Date(log.date);
      if (logDate.getFullYear() === currentYear) {
        const monthIndex = logDate.getMonth();
        if (data[monthIndex]) {
          data[monthIndex].fuel += Number(log.litres) || 0;
        }
      }
    });

    // Calculate mileage for each month
    const sortedLogs = [...fuelLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    for (let i = 0; i < sortedLogs.length - 1; i++) {
      const currentLog = sortedLogs[i + 1];
      const previousLog = sortedLogs[i];
      const currentDate = new Date(currentLog.date);

      if (currentDate.getFullYear() === currentYear) {
        const distance = Number(currentLog.odometer_reading) - Number(previousLog.odometer_reading);
        const litres = Number(currentLog.litres);
        if (distance > 0 && litres > 0) {
          const monthIndex = currentDate.getMonth();
          if (data[monthIndex]) {
            data[monthIndex].mileage = distance / litres;
          }
        }
      }
    }

    return data;
  })();

  useEffect(() => {
    // Load cached profile data immediately
    const cachedProfile = getCachedProfile();
    if (cachedProfile) {
      setUserProfile(cachedProfile);
    }

    // Fetch employee by email → get emp_id → fetch assigned vehicles from vehicle_master
    const fetchAllocatedVehicleFromRecord = async () => {
      if (!userData?.email) return;
      try {
        // Look up emp_id by email
        const { data: empData, error: empError } = await supabase
          .from("employees")
          .select("emp_id")
          .eq("email", userData.email)
          .single();

        if (empError || !empData?.emp_id) {
          console.warn("Employee not found for email:", userData.email);
          return;
        }

        const empId = empData.emp_id;

        // Fetch all vehicles assigned to this employee via vehicle_master.assigned_to
        const { data: vehiclesData, error: vehiclesError } = await supabase
          .from("vehicle_master")
          .select("vehicle_number, make, model, year, type, status, registration_type")
          .eq("assigned_to", empId);

        if (vehiclesError) throw vehiclesError;

        const vehicles: VehicleData[] = (vehiclesData || []).map(d => ({
          vehicle_number: d.vehicle_number || "",
          make: d.make || "",
          model: d.model || "",
          year: d.year || "",
          type: d.type || "",
          status: d.status || "",
          registration_type: d.registration_type,
        }));

        if (vehicles.length > 0) {
          setAllocatedVehicles(vehicles);
          setSelectedVehicleIndex(0);
          const initVehicle = vehicles[0];
          if (initVehicle?.registration_type) {
            setVehicleRegistrationType(initVehicle.registration_type);
          }
        }
      } catch (err) {
        console.warn("Failed to fetch allocated vehicle from employees:", err);
      }
    };
    fetchAllocatedVehicleFromRecord();

    // While the live fetch runs, immediately apply cached registration type if available
    const cachedVehicle = getCachedVehicle();
    if (cachedVehicle?.registration_type) {
      setVehicleRegistrationType(cachedVehicle.registration_type);
    }

    // Load cached fuel logs immediately
    if (userData?.email) {
      const cachedLogs = getCachedFuelLogs(userData.email);
      if (cachedLogs) {
        setFuelLogs(cachedLogs);
        // Fetch fresh data in background (silent refresh)
        fetchFuelLogs(true);
      } else {
        // No cached data, show loader while fetching
        fetchFuelLogs(false);
      }
    }

    // Detect mobile/desktop
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Monitor online/offline status
    const handleOnline = () => {
      setIsOnline(true);
      syncPendingLogs();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check for pending logs
    updatePendingCount();

    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [userData?.email]);

  const fetchFuelLogs = async (silent = false) => {
    if (!userData?.email) return;

    // Don't fetch when offline, just use cached/pending data
    if (!navigator.onLine) {
      console.log("📴 Offline: Using local data only");
      const cachedLogs = getCachedFuelLogs(userData.email) || [];
      const pendingLogs = getPendingFuelLogs();
      const pendingAsFuelLogs: FuelLogType[] = pendingLogs.map(log => ({
        id: log.id,
        date: log.data.date,
        odometer_reading: log.data.odometer_reading,
        amount_spent: log.data.amount_spent,
        employee_name: log.data.employee_name,
        project: log.data.project || null,
        vehicle_number: log.data.vehicle_number,
        created_at: new Date(log.createdAt),
        isPending: true,
      }));

      const allLogs = [...pendingAsFuelLogs, ...cachedLogs].sort((a, b) => {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      setFuelLogs(allLogs);
      return;
    }

    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const logs = await fetchAndCacheFuelLogs(userData.email);

      // Merge with pending logs
      const pendingLogs = getPendingFuelLogs();
      const pendingAsFuelLogs: FuelLogType[] = pendingLogs.map(log => ({
        id: log.id,
        date: log.data.date,
        odometer_reading: log.data.odometer_reading,
        amount_spent: log.data.amount_spent,
        employee_name: log.data.employee_name,
        project: log.data.project || null,
        vehicle_number: log.data.vehicle_number,
        created_at: new Date(log.createdAt),
        isPending: true,
      }));

      // Combine and sort by date (newest first)
      const allLogs = [...pendingAsFuelLogs, ...logs].sort((a, b) => {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      setFuelLogs(allLogs);

      if (silent) {
        setRefreshCompleted(true);
        setTimeout(() => {
          setRefreshCompleted(false);
        }, 1000);
      }
    } catch (error) {
      console.error("Error fetching fuel logs:", error);
      if (!silent) toast.error("Failed to load fuel logs");
    } finally {
      if (!silent) setLoading(false);
      else setRefreshing(false);
    }
  };

  const updatePendingCount = () => {
    // Removed - pending count now shown in background process dropdown
  };

  const syncPendingLogs = async () => {
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

      // If sync was skipped (already in progress), don't show notifications
      if (result.skipped) {
        updateProcess(processId, {
          status: "completed",
          message: "Sync already in progress"
        });
        return;
      }

      if (result.success > 0) {
        updateProcess(processId, {
          status: "completed",
          message: `${result.success} fuel log${result.success > 1 ? 's' : ''} synced successfully`
        });
        fetchFuelLogs(true); // Refresh the list
      }

      if (result.failed > 0) {
        updateProcess(processId, {
          status: "error",
          message: `${result.failed} fuel log${result.failed > 1 ? 's' : ''} failed to sync`
        });
      }

      updatePendingCount();
    } catch (error) {
      console.error("Error syncing fuel logs:", error);
      updateProcess(processId, { status: "error", message: "Sync failed" });
    }
  };

  const handlePrevVehicle = () => {
    if (allocatedVehicles.length <= 1) return;
    const newIdx = (selectedVehicleIndex - 1 + allocatedVehicles.length) % allocatedVehicles.length;
    setSelectedVehicleIndex(newIdx);
    const v = allocatedVehicles[newIdx];
    if (v?.registration_type) setVehicleRegistrationType(v.registration_type);
  };

  const handleNextVehicle = () => {
    if (allocatedVehicles.length <= 1) return;
    const newIdx = (selectedVehicleIndex + 1) % allocatedVehicles.length;
    setSelectedVehicleIndex(newIdx);
    const v = allocatedVehicles[newIdx];
    if (v?.registration_type) setVehicleRegistrationType(v.registration_type);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // vehicleNumber is the top-level derived value from allocatedVehicles (Supabase only)
    if (!vehicleNumber || !amountSpent) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (!userProfile) {
      toast.error("User profile not found");
      return;
    }

    try {
      setSubmitting(true);

      if (editingLog) {
        // Update existing log (requires online connection)
        if (!isOnline) {
          toast.error("You need to be online to edit existing logs");
          return;
        }

        const fuelLogData = {
          date: date,
          odometer_reading: odometerReading ? parseFloat(odometerReading) : 0,
          amount_spent: parseFloat(amountSpent),
          litres: litres ? parseFloat(litres) : undefined,
          project: selectedProject.trim() || null,
          vehicle_number: vehicleNumber,
          // updated_at not in fuel_log schema — omitted
        };

        const { error } = await supabase
          .from("fuel_log")
          .update(fuelLogData)
          .eq("id", editingLog.id);
        if (error) {
          console.error("❌ fuel_log update error:", error);
          throw error;
        }
        toast.success("Fuel log updated successfully!");
        fetchFuelLogs();
      } else {
        // Create new log
        const fuelLogData = {
          date: date,
          odometer_reading: odometerReading ? parseFloat(odometerReading) : 0,
          amount_spent: parseFloat(amountSpent),
          litres: litres ? parseFloat(litres) : undefined,
          email: userData?.email || "",
          employee_name: userProfile.name || "",
          // Send null (not "") when emp code is missing — "" violates the FK constraint
          employee_code: userProfile.employeeCode || userProfile.emp_id || null,
          project: selectedProject.trim() || null,
          vehicle_number: vehicleNumber,
          timestamp: Date.now(),
        };

        if (isOnline) {
          // Save directly to Supabase
          const { error } = await supabase
            .from("fuel_log")
            .insert(fuelLogData); // created_at uses DB default now()
          if (error) {
            console.error("❌ fuel_log insert error:", error);
            throw error;
          }
          toast.success("Fuel log submitted successfully!");

          // Refresh logs from Firestore
          fetchFuelLogs();
        } else {
          // Save to localStorage for later sync
          const pendingId = addPendingFuelLog(fuelLogData);
          toast.success("Fuel log saved offline. Will sync when online.", {
            icon: <WifiOff width="1rem" />,
          });
          updatePendingCount();

          // Add to local state immediately without refetching
          const newLog: FuelLogType = {
            id: pendingId,
            date: date,
            odometer_reading: odometerReading ? parseFloat(odometerReading) : 0,
            amount_spent: parseFloat(amountSpent),
            employee_name: userProfile.name || "",
            project: selectedProject.trim() || null,
            vehicle_number: vehicleNumber,
            created_at: new Date(),
            isPending: true,
          };

          setFuelLogs(prevLogs => [newLog, ...prevLogs]);
        }
      }

      // Reset form
      setDate(moment().format("YYYY-MM-DD"));
      setOdometerReading("");
      setAmountSpent("");
      setLitres("");
      setSelectedProject("");
      setDrawerOpen(false);
      setEditingLog(null);
    } catch (error: any) {
      console.error("Error submitting fuel log:", error);
      const msg = error?.message || error?.details || JSON.stringify(error);
      toast.error(`${editingLog ? "Failed to update" : "Failed to submit"} fuel log: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const loadFuelReport = async () => {
    if (!fuelReportFromDate || !fuelReportToDate || fuelReportFromDate > fuelReportToDate) {
      toast.error("Select a valid date range.");
      return;
    }
    const isAdmin = userData?.role === "admin";
    const selectedEmployee = fuelReportEmployees.find((employee) => employee.empId === fuelReportEmployeeId);
    if (!isAdmin && !selectedEmployee) {
      toast.error("Your employee record could not be found.");
      return;
    }
    if (isAdmin && fuelReportEmployeeId !== "ALL" && !selectedEmployee) {
      toast.error("Select an employee from the list.");
      return;
    }

    setFuelReportLoading(true);
    try {
      const reportEmployeeId = isAdmin ? selectedEmployee?.empId : fuelReportEmployees[0]?.empId;
      const reportRows: FuelReportRow[] = [];
      let offset = 0;
      let pageRows: FuelReportRow[];
      do {
        let query = supabase
          .from("fuel_log")
          .select("id, date, employee_code, employee_name, project, vehicle_number, litres, odometer_reading, amount_spent")
          .gte("date", fuelReportFromDate)
          .lt("date", moment(fuelReportToDate).add(1, "day").format("YYYY-MM-DD"))
          .order("date", { ascending: true })
          .order("employee_code", { ascending: true })
          .order("id", { ascending: true });
        if (!isAdmin || fuelReportEmployeeId !== "ALL") {
          query = query.eq("employee_code", reportEmployeeId);
        }
        const { data, error } = await query.range(offset, offset + 499);
        if (error) throw error;
        pageRows = (data || []) as FuelReportRow[];
        reportRows.push(...pageRows);
        offset += 500;
      } while (pageRows.length === 500);
      setFuelReportRows(reportRows);
      if (!reportRows.length) toast.info("No fuel log records were found for the selected filters.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load the fuel report.");
      setFuelReportRows(null);
    } finally {
      setFuelReportLoading(false);
    }
  };

  const printFuelReport = () => {
    if (!fuelReportRows?.length) return;
    const cleanup = () => document.body.classList.remove("fuel-log-report-print");
    document.body.classList.add("fuel-log-report-print");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
  };

  const showDeleteConfirmation = () => {
    setDeleteConfirmDialog(true);
  };

  const handleDelete = async () => {
    if (!selectedLog || deleting) return;

    try {
      setDeleting(true);
      const { error } = await supabase
        .from("fuel_log")
        .delete()
        .eq("id", selectedLog.id);
      if (error) throw error;
      toast.success("Fuel log deleted successfully!");
      setDeleteConfirmDialog(false);
      setDrawerDetailOpen(false);
      setSelectedLog(null);
      fetchFuelLogs();
    } catch (error) {
      console.error("Error deleting fuel log:", error);
      toast.error("Failed to delete fuel log");
    } finally {
      setDeleting(false);
      setDeleteConfirmDialog(false);
    }
  };

  const handleEdit = () => {
    if (!selectedLog) return;

    // Populate form with selected log data
    setDate(selectedLog.date);
    setOdometerReading(selectedLog.odometer_reading ? String(selectedLog.odometer_reading) : "");
    setAmountSpent(String(selectedLog.amount_spent));
    setLitres(selectedLog.litres ? String(selectedLog.litres) : "");
    setSelectedProject(String(selectedLog.project || "").trim());
    setEditingLog(selectedLog);

    // Close detail drawer and open edit drawer
    setDrawerDetailOpen(false);
    setDrawerOpen(true);
  };

  const reportEmployeesForCurrentUser = userData?.role === "admin"
    ? fuelReportEmployees
    : fuelReportEmployees.slice(0, 1);

  return (
    <>
      <style>{`
        .fuel-report-document { box-sizing: border-box; width: 100%; padding: 1rem; color: #000; background: #fff; font-family: Arial, sans-serif; }
        .fuel-report-heading { position: relative; text-align: center; }
        .fuel-report-heading img { position: absolute; top: 0; left: 1rem; width: 42px; height: 42px; object-fit: contain; }
        .fuel-report-heading h1 { margin: 0; font-size: 15px; font-weight: 700; }
        .fuel-report-heading p { margin: 3px 0 12px; font-size: 11px; font-weight: 600; }
        .fuel-report-heading h2 { display: inline-block; margin: 0 0 10px; font-size: 12px; font-weight: 700; text-decoration: underline; }
        .fuel-report-summary { display: grid; grid-template-columns: 1fr 1.5fr 1fr; border: 1px solid #111; border-bottom: 0; font-size: 11px; }
        .fuel-report-summary > div { display: flex; flex-direction: column; min-height: 34px; padding: 3px 5px; border-right: 1px solid #111; }
        .fuel-report-summary > div:last-child { align-items: flex-end; border-right: 0; }
        .fuel-report-summary strong { font-weight: 500; }
        .fuel-report-summary > div:last-child strong { font-weight: 700; }
        .fuel-report-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9px; }
        .fuel-report-table th, .fuel-report-table td { border: 1px solid #111; padding: 3px 4px; text-align: center; overflow-wrap: anywhere; }
        .fuel-report-table th { height: 29px; font-weight: 700; }
        .fuel-report-table tbody tr { height: 19px; }
        .fuel-report-table tbody tr:nth-child(even) { background: #c3e8f2; }
        .fuel-report-table th:nth-child(1), .fuel-report-table td:nth-child(1) { width: 7%; }
        .fuel-report-table th:nth-child(2), .fuel-report-table td:nth-child(2) { width: 11%; }
        .fuel-report-table th:nth-child(3), .fuel-report-table td:nth-child(3) { width: 22%; }
        .fuel-report-table th:nth-child(4), .fuel-report-table td:nth-child(4) { width: 15%; }
        .fuel-report-table th:nth-child(5), .fuel-report-table td:nth-child(5) { width: 11%; }
        .fuel-report-table th:nth-child(6), .fuel-report-table td:nth-child(6) { width: 8%; }
        .fuel-report-table th:nth-child(7), .fuel-report-table td:nth-child(7) { width: 12%; }
        .fuel-report-table th:nth-child(8), .fuel-report-table td:nth-child(8) { width: 14%; }
        .fuel-report-total-row { font-weight: 700; }
        .fuel-report-signatures { display: flex; justify-content: space-between; margin-top: 38px; font-size: 10px; }
        .fuel-report-signatures > div { display: flex; min-width: 40%; flex-direction: column; justify-content: space-between; min-height: 95px; }
        .fuel-report-signatures > div:last-child { align-items: flex-end; text-align: right; }
        .fuel-report-signatures strong { border-top: 1px dotted #111; padding-top: 4px; font-weight: 400; }
        .fuel-report-print-only { display: none; }
        .fuel-report-filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.75rem; }
        .fuel-report-filters label { display: flex; min-width: 150px; flex-direction: column; gap: 0.3rem; font-size: 0.75rem; font-weight: 600; }
        .fuel-report-filters select, .fuel-report-filters input { height: 2.25rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; background: #fff; padding: 0 0.5rem; font: inherit; }
        .fuel-report-filters button { display: inline-flex; height: 2.25rem; align-items: center; justify-content: center; gap: 0.4rem; border: 0; border-radius: 0.375rem; background: #0f172a; padding: 0 0.75rem; color: #fff; font-size: 0.8rem; cursor: pointer; }
        .fuel-report-filters button:disabled { cursor: not-allowed; opacity: 0.5; }
        .fuel-report-filters .fuel-report-print-button { background: #0f766e; }
        .fuel-report-empty { padding: 1.5rem 0; color: #64748b; font-size: 0.875rem; text-align: center; }
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body.fuel-log-report-print * { visibility: hidden !important; }
          body.fuel-log-report-print .fuel-report-print-only,
          body.fuel-log-report-print .fuel-report-print-only * { visibility: visible !important; }
          body.fuel-log-report-print .fuel-report-print-only { display: block !important; position: fixed; inset: 0; width: 100%; padding: 0; }
          body.fuel-log-report-print .fuel-report-heading h1 { font-size: 14px; }
          body.fuel-log-report-print .fuel-report-heading p { margin-bottom: 8px; font-size: 11px; }
          body.fuel-log-report-print .fuel-report-heading h2 { margin-bottom: 7px; font-size: 12px; }
          body.fuel-log-report-print .fuel-report-summary { font-size: 10px; }
          body.fuel-log-report-print .fuel-report-summary > div { min-height: 27px; }
          body.fuel-log-report-print .fuel-report-table { font-size: 9px; }
          body.fuel-log-report-print .fuel-report-table th, body.fuel-log-report-print .fuel-report-table td { padding: 2px; }
          body.fuel-log-report-print .fuel-report-table th { height: 25px; }
          body.fuel-log-report-print .fuel-report-table tbody tr { height: 17px; }
          body.fuel-log-report-print .fuel-report-signatures { margin-top: 30px; font-size: 10px; }
          body.fuel-log-report-print .fuel-report-signatures > div { min-height: 75px; }
        }
      `}</style>
      <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>
        <Back
          fixed
          blurBG
          title="Fuel Log"
          subtitle={fuelLogs.length}
          extra={
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => {
                  setFuelReportRows(null);
                  setFuelReportOpen(true);
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", border: "1px solid rgba(100, 100, 100, 0.2)", borderRadius: "0.5rem", padding: "0.45rem 0.65rem", background: "white", fontSize: "0.8rem", cursor: "pointer" }}
              >
                <Printer width="1rem" />Report
              </button>
              {/* {!isOnline && (
                  <div style={{
                    padding: "0.5rem 1rem",
                   
                    borderRadius: "0.5rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.8rem",
                    fontWeight: "500",
                    color: "crimson"
                  }}>
                    <RadioTower width={"1rem"} />
                    Offline
                  </div>
                )} */}
              <RefreshButton
                onClick={() => fetchFuelLogs(true)}
                refreshCompleted={refreshCompleted}
                fetchingData={refreshing}
              />
            </div>
          }
        // icon={<Fuel color="orange" width="1.75rem" />}
        />
        <div style={{ padding: "1.25rem", paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}>
          <div style={{ height: "0.75rem" }} />

          <div
            style={{
              position: "sticky",
              top: isMobile ? "4.35rem" : "4.85rem",
              zIndex: 15,
              marginBottom: "1rem",
              marginLeft: "-1.25rem",
              marginRight: "-1.25rem",
              padding: "0.65rem 1.25rem",
              // borderTop: "1px solid rgba(100, 100, 100, 0.12)",
              borderBottom: "1px solid rgba(100, 100, 100, 0.12)",
              background: "rgba(100 100 100/ 1%)",
              WebkitBackdropFilter: "blur(16px)",
              backdropFilter: "blur(16px)",
              boxSizing: "border-box",
            }}
          >
            {/* Charts Carousel Section (collapsible) */}
            <Accordion type="single" collapsible>
              <AccordionItem value="charts">
                <AccordionTrigger
                  style={{
                    border: "",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    height: "2.2rem",
                    paddingLeft: "0.75rem",
                    fontWeight: "600",
                    fontSize: "0.95rem",
                    background: "none",
                    width: "100%",
                    boxSizing: "border-box",
                    paddingTop: "0.5rem",
                    paddingBottom: "0.25rem",
                  }}
                >
                  Stats
                </AccordionTrigger>
                <AccordionContent>
                  <div style={{ borderTop: "1px solid rgba(100, 100, 100, 0.1)", paddingTop: "0.5rem" }}>
                    {isMobile ? (
                      // Mobile: Horizontal scroll with dots
                      <>
                        <div
                          ref={(el) => {
                            if (el) {
                              el.addEventListener('scroll', () => {
                                const scrollPosition = el.scrollLeft;
                                const chartsPerView = Math.round(scrollPosition / el.offsetWidth);
                                setActiveChart(chartsPerView);
                              });
                            }
                          }}
                          style={{ display: "flex", overflowX: "auto", gap: "0", scrollBehavior: "smooth", scrollSnapType: "x mandatory" }}>
                          {/* Monthly Fuel Consumption Chart */}
                          <div style={{ minWidth: "100%", flexShrink: 0, scrollSnapAlign: "start", paddingRight: "0" }}>
                            <div style={{ fontSize: "0.7rem", opacity: 0.6, marginBottom: "0.25rem", fontWeight: 500 }}>Monthly Fuel Consumed</div>
                            <div style={{ height: "96px", width: "100%" }}>
                              <AreaCharter data={monthlyData} dataKey="fuel" lineColor="darkblue" />
                            </div>
                          </div>

                          {/* Monthly Mileage Trend Chart */}
                          <div style={{ minWidth: "100%", flexShrink: 0, scrollSnapAlign: "start", paddingRight: "0" }}>
                            <div style={{ fontSize: "0.7rem", opacity: 0.6, marginBottom: "0.25rem", fontWeight: 500 }}>Mileage Trend</div>
                            <div style={{ height: "96px", width: "100%" }}>
                              <AreaCharter data={monthlyData} dataKey="mileage" lineColor="darkblue" />
                            </div>
                          </div>
                        </div>
                        {/* Dot Indicators */}
                        <div style={{ display: "flex", justifyContent: "center", gap: "0.4rem", marginTop: "0.5rem" }}>
                          <div
                            onClick={() => setActiveChart(0)}
                            style={{
                              width: "0.5rem",
                              height: "0.5rem",
                              borderRadius: "50%",
                              background: activeChart === 0 ? "darkblue" : "rgba(100, 100, 100, 0.3)",
                              cursor: "pointer",
                              transition: "background 0.2s",
                            }}
                          />
                          <div
                            onClick={() => setActiveChart(1)}
                            style={{
                              width: "0.5rem",
                              height: "0.5rem",
                              borderRadius: "50%",
                              background: activeChart === 1 ? "darkblue" : "rgba(100, 100, 100, 0.3)",
                              cursor: "pointer",
                              transition: "background 0.2s",
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      // Desktop: Side by side
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                        {/* Monthly Fuel Consumption Chart */}
                        <div>
                          <div style={{ fontSize: "0.7rem", opacity: 0.6, marginBottom: "0.25rem", fontWeight: 500 }}>Monthly Fuel Consumed</div>
                          <div style={{ height: "96px", width: "100%" }}>
                            <AreaCharter data={monthlyData} dataKey="fuel" lineColor="darkblue" />
                          </div>
                        </div>

                        {/* Monthly Mileage Trend Chart */}
                        <div>
                          <div style={{ fontSize: "0.7rem", opacity: 0.6, marginBottom: "0.25rem", fontWeight: 500 }}>Mileage Trend</div>
                          <div style={{ height: "96px", width: "100%" }}>
                            <AreaCharter data={monthlyData} dataKey="mileage" lineColor="darkblue" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* Fuel Logs List */}
          <div style={{ display: isMobile ? "flex" : "grid", flexDirection: isMobile ? "column" : undefined, gridTemplateColumns: isMobile ? undefined : "repeat(4, 1fr)", gap: "0.75rem", paddingBottom: "5.5rem", paddingTop: "2.5rem" }}>

            {loading ?
              (

                <div style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  minHeight: "70vh",
                  opacity: 0.5
                }}>
                  <Loader2 className="animate-spin" />
                </div>
              ) : fuelLogs.length === 0 ? (
                <div
                  style={{
                    gridColumn: isMobile ? undefined : "1 / -1",
                    display: "flex",
                    position: "absolute",
                    border: "",
                    flex: 1,
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    justifyContent: "center",
                    alignItems: "center",


                  }}
                >
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Fuel />
                      </EmptyMedia>
                      <EmptyTitle>No fuel logs yet</EmptyTitle>
                      <EmptyDescription>
                        Click the + button to add your first fuel log
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              ) : (
                fuelLogs.map((log) => (
                  <Directive
                    subtext={`${log.project ? `Project - ${String(log.project).trim()} · ` : ""}Vehicle - ${log.vehicle_number}`}
                    id_subtitle={moment(log.created_at.todayISO).format("LL")}
                    noArrow
                    tag={log.amount_spent.toFixed(3)}
                    key={log.id}
                    icon={<Fuel color={log.isPending ? "gray" : "darkblue"} />}
                    title={moment(log.date).format("DD MMM YYYY")}
                    onClick={() => {
                      if (!log.isPending) {
                        setSelectedLog(log);
                        setDrawerDetailOpen(true);
                      }
                      else {
                        toast.info("Log will be updated when online")
                      }
                    }}
                    className={log.isPending ? "pending-log" : ""}
                  />
                  // <div
                  //   key={log.id}
                  //   style={{
                  //     background: "rgba(100, 100, 100, 0.1)",
                  //     padding: "1rem",
                  //     borderRadius: "0.75rem",
                  //     border: "1px solid rgba(100, 100, 100, 0.2)",
                  //   }}
                  // >
                  //   <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  //     <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  //       <Fuel width="1.25rem" color="orange" />
                  //       <span style={{ fontWeight: "600", fontSize: "1rem" }}>
                  //         {moment(log.date).format("DD MMM YYYY")}
                  //       </span>
                  //     </div>
                  //     <span style={{ 
                  //       fontSize: "1rem", 
                  //       fontWeight: "700",
                  //       color: "orange"
                  //     }}>
                  //       {log.amount_spent.toFixed(3)} OMR
                  //     </span>
                  //   </div>

                  //   <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.9rem" }}>
                  //     <div>
                  //       <span style={{ opacity: 0.6 }}>Odometer: </span>
                  //       <span style={{ fontWeight: "600" }}>{log.odometer_reading.toLocaleString()} km</span>
                  //     </div>
                  //     <div>
                  //       <span style={{ opacity: 0.6 }}>Vehicle: </span>
                  //       <span style={{ fontWeight: "600" }}>{log.vehicle_number}</span>
                  //     </div>
                  //   </div>
                  // </div>
                ))
              )}
          </div>
        </div>

        {/* Add Button - Full width on mobile, floating on desktop */}
        {/* Add Button - Full width on mobile, floating on desktop */}
        <motion.button
          initial={{ opacity: 0, y: isMobile ? 20 : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.2 }}
          whileTap={{ scale: 0.96 }}
          whileHover={{ scale: isMobile ? 1 : 1.05 }}
          onClick={() => {
            if (!vehicleNumber) {
              setNoVehicleModal(true);
              return;
            }
            setEditingLog(null);
            setDate(moment().format("YYYY-MM-DD"));
            setOdometerReading("");
            setAmountSpent("");
            setDrawerOpen(true);
          }}
          style={{
            transition: "none",
            position: "fixed",
            bottom: isMobile ? "calc(1rem + env(safe-area-inset-bottom, 0px))" : "calc(2rem + env(safe-area-inset-bottom, 0px))",
            right: isMobile ? "1rem" : "1.5rem",
            left: isMobile ? "1rem" : "auto",
            width: isMobile ? "calc(100% - 2rem)" : "3.5rem",
            height: isMobile ? "auto" : "3.5rem",
            padding: isMobile ? "1rem" : "0",
            borderRadius: isMobile ? "0.5rem" : "0.75rem",
            background: "black",
            color: "white",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            fontSize: isMobile ? "1rem" : "inherit",
            fontWeight: isMobile ? "500" : "normal",
            zIndex: 50,
            boxShadow: isMobile ? "0 4px 12px rgba(0, 0, 0, 0.15)" : "none",
            marginBottom: "1rem"
          }}
        >
          <Fuel width="1.25rem" height="1.75rem" strokeWidth={2.5} />
          {isMobile && <span>Log Fuel</span>}
        </motion.button>

      </motion.div>

      {/* No Vehicle Modal */}
      <ResponsiveModal
        open={noVehicleModal}
        onOpenChange={setNoVehicleModal}
        title=""
        description=""
        hideHeader
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "2rem 1.5rem", gap: "1rem", textAlign: "center" }}>
          <div style={{
            width: "3.5rem",
            height: "3.5rem",
            borderRadius: "50%",
            background: "rgba(0,0,139,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <Fuel color="darkblue" width="1.75rem" />
          </div>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 500, letterSpacing: "-0.02em", marginBottom: "0.5rem" }}>No Vehicle Assigned</h2>
            <p style={{ fontSize: "0.9rem", opacity: 0.6, lineHeight: 1.5 }}>
              You don't have a vehicle allocated to you yet. Contact your administrator or submit a request to get a vehicle assigned.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%", marginTop: "0.5rem" }}>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setNoVehicleModal(false);
                toast.info("Vehicle request feature coming soon");
              }}
              style={{
                width: "100%",
                padding: "0.875rem",
                borderRadius: "0.75rem",
                background: "darkblue",
                color: "white",
                border: "none",
                cursor: "pointer",
                fontSize: "0.95rem",
                fontWeight: 500,
              }}
            >
              Request a Vehicle
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setNoVehicleModal(false)}
              style={{
                width: "100%",
                padding: "0.875rem",
                borderRadius: "0.75rem",
                background: "rgba(100,100,100,0.1)",
                border: "none",
                cursor: "pointer",
                fontSize: "0.95rem",
                fontWeight: 500,
              }}
            >
              Close
            </motion.button>
          </div>
        </div>
      </ResponsiveModal>

      {/* Fuel Log Form - Responsive Modal */}
      <ResponsiveModal
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title=""
        description=""
        hideHeader
        contentStyle={{ overflow: "hidden" }}
      >
        <FuelLogFormContent
          date={date}
          vehicleNumber={vehicleNumber}
          odometerReading={odometerReading}
          setOdometerReading={setOdometerReading}
          amountSpent={amountSpent}
          setAmountSpent={setAmountSpent}
          litres={litres}
          setLitres={setLitres}
          project={selectedProject}
          setProject={setSelectedProject}
          projects={projectOptions}
          projectsLoading={projectsLoading}
          setShowDatePicker={setShowDatePicker}
          dateSectionRef={dateSectionRef}
          editingLog={editingLog}
          submitting={submitting}
          userProfile={userProfile}
          handleSubmit={handleSubmit}
          isPrivateVehicle={vehicleRegistrationType === "Private"}
          vehicleCount={allocatedVehicles.length}
          onPrevVehicle={handlePrevVehicle}
          onNextVehicle={handleNextVehicle}
        />
      </ResponsiveModal>

      {/* Detail View - Responsive Modal */}
      {selectedLog && (
        <ResponsiveModal
          open={drawerDetailOpen}
          onOpenChange={setDrawerDetailOpen}
          title=""
          description=""
        >
          <FuelLogDetailContent
            selectedLog={selectedLog}
            handleEdit={handleEdit}
            handleDelete={showDeleteConfirmation}
            isPrivateVehicle={vehicleRegistrationType === "Private"}
          />
        </ResponsiveModal>
      )}

      {/* Date Picker Dialog */}
      <Dialog open={showDatePicker} onOpenChange={setShowDatePicker}>
        <DialogContent style={{ maxWidth: "400px", padding: "1.5rem" }}>
          <DialogHeader>
            <DialogTitle style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Calendar />
              Select Date
            </DialogTitle>
            <DialogDescription></DialogDescription>
          </DialogHeader>

          <div style={{ marginTop: "" }}>
            {/* Quick Actions */}
            {/* <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setDate(moment().format("YYYY-MM-DD"));
                  setShowDatePicker(false);
                }}
                style={{
                  flex: 1,
                  padding: "0.625rem",
                  borderRadius: "0.5rem",
                  background: date === moment().format("YYYY-MM-DD") 
                    ? "orange"
                    : "rgba(100, 100, 100, 0.1)",
                  color: date === moment().format("YYYY-MM-DD") ? "white" : "inherit",
                  border: "none",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Today
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setDate(moment().subtract(1, 'day').format("YYYY-MM-DD"));
                  setShowDatePicker(false);
                }}
                style={{
                  flex: 1,
                  padding: "0.625rem",
                  borderRadius: "0.5rem",
                  background: date === moment().subtract(1, 'day').format("YYYY-MM-DD")
                    ? "orange"
                    : "rgba(100, 100, 100, 0.1)",
                  color: date === moment().subtract(1, 'day').format("YYYY-MM-DD") ? "white" : "inherit",
                  border: "none",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Yesterday
              </motion.button>
            </div> */}

            {/* Month Navigation */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => setViewingMonth(viewingMonth.clone().subtract(1, 'month'))}
                style={{
                  padding: "0.5rem",
                  borderRadius: "0.5rem",
                  background: "rgba(100, 100, 100, 0.1)",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <ChevronLeft width="1.25rem" height="1.25rem" />
              </motion.button>
              <span style={{ fontWeight: "600", fontSize: "1rem" }}>
                {viewingMonth.format("MMMM YYYY")}
              </span>
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => setViewingMonth(viewingMonth.clone().add(1, 'month'))}
                disabled={viewingMonth.clone().add(1, 'month').isAfter(moment(), 'month')}
                style={{
                  padding: "0.5rem",
                  borderRadius: "0.5rem",
                  background: viewingMonth.clone().add(1, 'month').isAfter(moment(), 'month') ? "rgba(100, 100, 100, 0.05)" : "rgba(100, 100, 100, 0.1)",
                  border: "none",
                  cursor: viewingMonth.clone().add(1, 'month').isAfter(moment(), 'month') ? "not-allowed" : "pointer",
                  opacity: viewingMonth.clone().add(1, 'month').isAfter(moment(), 'month') ? 0.3 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <ChevronRight width="1.25rem" height="1.25rem" />
              </motion.button>
            </div>

            {/* Weekday Headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.25rem", marginBottom: "0.5rem" }}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                <div key={i} style={{ textAlign: "center", fontSize: "0.75rem", fontWeight: "600", opacity: 0.6, padding: "0.25rem" }}>
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.25rem" }}>
              {(() => {
                const startOfMonth = viewingMonth.clone().startOf('month');
                const endOfMonth = viewingMonth.clone().endOf('month');
                const startDay = startOfMonth.day();
                const daysInMonth = endOfMonth.date();
                const days = [];

                // Empty cells before month starts
                for (let i = 0; i < startDay; i++) {
                  days.push(<div key={`empty-${i}`} />);
                }

                // Days of the month
                for (let day = 1; day <= daysInMonth; day++) {
                  const currentDate = viewingMonth.clone().date(day);
                  const dateString = currentDate.format("YYYY-MM-DD");
                  const isSelected = dateString === date;
                  const isToday = currentDate.isSame(moment(), 'day');
                  const isFuture = currentDate.isAfter(moment(), 'day');

                  days.push(
                    <motion.button
                      key={day}
                      type="button"
                      whileTap={{ scale: isFuture ? 1 : 0.9 }}
                      onClick={() => {
                        if (!isFuture) {
                          setDate(dateString);
                          setShowDatePicker(false);
                        }
                      }}
                      disabled={isFuture}
                      style={{
                        padding: "0.625rem 0.25rem",
                        borderRadius: "0.5rem",
                        background: isSelected
                          ? "orange"
                          : isToday
                            ? "rgba(255, 140, 0, 0.15)"
                            : "rgba(100, 100, 100, 0.05)",
                        color: isSelected ? "white" : isFuture ? "rgba(100, 100, 100, 0.3)" : "inherit",
                        // border: isToday && !isSelected ? "1px solid rgba(255, 140, 0, 0.5)" : "1px solid transparent",
                        cursor: isFuture ? "not-allowed" : "pointer",
                        fontSize: "0.875rem",
                        fontWeight: isSelected || isToday ? "700" : "500",
                        transition: "all 0.2s"
                      }}
                    >
                      {day}
                    </motion.button>
                  );
                }

                return days;
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={fuelReportOpen} onOpenChange={setFuelReportOpen}>
        <DialogContent style={{ width: "min(96vw, 1200px)", maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto", padding: "1rem" }}>
          <DialogHeader>
            <DialogTitle>Fuel Log Report</DialogTitle>
            <DialogDescription>Select an employee and date range to preview and print the reimbursement report.</DialogDescription>
          </DialogHeader>
          <div className="fuel-report-filters">
            <label>Employee
              <select
                value={fuelReportEmployeeId}
                onChange={(event) => { setFuelReportEmployeeId(event.target.value); setFuelReportRows(null); }}
                disabled={fuelReportEmployeesLoading || (userData?.role !== "admin" && !fuelReportEmployees.length)}
              >
                {userData?.role === "admin" && <option value="ALL">All employees</option>}
                {reportEmployeesForCurrentUser.map((employee) => <option key={employee.empId} value={employee.empId}>{employee.name}</option>)}
              </select>
            </label>
            <label>From date
              <input type="date" value={fuelReportFromDate} onChange={(event) => { setFuelReportFromDate(event.target.value); setFuelReportRows(null); }} />
            </label>
            <label>To date
              <input type="date" value={fuelReportToDate} onChange={(event) => { setFuelReportToDate(event.target.value); setFuelReportRows(null); }} />
            </label>
            <button type="button" onClick={() => void loadFuelReport()} disabled={fuelReportLoading || fuelReportEmployeesLoading || (userData?.role !== "admin" && !fuelReportEmployees.length)}>
              {fuelReportLoading ? <Loader2 className="animate-spin" width="1rem" /> : null}View Report
            </button>
            <button type="button" onClick={printFuelReport} disabled={!fuelReportRows?.length} className="fuel-report-print-button">
              <Printer width="1rem" />Print
            </button>
          </div>
          {fuelReportRows === null ? (
            <p className="fuel-report-empty">Choose the filters and select View Report.</p>
          ) : fuelReportRows.length ? (
            <FuelLogPrintableReport
              rows={fuelReportRows}
              employees={fuelReportEmployees}
              fromDate={fuelReportFromDate}
              toDate={fuelReportToDate}
            />
          ) : (
            <p className="fuel-report-empty">No fuel log records were found for the selected filters.</p>
          )}
        </DialogContent>
      </Dialog>

      <DefaultDialog
        open={deleteConfirmDialog}
        onCancel={() => setDeleteConfirmDialog(false)}
        title="Delete Fuel Log?"
        desc="This action cannot be undone."
        OkButtonText="Delete"
        CancelButtonText="Cancel"
        onOk={handleDelete}
        updating={deleting}
        disabled={deleting}
      />
      {fuelReportRows?.length ? (
        <FuelLogPrintableReport
          rows={fuelReportRows}
          employees={fuelReportEmployees}
          fromDate={fuelReportFromDate}
          toDate={fuelReportToDate}
          printOnly
        />
      ) : null}
    </>
  );
}
