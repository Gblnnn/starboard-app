import Back from "@/components/back";
import RefreshButton from "@/components/refresh-button";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/firebase";
import { getCachedProfile } from "@/utils/profileCache";
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { ClipboardList, Clock, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export default function Tasks() {
    const [tasks] = useState<any[]>([]);
    const [startingShift, setStartingShift] = useState(false);
    const [endingShift, setEndingShift] = useState(false);
    const [checkingShift, setCheckingShift] = useState(false);
    const [refreshCompleted, setRefreshCompleted] = useState(false);
    const [hasStartedShift, setHasStartedShift] = useState(false);
    const [shiftStartTimeMs, setShiftStartTimeMs] = useState<number | null>(null);
    const [activeShiftLogId, setActiveShiftLogId] = useState<string | null>(null);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [holdProgress, setHoldProgress] = useState(0);
    const [isHolding, setIsHolding] = useState(false);
    const [endShiftModalOpen, setEndShiftModalOpen] = useState(false);
    const [endHoldProgress, setEndHoldProgress] = useState(0);
    const [isEndHolding, setIsEndHolding] = useState(false);
    const { userData } = useAuth();
    const holdStartRef = useRef(0);
    const holdTimeoutRef = useRef<number | null>(null);
    const progressRafRef = useRef<number | null>(null);
    const holdTriggeredRef = useRef(false);
    const endHoldStartRef = useRef(0);
    const endHoldTimeoutRef = useRef<number | null>(null);
    const endProgressRafRef = useRef<number | null>(null);
    const endHoldTriggeredRef = useRef(false);
    const SHIFT_START_CACHE_KEY = "shift-start-cache-v1";

    const HOLD_DURATION_MS = 3000;
    const END_HOLD_DURATION_MS = 2000;
    const ringSize = 240;
    const ringStroke = 10;
    const ringRadius = (ringSize - ringStroke) / 2;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const ringDashOffset = ringCircumference - (holdProgress / 100) * ringCircumference;

    const formatElapsed = (elapsedMs: number) => {
        const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    };

    const elapsedLabel = hasStartedShift && shiftStartTimeMs
        ? `${formatElapsed(nowMs - shiftStartTimeMs)}`
        : null;

    const readCachedShiftStart = (email: string): { shiftStartTimeMs: number; shiftLogId?: string | null } | null => {
        try {
            const raw = localStorage.getItem(SHIFT_START_CACHE_KEY);
            if (!raw) return null;

            const parsed = JSON.parse(raw) as { email?: string; shiftStartTimeMs?: number; shiftLogId?: string | null };
            if (!parsed || parsed.email !== email || typeof parsed.shiftStartTimeMs !== "number") {
                return null;
            }

            const startedToday = new Date(parsed.shiftStartTimeMs).toDateString() === new Date().toDateString();
            return startedToday
                ? { shiftStartTimeMs: parsed.shiftStartTimeMs, shiftLogId: parsed.shiftLogId || null }
                : null;
        } catch {
            return null;
        }
    };

    const writeCachedShiftStart = (email: string, shiftStartMs: number, shiftLogId?: string | null) => {
        try {
            localStorage.setItem(
                SHIFT_START_CACHE_KEY,
                JSON.stringify({ email, shiftStartTimeMs: shiftStartMs, shiftLogId: shiftLogId || null, cachedAt: Date.now() })
            );
        } catch {
            // Ignore storage errors and continue without local cache.
        }
    };

    const clearCachedShiftStart = () => {
        try {
            localStorage.removeItem(SHIFT_START_CACHE_KEY);
        } catch {
            // Ignore storage errors and continue.
        }
    };

    const getCurrentLocation = () =>
        new Promise<{ latitude: number; longitude: number; accuracy: number }>((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error("Geolocation is not supported on this device."));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                    });
                },
                (error) => {
                    reject(new Error(error.message || "Unable to get current location."));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0,
                }
            );
        });

    const handleStartShift = async () => {
        const profile = getCachedProfile();
        const cacheEmail = userData?.email || profile?.email || "";
        let capturedStartTimeMs: number | null = null;

        try {
            setStartingShift(true);
            const location = await getCurrentLocation();
            const now = new Date();
            capturedStartTimeMs = now.getTime();

            const shiftLogRef = await addDoc(collection(db, "shift-logs"), {
                employee_name: profile?.name || userData?.name || "",
                employee_code: profile?.emp_id || userData?.emp_id || "",
                email: userData?.email || profile?.email || "",
                shift_start_time: now,
                shift_start_time_iso: now.toISOString(),
                shift_start_coordinate: location,
                shift_end_coordinate: null,
                shift_end_time: null,
                shift_end_time_iso: null,
                // Keep the existing `location` field for backward compatibility in existing views.
                location,
                created_at: now,
            });

            setHasStartedShift(true);
            setShiftStartTimeMs(now.getTime());
            setActiveShiftLogId(shiftLogRef.id);
            if (cacheEmail) {
                writeCachedShiftStart(cacheEmail, now.getTime(), shiftLogRef.id);
            }
            toast.success("Shift start logged successfully");
        } catch (error) {
            console.error("Error starting shift:", error);

            // If network write fails but we already captured a start timestamp, keep shift active locally.
            if (capturedStartTimeMs && cacheEmail && !navigator.onLine) {
                setHasStartedShift(true);
                setShiftStartTimeMs(capturedStartTimeMs);
                setActiveShiftLogId(null);
                writeCachedShiftStart(cacheEmail, capturedStartTimeMs, null);
                toast.warning("Shift started offline. It will sync when online.");
            } else {
                toast.error(error instanceof Error ? error.message : "Failed to log shift start");
            }
        } finally {
            setStartingShift(false);
            setIsHolding(false);
            setHoldProgress(0);
        }
    };

    const handleEndShift = async (): Promise<boolean> => {
        if (!hasStartedShift) return false;

        if (!activeShiftLogId) {
            toast.error("Shift log is not synced yet. Connect to internet and refresh before ending shift.");
            return false;
        }

        try {
            setEndingShift(true);
            const location = await getCurrentLocation();
            const now = new Date();

            await updateDoc(doc(db, "shift-logs", activeShiftLogId), {
                shift_end_coordinate: location,
                shift_end_time: now,
                shift_end_time_iso: now.toISOString(),
                updated_at: now,
            });

            setHasStartedShift(false);
            setShiftStartTimeMs(null);
            setActiveShiftLogId(null);
            clearCachedShiftStart();
            toast.success("Shift ended successfully");
            return true;
        } catch (error) {
            console.error("Error ending shift:", error);
            toast.error(error instanceof Error ? error.message : "Failed to end shift");
            return false;
        } finally {
            setEndingShift(false);
        }
    };

    const stopHoldTracking = () => {
        if (holdTimeoutRef.current !== null) {
            window.clearTimeout(holdTimeoutRef.current);
            holdTimeoutRef.current = null;
        }

        if (progressRafRef.current !== null) {
            window.cancelAnimationFrame(progressRafRef.current);
            progressRafRef.current = null;
        }
    };

    const handleHoldStart = () => {
        if (startingShift || hasStartedShift || checkingShift) return;

        holdTriggeredRef.current = false;
        holdStartRef.current = performance.now();
        setIsHolding(true);
        setHoldProgress(0);

        const tick = () => {
            const elapsed = performance.now() - holdStartRef.current;
            const progress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
            setHoldProgress(progress);

            if (progress < 100 && !holdTriggeredRef.current) {
                progressRafRef.current = window.requestAnimationFrame(tick);
            }
        };

        progressRafRef.current = window.requestAnimationFrame(tick);
        holdTimeoutRef.current = window.setTimeout(async () => {
            holdTriggeredRef.current = true;
            setHoldProgress(100);
            await handleStartShift();
        }, HOLD_DURATION_MS);
    };

    const handleHoldEnd = () => {
        stopHoldTracking();
        setIsHolding(false);

        if (!holdTriggeredRef.current && !startingShift) {
            setHoldProgress(0);
        }
    };

    const stopEndHoldTracking = () => {
        if (endHoldTimeoutRef.current !== null) {
            window.clearTimeout(endHoldTimeoutRef.current);
            endHoldTimeoutRef.current = null;
        }

        if (endProgressRafRef.current !== null) {
            window.cancelAnimationFrame(endProgressRafRef.current);
            endProgressRafRef.current = null;
        }
    };

    const resetEndHoldState = () => {
        stopEndHoldTracking();
        setIsEndHolding(false);
        endHoldTriggeredRef.current = false;
        setEndHoldProgress(0);
    };

    const handleEndHoldStart = () => {
        if (endingShift || !hasStartedShift) return;

        endHoldTriggeredRef.current = false;
        endHoldStartRef.current = performance.now();
        setIsEndHolding(true);
        setEndHoldProgress(0);

        const tick = () => {
            const elapsed = performance.now() - endHoldStartRef.current;
            const progress = Math.min(100, (elapsed / END_HOLD_DURATION_MS) * 100);
            setEndHoldProgress(progress);

            if (progress < 100 && !endHoldTriggeredRef.current) {
                endProgressRafRef.current = window.requestAnimationFrame(tick);
            }
        };

        endProgressRafRef.current = window.requestAnimationFrame(tick);
        endHoldTimeoutRef.current = window.setTimeout(async () => {
            endHoldTriggeredRef.current = true;
            setEndHoldProgress(100);
            const success = await handleEndShift();
            if (success) {
                setEndShiftModalOpen(false);
            }
            resetEndHoldState();
        }, END_HOLD_DURATION_MS);
    };

    const handleEndHoldEnd = () => {
        stopEndHoldTracking();
        setIsEndHolding(false);

        if (!endHoldTriggeredRef.current && !endingShift) {
            setEndHoldProgress(0);
        }
    };

    const checkShiftStatus = async (showRefreshCompleted = false) => {
        const profile = getCachedProfile();
        const email = userData?.email || profile?.email;

        if (!email) {
            setHasStartedShift(false);
            setShiftStartTimeMs(null);
            setActiveShiftLogId(null);
            clearCachedShiftStart();
            return;
        }

        // Hydrate immediately from local cache so shift state is available offline.
        const cachedShift = readCachedShiftStart(email);
        if (cachedShift) {
            setHasStartedShift(true);
            setShiftStartTimeMs(cachedShift.shiftStartTimeMs);
            setActiveShiftLogId(cachedShift.shiftLogId || null);
        }

        try {
            setCheckingShift(true);
            const snap = await getDocs(query(collection(db, "shift-logs"), where("email", "==", email)));

            let latestOpenShiftStartTimeMs = 0;
            let latestOpenShiftDocId: string | null = null;

            snap.forEach((d) => {
                const data = d.data() as any;
                let shiftTime: Date | null = null;
                let shiftEndTime: Date | null = null;

                if (data.shift_start_time?.toDate) {
                    shiftTime = data.shift_start_time.toDate();
                } else if (typeof data.shift_start_time === "string") {
                    shiftTime = new Date(data.shift_start_time);
                } else if (data.shift_start_time instanceof Date) {
                    shiftTime = data.shift_start_time;
                } else if (typeof data.shift_start_time_iso === "string") {
                    shiftTime = new Date(data.shift_start_time_iso);
                }

                if (data.shift_end_time?.toDate) {
                    shiftEndTime = data.shift_end_time.toDate();
                } else if (typeof data.shift_end_time === "string") {
                    shiftEndTime = new Date(data.shift_end_time);
                } else if (data.shift_end_time instanceof Date) {
                    shiftEndTime = data.shift_end_time;
                } else if (typeof data.shift_end_time_iso === "string") {
                    shiftEndTime = new Date(data.shift_end_time_iso);
                }

                if (shiftTime && !Number.isNaN(shiftTime.getTime())) {
                    const shiftMs = shiftTime.getTime();
                    const isOpenShift = !shiftEndTime || Number.isNaN(shiftEndTime.getTime());
                    if (isOpenShift && shiftMs > latestOpenShiftStartTimeMs) {
                        latestOpenShiftStartTimeMs = shiftMs;
                        latestOpenShiftDocId = d.id;
                    }
                }
            });

            const todayString = new Date().toDateString();
            const startedToday = latestOpenShiftStartTimeMs > 0
                ? new Date(latestOpenShiftStartTimeMs).toDateString() === todayString
                : false;
            setHasStartedShift(startedToday);
            setShiftStartTimeMs(startedToday ? latestOpenShiftStartTimeMs : null);
            setActiveShiftLogId(startedToday ? latestOpenShiftDocId : null);

            if (startedToday) {
                writeCachedShiftStart(email, latestOpenShiftStartTimeMs, latestOpenShiftDocId);
            } else {
                clearCachedShiftStart();
            }

            if (showRefreshCompleted) {
                setRefreshCompleted(true);
                setTimeout(() => setRefreshCompleted(false), 900);
            }
        } catch (error) {
            console.error("Error checking shift status:", error);
            const offlineShift = readCachedShiftStart(email);
            setHasStartedShift(Boolean(offlineShift?.shiftStartTimeMs));
            setShiftStartTimeMs(offlineShift?.shiftStartTimeMs || null);
            setActiveShiftLogId(offlineShift?.shiftLogId || null);
        } finally {
            setCheckingShift(false);
        }
    };

    useEffect(() => {
        checkShiftStatus();
    }, [userData?.email]);

    useEffect(() => {
        return () => {
            stopHoldTracking();
            stopEndHoldTracking();
        };
    }, []);

    useEffect(() => {
        if (!hasStartedShift || !shiftStartTimeMs) return;

        setNowMs(Date.now());
        const intervalId = window.setInterval(() => {
            setNowMs(Date.now());
        }, 1000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [hasStartedShift, shiftStartTimeMs]);

    return (
        <>
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>
                <div style={{ padding: "", position: "fixed", zIndex: 20 }}>
                    <Back
                    noback
                        blurBG
                        subtitle={tasks.length}
                        extra={
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                
                                {elapsedLabel ? (
                                    <button
                                        onClick={() => {
                                            if (!endingShift) {
                                                setEndShiftModalOpen(true);
                                            }
                                        }}
                                        disabled={endingShift}
                                        style={{
                                            display:"flex",
                                            alignItems:"center",
                                            justifyContent:"center",
                                            border: "none",
                                            margin: 0,
                                            cursor: endingShift ? "not-allowed" : "pointer",
                                            fontSize: "0.8rem",
                                            padding: "0.4rem 0.75rem",
                                            borderRadius: "0.5rem",
                                            background: "rgba(100 100 100 / 0.1)",
                                            fontWeight: 500,
                                            letterSpacing: "0.02em",
                                            color: "darkslategrey",
                                            width:"7.5rem"
                                        }}
                                    >
                                        <Clock size={15} style={{border:"", width:"1rem"}}/>
                                        <p style={{width:"4rem", border:"", fontSize:"0.9rem"}}>
                                            {elapsedLabel}
                                        </p>
                                    </button>
                                ) : null}
                                <RefreshButton
                                    fetchingData={checkingShift}
                                    refreshCompleted={refreshCompleted}
                                    onClick={() => checkShiftStatus(true)}
                                />
                            </div>
                        }
                        fixed
                        // icon={<ClipboardList color="darkslategrey" />}
                        title={"Tasks"}
                        // fontFamily="'Britney', cursive"
                        fontSize="1.75rem"
                    />
                </div>

                <div
                    style={{
                        border: "",
                        paddingTop: "6rem",
                        paddingLeft: "1.25rem",
                        paddingRight: "1.25rem",
                        paddingBottom: "8rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem",
                        minHeight: "100svh",
                    }}
                >
                    {!hasStartedShift ? (
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                flexDirection: "column",
                                gap: "1.5rem",
                                height: "70vh",
                            }}
                        >
                            <div
                                style={{
                                    width: `${ringSize}px`,
                                    height: `${ringSize}px`,
                                    position: "relative",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <svg
                                    width={ringSize}
                                    height={ringSize}
                                    style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}
                                >
                                    <circle
                                        cx={ringSize / 2}
                                        cy={ringSize / 2}
                                        r={ringRadius}
                                        fill="none"
                                        stroke="rgba(100,100,100,0.25)"
                                        strokeWidth={ringStroke}
                                    />
                                    <circle
                                        cx={ringSize / 2}
                                        cy={ringSize / 2}
                                        r={ringRadius}
                                        fill="none"
                                        stroke={isHolding ? "crimson" : "rgba(100,100,100,0.3)"}
                                        strokeWidth={ringStroke}
                                        strokeLinecap="round"
                                        strokeDasharray={ringCircumference}
                                        strokeDashoffset={ringDashOffset}
                                        style={{ transition: isHolding ? "none" : "stroke-dashoffset 0.2s ease" }}
                                    />
                                </svg>

                                <motion.button
                                    whileTap={{ scale: 0.98 }}
                                    onPointerDown={handleHoldStart}
                                    onPointerUp={handleHoldEnd}
                                    onPointerLeave={handleHoldEnd}
                                    onPointerCancel={handleHoldEnd}
                                    disabled={startingShift || checkingShift}
                                    style={{
                                        width: "210px",
                                        height: "210px",
                                        borderRadius: "50%",
                                        border: "none",
                                        cursor: startingShift || checkingShift ? "not-allowed" : "pointer",
                                        background: "darkblue",
                                        color: "white",
                                        boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: "3rem",
                                        fontWeight: 500,
                                        letterSpacing: "0.03em",
                                        userSelect: "none",
                                        position: "relative",
                                        zIndex: 1,
                                        opacity: checkingShift ? 0.8 : 1,
                                    }}
                                >
                                    {startingShift ? <Loader2 className="animate-spin" /> : "Start"}
                                    {/* <span style={{ fontSize: "0.75rem", opacity: 0.8, marginTop: "0.5rem" }}>
                                        Hold 3 seconds
                                    </span> */}
                                </motion.button>
                            </div>

                            {/* <p style={{ margin: 0, opacity: 0.75, fontSize: "0.85rem", textAlign: "center" }}>
                                Long press to start shift and log your live location.
                            </p> */}
                        </div>
                    ) : tasks.length === 0 ? (
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                height: "70vh",
                            }}
                        >
                            <Empty>
                                <EmptyHeader>
                                    <EmptyMedia>
                                        <ClipboardList />
                                    </EmptyMedia>
                                    <EmptyTitle>No Tasks</EmptyTitle>
                                    <EmptyDescription>
                                        You don't have any tasks assigned yet.
                                    </EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            {/* Tasks will be mapped here */}
                        </div>
                    )}
                </div>
            </motion.div>

            <ResponsiveModal
                open={endShiftModalOpen}
                onOpenChange={(open) => {
                    setEndShiftModalOpen(open);
                    if (!open) {
                        resetEndHoldState();
                    }
                }}
                title="End Shift"
                description="Do you want to end your current shift and log end coordinates?"
            >
                <div
                    style={{
                        display: "flex",
                        gap: "0.75rem",
                        justifyContent: "flex-end",
                        padding: "1rem",
                        paddingTop: "0.25rem",
                        // paddingBottom:"2rem"
                    }}
                >
                    <button
                        onClick={() => {
                            setEndShiftModalOpen(false);
                            resetEndHoldState();
                        }}
                        disabled={endingShift}
                        style={{
                            display:"flex",
                            flex:1,
                            border: "1px solid rgba(100,100,100,0.25)",
                            borderRadius: "0.5rem",
                            padding: "0.5rem 0.9rem",
                            background: "transparent",
                            cursor: endingShift ? "not-allowed" : "pointer",
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        disabled={endingShift}
                        onPointerDown={handleEndHoldStart}
                        onPointerUp={handleEndHoldEnd}
                        onPointerLeave={handleEndHoldEnd}
                        onPointerCancel={handleEndHoldEnd}
                        style={{
                            position: "relative",
                            overflow: "hidden",
                            display:"flex",
                            justifyContent: "center",
                            alignItems: "center",
                            flex:1,
                            border: "none",
                            borderRadius: "0.5rem",
                            padding: "0.5rem 0.9rem",
                            background: "rgba(220, 20, 60, 0.12)",
                            color: "crimson",
                            fontWeight: 600,
                            cursor: endingShift ? "not-allowed" : "pointer",
                        }}
                    >
                        <span
                            style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: `${endHoldProgress}%`,
                                background: "rgba(220, 20, 60, 0.28)",
                                transition: isEndHolding ? "none" : "width 0.15s ease",
                            }}
                        />
                        <span style={{ position: "relative", zIndex: 1 }}>
                            {endingShift ? "Ending..." : "Confirm"}
                        </span>
                    </button>
                </div>
            </ResponsiveModal>
        </>
    );
}
