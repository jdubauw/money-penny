import type { SpendingReport } from "@/lib/types";

export function shiftedPeriod(report: SpendingReport, offset: number) {
  const day = new Date(report.start + "T12:00:00");
  day.setMonth(
    day.getMonth() +
      offset *
        (report.view === "monthly" ? 1 : report.view === "quarterly" ? 3 : 12),
  );
  return report.view === "yearly"
    ? String(day.getFullYear())
    : report.view === "quarterly"
      ? `${day.getFullYear()}-Q${Math.ceil((day.getMonth() + 1) / 3)}`
      : `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`;
}
