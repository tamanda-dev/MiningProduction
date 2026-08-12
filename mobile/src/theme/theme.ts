/**
 * Field-usability theme: this app is read and tapped one-handed, in bright
 * sunlight and in dim underground light — both extremes punish low-contrast
 * UI and small tap targets. A near-black-on-white theme is deliberately
 * chosen over a "modern" dark/muted palette: glare in direct sun collapses
 * mid-tone contrast, but maximum text/background contrast survives it, and
 * screen brightness can always be raised for dim conditions (the reverse
 * isn't true). Status colors reuse the same validated palette as the web
 * dashboard (see dashboard/src/lib/chartTheme.ts) for one consistent
 * "good/warning/critical" vocabulary across both clients.
 */

export const colors = {
  background: "#FFFFFF",
  surface: "#F4F4F3",
  surfaceAlt: "#E8E8E6",
  text: "#0B0B0B",
  textMuted: "#52514E",
  border: "#33322F",
  borderLight: "#C3C2B7",
  // Same teal as the dashboard's --color-brand-600 (see dashboard/src/
  // index.css) — sampled from the Ilanga 24/7 logo, shifted a step darker
  // than the raw sample so white button text clears WCAG AA (~5.4:1)
  // instead of the ~2.3:1 the literal logo teal gives against white.
  primary: "#0E7490",
  primaryText: "#FFFFFF",
  good: "#0CA30C",
  warning: "#FAB219",
  serious: "#EC835A",
  critical: "#D03B3B",
  onWarning: "#0B0B0B", // black text/icon on the lighter warning fill for contrast
  onStatus: "#FFFFFF", // white text/icon on good/serious/critical fills
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
} as const;

// Subtle elevation for card-style surfaces (site/machine cards, the
// handover bottom sheet) — cross-platform via both the iOS shadow* props
// and Android's `elevation`, kept low so it reads as depth, not a shadow
// this app's high-contrast/outdoor-readability design would otherwise avoid.
export const shadow = {
  shadowColor: "#000000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 6,
  elevation: 2,
} as const;

export const fontSize = {
  label: 15,
  body: 18,
  button: 19,
  title: 24,
  hero: 30,
} as const;

// Minimum tap target height/width per usability guidance for gloved, rushed,
// one-handed use — well above the ~44dp platform minimum.
export const MIN_TAP_TARGET = 56;
