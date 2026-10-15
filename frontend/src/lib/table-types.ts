import { type ReactNode } from "react";

export type SortState<K extends string = string> = {
  key: K;
  direction: "asc" | "desc";
};

export type DataColumn<T, K extends string> = {
  key: K;
  label: string;
  numeric?: boolean;
  render: (row: T) => ReactNode;
};
