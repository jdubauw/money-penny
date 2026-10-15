export type Vendor = {
  vendor: string;
  account: string;
  category: string;
  accounts: string[];
  spend_cents: number;
  count: number;
  average_cents: number | null;
  largest_cents: number | null;
};

export type Service = {
  vendor: string;
  category: string;
  cadence: string;
  cost_cents: number;
  confirmed: boolean;
  decision: string;
  spend_cents: number;
  months_charged: number;
  last_charge: string | null;
  annual_cents: number;
  savings_cents: number;
};

export type Target = {
  category: string;
  spend_cents: number;
  annual_cents: number;
  percent: number;
  savings_cents: number;
};

export type Savings = {
  services: Service[];
  targets: Target[];
  observed_months: number;
  missing_months: string[];
  observed_start: string | null;
  observed_end: string | null;
  total_savings_cents: number;
};
