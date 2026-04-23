import { useEffect, useState } from "react";
import { Instagram, Facebook, MessageCircle, BarChart2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { useInstagramIntegration } from "@/hooks/useInstagramIntegration";
import { toast } from "sonner";
import PlansSection from "@/components/PlansSection";

type NotificationSettings = {
  emailNotifications: boolean;
  pushNotifications: boolean;
  marketingNotifications: boolean;
};

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailNotifications: true,
  pushNotifications: true,
  marketingNotifications: false,
};

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
  const { plan, isLoading: isCreditsLoading } = useCredits();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    accounts,
    connect,
    error: instagramError,
    isConnected,
    isConnecting,
    isLoading: isInstagramLoading,
  } = useInstagramIntegration();
  const storageKey = `infusion-settings-notifications:${user?.id ?? "guest"}`;
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [notificationSettingsLoaded, setNotificationSettingsLoaded] =
    useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const instagramStatus = params.get("instagram");
    const message = params.get("message");

    if (!instagramStatus) return;

    if (instagramStatus === "connected") {
      toast.success("Instagram Business conectado com sucesso.");
    } else if (instagramStatus === "error") {
      toast.error(message || "Não foi possível conectar o Instagram Business.");
    }

    navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!instagramError) return;
    const message =
      instagramError instanceof Error
        ? instagramError.message
        : "Erro ao carregar integração do Instagram.";
    toast.error(message);
  }, [instagramError]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const rawSettings = window.localStorage.getItem(storageKey);

    if (!rawSettings) {
      setNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
      setNotificationSettingsLoaded(true);
      return;
    }

    try {
      const parsedSettings = JSON.parse(rawSettings) as Partial<NotificationSettings>;
      setNotificationSettings({
        emailNotifications:
          parsedSettings.emailNotifications ??
          DEFAULT_NOTIFICATION_SETTINGS.emailNotifications,
        pushNotifications:
          parsedSettings.pushNotifications ??
          DEFAULT_NOTIFICATION_SETTINGS.pushNotifications,
        marketingNotifications:
          parsedSettings.marketingNotifications ??
          DEFAULT_NOTIFICATION_SETTINGS.marketingNotifications,
      });
    } catch {
      setNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
    }

    setNotificationSettingsLoaded(true);
  }, [storageKey]);

  const primaryInstagramAccount = accounts[0] ?? null;
  const notificationItems = [
    {
      key: "emailNotifications" as const,
      label: "E-mail",
      description: "Receba alertas importantes e atualizações da sua conta por e-mail.",
    },
    {
      key: "pushNotifications" as const,
      label: "Sistema",
      description: "Mostre notificações dentro da plataforma sobre uso, créditos e integrações.",
    },
    {
      key: "marketingNotifications" as const,
      label: "Marketing",
      description: "Receba novidades da plataforma, campanhas e lançamentos.",
    },
  ];

  const handleNotificationToggle = (
    key: keyof NotificationSettings,
    checked: boolean
  ) => {
    const nextSettings = {
      ...notificationSettings,
      [key]: checked,
    };

    setNotificationSettings(nextSettings);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, JSON.stringify(nextSettings));
    }

    toast.success("Preferências de notificações salvas.");
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-8 p-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Configurações
          </h1>
          <p className="mt-1 text-muted-foreground">
            Gerencie suas preferências e integrações
          </p>
        </div>

        <Card className="border-border bg-card shadow-card">
          <CardHeader className="border-b border-border">
            <CardTitle className="font-display text-foreground">Conta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-2">
              <Label className="text-foreground">E-mail</Label>
              <Input
                value={user?.email || ""}
                disabled
                className="border-border bg-secondary text-muted-foreground"
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
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={signOut}
              >
                Sair da conta
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-card">
          <CardHeader className="border-b border-border">
            <CardTitle className="font-display text-foreground">
              Dados do negócio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <p className="text-sm text-muted-foreground">
              Configure as informações do seu negócio na página{" "}
              <a href="/meu-negocio" className="text-primary hover:underline">
                Meu Negócio
              </a>{" "}
              para personalizar a IA.
            </p>
          </CardContent>
        </Card>

        <PlansSection currentPlan={plan} isLoading={isCreditsLoading} />

        <Card className="border-border bg-card shadow-card">
          <CardHeader className="border-b border-border">
            <CardTitle className="font-display text-foreground">
              Integrações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
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
                      {item.name === "Instagram Business" && primaryInstagramAccount
                        ? `Conectado como @${primaryInstagramAccount.username}`
                        : item.description}
                    </p>
                  </div>
                </div>
                {item.name === "Instagram Business" ? (
                  <Switch
                    checked={isConnected}
                    disabled={isConnecting || isInstagramLoading}
                    onCheckedChange={(checked) => {
                      if (!checked) {
                        toast.info("Desconexão do Instagram ainda não está disponível.");
                        return;
                      }

                      connect().catch((error: unknown) => {
                        const message =
                          error instanceof Error
                            ? error.message
                            : "Erro ao iniciar conexão com o Instagram.";
                        toast.error(message);
                      });
                    }}
                  />
                ) : (
                  <Switch
                    onCheckedChange={() =>
                      toast.info("Integração disponível em breve.")
                    }
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-card">
          <CardHeader className="border-b border-border">
            <CardTitle className="font-display text-foreground">
              Notificações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            {notificationItems.map((item) => (
              <div
                key={item.label}
                className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 pr-0 sm:pr-4">
                  <p className="text-sm font-medium text-foreground break-words">
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground break-words">
                    {item.description}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:min-w-[124px] sm:justify-end">
                  <Label
                    htmlFor={item.key}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    {notificationSettings[item.key] ? "Ativado" : "Desativado"}
                  </Label>
                  <Switch
                    id={item.key}
                    aria-label={`Alternar ${item.label}`}
                    checked={notificationSettings[item.key]}
                    disabled={!notificationSettingsLoaded}
                    onCheckedChange={(checked) =>
                      handleNotificationToggle(item.key, checked)
                    }
                  />
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              As preferências são salvas automaticamente neste navegador.
            </p>
          </CardContent>
        </Card>

        <Card className="border-destructive/30 bg-card shadow-card">
          <CardHeader className="border-b border-border">
            <CardTitle className="font-display text-destructive">
              Zona de perigo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
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
