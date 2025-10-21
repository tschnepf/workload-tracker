export function buildAssignmentsLink(opts: { weeks: number; statuses?: string[] }) {
  const sp = new URLSearchParams();
  sp.set('view', 'people');
  sp.set('weeks', String(opts.weeks));
  if (opts.statuses && opts.statuses.length > 0) sp.set('status', opts.statuses.join(','));
  return `/assignments?${sp.toString()}`;
}

export function buildProjectAssignmentsLink(opts: { weeks: number; statuses?: string[] }) {
  const sp = new URLSearchParams();
  sp.set('view', 'project');
  sp.set('weeks', String(opts.weeks));
  if (opts.statuses && opts.statuses.length > 0) sp.set('status', opts.statuses.join(','));
  return `/project-assignments?${sp.toString()}`;
}

