import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Modal } from "@/components/common/Modal";
import { QualificationsModal, userLabel } from "@/components/users/QualificationsModal";
import { api } from "@/lib/api";
import { NEUTRAL, ROLE_COLOR, STATUS } from "@/lib/chartTheme";
import { useLookup } from "@/lib/useLookup";
import type { MachineType, MachineTypeQualification, Paginated, Role, Section, Site, UserDetail, UserSiteAccess } from "@/types";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "supervisor", label: "Supervisor" },
  { value: "operator", label: "Operator" },
];

const EMPTY_PROFILE_FORM = {
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  employee_code: "",
  maintenance_technician: false,
};

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_PROFILE_FORM, password: "", confirmPassword: "", role: "operator" as Role });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const { confirmPassword: _confirmPassword, maintenance_technician: _mt, ...payload } = form;
      // employee_code is unique+nullable on the backend — two users both
      // left blank would submit "" and collide on that constraint; null
      // means "no code" without touching uniqueness (matches how seeded
      // users without a code already store it).
      return api.post("/users/", { ...payload, employee_code: payload.employee_code || null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      handleClose();
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    createMutation.mutate();
  }

  // CreateUserModal is mounted persistently (only Modal's own `open` gates
  // rendering), so unlike Cancel resetting nothing, closing without saving
  // used to leave the typed username/email/password sitting in state —
  // reopening "Add User" later showed the previous attempt's data.
  function handleClose() {
    setForm({ ...EMPTY_PROFILE_FORM, password: "", confirmPassword: "", role: "operator" });
    setError(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add User">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Username <span className="text-red-500">*</span>
          </label>
          <input
            value={form.username}
            required
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">First Name</label>
            <input
              value={form.first_name}
              onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Last Name</label>
            <input
              value={form.last_name}
              onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Employee Code</label>
          <input
            value={form.employee_code}
            onChange={(e) => setForm((f) => ({ ...f, employee_code: e.target.value }))}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Role <span className="text-red-500">*</span>
          </label>
          <select
            value={form.role}
            required
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={form.password}
              required
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Confirm Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={form.confirmPassword}
              required
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        {error && <ErrorMessage message={error} />}

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create User"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({ user, onClose }: { user: UserDetail | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const editMutation = useMutation({
    mutationFn: async (values: typeof EMPTY_PROFILE_FORM) =>
      api.patch(`/users/${user!.id}/`, { ...values, employee_code: values.employee_code || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  return (
    <Modal open={user !== null} onClose={onClose} title={user ? `Edit ${userLabel(user)}` : "Edit User"}>
      {user && (
        <UserEditForm
          key={user.id}
          user={user}
          onSubmit={(values) => {
            setError(null);
            editMutation.mutate(values);
          }}
          onCancel={onClose}
          error={error}
          isPending={editMutation.isPending}
        />
      )}
    </Modal>
  );
}

function UserEditForm({
  user,
  onSubmit,
  onCancel,
  error,
  isPending,
}: {
  user: UserDetail;
  onSubmit: (values: typeof EMPTY_PROFILE_FORM) => void;
  onCancel: () => void;
  error: string | null;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    username: user.username,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    employee_code: user.employee_code ?? "",
    maintenance_technician: user.maintenance_technician,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="flex flex-col gap-3"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Username <span className="text-red-500">*</span>
        </label>
        <input
          value={form.username}
          required
          onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">First Name</label>
          <input
            value={form.first_name}
            onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Last Name</label>
          <input
            value={form.last_name}
            onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Employee Code</label>
        <input
          value={form.employee_code}
          onChange={(e) => setForm((f) => ({ ...f, employee_code: e.target.value }))}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.maintenance_technician}
          onChange={(e) => setForm((f) => ({ ...f, maintenance_technician: e.target.checked }))}
          className="h-4 w-4 rounded border-slate-300"
        />
        Maintenance technician (eligible as breakdown-incident artisan)
      </label>

      {error && <ErrorMessage message={error} />}

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function RoleModal({ user, onClose }: { user: UserDetail | null; onClose: () => void }) {
  return (
    <Modal open={user !== null} onClose={onClose} title={user ? `Change Role — ${userLabel(user)}` : "Change Role"}>
      {/* key={user.id} forces a fresh instance per user opened, so `role`
          below seeds from THIS user's current role every time — without
          it, RoleModal stays mounted across opens and `role` would keep
          whatever the previously-viewed user's selection was, silently
          reassigning a different role than what's shown as "current" if
          Save is clicked without touching the dropdown first. */}
      {user && <RoleModalForm key={user.id} user={user} onClose={onClose} />}
    </Modal>
  );
}

function RoleModalForm({ user, onClose }: { user: UserDetail; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<Role>(user.roles[0] ?? "operator");
  const [error, setError] = useState<string | null>(null);

  const assignMutation = useMutation({
    mutationFn: async () => api.post(`/users/${user.id}/assign_role/`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        A user has exactly one role. Changing it replaces their current role entirely.
      </p>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      >
        {ROLE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {error && <ErrorMessage message={error} />}

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => { setError(null); assignMutation.mutate(); }} disabled={assignMutation.isPending}>
          {assignMutation.isPending ? "Saving…" : "Save Role"}
        </Button>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose }: { user: UserDetail | null; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const resetMutation = useMutation({
    mutationFn: async () => api.post(`/users/${user!.id}/reset_password/`, { new_password: newPassword }),
    onSuccess: () => setDone(true),
    onError: (err) => setError(extractErrorMessage(err)),
  });

  function handleClose() {
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setDone(false);
    onClose();
  }

  return (
    <Modal open={user !== null} onClose={handleClose} title={user ? `Reset Password — ${userLabel(user)}` : "Reset Password"}>
      {user && (
        <div className="flex flex-col gap-3">
          {done ? (
            <p className="text-sm text-emerald-700">Password reset. Share the new password with the user securely.</p>
          ) : (
            <>
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
                <label className="mb-1 block text-xs font-medium text-slate-600">Confirm Password</label>
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
                  if (!newPassword || newPassword !== confirmPassword) {
                    setError("Passwords do not match.");
                    return;
                  }
                  resetMutation.mutate();
                }}
                disabled={resetMutation.isPending}
              >
                {resetMutation.isPending ? "Resetting…" : "Reset Password"}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function AccessModal({ user, onClose }: { user: UserDetail | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: sites } = useLookup<Site>("sites");
  const { data: sections } = useLookup<Section>("sections");
  const [site, setSite] = useState<string>("");
  const [section, setSection] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { data: grants, isLoading } = useQuery({
    queryKey: ["user-site-accesses", user?.id],
    queryFn: async () => {
      const { data } = await api.get<Paginated<UserSiteAccess>>("/user-site-accesses/", {
        params: { user: user!.id, page_size: 500 },
      });
      return data.results;
    },
    enabled: user !== null,
  });

  const addMutation = useMutation({
    mutationFn: async () =>
      api.post("/user-site-accesses/", {
        user: user!.id,
        site: Number(site),
        section: section ? Number(section) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-site-accesses", user?.id] });
      setSite("");
      setSection("");
      setError(null);
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  const removeMutation = useMutation({
    mutationFn: async (grantId: number) => api.delete(`/user-site-accesses/${grantId}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-site-accesses", user?.id] }),
  });

  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? id;
  const sectionName = (id: number | null) => (id ? sections?.find((s) => s.id === id)?.name ?? id : "Whole site");
  const sectionsForSelectedSite = sections?.filter((s) => String(s.site) === site) ?? [];

  function handleClose() {
    setSite("");
    setSection("");
    setError(null);
    onClose();
  }

  return (
    <Modal open={user !== null} onClose={handleClose} title={user ? `Site Access — ${userLabel(user)}` : "Site Access"} wide>
      {user && (
        <div className="flex flex-col gap-4">
          {isLoading && <LoadingSpinner />}
          {grants && grants.length === 0 && <EmptyState message="No site access grants yet." className="py-6" />}
          {grants && grants.length > 0 && (
            <ul className="flex flex-col gap-2">
              {grants.map((grant) => (
                <li
                  key={grant.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <span>
                    {siteName(grant.site)} — <span className="text-slate-500">{sectionName(grant.section)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate(grant.id)}
                    disabled={removeMutation.isPending}
                    className="font-medium text-red-600 hover:text-red-700 hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Add Access</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Site</label>
                <select
                  value={site}
                  onChange={(e) => {
                    setSite(e.target.value);
                    setSection("");
                  }}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {sites?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Section <span className="font-normal text-slate-400">(blank = whole site)</span>
                </label>
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  disabled={!site}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50"
                >
                  <option value="">—</option>
                  {sectionsForSelectedSite.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && (
              <div className="mt-2">
                <ErrorMessage message={error} />
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                disabled={!site || addMutation.isPending}
                onClick={() => addMutation.mutate()}
              >
                {addMutation.isPending ? "Adding…" : "+ Add Access"}
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="secondary" onClick={handleClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDetail | null>(null);
  const [roleUser, setRoleUser] = useState<UserDetail | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserDetail | null>(null);
  const [accessUser, setAccessUser] = useState<UserDetail | null>(null);
  const [qualificationsUser, setQualificationsUser] = useState<UserDetail | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["users", "management"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<UserDetail>>("/users/", { params: { page_size: 500 } });
      return data.results;
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (user: UserDetail) => api.post(`/users/${user.id}/${user.is_active ? "disable" : "enable"}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const rows = data ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Users</h1>
        <Button onClick={() => setCreateOpen(true)}>+ Add User</Button>
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load users." />}

      {data && rows.length === 0 && <EmptyState message="No users yet." />}

      {rows.length > 0 && (
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Employee Code</th>
                <th className="px-4 py-3 font-medium">Roles</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{user.username}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {[user.first_name, user.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{user.email || "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{user.employee_code || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        user.roles.map((role) => (
                          <Badge key={role} label={role} color={ROLE_COLOR[role]} variant="soft" />
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      label={user.is_active ? "Active" : "Disabled"}
                      color={user.is_active ? STATUS.good : NEUTRAL}
                      variant="soft"
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingUser(user)}
                      className="mr-3 font-medium text-brand-600 hover:text-brand-700 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoleUser(user)}
                      className="mr-3 font-medium text-brand-600 hover:text-brand-700 hover:underline"
                    >
                      Role
                    </button>
                    <button
                      type="button"
                      onClick={() => setPasswordUser(user)}
                      className="mr-3 font-medium text-brand-600 hover:text-brand-700 hover:underline"
                    >
                      Password
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccessUser(user)}
                      className="mr-3 font-medium text-brand-600 hover:text-brand-700 hover:underline"
                    >
                      Access
                    </button>
                    <button
                      type="button"
                      onClick={() => setQualificationsUser(user)}
                      className="mr-3 font-medium text-brand-600 hover:text-brand-700 hover:underline"
                    >
                      Machines
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActiveMutation.mutate(user)}
                      disabled={toggleActiveMutation.isPending}
                      className={
                        user.is_active
                          ? "font-medium text-red-600 hover:text-red-700 hover:underline"
                          : "font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
                      }
                    >
                      {user.is_active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} />
      <RoleModal user={roleUser} onClose={() => setRoleUser(null)} />
      <ResetPasswordModal user={passwordUser} onClose={() => setPasswordUser(null)} />
      <AccessModal user={accessUser} onClose={() => setAccessUser(null)} />
      <QualificationsModal user={qualificationsUser} onClose={() => setQualificationsUser(null)} />
    </div>
  );
}
