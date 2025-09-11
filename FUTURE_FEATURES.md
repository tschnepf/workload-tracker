# Future Features & Enhancements

This document tracks planned features and improvements for the Workload Tracker application.

## 🚨 High Priority - Performance & Scalability

### 1. Bulk API Pagination Safeguards

**Problem**: Current bulk APIs (`?all=true`) have no size limits, which could cause memory/performance issues as datasets grow.

**Current Status**: 
- Dataset size: ~500 total records across all APIs
- Risk level: Low (safe for current scale)
- No size limits implemented

**Implementation Steps**:

#### Phase 1: Add Size Limits
1. **Backend Changes**:
   ```python
   # Add to each bulk endpoint in views.py
   if request.query_params.get('all') == 'true':
       count = queryset.count()
       if count > BULK_API_LIMIT:  # e.g., 1000
           return Response({
               'error': 'Dataset too large for bulk operation',
               'count': count,
               'max_bulk_size': BULK_API_LIMIT,
               'suggestion': 'Use pagination instead'
           }, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
   ```

2. **Configuration**:
   ```python
   # Add to settings.py
   BULK_API_LIMITS = {
       'people': 1000,
       'projects': 1000, 
       'assignments': 2000,  # Higher limit - grows exponentially
       'deliverables': 1500,
       'departments': 100,
   }
   ```

#### Phase 2: Frontend Fallback Handling
3. **Update Frontend APIs**:
   ```typescript
   // Update each listAll() method in api.ts
   listAll: async (): Promise<Project[]> => {
     try {
       return await fetchApi<Project[]>('/projects/?all=true');
     } catch (error) {
       if (error.status === 413) {
         // Fallback to pagination
         console.warn('Dataset too large, falling back to pagination');
         return await this.loadAllWithPagination();
       }
       throw error;
     }
   }
   ```

4. **Add Pagination Fallback**:
   ```typescript
   private async loadAllWithPagination(): Promise<Project[]> {
     const allItems: Project[] = [];
     let page = 1;
     let hasMore = true;

     while (hasMore) {
       const response = await this.list({ page, page_size: 500 });
       allItems.push(...(response.results || []));
       hasMore = !!response.next;
       page++;
     }
     return allItems;
   }
   ```

#### Phase 3: Performance Monitoring
5. **Add Monitoring**:
   - Response time tracking for bulk endpoints
   - Memory usage alerts
   - Dataset growth monitoring
   - Automated alerts when approaching limits

6. **Database Optimization**:
   - Add database indexes for frequently queried fields
   - Implement query optimization for large datasets
   - Consider database-level pagination improvements

**Estimated Timeline**: 1-2 days
**Trigger Point**: When any API dataset exceeds 1,000 records

---

## 📋 Medium Priority - User Experience

### 2. Advanced Filtering & Search
- **Description**: Add advanced filtering options to all list views (date ranges, multiple selections, saved filters)
- **Components**: People, Projects, Assignments, Deliverables lists
- **Estimated Timeline**: 3-5 days

### 3. Bulk Operations
- **Description**: Add bulk edit, delete, and status update capabilities
- **Features**: Select multiple items, batch operations, progress indicators
- **Estimated Timeline**: 2-3 days

### 4. Data Export/Import Enhancements
- **Description**: Expand current Excel import/export with more formats and options
- **Features**: CSV, PDF reports, scheduled exports, import validation
- **Estimated Timeline**: 2-4 days

### 5. Virtualized Lists Across App (People/Projects)
- **Description**: Use lightweight list virtualization (render only visible rows + small buffer) for large lists while keeping paginated fetching for network efficiency.
- **Current**: PeopleList now has a clean, isolated virtualized table component; Projects uses infinite pagination with “Load more”.
- **Plan**:
  - Extract Projects left-panel rows into a `ProjectsListTable` component.
  - Enable virtualization when `items.length > 200`; otherwise map normally.
  - Keep existing infinite query and “Load more” for network payload control.
- **Benefits**:
  - Smooth scrolling and lower memory/DOM size even after many pages are loaded.
  - Clear separation of concerns: page orchestration vs. table rendering.
  - Easier maintenance and reuse of row markup.
- **Trade‑offs**:
  - Virtualization complements but does not replace pagination.
  - Requires a reasonable row height estimate (tuneable; use 44px baseline).
- **Acceptance**:
  - Scrolling remains smooth with 1,000+ items loaded.
  - No visual/interaction regressions vs. current rows.
  - TS build passes; container build green.
- **Estimated Timeline**: 0.5–1 day (Projects parity)

### 5. Real-time Notifications
- **Description**: Add real-time notifications for assignment changes, conflicts, deadlines
- **Technology**: WebSockets or Server-Sent Events
- **Estimated Timeline**: 3-4 days

### Help & Documentation Hub (/help)
- **Scope**: Provide an in-app documentation hub at `/help` with accessible structure, quick navigation, and contextual entry points from across the app.
- **Intended Content**:
  - Quick Start: signing in, linking a person, basic navigation
  - Keyboard Shortcuts: list and how to enable reduced motion
  - People & Departments: filters, include-children hierarchy, autocomplete
  - Projects: status, client, deliverables overview, filter metadata
  - Assignments: grid vs list, conflict checks, weekly hours semantics
  - Reports & Forecasts: capacity heatmap, team forecast
  - Settings & Roles: admin vs manager vs user capabilities
  - Exports/Imports: formats, limits, troubleshooting
  - FAQ & Troubleshooting: common errors and friendly resolutions
- **Related Future UX**:
  - Searchable docs with typeahead (client-side index; highlight matches)
  - Contextual help: deep-link anchors from UI “?” icons to relevant sections
  - Copy-to-clipboard for example queries and shortcuts cheat-sheet
  - Link to API schema once available (Phase 10 OpenAPI)
- **Dependencies**:
  - Router route exists; Coming Soon page implemented (Phase 1.1)
  - Choose content delivery: MDX static pages in frontend or curated markdown compiled at build
  - Optional: surface API schema links after Phase 10.1 (`/schema/`, Swagger UI)
- **Milestones**:
  - M0 (done): `/help` route renders Coming Soon
  - M1: Static Help landing page with sections + anchor links
  - M2: Client-side search + table of contents
  - M3: Contextual links from major screens (e.g., People filters → /help#filters)
  - M4: Tips/Shortcuts overlay and accessibility notes
  - M5: Feedback link (mailto or form) and basic analytics on help usage
 - **Estimated Timeline**: 2–4 days for M1–M2; additional 2–3 days for M3–M5

---

## 📊 Medium Priority - Analytics & Reporting

### 6. Advanced Dashboard Analytics
- **Description**: Expand dashboard with more detailed analytics and visualizations
- **Features**: Trend charts, utilization heatmaps, project timeline views
- **Estimated Timeline**: 4-6 days

### 7. Custom Reporting System
- **Description**: Allow users to create custom reports with flexible parameters
- **Features**: Report builder, scheduled reports, export options
- **Estimated Timeline**: 5-7 days

### 8. Capacity Planning Tools
- **Description**: Add tools for future capacity planning and resource forecasting
- **Features**: Demand forecasting, scenario planning, resource recommendations
- **Estimated Timeline**: 6-8 days

---

## 🔧 Low Priority - Technical Improvements

### 9. API Rate Limiting Enhancements
- **Description**: Implement more sophisticated rate limiting based on user roles and endpoint types
- **Current**: Basic throttling on hot endpoints only
- **Estimated Timeline**: 1-2 days

### 10. Caching Layer Improvements
- **Description**: Add Redis caching for frequently accessed data
- **Benefits**: Improved response times, reduced database load
- **Estimated Timeline**: 2-3 days

#### 10.1 Dockerized Redis Container (Staging/Prod Simulation)
- Intent: simulate deployment with a standalone Redis service while keeping dev on LocMem by default.
- Compose changes (docker-compose.yml):
  - Add `redis` service (image `redis:7-alpine`), `ports: ["6379:6379"]`, healthcheck (`redis-cli ping`).
  - Optional auth: `command: ["redis-server","--requirepass","${REDIS_PASSWORD}"]` and add `REDIS_PASSWORD` to `.env`.
  - Backend: add `depends_on: redis` and set `REDIS_URL` to `redis://${HOST_IP}:6379/1` (or in-network `redis://redis:6379/1`).
- Backend dependency: add `redis>=4.5` to `backend/requirements.txt` and rebuild backend.
- Settings: already support `REDIS_URL` env; LocMem fallback remains.
- Validation:
  - Bring up: `docker-compose up -d --build redis backend` and verify redis healthy.
  - Shell check: `from django.core.cache import cache; cache.set('k','v',60); cache.get('k')` via `manage.py shell`.
  - Endpoint timing: call `/api/people/capacity_heatmap/` and `/api/people/workload_forecast/` twice; expect HIT on second call.
- Security/ops: restrict Redis exposure (bridge network), set memory limits, optional eviction policy (`allkeys-lru`).

### 11. Automated Testing Suite
- **Description**: Expand test coverage with integration and end-to-end tests
- **Tools**: Playwright for E2E, expanded Django test suite
- **Estimated Timeline**: 4-5 days

### 12. Mobile Responsiveness Enhancements
- **Description**: Improve mobile experience, especially for assignment grid
- **Features**: Touch-friendly interactions, mobile-optimized layouts
- **Estimated Timeline**: 3-4 days

---

## 🚀 Future Vision - Major Features

### 13. Multi-tenant Support
- **Description**: Support multiple organizations/clients in single deployment
- **Complexity**: High - requires significant architecture changes
- **Estimated Timeline**: 3-4 weeks

### 14. Integration APIs
- **Description**: Connect with external project management tools (Jira, Asana, etc.)
- **Features**: Two-way sync, webhook support, data mapping
- **Estimated Timeline**: 4-6 weeks

### 15. Machine Learning Insights
- **Description**: AI-powered insights for resource allocation and project success prediction
- **Features**: Predictive analytics, anomaly detection, optimization suggestions
- **Estimated Timeline**: 6-8 weeks

---

## 📝 Implementation Notes

### Priority Guidelines
- **High Priority**: Critical for stability/performance as app scales
- **Medium Priority**: Significant user experience improvements
- **Low Priority**: Nice-to-have improvements, technical debt
- **Future Vision**: Major features requiring significant development time

### Development Approach
1. Always implement with backward compatibility
2. Add feature flags for gradual rollouts
3. Include comprehensive testing
4. Document breaking changes in CHANGELOG.md
5. Update CLAUDE.md with implementation status

### Monitoring & Success Metrics
- Track implementation against estimated timelines
- Monitor performance impact of new features
- Gather user feedback for priority adjustments
- Regular review and reprioritization (monthly)

---

*Last Updated: August 30, 2025*  
*Next Review: September 30, 2025*

---

## 🎯 Backlog Additions (from R2-REBUILD request)

These are intentionally deferred and tracked here for future implementation.

### Advanced Skills/Departments
- Skill gap analysis across teams and projects
- Department hierarchy visualization and roll-up metrics
- Bulk operations for departments and skills maintenance

Sources: `prompts/R2-REBUILD-DEPARTMENTS.md`, `prompts/R2-REBUILD-MASTER-GUIDE.md` (Chunk 6)

### Contracts/Compliance
- Contract tracking with key dates and budget checks
- Compliance checks aligned to client requirements

Source: `prompts/R2-REBUILD-CONTRACTS.md`

### Automation/Notifications
- Email notifications for assignment additions/changes and upcoming deadlines
- Automated suggestions for workload balancing and risk alerts

Sources: `prompts/R2-REBUILD-004-MANAGER-FEATURES.md`, `prompts/R2-REBUILD-002-BUSINESS-LOGIC.md`
### Infinite Scrolling for Lists
- Description: Replace explicit �Load more� buttons with automatic fetching when users near the bottom of the list.
- Scope: People and Projects left-panel lists (and similar long lists).
- Approach: Use IntersectionObserver/scroll threshold with React Query `fetchNextPage()`; preserve keyboard accessibility and announce loading status.
- Benefits: Fewer clicks; smoother, continuous browsing.
- Trade-offs: Must guard against over-fetching; keep clear end-of-list indicators; still combine with virtualization for render performance.
- Acceptance: Smooth auto-append, no duplicate loads, accessible focus management, works with filtered views.
- Estimated Timeline: 0.5�1 day
