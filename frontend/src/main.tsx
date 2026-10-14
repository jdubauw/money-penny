import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { App } from "./app";
import { VendorAnalysis, SavingsOpportunities } from "./pages/reports";
import { Overview } from "./pages/overview";
import { Transactions } from "./pages/transactions";
import { Imports } from "./pages/imports";
import { Settings } from "./pages/settings";
import "./index.css";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15000, retry: false, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});
const rootRoute = createRootRoute({ component: App });
const routeTree = rootRoute.addChildren([
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/reports/vendors",
    component: VendorAnalysis,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/reports/savings",
    component: SavingsOpportunities,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: Overview,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/transactions",
    component: Transactions,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/imports",
    component: Imports,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: Settings,
  }),
]);
const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultNotFoundComponent: () => <p>Page not found. Return to Overview.</p>,
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
