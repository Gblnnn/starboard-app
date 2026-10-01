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

const getMuscatDateKey = (dateValue: string | Date): string => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Muscat",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(dateValue));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getCurrentMonthKey = (): string => getMuscatDateKey(new Date()).slice(0, 7);

const getMonthRange = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  const muscatOffsetMs = 4 * 60 * 60 * 1000;
  return {
    start: new Date(Date.UTC(year, month - 1, 1) - muscatOffsetMs).toISOString(),
    end: new Date(Date.UTC(year, month, 1) - muscatOffsetMs).toISOString(),
  };
};

const getRecentMonths = (count: number): { value: string; label: string }[] => {
  const [year, month] = getCurrentMonthKey().split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return {
      value,
      label: date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
    };
  });
};

export default function ShiftLogs() {
  const [logs, setLogs] = useState<PunchLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey);
  const [selectedDate, setSelectedDate] = useState("all");
  const monthOptions = getRecentMonths(24);

  const filteredLogs = logs.filter((log) =>
    (selectedUserId === "all" || log.user_id === selectedUserId) &&
    (selectedDate === "all" || getMuscatDateKey(log.punch_time) === selectedDate)
  );

  const employeeOptions = Array.from(
    new Map(logs.map((log) => [log.user_id, log])).values()
  ).sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""));

  const dateOptions = Array.from(new Set(logs.map((log) => getMuscatDateKey(log.punch_time)))).sort(
    (a, b) => b.localeCompare(a)
  );
  const filterSelectStyle: React.CSSProperties = {
    maxWidth: "100%",
    padding: "0.25rem",
    border: "1px solid rgba(100,100,100,0.25)",
    borderRadius: "0.25rem",
    background: "#fff",
    fontSize: "0.75rem",
    fontWeight: 400,
    textTransform: "none",
  };

  useEffect(() => {
    let cancelled = false;

    const fetchPunchLogs = async () => {
      try {
        setLoading(true);

        const pageSize = 500;
        const rows: any[] = [];
        const monthRange = selectedMonth === "all" ? null : getMonthRange(selectedMonth);
        let offset = 0;

        while (!cancelled) {
          let query = supabase
            .from("punches")
            .select("id, user_id, punch_time, punch_type, device_serial, mobile_location")
            .eq("verify_type", 5)
            .order("punch_time", { ascending: false })
            .range(offset, offset + pageSize - 1);

          if (monthRange) {
            query = query.gte("punch_time", monthRange.start).lt("punch_time", monthRange.end);
          }

          const { data, error } = await query;
          if (error) throw error;

          const page = data || [];
          rows.push(...page);
          if (page.length < pageSize) break;
          offset += pageSize;
        }

        if (cancelled) return;

        const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
        const employeesByUserId: Record<string, any> = {};
        const employeeBatchSize = 500;

        for (let index = 0; index < userIds.length; index += employeeBatchSize) {
          const { data: employees, error: employeesError } = await supabase
            .from("employees")
            .select("device_user_id, name, emp_id, email")
            .in("device_user_id", userIds.slice(index, index + employeeBatchSize));

          if (employeesError) throw employeesError;

          for (const employee of employees || []) {
            employeesByUserId[employee.device_user_id] = employee;
          }
        }

        if (cancelled) return;

        setLogs(rows.map((row) => {
          const employee = employeesByUserId[row.user_id];
          return {
            id: row.id,
            user_id: row.user_id,
            punch_time: row.punch_time,
            punch_type: row.punch_type,
            device_serial: row.device_serial,
            mobile_location: row.mobile_location,
            employee_name: employee?.name || "Unknown",
            employee_code: employee?.emp_id || row.user_id,
            email: employee?.email || "-",
          };
        }));
      } catch (error) {
        if (cancelled) return;
        console.error("Error fetching mobile punch logs:", error);
        const message =
          typeof error === "object" && error !== null && "message" in error
            ? String(error.message)
            : String(error);
        toast.error(`Failed to fetch mobile punching logs: ${message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchPunchLogs();
    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

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
            subtitle={filteredLogs.length}
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
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              gap: "0.75rem",
              padding: "0.75rem",
              border: "1px solid rgba(100,100,100,0.2)",
              borderRadius: "0.5rem",
              background: "#fff",
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.75rem", fontWeight: 600 }}>
              Employee
              <select
                aria-label="Filter by employee"
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                style={filterSelectStyle}
              >
                <option value="all">All employees</option>
                {employeeOptions.map((employee) => (
                  <option key={employee.user_id} value={employee.user_id}>
                    {employee.employee_name} ({employee.employee_code})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.75rem", fontWeight: 600 }}>
              Month
              <select
                aria-label="Filter by month"
                value={selectedMonth}
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                  setSelectedUserId("all");
                  setSelectedDate("all");
                }}
                style={filterSelectStyle}
              >
                <option value="all">All months</option>
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>{month.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.75rem", fontWeight: 600 }}>
              Date
              <select
                aria-label="Filter by date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                style={filterSelectStyle}
              >
                <option value="all">All dates</option>
                {dateOptions.map((date) => <option key={date} value={date}>{date}</option>)}
              </select>
            </label>
          </div>

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "70vh" }}>
              <Loader2 className="animate-spin" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "70vh" }}>
              <Empty>
                <EmptyHeader>
                  <EmptyMedia>
                    <Clock3 />
                  </EmptyMedia>
                  <EmptyTitle>{logs.length === 0 ? "No Mobile Punching Logs" : "No Matching Punches"}</EmptyTitle>
                  <EmptyDescription>
                    {logs.length === 0 ? "No mobile punch records found for this month." : "Try changing the selected filters."}
                  </EmptyDescription>
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
                    {filteredLogs.map((log) => {
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
