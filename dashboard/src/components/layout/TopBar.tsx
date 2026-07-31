import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { Modal } from "@/components/common/Modal";
import { api } from "@/lib/api";
import { ROLE_COLOR } from "@/lib/chartTheme";
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

export function displayName(user: { first_name?: string; last_name?: string; username?: string } | null | undefined) {
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  return fullName || user?.username || "";
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const changeMutation = useMutation({
    mutationFn: async () =>
      api.post("/auth/change-password/", { current_password: currentPassword, new_password: newPassword }),
    onSuccess: () => setDone(true),
    onError: (err) => setError(extractErrorMessage(err)),
  });

  function handleClose() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setDone(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Change Password">
      <div className="flex flex-col gap-3">
        {done ? (
          <p className="text-sm text-emerald-700">Password changed.</p>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          </>
        )}

        {error && <ErrorMessage message={error} />}

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>
            {done ? "Close" : "Cancel"}
          </Button>
          {!done && (
            <Button
              onClick={() => {
                setError(null);
                if (!currentPassword) {
                  setError("Current password is required.");
                  return;
                }
                if (!newPassword || newPassword !== confirmPassword) {
                  setError("New password and confirmation do not match.");
                  return;
                }
                changeMutation.mutate();
              }}
              disabled={changeMutation.isPending}
            >
              {changeMutation.isPending ? "Changing…" : "Change Password"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-4 py-2 md:px-6">
      <div className="flex flex-wrap items-center gap-1.5">
        {user?.roles.map((r) => (
          <Badge key={r} label={r[0].toUpperCase() + r.slice(1)} color={ROLE_COLOR[r]} variant="soft" />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <SiteSwitcher />
        <div className="max-w-[10rem] truncate text-sm font-medium text-slate-700 sm:max-w-none">
          {displayName(user)}
        </div>
        <Button variant="secondary" size="sm" onClick={() => setChangePasswordOpen(true)}>
          <span className="sm:hidden">Password</span>
          <span className="hidden sm:inline">Change Password</span>
        </Button>
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
      <ChangePasswordModal open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
    </header>
  );
}
