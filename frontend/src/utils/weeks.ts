// Week helpers using UTC to avoid TZ drift

export function sundayOf(d: Date): Date {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = dt.getUTCDay(); // 0=Sun, 6=Sat
  // We want the Sunday of the current week; for Sunday (0) subtract 0 days
  const delta = (dow + 7) % 7; // for Sunday(0)->0, Monday(1)->1, ... Saturday(6)->6
  dt.setUTCDate(dt.getUTCDate() - delta);
  return dt;
}

export function weekKey(d: Date): string {
  const s = sundayOf(d);
  return s.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function getSundaysFrom(start: Date, count: number): string[] {
  const n = Math.max(0, Math.floor(count || 0));
  const out: string[] = [];
  const first = sundayOf(start);
  for (let i = 0; i < n; i++) {
    const dt = new Date(first); // already UTC midnight
    dt.setUTCDate(first.getUTCDate() + i * 7);
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}

