export function Pagination({
  page,
  pageCount,
  totalCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  totalCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
      <span>{totalCount.toLocaleString()} total</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="rounded-md border border-slate-300 px-2.5 py-1 font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 hover:enabled:bg-slate-50"
        >
          Prev
        </button>
        <span>
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          className="rounded-md border border-slate-300 px-2.5 py-1 font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 hover:enabled:bg-slate-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
