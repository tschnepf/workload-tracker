# Global Department Filter – QA checklist (Prompt 9)

Server endpoints

- People list: /api/people/?department=ID&include_children=0|1 (all=true)
- Assignments list: /api/assignments/?department=ID&include_children=0|1 (all=true)
- Capacity heatmap: /api/people/capacity_heatmap/?department=ID&include_children=0|1
- Workload forecast: /api/people/workload_forecast/?department=ID&include_children=0|1

Manual steps

1) Header visibility
   - Navigate to /dashboard, /assignments, /assignments/list, /reports/forecast.
   - Confirm GlobalDepartmentFilter is present in the header (Alt+Shift+D focuses input).

2) URL ↔ store init
   - Manually set ?department=3&include_children=1 in the URL and reload.
   - Check filter shows selected; toggling include-children updates URL without history spam.

3) End-to-end filtering
   - On Dashboard and Forecast pages, confirm totals change when selecting a department.
   - On Assignments (Grid and List), people and assignments reflect the selected department.

4) Copy link
   - Use “Copy link” in header pill; open in a new tab. The same filter should load.

5) Edge cases
   - Clear filter: header pill disappears; endpoints receive no department params.
   - Invalid URL (department=abc): should behave as unfiltered.
   - Include children disabled when no department is selected.

6) Accessibility
   - Combobox keyboard: ArrowUp/Down, Enter, Escape, Home/End/PageUp/PageDown.
   - Live region announces changes; checkbox toggles are announced.

Notes

- URL updates use replaceState to avoid history spam.
- We only send include_children when department is set.
