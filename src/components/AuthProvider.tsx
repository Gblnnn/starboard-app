// AuthProvider.js
import PropTypes from "prop-types";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { fetchAndCacheProfile, clearProfileCache } from "@/utils/profileCache";
import { fetchAndCacheVehicle, clearVehicleCache } from "@/utils/vehicleCache";
import { supabase } from "@/lib/supabase";

interface FirestoreUserData {
  id: string;
  role: "admin" | "site_admin" | "user" | "supervisor" | "site_coordinator" | "management" | "profile" | string;  // system access role
  designation?: string;  // job title/position (optional)
  email: string;
  clearance: "Sohar Star United" | "Vale" | "All" | "none";
  assignedSite?: string;
  assignedProject?: string;
  editor?: string | boolean;  // editor access permission
  sensitive_data?: string | boolean;  // sensitive data access permission
  allocated_vehicle?: string;  // vehicle number from vehicle_master
  [key: string]: any;
}

const initialState = {
  user: null,
  userData: null,
  loading: true,
  cachedAuthState: false,
  createUser: async () => {},
  loginUser: async () => {},
  logoutUser: async () => {},
  resetPassword: async () => {},
  updateUserData: async () => {},
};

export const AuthContext = createContext<{
  user: User | null;
  userData: FirestoreUserData | null;
  loading: boolean;
  cachedAuthState: boolean;
  createUser: (email: string, password: string) => Promise<any>;
  loginUser: (email: string, password: string) => Promise<any>;
  logoutUser: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserData: (data: Partial<FirestoreUserData>) => Promise<void>;
}>(initialState);

interface Props {
  children: React.ReactNode;
}

const CACHED_USER_KEY = "cached_user_data";
const CACHED_AUTH_KEY = "cached_auth_state";
const CACHE_TIMESTAMP_KEY = "cached_timestamp";
const CACHE_EXPIRY_DAYS = 30; // Cache valid for 30 days

// Function to check if cache is still valid
const isCacheValid = () => {
  try {
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (!timestamp) return false;
    
    const cacheAge = Date.now() - parseInt(timestamp);
    const maxAge = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    
    return cacheAge < maxAge;
  } catch (e) {
    return false;
  }
};

// Function to get initial state from cache
const getInitialState = () => {
  try {
    if (!isCacheValid()) {
      console.log("Cache expired, will require login");
      return { user: null, userData: null, isValid: false };
    }

    const cachedAuth = localStorage.getItem(CACHED_AUTH_KEY);
    const cachedUser = localStorage.getItem(CACHED_USER_KEY);

    if (cachedAuth && cachedUser) {
      const parsedAuth = JSON.parse(cachedAuth);
      const parsedUser = JSON.parse(cachedUser);

      if (
        parsedAuth?.email &&
        parsedUser?.email &&
        parsedAuth.email === parsedUser.email
      ) {
        console.log("⚡ Cache valid - instant auth loaded");
        return {
          user: parsedAuth,
          userData: parsedUser,
          isValid: true,
        };
      }
    }
    return { user: null, userData: null, isValid: false };
  } catch (e) {
    console.error("Error reading initial cache:", e);
    return { user: null, userData: null, isValid: false };
  }
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

const AuthProvider = ({ children }: Props) => {
  // Get initial state from cache before first render
  const initialState = getInitialState();
  const hasValidCache = useRef(initialState.isValid);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(initialState.user);
  const [userData, setUserData] = useState<FirestoreUserData | null>(
    initialState.userData
  );
  // Track if we are using cached auth state (offline mode)
  const [cachedAuthState, setCachedAuthState] = useState(initialState.isValid);
  const lastUserDataRef = useRef<FirestoreUserData | null>(initialState.userData);

  const cacheUserData = (data: FirestoreUserData) => {
    try {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.error("Error caching user data:", error);
    }
  };

  const cacheAuthState = (user: User | null) => {
    try {
      if (user) {
        const cachedUser = {
          uid: user.id,
          email: user.email,
          emailVerified: user.email_confirmed_at != null,
          displayName: user.user_metadata?.full_name || user.user_metadata?.name || null,
          photoURL: user.user_metadata?.avatar_url || null,
        };
        localStorage.setItem(CACHED_AUTH_KEY, JSON.stringify(cachedUser));
        localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
      } else {
        localStorage.removeItem(CACHED_AUTH_KEY);
        localStorage.removeItem(CACHED_USER_KEY);
        localStorage.removeItem(CACHE_TIMESTAMP_KEY);
      }
    } catch (error) {
      console.error("Error caching auth state:", error);
    }
  };

  const fetchUserData = async (emailOrEmpId: string) => {
    try {
      const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("*")
        .or(`email.eq.${emailOrEmpId},emp_id.eq.${emailOrEmpId}`);

      if (usersError) throw usersError;

      if (usersData && usersData.length > 0) {
        const baseUserData = usersData[0];

        let recordData: any = {};
        if (baseUserData.emp_id) {
          const { data: empData } = await supabase
            .from("employees")
            .select("name, designation, project, department")
            .eq("emp_id", baseUserData.emp_id);
          
          if (empData && empData.length > 0) {
            recordData = empData[0];
          }
        }

        const mergedUserData: FirestoreUserData = {
          ...baseUserData,
          name: recordData.name || baseUserData.name || "",
          designation: recordData.designation || baseUserData.designation || "",
          assignedSite: recordData.department || "",
          assignedProject: recordData.project || "",
        };

        setUserData(mergedUserData);
        cacheUserData(mergedUserData);
        return mergedUserData;
      }

      return null;
    } catch (error) {
      console.error("Error fetching user data:", error);
      toast.error("❌ Failed to fetch user data");
      throw error;
    }
  };

  // Helper to force-refresh the current user's Firestore profile
  const refreshCurrentUserData = async () => {
    try {
      const email = userData?.email || user?.email;
      if (!email) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      await fetchUserData(email);
    } catch (error) {
      console.error("Error refreshing user data:", error);
    }
  };

  const createUser = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });
      if (error) throw error;
      cacheAuthState(data.user);
      return data;
    } finally {
      setLoading(false);
    }
  };

  const loginUser = async (identifier: string, password: string) => {
    toast.info("🔐 Logging in...");
    setLoading(true);
    try {
      let loginEmail = identifier;
      
      if (!identifier.includes('@')) {
        const { data: userRecord } = await supabase
          .from('users')
          .select('email, emp_id')
          .eq('emp_id', identifier)
          .single();
          
        if (userRecord && userRecord.email) {
          loginEmail = userRecord.email;
        } else {
          loginEmail = `${identifier}@starboard.local`;
        }
      }

      const { data: result, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password
      });

      if (error) throw error;
      
      const userData = await fetchUserData(identifier);
      
      if (userData) {
        setUser(result.user);
        setUserData(userData);
        cacheAuthState(result.user);
        setCachedAuthState(false);

        // Record last active timestamp in background
        supabase.from("users").update({
          last_active: new Date().toISOString()
        }).eq("id", userData.id).then();
        
        // Cache profile data in background
        fetchAndCacheProfile(loginEmail, userData.allocated_vehicle).catch(err => 
          console.error("Failed to cache profile:", err)
        );
        
        // Cache vehicle data in background if allocated
        if (userData.allocated_vehicle) {
          fetchAndCacheVehicle(userData.allocated_vehicle).catch(err =>
            console.error("Failed to cache vehicle:", err)
          );
        }
        
        return { result, userData };
      } else {
        throw new Error("User data not found in Supabase database");
      }
    } catch (error: any) {
      console.error("Login error:", error);
      toast.error("❌ Login failed: " + (error.message || "Invalid credentials"));
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logOut = async () => {
    toast.info("🚪 Logging out...");
    setLoading(true);
    try {
      await supabase.auth.signOut();
      
      // Clear all state
      setUser(null);
      setUserData(null);
      setCachedAuthState(false);
      
      // Clear all cached data
      localStorage.removeItem(CACHED_USER_KEY);
      localStorage.removeItem(CACHED_AUTH_KEY);
      localStorage.removeItem(CACHE_TIMESTAMP_KEY);
      clearProfileCache();
      clearVehicleCache();
      
      toast.success("✅ Logged out successfully");
      
      // Force reload to login page
      window.location.href = "/";
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("❌ Logout error");
      throw error;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Log auth state for debugging
    if (hasValidCache.current) {
      console.log("⚡ Using cached auth - instant access!");
      setCachedAuthState(true);

      // Stamp last_active for sessions resumed from persistence (no explicit login)
      if (userData?.id && navigator.onLine) {
        supabase.from("users").update({
          last_active: new Date().toISOString()
        }).eq("id", userData.id).then();
      }

      // Pre-fetch profile data in background if user email is available
      if (userData?.email) {
        fetchAndCacheProfile(userData.email, userData.allocated_vehicle).catch(err => 
          console.error("Failed to pre-cache profile:", err)
        );
      }

      // When starting from cached auth, also refresh user profile once
      // so any role/clearance changes made while the app was closed are applied.
      refreshCurrentUserData();
    } else {
      console.log("No cached auth - showing login page");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Global listener for Supabase auth events like password recovery
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        window.location.href = '/update-password';
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // When the tab/window comes back to the foreground, re-check the
  // user's Firestore profile so changes made while the app was not
  // visible get picked up quickly after return.
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshCurrentUserData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user?.email, userData?.email]);

  // Request notification permission once on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          console.log('✅ Notification permission granted');
        }
      }).catch(err => console.error('Notification permission error:', err));
    }
  }, []);

  // Global notification listener for ticket replies
  useEffect(() => {
    if (!user?.email || typeof window === 'undefined') return;
    if ('Notification' in window && Notification.permission !== 'granted') return;

    let mounted = true;
    let channel: any = null;

    const setupTicketNotifications = async () => {
      try {
        const { data: userTickets } = await supabase
          .from("tickets")
          .select("id")
          .eq("createdBy", user.email);

        if (!mounted || !userTickets || userTickets.length === 0) return;

        const ticketIds = userTickets.map(t => t.id);
        console.log(`🔔 Global notification listener: monitoring ${ticketIds.length} tickets`);

        channel = supabase.channel('global-ticket-notifications')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
            const message = payload.new as any;
            if (ticketIds.includes(message.ticketId) && message.createdBy !== user.email) {
               try {
                 const notification = new Notification('New Reply to Your Ticket', {
                   body: `${message.createdBy} replied: ${message.text?.substring(0, 100)}${message.text && message.text.length > 100 ? '...' : ''}`,
                   icon: '/favicon.ico',
                   tag: `ticket-${message.ticketId}`,
                   requireInteraction: false,
                   silent: false
                 });
                 notification.onclick = () => {
                   window.focus();
                   window.location.href = '/tickets';
                   notification.close();
                 };
                 setTimeout(() => notification.close(), 6000);
               } catch (err) {
                 console.error('Failed to show notification:', err);
               }
            }
          })
          .subscribe();
      } catch (error) {
        console.error('Failed to set up ticket notifications:', error);
      }
    };

    setupTicketNotifications();

    return () => {
      mounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.email]);

  // Notify petty-cash approvers and custodians independently of email delivery.
  useEffect(() => {
    const empId = userData?.emp_id ? String(userData.emp_id) : null;
    if (!empId || typeof window === "undefined") return;
    const shownNotifications = new Set<string>();
    let checkingPendingApprovals = false;
    let active = true;

    const showPettyCashNotification = (title: string, body: string, tag: string) => {
      if (shownNotifications.has(tag)) return;
      shownNotifications.add(tag);
      toast.info(title, { description: body });
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      try {
        const notification = new Notification(title, {
          body,
          icon: "/favicon.ico",
          tag,
          requireInteraction: false,
        });
        notification.onclick = () => {
          window.focus();
          window.location.href = "/petty-cash";
          notification.close();
        };
        window.setTimeout(() => notification.close(), 6000);
      } catch (error) {
        console.error("Failed to show petty-cash notification:", error);
      }
    };

    const checkPendingApprovals = async () => {
      if (checkingPendingApprovals || !active) return;
      checkingPendingApprovals = true;
      try {
        const { data: assignments, error: assignmentError } = await supabase
          .from("pettycash_user")
          .select("emp_id, project_code, approver_id, verifier_id")
          .or(`approver_id.eq.${empId},verifier_id.eq.${empId}`)
          .eq("active", true);
        if (assignmentError) throw assignmentError;

        const approvalAssignmentKeys = new Set((assignments || [])
          .filter((assignment) => assignment.approver_id === empId)
          .map((assignment) => `${assignment.project_code}:${assignment.emp_id}`));
        const verificationAssignmentKeys = new Set((assignments || [])
          .filter((assignment) => assignment.verifier_id === empId)
          .map((assignment) => `${assignment.project_code}:${assignment.emp_id}`));
        const projectCodes = [...new Set((assignments || []).map((assignment) => assignment.project_code))];
        if (projectCodes.length === 0) {
          return;
        }

        const [requestResult, submissionResult] = await Promise.all([
          supabase
            .from("petty_cash_request")
            .select("emp_id, project_code, request_number, verifier_id, status")
            .in("status", ["pending_verification", "pending_approval"])
            .in("project_code", projectCodes),
          supabase
            .from("petty_cash_submission")
            .select("emp_id, project_code, submission_number, verifier_id, status")
            .in("status", ["pending_verification", "pending_petty_cash_approval"])
            .in("project_code", projectCodes),
        ]);
        if (requestResult.error) throw requestResult.error;
        if (submissionResult.error) throw submissionResult.error;
        if (!active) return;

        const pending = [
          ...(requestResult.data || [])
            .filter((request) => request.status === "pending_verification"
              ? request.verifier_id === empId || verificationAssignmentKeys.has(`${request.project_code}:${request.emp_id}`)
              : approvalAssignmentKeys.has(`${request.project_code}:${request.emp_id}`))
            .map((request) => ({
              tag: `petty-cash-request-pending-${request.request_number}`,
              title: request.status === "pending_verification"
                ? "Petty cash request needs verification"
                : "Petty cash request needs approval",
              body: `${request.request_number} is awaiting your ${request.status === "pending_verification" ? "verification" : "approval"}.`,
            })),
          ...(submissionResult.data || [])
            .filter((submission) => submission.status === "pending_verification"
              ? submission.verifier_id === empId || verificationAssignmentKeys.has(`${submission.project_code}:${submission.emp_id}`)
              : approvalAssignmentKeys.has(`${submission.project_code}:${submission.emp_id}`))
            .map((submission) => ({
              tag: `petty-cash-submission-pending-${submission.submission_number}`,
              title: submission.status === "pending_verification"
                ? "Petty cash bills need verification"
                : "Petty cash bills need approval",
              body: `${submission.submission_number} is awaiting your ${submission.status === "pending_verification" ? "verification" : "approval"}.`,
            })),
        ];

        for (const notification of pending) {
          showPettyCashNotification(notification.title, notification.body, notification.tag);
        }
      } catch (error) {
        console.error("Failed to check pending petty-cash approvals:", error);
      } finally {
        checkingPendingApprovals = false;
      }
    };

    void checkPendingApprovals();
    const pendingApprovalInterval = window.setInterval(() => {
      void checkPendingApprovals();
    }, 15000);
    const refreshPendingApprovals = () => {
      if (document.visibilityState === "visible") void checkPendingApprovals();
    };
    document.addEventListener("visibilitychange", refreshPendingApprovals);

    const loadAssignment = async (projectCode: string, custodianId: string) => {
      const { data, error } = await supabase
        .from("pettycash_user")
        .select("approver_id, verifier_id, finapprover_id")
        .eq("project_code", projectCode)
        .eq("emp_id", custodianId)
        .eq("active", true)
        .maybeSingle();
      if (error) {
        console.error("Failed to load petty-cash notification recipients:", error);
        return null;
      }
      return data;
    };

    const channel = supabase.channel(`petty-cash-notifications-${empId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "petty_cash_request",
      }, async (payload) => {
        const request = payload.new as {
          emp_id: string;
          project_code: string;
          request_number: string;
          verifier_id: string | null;
          status: string;
        };
        if (!["pending_verification", "pending_approval"].includes(request.status) || request.emp_id === empId) return;
        const assignment = await loadAssignment(request.project_code, request.emp_id);
        const isVerification = request.status === "pending_verification";
        const assignedUser = isVerification
          ? request.verifier_id ?? assignment?.verifier_id
          : assignment?.approver_id;
        if (assignedUser !== empId) return;
        showPettyCashNotification(
          isVerification ? "Petty cash request needs verification" : "Petty cash request needs approval",
          `${request.request_number} is awaiting your ${isVerification ? "verification" : "approval"}.`,
          `petty-cash-request-pending-${request.request_number}`,
        );
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "petty_cash_request",
        filter: `emp_id=eq.${empId}`,
      }, (payload) => {
        const request = payload.new as { emp_id: string; request_number: string; status: string };
        const previous = payload.old as { status?: string };
        if (previous.status === request.status) return;
        if (request.emp_id !== empId || !["approved", "rejected"].includes(request.status)) return;
        const status = request.status === "approved" ? "approved" : "rejected";
        showPettyCashNotification(
          `Petty cash request ${status}`,
          `${request.request_number} has been ${status}.`,
          `petty-cash-request-${request.request_number}`,
        );
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "petty_cash_request",
      }, async (payload) => {
        const request = payload.new as {
          emp_id: string;
          project_code: string;
          request_number: string;
          status: string;
        };
        const previous = payload.old as { status?: string };
        if (previous.status === request.status || request.status !== "approved") return;
        const assignment = await loadAssignment(request.project_code, request.emp_id);
        if (assignment?.finapprover_id !== empId) return;
        showPettyCashNotification(
          "Petty cash request ready for payment",
          `${request.request_number} has been approved and is awaiting Finance payment.`,
          `petty-cash-request-finance-${request.request_number}`,
        );
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "petty_cash_submission",
      }, async (payload) => {
        const submission = payload.new as {
          emp_id: string;
          project_code: string;
          submission_number: string;
          petty_cash_approver_id: string | null;
          verifier_id: string | null;
          status: string;
        };
        if (!["pending_verification", "pending_petty_cash_approval"].includes(submission.status) ||
            submission.emp_id === empId) return;
        const isVerification = submission.status === "pending_verification";
        let assignedUser = isVerification ? submission.verifier_id : submission.petty_cash_approver_id;
        if (!assignedUser) {
          const assignment = await loadAssignment(submission.project_code, submission.emp_id);
          assignedUser = isVerification ? assignment?.verifier_id ?? null : assignment?.approver_id ?? null;
        }
        if (assignedUser !== empId) return;
        showPettyCashNotification(
          isVerification ? "Petty cash bills need verification" : "Petty cash bills need approval",
          `${submission.submission_number} is awaiting your ${isVerification ? "verification" : "approval"}.`,
          `petty-cash-submission-pending-${submission.submission_number}`,
        );
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "petty_cash_submission",
        filter: `emp_id=eq.${empId}`,
      }, (payload) => {
        const submission = payload.new as { emp_id: string; submission_number: string; status: string };
        const previous = payload.old as { status?: string };
        if (previous.status === submission.status) return;
        if (submission.emp_id !== empId ||
            !["approved", "rejected", "returned_for_correction"].includes(submission.status)) return;
        const statusLabel = submission.status === "returned_for_correction"
          ? "returned for correction"
          : submission.status;
        showPettyCashNotification(
          `Petty cash bills ${statusLabel}`,
          `${submission.submission_number} has been ${statusLabel}.`,
          `petty-cash-submission-${submission.submission_number}`,
        );
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "petty_cash_submission",
      }, async (payload) => {
        const submission = payload.new as {
          emp_id: string;
          project_code: string;
          submission_number: string;
          status: string;
        };
        const previous = payload.old as { status?: string };
        if (previous.status === submission.status || submission.status !== "approved") return;
        const assignment = await loadAssignment(submission.project_code, submission.emp_id);
        if (assignment?.finapprover_id !== empId) return;
        showPettyCashNotification(
          "Petty cash bills ready for payment",
          `${submission.submission_number} has been approved and is awaiting Finance payment.`,
          `petty-cash-submission-finance-${submission.submission_number}`,
        );
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "petty_cash_request_payment",
      }, async (payload) => {
        const payment = payload.new as { request_id: number; payment_amount: number };
        const { data: request, error } = await supabase
          .from("petty_cash_request")
          .select("emp_id, request_number")
          .eq("id", payment.request_id)
          .maybeSingle();
        if (error) {
          console.error("Failed to load petty-cash funding payment recipient:", error);
          return;
        }
        if (request?.emp_id !== empId) return;
        showPettyCashNotification(
          "Petty cash payment recorded",
          `${request.request_number}: OMR ${Number(payment.payment_amount).toFixed(3)} paid by Finance.`,
          `petty-cash-funding-payment-${payment.request_id}`,
        );
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "petty_cash_reimbursement_payment",
        filter: `emp_id=eq.${empId}`,
      }, async (payload) => {
        const payment = payload.new as { emp_id: string; submission_id: number; payment_amount: number };
        if (payment.emp_id !== empId) return;
        const { data: submission, error } = await supabase
          .from("petty_cash_submission")
          .select("submission_number")
          .eq("id", payment.submission_id)
          .maybeSingle();
        if (error) {
          console.error("Failed to load petty-cash reimbursement details:", error);
          return;
        }
        showPettyCashNotification(
          "Petty cash reimbursement paid",
          `${submission?.submission_number || `Bill submission #${payment.submission_id}`}: OMR ${Number(payment.payment_amount).toFixed(3)} paid by Finance.`,
          `petty-cash-reimbursement-payment-${payment.submission_id}`,
        );
      })
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Failed to subscribe to petty-cash notifications:", error);
        }
      });

    return () => {
      active = false;
      window.clearInterval(pendingApprovalInterval);
      document.removeEventListener("visibilitychange", refreshPendingApprovals);
      supabase.removeChannel(channel);
    };
  }, [userData?.emp_id]);

  // Listen for realtime changes to the current user's Supabase document
  useEffect(() => {
    let unsubscribe = () => {};

    const setupListener = async () => {
      try {
        const identifier = userData?.email || user?.email;
        if (!identifier) return;

        const channel = supabase.channel('schema-db-changes')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'users',
              filter: `email=eq.${identifier}`
            },
            async () => {
              const latestData = await fetchUserData(identifier);
              if (!latestData) return;
              
              const prev = lastUserDataRef.current;
              setUserData(latestData);
              cacheUserData(latestData);
              lastUserDataRef.current = latestData;

              if (prev) {
                const roleChanged = prev.role !== latestData.role;
                const clearanceChanged = prev.clearance !== latestData.clearance;
                const editorChanged = prev.editor !== latestData.editor;
                const sensitiveChanged = prev.sensitive_data !== latestData.sensitive_data;

                if (roleChanged || clearanceChanged || editorChanged || sensitiveChanged) {
                  toast.info("Your access level has been updated.");
                }
              }
            }
          )
          .subscribe();

        unsubscribe = () => {
          supabase.removeChannel(channel);
        };
      } catch (error) {
        console.error("Failed to set up user data listener:", error);
      }
    };

    setupListener();

    return () => {
      unsubscribe();
    };
  }, [user?.email, userData?.email]);

  // NEVER block rendering with a loading screen on mount
  // The loading state is only used to disable buttons during operations

  const authValue: {
    user: User | null;
    userData: FirestoreUserData | null;
    loading: boolean;
    cachedAuthState: boolean;
    createUser: (email: string, password: string) => Promise<any>;
    loginUser: (email: string, password: string) => Promise<any>;
    logoutUser: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    updateUserData: (data: Partial<FirestoreUserData>) => Promise<void>;
    refreshCurrentUserData: () => Promise<void>;
  } = {
    user,
    userData,
    loading,
    cachedAuthState,
    createUser,
    loginUser,
    logoutUser: logOut,
    resetPassword: async () => {},
    updateUserData: async () => {},
    refreshCurrentUserData,
  };

  // Always provide auth context regardless of state
  return (
    <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
  );
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AuthProvider;
