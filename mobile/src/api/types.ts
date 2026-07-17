export type ID = number;

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type Role = "admin" | "manager" | "supervisor" | "operator";

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

export interface SubSection {
  id: ID;
  section: ID;
  name: string;
  code: string;
  active: boolean;
  display_order: number;
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
  machine_type: ID;
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
  sub_section: ID | null;
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
  display_order: number;
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

// -- Crushing & Breakdowns module ---------------------------------------------

export interface BreakdownCause {
  id: ID;
  name: string;
  code: string;
  is_other: boolean;
  display_order: number;
  active: boolean;
}

export interface ChecklistItem {
  id: ID;
  name: string;
  code: string;
  description: string;
  display_order: number;
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
