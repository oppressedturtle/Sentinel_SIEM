import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

export type User = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then((payload) => setUser(payload.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const payload = await api<{ user: User }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });
        setUser(payload.user);
      },
      logout: async () => {
        await api("/auth/logout", { method: "POST" });
        setUser(null);
      },
      hasPermission: (permission) =>
        Boolean(user?.permissions.includes(permission) || user?.permissions.includes("admin:manage"))
    }),
    [loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

