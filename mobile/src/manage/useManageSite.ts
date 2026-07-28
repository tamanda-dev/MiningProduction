import { useContext } from "react";
import { ManageSiteContext } from "@/src/manage/ManageSiteContext";

export function useManageSite() {
  const ctx = useContext(ManageSiteContext);
  if (!ctx) throw new Error("useManageSite must be used within a ManageSiteProvider");
  return ctx;
}
