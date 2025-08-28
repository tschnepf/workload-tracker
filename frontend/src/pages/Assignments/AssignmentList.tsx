/**
 * Assignment List Page - Dark mode table with assignment management
 * Chunk 3: Basic assignment CRUD with utilization display
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Assignment } from '@/types/models';
import { assignmentsApi } from '@/services/api';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import UtilizationBadge from '@/components/ui/UtilizationBadge';

const AssignmentList: React.FC = () => {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAssignments();
  }, []);

  const loadAssignments = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await assignmentsApi.list();
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
          <div className="text-slate-300">Loading assignments...</div>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-[#cccccc]">Project Assignments</h1>
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
            Total: <span className="text-[#cccccc] font-medium">{assignments.length}</span> active assignments
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default AssignmentList;