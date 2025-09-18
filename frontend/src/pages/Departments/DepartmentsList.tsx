/**
 * Departments List - Department management interface
 * Following PeopleList.tsx structure with VSCode dark theme
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { Department, Person } from '@/types/models';
import { departmentsApi, peopleApi } from '@/services/api';
import Sidebar from '@/components/layout/Sidebar';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import DepartmentForm from './DepartmentForm';

const DepartmentsList: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAutoSelected, setHasAutoSelected] = useState(false); // Track if we've auto-selected

  useAuthenticatedEffect(() => {
    loadDepartments();
    loadPeople();
  }, []);

  // Filter and sort departments
  const filteredAndSortedDepartments = useMemo(() => {
    const filtered = departments.filter(dept =>
      dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (dept.description && dept.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [departments, searchTerm]);

  // Auto-select first department when departments are loaded (per R2-REBUILD-STANDARDS.md)
  // Only auto-select once when departments first load, never override manual selections
  useEffect(() => {
    if (filteredAndSortedDepartments.length > 0 && !selectedDepartment && !hasAutoSelected) {
      setSelectedDepartment(filteredAndSortedDepartments[0]);
      setSelectedIndex(0);
      setHasAutoSelected(true);
    }
  }, [filteredAndSortedDepartments, hasAutoSelected]);

  const loadDepartments = async () => {
    try {
      setLoading(true);
      const response = await departmentsApi.list();
      setDepartments(response.results || []);
    } catch (err: any) {
      setError('Failed to load departments');
      console.error('Error loading departments:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPeople = async () => {
    try {
      const response = await peopleApi.list();
      setPeople(response.results || []);
    } catch (err) {
      console.error('Error loading people:', err);
    }
  };

  const handleCreateDepartment = () => {
    setEditingDepartment(null);
    setShowModal(true);
  };

  const handleEditDepartment = (department: Department) => {
    setEditingDepartment(department);
    setShowModal(true);
  };

  const handleSaveDepartment = async (formData: Partial<Department>) => {
    try {
      
      let savedDepartment: Department;
      if (editingDepartment?.id) {
        savedDepartment = await departmentsApi.update(editingDepartment.id, formData);
      } else {
        savedDepartment = await departmentsApi.create(formData as any);
      }

      // Refresh departments list
      await loadDepartments();
      
      // Select the saved/updated department
      setSelectedDepartment(savedDepartment);
      setShowModal(false);
      setEditingDepartment(null);
    } catch (err: any) {
      console.error('Failed to save department:', err);
      setError(`Failed to save department: ${err.message}`);
    }
  };

  const handleDeleteDepartment = async (department: Department) => {
    if (!department.id) return;
    
    const confirmed = window.confirm(`Are you sure you want to delete "${department.name}"?`);
    if (!confirmed) return;

    try {
      await departmentsApi.delete(department.id);
      await loadDepartments();
      
      // Clear selection if deleted department was selected
      if (selectedDepartment?.id === department.id) {
        setSelectedDepartment(null);
        setSelectedIndex(-1);
      }
    } catch (err: any) {
      setError(`Failed to delete department: ${err.message}`);
      console.error('Error deleting department:', err);
    }
  };

  const getManagerName = (managerId: number | null) => {
    if (!managerId) return 'None';
    const manager = people.find(p => p.id === managerId);
    return manager ? manager.name : 'Unknown';
  };

  const getParentDepartmentName = (parentId: number | null) => {
    if (!parentId) return 'None';
    const parent = departments.find(d => d.id === parentId);
    return parent ? parent.name : 'Unknown';
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-[#1e1e1e]">
        <Sidebar />
        <div className="flex-1 p-8 text-[#cccccc]">
          Loading departments...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#1e1e1e]">
      <Sidebar />
      
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full">
          
          {/* Left Panel - Department List */}
          <div className="w-1/3 p-6 border-r border-[#3e3e42] bg-[#252526]">
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold text-[#cccccc]">Departments</h1>
                <Button 
                  variant="primary" 
                  onClick={handleCreateDepartment}
                >
                  Add Department
                </Button>
              </div>
              
              <Input
                placeholder="Search departments..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-600 rounded text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-3">
              {filteredAndSortedDepartments.map((department, index) => (
                <Card
                  key={department.id}
                  className={`p-4 cursor-pointer transition-colors bg-[#2d2d30] border-[#3e3e42] hover:bg-[#3e3e42]/50 ${
                    selectedDepartment?.id === department.id ? 'ring-2 ring-[#007acc]' : ''
                  }`}
                  onClick={() => {
                    setSelectedDepartment(department);
                    setSelectedIndex(index);
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-semibold text-[#cccccc] mb-1">
                        {department.name}
                      </h3>
                      <p className="text-sm text-[#969696] mb-2">
                        Manager: {department.managerName || 'None'}
                      </p>
                      {department.description && (
                        <p className="text-sm text-[#969696] line-clamp-2">
                          {department.description}
                        </p>
                      )}
                      {department.parentDepartment && (
                        <p className="text-xs text-[#969696] mt-1">
                          Parent: {getParentDepartmentName(department.parentDepartment)}
                        </p>
                      )}
                    </div>
                    <div className="ml-4">
                      <span className={`px-2 py-1 rounded text-xs ${
                        department.isActive 
                          ? 'bg-emerald-500/20 text-emerald-400' 
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {department.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}

              {filteredAndSortedDepartments.length === 0 && (
                <div className="text-center py-8 text-[#969696]">
                  {searchTerm ? 'No departments match your search.' : 'No departments found.'}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Department Details */}
          <div className="flex-1 p-6 bg-[#1e1e1e]">
            {selectedDepartment ? (
              <div>
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-[#cccccc] mb-2">
                      {selectedDepartment.name}
                    </h2>
                    <div className="flex items-center space-x-4">
                      <span className={`px-3 py-1 rounded text-sm ${
                        selectedDepartment.isActive 
                          ? 'bg-emerald-500/20 text-emerald-400' 
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {selectedDepartment.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button 
                      variant="secondary" 
                      onClick={() => handleEditDepartment(selectedDepartment)}
                    >
                      Edit
                    </Button>
                    <Button 
                      variant="danger" 
                      onClick={() => handleDeleteDepartment(selectedDepartment)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <Card className="p-6 bg-[#2d2d30] border-[#3e3e42]">
                    <h3 className="font-semibold text-[#cccccc] mb-4">Department Info</h3>
                    <div className="space-y-3">
                      <div>
                        <span className="text-sm text-[#969696]">Name:</span>
                        <p className="text-[#cccccc]">{selectedDepartment.name}</p>
                      </div>
                      <div>
                        <span className="text-sm text-[#969696]">Manager:</span>
                        <p className="text-[#cccccc]">{selectedDepartment.managerName || 'None assigned'}</p>
                      </div>
                      <div>
                        <span className="text-sm text-[#969696]">Parent Department:</span>
                        <p className="text-[#cccccc]">
                          {getParentDepartmentName(selectedDepartment.parentDepartment)}
                        </p>
                      </div>
                      {selectedDepartment.description && (
                        <div>
                          <span className="text-sm text-[#969696]">Description:</span>
                          <p className="text-[#cccccc] mt-1">{selectedDepartment.description}</p>
                        </div>
                      )}
                    </div>
                  </Card>

                  <Card className="p-6 bg-[#2d2d30] border-[#3e3e42]">
                    <h3 className="font-semibold text-[#cccccc] mb-4">System Info</h3>
                    <div className="space-y-3">
                      <div>
                        <span className="text-sm text-[#969696]">Created:</span>
                        <p className="text-[#cccccc]">
                          {selectedDepartment.createdAt ? 
                            new Date(selectedDepartment.createdAt).toLocaleDateString() : 
                            'Unknown'
                          }
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-[#969696]">Updated:</span>
                        <p className="text-[#cccccc]">
                          {selectedDepartment.updatedAt ? 
                            new Date(selectedDepartment.updatedAt).toLocaleDateString() : 
                            'Unknown'
                          }
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-[#969696]">Status:</span>
                        <p className={selectedDepartment.isActive ? 'text-emerald-400' : 'text-gray-400'}>
                          {selectedDepartment.isActive ? 'Active' : 'Inactive'}
                        </p>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-[#969696]">
                <div className="text-center">
                  <h3 className="text-xl mb-2">Select a Department</h3>
                  <p>Choose a department from the list to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Department Form Modal */}
      {showModal && (
        <DepartmentForm
          department={editingDepartment}
          departments={departments}
          people={people}
          onSave={handleSaveDepartment}
          onCancel={() => {
            setShowModal(false);
            setEditingDepartment(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
};

export default DepartmentsList;
