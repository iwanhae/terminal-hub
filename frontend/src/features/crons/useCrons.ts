import { useContext } from "react";
import { CronContext } from "./CronContext";

export function useCrons() {
  const context = useContext(CronContext);
  if (context === undefined) {
    throw new Error("useCrons must be used within a CronProvider");
  }
  return context;
}
