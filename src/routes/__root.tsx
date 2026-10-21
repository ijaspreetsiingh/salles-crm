import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { CRMShell } from "@/components/crm/shell";
import { AuthGate } from "@/components/crm/login";
import { Button } from "@/components/ui/button";
import { CRMProvider } from "@/lib/crm/store";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="glass-card w-full max-w-md p-8 text-center">
        <span className="badge badge-sun">404</span>
        <h1 className="mt-4 text-3xl font-bold text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-muted">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6 flex justify-center">
          <Button asChild>
            <Link to="/">Back to overview</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="glass-card w-full max-w-md p-8 text-center">
        <span className="badge badge-ember">Error</span>
        <h1 className="mt-4 text-2xl font-bold text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted">
          Something went wrong on our end. You can try refreshing or head back to the overview.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">Back to overview</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Traveldesk — Travel Business Workspace" },
      {
        name: "description",
        content: "The complete travel business workspace for Horizon Travel.",
      },

      { property: "og:title", content: "Traveldesk — Travel Business Workspace" },
      {
        property: "og:description",
        content: "The complete travel business workspace for Horizon Travel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Urbanist:ital,wght@0,400..700;1,400..700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <CRMProvider><AuthGate><CRMShell><Outlet /></CRMShell></AuthGate><Toaster position="bottom-right" /></CRMProvider> breaks all child routes. */}
      <CRMProvider>
        <AuthGate>
          <CRMShell>
            <Outlet />
          </CRMShell>
        </AuthGate>
        <Toaster position="top-right" richColors />
      </CRMProvider>
    </QueryClientProvider>
  );
}
