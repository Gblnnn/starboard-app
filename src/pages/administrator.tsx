import Back from "@/components/back";
import AssetMaster from "@/pages/asset-master";
import DevicesMaster from "@/pages/DevicesMaster";
import EmployeeManage from "@/pages/employee-manage";
import ProjectTimingBreak from "@/pages/ProjectTimingBreak";
import ProjectsMaster from "@/pages/ProjectsMaster";
import ShiftMaster from "@/pages/shift-management/ShiftMaster";
import ProjectShifts from "@/pages/shift-management/ProjectShifts";
import Users from "@/pages/users";
import VehicleLogBook from "@/pages/vehicle-log-book";
import { useAuth } from "@/components/AuthProvider";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import CompanyMaster from "./company-master";
import HolidayMaster from "./holiday-master";

const masters = [
  { id: "employees", label: "Employee Master", component: EmployeeManage },
  { id: "projects", label: "Projects", component: ProjectsMaster },
  { id: "devices", label: "Punching Devices", component: DevicesMaster },
  { id: "break-timing", label: "Project Break Timing", component: ProjectTimingBreak },
  { id: "holidays", label: "Holidays", component: HolidayMaster },
  { id: "vehicles", label: "Vehicles Master", component: VehicleLogBook },
  { id: "shift", label: "Shift Master", component: ShiftMaster },
  { id: "project-shifts", label: "Project Shifts", component: ProjectShifts },
  { id: "users", label: "Users", component: Users },
  { id: "assets", label: "Assets Master", component: AssetMaster },
  { id: "companies", label: "Company Master", component: CompanyMaster },
] as const;

export default function Administrator() {
  const { userData } = useAuth();
  const [activeMaster, setActiveMaster] = useState<(typeof masters)[number]["id"]>("employees");
  const selectedMaster = masters.find((master) => master.id === activeMaster) ?? masters[0];
  const MasterPage = selectedMaster.component;

  if (userData?.role !== "admin") {
    return <Navigate to="/index" replace />;
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-8">
      <Back title="Administrator" subtitle="Manage system masters" />
      <div className="mx-auto max-w-[1600px] px-3 pt-20 sm:px-6">
        <nav aria-label="Administrator master pages" className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          {masters.map((master) => (
            <button
              key={master.id}
              type="button"
              onClick={() => setActiveMaster(master.id)}
              aria-current={activeMaster === master.id ? "page" : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${activeMaster === master.id ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {master.label}
            </button>
          ))}
        </nav>
        <div className="mt-5 min-w-0">
          {activeMaster === "break-timing" ? <ProjectTimingBreak embedMode /> : <MasterPage />}
        </div>
      </div>
    </main>
  );
}
