import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "@/src/api/client";
import type { Machine, MachineAssignment, Paginated } from "@/src/api/types";
import { useAuth } from "@/src/auth/useAuth";

const SITE_KEY = "mps_selected_site_id";

interface SessionContextValue {
  selectedSiteId: number | null;
  setSelectedSiteId: (id: number | null) => Promise<void>;
  activeAssignment: MachineAssignment | null;
  activeMachine: Machine | null;
  isRestoring: boolean;
  setActiveSession: (assignment: MachineAssignment, machine: Machine) => void;
  clearActiveSession: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [selectedSiteId, setSelectedSiteIdState] = useState<number | null>(null);
  const [activeAssignment, setActiveAssignment] = useState<MachineAssignment | null>(null);
  const [activeMachine, setActiveMachine] = useState<Machine | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  const setSelectedSiteId = useCallback(async (id: number | null) => {
    setSelectedSiteIdState(id);
    if (id !== null) {
      await AsyncStorage.setItem(SITE_KEY, String(id));
    } else {
      await AsyncStorage.removeItem(SITE_KEY);
    }
  }, []);

  const setActiveSession = useCallback((assignment: MachineAssignment, machine: Machine) => {
    setActiveAssignment(assignment);
    setActiveMachine(machine);
  }, []);

  const clearActiveSession = useCallback(() => {
    setActiveAssignment(null);
    setActiveMachine(null);
  }, []);

  // Restore session on app start: if the operator still has a live active
  // MachineAssignment on the server (e.g. app was killed mid-shift), resume
  // it instead of asking them to re-activate a machine they're already on.
  useEffect(() => {
    if (!isAuthenticated) {
      setIsRestoring(false);
      return;
    }
    (async () => {
      try {
        const storedSite = await AsyncStorage.getItem(SITE_KEY);
        if (storedSite) setSelectedSiteIdState(Number(storedSite));

        const { data } = await api.get<Paginated<MachineAssignment>>("/machine-assignments/", {
          params: { status: "active" },
        });
        const assignment = data.results[0];
        if (assignment) {
          const { data: machine } = await api.get<Machine>(`/machines/${assignment.machine}/`);
          setActiveSession(assignment, machine);
          await setSelectedSiteId(machine.site);
        }
      } catch {
        // No active assignment or offline — operator picks manually.
      } finally {
        setIsRestoring(false);
      }
    })();
  }, [isAuthenticated, setActiveSession, setSelectedSiteId]);

  const value: SessionContextValue = {
    selectedSiteId,
    setSelectedSiteId,
    activeAssignment,
    activeMachine,
    isRestoring,
    setActiveSession,
    clearActiveSession,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
