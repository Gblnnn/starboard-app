import { useAuth } from "@/components/AuthProvider";
import { ResponsiveModal } from "@/components/responsive-modal";
import { auth } from "@/firebase";
import emailjs from "@emailjs/browser";
import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu";
import { motion } from "framer-motion";
import { Bug, List, LoaderCircle, LogOut, RefreshCcw, UserX, KeyRound } from "lucide-react";
import moment from "moment";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "./ui/avatar";
import DefaultDialog from "./ui/default-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

interface Props {
  className?: string;
  onLogout: () => void;
  onProfile: () => void;
  onBug?: () => void;
}

const CHANGELOGS = [
  {
    version: "v1.82",
    date: "July 28, 2026",
    changes: [
      "Added silent background database synchronization using explicit realtime listeners to Timesheet Finalizer.",
      "Fixed focal point employee project visibility bugs.",
      "Implemented read-only plain-text table display in Approver mode.",
      "Enforced manual remark validation for incomplete biometric punch logs.",
      "Restricted 'No Device' automatic remark defaulting to non-device projects only.",
      "Cleaned up timesheet actions: removed 'Allocate Punch Time' and bracketed device details from badges.",
      "Replaced the status dropdown with plain text for records having at least 1 machine logged punch.",
    ]
  },
  {
    version: "v1.67",
    date: "July 14, 2026",
    changes: [
      "Added Change Log modal to index dropdown.",
      "Added Apply Pressure force update system.",
      "Fixed project attendance stats matching logic.",
    ]
  },
  {
    version: "v1.66",
    date: "July 13, 2026",
    changes: [
      "Added Total Hours column to Timesheet Finalizer.",
      "Implemented smooth card toggling and row animation in Projects Master.",
      "Optimized PWA startup caching rules to solve Chrome network timeouts.",
    ]
  }
];

export default function IndexDropDown(props: Props) {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [bugDialog, setBugDialog] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [issue, setIssue] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);


  const serviceId = "service_fixajl8";
  const templateId = "template_0f3zy3e";

  useEffect(() => {
    // Track online/offline status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodically check online status (every 2 seconds)
    const checkInterval = setInterval(() => {
      setIsOnline(navigator.onLine);
    }, 2000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(checkInterval);
    };
  }, []);

  const handleBugReport = async () => {
    if (!issue.trim()) return;

    setLoading(true);
    try {
      await emailjs.init("c8AePKR5BCK8UIn_E"); // Initialize EmailJS with your public key

      await emailjs.send(serviceId, templateId, {
        name: auth.currentUser?.email,
        subject: "Bug Report - " + moment().format("ll") + " from " + auth.currentUser?.email,
        recipient: "goblinn688@gmail.com",
        message: issue,
      });

      // First close the dialog and reset state
      setBugDialog(false);
      setIssue("");

      // Then show the success message in the next tick
      setTimeout(() => {
        toast.success("Bug Report sent");
      }, 0);

    } catch (error) {
      // Show error in the next tick
      setTimeout(() => {
        toast.error("Failed to send bug report");
      }, 0);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <motion.button
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className={props.className}
            style={{
              outline: "none",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "none",
              height: "2.5rem",
              width: "2.5rem",
              background: isOnline
                ? "linear-gradient(145deg, rgba(15, 5, 130, 0.96), rgba(25, 12, 170, 0.94) 45%, rgba(12, 3, 105, 0.98))"
                : "linear-gradient(indianred, darkred)",
              color: isOnline ? "#f2f8ff" : "white",
              borderRadius: "0.375rem",
              // border: isOnline ? "1px solid rgba(186, 218, 255, 0.48)" : "none",
              // boxShadow: isOnline
              //   ? "inset 0 1px 0 rgba(255,255,255,0.62), inset 0 -10px 16px rgba(8,30,120,0.5), 0 8px 16px rgba(4,16,60,0.4), 0 0 14px rgba(52,110,255,0.2), 0 0 0 1px rgba(160,204,255,0.18)"
              //   : "none",
              transition: "all 220ms ease",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {isOnline && (
              <div
                style={{
                  position: "absolute",
                  inset: "0.06rem",
                  borderRadius: "0.35rem",
                  pointerEvents: "none",
                  background: "linear-gradient(165deg, rgba(255,255,255,0.45) 0%, rgba(188,222,255,0.2) 18%, rgba(255,255,255,0) 52%), radial-gradient(135% 80% at 14% -10%, rgba(255,255,255,0.65), rgba(255,255,255,0) 58%)",
                }}
              />
            )}
            {userData?.email ? (
              <p className="text-sm">{getInitials(userData.name.split("@")[0])}</p>
            ) : (
              <UserX className="opacity-50" />
            )}
          </motion.button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="mr-5 mt-1" style={{ display: "flex", justifyContent: "flex-start", alignItems: "flex-start" }}>
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={props.onProfile}
              className="p-4 cursor-pointer"
            >
              <div style={{ paddingRight: "1.5rem" }} className="flex">
                <Avatar className="h-12 w-12">
                  <AvatarFallback style={{ fontWeight: "600", background: "linear-gradient( mediumslateblue, midnightblue)", color: "white" }} className="text-lg">
                    {userData?.name
                      ? getInitials(userData.name.split("@")[0])
                      : "?"}
                  </AvatarFallback>
                </Avatar>
                <div style={{ border: "", alignItems: "flex-start", gap: "0.1rem" }} className="flex flex-col ">
                  <p className="text-base font-semibold truncate">
                    {userData?.name?.split("@")[0] || "No name"}
                  </p>
                  <p className="text-xs text-primary font-semibold opacity-75 truncate">
                    {userData?.email}
                  </p>
                  {

                  }
                  {
                    userData?.role == "admin" &&
                    <span
                      style={{ width: "fit-content", background: "crimson", color: "white" }}
                      className="inline-flex items-center rounded-full px-2 py-0.5 mt-1 text-xs font-medium text-primary"
                    >

                      {userData?.role == "admin" ? userData.role : ""}
                    </span>
                  }

                </div>
              </div>
            </DropdownMenuItem>

            <div className="h-px bg-border my-1" />

            <DropdownMenuItem
              onClick={async () => {
                try {
                  // Unregister service workers first
                  if (navigator.serviceWorker) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for (const reg of registrations) {
                      await reg.unregister();
                    }
                  }
                  
                  // Clear local storage items that are not essential auth states
                  const keysToKeep = ['cached_user_data', 'cached_auth_state', 'cached_timestamp'];
                  for (let i = localStorage.length - 1; i >= 0; i--) {
                    const key = localStorage.key(i);
                    if (key && !key.startsWith('sb-') && !keysToKeep.includes(key)) {
                      localStorage.removeItem(key);
                    }
                  }

                  // Clear caches, but DO NOT delete Workbox/Vite PWA caches! 
                  // Deleting PWA caches while the Service Worker is still controlling the page 
                  // causes it to serve empty responses (blank white screen).
                  if ('caches' in window) {
                    const keys = await caches.keys();
                    await Promise.all(
                      keys
                        .filter(key => !key.toLowerCase().includes('workbox') && !key.toLowerCase().includes('pwa'))
                        .map(key => caches.delete(key))
                    );
                  }
                  
                  // Force a network reload by redirecting to the current URL with a timestamp
                  const url = new URL(window.location.href);
                  url.searchParams.set('reload', Date.now().toString());
                  window.location.replace(url.toString());
                } catch (e) {
                  window.location.reload();
                }
              }}
              className="cursor-pointer"
              style={{ display: "flex", justifyContent: "flex-start", alignItems: "center" }}
            >
              <RefreshCcw className="mr-2 h-4 w-4 text-teal-500" />
              <span>Force Reload</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => window.location.href = "/update-password"}
              className="cursor-pointer"
              style={{ display: "flex", justifyContent: "flex-start", alignItems: "center" }}
            >
              <KeyRound className="mr-2 h-4 w-4 text-indigo-500" />
              <span>Change Password</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => setChangelogOpen(true)}
              className="cursor-pointer"
              style={{ display: "flex", justifyContent: "flex-start", alignItems: "center" }}
            >
              <List className="mr-2 h-4 w-4" />
              <span>Change Log</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => setBugDialog(true)}
              className="cursor-pointer"
              style={{ display: "flex", justifyContent: "flex-start", alignItems: "center" }}
            >
              <Bug className="mr-2 h-4 w-4 text-green-500" />
              <span>Report Bug</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={props.onLogout}
              className="cursor-pointer"
              disabled={loading}
              style={{ display: "flex", justifyContent: "flex-start", alignItems: "center" }}
            >
              {loading ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut color="salmon" className="mr-2 h-4 w-4 " />
              )}
              <span>{loading ? "Logging out..." : "Logout"}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

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
              value={issue}
              rows={5}
              placeholder="Describe issue"
            />
          </div>
        }
        open={bugDialog}
        onCancel={() => {
          setBugDialog(false);
          setIssue("");
        }}
        OkButtonText="Report"
        disabled={!issue.trim()}
        onOk={handleBugReport}
        updating={loading}
      />

      <ResponsiveModal
        open={changelogOpen}
        onOpenChange={setChangelogOpen}
        title="Change Log"
        description="See what's new in this version"
      >
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ justifyContent: "space-between" }} className="flex items-center justify-between border-b border-gray-100 pb-2">
            <h2 className="text-sm font-bold text-gray-900">Version History</h2>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">v1.82 (Latest)</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {CHANGELOGS.map((log) => (
              <div key={log.version} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full">{log.version}</span>
                  <span className="text-xs text-gray-400 font-medium">{log.date}</span>
                </div>
                <ul className="list-disc list-inside space-y-1.5 pl-1.5">
                  {log.changes.map((change, idx) => (
                    <li key={idx} className="text-xs text-gray-600 leading-relaxed font-medium">{change}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </ResponsiveModal>
    </>
  );

}

