"use client";

import React, { createContext, useContext } from "react";
import { SWRConfig } from "swr";
import { Auth0Provider, useUser } from "@auth0/nextjs-auth0";
import { clearChatHistory } from "@/components/chat/chat-widget";

interface AuthContextValue {
  user: { id: string; email: string; name: string } | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: () => {},
  logout: () => {},
});

function AuthBridge({ children }: { children: React.ReactNode }) {
  const { user: auth0User, isLoading } = useUser();

  const user = auth0User
    ? {
        id: auth0User.sub,
        email: auth0User.email ?? "",
        name: auth0User.name ?? "",
      }
    : null;

  const login = () => {
    window.location.href = "/auth/login";
  };

  const logout = () => {
    clearChatHistory();
    window.location.href = "/auth/logout";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!auth0User,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        dedupingInterval: 60_000,
        focusThrottleInterval: 120_000,
        revalidateOnFocus: false,
      }}
    >
      <Auth0Provider>
        <AuthBridge>{children}</AuthBridge>
      </Auth0Provider>
    </SWRConfig>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
