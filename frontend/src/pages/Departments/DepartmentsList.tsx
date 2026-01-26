/**
 * Departments List - Department management interface
 * Following PeopleList.tsx structure with VSCode dark theme
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { Department, Person } from '@/types/models';
import { departmentsApi, peopleApi } from '@/services/api';
import Layout from '@/components/layout/Layout';
import DepartmentsSkeleton from '@/components/skeletons/DepartmentsSkeleton';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import DepartmentForm from './DepartmentForm';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { emitDepartmentsRefresh, subscribeDepartmentsRefresh } from '@/lib/departmentsRefreshBus';

const DepartmentsList: React.FC = () => {
  const isMobileLayout = useMediaQuery('(max-width: 1023px)');
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
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const loadingRef = useRef(false);
  const suppressNextRefreshRef = useRef(false);

  const loadDepartments = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      setLoading(true);
      const response = await departmentsApi.list();
      setDepartments(response.results || []);
    } catch (err: any) {
      setError('Failed to load departments');
      console.error('Error loading departments:', err);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  const loadPeople = useCallback(async () => {
    try {
      const response = await peopleApi.list();
      setPeople(response.results || []);
    } catch (err) {
      console.error('Error loading people:', err);
    }
  }, []);

  useAuthenticatedEffect(() => {
    loadDepartments();
    loadPeople();
  }, [loadDepartments, loadPeople]);

  // Filter and sort departments
  const filteredAndSortedDepartments = useMemo(() => {
    const filtered = departments.filter(dept =>
      dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (dept.shortName && dept.shortName.toLowerCase().includes(searchTerm.toLowerCase())) ||
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

  useEffect(() => {
    const unsubscribe = subscribeDepartmentsRefresh(() => {
      if (suppressNextRefreshRef.current) {
        suppressNextRefreshRef.current = false;
        return;
      }
      if (loadingRef.current) return;
      loadDepartments();
    });
    return unsubscribe;
  }, [loadDepartments]);

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

      suppressNextRefreshRef.current = true;
      emitDepartmentsRefresh({
        departmentId: savedDepartment.id,
        reason: editingDepartment?.id ? 'updated' : 'created',
      });
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
      suppressNextRefreshRef.current = true;
      emitDepartmentsRefresh({ departmentId: department.id, reason: 'deleted' });
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

  const desktopView = (
    <div className="h-full min-h-0 flex bg-[var(--bg)]">
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full min-h-0">
          {/* Left Panel - Department List */}
          <div className="w-1/3 p-6 border-r border-[var(--border)] bg-[var(--surface)] min-h-0 overflow-y-auto">
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold text-[var(--text)]">Departments</h1>
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
                  className={`p-4 cursor-pointer transition-colors bg-[var(--card)] border-[var(--border)] hover:bg-[var(--surfaceHover)] ${
                    selectedDepartment?.id === department.id ? 'ring-2 ring-[var(--focus)]' : ''
                  }`}
                  onClick={() => {
                    setSelectedDepartment(department);
                    setSelectedIndex(index);
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-semibold text-[var(--text)] mb-1">
                        {department.name}
                      </h3>
                      {department.shortName && (
                        <p className="text-xs text-[var(--muted)] mb-1">
                          Alias: {department.shortName}
                        </p>
                      )}
                      <p className="text-sm text-[var(--muted)] mb-2">
                        Manager: {department.managerName || 'None'}
                      </p>
                      {department.description && (
                        <p className="text-sm text-[var(--muted)] line-clamp-2">
                          {department.description}
                        </p>
                      )}
                      {department.parentDepartment && (
                        <p className="text-xs text-[var(--muted)] mt-1">
                          Parent: {getParentDepartmentName(department.parentDepartment)}
                        </p>
                      )}
                    </div>
                    <div className="ml-4">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          department.isActive
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {department.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}

              {filteredAndSortedDepartments.length === 0 && (
                <div className="text-center py-8 text-[var(--muted)]">
                  {searchTerm ? 'No departments match your search.' : 'No departments found.'}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Department Details */}
          <div className="flex-1 p-6 bg-[var(--bg)] min-h-0 overflow-y-auto">
            {selectedDepartment ? (
              <DepartmentDetails
                department={selectedDepartment}
                onEdit={() => handleEditDepartment(selectedDepartment)}
                onDelete={() => handleDeleteDepartment(selectedDepartment)}
                getParentDepartmentName={getParentDepartmentName}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--muted)]">
                <div className="text-center">
                  <h3 className="text-xl mb-2">Select a Department</h3>
                  <p>Choose a department from the list to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const mobileListView = (
    <div className="h-full min-h-0 flex flex-col bg-[var(--bg)]">
      {/* Sticky header with search + actions */}
      <div className="sticky top-0 z-[10] bg-[var(--bg)] border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-[var(--text)]">Departments</h1>
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreateDepartment}
          >
            Add
          </Button>
        </div>
        <Input
          placeholder="Search departments..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full"
        />
        {error && (
          <div className="mt-2 p-2 bg-red-900/30 border border-red-600 rounded text-xs text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {filteredAndSortedDepartments.map((department, index) => {
          const isSelected = selectedDepartment?.id === department.id;
          return (
            <button
              key={department.id}
              type="button"
              className={`w-full text-left bg-[var(--card)] border border-[var(--border)] rounded-lg px-4 py-3 flex items-center justify-between gap-3 ${
                isSelected ? 'ring-1 ring-[var(--focus)]' : ''
              }`}
              onClick={() => {
                setSelectedDepartment(department);
                setSelectedIndex(index);
                setMobileDetailOpen(true);
              }}
            >
              <div className="min-w-0">
                <div className="font-medium text-[var(--text)] truncate">
                  {department.name}
                </div>
                {department.shortName && (
                  <div className="text-[10px] text-[var(--muted)] truncate">
                    Alias: {department.shortName}
                  </div>
                )}
                <div className="text-xs text-[var(--muted)] truncate">
                  Manager: {department.managerName || 'None'}
                </div>
                {department.parentDepartment && (
                  <div className="text-xs text-[var(--muted)] truncate">
                    Parent: {getParentDepartmentName(department.parentDepartment)}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span
                  className={`px-2 py-1 rounded text-[10px] ${
                    department.isActive
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {department.isActive ? 'Active' : 'Inactive'}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditDepartment(department);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteDepartment(department);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </button>
          );
        })}

        {filteredAndSortedDepartments.length === 0 && (
          <div className="text-center py-8 text-[var(--muted)]">
            {searchTerm ? 'No departments match your search.' : 'No departments found.'}
          </div>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <Layout>
        <DepartmentsSkeleton />
      </Layout>
    );
  }

  return (
    <Layout>
      {isMobileLayout ? mobileListView : desktopView}

      {/* Department Form Modal / Drawer */}
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

      {/* Mobile details drawer */}
      <MobileDepartmentDetailsDrawer
        open={isMobileLayout && mobileDetailOpen && !!selectedDepartment}
        title={selectedDepartment?.name || 'Department details'}
        onClose={() => setMobileDetailOpen(false)}
      >
        {selectedDepartment && (
          <DepartmentDetails
            department={selectedDepartment}
            onEdit={() => handleEditDepartment(selectedDepartment)}
            onDelete={() => handleDeleteDepartment(selectedDepartment)}
            getParentDepartmentName={getParentDepartmentName}
          />
        )}
      </MobileDepartmentDetailsDrawer>
    </Layout>
  );
};

export default DepartmentsList;

const DepartmentDetails: React.FC<{
  department: Department;
  onEdit: () => void;
  onDelete: () => void;
  getParentDepartmentName: (parentId: number | null) => string;
}> = ({ department, onEdit, onDelete, getParentDepartmentName }) => (
  <div>
    <div className="flex justify-between items-start mb-6">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)] mb-2">
          {department.name}
        </h2>
        <div className="flex items-center space-x-4">
          <span
            className={`px-3 py-1 rounded text-sm ${
              department.isActive
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-gray-500/20 text-gray-400'
            }`}
          >
            {department.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>
      <div className="flex space-x-2">
        <Button
          variant="secondary"
          onClick={onEdit}
        >
          Edit
        </Button>
        <Button
          variant="danger"
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      <Card className="p-6 bg-[var(--card)] border-[var(--border)]">
        <h3 className="font-semibold text-[var(--text)] mb-4">Department Info</h3>
        <div className="space-y-3">
          <div>
            <span className="text-sm text-[var(--muted)]">Name:</span>
            <p className="text-[var(--text)]">{department.name}</p>
          </div>
          <div>
            <span className="text-sm text-[var(--muted)]">Alias:</span>
            <p className="text-[var(--text)]">{department.shortName || '—'}</p>
          </div>
          <div>
            <span className="text-sm text-[var(--muted)]">Manager:</span>
            <p className="text-[var(--text)]">{department.managerName || 'None assigned'}</p>
          </div>
          <div>
            <span className="text-sm text-[var(--muted)]">Parent Department:</span>
            <p className="text-[var(--text)]">
              {getParentDepartmentName(department.parentDepartment)}
            </p>
          </div>
          {department.description && (
            <div>
              <span className="text-sm text-[var(--muted)]">Description:</span>
              <p className="text-[var(--text)] mt-1">{department.description}</p>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6 bg-[var(--card)] border-[var(--border)]">
        <h3 className="font-semibold text-[var(--text)] mb-4">System Info</h3>
        <div className="space-y-3">
          <div>
            <span className="text-sm text-[var(--muted)]">Created:</span>
            <p className="text-[var(--text)]">
              {department.createdAt
                ? new Date(department.createdAt).toLocaleDateString()
                : 'Unknown'}
            </p>
          </div>
          <div>
            <span className="text-sm text-[var(--muted)]">Updated:</span>
            <p className="text-[var(--text)]">
              {department.updatedAt
                ? new Date(department.updatedAt).toLocaleDateString()
                : 'Unknown'}
            </p>
          </div>
          <div>
            <span className="text-sm text-[var(--muted)]">Status:</span>
            <p className={department.isActive ? 'text-emerald-400' : 'text-gray-400'}>
              {department.isActive ? 'Active' : 'Inactive'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  </div>
);

const MobileDepartmentDetailsDrawer: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, title, onClose, children }) => {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1150] bg-black/60 flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md h-full bg-[var(--surface)] text-[var(--text)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="text-base font-semibold truncate">{title}</div>
          <button
            type="button"
            className="text-xl text-[var(--muted)]"
            onClick={onClose}
            aria-label="Close department details"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>,
    document.body
  );
};
