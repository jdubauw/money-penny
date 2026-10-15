import { Skeleton } from "@/components/ui/skeleton";

export function Loading() {
  return (
    <div aria-label="Loading" className="space-y-4 py-6">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
