/* eslint-disable max-lines, max-lines-per-function */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { getFlag } from '@/lib/flags';
import { isAdminOrManager, isAdminUser } from '@/utils/roleAccess';

type ScreenshotPlaceholder = {
  fileName: string;
  capture: string;
};

type HelpSection = {
  id: string;
  title: string;
  route?: string;
  routeLabel?: string;
  audience: 'Everyone' | 'Managers and Admins' | 'Admins';
  purpose: string;
  whatYouCanDo: string[];
  steps: string[];
  screenshots: ScreenshotPlaceholder[];
  notes?: string[];
};

const SCREENSHOT_FOLDER = 'frontend/public/help-screenshots';
const PUBLIC_SCREENSHOT_PREFIX = '/help-screenshots';

const SETTINGS_AREAS: Array<{ name: string; use: string }> = [
  { name: 'Roles', use: 'Create and organize job roles used across the system.' },
  { name: 'Verticals', use: 'Manage high-level business groups that organize work.' },
  { name: 'Project Roles', use: 'Set role options by department for project staffing.' },
  { name: 'Status and Colors', use: 'Control project status names and colors used in filters and reports.' },
  { name: 'Manloader Template', use: 'Set default workload templates for automatic hour planning.' },
  { name: 'Pre-Deliverables', use: 'Set global defaults for pre-deliverable and QA items.' },
  { name: 'Task Templates', use: 'Define repeatable task templates by vertical.' },
  { name: 'Deliverable Phase Mapping', use: 'Set how deliverables are grouped into phases.' },
  { name: 'User Accounts', use: 'Create user accounts, adjust access, and manage invites.' },
  { name: 'Notifications', use: 'Manage system-wide notification behavior and channels.' },
  { name: 'Calendar Feeds', use: 'Create or refresh personal calendar feed links.' },
  { name: 'Integrations Hub', use: 'Connect external systems and manage sync health.' },
  { name: 'General', use: 'Manage shared exclusion keywords and global defaults.' },
  { name: 'Backup and Restore', use: 'Create backups and restore from backup files.' },
  { name: 'Logs', use: 'Review recent platform activity and event history.' },
  { name: 'Utilization Hours and Color Scheme', use: 'Set utilization ranges and color levels.' },
  { name: 'Network Graph Analytics', use: 'Set relationship scoring defaults for the Network Graph report.' },
];

const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'my-work',
    title: 'My Work',
    route: '/my-work',
    routeLabel: '/my-work',
    audience: 'Everyone',
    purpose: 'Your personal home page for assignments, milestones, schedule, and project responsibilities.',
    whatYouCanDo: [
      'See your current workload and utilization at a glance.',
      'Review your projects, milestones, and schedule in one place.',
      'Refresh your personal data when updates are made by your team.',
    ],
    steps: [
      'Open My Work from the left menu.',
      'Start with the summary card to confirm your current load.',
      'Review the project and deliverable cards for upcoming deadlines.',
      'Use Refresh if anything looks out of date.',
    ],
    screenshots: [
      {
        fileName: 'my-work-01-overview.png',
        capture: 'Full My Work page with all cards visible.',
      },
      {
        fileName: 'my-work-02-schedule-strip.png',
        capture: 'My Schedule card with weekly bars visible.',
      },
    ],
  },
  {
    id: 'team-dashboard',
    title: 'Team Dashboard',
    route: '/dashboard',
    routeLabel: '/dashboard',
    audience: 'Managers and Admins',
    purpose: 'High-level view of team health, utilization, active projects, and upcoming deliverables.',
    whatYouCanDo: [
      'Switch time period (weeks) to compare short-term and longer-term workload.',
      'Filter by department to focus on one group.',
      'Review cards for utilization, active projects, alerts, and role capacity.',
    ],
    steps: [
      'Choose a time period near the top right.',
      'Select a department if you want a focused view.',
      'Scan alert cards first (overallocated and availability).',
      'Open project details from deliverable rows when follow-up is needed.',
    ],
    screenshots: [
      {
        fileName: 'team-dashboard-01-header-filters.png',
        capture: 'Dashboard header with Time Period and Department filters.',
      },
      {
        fileName: 'team-dashboard-02-cards-grid.png',
        capture: 'Main dashboard card grid showing KPI and alert cards.',
      },
    ],
  },
  {
    id: 'deliverables-calendar',
    title: 'Calendar',
    route: '/deliverables/calendar',
    routeLabel: '/deliverables/calendar',
    audience: 'Everyone',
    purpose: 'Calendar view of milestones and pre-deliverables for planning and deadline tracking.',
    whatYouCanDo: [
      'Search by person, project, client, or department.',
      'Toggle pre-deliverables on or off.',
      'Change week range to zoom in or out.',
      'Copy the calendar feed link for Outlook subscription.',
    ],
    steps: [
      'Open Calendar from the left menu.',
      'Use Search to narrow the calendar to what matters to you.',
      'Set week range using the week buttons.',
      'Click a calendar item to open related project details.',
    ],
    screenshots: [
      {
        fileName: 'calendar-01-main-view.png',
        capture: 'Calendar page with search, pre-deliverable toggle, and week controls.',
      },
      {
        fileName: 'calendar-02-outlook-feed-link.png',
        capture: 'Area showing the Copy Outlook Calendar Link Feed action.',
      },
    ],
  },
  {
    id: 'projects',
    title: 'Projects',
    route: '/projects',
    routeLabel: '/projects',
    audience: 'Everyone',
    purpose: 'Main project workspace for project status, staffing, details, and deliverables.',
    whatYouCanDo: [
      'Find projects quickly with filters and search.',
      'Open project details and update project information.',
      'Review assigned people and workload coverage.',
      'Create a new project if your role has access.',
    ],
    steps: [
      'Use the search bar and filter menu to narrow the list.',
      'Select a project row to open details.',
      'Review status, people assignments, and upcoming deliverables.',
      'Use Refresh if recently changed information is not shown yet.',
    ],
    screenshots: [
      {
        fileName: 'projects-01-list-filters.png',
        capture: 'Project list with filters and search in the top area.',
      },
      {
        fileName: 'projects-02-details-panel.png',
        capture: 'Selected project with right-side details panel open.',
      },
    ],
  },
  {
    id: 'project-dashboard',
    title: 'Project Dashboard (Single Project)',
    audience: 'Everyone',
    purpose: 'Detailed, project-by-project review page opened from a selected project.',
    whatYouCanDo: [
      'Review full project timeline and assignment details.',
      'Inspect deliverables and related staffing context.',
      'Share a specific project view in meetings.',
    ],
    steps: [
      'Open Projects first.',
      'Open the project dashboard action from the project row or details area.',
      'Use this page for deep project review and planning meetings.',
    ],
    screenshots: [
      {
        fileName: 'project-dashboard-01-overview.png',
        capture: 'Project dashboard with project context and staffing details.',
      },
    ],
    notes: ['This page opens per project, so the direct link changes by project.'],
  },
  {
    id: 'assignments',
    title: 'Assignments',
    route: '/assignments',
    routeLabel: '/assignments',
    audience: 'Everyone',
    purpose: 'Person-focused workload grid to plan weekly hours and adjust assignments.',
    whatYouCanDo: [
      'Search and filter assignments by people, projects, and status.',
      'Edit weekly hours in the grid (based on your access).',
      'Switch to project-focused view with one click.',
      'Copy forward or clear selected cells to speed up planning.',
    ],
    steps: [
      'Open Assignments and choose week horizon.',
      'Use search and filter controls to focus your list.',
      'Click hour cells to update workload values.',
      'Use Save status feedback near the top to confirm changes.',
    ],
    screenshots: [
      {
        fileName: 'assignments-01-grid-overview.png',
        capture: 'Assignments page with top controls and weekly grid.',
      },
      {
        fileName: 'assignments-02-cell-selection.png',
        capture: 'Selected grid cells showing Copy Forward and Clear actions.',
      },
    ],
  },
  {
    id: 'project-assignments',
    title: 'Project Assignments',
    route: '/project-assignments',
    routeLabel: '/project-assignments',
    audience: 'Everyone',
    purpose: 'Project-focused workload grid showing each project with assigned people and weekly hours.',
    whatYouCanDo: [
      'View staffing by project instead of by person.',
      'Expand or collapse projects to focus only on what you need.',
      'Edit assignment hours and roles where allowed.',
      'Switch back to person-focused Assignments view.',
    ],
    steps: [
      'Open Project Assignments from the left menu.',
      'Set week horizon and filters at the top.',
      'Expand project rows to view assigned team members.',
      'Update weekly values and review save status feedback.',
    ],
    screenshots: [
      {
        fileName: 'project-assignments-01-grid-overview.png',
        capture: 'Project Assignments page with project rows and hour columns.',
      },
      {
        fileName: 'project-assignments-02-expanded-project.png',
        capture: 'Expanded project showing assigned people and editable cells.',
      },
    ],
  },
  {
    id: 'departments',
    title: 'Departments',
    route: '/departments',
    routeLabel: '/departments',
    audience: 'Managers and Admins',
    purpose: 'Department management page for department setup, structure, and manager ownership.',
    whatYouCanDo: [
      'Create a new department.',
      'Search and select departments quickly.',
      'Edit department details, manager assignments, and descriptions.',
      'Set parent department relationships.',
    ],
    steps: [
      'Open Departments from the left menu.',
      'Select a department in the left list.',
      'Review details in the right panel.',
      'Use Add Department for new teams.',
    ],
    screenshots: [
      {
        fileName: 'departments-01-list-and-search.png',
        capture: 'Department list with Add Department and search box.',
      },
      {
        fileName: 'departments-02-details-panel.png',
        capture: 'Department details panel with manager and hierarchy details.',
      },
    ],
  },
  {
    id: 'manager-view',
    title: 'Manager View',
    route: '/departments/manager',
    routeLabel: '/departments/manager',
    audience: 'Managers and Admins',
    purpose: 'Manager-focused analytics page for risk, utilization trends, and reassignment opportunities.',
    whatYouCanDo: [
      'Select a department and sub-department scope.',
      'Switch layout options for different management perspectives.',
      'Review at-risk projects and overlapping deliverables.',
      'Identify team members with available capacity.',
    ],
    steps: [
      'Choose your department at the top.',
      'Pick a time horizon and layout option.',
      'Review risk and utilization tiles first.',
      'Use the table sections to decide follow-up actions.',
    ],
    screenshots: [
      {
        fileName: 'manager-view-01-controls.png',
        capture: 'Top control area with department, horizon, and layout selectors.',
      },
      {
        fileName: 'manager-view-02-risk-table.png',
        capture: 'Risk table showing sortable people and project risk columns.',
      },
    ],
  },
  {
    id: 'org-chart',
    title: 'Org Chart',
    route: '/departments/hierarchy',
    routeLabel: '/departments/hierarchy',
    audience: 'Managers and Admins',
    purpose: 'Visual organizational chart showing department relationships and team members.',
    whatYouCanDo: [
      'See department hierarchy at a glance.',
      'Click departments to view detailed info.',
      'Review team members and capacity summaries per department.',
    ],
    steps: [
      'Open Org Chart from the left menu.',
      'Use the visual chart to find the department you need.',
      'Click a department to load its details panel.',
      'On mobile, close the details drawer when done.',
    ],
    screenshots: [
      {
        fileName: 'org-chart-01-hierarchy.png',
        capture: 'Main Department Hierarchy page with organizational chart visible.',
      },
      {
        fileName: 'org-chart-02-details-panel.png',
        capture: 'Selected department details showing team member list.',
      },
    ],
  },
  {
    id: 'department-reports',
    title: 'Department Reports',
    route: '/departments/reports',
    routeLabel: '/departments/reports',
    audience: 'Managers and Admins',
    purpose: 'Department analytics page for utilization, capacity, and team health indicators.',
    whatYouCanDo: [
      'Change timeframe to compare short and long windows.',
      'Review company-wide summary cards.',
      'Inspect department-by-department health metrics in table form.',
      'Open Person Report directly from this page.',
    ],
    steps: [
      'Set a timeframe using the week buttons.',
      'Review summary cards across all departments.',
      'Use the department table to find health concerns quickly.',
      'Open Person Report for deeper person-level review if needed.',
    ],
    screenshots: [
      {
        fileName: 'department-reports-01-summary-cards.png',
        capture: 'Department Reports header and summary metrics cards.',
      },
      {
        fileName: 'department-reports-02-performance-table.png',
        capture: 'Department Performance Overview table with health indicators.',
      },
    ],
  },
  {
    id: 'people',
    title: 'People',
    route: '/people',
    routeLabel: '/people',
    audience: 'Managers and Admins',
    purpose: 'People management workspace for staffing details, filters, and profile updates.',
    whatYouCanDo: [
      'Search and filter people by department, location, and status.',
      'Open full details for one person and update information.',
      'Use bulk actions for multi-person updates.',
      'Add a new person profile.',
    ],
    steps: [
      'Use search and filters to narrow the list.',
      'Select a person to open the details panel.',
      'Apply updates in the person details area.',
      'Use Bulk Actions when making the same change for many people.',
    ],
    screenshots: [
      {
        fileName: 'people-01-list-and-filters.png',
        capture: 'People list with filters and search visible.',
      },
      {
        fileName: 'people-02-person-details.png',
        capture: 'Selected person with right-side detail panel.',
      },
    ],
  },
  {
    id: 'skills-workspace',
    title: 'Skills Workspace',
    route: '/skills',
    routeLabel: '/skills',
    audience: 'Managers and Admins',
    purpose: 'Skill management page for matching people to skills and tracking development goals.',
    whatYouCanDo: [
      'Switch between Skill to People and People to Skills views.',
      'Filter by department and search skills or people.',
      'Add skills, assign skills, and remove outdated skill links.',
      'Open person skill details for deeper context.',
    ],
    steps: [
      'Choose a department from the left panel.',
      'Select your view mode based on your task.',
      'Find a skill or person and open details.',
      'Add or remove skills as needed, then confirm updates were saved.',
    ],
    screenshots: [
      {
        fileName: 'skills-01-workspace-overview.png',
        capture: 'Skills Workspace with department panel and mode controls.',
      },
      {
        fileName: 'skills-02-detail-panel.png',
        capture: 'Skill or person detail panel showing add/remove actions.',
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    route: '/settings',
    routeLabel: '/settings',
    audience: 'Managers and Admins',
    purpose: 'Central admin area for platform defaults, user access, integrations, and backup controls.',
    whatYouCanDo: [
      'Use the left section list to jump to specific setup areas.',
      'Search for a settings section by name.',
      'Manage standards used across projects, assignments, and reports.',
      'Control user accounts, notifications, integrations, and backups.',
    ],
    steps: [
      'Open Settings and use the left list to choose a section.',
      'Read section heading before changing values so scope is clear.',
      'Save changes in each section where save actions are provided.',
      'Recheck related pages (Projects, Assignments, Reports) after major setting updates.',
    ],
    screenshots: [
      {
        fileName: 'settings-01-sections-navigation.png',
        capture: 'Settings page with left section navigation and search.',
      },
      {
        fileName: 'settings-02-example-section.png',
        capture: 'One open settings section with editable fields and actions.',
      },
    ],
    notes: ['Use this page carefully: many settings affect all users and all projects.'],
  },
  {
    id: 'forecast-planner',
    title: 'Forecast Planner',
    route: '/reports/forecast',
    routeLabel: '/reports/forecast',
    audience: 'Managers and Admins',
    purpose: 'Planning tool for go/no-go decisions based on projected workload and proposed projects.',
    whatYouCanDo: [
      'Set planning horizon and department scope.',
      'Choose which project statuses are included in baseline workload.',
      'Add proposed projects and test multiple what-if scenarios.',
      'Save scenarios for future review and comparison.',
    ],
    steps: [
      'Set Weeks, Department, and Scenario at the top.',
      'Choose included statuses to define your baseline.',
      'Add proposed projects and fill out probability and quantity.',
      'Click Evaluate, review results, then save the scenario.',
    ],
    screenshots: [
      {
        fileName: 'forecast-planner-01-controls.png',
        capture: 'Forecast Planner header with Evaluate and Save Scenario actions.',
      },
      {
        fileName: 'forecast-planner-02-proposed-projects.png',
        capture: 'Proposed Projects section with sample rows filled in.',
      },
    ],
  },
  {
    id: 'network-graph',
    title: 'Network Graph',
    route: '/reports/network',
    routeLabel: '/reports/network',
    audience: 'Managers and Admins',
    purpose: 'Relationship map of people, projects, and clients to reveal collaboration patterns.',
    whatYouCanDo: [
      'Switch graph mode and time window.',
      'Adjust thresholds and weights to tune relationship strength.',
      'Search nodes and focus on one person or client connection.',
      'Use expanded view for a larger graph workspace.',
    ],
    steps: [
      'Open Network Graph and set the desired time window.',
      'Adjust sliders or fields in controls to refine connections.',
      'Select nodes to inspect details and related links.',
      'Reset view to return to default perspective when needed.',
    ],
    screenshots: [
      {
        fileName: 'network-graph-01-controls.png',
        capture: 'Network Graph page with filter controls and warnings panel.',
      },
      {
        fileName: 'network-graph-02-canvas-details.png',
        capture: 'Graph canvas with side detail panels visible.',
      },
    ],
  },
  {
    id: 'person-report',
    title: 'Person Report',
    route: '/reports/person-report',
    routeLabel: '/reports/person-report',
    audience: 'Managers and Admins',
    purpose: 'Person-level reporting with history, skills, goals, and check-ins.',
    whatYouCanDo: [
      'Choose department, then select a person.',
      'Review work history metrics, clients, roles, and project summary.',
      'Track skills by category.',
      'Add goals and check-in snapshots for coaching and planning.',
    ],
    steps: [
      'Set report months and include inactive option if needed.',
      'Select a department, then select a person.',
      'Review summary cards and project table first.',
      'Add or update goals and check-ins during review meetings.',
    ],
    screenshots: [
      {
        fileName: 'person-report-01-selection-panels.png',
        capture: 'Department and people selection panels with main report area.',
      },
      {
        fileName: 'person-report-02-goals-checkins.png',
        capture: 'Goals and check-ins section with add actions.',
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    route: '/notifications',
    routeLabel: '/notifications',
    audience: 'Everyone',
    purpose: 'Inbox for alerts and updates, with controls for reading, saving, snoozing, and muting.',
    whatYouCanDo: [
      'Switch between unread, saved, and cleared views.',
      'Mark alerts as read or unread.',
      'Snooze or clear individual messages.',
      'Set per-project mute windows by channel.',
    ],
    steps: [
      'Open Notifications from your account/menu entry.',
      'Choose a tab to focus on unread or saved messages.',
      'Use row actions for read, save, snooze, or clear.',
      'Set project mutes only when you need a temporary quiet period.',
    ],
    screenshots: [
      {
        fileName: 'notifications-01-inbox-tabs.png',
        capture: 'Notifications page showing tabs and message action buttons.',
      },
      {
        fileName: 'notifications-02-project-mutes.png',
        capture: 'Project Notification Mutes section with date/time fields.',
      },
    ],
  },
  {
    id: 'my-profile',
    title: 'My Profile',
    route: '/profile',
    routeLabel: '/profile',
    audience: 'Everyone',
    purpose: 'Personal account settings for appearance, notifications, name, and password.',
    whatYouCanDo: [
      'Use section navigation to jump to profile areas quickly.',
      'Set your preferred color scheme.',
      'Review and tune notification preferences.',
      'Update your display name and password.',
    ],
    steps: [
      'Open My Profile from your account menu.',
      'Use section list on the left to pick what you want to edit.',
      'Make changes in one section at a time.',
      'Confirm success messages before moving to another section.',
    ],
    screenshots: [
      {
        fileName: 'profile-01-sections-nav.png',
        capture: 'My Profile page showing section navigation and search.',
      },
      {
        fileName: 'profile-02-notification-settings.png',
        capture: 'Notification settings area in profile.',
      },
    ],
  },
  {
    id: 'deliverables-dashboard',
    title: 'Deliverables Dashboard (Display View)',
    route: '/deliverables/dashboard',
    routeLabel: '/deliverables/dashboard',
    audience: 'Everyone',
    purpose: 'Presentation-style deliverables display, useful for review screens and standup displays.',
    whatYouCanDo: [
      'View upcoming deliverables in rotating pages.',
      'Use full-screen mode for wallboard or meeting screen use.',
      'Review project coverage status for upcoming work.',
    ],
    steps: [
      'Open Deliverables Dashboard route directly when needed.',
      'Use full-screen for large-display meetings.',
      'Monitor page rotation and coverage status blocks.',
    ],
    screenshots: [
      {
        fileName: 'deliverables-dashboard-01-main.png',
        capture: 'Deliverables dashboard with rotating item cards.',
      },
      {
        fileName: 'deliverables-dashboard-02-fullscreen.png',
        capture: 'Fullscreen control area and active display mode.',
      },
    ],
  },
  {
    id: 'performance-dashboard',
    title: 'Performance Dashboard',
    route: '/performance',
    routeLabel: '/performance',
    audience: 'Admins',
    purpose: 'System performance view for response and reliability metrics.',
    whatYouCanDo: [
      'Review current performance status and key health metrics.',
      'Track recent metric changes over time.',
      'Use this view during troubleshooting or release validation.',
    ],
    steps: [
      'Open Performance Dashboard when system behavior needs review.',
      'Check top-level health indicators first.',
      'Use recent metrics history to identify trend changes.',
    ],
    screenshots: [
      {
        fileName: 'performance-dashboard-01-overview.png',
        capture: 'Performance Dashboard with Core Web Vitals section visible.',
      },
    ],
  },
];

function audienceClass(audience: HelpSection['audience']): string {
  if (audience === 'Everyone') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  if (audience === 'Managers and Admins') return 'bg-blue-500/20 text-blue-200 border-blue-500/40';
  return 'bg-amber-500/20 text-amber-200 border-amber-500/40';
}

const HelpCenter: React.FC = () => {
  const auth = useAuth();
  const isAdmin = isAdminUser(auth.user);
  const isManagerOrAdmin = isAdminOrManager(auth.user);
  const personalDashboardEnabled = getFlag('PERSONAL_DASHBOARD', true);
  const [search, setSearch] = useState('');
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const visibleSections = useMemo(() => {
    return HELP_SECTIONS.filter((section) => {
      if (section.audience === 'Admins' && !isAdmin) return false;
      if (section.audience === 'Managers and Admins' && !isManagerOrAdmin) return false;
      if (section.id === 'my-work' && !personalDashboardEnabled) return false;
      return true;
    });
  }, [isAdmin, isManagerOrAdmin, personalDashboardEnabled]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(visibleSections.map((section) => section.id)));

  React.useEffect(() => {
    setExpandedIds((prev) => {
      const next = new Set<string>();
      for (const section of visibleSections) {
        if (prev.has(section.id)) next.add(section.id);
      }
      if (!next.size) {
        visibleSections.forEach((section) => next.add(section.id));
      }
      return next;
    });
  }, [visibleSections]);

  const filteredSections = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return visibleSections;

    return visibleSections.filter((section) => {
      const blob = [
        section.title,
        section.audience,
        section.purpose,
        ...section.whatYouCanDo,
        ...section.steps,
        ...(section.notes || []),
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(query);
    });
  }, [search, visibleSections]);

  const screenshotChecklist = useMemo(() => {
    return visibleSections.flatMap((section) =>
      section.screenshots.map((shot) => ({
        sectionId: section.id,
        sectionTitle: section.title,
        fileName: shot.fileName,
        capture: shot.capture,
      })),
    );
  }, [visibleSections]);

  React.useEffect(() => {
    if (!filteredSections.length) {
      setActiveSectionId(null);
      return;
    }
    setActiveSectionId((prev) => {
      if (prev && filteredSections.some((section) => section.id === prev)) return prev;
      return filteredSections[0].id;
    });
  }, [filteredSections]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!filteredSections.length) return;

    const ids = filteredSections.map((section) => section.id);
    const updateActiveFromScroll = () => {
      const offset = 160;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - offset <= 0) current = id;
      }
      setActiveSectionId(current);
    };

    updateActiveFromScroll();
    window.addEventListener('scroll', updateActiveFromScroll, { passive: true });
    window.addEventListener('resize', updateActiveFromScroll);
    return () => {
      window.removeEventListener('scroll', updateActiveFromScroll);
      window.removeEventListener('resize', updateActiveFromScroll);
    };
  }, [filteredSections]);

  const toggleSection = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedIds(new Set(filteredSections.map((section) => section.id)));
  const collapseAll = () => setExpandedIds(new Set());
  const jumpToSection = (id: string) => {
    setExpandedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setActiveSectionId(id);
    if (typeof document === 'undefined') return;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Layout>
      <div className="ux-page-shell space-y-6">
        <div className="ux-page-hero space-y-3">
          <h1 className="text-3xl font-bold text-[var(--text)]">Workload Tracker Help Guide</h1>
          <p className="text-sm text-[var(--muted)] max-w-5xl">
            This guide explains each page in plain language, including what it does, how to use it, and where to place screenshots.
            Use the Help sidebar bookmarks to jump to each section, and use the page links to open app pages directly.
          </p>
        </div>

        <Card className="ux-panel p-4 space-y-4">
          <div className="space-y-3">
            <Input
              label="Find a page in this guide"
              placeholder="Example: projects, goals, notifications"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={expandAll}>Expand all</Button>
              <Button variant="secondary" size="sm" onClick={collapseAll}>Collapse all</Button>
            </div>
          </div>

          {!filteredSections.length ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
              No guide sections match this search.
            </div>
          ) : null}
        </Card>

        <div className="flex flex-col gap-4 xl:flex-row">
          <aside className="xl:w-72 xl:shrink-0">
            <Card className="ux-panel p-3 xl:sticky xl:top-4" variant="surface">
              <h2 className="text-sm font-semibold text-[var(--text)]">Help Bookmarks</h2>
              <p className="text-xs text-[var(--muted)] mt-1">Click a section to jump to that part of this help guide.</p>
              <div className="mt-3 space-y-1 max-h-[68vh] overflow-y-auto pr-1 scrollbar-theme">
                {filteredSections.map((section) => {
                  const isActive = activeSectionId === section.id;
                  return (
                    <button
                      key={`sidebar-${section.id}`}
                      type="button"
                      onClick={() => jumpToSection(section.id)}
                      className={`w-full text-left rounded border px-2 py-1.5 text-xs transition-colors ${
                        isActive
                          ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)]'
                      }`}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      {section.title}
                    </button>
                  );
                })}
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSectionId('screenshot-checklist');
                      const el = document.getElementById('screenshot-checklist');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`w-full text-left rounded border px-2 py-1.5 text-xs transition-colors ${
                      activeSectionId === 'screenshot-checklist'
                        ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                        : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)]'
                    }`}
                  >
                    Master Screenshot Checklist
                  </button>
                ) : null}
              </div>
            </Card>
          </aside>

          <div className="flex-1 space-y-4">
            {filteredSections.map((section) => {
              const isOpen = expandedIds.has(section.id);
              return (
                <Card key={section.id} className="ux-panel p-0" padding="sm" variant="surface">
                  <section id={section.id} className="rounded-[var(--radius-lg)] scroll-mt-24">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    className="w-full px-4 py-4 text-left border-b border-[var(--border)] hover:bg-[var(--surfaceHover)]"
                    aria-expanded={isOpen}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-[var(--text)]">{section.title}</h2>
                        <p className="text-sm text-[var(--muted)] mt-1">{section.purpose}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${audienceClass(section.audience)}`}>
                          {section.audience}
                        </span>
                        <span className="text-xs text-[var(--muted)]">{isOpen ? 'Hide details' : 'Show details'}</span>
                      </div>
                    </div>
                  </button>

                  {isOpen ? (
                    <div className="p-4 space-y-5">
                      <div className="flex flex-wrap items-center gap-2">
                        {section.route ? (
                          <Link
                            to={section.route}
                            className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                          >
                            Open page {section.routeLabel ? `(${section.routeLabel})` : ''}
                          </Link>
                        ) : (
                          <span className="text-sm text-[var(--muted)]">Opened from another page (no fixed menu link).</span>
                        )}
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold text-[var(--text)] mb-2">What You Can Do Here</h3>
                        <ul className="space-y-1.5 text-sm text-[var(--text)] list-disc pl-5">
                          {section.whatYouCanDo.map((item) => (
                            <li key={`${section.id}-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold text-[var(--text)] mb-2">How To Use It</h3>
                        <ol className="space-y-1.5 text-sm text-[var(--text)] list-decimal pl-5">
                          {section.steps.map((step) => (
                            <li key={`${section.id}-${step}`}>{step}</li>
                          ))}
                        </ol>
                      </div>

                      {section.title === 'Settings' ? (
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                          <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Settings Sections Explained</h3>
                          <div className="space-y-2">
                            {SETTINGS_AREAS.map((area) => (
                              <div key={area.name} className="rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                                <div className="text-sm font-medium text-[var(--text)]">{area.name}</div>
                                <div className="text-xs text-[var(--muted)] mt-1">{area.use}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div>
                        <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Screenshot Placeholders</h3>
                        <div className="space-y-2">
                          {section.screenshots.map((shot) => {
                            const localPath = `${SCREENSHOT_FOLDER}/${shot.fileName}`;
                            const publicPath = `${PUBLIC_SCREENSHOT_PREFIX}/${shot.fileName}`;
                            return (
                              <div key={`${section.id}-${shot.fileName}`} className="rounded border border-dashed border-[var(--border)] bg-[var(--surface)] p-3">
                                <div className="text-sm font-medium text-[var(--text)]">{shot.capture}</div>
                                <div className="text-xs text-[var(--muted)] mt-1">
                                  Add file at: <code>{localPath}</code>
                                </div>
                                <div className="text-xs mt-1">
                                  Preview link after adding image:{' '}
                                  <a href={publicPath} target="_blank" rel="noreferrer" className="text-[var(--primary)] hover:underline">
                                    {publicPath}
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {section.notes?.length ? (
                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                          <h3 className="text-sm font-semibold text-amber-200 mb-1">Notes</h3>
                          <ul className="space-y-1 text-sm text-amber-100 list-disc pl-5">
                            {section.notes.map((note) => (
                              <li key={`${section.id}-${note}`}>{note}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  </section>
                </Card>
              );
            })}

            {isAdmin ? (
              <div id="screenshot-checklist" className="scroll-mt-24">
                <Card className="ux-panel p-4">
                  <h2 className="text-lg font-semibold text-[var(--text)]">Master Screenshot Checklist</h2>
                  <p className="text-sm text-[var(--muted)] mt-1">
                    Put screenshots in <code>{SCREENSHOT_FOLDER}</code>. Each file becomes viewable at <code>{PUBLIC_SCREENSHOT_PREFIX}/file-name.png</code>.
                  </p>
                  <div className="mt-3 space-y-2">
                    {screenshotChecklist.map((item) => (
                      <div key={`${item.sectionId}-${item.fileName}`} className="rounded border border-[var(--border)] bg-[var(--surface)] p-3">
                        <div className="text-sm font-semibold text-[var(--text)]">{item.sectionTitle}</div>
                        <div className="text-xs text-[var(--muted)] mt-1">
                          File: <code>{`${SCREENSHOT_FOLDER}/${item.fileName}`}</code>
                        </div>
                        <div className="text-sm text-[var(--text)] mt-1">{item.capture}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default HelpCenter;
