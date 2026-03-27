import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { Topbar } from "./Topbar";

interface AppLayoutProps {
  portal: "platform" | "seller" | "operator";
}

export function AppLayout({ portal }: AppLayoutProps) {
  const portalLabel = portal === "platform" ? "Portal Interno" : portal === "seller" ? "Portal Vendedor" : "Portal Operação";

  return (
    <div className="flex min-h-screen bg-mesh">
      <AppSidebar portal={portal} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar portalLabel={portalLabel} portal={portal} />
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}