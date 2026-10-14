import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { Bootstrap, Job } from "@/lib/types";
import { LedgerProvider, useLedger } from "@/lib/state";
import { ErrorMessage, Loading, TextField } from "@/components/shared";
import { Brand } from "@/components/brand";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  ArrowLeftRight,
  FileUp,
  Settings2,
  Menu,
  Plus,
  LogOut,
  ShieldCheck,
  Sparkles,
  ChevronRight,
} from "lucide-react";
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
    <section id="login" className="login-card">
      <Brand />
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
    path = useRouterState({ select: (s) => s.location.pathname }),
    [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [path]);
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
      icon: LayoutDashboard,
      title: "Overview",
      description: "Spending across your imported accounts.",
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
  const page = pages.find((p) => p.path === path) || pages[0];
  function navigation(mobile = false) {
    return (
      <div className="sidebar-inner">
        <div className="sidebar-brand">
          <Brand />
        </div>
        <div className="sidebar-section-label">Workspace</div>
        <nav
          aria-label={mobile ? "Mobile navigation" : "Main"}
          className="sidebar-nav"
        >
          {pages.map((p) => (
            <Button
              key={p.path}
              asChild
              variant="ghost"
              className="sidebar-link"
            >
              <Link
                to={p.path}
                data-view={p.view}
                onClick={() => {
                  setNotice("");
                  setMenuOpen(false);
                }}
                aria-current={page.path === p.path ? "page" : undefined}
              >
                <p.icon aria-hidden="true" />
                {p.title}
                {page.path === p.path && (
                  <ChevronRight className="ml-auto size-4" aria-hidden="true" />
                )}
              </Link>
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="provider-card">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            <div>
              <p className="text-xs font-medium">Categorization</p>
              <p
                id={mobile ? undefined : "provider-label"}
                className="mt-1 text-xs text-muted-foreground"
              >
                {bootstrap.ai.provider === "none"
                  ? "Merchant rules only"
                  : `AI provider: ${bootstrap.ai.provider === "ollama" ? "Ollama" : "OpenAI"}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
            <ShieldCheck className="size-4" aria-hidden="true" /> Your private
            spending workspace
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <LogOut aria-hidden="true" />
            {logout.isPending ? "Signing out…" : "Sign out"}
          </Button>
          <ErrorMessage error={logout.error} />
        </div>
      </div>
    );
  }
  return (
    <div id="shell" className="app-shell">
      <aside className="desktop-sidebar">{navigation()}</aside>
      <div className="workspace">
        <div className="workspace-topbar">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  className="mobile-menu size-11 p-0"
                  aria-label="Open menu"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent>{navigation(true)}</SheetContent>
            </Sheet>
            <div className="mobile-brand">
              <Brand />
            </div>
            <div className="desktop-breadcrumb">
              <span className="text-muted-foreground">Workspace</span>
              <ChevronRight className="size-3" aria-hidden="true" />
              <span>{page.title}</span>
            </div>
          </div>
          <Button asChild className="upload-action">
            <Link to="/imports">
              <Plus aria-hidden="true" />
              <span className="hidden sm:inline">Upload statement</span>
              <span className="sm:hidden">Upload</span>
            </Link>
          </Button>
        </div>
        <main className="workspace-main">
          {path !== "/" && path !== "/imports" && (
            <header className="page-heading">
              <h1>{page.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {page.description}
              </p>
            </header>
          )}
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
          {path === "/transactions" && <FiltersPanel />}
          <Outlet />
          <footer className="mt-10 border-t pt-4 text-sm text-muted-foreground">
            Money Penny · Reports reflect imported transactions and your active
            filters.
          </footer>
        </main>
      </div>
    </div>
  );
}
