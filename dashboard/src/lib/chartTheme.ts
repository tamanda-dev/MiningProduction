// Validated categorical/status palette (light mode) — see the dataviz skill's
// references/palette.md. Order is fixed (the CVD-safety mechanism); never
// cycle/reassign per-filter. Dark-mode chart theming is out of scope for this
// build (the dashboard shell itself is light-mode only for now).

export const CATEGORICAL: readonly string[] = [
  "#2a78d6", // blue
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
  "#e87ba4", // magenta
  "#eb6834", // orange
];

export const SEQUENTIAL_BLUE = {
  100: "#cde2fb",
  200: "#9ec5f4",
  300: "#6da7ec",
  400: "#3987e5",
  500: "#256abf",
  600: "#184f95",
  700: "#0d366b",
};

export const DIVERGING = {
  positive: "#2a78d6", // blue
  negative: "#e34948", // red
  midpoint: "#f0efec",
};

export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

// The one neutral grey every "inactive/unset/no status" case across the
// app uses — a single named export so it can't silently drift out of sync
// across the handful of places that need it (previously duplicated as a
// bare hex literal in several of them).
export const NEUTRAL = "#898781";

export const MACHINE_STATUS_COLOR: Record<string, string> = {
  active: STATUS.good,
  breakdown: STATUS.critical,
  maintenance: STATUS.warning,
  retired: NEUTRAL,
};

export const ENTRY_STATUS_COLOR: Record<string, string> = {
  submitted: NEUTRAL,
  flagged: STATUS.warning,
  corrected: CATEGORICAL[0],
  approved: STATUS.good,
};

export const ROLE_COLOR: Record<string, string> = {
  admin: CATEGORICAL[5],
  supervisor: CATEGORICAL[4],
  operator: CATEGORICAL[1],
};

export const CHART_INK = {
  primary: "#0b0b0b",
  secondary: "#52514e",
  muted: NEUTRAL,
  gridline: "#e1e0d9",
  axis: "#c3c2b7",
};
