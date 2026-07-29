import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { extractErrorMessage } from "@/components/common/ErrorMessage";
import { API_BASE_URL, api } from "@/lib/api";

interface ExportStatus {
  task_id: string;
  status: string;
  download_url?: string;
  error?: string;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayRange(): { date_from: string; date_to: string } {
  const today = toDateString(new Date());
  return { date_from: today, date_to: today };
}

function monthToDateRange(): { date_from: string; date_to: string } {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return { date_from: toDateString(monthStart), date_to: toDateString(now) };
}

/** Triggers the async Crusher Plant PDF export (crusher_ops.tasks.
 * generate_crusher_plant_report) for either "today" or "month to date" —
 * the two ranges a Supervisor actually asks for day to day. Mirrors
 * components/dashboard/ExportButton's trigger/poll shape, but against the
 * crusher-ops export endpoint (site+date_from+date_to, PDF not XLSX).
 */
export function CrusherPlantExportButton({ siteId }: { siteId: number | null }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trigger = useMutation({
    mutationFn: async (range: { date_from: string; date_to: string }) => {
      const { data } = await api.post<ExportStatus>("/crusher-ops/dashboard/export/", {
        site: siteId,
        ...range,
      });
      return data;
    },
    onSuccess: (data) => {
      setError(null);
      setTaskId(data.task_id);
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  const { data: statusData } = useQuery({
    queryKey: ["crusher-export-status", taskId],
    queryFn: async () => {
      const { data } = await api.get<ExportStatus>(`/crusher-ops/dashboard/export/${taskId}/`);
      return data;
    },
    enabled: Boolean(taskId),
    refetchInterval: (query) => (query.state.data?.status === "success" ? false : 2000),
  });

  const downloadUrl = trigger.data?.download_url ?? statusData?.download_url;
  const isDone = statusData?.status === "success" || Boolean(trigger.data?.download_url);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setTaskId(null);
          trigger.mutate(todayRange());
        }}
        disabled={!siteId || trigger.isPending}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {trigger.isPending ? "Generating…" : "Download Today's Report"}
      </button>
      <button
        type="button"
        onClick={() => {
          setTaskId(null);
          trigger.mutate(monthToDateRange());
        }}
        disabled={!siteId || trigger.isPending}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {trigger.isPending ? "Generating…" : "Download Month-to-Date Report"}
      </button>
      {taskId && !isDone && <span className="text-xs text-slate-400">Processing…</span>}
      {downloadUrl && (
        <a
          href={downloadUrl.startsWith("http") ? downloadUrl : `${API_BASE_URL.replace(/\/api\/?$/, "")}${downloadUrl}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-brand-600 hover:underline"
        >
          Download PDF
        </a>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
