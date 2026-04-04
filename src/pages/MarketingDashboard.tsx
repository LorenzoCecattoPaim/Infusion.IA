import { useNavigate } from "react-router-dom";
import {
  FileText,
  Image,
  Sparkles,
  Zap,
  MessageSquare,
  BookOpen,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCredits } from "@/hooks/useCredits";
import { useGeneratedImages } from "@/hooks/useGeneratedImages";

const upcomingDates = [
  { date: "01/05", label: "Dia do Trabalho", days: "em breve" },
  { date: "11/05", label: "Dia das Mães", days: "em breve" },
  { date: "12/06", label: "Dia dos Namorados", days: "em breve" },
  { date: "12/10", label: "Dia das Crianças", days: "em breve" },
  { date: "25/12", label: "Natal", days: "em breve" },
];

export default function MarketingDashboard() {
  const navigate = useNavigate();
  const { credits } = useCredits();
  const { generatedImages } = useGeneratedImages();

  const stats = [
    {
      label: "Posts criados",
      value: "0",
      icon: FileText,
      color: "text-primary",
    },
    {
      label: "Imagens geradas",
      value: String(generatedImages.length),
      icon: Image,
      color: "text-accent",
    },
    {
      label: "Logos criados",
      value: "0",
      icon: Sparkles,
      color: "text-primary",
    },
    {
      label: "Créditos restantes",
      value: String(credits),
      icon: Zap,
      color: "text-accent",
    },
  ];

  const quickActions = [
    {
      title: "Consultor de Marketing IA",
      description: "Estratégias personalizadas para seu negócio",
      icon: MessageSquare,
      route: "/chat",
      gradient: "gradient-primary",
    },
    {
      title: "Gerar Imagem",
      description: "Crie imagens profissionais com IA",
      icon: Image,
      route: "/gerador",
      gradient: "gradient-accent",
    },
    {
      title: "Criar Logo",
      description: "Desenvolva a identidade visual da sua marca",
      icon: Sparkles,
      route: "/logo-generator",
      gradient: "gradient-primary",
    },
    {
      title: "Biblioteca de Modelos",
      description: "Templates prontos para acelerar seu marketing",
      icon: BookOpen,
      route: "/biblioteca",
      gradient: "gradient-accent",
    },
  ];

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          {greeting}! 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Seu hub de marketing está pronto para impulsionar suas vendas.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className="bg-card border-border shadow-card hover:shadow-glow transition-shadow duration-300"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">
                  {stat.label}
                </span>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <p className="font-display text-2xl font-bold text-foreground">
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick actions */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Ações Rápidas
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <Card
                key={action.title}
                className="bg-card border-border shadow-card hover:shadow-glow hover:border-primary/30 transition-all duration-300 cursor-pointer group"
                onClick={() => navigate(action.route)}
              >
                <CardContent className="p-5 flex items-start gap-4">
                  <div
                    className={`${action.gradient} rounded-xl p-2.5 shrink-0`}
                  >
                    <action.icon className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                      {action.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {action.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Important dates */}
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Datas Importantes
          </h2>
          <Card className="bg-card border-border shadow-card">
            <CardContent className="p-0 divide-y divide-border">
              {upcomingDates.map((item) => (
                <div
                  key={item.label}
                  className="p-3.5 hover:bg-accent/10 transition-colors flex items-center gap-3"
                >
                  <div className="gradient-warm rounded-lg px-2.5 py-1 text-xs font-bold text-primary-foreground shrink-0">
                    {item.date}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {item.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.days}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Button
            className="w-full gradient-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
            onClick={() => navigate("/chat")}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Falar com IA
          </Button>
        </div>
      </div>
    </div>
  );
}
