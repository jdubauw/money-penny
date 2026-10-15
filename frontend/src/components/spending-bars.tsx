import { useMemo } from "react";
import { barY, defineChart, ruleY } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { Chart } from "@tanstack/charts/react";
import { tooltip } from "@tanstack/charts/tooltip";
import { money } from "@/lib/api";
import type { SpendingPeriod } from "@/lib/types";
import { chartTheme } from "@/lib/chart-theme";

export function SpendingBars({
  series,
  average,
  onSelect,
  comparedPeriod,
  compact = false,
}: {
  comparedPeriod?: string;
  compact?: boolean;
  series: SpendingPeriod[];
  average: number | null;
  onSelect: (key: string) => void;
}) {
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(series, {
            id: "spending",
            key: "key",
            x: "key",
            y: (row) => (row.has_data ? row.spend_cents : null),
            fill: (row) =>
              row.is_selected
                ? "var(--primary)"
                : compact
                  ? row.key === comparedPeriod
                    ? "var(--chart-compared)"
                    : "var(--chart-history)"
                  : "var(--report-blue)",
            radius: 3,
          }),
          ...(average === null || compact
            ? []
            : [
                ruleY([average], {
                  stroke: "var(--muted-foreground)",
                  strokeDasharray: "4 3",
                }),
              ]),
        ],
        scales: {
          x: {
            scale: scaleBand()
              .domain(series.map((row) => row.key))
              .padding(0.25),
            axis: false,
          },
          y: {
            scale: scaleLinear().domain([
              Math.min(
                0,
                ...series
                  .filter((row) => row.has_data)
                  .map((row) => row.spend_cents),
                average ?? 0,
              ),
              Math.max(
                100,
                ...series
                  .filter((row) => row.has_data)
                  .map((row) => row.spend_cents),
                average ?? 0,
              ),
            ]),
            nice: true,
            grid: true,
            axis: {
              ticks: { count: 4, format: (value) => money(Number(value)) },
            },
          },
        },
        guides: compact ? false : undefined,
        margin: compact ? { top: 8, bottom: 0, left: 4, right: 4 } : undefined,
        theme: chartTheme,
        tooltip: {
          use: tooltip,
          format: (point) =>
            `${point.datum.label}: ${money(point.datum.spend_cents)}`,
        },
      }),
    [series, average, compact, comparedPeriod],
  );
  return (
    <div className="report-bars">
      <Chart
        definition={definition}
        height={compact ? 160 : 240}
        ariaLabel="Spending history"
        ariaDescription="Use arrow keys to explore spending and Enter to select a period. Missing imports are listed below."
        onSelect={(point) => {
          if (point) onSelect(point.datum.key);
        }}
      />
      <div
        className="chart-period-list"
        style={{
          gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))`,
          paddingLeft: compact ? 0 : undefined,
        }}
        aria-label="Select report period"
      >
        {series.map((row) => (
          <button
            key={row.key}
            type="button"
            data-series-period={row.key}
            className={
              row.has_data
                ? "chart-period-label"
                : "chart-period-label chart-period-missing"
            }
            aria-pressed={row.is_selected}
            aria-label={`${row.label}: ${row.has_data ? money(row.spend_cents) : "no imported transactions"}`}
            onClick={() => onSelect(row.key)}
          >
            {/^\d{4}-\d{2}$/.test(row.key)
              ? row.label.slice(0, 3)
              : row.label.replace(/ \d{4}$/, "")}
            {!/^\d{4}$/.test(row.key) && (
              <span className="block text-[10px] text-muted-foreground">
                {row.label.match(/\d{4}$/)?.[0]}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
