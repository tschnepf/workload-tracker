# Person Form – Phase 1 Form Audit

Target file: `frontend/src/pages/People/PersonForm.tsx`

## 1. Field Groups and Layout

- **Name (Full Name)**
  - Component: shared `Input` with label "Full Name".
  - Backed by `formData.name: string` in `PersonFormData` and submitted directly after `.trim()` in validation only (no extra transformation on submit).citefrontend/src/pages/People/PersonForm.tsx:23-31frontend/src/pages/People/PersonForm.tsx:120-132frontend/src/pages/People/PersonForm.tsx:164-181

- **Weekly Capacity**
  - Component: `Input` with label "Weekly Capacity (hours)" and numeric constraints (`min=1`, `max=80`).
  - Stored as `formData.weeklyCapacity: number`; `onChange` parses `e.target.value` as integer and falls back to `0`, with validation ensuring a 1–80 range.
  - Serialized into `apiData` unchanged; backend expects hours per week as an integer field on the `Person` model.citefrontend/src/pages/People/PersonForm.tsx:23-31frontend/src/pages/People/PersonForm.tsx:134-146frontend/src/pages/People/PersonForm.tsx:204-220

- **Role Select (Role/Title)**
  - Component: plain `<select>` labeled "Role/Title *" backed by `formData.role: string` (stringified role ID).
  - Options are populated from `rolesApi.list()`; values use `role.id`, labels use `role.name`.
  - On submit, `roleId = parseInt(formData.role) || 1` is applied and merged into `apiData` as a numeric `role` property to match the backend `Person.role` foreign key.
  - Validation requires a non-empty `formData.role` string before submission.citefrontend/src/pages/People/PersonForm.tsx:32-41frontend/src/pages/People/PersonForm.tsx:73-93frontend/src/pages/People/PersonForm.tsx:148-158frontend/src/pages/People/PersonForm.tsx:222-244

- **Department Select**
  - Component: `<select>` labeled "Department" bound to `formData.department: number | null`.
  - Departments fetched via `departmentsApi.list()`; options use `dept.id` as value and `dept.name` as label.
  - Change handler parses selected value to `number` or `null`, so the API payload sends integer IDs or `null` for "None Assigned", aligning with the backend `department` foreign key / nullable field.citefrontend/src/pages/People/PersonForm.tsx:42-52frontend/src/pages/People/PersonForm.tsx:59-71frontend/src/pages/People/PersonForm.tsx:246-272

- **Location**
  - Component: shared `Input` labeled "Location" mapped to `formData.location: string`.
  - Serialized as-is in `apiData`; backend uses a free‑text string (e.g., "Remote", "New York, NY").citefrontend/src/pages/People/PersonForm.tsx:23-31frontend/src/pages/People/PersonForm.tsx:296-306

- **Hire Date**
  - Component: `<input type="date">` targeting `formData.hireDate?: string`.
  - Stored as `YYYY-MM-DD` (or empty string) and passed unchanged to the API as `hireDate`, matching the backend’s date field expectations.
  - Treated as optional; no validation constraints in `validateForm`.citefrontend/src/pages/People/PersonForm.tsx:23-31frontend/src/pages/People/PersonForm.tsx:274-286frontend/src/pages/People/PersonForm.tsx:134-146

- **Status (isActive)**
  - Component: checkbox `id="isActive"` bound to `formData.isActive: boolean`.
  - Defaults to `true` for new people and toggles with `onChange` using `.checked`; serialized as a boolean `isActive` property in `apiData` to align with the backend active flag.citefrontend/src/pages/People/PersonForm.tsx:23-31frontend/src/pages/People/PersonForm.tsx:288-294frontend/src/pages/People/PersonForm.tsx:134-146

## 2. Backend & Hook Dependencies

- **Data loading**
  - Uses `useAuthenticatedEffect` to ensure API calls only run when an access token exists.
  - Fetches departments and roles via `departmentsApi.list()` and `rolesApi.list()` once on mount; fetches person data via `peopleApi.get(id)` when editing.
  - Loaded `Person` is normalized into `PersonFormData` so the form always works with the local shape (`role` as string, `department` as number/null).citefrontend/src/pages/People/PersonForm.tsx:53-95frontend/src/pages/People/PersonForm.tsx:97-119

- **Mutations**
  - Creation uses `useCreatePerson()` and passes the fully shaped `apiData` (`name`, `weeklyCapacity`, numeric `role`, `department`, `location`, `hireDate`, `isActive`).
  - Editing uses `useUpdatePerson()` with `{ id, data: apiData }`, relying on that hook’s optimistic cache updates and backend PATCH semantics.
  - Both paths show `Toast` feedback and navigate back to `/people` after success.citefrontend/src/pages/People/PersonForm.tsx:33-41frontend/src/pages/People/PersonForm.tsx:148-181frontend/src/hooks/usePeople.ts:57-116

- **Validation contract**
  - `validateForm` enforces:
    - non-empty `name` (trimmed),
    - non-empty `role` (string ID),
    - `weeklyCapacity` between 1 and 80.
  - No server‑side fields are dropped or renamed between `formData` and `apiData`; only `role` undergoes type conversion from string → number. This is the critical invariant for future mobile refactors: preserve the `PersonFormData` keys and the `role` conversion when re‑structuring the UI.citefrontend/src/pages/People/PersonForm.tsx:134-146frontend/src/pages/People/PersonForm.tsx:148-161

## 3. Mobile Refactor Guardrails

- **Do not change `PersonFormData` keys or types**
  - Keep `name`, `weeklyCapacity`, `role` (string ID), `department` (number | null), `location`, `hireDate`, and `isActive` as the canonical internal shape so existing submit logic and hooks remain valid.

- **Preserve API serialization**
  - Any stepper/accordion or responsive layout must continue to:
    - trim `name` in validation,
    - convert `role` string → numeric ID before calling `useCreatePerson`/`useUpdatePerson`,
    - send `department` as integer or `null`,
    - pass `hireDate` and `isActive` through untouched.

- **Async loading remains centralized**
  - Department/role/person fetches must stay in a single effect chain so mobile‑specific components don’t duplicate requests or bypass `useAuthenticatedEffect`.

These constraints give us a clear contract for Phase 2: we can safely re‑layout the form into mobile steps or stacked cards as long as we respect the `PersonFormData` shape and the `apiData` transformation at submit.

