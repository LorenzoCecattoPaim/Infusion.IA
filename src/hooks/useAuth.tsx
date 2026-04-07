import { createContext, useContext, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { fetchFunctions } from "@/lib/apiBase";
import { clearAuthToken, getAuthToken, setAuthToken, type AuthUser } from "@/lib/auth";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

async function fetchSession(): Promise<AuthUser | null> {
  const token = getAuthToken();
  if (!token) return null;
  const res = await fetchFunctions("/auth/me");
  if (!res.ok) {
    clearAuthToken();
    return null;
  }
  const data = await res.json();
  return data.user ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { setTheme } = useTheme();

  useEffect(() => {
    fetchSession()
      .then((sessionUser) => setUser(sessionUser))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    const storedTheme = window.localStorage.getItem("aimh-theme");
    if (!storedTheme) {
      setTheme("dark");
    }
  }, [setTheme, user]);

  const signIn = async (email: string, password: string) => {
    const res = await fetchFunctions("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Erro na autenticação");
    }
    const data = await res.json();
    if (data.token) {
      setAuthToken(data.token);
    }
    setUser(data.user ?? null);
  };

  const signUp = async (email: string, password: string) => {
    const res = await fetchFunctions("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Erro ao criar conta");
    }
    const data = await res.json();
    if (data.token) {
      setAuthToken(data.token);
    }
    setUser(data.user ?? null);
  };

  const signOut = async () => {
    clearAuthToken();
    setUser(null);
    await fetchFunctions("/auth/logout", { method: "POST" }).catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
