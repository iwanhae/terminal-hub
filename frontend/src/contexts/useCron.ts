import { useContext } from "react";
import { CronContext } from "./CronContext";

export function useCron() {
  const context = useContext(CronContext);
  if (!context) {
    throw new Error("useCron must be used within a CronProvider");
  }
  return context;
}
