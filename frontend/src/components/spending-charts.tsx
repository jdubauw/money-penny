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
function activate(event: React.KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}
export function SpendingBars({
  series,
  average,
  onSelect,
}: {
  series: SpendingPeriod[];
  average: number | null;
  onSelect: (key: string) => void;
}) {
  const high = Math.max(100, ...series.map((p) => p.spend_cents), average ?? 0);
  const low = Math.min(0, ...series.map((p) => p.spend_cents), average ?? 0);
  const step = Math.pow(10, Math.floor(Math.log10(high - low))) / 2;
  const maximum = Math.ceil(high / step) * step,
    minimum = Math.floor(low / step) * step;
  const top = 20,
    bottom = 232,
    left = 10,
    right = 375;
  const y = (value: number) =>
    bottom - ((value - minimum) / (maximum - minimum)) * (bottom - top);
  const spacing = (right - left) / series.length;
  return (
    <svg
      viewBox="0 0 450 300"
      className="w-full report-bars"
      role="group"
      aria-label="Spending history. Select a period to update the report."
    >
      <defs>
        <pattern
          id="no-imports"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
        >
          <path d="M0 6L6 0" className="missing-stroke" />
        </pattern>
      </defs>
      {[0, 1, 2, 3, 4].map((i) => {
        const value = minimum + ((maximum - minimum) * i) / 4;
        return (
          <g key={i}>
            <line
              x1={left}
              x2={right}
              y1={y(value)}
              y2={y(value)}
              className="chart-grid"
            />
            <text x={right + 10} y={y(value) + 4} className="chart-label">
              {Math.abs(value) >= 100000
                ? (value / 100000).toFixed(1).replace(".0", "") + "k"
                : (value / 100).toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })}
            </text>
          </g>
        );
      })}
      {average !== null && (
        <line
          x1={left}
          x2={right}
          y1={y(average)}
          y2={y(average)}
          className="chart-average"
        />
      )}
      {series.map((p, i) => {
        const x = left + spacing * i + spacing * 0.15,
          zero = y(0),
          value = y(p.spend_cents),
          label = p.label.replace(/ (\d{4})$/, "");
        return (
          <g
            key={p.key}
            role="button"
            tabIndex={0}
            aria-label={
              p.label +
              ": " +
              (p.has_data ? money(p.spend_cents) : "no imported transactions")
            }
            onClick={() => onSelect(p.key)}
            onKeyDown={(e) => activate(e, () => onSelect(p.key))}
            data-series-period={p.key}
            className="chart-period cursor-pointer"
          >
            <title>
              {p.label +
                " · " +
                (p.has_data
                  ? money(p.spend_cents)
                  : "No imported transactions")}
            </title>
            <rect
              x={x}
              width={spacing * 0.7}
              y={p.has_data ? Math.min(zero, value) : zero - 12}
              height={p.has_data ? Math.max(2, Math.abs(value - zero)) : 12}
              className={
                p.has_data
                  ? p.is_selected
                    ? "chart-bar-selected"
                    : "chart-bar"
                  : "chart-missing"
              }
            />
            <text
              x={x + spacing * 0.35}
              y={bottom + 25}
              textAnchor="middle"
              className={
                "chart-label " + (p.is_selected ? "selected-label" : "")
              }
            >
              {/^\d{4}-\d{2}$/.test(p.key) ? label.slice(0, 3) : label}
            </text>
            <text
              x={x + spacing * 0.35}
              y={bottom + 44}
              textAnchor="middle"
              className="chart-label"
            >
              {/^\d{4}$/.test(p.label) ? "" : p.label.match(/\d{4}$/)?.[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
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
  const radius = 88,
    circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg
      viewBox="0 0 260 260"
      className="report-donut w-full"
      role="group"
      aria-label="Category spending distribution. Select a category to see transactions."
    >
      <circle
        cx="130"
        cy="130"
        r={radius}
        className="donut-track"
        fill="none"
        strokeWidth="32"
      />
      {categories
        .filter((c) => c.amount_cents > 0)
        .map((c) => {
          const size = (c.amount_cents / total) * circumference,
            start = offset;
          offset += size;
          return (
            <circle
              key={c.name}
              cx="130"
              cy="130"
              r={radius}
              fill="none"
              strokeWidth="32"
              strokeDasharray={Math.max(0, size - 1.5) + " " + circumference}
              strokeDashoffset={-start}
              transform="rotate(-90 130 130)"
              role="button"
              tabIndex={0}
              onClick={() => onSelect(c.name)}
              onKeyDown={(e) => activate(e, () => onSelect(c.name))}
              aria-label={c.name + ": " + money(c.amount_cents)}
              className={
                categoryColor(c.name) + " donut-segment cursor-pointer"
              }
              data-donut-category={c.name}
            >
              <title>
                {c.name +
                  ": " +
                  money(c.amount_cents) +
                  " (" +
                  c.percent +
                  "%)"}
              </title>
            </circle>
          );
        })}
      <text x="130" y="123" textAnchor="middle" className="donut-label">
        {positiveOnly ? "Positive balances" : "Total"}
      </text>
      <text x="130" y="148" textAnchor="middle" className="donut-total">
        {money(total)}
      </text>
    </svg>
  );
}
