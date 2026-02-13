import { useContext } from "react";
import { AuthContext } from "./AuthContext";
import type { AuthContextType } from "./authTypes";

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
