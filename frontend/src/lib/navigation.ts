import {
  LayoutDashboard,
  Store,
  PiggyBank,
  ArrowLeftRight,
  FileUp,
  Settings2,
} from "lucide-react";

export const pages = [
  {
    path: "/",
    view: "overview",
    icon: LayoutDashboard,
    title: "Overview",
    description: "Spending across your imported accounts.",
  },
  {
    path: "/reports/vendors",
    view: "vendors",
    icon: Store,
    title: "Vendor analysis",
    description: "Explore spending by vendor.",
  },
  {
    path: "/reports/savings",
    view: "savings",
    icon: PiggyBank,
    title: "Savings opportunities",
    description: "Review recurring costs and spending targets.",
  },
  {
    path: "/transactions",
    view: "transactions",
    icon: ArrowLeftRight,
    title: "Transactions",
    description: "Find, categorize, and review every transaction.",
  },
  {
    path: "/imports",
    view: "imports",
    icon: FileUp,
    title: "Imports",
    description:
      "Upload an export, check the extraction, then approve the rows.",
  },
  {
    path: "/settings",
    view: "settings",
    icon: Settings2,
    title: "AI & rules",
    description:
      "Choose a provider and teach the app your merchant preferences.",
  },
] as const;
