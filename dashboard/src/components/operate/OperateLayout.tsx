import clsx from "clsx";
import { NavLink, Outlet } from "react-router-dom";
import { OperateSessionProvider, useOperateSession } from "@/lib/OperateSessionContext";

interface SubNavItem {
  to: string;
  label: string;
}

const BASE_ITEMS: SubNavItem[] = [
  { to: "/operate/entry", label: "Production Entry" },
  { to: "/operate/breakdown", label: "Breakdown" },
];

const CRUSHER_ITEMS: SubNavItem[] = [
  { to: "/operate/checklist", label: "Checklist" },
  { to: "/operate/breakdown-matrix", label: "Breakdown Matrix" },
  { to: "/operate/incidents", label: "Incidents" },
];

function SessionStrip() {
  const { activeMachine, activeAssignment, isRestoring } = useOperateSession();

  if (isRestoring) {
    return <div className="mb-4 text-sm text-slate-400">Checking for an active session…</div>;
  }

  if (!activeMachine || !activeAssignment) {
    return (
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        No active machine — <NavLink to="/operate/session" className="font-medium underline">activate one</NavLink> to
        start entering data.
      </div>
    );
  }

  const isCrusher = activeMachine.machine_type_code === "cru";
  const items = isCrusher ? [...BASE_ITEMS, ...CRUSHER_ITEMS] : BASE_ITEMS;

  return (
    <div className="mb-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            {activeMachine.machine_type_code.toUpperCase()} {activeMachine.fleet_number}
          </div>
          <div className="text-xs text-slate-500">Active since {new Date(activeAssignment.started_at).toLocaleString()}</div>
        </div>
        <NavLink
          to="/operate/release"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Release / End Shift
        </NavLink>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                "rounded-t-md px-3 py-2 text-sm font-medium",
                isActive
                  ? "border-b-2 border-brand-600 text-brand-700"
                  : "text-slate-500 hover:text-slate-800",
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function OperateLayout() {
  return (
    <OperateSessionProvider>
      <div>
        <h1 className="mb-3 text-lg font-semibold text-slate-900">Operate</h1>
        <SessionStrip />
        <Outlet />
      </div>
    </OperateSessionProvider>
  );
}
