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
  attendance_edit: ["/timesheet-edit", "/project-timing-break"],
  shift_management: ["/shift-management"],
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

  const currentPath = location.pathname;
  const modulePermissions = getModulePermissions(userData?.clearance);

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

  if (!user || !userData) {
    return <Navigate to="/" />;
  }

  const allowedRoutes = ROLE_RESTRICTED_ROUTES[userData.role as keyof typeof ROLE_RESTRICTED_ROUTES];
  const hasModuleRouteAccess = hasRoutePermissionFromModules(currentPath, modulePermissions);
  const hasShiftManagementAccess = currentPath === "/shift-management" && (
    userData.role === "admin" ||
    Boolean(userData.emp_id) ||
    modulePermissions.shift_management === true
  );

  const isPathAllowed = (path: string, routes: string[]): boolean => {
    if (routes.includes("*")) return true;
    if (routes.includes(path)) return true;

    return routes.some(() => {
      if (path.startsWith("/record/") && routes.includes("/records")) {
        return true;
      }
      return false;
    });
  };

  const isModuleProtected = Object.values(MODULE_ROUTE_PERMISSIONS)
    .some((routes) => routes.includes(currentPath));

  if (isModuleProtected) {
    if (!isPathAllowed(currentPath, allowedRoutes) && !hasModuleRouteAccess && !hasShiftManagementAccess) {
      const defaultRoute = allowedRoutes && allowedRoutes.length > 0 ? allowedRoutes[0] : "/index";
      return <Navigate to={defaultRoute} replace />;
    }
  } else {
    if (allowedRoutes && allowedRoutes.length > 0 && !allowedRoutes.includes("*")) {
      if (!isPathAllowed(currentPath, allowedRoutes) && !hasModuleRouteAccess && !hasShiftManagementAccess) {
        return <Navigate to={allowedRoutes[0]} replace />;
      }
    } else if (!allowedRoutes && currentPath !== "/index" && !hasModuleRouteAccess && !hasShiftManagementAccess) {
      return <Navigate to="/index" replace />;
    }
  }

  const requiredClearance =
    CLEARANCE_ROUTES[location.pathname as keyof typeof CLEARANCE_ROUTES];
  if (requiredClearance) {
    const hasLegacyClearance = requiredClearance.includes(userData.clearance);
    const hasClearance = hasLegacyClearance || hasModuleRouteAccess;
    if (!hasClearance) {
      return (
        <Navigate
          to="/record-list"
          state={{ error: "No clearance to access this route" }}
          replace
        />
      );
    }
  }

  const showBottomNav = ["/index", "/phonebook", "/tasks", "/site-admin-workers", "/mobile-punch"].includes(location.pathname);

  return (
    <>
      <Outlet />
      {showBottomNav && <BottomNav />}
    </>
  );
}
