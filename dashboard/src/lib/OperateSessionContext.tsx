import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/auth/useAuth";
import { api } from "@/lib/api";
import type { Machine, MachineAssignment, Paginated } from "@/types";

const SITE_KEY = "mps_operate_selected_site_id";

interface OperateSessionContextValue {
  selectedSiteId: number | null;
  setSelectedSiteId: (id: number | null) => void;
  activeAssignment: MachineAssignment | null;
  activeMachine: Machine | null;
  isRestoring: boolean;
  setActiveSession: (assignment: MachineAssignment, machine: Machine) => void;
  clearActiveSession: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
const OperateSessionContext = createContext<OperateSessionContextValue | undefined>(undefined);

/** Web equivalent of mobile/src/auth/SessionContext.tsx — same
 * claim-a-machine-for-the-shift concept, persisted to localStorage instead
 * of AsyncStorage. Scoped to the /operate/* route subtree only (mounted in
 * OperateLayout), not globally, since most dashboard pages never need it.
 */
export function OperateSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedSiteId, setSelectedSiteIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem(SITE_KEY);
    return stored ? Number(stored) : null;
  });
  const [activeAssignment, setActiveAssignment] = useState<MachineAssignment | null>(null);
  const [activeMachine, setActiveMachine] = useState<Machine | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  const setSelectedSiteId = useCallback((id: number | null) => {
    setSelectedSiteIdState(id);
    if (id !== null) {
      localStorage.setItem(SITE_KEY, String(id));
    } else {
      localStorage.removeItem(SITE_KEY);
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

  // Restore an in-progress session on mount (e.g. after a page refresh).
  // The `operator` filter must be explicit: unlike mobile (always an
  // Operator), a Supervisor/Admin can also use this screen, and
  // MachineAssignmentViewSet.get_queryset() returns *every* active
  // assignment at their sites for Supervisor+, not just their own.
  useEffect(() => {
    if (!user) {
      setIsRestoring(false);
      return;
    }
    (async () => {
      try {
        const { data } = await api.get<Paginated<MachineAssignment>>("/machine-assignments/", {
          params: { status: "active", operator: user.id },
        });
        const assignment = data.results[0];
        if (assignment) {
          const { data: machine } = await api.get<Machine>(`/machines/${assignment.machine}/`);
          setActiveSession(assignment, machine);
          setSelectedSiteId(machine.site);
        }
      } catch {
        // No active assignment, or the request failed — operator picks manually.
      } finally {
        setIsRestoring(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const value: OperateSessionContextValue = {
    selectedSiteId,
    setSelectedSiteId,
    activeAssignment,
    activeMachine,
    isRestoring,
    setActiveSession,
    clearActiveSession,
  };

  return <OperateSessionContext.Provider value={value}>{children}</OperateSessionContext.Provider>;
}

export function useOperateSession() {
  const ctx = useContext(OperateSessionContext);
  if (!ctx) throw new Error("useOperateSession must be used within an OperateSessionProvider");
  return ctx;
}
