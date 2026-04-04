import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function NotFound() {
  const location = useLocation();

  useEffect(() => {
    console.error(`404: Página não encontrada — ${location.pathname}`);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="gradient-primary rounded-2xl p-4 w-16 h-16 mx-auto mb-6 flex items-center justify-center">
          <span className="text-2xl font-bold text-primary-foreground">?</span>
        </div>
        <h1 className="font-display mb-4 text-4xl font-bold text-foreground">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">
          Oops! Página não encontrada
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          A página <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">{location.pathname}</code> não existe.
        </p>
        <a
          href="/"
          className="inline-flex items-center gap-2 gradient-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium hover:opacity-90 transition-opacity"
        >
          Voltar ao início
        </a>
      </div>
    </div>
  );
}
