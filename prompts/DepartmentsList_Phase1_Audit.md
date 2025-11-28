## Departments List – `frontend/src/pages/Departments/DepartmentsList.tsx`

### Desktop Layout Overview

- The page uses a **two‑column split layout** inside `Layout`:
  - **Left panel (≈ 1/3 width)** – scrollable list of departments in a vertical stack of cards.
  - **Right panel (flex‑1)** – details for the currently selected department, or a “Select a Department” placeholder.
- The layout assumes a **wide viewport**:
  - Tailwind classes like `w-1/3` and `flex` for the left column and `flex-1` for the right column.
  - Detail content uses a `grid grid-cols-1 md:grid-cols-2` for info cards, optimized for desktop widths.

### Key Interactions & Desktop Assumptions

- **Initial load & auto‑selection**
  - On mount, `useAuthenticatedEffect` calls `loadDepartments()` and `loadPeople()`.
  - After departments load, a `useEffect` auto‑selects the first department in `filteredAndSortedDepartments` **once**, via `selectedDepartment` and `selectedIndex`, to ensure the right panel is populated by default.
  - This auto‑selection assumes enough horizontal space to show both list and details without confusing the user.

- **Filtering and sorting**
  - Local `searchTerm` state is wired to an `Input` labeled “Search departments...” in the left panel.
  - `filteredAndSortedDepartments` is computed with `useMemo`, filtering on `name` and `description` and sorting by `name`.
  - Filtering happens **entirely client‑side**; there is currently **no extra API call per search**, which is good for mobile.

- **Selection**
  - Clicking on a department card:
    - Sets `selectedDepartment` and `selectedIndex`.
    - Highlights the card via a `ring-2` focus style.
    - Drives the right‑hand details view.
  - The UI assumes the list and details are both visible side by side; there is no dedicated “back” or “close” action for details, which is a desktop‑centric pattern.

- **Modals and editing**
  - **Create Department**
    - “Add Department” button in the left panel triggers `handleCreateDepartment`, which:
      - Clears `editingDepartment`.
      - Sets `showModal` to `true`.
    - Renders `<DepartmentForm>` as a **modal dialog**, passing:
      - `department` (null for new).
      - `departments` and `people` as lookup data.
      - `onSave` / `onCancel` callbacks.
  - **Edit Department**
    - “Edit” button in the right panel triggers `handleEditDepartment`, which:
      - Sets `editingDepartment` to the selected department.
      - Opens the same `<DepartmentForm>` modal.
  - The modal is designed as a **centered desktop modal**; there is no explicit mobile sheet/slide‑over variant.

- **Delete behavior**
  - “Delete” button in the right panel calls `handleDeleteDepartment`:
    - Uses `window.confirm` to ask for confirmation.
    - Calls `departmentsApi.delete(id)` on confirmation, then reloads the departments list.
    - Clears `selectedDepartment` and `selectedIndex` if the deleted department was selected.
  - This relies on browser `confirm`, which is acceptable but not ideal for touch/mobile UX.

### Backend Dependencies and Call Patterns

- **Departments API**
  - `loadDepartments` calls `departmentsApi.list()` once on mount and after create/update/delete.
  - `handleSaveDepartment`:
    - Uses `departmentsApi.update(id, formData)` when `editingDepartment.id` is present.
    - Uses `departmentsApi.create(formData)` when creating a new department.
    - Always calls `loadDepartments()` afterward, then sets the current selection to the saved department.
  - `handleDeleteDepartment` calls `departmentsApi.delete(id)` and then `loadDepartments()`.
  - There is **no per‑row or per‑interaction departments API call** beyond these explicit mutations and reloads.

- **People API**
  - `loadPeople` calls `peopleApi.list()` once on mount.
  - The people list is used only for lookup helpers:
    - `getManagerName(managerId)` – maps `managerId` to a person’s `name`.
  - There is **no re‑fetch on selection or search**; people data is stable in memory.

### Mobile Risks & Considerations (No Code Changes Yet)

- The **fixed split layout (w-1/3 + flex-1)** can easily cause:
  - Cramped department list on narrow screens.
  - Horizontal scroll if content in the right panel overflows.
  - Confusing UX where both list and details are partially visible.
- The current **modal `<DepartmentForm>`** likely renders as a centered dialog that does not adapt to small viewports, making fields cramped or requiring zoom.
- **Desktop‑only affordances**:
  - No explicit “back” / “close detail” mechanism besides deselecting or switching departments.
  - Use of `window.confirm` for deletion is not ideal on mobile.
- From a backend perspective, current design already keeps `departmentsApi` and `peopleApi` calls minimal:
  - One initial list call each, plus explicit reloads on create/update/delete.
  - Future mobile work must preserve this pattern and avoid adding search‑on‑type or repeated detail fetches unless carefully debounced.

This audit is descriptive only; no behavior has been changed yet. It provides the baseline needed to design a mobile‑first stacked or drawer‑based layout in the next phases while maintaining lean `departmentsApi` usage.

