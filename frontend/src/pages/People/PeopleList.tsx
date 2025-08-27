/**
 * People List Page - Dark mode table with CRUD operations
 * Chunk 2: Simple list + create person functionality
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Person } from '@/types/models';
import { peopleApi } from '@/services/api';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

const PeopleList: React.FC = () => {
  const navigate = useNavigate();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPeople();
  }, []);

  const loadPeople = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await peopleApi.list();
      setPeople(response.results || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load people');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name}?`)) {
      return;
    }

    try {
      await peopleApi.delete(id);
      await loadPeople(); // Reload the list
    } catch (err: any) {
      setError(err.message || 'Failed to delete person');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <Card className="bg-[#2d2d30] border-[#3e3e42] p-6">
          <div className="text-slate-300">Loading people...</div>
        </Card>
      </div>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-[#cccccc]">Team Members</h1>
        <Button
          variant="primary"
          onClick={() => navigate('/people/new')}
        >
          Add Person
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <Card className="bg-red-500/20 border-red-500/50 p-4">
          <div className="text-red-400">{error}</div>
        </Card>
      )}

      {/* People Table */}
      <Card className="bg-[#2d2d30] border-[#3e3e42] overflow-hidden">
        {people.length === 0 ? (
          <div className="p-6 text-center">
            <div className="text-[#969696] mb-4">No team members yet</div>
            <Button
              variant="primary"
              onClick={() => navigate('/people/new')}
            >
              Add First Person
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#3e3e42] border-b border-[#3e3e42]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#cccccc] uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#cccccc] uppercase tracking-wider">
                    Weekly Capacity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#cccccc] uppercase tracking-wider">
                    Added
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-[#cccccc] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-600">
                {people.map((person) => (
                  <tr key={person.id} className="hover:bg-[#3e3e42]/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-[#cccccc]">{person.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-slate-300">{person.weeklyCapacity}h</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-[#969696] text-sm">
                        {person.createdAt ? new Date(person.createdAt).toLocaleDateString() : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/people/${person.id}/edit`)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(person.id!, person.name)}
                      >
                        Delete
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
          Total: <span className="text-[#cccccc] font-medium">{people.length}</span> team members
        </div>
      </Card>
      </div>
    </Layout>
  );
};

export default PeopleList;