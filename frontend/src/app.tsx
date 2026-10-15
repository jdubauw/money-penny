import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { Bootstrap } from "@/lib/types";
import { LedgerProvider } from "@/lib/state";
import { ErrorMessage } from "@/components/error-message";
import { Loading } from "@/components/loading";
import { Login } from "@/components/login";
import { Shell } from "@/components/shell";

export function App() {
  const client = useQueryClient();
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: async ({ signal }) => {
      try {
        return await api<Bootstrap>("/api/bootstrap", { signal });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });
  useEffect(() => {
    const expire = () => {
      void client.cancelQueries();
      client.setQueryData(["bootstrap"], null);
    };
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, [client]);
  if (bootstrap.isPending)
    return (
      <div className="mx-auto max-w-4xl p-8">
        <Loading />
      </div>
    );
  if (bootstrap.error)
    return (
      <div className="mx-auto max-w-md space-y-4 p-8">
        <ErrorMessage error={bootstrap.error} />
        <Button onClick={() => void bootstrap.refetch()}>Try again</Button>
      </div>
    );
  if (!bootstrap.data) return <Login />;
  return (
    <LedgerProvider bootstrap={bootstrap.data}>
      <Shell />
    </LedgerProvider>
  );
}
