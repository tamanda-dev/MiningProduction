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

export const MACHINE_STATUS_COLOR: Record<string, string> = {
  active: STATUS.good,
  breakdown: STATUS.critical,
  maintenance: STATUS.warning,
  retired: "#898781",
};

export const ENTRY_STATUS_COLOR: Record<string, string> = {
  submitted: "#898781",
  flagged: STATUS.warning,
  corrected: CATEGORICAL[0],
  approved: STATUS.good,
};

export const CHART_INK = {
  primary: "#0b0b0b",
  secondary: "#52514e",
  muted: "#898781",
  gridline: "#e1e0d9",
  axis: "#c3c2b7",
};
