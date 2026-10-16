// The ONE data-access interface the UI talks to. Implementations: local.ts (demo) and supabase.ts.
// Reads come from the shared snapshot in core.ts (useDB); writes go through these commands.
import type { Changeover, Enquiry, Stay, StayInput, Worker } from './core';
export interface Repo {
  mode: 'demo' | 'supabase';
  init(): Promise<void>;
  saveStay(input: StayInput): Promise<Stay>;           // create or update (incl. naming a hold = same record). Throws ConflictError on stale edit.
  deleteStay(id: string): Promise<void>;
  confirmDeparture(id: string): Promise<void>;
  updateChangeover(id: string, patch: Partial<Changeover>): Promise<void>;
  dismissChangeover(id: string): Promise<void>;                      // provider clears a flagged (cancelled) changeover
  updateProperty(id: string, p: { checkout?: string; checkin?: string }): Promise<void>;
  setPrefs(userId: string, p: { smsOptIn?: boolean; pushEnabled?: boolean }): Promise<void>;
  upsertWorker(w: Partial<Worker> & { name: string }): Promise<Worker>;
  addEnquiry(e: Omit<Enquiry, 'id' | 'ts' | 'status'>): Promise<void>;
  setUser(id: string): Promise<void>;                  // demo: role switch. supabase: no-op (identity = login)
  reset(): Promise<void>;                              // demo: reseed. supabase: sign out
  signIn?(email: string): Promise<void>;               // supabase: email magic link
}
