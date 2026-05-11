import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { signOut } from "@/services/auth.service";
import { Button } from "@/components/ui/button";
import { useCurrentUserProfile } from "@/hooks/useCurrentUserProfile";
import {
  LayoutDashboard,
  LogOut,
  Map,
  Radio,
  Truck,
  UserCheck,
} from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { GoogleMapsProvider } from "@/providers/GoogleMapsProvider";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context }) => {
    if (!context.isAuthenticated) {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthenticatedLayout,
});

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Truck, label: "Veículos", path: "/vehicles" },
  { icon: UserCheck, label: "Motoristas", path: "/drivers" },
  { icon: Map, label: "Rotas", path: "/routes" },
  { icon: Radio, label: "Rastreamento", path: "/tracking" },
];

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const { name, email } = useCurrentUserProfile();

  const avatarInitial = name?.[0]?.toUpperCase() || "U";

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <GoogleMapsProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}>
      <div className="flex min-h-screen bg-background">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-muted/40">
          <div className="flex flex-col h-full">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between mb-1">
                <h1 className="text-xl font-bold">Santa Rosa</h1>
                <ModeToggle />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{name ?? "Usuário"}</span>
              </div>
            </div>

            <nav className="flex-1 p-4 space-y-1">
              {menuItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate({ to: item.path })}
                  className="flex items-center w-full px-4 py-2 text-sm font-medium rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                >
                  <item.icon className="w-5 h-5 mr-3" />
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="p-4 border-t">
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold">
                  {avatarInitial}
                </div>
                <div className="ml-3 flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {name ?? "Usuário"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {email}
                  </p>
                </div>
              </div>
              <Button
                onClick={handleLogout}
                variant="outline"
                className="w-full justify-start"
                size="sm"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </Button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-6 max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </GoogleMapsProvider>
  );
}
