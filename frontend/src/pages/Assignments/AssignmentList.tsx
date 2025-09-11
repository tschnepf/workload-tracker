/**
 * Assignment List Page - Dark mode table with assignment management
 * Chunk 3: Basic assignment CRUD with utilization display
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Assignment, Person, Department } from '@/types/models';
import { assignmentsApi, peopleApi, departmentsApi } from '@/services/api';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import UtilizationBadge from '@/components/ui/UtilizationBadge';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';

const AssignmentList: React.FC = () => {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [filteredAssignments, setFilteredAssignments] = useState<Assignment[]>([]);
  const [peopleById, setPeopleById] = useState<Map<number, Person>>(new Map());
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { state: deptState } = useDepartmentFilter();

  useEffect(() => {
    // Load assignments, people, and departments in parallel. Respect global department filter.
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
        const inc = deptState.includeChildren ? 1 : 0;
        const [assignmentsResp, peoplePage, departmentsPage] = await Promise.all([
          assignmentsApi.list({ page: 1, page_size: 100, department: dept, include_children: dept != null ? inc : undefined }),
          peopleApi.list({ page: 1, page_size: 100, department: dept, include_children: dept != null ? inc : undefined }),
          departmentsApi.list({ page: 1, page_size: 500 }),
        ]);
        setAssignments(assignmentsResp.results || []);
        const peopleList = peoplePage.results || [];
        setPeopleById(new Map(peopleList.map((p: any) => [p.id!, p])));
        setDepartments(departmentsPage.results || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load assignments');
      } finally {
        setLoading(false);
      }
    })();
  }, [deptState.selectedDepartmentId, deptState.includeChildren]);

  // Helper: compute allowed department ids including children
  const allowedDepartmentIds = useMemo(() => {
    if (deptState.selectedDepartmentId == null) return null;
    const rootId = Number(deptState.selectedDepartmentId);
    if (!deptState.includeChildren) return new Set<number>([rootId]);
    const result = new Set<number>();
    const stack = [rootId];
    while (stack.length) {
      const current = stack.pop()!;
      result.add(current);
      for (const d of departments) {
        if (d.parentDepartment === current && d.id != null && !result.has(d.id)) {
          stack.push(d.id);
        }
      }
    }
    return result;
  }, [deptState.selectedDepartmentId, deptState.includeChildren, departments]);

  // Derive filtered assignments based on global department filter
  useEffect(() => {
    if (deptState.selectedDepartmentId == null) {
      setFilteredAssignments(assignments);
      return;
    }
    if (!allowedDepartmentIds) {
      setFilteredAssignments(assignments);
      return;
    }
    // Build allowed person id set
    const allowedPersonIds = new Set<number>();
    peopleById.forEach((person, id) => {
      if (person.department != null && allowedDepartmentIds.has(Number(person.department))) {
        allowedPersonIds.add(id);
      }
    });
    const filtered = assignments.filter(a => a.person != null && allowedPersonIds.has(Number(a.person)));
    setFilteredAssignments(filtered);
  }, [assignments, peopleById, allowedDepartmentIds, deptState.selectedDepartmentId]);

  const loadAssignments = async () => {
    try {
      setLoading(true);
      setError(null);
      const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
      const inc = deptState.includeChildren ? 1 : 0;
      const response = await assignmentsApi.list({ department: dept, include_children: dept != null ? inc : undefined });
      setAssignments(response.results || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, projectDisplayName: string, personName: string) => {
    if (!window.confirm(`Remove ${personName} from ${projectDisplayName}?`)) {
      return;
    }

    try {
      await assignmentsApi.delete(id);
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
            <h1 className="text-2xl font-bold text-[#cccccc]">Project Assignments</h1>
            {/* Global Department info pill */}
            {deptState.selectedDepartmentId != null && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-[#3e3e42] text-[#cbd5e1] border border-[#3e3e42]">
                  Filtered by: <strong className="text-[#e5e7eb]">
                    {(() => {
                      const d = departments.find(d => d.id === Number(deptState.selectedDepartmentId));
                      return d?.name || `Dept ${deptState.selectedDepartmentId}`;
                    })()}
                  </strong>
                </span>
                <button
                  type="button"
                  className="px-2 py-1 rounded border bg-transparent border-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42]"
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
                  className="px-2 py-1 rounded border bg-transparent border-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42]"
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
          {filteredAssignments.length === 0 ? (
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
                  {filteredAssignments.map((assignment) => (
                    <tr key={assignment.id} className="hover:bg-[#3e3e42]/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-[#cccccc]">{assignment.personName}</div>
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
                          onClick={() => handleDelete(assignment.id!, assignment.projectDisplayName!, assignment.personName!)}
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
      Total: <span className="text-[#cccccc] font-medium">{filteredAssignments.length}</span> active assignments
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default AssignmentList;
