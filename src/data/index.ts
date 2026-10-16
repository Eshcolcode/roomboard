// Backend chosen by config only: VITE_DATA_MODE=demo (default) | supabase (+ VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
import type { Repo } from './repo';
import { localRepo } from './local';
export * from './core';
export type { Repo } from './repo';
const mode = (import.meta.env.VITE_DATA_MODE ?? 'demo') as 'demo' | 'supabase';
let repo: Repo = localRepo;
export async function initData() {
  if (mode === 'supabase') repo = (await import('./supabase')).supabaseRepo;
  await repo.init();
}
export const data = new Proxy({} as Repo, { get: (_t, k) => (repo as never)[k] });
