import { LoadingOutlined } from "@ant-design/icons";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import BottomNav from "./bottom-nav";

// Define routes that require specific clearance
const CLEARANCE_ROUTES = {
  "/vale-records": ["All", "Vale"],
};

// Define system-role-restricted routes
const ROLE_RESTRICTED_ROUTES = {
  admin: ["*"], // Admins can access all routes
  site_admin: ["/site-admin-workers", "/index", "/tasks", "/phonebook", "/profile", "/timetaag", "/attendance"],
  user: ["/index", "/tasks", "/records", "/record-list", "/vale-records", "/profile", "/phonebook", "/qr-code-generator", "/offer-letters", "/new-hire", "/fuel-log", "/asset-master", "/projects", "/attendance"], // Regular users can access records master
  profile: ["/profile", "/records", "/phonebook", "/attendance"] // Basic profile access
};

// Module-level clearance can explicitly grant route access regardless of role list.
const MODULE_ROUTE_PERMISSIONS: Record<string, string[]> = {
  records_master: ["/records", "/record-list", "/record/", "/vale-records", "/movement-register"],
  user_management: ["/users", "/user", "/admin", "/access-control", "/access-requests"],
  new_hire: ["/new-hire", "/openings", "/shortlist"],
  phonebook: ["/phonebook"],
  quick_links: ["/quick-links"],
  qr_generator: ["/qr-code-generator"],
  fuel_log: ["/fuel-log"],
  passports: ["/passports"],
  asset_master: ["/asset-master", "/devices"],
  projects: ["/projects", "/project-lpo"],
  timetaag: ["/timetaag"],
  shift_logs: ["/shift-logs"],
  vehicle_log_book: ["/vehicle-log-book", "/vehicles"],
  offer_letters: ["/offer-letters"],
  employee_clearance_form: ["/employee-clearance-form"],
  transfer_requests: ["/transfer-requests"],
  manpower_requirements: ["/manpower-requirements"],
  tickets: ["/tickets"],
  attendance: ["/attendance"],
  attendance_edit: ["/timesheet-edit"],
  document_editor: ["/document-editor"],
  mobile_punch: ["/mobile-punch"]
};

const routeMatchesPath = (route: string, path: string): boolean => {
  if (route.endsWith("/")) {
    return path.startsWith(route);
  }
  return route === path;
};

const getModulePermissions = (clearance: string | undefined): Record<string, boolean> => {
  if (!clearance) return {};
  try {
    const parsed = JSON.parse(clearance);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, boolean>;
    }
  } catch {
    // Ignore legacy non-JSON clearance format.
  }
  return {};
};

const hasRoutePermissionFromModules = (
  path: string,
  permissions: Record<string, boolean>
): boolean => {
  for (const [moduleId, routes] of Object.entries(MODULE_ROUTE_PERMISSIONS)) {
    if (!permissions[moduleId]) continue;
    if (routes.some((route) => routeMatchesPath(route, path))) {
      return true;
    }
  }
  return false;
};

export default function ProtectedRoutes() {
  const { user, userData, loading } = useAuth();
  const location = useLocation();

  // DEBUG LOGGING
  const currentPath = location.pathname;
  const modulePermissions = getModulePermissions(userData?.clearance);
  console.log("[ProtectedRoutes] userData:", userData);
  console.log("[ProtectedRoutes] modulePermissions:", modulePermissions);
  console.log("[ProtectedRoutes] currentPath:", currentPath);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          background: "linear-gradient(darkslateblue, midnightblue)",
        }}
      >
        <LoadingOutlined style={{ fontSize: 24, color: "white" }} />
      </div>
    );
  }

  // First check if user is authenticated
  if (!user || !userData) {
    return <Navigate to="/" />;
  }

  // Check role-based route restrictions
  const allowedRoutes = ROLE_RESTRICTED_ROUTES[userData.role as keyof typeof ROLE_RESTRICTED_ROUTES];
  const hasModuleRouteAccess = hasRoutePermissionFromModules(currentPath, modulePermissions);

  // Helper function to check if a path matches allowed routes (including dynamic routes)
  const isPathAllowed = (path: string, allowedRoutes: string[]): boolean => {
    // Check for wildcard access
    if (allowedRoutes.includes("*")) return true;

    // Check exact match
    if (allowedRoutes.includes(path)) return true;

    // Check if path starts with any allowed route (for dynamic routes like /record/:id)
    return allowedRoutes.some(() => {
      // Special handling for dynamic routes
      if (path.startsWith('/record/') && allowedRoutes.includes('/records')) {
        return true;
      }
      return false;
    });
  };

  // If route is module-protected, allow access if EITHER role-based or module clearance is present
  const isModuleProtected = Object.values(MODULE_ROUTE_PERMISSIONS).some(routes => routes.includes(currentPath));
  if (isModuleProtected) {
    if (!isPathAllowed(currentPath, allowedRoutes) && !hasModuleRouteAccess) {
      // If neither role nor module clearance, redirect
      const defaultRoute = allowedRoutes && allowedRoutes.length > 0 ? allowedRoutes[0] : "/index";
      return <Navigate to={defaultRoute} replace />;
    }
  } else {
    // If role is defined and has specific route restrictions (not wildcard)
    if (allowedRoutes && allowedRoutes.length > 0 && !allowedRoutes.includes("*")) {
      if (!isPathAllowed(currentPath, allowedRoutes) && !hasModuleRouteAccess) {
        // Redirect to their default page based on role
        const defaultRoute = allowedRoutes[0];
        return <Navigate to={defaultRoute} replace />;
      }
    }
    // If role is not defined in ROLE_RESTRICTED_ROUTES, allow access to /index only
    else if (!allowedRoutes && currentPath !== "/index" && !hasModuleRouteAccess) {
      return <Navigate to="/index" replace />;
    }
  }

  // Then check clearance for protected routes
  const requiredClearance =
    CLEARANCE_ROUTES[location.pathname as keyof typeof CLEARANCE_ROUTES];
  if (requiredClearance) {
    const hasLegacyClearance = requiredClearance.includes(userData.clearance);
    const hasClearance = hasLegacyClearance || hasModuleRouteAccess;
    if (!hasClearance) {
      // If no clearance, redirect to record-list with error state
      return (
        <Navigate
          to="/record-list"
          state={{ error: "No clearance to access this route" }}
          replace
        />
      );
    }
  }

  // Only show BottomNav on specific pages
  const showBottomNav = ["/index", "/phonebook", "/tasks", "/site-admin-workers", "/mobile-punch"].includes(location.pathname);

  return (
    <>
      <Outlet />
      {showBottomNav && <BottomNav />}
    </>
  );
}
