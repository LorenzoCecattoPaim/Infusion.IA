import {
  Sparkles,
  Wand2,
  Instagram,
  Facebook,
  MessageCircle,
  Mail,
  ShoppingBag,
  Calendar,
  Gift,
  Megaphone,
  TrendingUp,
  Star,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/DashboardLayout";
import { useNavigate } from "react-router-dom";

const featuredTemplates = [
  {
    title: "Post de Lançamento de Produto",
    description: "Template completo para apresentar novos produtos com impacto máximo nas redes sociais.",
    category: "Instagram",
    icon: ShoppingBag,
    bg: "gradient-primary",
  },
  {
    title: "Campanha de Black Friday",
    description: "Sequência de posts para maximizar vendas durante a Black Friday.",
    category: "Campanha",
    icon: Gift,
    bg: "gradient-accent",
  },
  {
    title: "Conteúdo Educacional",
    description: "Posts que geram autoridade e engajamento com dicas do seu segmento.",
    category: "Educação",
    icon: Star,
    bg: "gradient-primary",
  },
];

const allTemplates = [
  { title: "Stories de Engajamento", category: "Instagram Stories", icon: Instagram, bg: "gradient-primary" },
  { title: "Post para Facebook", category: "Facebook", icon: Facebook, bg: "gradient-accent" },
  { title: "Mensagem WhatsApp", category: "WhatsApp", icon: MessageCircle, bg: "gradient-primary" },
  { title: "Email Marketing", category: "Email", icon: Mail, bg: "gradient-accent" },
  { title: "Promoção Relâmpago", category: "Vendas", icon: Megaphone, bg: "gradient-primary" },
  { title: "Calendário de Conteúdo", category: "Planejamento", icon: Calendar, bg: "gradient-accent" },
  { title: "Datas Comemorativas", category: "Sazonal", icon: Gift, bg: "gradient-primary" },
  { title: "Análise de Resultados", category: "Relatório", icon: TrendingUp, bg: "gradient-accent" },
];

export default function BibliotecaPage() {
  const navigate = useNavigate();

  const handleUseTemplate = (title: string) => {
    navigate(`/chat?template=${encodeURIComponent(title)}`);
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-10 max-w-7xl mx-auto">
        {/* Hero */}
        <section className="rounded-2xl border border-border shadow-card gradient-primary-soft p-8">
          <span className="text-xs font-semibold text-primary uppercase tracking-wider">
            Biblioteca
          </span>
          <h1 className="font-display text-3xl font-bold text-foreground mt-2 mb-3">
            Modelos prontos para acelerar seu marketing
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Acesse templates profissionais criados por especialistas em
            marketing. Adapte para o seu negócio em minutos com o poder da IA.
          </p>
        </section>

        {/* Featured */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Em Destaque
            </h2>
            <Button
              variant="ghost"
              className="text-primary hover:text-primary/80 text-sm"
            >
              Ver todos
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {featuredTemplates.map((t) => (
              <Card
                key={t.title}
                className="bg-card border-border shadow-card hover:shadow-glow transition-shadow duration-300"
              >
                <CardContent className="p-0">
                  <div
                    className={`h-32 rounded-t-xl ${t.bg} flex items-center justify-center`}
                  >
                    <t.icon className="h-10 w-10 text-primary-foreground/80" />
                  </div>
                  <div className="p-4">
                    <Badge className="gradient-primary text-primary-foreground text-xs mb-2">
                      {t.category}
                    </Badge>
                    <h3 className="font-semibold text-foreground mb-1">
                      {t.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      {t.description}
                    </p>
                    <Button
                      size="sm"
                      className="w-full gradient-primary text-primary-foreground hover:opacity-90"
                      onClick={() => handleUseTemplate(t.title)}
                    >
                      <Wand2 className="h-3.5 w-3.5 mr-1.5" /> Usar este modelo
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* All templates */}
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Todos os Modelos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {allTemplates.map((t) => (
              <Card
                key={t.title}
                className="bg-card border-border shadow-card hover:shadow-glow transition-shadow duration-300 cursor-pointer group"
                onClick={() => handleUseTemplate(t.title)}
              >
                <CardContent className="p-4">
                  <div
                    className={`h-20 rounded-xl ${t.bg} flex items-center justify-center mb-3`}
                  >
                    <t.icon className="h-7 w-7 text-primary-foreground/80" />
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t.category}
                  </p>
                  <h3 className="font-semibold text-foreground text-sm mb-1 group-hover:text-primary transition-colors">
                    {t.title}
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-xs mt-2 text-primary hover:text-primary/80"
                  >
                    <Sparkles className="h-3 w-3 mr-1" /> Adaptar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
