export type ID = number;

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// Manager was removed as a distinct role — Supervisor absorbed everything
// it used to do.
export type Role = "admin" | "supervisor" | "operator" | "artisan";

export interface Me {
  id: ID;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  employee_code: string | null;
  phone: string;
  roles: Role[];
  site_accesses: { site: ID; section: ID | null }[];
}

export interface UserSummary {
  id: ID;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  employee_code: string | null;
  maintenance_technician: boolean;
}

export interface UserDetail extends UserSummary {
  is_active: boolean;
  roles: Role[];
  date_joined: string;
  last_login: string | null;
}

export interface UserSiteAccess {
  id: ID;
  user: ID;
  site: ID;
  section: ID | null;
}

// -- Master data ------------------------------------------------------------

export interface Site {
  id: ID;
  name: string;
  code: string;
  timezone: string;
  active: boolean;
}

export interface Section {
  id: ID;
  site: ID;
  name: string;
  code: string;
  active: boolean;
}

export interface MachineType {
  id: ID;
  name: string;
  code: string;
  description: string;
  active: boolean;
}

export interface UOM {
  id: ID;
  name: string;
  abbreviation: string;
}

export type ParameterScope = "machine" | "section" | "shift";
export type ParameterDataType = "number" | "integer" | "text" | "select" | "boolean";

export interface ParameterChoice {
  id: ID;
  value: string;
  label: string;
}

export type ParameterAggregation = "sum" | "average";

export interface Parameter {
  id: ID;
  name: string;
  code: string;
  uom: ID | null;
  applicable_machine_types: ID[];
  section: ID | null;
  scope: ParameterScope;
  data_type: ParameterDataType;
  aggregation: ParameterAggregation;
  min_value: string | null;
  max_value: string | null;
  is_required: boolean;
  active: boolean;
  choices: ParameterChoice[];
}

export interface FormSchemaParameter {
  id: ID;
  code: string;
  name: string;
  scope: ParameterScope;
  data_type: ParameterDataType;
  uom: string | null;
  is_required: boolean;
  min_value: string | null;
  max_value: string | null;
  choices: { value: string; label: string }[];
}

export interface TimeSlot {
  slot_index: number;
  start_at: string;
  end_at: string;
  // Server-computed against the server's own clock (Africa/Harare,
  // GMT+2) — never derive this from the device's local Date.now(),
  // which may be wrong.
  is_available: boolean;
}

export interface DeliveryDestination {
  id: ID;
  site: ID;
  name: string;
  code: string;
  active: boolean;
}

export interface DeliveryEntry {
  id: ID;
  shift_instance: ID;
  site: ID;
  delivery_destination: ID;
  section: ID | null;
  slot_index: number | null;
  slot_start_at: string | null;
  slot_end_at: string | null;
  tonnes: string;
  trip_count: number;
  operator: ID;
  recorded_by: ID;
  comments: string;
  status: EntryStatus;
  source: "mobile" | "web" | "import";
  client_uuid: string | null;
}

export interface DowntimeReasonCode {
  id: ID;
  code: string;
  description: string;
  category: string;
  active: boolean;
}

// -- Machines -----------------------------------------------------------------

export type MachineStatus = "active" | "breakdown" | "maintenance" | "retired";

export interface Machine {
  id: ID;
  machine_type: ID;
  machine_type_code: string;
  site: ID;
  fleet_number: string;
  name: string;
  status: MachineStatus;
  current_section: ID | null;
}

export interface MachineTypeQualification {
  id: ID;
  user: ID;
  machine: ID | null;
  machine_fleet_number: string | null;
  machine_type: ID;
  machine_type_code: string;
  site: ID | null;
  active: boolean;
}

export type AssignmentStatus = "active" | "released" | "handed_over";

export interface MachineAssignment {
  id: ID;
  machine: ID;
  machine_label: string;
  operator: ID;
  operator_label: string;
  shift_instance: ID;
  section: ID;
  started_at: string;
  ended_at: string | null;
  status: AssignmentStatus;
  handed_over_from: ID | null;
  release_reason: string;
}

// -- Shifts -----------------------------------------------------------------

export interface Shift {
  id: ID;
  site: ID;
  name: string;
  start_time: string;
  end_time: string;
  slot_length_minutes: number;
  active: boolean;
}

export type ShiftInstanceStatus = "open" | "closed" | "approved";

export interface ShiftInstance {
  id: ID;
  shift: ID;
  shift_name: string;
  date: string;
  site: ID;
  status: ShiftInstanceStatus;
  closed_at: string | null;
  closed_by: ID | null;
  approved_at: string | null;
  approved_by: ID | null;
}

// -- Planning -------------------------------------------------------------------

export type PlanPeriodType = "shift" | "day" | "month";

export interface PlanTarget {
  id: ID;
  parameter: ID;
  site: ID;
  section: ID | null;
  machine: ID | null;
  period_type: PlanPeriodType;
  shift_instance: ID | null;
  period_date: string | null;
  target_value: string;
}

// -- Entries ----------------------------------------------------------------------

export type EntryStatus = "submitted" | "flagged" | "corrected" | "approved";
export type EntryType = "hourly" | "shift_total";

export interface ParameterValueIn {
  parameter: string | number;
  value: string | number | boolean;
}

export interface ParameterValueOut {
  parameter: ID;
  parameter_code: string;
  parameter_name: string;
  value: string | number | boolean | null;
}

export interface ProductionEntry {
  id: ID;
  shift_instance: ID;
  site: ID;
  section: ID;
  machine: ID | null;
  machine_assignment: ID | null;
  entry_type: EntryType;
  slot_index: number | null;
  slot_start_at: string | null;
  slot_end_at: string | null;
  operator: ID;
  recorded_by: ID;
  comments: string;
  status: EntryStatus;
  source: "mobile" | "web" | "import";
  client_uuid: string | null;
  values_display: ParameterValueOut[];
}

export type BreakdownRepairStatus = "reported" | "acknowledged" | "fixed" | "confirmed";

export interface BreakdownLog {
  id: ID;
  shift_instance: ID;
  site: ID;
  section: ID;
  machine: ID;
  machine_assignment: ID | null;
  reason_code: ID | null;
  description: string;
  slot_index: number | null;
  slot_start_at: string | null;
  slot_end_at: string | null;
  start_at: string;
  end_at: string | null;
  duration_minutes: number | null;
  severity: "low" | "medium" | "high" | "";
  operator: ID;
  recorded_by: ID;
  // The general-fleet breakdown-repair workflow: reported (default, on
  // report) -> acknowledged (an Artisan claims it) -> fixed (that Artisan
  // completes the repair — this is what stamps end_at/duration_minutes)
  // -> confirmed (the reporting Operator confirms the machine works
  // again). Only moves via POST /breakdown-logs/{id}/acknowledge|complete|
  // confirm/ — never a plain PATCH.
  artisan: ID | null;
  repair_status: BreakdownRepairStatus;
  acknowledged_at: string | null;
  confirmed_at: string | null;
  comments: string;
  status: EntryStatus;
  source: "mobile" | "web" | "import";
  client_uuid: string | null;
  values_display: ParameterValueOut[];
}

// -- Dashboard ----------------------------------------------------------------------

export interface ActVsPlanRow {
  section: ID;
  section_name: string;
  parameter: ID;
  parameter_code: string;
  parameter_name: string;
  uom: string | null;
  act: number;
  plan: number | null;
  var: number | null;
  pct_var: number | null;
}

export interface TrendPoint {
  date: string;
  act: number;
  plan: number | null;
  var: number | null;
  pct_var: number | null;
}

export interface HourlyCurvePoint {
  slot_index: number;
  start_at: string;
  end_at: string;
  act: number;
  target: number | null;
  cumulative_act: number;
  cumulative_target: number | null;
}

export interface AvailabilityByShift {
  shift_name: string;
  availability_pct: number | null;
  utilization_pct: number | null;
  scheduled_minutes: number;
  breakdown_minutes: number;
  active_minutes: number;
}

export interface AvailabilityRow {
  machine_type: ID;
  machine_type_name: string;
  by_shift: AvailabilityByShift[];
  average: { availability_pct: number | null; utilization_pct: number | null };
}

export interface DowntimeParetoRow {
  reason_code: ID | null;
  description: string;
  category: string;
  count: number;
  total_minutes: number;
}

export interface MachineStatusRow {
  machine: ID;
  fleet_number: string;
  machine_type: ID;
  machine_type_name: string;
  status: MachineStatus;
  current_section: ID | null;
  operator: ID | null;
  operator_label: string | null;
  assignment_started_at: string | null;
}

export interface HourlyMachineStatusCell {
  slot_index: number;
  ok: boolean;
  reason: string | null;
}

export interface HourlyMachineStatusSlot {
  slot_index: number;
  start_at: string;
  end_at: string;
}

export interface HourlyMachineStatusMachineRow {
  machine: ID;
  fleet_number: string;
  name: string;
  section: ID | null;
  section_name: string | null;
  cells: HourlyMachineStatusCell[];
}

export interface HourlyMachineStatusGroup {
  machine_type: ID;
  machine_type_name: string;
  slots: HourlyMachineStatusSlot[];
  machines: HourlyMachineStatusMachineRow[];
  running_by_slot: number[];
}

export interface GeneralFleetMttr {
  site: ID;
  section: ID | null;
  date_from: string;
  date_to: string;
  actual_mttr_minutes: number | null;
  target_mttr_minutes: number | null;
  breakdown_count: number;
}

export type ProductionSummaryGroupBy = "machine" | "operator" | "supervisor" | "shift";

export interface ProductionSummaryRow {
  group: ID | string;
  label: string;
  act: number;
}

export interface AuditLogEntry {
  id: ID;
  created_at: string;
  actor: ID | null;
  actor_label: string | null;
  action: string;
  content_type_label: string | null;
  object_id: string | null;
  site: ID | null;
  changes: Record<string, unknown>;
  reason: string;
}

// -- Crushing & Breakdowns module ---------------------------------------------

export interface BreakdownCause {
  id: ID;
  name: string;
  code: string;
  is_other: boolean;
  active: boolean;
}

export interface ChecklistItem {
  id: ID;
  name: string;
  code: string;
  description: string;
  active: boolean;
}

export interface HourlySlot {
  id: ID;
  site: ID;
  slot_index: number;
  start_time: string;
  end_time: string;
  active: boolean;
}

export interface HourlyChecklistEntry {
  id: ID;
  shift_instance: ID;
  site: ID;
  crusher: ID;
  hourly_slot: ID;
  slot_start_at: string;
  slot_end_at: string;
  checklist_item: ID;
  is_completed: boolean;
  completed_at: string | null;
  notes: string;
  operator: ID;
  recorded_by: ID;
  status: EntryStatus;
  source: "mobile" | "web" | "import";
  client_uuid: string | null;
}

export interface HourlyBreakdownEntry {
  id: ID;
  shift_instance: ID;
  site: ID;
  crusher: ID;
  hourly_slot: ID;
  slot_start_at: string;
  slot_end_at: string;
  causes: ID[];
  other_cause_text: string;
  downtime_minutes: number | null;
  comments: string;
  operator: ID;
  recorded_by: ID;
  status: EntryStatus;
  source: "mobile" | "web" | "import";
  client_uuid: string | null;
}

export type BreakdownIncidentStatus = "open" | "in_progress" | "resolved";

export interface BreakdownIncident {
  id: ID;
  site: ID;
  section: ID | null;
  crusher: ID;
  shift_instance: ID | null;
  time_occurred: string;
  time_reported: string;
  time_attended: string | null;
  time_completed: string | null;
  artisan: ID | null;
  cause: ID | null;
  cause_other_text: string;
  description: string;
  root_cause_of_failure: string;
  remedial_action_taken: string;
  severity: "low" | "medium" | "high" | "";
  status: BreakdownIncidentStatus;
  reported_by: ID;
  recorded_by: ID;
  source: "mobile" | "web" | "import";
  client_uuid: string | null;
  comments: string;
  attend_minutes: number | null;
  repair_minutes: number | null;
  resolution_minutes: number | null;
}

export interface ShiftCrushingSummary {
  id: ID;
  shift_instance: ID;
  site: ID;
  crusher: ID;
  crushing_time_minutes: number | null;
  down_time_minutes: number | null;
  crushed_tonnage: string | null;
  stoppage_instances: number;
  availability_pct: string | null;
  comments: string;
  status: EntryStatus;
  recorded_by: ID;
  source: "mobile" | "web" | "import";
  client_uuid: string | null;
}

export interface BreakdownParetoRow {
  cause: ID | null;
  cause_name: string;
  hourly_tick_count: number;
  incident_count: number;
  incident_total_minutes: number;
}

export interface MttrMtbfTrendPoint {
  period: string;
  mttr_minutes: number | null;
  resolution_minutes: number | null;
  mtbf_minutes: number | null;
  incident_count: number;
}

export type ChecklistComplianceStatus = "done" | "missed" | "pending";

export interface ChecklistHeatmapRow {
  hourly_slot: ID;
  slot_index: number;
  items: { checklist_item: ID; checklist_item_name: string; status: ChecklistComplianceStatus }[];
}
