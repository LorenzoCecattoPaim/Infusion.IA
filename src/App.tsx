import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AuthPage from "@/pages/AuthPage";
import Index from "@/pages/Index";
import ChatPage from "@/pages/ChatPage";
import MeuNegocioPage from "@/pages/MeuNegocioPage";
import ImageGeneratorPage from "@/pages/ImageGeneratorPage";
import LogoGeneratorPage from "@/pages/LogoGeneratorPage";
import PostGeneratorPage from "@/pages/PostGeneratorPage";
import TextGeneratorPage from "@/pages/TextGeneratorPage";
import ConfiguracoesPage from "@/pages/ConfiguracoesPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        defaultTheme="dark"
        storageKey="aimh-theme"
        enableSystem={false}
        disableTransitionOnChange
        attribute="class"
      >
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<AuthPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chat"
                element={
                  <ProtectedRoute>
                    <ChatPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/meu-negocio"
                element={
                  <ProtectedRoute>
                    <MeuNegocioPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gerador"
                element={
                  <ProtectedRoute>
                    <ImageGeneratorPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/logo-generator"
                element={
                  <ProtectedRoute>
                    <LogoGeneratorPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gerar-posts"
                element={
                  <ProtectedRoute>
                    <PostGeneratorPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gerador-texto"
                element={
                  <ProtectedRoute>
                    <TextGeneratorPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/configuracoes"
                element={
                  <ProtectedRoute>
                    <ConfiguracoesPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          <Toaster richColors position="top-right" closeButton />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
