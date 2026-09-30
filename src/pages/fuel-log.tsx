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
import { Calendar, ChevronLeft, ChevronRight, DollarSign, EllipsisVertical, Fuel, Gauge, Loader2, WifiOff } from "lucide-react";
import moment from "moment";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
  const { addProcess, updateProcess } = useBackgroundProcess();
  const vehicleNumber: string | undefined =
    (allocatedVehicles[selectedVehicleIndex]?.vehicle_number) ||
    (userProfile?.allocated_vehicle) ||
    undefined;

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

    const vehicleNumber = allocatedVehicles[selectedVehicleIndex]?.vehicle_number
      || userProfile?.allocated_vehicle;

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
          vehicle_number: vehicleNumber,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("fuel_log")
          .update(fuelLogData)
          .eq("id", editingLog.id);
        if (error) throw error;
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
          employee_code: userProfile.employeeCode || "",
          vehicle_number: vehicleNumber,
          timestamp: Date.now(),
        };

        if (isOnline) {
          // Save directly to Supabase
          const { error } = await supabase
            .from("fuel_log")
            .insert({
              ...fuelLogData,
              created_at: new Date().toISOString(),
            });
          if (error) throw error;
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
      setDrawerOpen(false);
      setEditingLog(null);
    } catch (error) {
      console.error("Error submitting fuel log:", error);
      toast.error(editingLog ? "Failed to update fuel log" : "Failed to submit fuel log");
    } finally {
      setSubmitting(false);
    }
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
    setEditingLog(selectedLog);

    // Close detail drawer and open edit drawer
    setDrawerDetailOpen(false);
    setDrawerOpen(true);
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>
        <Back
          fixed
          blurBG
          title="Fuel Log"
          subtitle={fuelLogs.length}
          extra={
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
                    subtext={"Vehicle - " + log.vehicle_number}
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
    </>
  );
}
