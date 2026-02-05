import { createContext } from "react";
import type { AuthContextType } from "./authTypes";

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);
