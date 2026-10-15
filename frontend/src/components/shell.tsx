import { SidebarNavigation } from "@/components/sidebar-navigation";
import { pages } from "@/lib/navigation";
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Job } from "@/lib/types";
import { useLedger } from "@/lib/state";
import { Brand } from "@/components/brand";
import { Sheet } from "@/components/ui/sheet/sheet";
import { SheetContent } from "@/components/ui/sheet/sheet-content";
import { SheetTrigger } from "@/components/ui/sheet/sheet-trigger";
import { Menu, Plus, ChevronRight } from "lucide-react";

export function Shell() {
  const { notice, setNotice, invalidate } = useLedger(),
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
  const page = pages.find((p) => p.path === path) || pages[0];
  const navigationProps = {
    onNavigate: () => setMenuOpen(false),
    logoutPending: logout.isPending,
    onLogout: () => logout.mutate(),
    logoutError: logout.error,
  };
  return (
    <div id="shell" className="app-shell">
      <aside className="desktop-sidebar">
        <SidebarNavigation {...navigationProps} />
      </aside>
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
              <SheetContent>
                <SidebarNavigation {...navigationProps} mobile />
              </SheetContent>
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
          {path !== "/" &&
            path !== "/imports" &&
            path !== "/settings" &&
            path !== "/transactions" &&
            !path.startsWith("/reports/") && (
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
