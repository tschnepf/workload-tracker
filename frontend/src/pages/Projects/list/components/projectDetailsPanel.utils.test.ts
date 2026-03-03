import { describe, expect, it } from 'vitest';
import type { Assignment, Department, Person } from '@/types/models';
import type { ProjectRole } from '@/roles/api';
import {
  buildWeekKeys,
  computeRoleMatches,
  groupAssignmentsByDepartment,
  resolveSelectedDepartmentId,
} from './projectDetailsPanel.utils';

describe('projectDetailsPanel.utils', () => {
  describe('resolveSelectedDepartmentId', () => {
    it('uses selected person department when valid', () => {
      const person = { id: 10, name: 'Alice', department: 7 } as Person;
      const fallback = () => 3;
      expect(resolveSelectedDepartmentId(person, fallback)).toBe(7);
    });

    it('falls back to getPersonDepartmentId when person has no department', () => {
      const person = { id: 10, name: 'Alice', department: null } as Person;
      expect(resolveSelectedDepartmentId(person, () => 8)).toBe(8);
    });

    it('returns null for invalid or missing ids', () => {
      expect(resolveSelectedDepartmentId(null, () => 9)).toBeNull();
      expect(resolveSelectedDepartmentId({ id: undefined, name: 'A' } as Person, () => 9)).toBeNull();
      expect(resolveSelectedDepartmentId({ id: 5, name: 'A', department: 0 } as Person, () => 0)).toBeNull();
    });
  });

  describe('buildWeekKeys', () => {
    it('builds 6 monday-aligned keys from current week key', () => {
      const weekKeys = buildWeekKeys('2026-03-04'); // Wednesday
      expect(weekKeys).toEqual([
        '2026-03-02',
        '2026-03-09',
        '2026-03-16',
        '2026-03-23',
        '2026-03-30',
        '2026-04-06',
      ]);
    });

    it('returns stable YYYY-MM-DD format', () => {
      const weekKeys = buildWeekKeys('2026-01-01');
      weekKeys.forEach((wk) => expect(wk).toMatch(/^\d{4}-\d{2}-\d{2}$/));
      expect(weekKeys).toHaveLength(6);
    });
  });

  describe('groupAssignmentsByDepartment', () => {
    it('groups and sorts with fallback names', () => {
      const assignments = [
        { id: 1, person: 10, weeklyHours: {}, personDepartmentId: 2 } as unknown as Assignment,
        { id: 2, person: 11, weeklyHours: {}, personDepartmentId: null } as unknown as Assignment,
        { id: 3, person: 12, weeklyHours: {}, personDepartmentId: 1 } as unknown as Assignment,
      ];
      const departments = [
        { id: 2, name: 'Electrical' },
        { id: 1, name: 'Architectural' },
      ] as Department[];

      const grouped = groupAssignmentsByDepartment(assignments, departments, (personId) => {
        if (personId === 11) return 'Unassigned By Person';
        return null;
      });

      expect(grouped.map(([name]) => name)).toEqual(['Architectural', 'Electrical', 'Unassigned By Person']);
      expect(grouped[0][1].map((a) => a.id)).toEqual([3]);
      expect(grouped[1][1].map((a) => a.id)).toEqual([1]);
      expect(grouped[2][1].map((a) => a.id)).toEqual([2]);
    });
  });

  describe('computeRoleMatches', () => {
    it('filters role matches by query and includes department labels', () => {
      const departments = [
        { id: 1, name: 'Electrical' },
        { id: 2, name: 'ICT' },
      ] as Department[];
      const rolesByDept: Record<number, ProjectRole[]> = {
        1: [
          { id: 11, name: 'Electrical Lead', department_id: 1, is_active: true, sort_order: 1 },
          { id: 12, name: 'QA', department_id: 1, is_active: true, sort_order: 2 },
        ],
        2: [
          { id: 21, name: 'ICT Lead', department_id: 2, is_active: true, sort_order: 1 },
        ],
      };

      const matches = computeRoleMatches(departments, rolesByDept, 'lead');
      expect(matches).toHaveLength(2);
      expect(matches.map((m) => m.role.name)).toEqual(['Electrical Lead', 'ICT Lead']);
      expect(matches.map((m) => m.deptName)).toEqual(['Electrical', 'ICT']);
    });
  });
});
