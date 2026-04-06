import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  MessageSquare,
  Briefcase,
  FileText,
  Image,
  Sparkles,
  BookOpen,
  Settings,
  LogOut,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { Button } from "@/components/ui/button";
import NavLink from "./NavLink";
import { useState } from "react";
import BuyCreditsDialog from "./BuyCreditsDialog";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/chat", icon: MessageSquare, label: "Consultor de Marketing IA" },
  { to: "/meu-negocio", icon: Briefcase, label: "Meu Negócio" },
  { to: "/gerar-posts", icon: FileText, label: "Gerar Posts" },
  { to: "/gerador", icon: Image, label: "Gerar imagem" },
  { to: "/logo-generator", icon: Sparkles, label: "Criar logo" },
  { to: "/biblioteca", icon: BookOpen, label: "Biblioteca" },
  { to: "/configuracoes", icon: Settings, label: "Configurações" },
];

export default function AppSidebar() {
  const { signOut, user } = useAuth();
  const { credits } = useCredits();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [buyOpen, setBuyOpen] = useState(false);

  return (
    <>
      <Sidebar className="border-r border-sidebar-border bg-sidebar">
        <SidebarHeader className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="gradient-primary rounded-xl p-2 shrink-0">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            {!collapsed && (
              <div>
                <p className="font-display font-bold text-sidebar-foreground text-sm">Infusion.IA</p>
                <p className="text-[10px] text-muted-foreground">Marketing com IA</p>
              </div>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent className="p-2">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {NAV_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <NavLink
                      to={item.to}
                      icon={item.icon}
                      label={item.label}
                      collapsed={collapsed}
                    />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-3 border-t border-sidebar-border space-y-2">
          {!collapsed && (
            <button
              onClick={() => setBuyOpen(true)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                credits < 5
                  ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : "border-border hover:border-primary/50 text-muted-foreground hover:text-primary"
              }`}
            >
              <Zap className="h-3.5 w-3.5 shrink-0" />
              <span>{credits} créditos</span>
              <span className="ml-auto text-[10px] opacity-70">+ Comprar créditos</span>
            </button>
          )}

          {!collapsed && user && (
            <div className="flex items-center gap-2 px-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">
                  {user.email}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                onClick={signOut}
                title="Sair"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {collapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="w-full h-8 text-muted-foreground hover:text-destructive"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </SidebarFooter>
      </Sidebar>

      <BuyCreditsDialog open={buyOpen} onOpenChange={setBuyOpen} />
    </>
  );
}

