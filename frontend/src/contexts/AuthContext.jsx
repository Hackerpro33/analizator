import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchCurrentUser, loginUser, logoutUser, registerUser } from "@/api/auth";
import { canRoleAccess, resolveUserRole } from "@/utils/adminAccess";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: "loading", user: null, error: null });

  const loadProfile = useCallback(async () => {
    try {
      const profile = await fetchCurrentUser();
      setState({ status: "authenticated", user: { ...profile, role: resolveUserRole(profile) }, error: null });
    } catch (error) {
      console.warn("Не удалось загрузить профиль пользователя", error);
      setState({ status: "guest", user: null, error: null });
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const handleAccessUpdate = () => {
      setState((prev) => {
        if (!prev.user) return prev;
        return {
          ...prev,
          user: {
            ...prev.user,
            role: resolveUserRole(prev.user),
          },
        };
      });
    };

    window.addEventListener("admin-access-updated", handleAccessUpdate);
    return () => window.removeEventListener("admin-access-updated", handleAccessUpdate);
  }, []);

  const login = useCallback(
    async (credentials) => {
      await loginUser(credentials);
      await loadProfile();
    },
    [loadProfile]
  );

  const register = useCallback(
    async (payload) => {
      return registerUser(payload);
    },
    []
  );

  const logout = useCallback(async () => {
    await logoutUser();
    setState({ status: "guest", user: null, error: null });
  }, []);

  const value = useMemo(
    () => ({
      user: state.user,
      status: state.status,
      isAuthenticated: Boolean(state.user),
      login,
      register,
      logout,
      refresh: loadProfile,
      hasRole: (roles) => {
        if (!roles || roles.length === 0) return true;
        if (!state.user) return false;
        return roles.includes(state.user.role);
      },
      canAccess: (accessKey) => {
        if (!accessKey) return true;
        if (!state.user) return false;
        return canRoleAccess(state.user.role, accessKey);
      },
    }),
    [state, login, register, logout, loadProfile]
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
