// Copy summary: role-aware text. The client's version never names a cleaner.
import { beforeAll, describe, expect, it } from 'vitest';
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => mem.set(k, v),
  removeItem: (k: string) => mem.delete(k),
  clear: () => mem.clear(),
};
const { localRepo: repo } = await import('../data/local');
const { S } = await import('../data/core');
const { summaryText } = await import('./summary');
const { londonToday } = await import('../dates');

beforeAll(async () => {
  await repo.reset();
  await repo.setUser('u-eshcol');
  // book today's clean with a named cleaner so the provider text has a name in it
  const c = S.db.changeovers.find(x => x.afterDate === londonToday())!;
  const cleaner = S.db.users.find(u => u.role === 'cleaner')!;
  await repo.updateChangeover(c.id, { status: 'scheduled', scheduledFor: londonToday(), cleanerId: cleaner.id });
});

describe('copy summary', () => {
  it('covers today and tomorrow', () => {
    const t = summaryText('manager');
    expect(t).toMatch(/^Roomboard summary/);
    expect(t).toMatch(/Today · /);
    expect(t).toMatch(/Tomorrow · /);
    expect(t).toMatch(/Leaving:/);
    expect(t).toMatch(/Cleans:/);
  });
  it('provider version names the cleaner', () => {
    const name = S.db.users.find(u => u.role === 'cleaner')!.name;
    expect(summaryText('manager')).toContain(name);
  });
  it("client version has no cleaner names and only 'Ready by' wording", () => {
    const t = summaryText('client');
    for (const u of S.db.users.filter(x => x.role === 'cleaner')) expect(t).not.toContain(u.name);
    expect(t).not.toMatch(/Clean booked|Clean to book|Cleaning now/);
  });
});
