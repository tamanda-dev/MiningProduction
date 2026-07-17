import clsx from "clsx";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import type { Role } from "@/types";

interface NavItem {
  to: string;
  label: string;
  requireRole?: Role;
}

const OPERATE_ITEMS: NavItem[] = [{ to: "/operate/session", label: "My Shift" }];

const DASHBOARD_ITEMS: NavItem[] = [
  { to: "/dashboard/summary", label: "Live Shift View" },
  { to: "/dashboard/trends", label: "Trends" },
  { to: "/dashboard/availability", label: "Availability & Utilization" },
  { to: "/dashboard/downtime", label: "Downtime Pareto" },
  { to: "/dashboard/machines", label: "Machine Status" },
];

const ENTRY_ITEMS: NavItem[] = [
  { to: "/entries/production", label: "Production Entries" },
  { to: "/entries/breakdowns", label: "Breakdown Logs" },
];

const CRUSHER_PLANT_ITEMS: NavItem[] = [
  { to: "/crusher/summary", label: "Summary" },
  { to: "/crusher/breakdown-pareto", label: "Breakdown Pareto" },
  { to: "/crusher/mttr-mtbf", label: "MTTR / MTBF Trend" },
  { to: "/crusher/checklist-heatmap", label: "Checklist Compliance" },
  { to: "/crusher/open-incidents", label: "Open Incidents" },
];

const MASTER_DATA_ITEMS: NavItem[] = [
  { to: "/admin/sites", label: "Sites", requireRole: "manager" },
  { to: "/admin/sections", label: "Sections", requireRole: "manager" },
  { to: "/admin/subsections", label: "Sub-Sections", requireRole: "manager" },
  { to: "/admin/machine-types", label: "Machine Types", requireRole: "manager" },
  { to: "/admin/machines", label: "Machines", requireRole: "manager" },
  { to: "/admin/uoms", label: "Units of Measure", requireRole: "manager" },
  { to: "/admin/parameters", label: "Parameters", requireRole: "manager" },
  { to: "/admin/crusher-units", label: "Crusher Units", requireRole: "manager" },
  { to: "/admin/delivery-destinations", label: "Delivery Destinations", requireRole: "manager" },
  { to: "/admin/downtime-reasons", label: "Downtime Reason Codes", requireRole: "manager" },
  { to: "/admin/shift-patterns", label: "Shift Patterns", requireRole: "manager" },
  { to: "/admin/teams", label: "Teams", requireRole: "manager" },
  { to: "/admin/team-members", label: "Team Members", requireRole: "manager" },
  { to: "/admin/shifts", label: "Shifts", requireRole: "manager" },
  { to: "/admin/shift-instances", label: "Shift Instances", requireRole: "manager" },
  { to: "/admin/plan-targets", label: "Plan Targets", requireRole: "manager" },
  { to: "/admin/breakdown-causes", label: "Breakdown Causes", requireRole: "manager" },
  { to: "/admin/checklist-items", label: "Checklist Items", requireRole: "manager" },
  { to: "/admin/hourly-slots", label: "Hourly Slots", requireRole: "manager" },
];

function NavSection({
  title,
  items,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const { hasRole } = useAuth();
  const visibleItems = items.filter((item) => !item.requireRole || hasRole(item.requireRole));
  if (visibleItems.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </div>
      <nav className="flex flex-col gap-0.5">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-brand-50 font-medium text-brand-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
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

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { hasRole } = useAuth();
  return (
    <div className="flex h-full flex-col overflow-y-auto py-4">
      <div className="mb-4 px-3">
        <div className="text-sm font-bold text-slate-900">Mining Production</div>
        <div className="text-xs text-slate-500">Manager Dashboard</div>
      </div>
      <NavSection title="Operate" items={OPERATE_ITEMS} onNavigate={onNavigate} />
      <NavSection title="Dashboard" items={DASHBOARD_ITEMS} onNavigate={onNavigate} />
      <NavSection title="Entries" items={ENTRY_ITEMS} onNavigate={onNavigate} />
      <NavSection title="Crusher Plant" items={CRUSHER_PLANT_ITEMS} onNavigate={onNavigate} />
      <NavSection title="Master Data" items={MASTER_DATA_ITEMS} onNavigate={onNavigate} />
      {hasRole("supervisor") && (
        <NavSection
          title="Audit"
          items={[{ to: "/audit-log", label: "Audit Log" }]}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:block">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <button
        type="button"
        className="fixed bottom-4 left-4 z-30 rounded-full bg-brand-600 p-3 text-white shadow-lg md:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </button>
    </>
  );
}
