export interface AIConfig {
  provider: "none" | "ollama" | "openai";
  ollama_model: string;
  openai_model: string;
  ollama_url: string;
  openai_url: string;
  openai_key_configured: boolean;
}
export interface Bootstrap {
  categories: string[];
  kinds: string[];
  accounts: string[];
  ai: AIConfig;
}
export type Filters = Record<string, string>;
export interface Transaction {
  id: number;
  import_id: number;
  date: string;
  description: string;
  vendor: string;
  account: string;
  amount_cents: number;
  kind: string;
  category: string;
  subcategory: string;
  needs_review: boolean;
  category_source: string;
  explanation: string;
  version: number;
  duplicate_candidate?: boolean;
}
export interface ImportRecord {
  id: number;
  account: string;
  filename: string;
  status: string;
  error: string | null;
  row_count: number;
  warnings: string[];
  preview?: {
    rows: Transaction[];
    warnings: string[];
    reconciliation?: {
      label: string;
      expected_cents: number | null;
      actual_cents: number;
      difference_cents: number | null;
    }[];
    unparsed_lines?: string[];
  };
}
export interface Report {
  spend_cents: number;
  income_cents: number;
  unclassified_credit_cents: number;
  count: number;
  review_count: number;
  categories: [string, number][];
  months: [string, number][];
  vendors: [string, number][];
  date_start: string | null;
  date_end: string | null;
  statement_ranges: unknown[];
}
export interface Job {
  id: number;
  kind: string;
  status: string;
  error: string | null;
  result: { categorized?: number };
}
export interface Rule {
  id: number;
  vendor: string;
  category: string;
  subcategory: string;
}
export interface FilterPlan {
  start: string | null;
  end: string | null;
  search: string | null;
  category: string | null;
  account: string | null;
  kind: string | null;
  min_amount: number | null;
  max_amount: number | null;
  explanation: string;
}
export interface History {
  before: Transaction;
  after: Transaction;
  at: string;
}
