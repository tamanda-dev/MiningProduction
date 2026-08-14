import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuditLogPage } from "@/pages/audit/AuditLogPage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { AvailabilityBoardPage } from "@/pages/dashboard/AvailabilityBoardPage";
import { DowntimeParetoPage } from "@/pages/dashboard/DowntimeParetoPage";
import { HourlyMachineStatusPage } from "@/pages/dashboard/HourlyMachineStatusPage";
import { LiveShiftViewPage } from "@/pages/dashboard/LiveShiftViewPage";
import { MachineStatusBoardPage } from "@/pages/dashboard/MachineStatusBoardPage";
import { TrendsPage } from "@/pages/dashboard/TrendsPage";
import { BreakdownLogsPage } from "@/pages/entries/BreakdownLogsPage";
import { DeliveryEntriesPage } from "@/pages/entries/DeliveryEntriesPage";
import { ProductionEntriesPage } from "@/pages/entries/ProductionEntriesPage";
import { OperateLayout } from "@/components/operate/OperateLayout";
import { OperateBreakdownMatrixPage } from "@/pages/operate/OperateBreakdownMatrixPage";
import { OperateBreakdownPage } from "@/pages/operate/OperateBreakdownPage";
import { OperateChecklistPage } from "@/pages/operate/OperateChecklistPage";
import { OperateDeliveryPage } from "@/pages/operate/OperateDeliveryPage";
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
import { DeliveryDestinationsPage } from "@/pages/masterdata/DeliveryDestinationsPage";
import { DowntimeReasonCodesPage } from "@/pages/masterdata/DowntimeReasonCodesPage";
import { MachinesPage } from "@/pages/masterdata/MachinesPage";
import { MachineQualificationsPage } from "@/pages/masterdata/MachineQualificationsPage";
import { MachineTypesPage } from "@/pages/masterdata/MachineTypesPage";
import { ParametersPage } from "@/pages/masterdata/ParametersPage";
import { PlanTargetsPage } from "@/pages/masterdata/PlanTargetsPage";
import { SectionsPage } from "@/pages/masterdata/SectionsPage";
import { ShiftInstancesPage } from "@/pages/masterdata/ShiftInstancesPage";
import { ShiftsPage } from "@/pages/masterdata/ShiftsPage";
import { SitesPage } from "@/pages/masterdata/SitesPage";
import { UOMsPage } from "@/pages/masterdata/UOMsPage";
import { UsersPage } from "@/pages/masterdata/UsersPage";

// Operators have no requireRole="supervisor" route to land on, so sending
// everyone to /dashboard/summary would bounce them straight back here via
// ProtectedRoute's redirect-to-"/" — an infinite loop. Send each role to
// somewhere it can actually see.
function Home() {
  const { hasRole } = useAuth();
  return <Navigate to={hasRole("supervisor") ? "/dashboard/summary" : "/operate/session"} replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />

          <Route element={<ProtectedRoute requireRole="supervisor" />}>
            <Route path="/dashboard/summary" element={<LiveShiftViewPage />} />
            <Route path="/dashboard/trends" element={<TrendsPage />} />
            <Route path="/dashboard/availability" element={<AvailabilityBoardPage />} />
            <Route path="/dashboard/hourly-machine-status" element={<HourlyMachineStatusPage />} />
            <Route path="/dashboard/downtime" element={<DowntimeParetoPage />} />
            <Route path="/dashboard/machines" element={<MachineStatusBoardPage />} />
          </Route>

          <Route path="/entries/production" element={<ProductionEntriesPage />} />
          <Route path="/entries/breakdowns" element={<BreakdownLogsPage />} />
          <Route path="/entries/deliveries" element={<DeliveryEntriesPage />} />

          {/* Operating a machine is usually an Operator's job — Admin/
              Supervisor typically assign machines to operators instead of
              running one themselves (see the "Assign Machines" pages/
              actions). But every page under here already handles any
              authenticated role gracefully (OperateSessionPage lets a
              Supervisor self-activate too; OperateLayout's SessionStrip
              shows a plain "no active machine" prompt otherwise) — so this
              is only gated by the outer <ProtectedRoute/>'s auth check, not
              a role restriction, letting a Supervisor stationed at a plant
              themselves (e.g. the crusher) operate it directly. */}
          <Route path="/operate" element={<OperateLayout />}>
            <Route index element={<Navigate to="/operate/session" replace />} />
            <Route path="session" element={<OperateSessionPage />} />
            <Route path="entry" element={<OperateEntryPage />} />
            <Route path="breakdown" element={<OperateBreakdownPage />} />
            <Route path="delivery" element={<OperateDeliveryPage />} />
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

          {/* Manager was removed as a distinct role — Supervisor absorbed
              everything it used to do, so master data (previously split
              across a stricter "manager" tier and a separate
              ReadOnlyOrSupervisorOrAbove tier) is now one Supervisor+ gate. */}
          <Route element={<ProtectedRoute requireRole="supervisor" />}>
            <Route path="/admin/sites" element={<SitesPage />} />
            <Route path="/admin/sections" element={<SectionsPage />} />
            <Route path="/admin/machine-types" element={<MachineTypesPage />} />
            <Route path="/admin/machines" element={<MachinesPage />} />
            <Route path="/admin/uoms" element={<UOMsPage />} />
            <Route path="/admin/parameters" element={<ParametersPage />} />
            <Route path="/admin/delivery-destinations" element={<DeliveryDestinationsPage />} />
            <Route path="/admin/downtime-reasons" element={<DowntimeReasonCodesPage />} />
            <Route path="/admin/plan-targets" element={<PlanTargetsPage />} />
            <Route path="/admin/breakdown-causes" element={<BreakdownCausesPage />} />
            <Route path="/admin/checklist-items" element={<ChecklistItemsPage />} />
            <Route path="/admin/hourly-slots" element={<HourlySlotsPage />} />
            <Route path="/admin/shifts" element={<ShiftsPage />} />
            <Route path="/admin/shift-instances" element={<ShiftInstancesPage />} />
            <Route path="/admin/machine-qualifications" element={<MachineQualificationsPage />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
          </Route>

          <Route element={<ProtectedRoute requireRole="admin" />}>
            <Route path="/admin/users" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
