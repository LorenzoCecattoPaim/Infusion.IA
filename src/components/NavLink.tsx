import { NavLink as RouterNavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface NavLinkProps {
  to: string;
  icon: LucideIcon;
  label: string;
  collapsed?: boolean;
}

export default function NavLink({ to, icon: Icon, label, collapsed }: NavLinkProps) {
  return (
    <RouterNavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
          isActive
            ? "gradient-primary text-primary-foreground shadow-glow"
            : "text-sidebar-foreground hover:bg-sidebar-accent/30 hover:text-foreground"
        )
      }
      title={collapsed ? label : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </RouterNavLink>
  );
}
