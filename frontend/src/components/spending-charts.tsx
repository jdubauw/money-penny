import { useMemo } from "react";
import { barY, defineChart, ruleY } from "@tanstack/charts";
import { pie, polar, radialArc } from "@tanstack/charts/polar";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { Chart } from "@tanstack/charts/react";
import { tooltip } from "@tanstack/charts/tooltip";
import { money } from "@/lib/api";
import type { SpendingCategory, SpendingPeriod } from "@/lib/types";

const categorySlots: Record<string, number> = {
  Shopping: 0,
  Health: 1,
  Food: 2,
  "Gifts & Giving": 3,
  Home: 4,
  "Personal Care": 5,
  Transportation: 6,
  "Bills & Utilities": 7,
  Travel: 8,
  Pets: 9,
  "Kids & Family": 10,
  Entertainment: 11,
  "Business & Technology": 12,
  "Professional Services": 13,
  "Taxes & Government": 14,
  Other: 15,
};
export function categoryColor(name: string) {
  const hash = Array.from(name).reduce(
    (value, c) => (value * 31 + c.charCodeAt(0)) >>> 0,
    0,
  );
  return "report-color-" + (categorySlots[name] ?? hash % 16);
}
const palette = [
  "--chart-pink",
  "--chart-green",
  "--chart-teal",
  "--chart-purple",
  "--chart-blue",
  "--chart-gold",
  "--chart-navy",
  "--chart-plum",
  "--chart-cyan",
  "--chart-orange",
  "--chart-olive",
  "--chart-violet",
  "--chart-brown",
  "--chart-slate",
  "--chart-red",
  "--chart-gray",
];
const chartTheme = {
  foreground: "var(--foreground)",
  muted: "var(--muted-foreground)",
  grid: "var(--border)",
  background: "var(--card)",
};
export function SpendingBars({
  series,
  average,
  onSelect,
}: {
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
                ? "var(--report-blue-selected)"
                : "var(--report-blue)",
            radius: 3,
          }),
          ...(average === null
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
            scale: () =>
              scaleBand()
                .domain(series.map((row) => row.key))
                .padding(0.25),
            axis: false,
          },
          y: {
            scale: () =>
              scaleLinear().domain([
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
        theme: chartTheme,
        tooltip: {
          use: tooltip,
          format: (point) =>
            `${point.datum.label}: ${money(point.datum.spend_cents)}`,
        },
      }),
    [series, average],
  );
  return (
    <div className="report-bars">
      <Chart
        definition={definition}
        height={240}
        ariaLabel="Spending history"
        ariaDescription="Use arrow keys to explore spending and Enter to select a period. Missing imports are listed below."
        onSelect={(point) => {
          if (point) onSelect(point.datum.key);
        }}
      />
      <div className="chart-period-list" aria-label="Select report period">
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
function datumCategoryName(datum: unknown): string | undefined {
  return datum &&
    typeof datum === "object" &&
    "name" in datum &&
    typeof datum.name === "string"
    ? datum.name
    : undefined;
}
export function CategoryDonut({
  categories,
  total,
  positiveOnly,
  onSelect,
}: {
  categories: SpendingCategory[];
  total: number;
  positiveOnly: boolean;
  onSelect: (name: string) => void;
}) {
  const definition = useMemo(() => {
    const slices = pie(
      categories.filter((row) => row.amount_cents > 0),
      { value: "amount_cents", gapAngle: 0.015 },
    );
    return defineChart({
      marks: [
        polar({
          inset: 8,
          marks: [
            radialArc(slices, {
              id: "categories",
              key: "name",
              innerRadius: ({ radius }) => radius * 0.7,
              fill: (row) =>
                `var(${palette[Number(categoryColor(row.name).replace("report-color-", ""))]})`,
            }),
          ],
          scales: { angle: null, radius: null },
        }),
      ],
      scales: { x: null, y: null },
      guides: false,
      margin: 0,
      theme: chartTheme,
      tooltip: {
        use: tooltip,
        format: (point) => {
          const row = categories.find(
            (category) => category.name === datumCategoryName(point.datum),
          );
          return row
            ? `${row.name}: ${money(row.amount_cents)} (${((row.amount_cents / total) * 100).toFixed(1)}%)`
            : "";
        },
      },
    });
  }, [categories, total]);
  return (
    <div className="report-donut relative">
      <Chart
        definition={definition}
        aspectRatio={1}
        ariaLabel="Category spending distribution"
        ariaDescription="Use arrow keys to explore categories and Enter to see transactions."
        onSelect={(point) => {
          const category = categories.find(
            (row) => row.name === datumCategoryName(point?.datum),
          );
          if (category) onSelect(category.name);
        }}
      />
      <div className="donut-center" aria-hidden="true">
        <span>{positiveOnly ? "Positive balances" : "Total"}</span>
        <strong>{money(total)}</strong>
      </div>
    </div>
  );
}
