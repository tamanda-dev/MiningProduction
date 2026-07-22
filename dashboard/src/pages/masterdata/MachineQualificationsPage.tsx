import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { QualificationsModal } from "@/components/users/QualificationsModal";
import { api } from "@/lib/api";
import type { Paginated, UserSummary } from "@/types";

// Standalone Supervisor+ entry point into the same qualification-granting
// UI the (Admin-only) Users page also offers — Supervisors don't get the
// rest of that page (create/disable users, reset passwords, role/site
// grants stay Admin-only), just this one piece: assigning which machine
// types an operator is certified to activate, which is a day-to-day
// supervisory call, not an account-management one.
export function MachineQualificationsPage() {
  const [qualificationsUser, setQualificationsUser] = useState<UserSummary | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["users", "for-qualifications"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<UserSummary>>("/users/", { params: { page_size: 500 } });
      return data.results;
    },
  });

  const rows = data ?? [];

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Assign Machines to Operators</h1>

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
                <th className="px-4 py-3 font-medium">Employee Code</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{user.username}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {[user.first_name, user.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{user.employee_code || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setQualificationsUser(user)}
                      className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
                    >
                      Machines
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <QualificationsModal user={qualificationsUser} onClose={() => setQualificationsUser(null)} />
    </div>
  );
}
