/**
 * Department Form - Create/Edit department modal with VSCode dark theme
 * Following PersonForm.tsx structure with proper field mapping
 */

import React, { useState, useEffect } from 'react';
import { Department, Person } from '@/types/models';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';

interface DepartmentFormData {
  name: string;
  shortName: string;
  parentDepartment: number | null;
  manager: number | null;
  description: string;
  isActive: boolean;
}

interface DepartmentFormProps {
  department?: Department | null;
  departments: Department[];
  people: Person[];
  onSave: (formData: Partial<Department>) => Promise<void>;
  onCancel: () => void;
}

const DepartmentForm: React.FC<DepartmentFormProps> = ({
  department,
  departments,
  people,
  onSave,
  onCancel,
}) => {
  const isEditing = !!department;

  const [formData, setFormData] = useState<DepartmentFormData>({
    name: '',
    shortName: '',
    parentDepartment: null,
    manager: null,
    description: '',
    isActive: true,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (department) {
      setFormData({
        name: department.name,
        shortName: department.shortName || '',
        parentDepartment: department.parentDepartment,
        manager: department.manager,
        description: department.description || '',
        isActive: department.isActive !== false,
      });
    } else {
      setFormData({
        name: '',
        shortName: '',
        parentDepartment: null,
        manager: null,
        description: '',
        isActive: true,
      });
    }
  }, [department]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Department name is required';
    }
    if (formData.shortName && formData.shortName.length > 32) {
      errors.shortName = 'Short name must be 32 characters or less';
    }

    // Enhanced circular parent department validation
    if (formData.parentDepartment === department?.id) {
      errors.parentDepartment = 'Department cannot be its own parent';
    } else if (formData.parentDepartment && department?.id) {
      // Check for indirect circular references by walking up the hierarchy
      const checkCircularReference = (parentId: number, visitedIds: Set<number> = new Set()): boolean => {
        if (visitedIds.has(parentId)) return true; // Circular reference detected
        if (visitedIds.size > 10) return true; // Prevent infinite recursion
        
        const parentDept = departments.find(d => d.id === parentId);
        if (!parentDept || !parentDept.parentDepartment) return false;
        
        visitedIds.add(parentId);
        return checkCircularReference(parentDept.parentDepartment, visitedIds);
      };
      
      // Check if setting this parent would create a cycle
      if (checkCircularReference(formData.parentDepartment)) {
        errors.parentDepartment = 'This parent selection would create a circular hierarchy';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const updateData = {
        name: formData.name.trim(),
        shortName: formData.shortName.trim(),
        parentDepartment: formData.parentDepartment,
        manager: formData.manager,
        description: formData.description.trim(),
        isActive: formData.isActive,
      };

      await onSave(updateData);
    } catch (err: any) {
      setError(err.message || 'Failed to save department');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof DepartmentFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  // Filter departments to exclude current department from parent options
  const parentDepartmentOptions = departments.filter(dept => dept.id !== department?.id);

  return (
    <div className="fixed inset-0 bg-[var(--surfaceOverlay)] flex items-center justify-center z-50">
      <Card className="w-full max-w-lg bg-[var(--card)] border-[var(--border)] max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-[var(--text)]">
              {isEditing ? 'Edit Department' : 'Add Department'}
            </h2>
            <button
              onClick={onCancel}
              className="text-[var(--muted)] hover:text-[var(--text)] text-xl"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-900/30 border border-red-600 rounded text-red-400">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">
                Department Name *
              </label>
              <Input
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g. Engineering"
                className={`w-full ${validationErrors.name ? 'border-red-600' : ''}`}
                disabled={loading}
              />
              {validationErrors.name && (
                <p className="mt-1 text-sm text-red-400">{validationErrors.name}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">
                Short Name / Alias
              </label>
              <Input
                value={formData.shortName}
                onChange={(e) => handleInputChange('shortName', e.target.value)}
                placeholder="e.g. Elec"
                className={`w-full ${validationErrors.shortName ? 'border-red-600' : ''}`}
                disabled={loading}
              />
              {validationErrors.shortName && (
                <p className="mt-1 text-sm text-red-400">{validationErrors.shortName}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">
                Parent Department
              </label>
              <select
                value={formData.parentDepartment || ''}
                onChange={(e) => handleInputChange('parentDepartment', e.target.value ? parseInt(e.target.value) : null)}
                className={`w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-md text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] focus:border-transparent min-h-[44px] ${
                  validationErrors.parentDepartment ? 'border-red-600' : ''
                }`}
                disabled={loading}
              >
                <option value="">None (Top Level)</option>
                {parentDepartmentOptions.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
              {validationErrors.parentDepartment && (
                <p className="mt-1 text-sm text-red-400">{validationErrors.parentDepartment}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">
                Manager
              </label>
              <select
                value={formData.manager || ''}
                onChange={(e) => handleInputChange('manager', e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-md text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] focus:border-transparent min-h-[44px]"
                disabled={loading}
              >
                <option value="">None Assigned</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Brief description of the department's purpose..."
                rows={3}
                className="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-md text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] focus:border-transparent resize-none"
                disabled={loading}
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => handleInputChange('isActive', e.target.checked)}
                className="mr-2 w-4 h-4 text-[var(--primary)] bg-[var(--surface)] border-[var(--border)] rounded focus:ring-[var(--focus)] focus:ring-2"
                disabled={loading}
              />
              <label htmlFor="isActive" className="text-sm text-[var(--text)]">
                Department is active
              </label>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={loading}
              >
                {loading ? 'Saving...' : (isEditing ? 'Update' : 'Create')}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
};

export default DepartmentForm;
