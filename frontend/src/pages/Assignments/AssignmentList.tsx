/**
 * Assignment List Page - Dark mode table with assignment management
 * Chunk 3: Basic assignment CRUD with utilization display
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { useNavigate } from 'react-router';
import { Assignment, Department } from '@/types/models';
import { assignmentsApi, departmentsApi } from '@/services/api';
import { deleteAssignment } from '@/lib/mutations/assignments';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import UtilizationBadge from '@/components/ui/UtilizationBadge';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';

const AssignmentList: React.FC = () => {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { state: deptState } = useDepartmentFilter();
  const { state: verticalState } = useVerticalFilter();

  const departmentFilters = useMemo(() => (deptState.filters ?? [])
    .map((f) => ({ departmentId: Number(f.departmentId), op: f.op }))
    .filter((f) => Number.isFinite(f.departmentId) && f.departmentId > 0), [deptState.filters]);

  const buildSearchPayload = useCallback(() => {
    const payload: any = { page: 1, page_size: 100, include_placeholders: 0 };
    if (verticalState.selectedVerticalId != null) payload.vertical = Number(verticalState.selectedVerticalId);
    if (deptState.selectedDepartmentId != null) {
      payload.department = Number(deptState.selectedDepartmentId);
      payload.include_children = deptState.includeChildren ? 1 : 0;
    } else if (departmentFilters.length) {
      payload.department_filters = departmentFilters;
    }
    return payload;
  }, [deptState.selectedDepartmentId, deptState.includeChildren, departmentFilters, verticalState.selectedVerticalId]);

  useAuthenticatedEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [assignmentsResp, departmentsPage] = await Promise.all([
          assignmentsApi.search(buildSearchPayload()),
          departmentsApi.list({ page: 1, page_size: 500, vertical: verticalState.selectedVerticalId ?? undefined }),
        ]);
        setAssignments(assignmentsResp.results || []);
        setDepartments(departmentsPage.results || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load assignments');
      } finally {
        setLoading(false);
      }
    })();
  }, [buildSearchPayload, verticalState.selectedVerticalId]);

  const loadAssignments = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await assignmentsApi.search(buildSearchPayload());
      setAssignments(response.results || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (assignment: Assignment) => {
    const label = assignment.personName
      || (assignment.person != null ? `Person #${assignment.person}` : (assignment.roleName ? `<${assignment.roleName}>` : 'Unassigned'));
    if (!window.confirm(`Remove ${label} from ${assignment.projectDisplayName}?`)) {
      return;
    }

    try {
      await deleteAssignment(assignment.id!, assignmentsApi, {
        projectId: assignment.project ?? null,
        personId: assignment.person ?? null,
        updatedAt: assignment.updatedAt ?? new Date().toISOString(),
      });
      await loadAssignments(); // Reload the list
    } catch (err: any) {
      setError(err.message || 'Failed to delete assignment');
    }
  };

  if (loading) {
    return (
      <Layout>
        <Card className="bg-[#2d2d30] border-[#3e3e42] p-6">
          <div className="space-y-2">
            <div className="w-full h-5 bg-[#3e3e42] animate-pulse rounded" />
            <div className="w-full h-5 bg-[#3e3e42] animate-pulse rounded" />
            <div className="w-full h-5 bg-[#3e3e42] animate-pulse rounded" />
            <div className="w-full h-5 bg-[#3e3e42] animate-pulse rounded" />
          </div>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Project Assignments</h1>
            {/* Global Department info pill */}
            {deptState.selectedDepartmentId != null && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-[var(--card)] text-[var(--text)] border border-[var(--border)]">
                  Filtered by: <strong className="text-[var(--text)]">
                    {(() => {
                      const d = departments.find(d => d.id === Number(deptState.selectedDepartmentId));
                      return d?.name || `Dept ${deptState.selectedDepartmentId}`;
                    })()}
                  </strong>
                </span>
                <button
                  type="button"
                  className="px-2 py-1 rounded border bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                  onClick={() => {
                    const input = document.getElementById('global-dept-filter-input') as HTMLInputElement | null;
                    input?.focus();
                  }}
                  title="Change department (Alt+Shift+D)"
                >
                  Change
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded border bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(window.location.href); } catch {}
                  }}
                  title="Copy link with current filter"
                >
                  Copy link
                </button>
              </div>
            )}
          </div>
          <Button
            variant="primary"
            onClick={() => navigate('/assignments/new')}
          >
            Create Assignment
          </Button>
        </div>

        {/* Error Message */}
        {error && (
          <Card className="bg-red-500/20 border-red-500/50 p-4">
            <div className="text-red-400">{error}</div>
          </Card>
        )}

        {/* Assignments Table */}
        <Card className="bg-[#2d2d30] border-[#3e3e42] overflow-hidden">
          {assignments.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-[#969696] mb-4">No project assignments yet</div>
              <Button
                variant="primary"
                onClick={() => navigate('/assignments/new')}
              >
                Create First Assignment
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#3e3e42] border-b border-[#3e3e42]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#cccccc] uppercase tracking-wider">
                      Person
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#cccccc] uppercase tracking-wider">
                      Project
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#cccccc] uppercase tracking-wider">
                      Allocation
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#cccccc] uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-[#cccccc] uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-600">
                {assignments.map((assignment) => (
                    <tr key={assignment.id} className="hover:bg-[#3e3e42]/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-[#cccccc]">
                          {assignment.personName
                            || (assignment.person != null ? `Person #${assignment.person}` : (assignment.roleName ? `<${assignment.roleName}>` : 'Unassigned'))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-slate-300">{assignment.projectDisplayName || assignment.projectName || 'No Project'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <UtilizationBadge percentage={assignment.allocationPercentage} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-[#969696] text-sm">
                          {assignment.createdAt ? new Date(assignment.createdAt).toLocaleDateString() : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => navigate(`/assignments/${assignment.id}/edit`)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(assignment)}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Summary */}
    <Card className="bg-[#2d2d30] border-[#3e3e42] p-4">
          <div className="text-[#969696] text-sm">
      Total: <span className="text-[#cccccc] font-medium">{assignments.length}</span> active assignments
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default AssignmentList;
