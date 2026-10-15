import { useMemo } from "react";
import { defineChart } from "@tanstack/charts";
import { pie, polar, radialArc } from "@tanstack/charts/polar";
import { Chart } from "@tanstack/charts/react";
import { tooltip } from "@tanstack/charts/tooltip";
import { money } from "@/lib/api";
import type { SpendingCategory } from "@/lib/types";
import { categoryColor } from "@/lib/chart-theme";
import { palette } from "@/lib/chart-theme";
import { chartTheme } from "@/lib/chart-theme";
import { datumCategoryName } from "@/lib/chart-theme";

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
