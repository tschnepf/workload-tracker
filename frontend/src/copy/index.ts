/**
 * Typed UI copy catalog with lightweight interpolation.
 */

type Primitive = string | number;

export const COPY = {
  'common.loading': 'Loading...',
  'common.loadingData': 'Loading data...',
  'common.saving': 'Saving...',
  'common.error': 'Error',
  'common.noData': 'No data available',
  'common.noResults': 'No results',
  'common.unknown': 'Unknown',

  'button.cancel': 'Cancel',
  'button.save': 'Save',
  'button.create': 'Create',
  'button.update': 'Update',
  'button.clear': 'Clear',
  'button.refresh': 'Refresh',
  'button.reload': 'Reload',
  'button.show': 'Show',
  'button.hide': 'Hide',
  'button.back': 'Back',

  'label.search': 'Search',
  'label.status': 'Status',
  'label.project': 'Project',
  'label.person': 'Person',
  'label.department': 'Department',
  'label.vertical': 'Vertical',
  'label.client': 'Client',
  'label.weeks': 'Weeks',
  'label.layout': 'Layout',
  'label.timeHorizon': 'Time Horizon',

  'status.active': 'Active',
  'status.planning': 'Planning',
  'status.onHold': 'On Hold',
  'status.completed': 'Completed',
  'status.cancelled': 'Cancelled',
  'status.inactive': 'Inactive',
  'status.activeCa': 'Active CA',

  'section.filters': 'Filters',
  'section.appearance': 'Theme',
  'section.notifications': 'Notifications',
  'section.projectSettings': 'Project Settings',

  'state.selectPersonPrompt': 'Select a person to see project experience.',
  'state.noProjectsWindow': 'No projects in this window.',
  'state.loadingManagerDashboard': 'Loading manager dashboard...',
  'state.selectDepartmentPrompt': 'Select a department to load manager analytics',

  'msg.windowRange': 'Window: {start} to {end}',
  'msg.showingWindow': 'Showing {count} {unit} ending {end}',
  'msg.clientByProject': 'Client: {client} - By Project',

  'deliverables.title': 'Upcoming Deliverables',
  'deliverables.subtitle': 'Next 14 Days - {deliverables} Deliverables - {projects} Projects',
  'deliverables.enterFullscreen': 'Enter Full Screen',
  'deliverables.exitFullscreen': 'Exit Full Screen',
  'deliverables.col.dueDate': 'Due Date',
  'deliverables.col.project': 'Project',
  'deliverables.col.deliverable': 'Deliverable',
  'deliverables.col.departmentsLeads': 'Departments and Leads',
  'deliverables.loading': 'Loading deliverables...',
  'deliverables.unavailable': 'Deliverables unavailable right now.',
  'deliverables.noneUpcoming': 'No deliverables scheduled in the next 14 days.',
  'deliverables.loadingCoverage': 'Loading lead coverage...',
  'deliverables.noLeadsMapped': 'No department leads mapped',
  'deliverables.updatedAt': 'Updated {time}',
  'deliverables.pageOf': 'Page {current} of {total}',
  'deliverables.nextIn': 'Next in {seconds}s',
  'deliverables.refreshingCoverage': 'Refreshing coverage',
  'deliverables.updating': 'Updating',
  'deliverables.completed': 'Completed',
  'deliverables.inDays': 'In {days} days',
  'deliverables.overdue': '{days}d overdue',
  'deliverables.today': 'Today',
  'deliverables.tomorrow': 'Tomorrow',
} as const;

export type CopyKey = keyof typeof COPY;

type PlaceholderKeys<S extends string> =
  S extends `${string}{${infer Param}}${infer Rest}`
    ? Param | PlaceholderKeys<Rest>
    : never;

export type CopyParams<K extends CopyKey> =
  [PlaceholderKeys<(typeof COPY)[K]>] extends [never]
    ? Record<string, never>
    : Record<PlaceholderKeys<(typeof COPY)[K]>, Primitive>;

const INTERP_RE = /\{([a-zA-Z0-9_]+)\}/g;

export function t<K extends CopyKey>(key: K, params?: CopyParams<K>): string {
  const template = COPY[key];
  if (!params) return template;
  return template.replace(INTERP_RE, (_, name: string) => {
    const value = (params as Record<string, Primitive>)[name];
    return value == null ? `{${name}}` : String(value);
  });
}
