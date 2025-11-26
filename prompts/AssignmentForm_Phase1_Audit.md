# Assignment Form – Phase 1 Audit

**Route / Component:** `frontend/src/pages/Assignments/AssignmentForm.tsx` (used by `/assignments/new` and `/assignments/:id/edit`)

The form currently displays every field on a single desktop-style page. Before restructuring it for mobile, we catalogued each functional block and its backend touch points so we can split steps without breaking validation or API payloads.

---

## 1. Person Search & Selection
- **UI elements:** search input, filtered list of people, “show all departments” toggle, skill-match badges/tooltips.
- **Backend calls**
  - `peopleApi.list({ page, page_size, department, include_children })` — initial people list scoped by the global department filter.
  - `peopleApi.skillMatch(projectSkills, { department, include_children, limit })` — server-side skill rankings whenever required skills change.
  - `personSkillsApi.list()` — batched load of each person’s strengths/development tags used for warnings.
  - `departmentsApi.list()` — resolves department names & descendants for filtering.
- **Why it matters:** Any mobile step or drawer that lets users pick a person must keep these filters and ranking rules intact so we don’t show mismatched people or hammer the backend with duplicate searches.

## 2. Project Search & Selection
- **UI elements:** project autocomplete + dropdown (currently first page only), future edit-state seeding from assignment.
- **Backend calls**
  - `projectsApi.list({ page, page_size })` — populates the project list.
  - (Planned for edit mode) `assignmentsApi.get(id)` would hydrate current project/person choices.
- **Why it matters:** When this moves into a mobile “step”, we must keep pagination & selected-project serialization exactly as today (`project: number` in the payload).

## 3. Weekly Hours Grid
- **UI elements:** 12-week grid generated via `getNext12Weeks()`, numeric inputs per week, total-hours validation, capacity warnings.
- **Backend calls**
  - `assignmentsApi.create(assignmentData)` / `assignmentsApi.update(id, assignmentData)` — payload contains `{ person, project, weeklyHours }`.
  - `assignmentsApi.bulkUpdateHours` is not used here, but any refactor must continue producing the same `weeklyHours` object keyed by Sunday dates.
- **Dependencies:** Person capacity (from `peopleApi.list` results) and department filter (weeks align with `getSundaysFrom` utility). Validation ensures neither the total nor per-week values violate capacity.
- **Why it matters:** If we split this into a swipeable timeline, we still need the same keys, validation errors, and error messaging so server-side checks stay in sync.

## 4. Skills Inputs & Matching
- **UI elements:** free-text “skills” input, chips showing parsed skills, warnings per person card.
- **Backend calls**
  - `skillTagsApi.list()` — autocomplete vocabulary for extracting skills.
  - `personSkillsApi.list()` — actual person skill records (strength vs development) to show warnings like “development opportunity”.
- **Why it matters:** These APIs drive both filtering and warnings; reorganizing the UI cannot duplicate calls or lose the distinction between strengths, development skills, and unmatched requirements.

## 5. Submission, Errors, and Navigation
- **UI elements:** Save/Cancel buttons, inline `Card` error summaries.
- **Backend calls**
  - `assignmentsApi.create` / `assignmentsApi.update` as outlined above.
  - `navigate('/assignments')` after success; `setError(err.message)` when backend rejects.
- **Why it matters:** Any multi-step wizard still needs a single consolidated payload and must surface backend errors verbatim to avoid masking validation constraints.

---

**Key Constraints Discovered**
1. **Department filter coupling:** `useDepartmentFilter` scope is applied to people queries and skill-match requests. A mobile wizard must either keep the same hook at the top level or pass those params through each step.
2. **Skill ranking is server-side:** Even though we parse keywords locally, the authoritative ranking (scores) comes from `peopleApi.skillMatch`. Offline reordering would diverge from backend results.
3. **Weekly-hour validation depends on selected person:** Errors reference the same `formatWeekDisplay` function and person capacity; moving the grid into a stepper still requires access to selected-person data for validation.

With this inventory in place we can safely design the mobile stepper knowing which APIs and validation rules every form block depends on.
