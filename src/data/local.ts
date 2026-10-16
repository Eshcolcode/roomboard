// Demo backend: everything lives in this browser (localStorage). Same commands as the Supabase backend.
// Modules: seed (example data), store (load/commit/log/undo), alerts (routing + simulated outbox),
// stays, changeovers, misc (workers, enquiries), index (the Repo).
export { localRepo } from './local/index';
