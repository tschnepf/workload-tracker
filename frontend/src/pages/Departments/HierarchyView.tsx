/**
 * Department Hierarchy View - Full page organizational chart
 * Shows complete department structure with navigation and details
 */

import React, { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import DepartmentHierarchy from '@/components/departments/DepartmentHierarchy';
import { Department, Person } from '@/types/models';
import { departmentsApi, peopleApi } from '@/services/api';

const HierarchyView: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [deptResponse, peopleResponse] = await Promise.all([
        departmentsApi.list(),
        peopleApi.list()
      ]);
      
      setDepartments(deptResponse.results || []);
      setPeople(peopleResponse.results || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleDepartmentClick = (department: Department) => {
    setSelectedDepartment(department);
  };

  const getDepartmentStats = (department: Department) => {
    const deptPeople = people.filter(p => p.department === department.id);
    const subDepartments = departments.filter(d => d.parentDepartment === department.id);
    
    return {
      directReports: deptPeople.length,
      subDepartments: subDepartments.length,
      totalTeamSize: deptPeople.length + subDepartments.reduce((total, subDept) => {
        return total + people.filter(p => p.department === subDept.id).length;
      }, 0)
    };
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-[#969696]">Loading organizational structure...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-[#cccccc]">
              Department Hierarchy
            </h1>
            <p className="text-[#969696] mt-2">
              Organizational structure and team relationships
            </p>
          </div>
          
          <div className="text-right">
            <div className="text-sm text-[#969696]">
              <div>{departments.length} departments</div>
              <div>{people.length} people</div>
            </div>
          </div>
        </div>

        {error && (
          <Card className="bg-red-500/20 border-red-500/50 p-4">
            <div className="text-red-400">Error: {error}</div>
            <button
              onClick={loadData}
              className="mt-2 text-sm text-[#007acc] hover:text-[#1e90ff]"
            >
              Retry
            </button>
          </Card>
        )}

        {departments.length === 0 ? (
          <Card className="bg-[#2d2d30] border-[#3e3e42] p-8 text-center">
            <div className="text-[#969696]">
              <h3 className="text-lg mb-2">No Departments</h3>
              <p>Create departments to see the organizational hierarchy</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            {/* Hierarchy Visualization */}
            <div className="xl:col-span-3">
              <Card className="bg-[#2d2d30] border-[#3e3e42] p-6">
                <h3 className="text-lg font-semibold text-[#cccccc] mb-6">
                  Organizational Chart
                </h3>
                <DepartmentHierarchy
                  departments={departments}
                  people={people}
                  onDepartmentClick={handleDepartmentClick}
                  selectedDepartmentId={selectedDepartment?.id}
                />
              </Card>
            </div>

            {/* Department Details Panel */}
            <div className="xl:col-span-1">
              <Card className="bg-[#2d2d30] border-[#3e3e42] p-6 sticky top-6">
                {selectedDepartment ? (
                  <div>
                    <h3 className="text-lg font-semibold text-[#cccccc] mb-4">
                      Department Details
                    </h3>
                    
                    <div className="space-y-4">
                      {/* Basic Info */}
                      <div>
                        <h4 className="font-medium text-[#cccccc] mb-2">
                          {selectedDepartment.name}
                        </h4>
                        <div className="space-y-1 text-sm">
                          <div className="text-[#969696]">
                            Manager: <span className="text-[#cccccc]">
                              {selectedDepartment.managerName || 'None assigned'}
                            </span>
                          </div>
                          <div className="text-[#969696]">
                            Status: <span className={selectedDepartment.isActive ? 'text-emerald-400' : 'text-gray-400'}>
                              {selectedDepartment.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Statistics */}
                      <div>
                        <h4 className="font-medium text-[#cccccc] mb-2">Statistics</h4>
                        {(() => {
                          const stats = getDepartmentStats(selectedDepartment);
                          return (
                            <div className="space-y-1 text-sm">
                              <div className="text-[#969696]">
                                Direct reports: <span className="text-[#cccccc]">{stats.directReports}</span>
                              </div>
                              <div className="text-[#969696]">
                                Sub-departments: <span className="text-[#cccccc]">{stats.subDepartments}</span>
                              </div>
                              <div className="text-[#969696]">
                                Total team size: <span className="text-[#cccccc]">{stats.totalTeamSize}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Description */}
                      {selectedDepartment.description && (
                        <div>
                          <h4 className="font-medium text-[#cccccc] mb-2">Description</h4>
                          <p className="text-sm text-[#969696]">
                            {selectedDepartment.description}
                          </p>
                        </div>
                      )}

                      {/* Team Members */}
                      <div>
                        <h4 className="font-medium text-[#cccccc] mb-2">Team Members</h4>
                        {(() => {
                          const teamMembers = people.filter(p => p.department === selectedDepartment.id);
                          return teamMembers.length > 0 ? (
                            <div className="space-y-2">
                              {teamMembers.map(person => (
                                <div key={person.id} className="text-sm">
                                  <div className="text-[#cccccc]">{person.name}</div>
                                  <div className="text-[#969696] text-xs">
                                    {person.weeklyCapacity}h capacity
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-[#969696]">No team members assigned</div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-[#969696]">
                    <h3 className="text-lg mb-2">Select a Department</h3>
                    <p className="text-sm">Click on any department in the hierarchy to view details</p>
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default HierarchyView;