import { createFileRoute } from "@tanstack/react-router";
import { useAuthStore } from "@/store/auth.store";
import { useUserDoc } from "@/hooks/useUserDoc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function DashboardPage() {
  const uid = useAuthStore((s) => s.uid);
  const displayName = useAuthStore((s) => s.displayName);
  const email = useAuthStore((s) => s.email);
  const { data: userDoc } = useUserDoc(uid ?? undefined);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Bem-vindo, {userDoc?.name ?? displayName ?? email}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Seu perfil</CardDescription>
            <CardTitle>{userDoc?.name ?? displayName ?? "—"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Cargo: {userDoc?.role ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});
