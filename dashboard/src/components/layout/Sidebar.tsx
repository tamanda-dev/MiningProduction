import clsx from "clsx";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { displayName } from "@/components/layout/TopBar";
import type { Role } from "@/types";

interface NavItem {
  to: string;
  label: string;
  requireRole?: Role;
  // Unlike requireRole (an allow-list — must have this role to see the
  // item), this is a deny-list: Admin is purely back-office/management
  // and was never expected to physically operate a machine, unlike a
  // Supervisor who might be stationed at a plant themselves.
  hideForAdmin?: boolean;
}

// Operating a machine is usually an Operator's job — Admin/Supervisor
// typically assign a machine to an operator instead (Master Data > Assign
// Machines / the Machine Status Board). But a Supervisor stationed at a
// plant themselves (e.g. the crusher) can self-activate one directly from
// this same screen too — visible to every authenticated non-Admin role,
// matching App.tsx's /operate/* route (auth-gated, and now also
// Admin-excluded to match this nav item).
const OPERATE_ITEMS: NavItem[] = [{ to: "/operate/session", label: "My Shift", hideForAdmin: true }];

// Site-wide analytics — Supervisor+ territory. An Operator's job is
// submitting data through the "Operate" forms, not reviewing aggregated
// production/downtime numbers, so these are hidden (and, per the matching
// requireRole guards in App.tsx, unreachable by direct URL too) for them.
const DASHBOARD_ITEMS: NavItem[] = [
  { to: "/dashboard/landing", label: "Shift-at-a-Glance", requireRole: "supervisor" },
  { to: "/dashboard/summary", label: "Live Shift View", requireRole: "supervisor" },
  { to: "/dashboard/trends", label: "Trends", requireRole: "supervisor" },
  { to: "/dashboard/availability", label: "Availability & Utilization", requireRole: "supervisor" },
  { to: "/dashboard/hourly-machine-status", label: "Availability & Breakdown", requireRole: "supervisor" },
  { to: "/dashboard/downtime", label: "Downtime Pareto", requireRole: "supervisor" },
  { to: "/dashboard/machines", label: "Machine Status", requireRole: "supervisor" },
  { to: "/dashboard/mttr", label: "MTTR Report", requireRole: "supervisor" },
  { to: "/dashboard/production-summary", label: "Production Summary", requireRole: "supervisor" },
];

const ENTRY_ITEMS: NavItem[] = [
  { to: "/entries/production", label: "Production Entries" },
  { to: "/entries/breakdowns", label: "Breakdown Logs" },
  { to: "/entries/deliveries", label: "Delivery Entries" },
];

// An Artisan's own work queue — acknowledging/fixing general-fleet
// breakdowns. Distinct from "Entries" (which is about recording production
// data) and "Crusher Plant" (which has its own, separate artisan workflow
// for crusher incidents specifically).
const ARTISAN_ITEMS: NavItem[] = [{ to: "/artisan/my-breakdowns", label: "My Breakdowns", requireRole: "artisan" }];

const CRUSHER_PLANT_ITEMS: NavItem[] = [
  { to: "/crusher/summary", label: "Summary" },
  { to: "/crusher/breakdown-pareto", label: "Breakdown Pareto" },
  { to: "/crusher/mttr-mtbf", label: "MTTR / MTBF Trend" },
  { to: "/crusher/checklist-heatmap", label: "Checklist Compliance" },
  { to: "/crusher/open-incidents", label: "Open Incidents" },
];

const MASTER_DATA_ITEMS: NavItem[] = [
  { to: "/admin/sites", label: "Sites", requireRole: "supervisor" },
  { to: "/admin/sections", label: "Sections", requireRole: "supervisor" },
  { to: "/admin/machine-types", label: "Machine Types", requireRole: "supervisor" },
  { to: "/admin/machines", label: "Machines", requireRole: "supervisor" },
  { to: "/admin/uoms", label: "Units of Measure", requireRole: "supervisor" },
  { to: "/admin/parameters", label: "Parameters", requireRole: "supervisor" },
  { to: "/admin/delivery-destinations", label: "Delivery Destinations", requireRole: "supervisor" },
  { to: "/admin/downtime-reasons", label: "Downtime Reason Codes", requireRole: "supervisor" },
  // Backed by ReadOnlyOrSupervisorOrAbove viewsets — Supervisors can write
  // here too, not just read, so the nav floor matches the route guard.
  { to: "/admin/shifts", label: "Shifts", requireRole: "supervisor" },
  { to: "/admin/shift-instances", label: "Shift Instances", requireRole: "supervisor" },
  // /api/machine-qualifications/ write access is Supervisor+ too (a
  // Supervisor is who actually knows which of their operators are
  // certified on which machine types) — not folded into the Admin-only
  // Users page's "Machines" action, which is the rest of that page.
  { to: "/admin/machine-qualifications", label: "Assign Machines", requireRole: "supervisor" },
  { to: "/admin/plan-targets", label: "Plan Targets", requireRole: "supervisor" },
  { to: "/admin/breakdown-causes", label: "Breakdown Causes", requireRole: "supervisor" },
  { to: "/admin/checklist-items", label: "Checklist Items", requireRole: "supervisor" },
  { to: "/admin/hourly-slots", label: "Hourly Slots", requireRole: "supervisor" },
];

const ADMINISTRATION_ITEMS: NavItem[] = [{ to: "/admin/users", label: "Users", requireRole: "admin" }];

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
  const visibleItems = items.filter(
    (item) => (!item.requireRole || hasRole(item.requireRole)) && !(item.hideForAdmin && hasRole("admin")),
  );
  if (visibleItems.length === 0) return null;

  return (
    <div className="mb-4 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
      <div className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
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
                "rounded-md border-l-2 px-3 py-1.5 text-sm transition-colors",
                isActive
                  ? "border-brand-600 bg-brand-50 font-medium text-brand-700"
                  : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
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
  const { hasRole, user } = useAuth();
  // Admin keeps the generic "Manager Dashboard" app-shell label. A
  // Supervisor isn't an Admin, so it's wrong for them — show their name
  // instead (per explicit product feedback). An Operator never sees this
  // shell at all (only Operate), so it gets its own label rather than a
  // name that's already shown in the top bar.
  const subtitle = hasRole("admin") ? "Manager Dashboard" : hasRole("supervisor") ? displayName(user) : "Operator Console";
  return (
    <div className="flex h-full flex-col overflow-y-auto py-4">
      <div className="mb-4 border-b border-slate-100 px-3 pb-4">
        <img src="/logo-mark.png" alt="Ilanga 24/7" className="mb-2 h-6 w-auto" />
        <div className="text-sm font-bold text-slate-900">Production Insights</div>
        <div className="text-xs text-slate-500">{subtitle}</div>
      </div>
      <NavSection title="Operate" items={OPERATE_ITEMS} onNavigate={onNavigate} />
      <NavSection title="Dashboard" items={DASHBOARD_ITEMS} onNavigate={onNavigate} />
      <NavSection title="Entries" items={ENTRY_ITEMS} onNavigate={onNavigate} />
      <NavSection title="Artisan" items={ARTISAN_ITEMS} onNavigate={onNavigate} />
      <NavSection title="Crusher Plant" items={CRUSHER_PLANT_ITEMS} onNavigate={onNavigate} />
      <NavSection title="Master Data" items={MASTER_DATA_ITEMS} onNavigate={onNavigate} />
      <NavSection title="Administration" items={ADMINISTRATION_ITEMS} onNavigate={onNavigate} />
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
