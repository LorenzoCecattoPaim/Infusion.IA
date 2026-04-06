import { Instagram, Facebook, MessageCircle, BarChart2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const integrations = [
  {
    name: "Instagram Business",
    description: "Publique posts diretamente no seu perfil",
    icon: Instagram,
  },
  {
    name: "Facebook Pages",
    description: "Gerencie sua página do Facebook",
    icon: Facebook,
  },
  {
    name: "WhatsApp Business",
    description: "Envie mensagens automáticas via WhatsApp",
    icon: MessageCircle,
  },
  {
    name: "Meta Ads",
    description: "Acompanhe métricas de anúncios",
    icon: BarChart2,
  },
];

export default function ConfiguracoesPage() {
  const { user, signOut } = useAuth();

  return (
    <DashboardLayout>
      <div className="p-6 space-y-8 max-w-4xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Configurações
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie suas preferências e integrações
          </p>
        </div>

        {/* Account */}
        <Card className="bg-card border-border shadow-card">
          <CardHeader className="border-b border-border">
            <CardTitle className="font-display text-foreground">
              Conta
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-foreground">E-mail</Label>
              <Input
                value={user?.email || ""}
                disabled
                className="bg-secondary border-border text-muted-foreground"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => toast.info("Disponível em breve.")}
              >
                Alterar senha
              </Button>
              <Button
                variant="outline"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={signOut}
              >
                Sair da conta
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Business data */}
        <Card className="bg-card border-border shadow-card">
          <CardHeader className="border-b border-border">
            <CardTitle className="font-display text-foreground">
              Dados do negócio
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure as informações do seu negócio na página{" "}
              <a href="/meu-negocio" className="text-primary hover:underline">
                Meu Negócio
              </a>{" "}
              para personalizar a IA.
            </p>
          </CardContent>
        </Card>

        {/* Integrations */}
        <Card className="bg-card border-border shadow-card">
          <CardHeader className="border-b border-border">
            <CardTitle className="font-display text-foreground">
              Integrações
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {integrations.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between py-1"
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {item.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
                <Switch
                  onCheckedChange={() =>
                    toast.info("Integração disponível em breve.")
                  }
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="bg-card border-border shadow-card">
          <CardHeader className="border-b border-border">
            <CardTitle className="font-display text-foreground">
              Notificações
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {[
              {
                label: "Datas comemorativas",
                description: "Alertas sobre datas importantes para marketing",
              },
              {
                label: "Relatórios semanais",
                description: "Resumo de performance toda segunda-feira",
              },
              {
                label: "Novidades da plataforma",
                description: "Fique por dentro das novas funcionalidades",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between py-1"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
                <Switch />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Danger zone */}
        <Card className="bg-card border-destructive/30 shadow-card">
          <CardHeader className="border-b border-border">
            <CardTitle className="font-display text-destructive">
              Zona de perigo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Ações irreversíveis. Prossiga com cuidado.
            </p>
            <Button
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() =>
                toast.error("Fale com o suporte para excluir sua conta.")
              }
            >
              Excluir conta permanentemente
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

