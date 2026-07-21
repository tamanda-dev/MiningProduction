import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { useSiteFilter } from "@/lib/SiteFilterContext";

function SiteSwitcher() {
  const { sites, siteId, setSiteId } = useSiteFilter();
  if (sites.length <= 1) return null;
  return (
    <select
      value={siteId ?? ""}
      onChange={(e) => setSiteId(e.target.value ? Number(e.target.value) : null)}
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
    >
      {sites.map((site) => (
        <option key={site.id} value={site.id}>
          {site.name}
        </option>
      ))}
    </select>
  );
}

export function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
      <div className="flex flex-wrap items-center gap-1.5">
        {user?.roles.map((r) => (
          <Badge key={r} label={r[0].toUpperCase() + r.slice(1)} color="#64748b" variant="soft" />
        ))}
      </div>
      <div className="flex items-center gap-4">
        <SiteSwitcher />
        <div className="text-sm font-medium text-slate-700">
          {user?.first_name || user?.username}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          Sign out
        </Button>
      </div>
    </header>
  );
}
