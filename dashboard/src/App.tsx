import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuditLogPage } from "@/pages/audit/AuditLogPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { AvailabilityBoardPage } from "@/pages/dashboard/AvailabilityBoardPage";
import { DowntimeParetoPage } from "@/pages/dashboard/DowntimeParetoPage";
import { LiveShiftViewPage } from "@/pages/dashboard/LiveShiftViewPage";
import { MachineStatusBoardPage } from "@/pages/dashboard/MachineStatusBoardPage";
import { TrendsPage } from "@/pages/dashboard/TrendsPage";
import { BreakdownLogsPage } from "@/pages/entries/BreakdownLogsPage";
import { ProductionEntriesPage } from "@/pages/entries/ProductionEntriesPage";
import { OperateLayout } from "@/components/operate/OperateLayout";
import { OperateBreakdownMatrixPage } from "@/pages/operate/OperateBreakdownMatrixPage";
import { OperateBreakdownPage } from "@/pages/operate/OperateBreakdownPage";
import { OperateChecklistPage } from "@/pages/operate/OperateChecklistPage";
import { OperateEntryPage } from "@/pages/operate/OperateEntryPage";
import { OperateIncidentsPage } from "@/pages/operate/OperateIncidentsPage";
import { OperateReleasePage } from "@/pages/operate/OperateReleasePage";
import { OperateSessionPage } from "@/pages/operate/OperateSessionPage";
import { BreakdownParetoByCausePage } from "@/pages/crusher/BreakdownParetoByCausePage";
import { ChecklistComplianceHeatmapPage } from "@/pages/crusher/ChecklistComplianceHeatmapPage";
import { CrusherPlantSummaryPage } from "@/pages/crusher/CrusherPlantSummaryPage";
import { MttrMtbfTrendPage } from "@/pages/crusher/MttrMtbfTrendPage";
import { OpenIncidentsPage } from "@/pages/crusher/OpenIncidentsPage";
import { BreakdownCausesPage } from "@/pages/masterdata/BreakdownCausesPage";
import { ChecklistItemsPage } from "@/pages/masterdata/ChecklistItemsPage";
import { HourlySlotsPage } from "@/pages/masterdata/HourlySlotsPage";
import { CrusherUnitsPage } from "@/pages/masterdata/CrusherUnitsPage";
import { DeliveryDestinationsPage } from "@/pages/masterdata/DeliveryDestinationsPage";
import { DowntimeReasonCodesPage } from "@/pages/masterdata/DowntimeReasonCodesPage";
import { MachinesPage } from "@/pages/masterdata/MachinesPage";
import { MachineTypesPage } from "@/pages/masterdata/MachineTypesPage";
import { ParametersPage } from "@/pages/masterdata/ParametersPage";
import { PlanTargetsPage } from "@/pages/masterdata/PlanTargetsPage";
import { SectionsPage } from "@/pages/masterdata/SectionsPage";
import { ShiftInstancesPage } from "@/pages/masterdata/ShiftInstancesPage";
import { ShiftPatternsPage } from "@/pages/masterdata/ShiftPatternsPage";
import { ShiftsPage } from "@/pages/masterdata/ShiftsPage";
import { SitesPage } from "@/pages/masterdata/SitesPage";
import { SubSectionsPage } from "@/pages/masterdata/SubSectionsPage";
import { TeamMembersPage } from "@/pages/masterdata/TeamMembersPage";
import { TeamsPage } from "@/pages/masterdata/TeamsPage";
import { UOMsPage } from "@/pages/masterdata/UOMsPage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard/summary" replace />} />

          <Route path="/dashboard/summary" element={<LiveShiftViewPage />} />
          <Route path="/dashboard/trends" element={<TrendsPage />} />
          <Route path="/dashboard/availability" element={<AvailabilityBoardPage />} />
          <Route path="/dashboard/downtime" element={<DowntimeParetoPage />} />
          <Route path="/dashboard/machines" element={<MachineStatusBoardPage />} />

          <Route path="/entries/production" element={<ProductionEntriesPage />} />
          <Route path="/entries/breakdowns" element={<BreakdownLogsPage />} />

          <Route path="/operate" element={<OperateLayout />}>
            <Route index element={<Navigate to="/operate/session" replace />} />
            <Route path="session" element={<OperateSessionPage />} />
            <Route path="entry" element={<OperateEntryPage />} />
            <Route path="breakdown" element={<OperateBreakdownPage />} />
            <Route path="checklist" element={<OperateChecklistPage />} />
            <Route path="breakdown-matrix" element={<OperateBreakdownMatrixPage />} />
            <Route path="incidents" element={<OperateIncidentsPage />} />
            <Route path="release" element={<OperateReleasePage />} />
          </Route>

          <Route path="/crusher/summary" element={<CrusherPlantSummaryPage />} />
          <Route path="/crusher/breakdown-pareto" element={<BreakdownParetoByCausePage />} />
          <Route path="/crusher/mttr-mtbf" element={<MttrMtbfTrendPage />} />
          <Route path="/crusher/checklist-heatmap" element={<ChecklistComplianceHeatmapPage />} />
          <Route path="/crusher/open-incidents" element={<OpenIncidentsPage />} />

          <Route element={<ProtectedRoute requireRole="manager" />}>
            <Route path="/admin/sites" element={<SitesPage />} />
            <Route path="/admin/sections" element={<SectionsPage />} />
            <Route path="/admin/subsections" element={<SubSectionsPage />} />
            <Route path="/admin/machine-types" element={<MachineTypesPage />} />
            <Route path="/admin/machines" element={<MachinesPage />} />
            <Route path="/admin/uoms" element={<UOMsPage />} />
            <Route path="/admin/parameters" element={<ParametersPage />} />
            <Route path="/admin/crusher-units" element={<CrusherUnitsPage />} />
            <Route path="/admin/delivery-destinations" element={<DeliveryDestinationsPage />} />
            <Route path="/admin/downtime-reasons" element={<DowntimeReasonCodesPage />} />
            <Route path="/admin/shift-patterns" element={<ShiftPatternsPage />} />
            <Route path="/admin/teams" element={<TeamsPage />} />
            <Route path="/admin/team-members" element={<TeamMembersPage />} />
            <Route path="/admin/shifts" element={<ShiftsPage />} />
            <Route path="/admin/shift-instances" element={<ShiftInstancesPage />} />
            <Route path="/admin/plan-targets" element={<PlanTargetsPage />} />
            <Route path="/admin/breakdown-causes" element={<BreakdownCausesPage />} />
            <Route path="/admin/checklist-items" element={<ChecklistItemsPage />} />
            <Route path="/admin/hourly-slots" element={<HourlySlotsPage />} />
          </Route>

          <Route element={<ProtectedRoute requireRole="supervisor" />}>
            <Route path="/audit-log" element={<AuditLogPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
