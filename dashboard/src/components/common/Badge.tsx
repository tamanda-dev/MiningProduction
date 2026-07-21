export function Badge({
  label,
  color,
  variant = "solid",
}: {
  label: string;
  color: string;
  variant?: "solid" | "soft";
}) {
  if (variant === "soft") {
    return (
      <span
        className="rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ backgroundColor: `${color}1a`, color }}
      >
        {label}
      </span>
    );
  }
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: color }}>
      {label}
    </span>
  );
}
