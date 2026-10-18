// Row shapes of the Supabase tables (snake_case, as stored). Kept in step with supabase/migrations/*.sql.
import type { Role, Bath, CoStatus, Alert, Enquiry } from './core';
type N<T> = T | null;
export interface StayRow {
  id: string;
  room_id: string;
  worker_id: N<string>;
  hold_label: N<string>;
  arrival: string;
  departure: N<string>;
  dep_status: 'confirmed' | 'planned' | 'tbc' | 'ufn';
  away_from: N<string>;
  away_to: N<string>;
  notes: N<string>;
  version: number;
  updated_by: string;
  updated_at: string;
  series_id?: N<string>;
  slot?: N<number>;
  booked_by?: N<string>;
}
export interface ChangeoverRow {
  id: string;
  room_id: string;
  from_stay_id: N<string>;
  to_stay_id: N<string>;
  after_date: string;
  ready_by: N<string>;
  status: CoStatus;
  scheduled_for: N<string>;
  cleaner_id: N<string>;
  note: N<string>;
  invalidated_reason: N<string>;
  vacated: boolean;
  zero_day: boolean;
  cancelled_reason: N<string>;
  exception_reason: N<string>;
}
export interface ProfileRow {
  id: string;
  full_name: string;
  role: Role;
  email: N<string>;
  phone: N<string>;
  sms_opt_in: boolean;
  push_enabled: boolean;
}
export interface PropertyRow {
  id: string;
  name: string;
  short_name: string;
  contracted: boolean;
  address: N<string>;
  blurb: N<string>;
  photo_url: N<string>;
  features: N<string[]>;
  beds_label: N<string>;
  brand: N<string>;
  checkout_time: N<string>;
  checkin_time: N<string>;
  details?: N<Record<string, unknown>>; // 0008: area, photos, sleeps, map/website, bookingUrl, credit, todo
}
export interface UnitRow {
  id: string;
  property_id: string;
  name: string;
}
export interface RoomRow {
  id: string;
  property_id: string;
  unit_id: string;
  name: string;
  bath: Bath;
  note: N<string>;
  photo_url: N<string>;
  floor: N<string>;
  details?: N<Record<string, unknown>>; // 0008: photos, desc, beds
}
export interface WorkerRow {
  id: string;
  name: string;
  company: N<string>;
  phone: N<string>;
  notes: N<string>;
  last_used: N<string>;
  uses: N<number>;
}
export interface ActivityRow {
  id: string;
  ts: string;
  user_id: string;
  text: string;
  property_id: N<string>;
  manager_only?: boolean;
}
export interface SettingsHistoryRow {
  changed_at: string;
  changed_by: N<string>;
  old_value: unknown;
  new_value: unknown;
  key: string;
}
export interface SettingsRow {
  key: string;
  value: unknown;
}
export interface AlertRow {
  id: string;
  created_at: string;
  recipient_id: string;
  channel: Alert['channel'];
  recipient: string;
  subject: string;
  body: string;
  status: Alert['status'];
  attempts: number;
  next_attempt_at: string;
}
export interface EnquiryRow {
  id: string;
  created_at: string;
  property_id: string;
  date_from: string;
  date_to: N<string>;
  long_term: boolean;
  people: number;
  note: N<string>;
  status: Enquiry['status'];
}
export interface PgError {
  code?: string;
  message: string;
}
export interface SeriesRow {
  id: string;
  label: string;
  property_id: string;
  start_date: string;
  on_days: number;
  off_days: number;
  off_mode: 'keep' | 'release';
  end_kind: 'date' | 'ufn' | 'cycles';
  end_date: N<string>;
  cycles: N<number>;
  horizon: N<string>;
  slots: N<{ slot: number; workerId: string | null; label: string }[]>;
  cancelled_from: N<string>;
  created_by: string;
  created_at: string;
}
export interface FeedRow {
  id: string;
  room_id: string;
  label: string;
  linked: boolean;
  last_synced_at: N<string>;
  last_error: N<string>;
}
export interface BlockRow {
  id: string;
  feed_id: string;
  room_id: string;
  start_date: string;
  end_date: string;
}
