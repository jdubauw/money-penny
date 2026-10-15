import { useMemo } from "react";
import { barX, defineChart } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { Chart } from "@tanstack/charts/react";
import { tooltip } from "@tanstack/charts/tooltip";
import { money } from "@/lib/api";
import { chartTheme } from "@/lib/chart-theme";

export function CategoryComparisonBars({
  name,
  selected,
  compared,
  maximum,
  hasNegative,
}: {
  name: string;
  selected: number;
  compared?: number;
  maximum: number;
  hasNegative: boolean;
}) {
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barX(
            [
              { label: "Selected", amount: selected },
              ...(compared === undefined
                ? []
                : [{ label: "Compared", amount: compared }]),
            ],
            {
              y: "label",
              x: "amount",
              x1: 0,
              radius: 3,
              fill: (row) =>
                row.label === "Selected"
                  ? "var(--primary)"
                  : "var(--chart-compared)",
            },
          ),
        ],
        scales: {
          x: {
            scale: scaleLinear().domain([hasNegative ? -maximum : 0, maximum]),
            axis: false,
          },
          y: { scale: () => scaleBand().padding(0.25), axis: false },
        },
        guides: false,
        margin: 0,
        theme: chartTheme,
        keyboard: false,
        tooltip: {
          use: tooltip,
          format: (point) =>
            `${point.datum.label}: ${money(point.datum.amount)}`,
        },
      }),
    [selected, compared, maximum, hasNegative],
  );
  return (
    <Chart
      definition={definition}
      height={compared === undefined ? 16 : 28}
      ariaLabel={`${name} spending bars`}
    />
  );
}
