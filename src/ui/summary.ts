// "Copy summary": today's and tomorrow's movements and cleans as plain text. Role-aware:
// the client's version never contains cleaner names (same rule as every client screen).
import { getDB, me, roomLabel, stayLabel, readinessFor } from '../data';
import type { Role, Stay } from '../data';
import { addDays, fmt, londonToday } from '../dates';
import { movements } from './Today';

export function summaryText(role: Role = me().role, today = londonToday()): string {
  const db = getDB();
  const nm = (s: Stay) => (role === 'cleaner' ? stayLabel(s).split(' ')[0] : stayLabel(s));
  const day = (d: string, title: string) => {
    const m = movements(d);
    const lines: string[] = [`${title} · ${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}`];
    const list = (label: string, xs: string[]) =>
      lines.push(`${label}: ${xs.length ? '' : 'none'}`, ...xs.map(x => `  • ${x}`));
    list(
      'Leaving',
      m.dep.map(s => `${roomLabel(s.roomId)} · ${nm(s)}${s.depStatus === 'confirmed' ? '' : ' (planned)'}`),
    );
    list(
      'Arriving',
      m.arr.map(s => `${roomLabel(s.roomId)} · ${nm(s)}${s.workerId ? '' : ' (name to follow)'}`),
    );
    list(
      'Cleans',
      m.cos.map(c => {
        const r = readinessFor(c);
        if (role === 'client') return `${roomLabel(c.roomId)} · ${r.client ?? 'No next arrival booked'}`;
        const who = db.users.find(u => u.id === c.cleanerId)?.name;
        return `${roomLabel(c.roomId)} · ${r.provider}${who ? ` · ${who}` : ''}`;
      }),
    );
    return lines.join('\n');
  };
  return [`Roomboard summary`, day(today, 'Today'), day(addDays(today, 1), 'Tomorrow')].join('\n\n') + '\n';
}

export async function copySummary(): Promise<boolean> {
  const t = summaryText();
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    // clipboard blocked (http, permissions): fall back to a hidden textarea
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
