import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { Bootstrap, Job } from "@/lib/types";
import { LedgerProvider, useLedger } from "@/lib/state";
import { ErrorMessage, Loading, TextField } from "@/components/shared";
import { FiltersPanel } from "@/components/filters";
function Login() {
  const client = useQueryClient(),
    [username, setUsername] = useState("admin"),
    [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () =>
      api("/api/login", { method: "POST", body: { username, password } }),
    onSuccess: async () => {
      setPassword("");
      await client.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });
  return (
    <section id="login" className="mx-auto mt-[10dvh] max-w-md space-y-6 px-4">
      <p className="wordmark">Spending Ledger</p>
      <div>
        <h1>
          Your spending,
          <br />
          in one place.
        </h1>
        <p className="mt-3 text-muted-foreground">
          Sign in to your private statement archive.
        </p>
      </div>
      <form
        id="login-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate();
        }}
      >
        <TextField
          id="username"
          label="Username"
          value={username}
          onChange={setUsername}
          required
        />
        <TextField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          type="password"
          required
        />
        <Button className="w-full" disabled={login.isPending}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
        <ErrorMessage error={login.error} />
      </form>
    </section>
  );
}
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
function Shell() {
  const { bootstrap, notice, setNotice, invalidate } = useLedger(),
    client = useQueryClient(),
    path = useRouterState({ select: (s) => s.location.pathname });
  const seen = useRef<Set<number> | null>(null);
  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: ({ signal }) => api<Job[]>("/api/jobs", { signal }),
    refetchInterval: 4000,
  });
  useEffect(() => {
    if (!jobs.data) return;
    if (!seen.current) {
      seen.current = new Set(
        jobs.data
          .filter((j) => ["completed", "failed"].includes(j.status))
          .map((j) => j.id),
      );
      return;
    }
    for (const job of jobs.data) {
      if (
        ["completed", "failed"].includes(job.status) &&
        !seen.current.has(job.id)
      ) {
        seen.current.add(job.id);
        if (job.kind === "categorize") {
          setNotice(
            job.error ||
              `AI categorized ${job.result.categorized} transactions. Review the suggestions in the ledger.`,
          );
          void invalidate();
        }
      }
    }
  }, [jobs.data, invalidate, setNotice]);
  const logout = useMutation({
    mutationFn: () => api("/api/logout", { method: "POST" }),
    onSuccess: async () => {
      await client.cancelQueries();
      client.clear();
      client.setQueryData(["bootstrap"], null);
    },
  });
  const pages = [
    {
      path: "/",
      view: "overview",
      title: "Overview",
      description: "Spending across your imported accounts.",
    },
    {
      path: "/transactions",
      view: "transactions",
      title: "Transactions",
      description: "Find, categorize, and review every transaction.",
    },
    {
      path: "/imports",
      view: "imports",
      title: "Imports",
      description:
        "Upload an export, check the extraction, then approve the rows.",
    },
    {
      path: "/settings",
      view: "settings",
      title: "AI & rules",
      description:
        "Choose a provider and teach the app your merchant preferences.",
    },
  ] as const;
  const page = pages.find((p) => p.path === path) || pages[0];
  return (
    <div
      id="shell"
      className="min-h-dvh lg:grid lg:grid-cols-[210px_minmax(0,1fr)]"
    >
      <aside className="border-b bg-muted/40 p-4 lg:border-r lg:border-b-0 lg:py-8">
        <p className="wordmark">
          Spending
          <br />
          Ledger
        </p>
        <nav
          aria-label="Main"
          className="my-4 flex flex-wrap gap-1 lg:mt-10 lg:flex-col lg:gap-2"
        >
          {pages.map((p) => (
            <Button
              key={p.path}
              asChild
              variant={page.path === p.path ? "secondary" : "ghost"}
              className="w-full justify-start"
            >
              <Link
                to={p.path}
                data-view={p.view}
                onClick={() => setNotice("")}
                aria-current={page.path === p.path ? "page" : undefined}
              >
                {p.title}
              </Link>
            </Button>
          ))}
        </nav>
        <p id="provider-label" className="mb-3 text-sm text-muted-foreground">
          {bootstrap.ai.provider === "none"
            ? "Merchant rules only"
            : `AI provider: ${bootstrap.ai.provider === "ollama" ? "Ollama" : "OpenAI"}`}
        </p>
        <Button
          variant="ghost"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          Sign out
        </Button>
        <ErrorMessage error={logout.error} />
      </aside>
      <main className="min-w-0 p-4 sm:p-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-sm text-muted-foreground">
              HOUSEHOLD SPENDING
            </p>
            <h1>{page.title}</h1>
            <p className="mt-3 text-muted-foreground">{page.description}</p>
          </div>
          <Button asChild>
            <Link to="/imports">Upload statement</Link>
          </Button>
        </header>
        {notice && (
          <div
            id="notice"
            role="status"
            aria-live="polite"
            className="mb-6 flex items-center justify-between gap-3 rounded-md border bg-secondary/40 p-3"
          >
            <span>{notice}</span>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              Dismiss
            </Button>
          </div>
        )}
        {["/", "/transactions"].includes(path) && <FiltersPanel />}
        <Outlet />
        <footer className="mt-10 border-t pt-4 text-sm text-muted-foreground">
          Spending Ledger · Reports reflect imported transactions and your
          active filters.
        </footer>
      </main>
    </div>
  );
}
