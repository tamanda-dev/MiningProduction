import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/** Renders the given (already-formatted-to-strings) rows as a landscape
 * table PDF and triggers a browser download — client-side, so it works
 * uniformly for any list/table page without a dedicated backend export
 * endpoint. Exports whatever rows are passed in (the caller decides
 * whether that's the full filtered set or just the current page).
 */
export function DownloadPdfButton({
  title,
  columns,
  rows,
  filename,
}: {
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string>[];
  filename?: string;
}) {
  function handleDownload() {
    const doc = new jsPDF({ orientation: columns.length > 5 ? "landscape" : "portrait" });
    doc.setFontSize(14);
    doc.text(title, 14, 15);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Generated ${new Date().toLocaleString()}`, 14, 21);

    autoTable(doc, {
      startY: 26,
      head: [columns.map((c) => c.label)],
      body: rows.map((row) => columns.map((c) => row[c.key] ?? "")),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 64, 110] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });

    doc.save(filename ?? `${title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={rows.length === 0}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      Download PDF
    </button>
  );
}
