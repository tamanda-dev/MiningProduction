export type ID = number;

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// Manager was removed as a distinct role — Supervisor absorbed everything
// it used to do (mirrors dashboard/src/types/index.ts).
export type Role = "admin" | "supervisor" | "operator";

export interface Me {
  id: ID;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  employee_code: string | null;
  phone: string;
  maintenance_technician: boolean;
  roles: Role[];
  site_accesses: { site: ID; section: ID | null }[];
}

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

export type ParameterScope = "machine" | "section" | "shift";
export type ParameterDataType = "number" | "integer" | "text" | "select" | "boolean";

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

export type ShiftInstanceStatus = "open" | "closed" | "approved";

export interface ShiftInstance {
  id: ID;
  shift: ID;
  shift_name: string;
  date: string;
  site: ID;
  status: ShiftInstanceStatus;
}

export interface TimeSlot {
  slot_index: number;
  start_at: string;
  end_at: string;
}

export interface DowntimeReasonCode {
  id: ID;
  code: string;
  description: string;
  category: string;
  active: boolean;
}

export interface UOM {
  id: ID;
  name: string;
  abbreviation: string;
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

export interface ShiftPattern {
  id: ID;
  name: string;
  description: string;
}

export interface Team {
  id: ID;
  site: ID;
  name: string;
  section: ID | null;
  shift_pattern: ID | null;
  active: boolean;
}

export interface TeamMember {
  id: ID;
  team: ID;
  user: ID;
  role_on_team: "team_leader" | "operator";
}

export interface Shift {
  id: ID;
  site: ID;
  name: string;
  start_time: string;
  end_time: string;
  slot_length_minutes: number;
}

export type PlanTargetPeriodType = "shift" | "day" | "month";

export interface PlanTarget {
  id: ID;
  parameter: ID;
  site: ID;
  section: ID | null;
  machine: ID | null;
  period_type: PlanTargetPeriodType;
  shift_instance: ID | null;
  period_date: string | null;
  target_value: string;
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

export type EntryType = "hourly" | "shift_total";
export type EntryStatus = "submitted" | "flagged" | "corrected" | "approved";

export interface UserSummary {
  id: ID;
  username: string;
  first_name: string;
  last_name: string;
  employee_code: string | null;
  maintenance_technician: boolean;
}

export interface UserDetail extends UserSummary {
  email: string;
  is_active: boolean;
  roles: Role[];
  date_joined: string;
  last_login: string | null;
}

// -- Dashboard (Admin/Supervisor) ---------------------------------------------

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
}
