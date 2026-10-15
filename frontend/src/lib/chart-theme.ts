export const categorySlots: Record<string, number> = {
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

export const palette = [
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

export const chartTheme = {
  foreground: "var(--foreground)",
  muted: "var(--muted-foreground)",
  grid: "var(--border)",
  background: "var(--card)",
};

export function datumCategoryName(datum: unknown): string | undefined {
  return datum &&
    typeof datum === "object" &&
    "name" in datum &&
    typeof datum.name === "string"
    ? datum.name
    : undefined;
}
