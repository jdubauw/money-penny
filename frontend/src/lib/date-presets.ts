export const DATE_PRESETS = [
  "All time",
  "This month",
  "Last month",
  "This quarter",
  "Last quarter",
  "This year",
  "Last year",
  "Custom range",
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];
export type DateRange = { start: string; end: string };

// Calendar boundaries use local dates; UTC conversion would shift dates in some time zones.
function iso(year: number, month: number, day: number) {
  const date = new Date(year, month, day, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function presetRange(
  preset: DatePreset,
  today = new Date(),
): DateRange | null {
  const year = today.getFullYear(),
    month = today.getMonth(),
    quarter = Math.floor(month / 3) * 3;
  switch (preset) {
    case "All time":
      return { start: "", end: "" };
    case "This month":
      return { start: iso(year, month, 1), end: iso(year, month + 1, 0) };
    case "Last month":
      return { start: iso(year, month - 1, 1), end: iso(year, month, 0) };
    case "This quarter":
      return { start: iso(year, quarter, 1), end: iso(year, quarter + 3, 0) };
    case "Last quarter":
      return { start: iso(year, quarter - 3, 1), end: iso(year, quarter, 0) };
    case "This year":
      return { start: iso(year, 0, 1), end: iso(year, 11, 31) };
    case "Last year":
      return { start: iso(year - 1, 0, 1), end: iso(year - 1, 11, 31) };
    default:
      return null;
  }
}
export function rangePreset(range: DateRange, today = new Date()): DatePreset {
  return (
    DATE_PRESETS.find((preset) => {
      const candidate = presetRange(preset, today);
      return candidate?.start === range.start && candidate.end === range.end;
    }) || "Custom range"
  );
}
