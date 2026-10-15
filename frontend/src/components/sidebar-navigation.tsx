import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";
import { ErrorMessage } from "@/components/error-message";
import { LogOut, ShieldCheck, Sparkles, ChevronRight } from "lucide-react";
import { useLedger } from "@/lib/state";
import { pages } from "@/lib/navigation";

export function SidebarNavigation({
  mobile = false,
  onNavigate,
  logoutPending,
  onLogout,
  logoutError,
}: {
  mobile?: boolean;
  onNavigate: () => void;
  logoutPending: boolean;
  onLogout: () => void;
  logoutError: unknown;
}) {
  const { bootstrap, setNotice } = useLedger();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const page = pages.find((p) => p.path === path) || pages[0];
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
          <Button key={p.path} asChild variant="ghost" className="sidebar-link">
            <Link
              to={p.path}
              data-view={p.view}
              onClick={() => {
                setNotice("");
                onNavigate();
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
          disabled={logoutPending}
          onClick={onLogout}
        >
          <LogOut aria-hidden="true" />
          {logoutPending ? "Signing out…" : "Sign out"}
        </Button>
        <ErrorMessage error={logoutError} />
      </div>
    </div>
  );
}
