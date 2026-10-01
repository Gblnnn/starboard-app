import Back from "@/components/back";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { supabase } from "@/lib/supabase";
import { Clock3, Loader2, MapPinned } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type PunchLogItem = {
  id: string;
  user_id: string;
  punch_time: string;
  punch_type: number; // 0 = In, 1 = Out
  device_serial: string;
  mobile_location?: string;
  // joined from employees
  employee_name?: string;
  employee_code?: string;
  email?: string;
};

const getMapUrl = (locationStr?: string): string | null => {
  if (!locationStr) return null;
  // Location may be "lat, lng" or "lat, lng @ Place Name"
  const coordPart = locationStr.split("@")[0].trim();
  const parts = coordPart.split(",");
  if (parts.length < 2) return null;
  const lat = parseFloat(parts[0].trim());
  const lng = parseFloat(parts[1].trim());
  if (isNaN(lat) || isNaN(lng)) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
};

const formatLocation = (locationStr?: string): string | null => {
  if (!locationStr) return null;
  // If it contains " @ Place", show that
  const atIdx = locationStr.indexOf("@");
  if (atIdx !== -1) return locationStr.substring(atIdx + 1).trim();
  return locationStr.trim();
};

export default function ShiftLogs() {
  const [logs, setLogs] = useState<PunchLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const fetchPunchLogs = async () => {
    try {
      setLoading(true);

      // Fetch punches joined with employees via device_user_id = user_id
      const { data, error } = await supabase
        .from("punches")
        .select(`
          id,
          user_id,
          punch_time,
          punch_type,
          device_serial,
          mobile_location,
          employees!inner (
            name,
            emp_id,
            email
          )
        `)
        .eq("verify_type", 5)
        .order("punch_time", { ascending: false })
        .limit(500);

      if (error) throw error;

      const mapped: PunchLogItem[] = (data || []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        punch_time: row.punch_time,
        punch_type: row.punch_type,
        device_serial: row.device_serial,
        mobile_location: row.mobile_location,
        employee_name: row.employees?.name || "Unknown",
        employee_code: row.employees?.emp_id || row.user_id,
        email: row.employees?.email || "-",
      }));

      setLogs(mapped);
    } catch (error) {
      console.error("Error fetching mobile punch logs:", error);
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : String(error);
      toast.error(`Failed to fetch mobile punching logs: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPunchLogs();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const applyMatch = () => setIsDesktop(mediaQuery.matches);
    applyMatch();
    mediaQuery.addEventListener("change", applyMatch);
    return () => mediaQuery.removeEventListener("change", applyMatch);
  }, []);

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "0.75rem",
    fontWeight: 600,
    fontSize: "0.8rem",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    position: isDesktop ? "sticky" : "static",
    top: 0,
    zIndex: 5,
    background: "#f1f3f5",
    borderBottom: "1px solid rgba(100,100,100,0.2)",
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "0.75rem",
    verticalAlign: "middle",
    fontSize: "0.875rem",
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>
        <div style={{ padding: "", position: "fixed", zIndex: 20 }}>
          <Back
            blurBG
            fixed
            title="Mobile Punching Logs"
            subtitle={logs.length}
          />
        </div>

        <div
          style={{
            paddingTop: "6rem",
            paddingLeft: "1.25rem",
            paddingRight: "1.25rem",
            paddingBottom: "8rem",
            minHeight: "100svh",
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
          }}
        >
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "70vh" }}>
              <Loader2 className="animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "70vh" }}>
              <Empty>
                <EmptyHeader>
                  <EmptyMedia>
                    <Clock3 />
                  </EmptyMedia>
                  <EmptyTitle>No Mobile Punching Logs</EmptyTitle>
                  <EmptyDescription>No mobile punch records found.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <div
              style={{
                border: "1px solid rgba(100,100,100,0.2)",
                borderRadius: "0.75rem",
                background: "rgba(100,100,100,0.04)",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                flex: 1,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  overflowX: "auto",
                  overflowY: isDesktop ? "auto" : "visible",
                  minHeight: 0,
                  flex: 1,
                }}
              >
                <table style={{ width: "100%", minWidth: "900px", borderCollapse: "separate", borderSpacing: 0, background: "#fff" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Employee</th>
                      <th style={thStyle}>Emp ID</th>
                      <th style={thStyle}>Email</th>
                      <th style={thStyle}>Punch Time</th>
                      <th style={thStyle}>Type</th>
                      <th style={thStyle}>Device</th>
                      <th style={thStyle}>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => {
                      const punchDate = log.punch_time ? new Date(log.punch_time) : null;
                      const mapUrl = getMapUrl(log.mobile_location);
                      const locationLabel = formatLocation(log.mobile_location);
                      const isIn = log.punch_type === 0;

                      return (
                        <tr key={log.id} style={{ borderTop: "1px solid rgba(100,100,100,0.1)" }}>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>
                            {log.employee_name}
                          </td>
                          <td style={{ ...tdStyle, opacity: 0.75 }}>
                            {log.employee_code || "-"}
                          </td>
                          <td style={{ ...tdStyle, opacity: 0.75 }}>
                            {log.email || "-"}
                          </td>
                          <td style={tdStyle}>
                            {punchDate ? punchDate.toLocaleString("en-GB", {
                              day: "2-digit", month: "short", year: "numeric",
                              hour: "2-digit", minute: "2-digit", second: "2-digit",
                            }) : "-"}
                          </td>
                          <td style={tdStyle}>
                            <span style={{
                              display: "inline-block",
                              padding: "0.2rem 0.6rem",
                              borderRadius: "0.4rem",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              background: isIn ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)",
                              color: isIn ? "rgb(22,163,74)" : "rgb(220,38,38)",
                            }}>
                              {isIn ? "IN" : "OUT"}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, opacity: 0.6, fontSize: "0.8rem" }}>
                            {log.device_serial || "-"}
                          </td>
                          <td style={tdStyle}>
                            {mapUrl && locationLabel ? (
                              <a
                                href={mapUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.35rem",
                                  color: "mediumslateblue",
                                  textDecoration: "underline",
                                  fontSize: "0.85rem",
                                }}
                              >
                                <MapPinned width={14} height={14} />
                                {locationLabel}
                              </a>
                            ) : (
                              <span style={{ opacity: 0.4, fontSize: "0.85rem" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
