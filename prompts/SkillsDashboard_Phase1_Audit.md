## Skills Dashboard – `frontend/src/pages/Skills/SkillsDashboard.tsx`

### Overview

- The Skills Dashboard gives a **high-level view of team skills**, including:
  - Overall **skills coverage** across the team (how many people have each skill, and at what level).
  - **Department-level skills summaries** (top strengths and gaps by department).
  - A compact **skill management form** to add or remove skill tags.
- It is a **single-page dashboard** built entirely on top of the standard API services:
  - `peopleApi.list()` – people and their departments.
  - `departmentsApi.list()` – departments.
  - `skillTagsApi.list()` / `skillTagsApi.create()` / `skillTagsApi.delete()` – skill dictionary.
  - `personSkillsApi.list()` – individual skill records per person.

All data is loaded in one batched step and then reused for all sections.

### Data Loading and Backend Batching

- `useAuthenticatedEffect` calls `loadAllData()` once on mount:
  - Inside `loadAllData`:
    - Sets `loading = true`, clears `error`.
    - Executes a single `Promise.all`:
      1. `peopleApi.list()` → people with department references.
      2. `departmentsApi.list()` → available departments.
      3. `skillTagsApi.list()` → skill tags (name + optional category).
      4. `personSkillsApi.list()` → person-skill relationships, including:
         - `person` id, `skillTagName`, `skillType` (`strength`, `development`, `learning`), `proficiencyLevel` (`expert`, `advanced`, `intermediate`, `beginner`).
    - On success:
      - Stores `people`, `departments`, `skillTags`, and `peopleSkills` into local state.
    - On error:
      - Populates `error` with the backend message.
    - Finally:
      - Sets `loading = false`.
- This means all sections share a common underlying dataset; there are **no additional per-section API calls**. Any mobile staging must continue to reuse this single batch to avoid fragmentation or duplication.

### Filter and View Mode State

- Department filter:
  - `selectedDepartment: string` – empty string means “All Departments”.
  - Used only in **client-side filtering**:
    - When set, `calculateSkillsCoverage` and `calculateDepartmentSkills` restrict data to people whose `person.department` matches the selected value.
  - Backend calls are **not** repeated when the filter changes; all filtering is local.

- View mode:
  - `viewMode: 'coverage' | 'gaps' | 'departments'`:
    - `'coverage'` – primary skills coverage cards.
    - `'gaps'` – gap-focused cards (skills with limited or no coverage).
    - `'departments'` – per-department panels showing top skills and gaps.
  - Switching views does not touch backend data; it simply chooses which section to render.

### Skills Coverage Computation

- `calculateSkillsCoverage()`:
  - Pre-initializes a `Map<string, SkillCoverage>` with entries for every `skillTags` item:
    - Each `SkillCoverage` starts with:
      - `totalPeople = 0`.
      - `strengths/development/learning = 0`.
      - `expert/advanced/intermediate/beginner` counts = 0.
      - `coverage = 'gap'`.
  - Applies department filter:
    - `filteredPeople`:
      - All people, or only those whose `person.department` equals `selectedDepartment`.
  - Iterates over `peopleSkills`:
    - Finds the person; skips if missing.
    - If department filter is set and person’s department doesn’t match, continues.
    - Looks up the `SkillCoverage` by `skillTagName` (or `'Unknown'`).
    - Increments:
      - `totalPeople`.
      - One of `strengths`, `development`, `learning` based on `skillType`.
      - One of the proficiency counters based on `proficiencyLevel`.
  - After counting:
    - For each `SkillCoverage`:
      - Computes `strengthsRatio = strengths / totalPeopleCount`.
      - Computes `expertsAndAdvanced = expertCount + advancedCount`.
      - Sets `coverage`:
        - `'excellent'` – at least 3 experts/advanced and strengthsRatio ≥ 0.3.
        - `'good'` – at least 2 experts/advanced and strengthsRatio ≥ 0.2.
        - `'limited'` – any non-zero `totalPeople` not meeting the above.
        - `'gap'` – no coverage for the filtered people.
  - Returns an array:
    - Filters out skills with `totalPeople === 0` unless coverage is `'gap'`.
    - Sorts by coverage quality (excellent → good → limited → gap), then by `totalPeople` descending.

- `getCoverageStats()`:
  - Runs `calculateSkillsCoverage()` and counts how many skills fall into each coverage category.
  - Used only in the summary header of the coverage card.

### Department-level Skills Analysis

- `calculateDepartmentSkills()`:
  - For every department in `departments`:
    - `deptPeople` – people whose `person.department === dept.id`.
    - `deptPeopleIds` – ids of those people.
    - `deptSkills` – `peopleSkills` where `skill.person` is in `deptPeopleIds`.
  - Top skills:
    - Only counts skills whose `skillType === 'strength'`.
    - Builds a `Map` of counts by `skillTagName`, sorts descending, and takes top 5.
  - Skill gaps:
    - Builds `allOtherSkills` set:
      - All `skillTagName` from `peopleSkills` where person is *not* in this department and `skillType === 'strength'`.
    - `deptSkillNames` – set of skills present in this department.
    - `skillGaps` – up to 3 skills present elsewhere but not in this department.
  - Returns a list of `DepartmentSkills` objects (one per department with at least one person):
    - `departmentId`, `departmentName`, `peopleCount`.
    - `topSkills[]`.
    - `skillGaps[]`.
    - `skillsCoverage` is left as an empty array; coverage is computed globally by `calculateSkillsCoverage`.

### Layout Sections and Their Roles

1. **Header + Department Filter**
   - `flex flex-col sm:flex-row sm:items-center sm:justify-between`.
   - Content:
     - Title “Skills Dashboard”.
     - Subtitle describing purpose; when `selectedDepartment` is set, a line “Filtered by: {department name}”.
   - Department `<select>`:
     - Right-aligned on desktop; stacked below on mobile.
     - Options: All Departments + each department name.
     - Drives only the **client-side** filter.

2. **Skill Management Form**
   - Card: `bg-[#2d2d30] border-[#3e3e42] p-4`.
   - Controls:
     - `New Skill Name` text input.
     - `Category (optional)` text input.
     - `Add Skill` button:
       - Disabled when the name is blank or `savingSkill` is true.
       - Uses `skillTagsApi.create` to create a tag and updates `skillTags` state (keeping it sorted).
   - Existing skills:
     - Scrollable list (`max-h-40 overflow-auto`) with a `grid` of skill cards.
     - Each skill shows name, optional category, and a small “Delete” button.
       - Deletion uses `skillTagsApi.delete`; on success, removes from `skillTags`.
   - This section is shared between mobile and desktop; it is dense but fully vertical on small screens.

3. **View Mode Tabs**
   - Horizontal `flex gap-2` row of buttons:
     - “Skills Coverage”, “Gaps & Recommendations”, “By Department”.
   - `viewMode` determines which main card(s) render below.

4. **Skills Coverage Card (`viewMode === 'coverage'`)**
   - Card: `bg-[#2d2d30] border-[#3e3e42] p-6`.
   - Top summary:
     - Shows total skills, counts for excellent/good/limited/gaps, each with colored text and small icons.
   - Coverage grid:
     - `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4`.
     - Each `SkillCoverage` entry is rendered as a card with:
       - Skill name.
       - Coverage badge (Excellent/Good/Limited/Gap) with color-coded background.
       - A bar showing coverage level vs team size.
       - Breakdown counts: strengths, development/learning, expert+advanced, intermediate+beginner.
   - On mobile, these cards stack vertically (single column); on larger screens they tile across 2–3 columns.

5. **Gaps & Recommendations Card (`viewMode === 'gaps'`)**
   - Card: `bg-[#2d2d30] border-[#3e3e42] p-6`.
   - Lists only skills where coverage is `'gap'` or `'limited'`:
     - Each gap card shows:
       - Skill name.
       - Badge indicating “No Coverage” or “Limited Coverage”.
       - Guidance text and a note if any team members are developing the skill.
   - If there are no gaps, shows a positive summary message.

6. **Department Panels (`viewMode === 'departments'`)**
   - `grid grid-cols-1 lg:grid-cols-2 gap-6`.
   - For each `DepartmentSkills` entry:
     - Card with department name and people count.
     - “Top Skills” chips (up to 5) for strengths.
     - “Potential Gaps” chips (skills present in other departments but absent here).
   - On mobile, each department card stacks vertically in a single column.

### Mobile Staging and Constraints

- **Batching**:
  - All sections use a **single batch** of data from `loadAllData` (people, departments, skill tags, people skills).
  - Mobile refactors must preserve this pattern and avoid introducing new per-section fetches.

- **Staging considerations for narrow screens**:
  - The current layout is largely vertical already:
    - Header and department filter stack naturally.
    - Skill management form and coverage/gaps/department cards are single-column on mobile.
  - Dense areas:
    - Skills coverage cards hold multiple numeric fields and a bar; on very small devices they can feel busy.
    - The skill management grid shows delete buttons on the far right; long skill names may push close to the edge.
  - High-value mobile grouping:
    - It should be straightforward to:
      - Place the **View Mode tabs** directly under the header so users can switch context quickly.
      - Treat “Manage Skill Tags” as a secondary section that can be collapsed or moved toward the bottom on mobile.
      - Keep the department filter and view tabs in a compact, possibly sticky header without changing the underlying data.

- **What must not change in later phases**:
  - Contracts and semantics of:
    - `peopleApi.list()`, `departmentsApi.list()`, `skillTagsApi.list()`, `personSkillsApi.list()`.
    - `skillTagsApi.create/delete` behavior and the way `skillTags` state is updated.
  - The logic in `calculateSkillsCoverage` and `calculateDepartmentSkills`, since these functions define how coverage and gaps are computed from the raw data.
  - The use of `selectedDepartment` as a pure client-side filter; refactors should not turn it into multiple separate backend queries.

This audit catalogs the Skills Dashboard sections and their data dependencies, showing how coverage, gaps, department summaries, and the skill management form are all driven by a single batched data load, providing a safe foundation for mobile-first staging and visual refinements in subsequent phases.

