# Workload Tracker - User Guide

**Professional resource management and workload allocation system**

## 📋 Overview

Workload Tracker is a comprehensive team management application designed to help managers efficiently allocate resources, track utilization, and optimize team performance. Built with a dark, professional interface optimized for productivity.

## 🚀 Key Features

### 👥 **People Management**
Comprehensive team member management with capacity tracking.

**What you can do:**
- **Add Team Members**: Create profiles with name, weekly capacity (hours), role, and department assignment
- **Edit Team Information**: Update capacity, roles, department assignments, and contact details
- **Track Skills & Expertise**: Tag team members with their strengths, areas for improvement, and current learning goals
- **View Team Directory**: Search and filter team members by name, department, or role
- **Capacity Planning**: Set individual weekly hour capacities (default 36h, customizable 1-80h)

**How to use:**
1. Navigate to **People** in the sidebar
2. Click **"+ New"** to add team members
3. Fill in basic information (name and capacity are required)
4. Assign to departments and add skill tags as needed
5. Use the search bar to quickly find team members


## My Work (Personal Dashboard)

A focused, personal view showing your assignments, upcoming pre-deliverables, near-term schedule, and alerts.

- Where: Sidebar ? "My Work" (`/my-work`) � visible when enabled by administrators
- What you'll see:
  - Summary: your utilization %, allocated vs available hours for the current week
  - Pre-deliverables: your due/overdue pre-items (e.g., Specs, TOC) with quick complete actions
  - Deliverables: next milestones across your active projects
  - Projects: your projects with next milestone dates
  - Schedule: compact week-by-week capacity strip
- Performance: page prefetches when you hover; second visits are faster due to caching and ETags
- Tips:
  - Link your account to a Person profile (admin can assist) to enable this view
  - Use quick actions to open Assignments and Calendar scoped to you

Administrators
- Toggle availability via `PERSONAL_DASHBOARD` flag (frontend) and feature flags in backend settings
- Capabilities endpoint (`/api/capabilities/`) advertises `personalDashboard: true` for client gating
- Aggregated endpoint: `GET /api/personal/work/` (ETag + short-TTL cache)

------

## Serializer & Naming Discipline

Centralize snake_case → camelCase mapping in DRF serializers; avoid hand‑mapping in views.

- Backend: Use serializers for both model and aggregate responses (see `docs/NAMING-DISCIPLINE.md`).
- Frontend: Use typed models in `frontend/src/types/models.ts`; do not manually rename fields in components.

---

## Structured JSON Logs

The backend emits JSON logs for each HTTP request (includes `request_id`, `user_id`, `path`, `status`, and `duration_ms`). Each response also includes an `X-Request-ID` header to correlate with logs and Sentry.

Quick examples:

- Docker (dev):
  - Tail backend logs: `docker compose logs -f backend`
  - Filter request lines only: `docker compose logs -f backend | rg '"logger":"request"'`
  - Pretty-print with `jq` (optional): `docker compose logs -f backend | rg '"logger":"request"' | jq .`

- Kubernetes (example):
  - `kubectl logs -f deploy/workload-tracker-backend | jq .`

Tip: Include `X-Request-ID` on client requests to propagate an external trace ID; otherwise the server generates one.

---

### 📊 **Assignment Management**
Smart workload allocation with visual planning tools.

**What you can do:**
- **Create Assignments**: Allocate people to projects with detailed hour planning
- **12-Week Planning**: Set specific hours per week for flexible scheduling
- **Visual Grid View**: See all assignments in an interactive calendar-style grid
- **Smart Suggestions**: Get department-based recommendations for team assignments
- **Bulk Operations**: Quickly set hours across multiple weeks
- **Overallocation Alerts**: Visual warnings when someone exceeds their capacity

**How to use:**
1. Go to **Assignments** to see the visual grid
2. Click **"New Assignment"** to create allocations
3. Select person and project from department-aware dropdowns
4. Use the 12-week planner to set hours per week
5. Use **"Quick Set All Weeks"** for consistent allocations
6. Monitor utilization badges to avoid overallocation

---

### 🏢 **Department Management**
Complete organizational structure and hierarchy management.

#### **Core Department Features:**
**What you can do:**
- **Create Departments**: Set up organizational units with descriptions
- **Hierarchy Management**: Build parent-child department relationships
- **Manager Assignment**: Assign department managers from your team
- **Team Organization**: Move people between departments
- **Bulk Operations**: Assign multiple people to departments at once

**How to use:**
1. Navigate to **Departments** in the sidebar
2. Click **"Add Department"** to create new departments
3. Set parent departments to build hierarchy
4. Assign managers and move team members as needed
5. Use bulk actions in **People** section to reassign multiple team members

#### **Manager Dashboard** (`/departments/manager`)
**What you can do:**
- **Department-Specific Metrics**: View utilization and assignments for your department only
- **Team Oversight**: Monitor each team member's workload and availability
- **Multi-Week Analysis**: Track performance over 1-8 week periods
- **Quick Actions**: Access team management, reports, and workload balancing tools

**How to use:**
1. Click **"Manager View"** in the advanced department section
2. Select your department from the dropdown
3. Choose time period (1w, 2w, 4w, or 8w)
4. Review team utilization and take action on overallocated members

#### **Organizational Chart** (`/departments/hierarchy`)
**What you can do:**
- **Visual Hierarchy**: See complete organizational structure
- **Interactive Exploration**: Click departments to view details
- **Team Composition**: See team members and sub-departments at a glance
- **Department Statistics**: View team sizes, reporting relationships

**How to use:**
1. Click **"Org Chart"** in the advanced department section
2. Navigate the visual hierarchy by scrolling horizontally
3. Click any department card to see detailed information in the side panel
4. Use the legend to understand the visual indicators

---

## Project Assignments Grid (Project‑Centric)

- Route: `/project-assignments`
- Server‑authoritative: week headers, per‑project totals, deliverables shading, and quick metrics are returned from the backend snapshot.
- Editing: double‑click a week cell on an assignment row to edit; press Enter to commit. Select a range within the same row to apply to multiple weeks. On success, totals refresh from the server.
- Status: update project status inline via the status badge. Capability checks apply.
- Filters: department scope and project status filters (including “Active – No Deliverables”) are pushed to the server. Week horizon control (8/12/16/20).
- URL state: weeks and status filters sync to the URL for easy sharing; a “People View” link switches to `/assignments`.

#### **Department Reports** (`/departments/reports`)
**What you can do:**
- **Performance Analytics**: Compare all departments side-by-side
- **Health Scoring**: Automated 0-100 health assessment for each department
- **Resource Analysis**: See available capacity across departments
- **Utilization Tracking**: Visual distribution charts and trends
- **Multi-Timeframe Analysis**: 1-12 week performance comparison

**How to use:**
1. Click **"Reports"** in the advanced department section
2. Select timeframe (1w to 12w) for analysis
3. Review the performance table for all departments
4. Check utilization distribution and available resources
5. Focus on departments with low health scores

---

### 📈 **Dashboard & Analytics**
Real-time insights and team performance metrics.

**What you can do:**
- **Team Overview**: See utilization status for all team members
- **Department Filtering**: Focus on specific departments or view company-wide
- **Multi-Week Analysis**: Track utilization over 1-12 week periods
- **Peak Utilization Tracking**: Identify highest workload weeks
- **Available Resources**: Find team members with spare capacity
- **Recent Activity**: Monitor new assignments and changes

**How to use:**
1. **Dashboard** is your starting point (opens by default)
2. Use the **Department** dropdown to filter by specific departments
3. Adjust the **Time Period** to see trends over multiple weeks
4. Look for red badges indicating overallocated team members
5. Check "Available People" section for resource planning

---

### 🎯 **Project Management**
Organize work into structured projects for better tracking.

**What you can do:**
- **Project Creation**: Set up projects with clients, status, and descriptions
- **Status Tracking**: Monitor projects through planning, active, completed phases
- **Client Management**: Track internal and external client projects
- **Assignment Integration**: Link assignments to structured projects
- **Project Deliverables**: Plan and track project milestones and deliverables

**How to use:**
1. Navigate to **Projects** in the sidebar
2. Create projects with meaningful names and client information
3. Set appropriate status (Planning, Active, On Hold, Completed, Cancelled)
4. Add descriptions to provide context for team members
5. Use projects when creating assignments for better organization

---

## 🎨 **Smart Features**

### **Department-Aware Assignment Creation**
When creating assignments, the system provides intelligent suggestions:
- **Same-Department Priority**: Team members from the same department are highlighted with ⭐
- **Collaboration Insights**: Get suggestions for involving other department members
- **Department Context**: See department information for every team member
- **Resource Recommendations**: View available capacity within departments

### **Advanced Search & Filtering**
Throughout the application:
- **Smart Search**: Find people by name, role, department, or notes
- **Multi-Field Filtering**: Combine department and search filters
- **Auto-Selection**: First items are automatically selected for faster workflow
- **Progressive Discovery**: Features become available as you add data

### **Utilization Intelligence**
Sophisticated capacity management:
- **Color-Coded Status**: Green (available), Blue (optimal), Amber (high), Red (overallocated)
- **Peak Tracking**: Identify highest utilization weeks in multi-week analysis
- **Capacity Alerts**: Visual warnings prevent overallocation
- **Availability Insights**: Quickly find team members with spare capacity

---

## 🗺️ **Navigation Guide**

### **Sidebar Structure:**
- **Dashboard** - Team overview and metrics
- **People** - Team member management
- **Departments** - Basic department CRUD
- **Assignments** - Workload allocation grid
- **Projects** - Project organization

### **Advanced Department Tools:**
- **Manager View** - Department-specific management dashboard
- **Org Chart** - Hierarchical visualization  
- **Reports** - Performance analytics and insights

### **System Tools:**
- **Settings** - System configuration (planned)

---

## 📱 **Using the Interface**

### **Dark Mode Design**
The application uses a professional dark theme optimized for long work sessions:
- **High Contrast**: Clear text and visual hierarchy
- **Color Coding**: Consistent use of colors for status indication
- **Comfortable Navigation**: Hover tooltips and visual feedback

### **Responsive Layout**
- **Split-Panel Views**: List on left, details on right (People, Departments)
- **Grid Views**: Visual planning interface (Assignments)
- **Modal Forms**: Focused data entry without losing context
- **Sidebar Navigation**: Persistent access to all features

### **Interactive Elements**
- **Click to Select**: Single-click selection throughout
- **Hover for Details**: Tooltips provide additional information
- **Visual Feedback**: Buttons and links respond to interaction
- **Progress Indicators**: Loading states and progress feedback

---

## 🎯 **Best Practices**

### **Getting Started:**
1. **Add Team Members** first with realistic weekly capacities
2. **Create Departments** and assign people to them
3. **Set up Projects** for better assignment organization  
4. **Start with Simple Assignments** using the 12-week planner
5. **Use Dashboard** regularly to monitor team utilization

### **For Managers:**
1. **Use Department Filtering** to focus on your team
2. **Monitor Health Scores** in Department Reports
3. **Check Peak Utilization** during busy periods
4. **Use Manager Dashboard** for team-specific insights
5. **Review Org Chart** for understanding reporting relationships

### **For Resource Planning:**
1. **Check Available People** section for spare capacity
2. **Use Multi-Week Analysis** for trend identification
3. **Monitor Overallocation Alerts** proactively
4. **Leverage Department-Based Suggestions** for team formation
5. **Use Bulk Actions** for efficient team reorganization

---

## 💡 **Tips for Maximum Effectiveness**

### **Utilization Management:**
- **Optimal Range**: Target 70-85% utilization for sustainable performance
- **Buffer Capacity**: Keep 15-30% available for urgent work and professional development
- **Peak Awareness**: Use multi-week analysis to identify and smooth out utilization spikes

### **Department Organization:**
- **Clear Hierarchy**: Set up logical parent-child relationships
- **Manager Assignment**: Assign department managers for accountability
- **Cross-Department Visibility**: Use company-wide dashboard view for resource sharing

### **Assignment Planning:**
- **12-Week Planning**: Use the weekly hour allocation for flexible scheduling
- **Smart Suggestions**: Pay attention to department-based recommendations
- **Regular Review**: Check assignments weekly and adjust as needed

### **Data Quality:**
- **Accurate Capacities**: Set realistic weekly hour capacities for each person
- **Complete Profiles**: Fill in roles, departments, and skills for better insights
- **Regular Updates**: Keep project status and team assignments current

---

## 🚀 **Advanced Workflows**

### **Team Formation:**
1. Use **Assignment Creation** to see department-based suggestions
2. Check **Available People** for capacity
3. Review **Department Reports** for workload balance
4. Use **Org Chart** to understand reporting relationships

### **Capacity Planning:**
1. Start with **Dashboard** filtered by timeframe
2. Use **Department Reports** for cross-department comparison
3. Check **Manager Dashboard** for department-specific details
4. Plan assignments based on available capacity insights

### **Performance Monitoring:**
1. Use **Multi-Week Analysis** to identify trends
2. Monitor **Health Scores** in Department Reports
3. Track **Peak Utilization** across departments
4. Review **Recent Assignments** for activity patterns

---

The Workload Tracker provides a comprehensive solution for modern team management, from individual assignment tracking to organizational analytics. Start with the basics and gradually leverage advanced features as your team grows and your processes mature.

---

## 🌐 Global Department Filter

Apply a department scope across the entire app and share deep links.

- Persistent filter visible in the header. Toggle “Include sub-departments.”
- Deep link parameters: `?dept=<id>&deptChildren=0|1` (when unset, params are removed)
- URL precedence on first load; thereafter changes update the URL without adding history entries.
- Keyboard shortcut: Alt+Shift+D to focus the filter from anywhere.
- Pages and APIs automatically respect this filter (People, Assignments, Capacity Heatmap, Workload Forecast).

Tip: Use the “Copy link” action in the header to share a filtered view.

---

## Administration & Auth

### Authentication Enforcement Toggle (AUTH_ENFORCED)
- Purpose: stage the switch to authenticated APIs during rollout.
- Behavior:
  - When AUTH_ENFORCED=true (default), the backend enforces IsAuthenticated globally.
  - When AUTH_ENFORCED=false, the backend relaxes to AllowAny to support staggered frontend/backend deploys.
- Configure via env (e.g., .env):
  - AUTH_ENFORCED=true for staging/production

### Create a Dev User (local)
Quickly create or update a local account:

`ash
docker compose exec backend python manage.py create_dev_user \
  --username admin --password admin123 --email admin@example.com --staff --superuser
` 

This also ensures a corresponding UserProfile exists via signals.

### Production Safety (Highlights)
- DEBUG=false in production (enforced in docker-compose.prod.yml).
- Set SECRET_KEY, ALLOWED_HOSTS, and CORS_ALLOWED_ORIGINS via env.
- If behind a proxy/ingress, Django honors X-Forwarded-* headers (SECURE_PROXY_SSL_HEADER, USE_X_FORWARDED_HOST).


