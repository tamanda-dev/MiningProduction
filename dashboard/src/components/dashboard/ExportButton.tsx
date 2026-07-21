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

type ExportButtonProps =
  | { reportType?: "shift"; shiftInstanceId: number }
  | { reportType: "daily"; siteId: number; date: string }
  | { reportType: "mtd"; siteId: number; year: number; month: number };

function buildExportBody(props: ExportButtonProps): Record<string, unknown> {
  const reportType = props.reportType ?? "shift";
  if (reportType === "daily") {
    return { report_type: "daily", site: props.siteId, date: props.date };
  }
  if (reportType === "mtd") {
    return { report_type: "mtd", site: props.siteId, year: props.year, month: props.month };
  }
  return { shift_instance: props.shiftInstanceId };
}

export function ExportButton(props: ExportButtonProps) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trigger = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ExportStatus>("/dashboard/export/", buildExportBody(props));
      return data;
    },
    onSuccess: (data) => {
      setError(null);
      setTaskId(data.task_id);
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  const { data: statusData } = useQuery({
    queryKey: ["export-status", taskId],
    queryFn: async () => {
      const { data } = await api.get<ExportStatus>(`/dashboard/export/${taskId}/`);
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
        onClick={() => trigger.mutate()}
        disabled={trigger.isPending}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {trigger.isPending ? "Generating…" : "Export XLSX"}
      </button>
      {taskId && !isDone && <span className="text-xs text-slate-400">Processing…</span>}
      {downloadUrl && (
        <a
          href={downloadUrl.startsWith("http") ? downloadUrl : `${API_BASE_URL.replace(/\/api\/?$/, "")}${downloadUrl}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-brand-600 hover:underline"
        >
          Download
        </a>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
