import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AuthPage from "@/pages/AuthPage";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>{children}</BrowserRouter>
  </QueryClientProvider>
);

describe("AuthPage", () => {
  it("renders login form", () => {
    render(<AuthPage />, { wrapper: Wrapper });
    expect(screen.getByText("Infusion.IA")).toBeTruthy();
    expect(screen.getByText("Acesse sua conta")).toBeTruthy();
    expect(screen.getByPlaceholderText("seu@email.com")).toBeTruthy();
  });

  it("toggles between login and signup", () => {
    render(<AuthPage />, { wrapper: Wrapper });
    const toggleButton = screen.getByText("Criar conta");
    fireEvent.click(toggleButton);
    expect(screen.getByText("Crie sua conta grátis")).toBeTruthy();
  });

  it("shows Google login button", () => {
    render(<AuthPage />, { wrapper: Wrapper });
    expect(screen.getByText("Continuar com Google")).toBeTruthy();
  });

  it("toggles password visibility", () => {
    render(<AuthPage />, { wrapper: Wrapper });
    const passwordInput = screen.getByPlaceholderText("••••••••");
    expect(passwordInput).toHaveProperty("type", "password");
  });
});
