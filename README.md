Workload Tracker — User Guide

Getting Started
- Sign in at the login screen with your account.
- If you forget your password, use “Forgot password?” to receive a reset link.
- After signing in, you will land on “My Work” or the Team Dashboard depending on your settings.


Navigation Overview
- My Work: Your personal overview — assignments, milestones, and schedule.
- Dashboard: Organization‑wide snapshot of workload and upcoming items.
- Assignments: Spreadsheet‑style planning by person. Add and adjust weekly hours.
- Project Assignments: Planning by project. See who is assigned and when.
- Projects: Create, edit, and manage projects and their milestones.
- People: Browse the team, filter by department/location, and make updates.
- Departments: Manage departments, view manager tools, and see the org chart.
- Deliverables Calendar: Week‑by‑week timeline of upcoming milestones.
- Reports: Role capacity, team forecast, and personal experience insights.
- Settings: System and admin tools such as roles, backups, and calendar feeds.
- Profile: Update your name, password, and color theme.


Page‑by‑Page Guide

**My Work**
- Purpose: Shows your projects, milestones, and schedule.
- What you’ll see:
  - Summary of items that need attention (for example, overdue milestones).
  - Your projects list and upcoming milestones.
  - A compact calendar with your upcoming work.
  - A weekly schedule strip showing capacity versus planned hours.
- Tips:
  - If your account isn’t linked to your person profile yet, you’ll see a note to contact an administrator.

**Dashboard**
- Purpose: A team‑level overview for quick health checks and planning.
- What you’ll see:
  - Headline metrics: assignments, project mix, and utilization summaries.
  - Visual cards for hours by client, weekly trends, and role capacity.
  - A heatmap to spot busy and quiet weeks across the team.
- Tips:
  - Use the department selector to focus on a specific group.
  - Adjust the weeks shown to widen or narrow the planning window.

**Assignments (Grid)**
- Purpose: Plan weekly hours in a familiar, spreadsheet‑like view per person.
- What you’ll see:
  - Left column: people grouped by department.
  - Columns by week with each person’s planned hours per project.
  - A floating legend that explains milestone markers and colors.
- Common actions:
  - Add assignment: Use the “Add project” row under a person to attach a project.
  - Edit hours: Click a week cell and type the hours for that week.
  - Change role: Open the role menu on a row to assign a role for that project.
  - Filter: Use the top‑bar department and status filters to narrow the view.
- Tips:
  - The header “Weeks” selector adjusts how far ahead you plan.
  - Markers show upcoming project milestones to help you place hours.

**Project Assignments (Grid)**
- Purpose: See planning by project rather than by person.
- What you’ll see:
  - Projects in rows, weeks in columns, similar to the people‑oriented grid.
  - A quick view on project names to peek at details without leaving the page.
- Common actions:
  - Sort by client, project, or milestones to focus your work.
  - Edit weekly hours in the grid where appropriate.
- Tips:
  - Use the status chips to hide projects you don’t need to see.

**Projects (List)**
- Purpose: Manage the list of projects.
- What you’ll see:
  - Search, sort, and quick filters (including upcoming/previous milestones).
  - A details panel for the selected project (assignments and notes).
- Common actions:
  - Create: “New Project” opens the form to add a project.
  - Update status: Use the status badge dropdown (for example, Active, On Hold).
  - Inline staffing: From the project details, add people to the project.

**Project Form (Create/Edit)**
- Purpose: Add a new project or update an existing one.
- What to fill in:
  - Project name and client (required), project number (optional), description, and start date.
  - Pre‑deliverable rules for the project (for example, when to create design reviews ahead of the main milestone) if your organization uses them.
- Tips:
  - You can return later to refine details such as hours and pre‑deliverable rules.

**People**
- Purpose: Browse and manage the team.
- What you’ll see:
  - Left panel: a searchable list with department/location filters.
  - Right panel: details for the selected person — including skills.
- Common actions:
  - Edit basic details and role for a person.
  - Use bulk actions to assign people to a department in one step.
  - Load more results as you scroll when the list is long.

**Departments (List)**
- Purpose: Create and maintain departments.
- What you’ll see:
  - A searchable list of departments.
  - A details panel with manager, description, and team statistics.
- Common actions:
  - Add, rename, or remove departments.
  - Pick a department to see its people and related information.

**Manager Dashboard (Departments)**
- Purpose: A focused view for department leaders.
- What you’ll see:
  - Team size, average utilization, and items that need attention.
  - Quick period buttons (1, 2, 4, 8 weeks) to change the summary window.
- Tips:
  - Choose a department at the top‑right to switch context.

**Hierarchy (Departments)**
- Purpose: An organizational chart of all departments and teams.
- What you’ll see:
  - A visual tree of the department structure and a side panel with details.
- Tips:
  - Click a department in the chart to view its manager, team members, and stats.

**Deliverables Calendar**
- Purpose: A weekly calendar showing upcoming milestones.
- What you’ll see:
  - A timeline of milestones by week, with color‑coding by type.
  - Optional pre‑deliverables (pre‑work items) you can show or hide.
- Common actions:
  - Change the week range using the controls at the top.
  - Search and filter by person to see milestones relevant to them.

**Reports — Role Capacity**
- Purpose: See how staffing compares to capacity for each role.
- What you’ll see:
  - A card summarizing where you are under‑ or over‑staffed by role.
- Tips:
  - Use this to guide hiring or reassignments.

**Reports — Team Forecast**
- Purpose: Look ahead at team workload and a project’s weekly timeline.
- What you’ll see:
  - A capacity timeline across weeks.
  - A project chooser that shows weekly hours and milestone markers for that project.
- Tips:
  - Adjust the weeks shown and the department to focus your view.

**Reports — Person Experience**
- Purpose: Summarize project experience for a person over a time window.
- What you’ll see:
  - Search for a person and select a time frame (months or years).
  - A breakdown of projects, hours, common roles, and phases worked.

**Settings**
- Purpose: Administrative tools and system options.
- Sections include:
  - Roles: Add, remove, reorder, and rename job roles used across the system.
  - Utilization scheme: Adjust color ranges and thresholds for workload badges.
  - Backups and restore: Create or restore database backups.
  - Department‑scoped roles (if enabled): Configure allowed roles by department.
  - Calendar Feeds: Generate a private link you can paste into calendar tools.
- Calendar feeds (Subscriptions):
  - The “Calendar Feeds” card shows a private address ending with “deliverables.ics”.
  - Copy the link and add it to your calendar:
    - Outlook: Add calendar → Subscribe from web → paste the link.
    - Google Calendar: Other calendars → From URL → paste the link.
  - Anyone with the link can view milestones. Regenerate the token to revoke old links.

**Profile**
- Purpose: Update your personal information and preferences.
- What you can do:
  - Change your display name and password.
  - Choose a color theme.
  - See your username, email, and account role.

## Integrations Prerequisites

The upcoming Integrations Hub relies on `cryptography` (for secure token storage) and `jsonschema` (provider metadata validation). Both packages are tracked in `backend/requirements.txt`. Run `pip install -r backend/requirements.txt` after pulling the latest code so these dependencies are available before working on the Integrations app.

When running the backend container locally, set `INTEGRATIONS_ENABLED=true`. OAuth client metadata (`client_id`, `client_secret`, redirect URI) is now stored via the Integrations UI instead of `.env`, so you can rotate it without redeploying. (Environment variables are still supported for advanced overrides.)

Register an app in the BQE developer portal and set the redirect URI to your instance’s callback path (`https://<host>/api/integrations/providers/bqe/connect/callback`). Keep the client ID/secret handy—they are entered inside Settings → Integrations rather than `.env`, but you can still rotate them without downtime. The Integrations Hub currently understands the BQE **Projects** and **Clients** objects; use the mapping UI to decide which fields flow into local storage.

See `docs/integrations/key-rotation.md` for the MultiFernet rotation runbook and `prompts/INTEGRATIONS-HUB-E2E-CHECKLIST.md` for the manual test plan.

## Using the Integrations Hub (BQE)

1. **Unlock the hub** – Navigate to Settings → Integrations. If this is the first run, paste or generate a Fernet key in the unlock form and click **Save Key**. The key is stored encrypted and can be rotated any time via the same UI.
2. **Enter provider credentials** – In the “Provider Credentials” card, paste the BQE `client_id`, `client_secret`, and redirect URI from the BQE developer portal. BQE CORE now requires OAuth 2.0 Authorization Code + PKCE against `https://api-identity.bqecore.com/idp/connect/authorize` and `https://api-identity.bqecore.com/idp/connect/token` with the scopes `readwrite:core offline_access openid email profile`. The redirect URI must match exactly, and the secret is encrypted via MultiFernet.
3. **Connect to BQE** – Click the “Connect Provider” button on the BQE card, choose Sandbox or Production, and walk through the OAuth consent screen. Each environment supports one connection per provider; use “Force reconnect” (or “Reconnect OAuth”) to re-authorize the existing Sandbox/Production record instead of creating duplicates. Successful connections appear as selectable pills with environment badges.
3. **Configure field mapping** – Within the provider’s detail card, open the “Field Mapping” section to review the defaults (e.g., BQE `clientName` → local `project.client` and `project.bqe_client_name`). Adjust or add rows, then click **Save Mapping**. The same flow is available for the new **Clients** object (`integration_client.*` fields).
4. **Create/enable rules** – Use the Rules panel to define sync interval, fields, client sync policy, and deletion behavior per object. Saving a rule schedules the Celery planner to run it automatically; you can also trigger a Post-restore resync from the Sync Controls modal.
5. **Run the matching wizard (Projects)** – Before enabling automatic project sync, click “Load Initial Matching” to pair BQE parent projects with local records. Review suggestions, override as needed, and Save Matches. Enabling “turn on the rule after saving” will immediately allow deltas.
6. **Monitor jobs & health** – The Sync Controls card lists recent jobs, metrics (running count, 24h success rate, items processed), and job history filters. Failed jobs expose a **Retry job** action that queues a new run and logs an audit entry. If Celery or Redis are unavailable, a banner will warn that sync controls are temporarily paused.
7. **Sync additional objects** – The catalog now includes the BQE **Clients** object. Create a Clients rule to keep the `IntegrationClient` table up to date and use that data elsewhere in the platform (e.g., to drive mapping suggestions or future client matching flows).

**Authentication Pages**
- Login: Enter your username (or email) and password.
- Reset Password: Request a reset link if you forget your password.
- Set Password: Complete a reset by choosing a new password from the link.

**Coming Soon**
- Placeholder page used for features that are being prepared and will appear in future updates.


Helpful Concepts
- Assignment: A person planned to work on a project, with weekly hours.
- Deliverable: A project milestone or due date.
- Pre‑deliverable: A preparatory step created automatically before a milestone.
- Capacity: The hours a person can work in a week.
- Utilization: How much of someone’s capacity is planned (for example, 30 of 36 hours).
- Department: A group such as “Design” or “Engineering”.
- Role: A job type such as “Project Manager” or “Designer”.


Where to Get Help
- If something looks wrong on a page, try refreshing the browser.
- If you cannot sign in, use “Forgot password?” on the login page.
- For account or data issues, contact your administrator.
