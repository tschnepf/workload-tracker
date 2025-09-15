/**
 * Person Form - Create/Edit person with dark mode styling
 * Chunk 2: Only name + weeklyCapacity fields (progressive usage strategy)
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Person, Department, Role } from '@/types/models';
import { peopleApi, departmentsApi, rolesApi } from '@/services/api';
import { useUpdatePerson } from '@/hooks/usePeople';
import Toast from '@/components/ui/Toast';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';

interface PersonFormData {
  name: string;
  weeklyCapacity: number;
  role: string; // Core field - job role/title
  department: number | null; // Phase 2: Department assignment
  location: string; // Location field - city/state or remote
}

const PersonForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;

  const [formData, setFormData] = useState<PersonFormData>({
    name: '',
    weeklyCapacity: 36, // Default from master guide
    role: '1', // Default role ID (Engineer) - converts properly to number
    department: null, // Phase 2: No department initially
    location: '', // Location can be empty initially
  });

  const [departments, setDepartments] = useState<Department[]>([]); // Phase 2: Department list
  const [roles, setRoles] = useState<Role[]>([]); // Available roles
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const updatePersonMutation = useUpdatePerson();

  useEffect(() => {
    loadDepartments(); // Phase 2: Always load departments
    loadRoles(); // Load available roles
    if (isEditing && id) {
      loadPerson(parseInt(id));
    }
  }, [isEditing, id]);

  // Phase 2: Load departments for dropdown
  const loadDepartments = async () => {
    try {
      const response = await departmentsApi.list();
      setDepartments(response.results || []);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error loading departments:', err);
    }
  };

  // Load roles for dropdown
  const loadRoles = async () => {
    try {
      const response = await rolesApi.list();
      setRoles(response.results || []);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error loading roles:', err);
    }
  };

  const loadPerson = async (personId: number) => {
    try {
      setLoading(true);
      if (import.meta.env.DEV) console.log('🔍 [DEBUG] Loading person with ID:', personId);
      const person = await peopleApi.get(personId);
      if (import.meta.env.DEV) console.log('🔍 [DEBUG] Person data loaded from API:', person);
      
      const newFormData = {
        name: person.name,
        weeklyCapacity: person.weeklyCapacity || 36,
        role: String(person.role || 1), // Convert role ID to string for form
        department: person.department || null, // Phase 2: Load department
        location: person.location || '', // Load location
      };
      
      if (import.meta.env.DEV) console.log('🔍 [DEBUG] Setting form data to:', newFormData);
      setFormData(newFormData);
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('🔍 [DEBUG] Error loading person:', err);
      setError(err.message || 'Failed to load person');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }

    if (!formData.role.trim()) {
      errors.role = 'Role is required';
    }

    if (formData.weeklyCapacity < 1 || formData.weeklyCapacity > 80) {
      errors.weeklyCapacity = 'Weekly capacity must be between 1 and 80 hours';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Debug logging to see what data is being submitted
      if (import.meta.env.DEV) console.log('🔍 [DEBUG] Form submission data:', {
        isEditing,
        id,
        formData,
        formDataJSON: JSON.stringify(formData, null, 2)
      });

      // Convert form data to API format (role: string → role: number)
      const roleId = parseInt(formData.role) || 1; // Fallback to role ID 1 if invalid
      const apiData = {
        ...formData,
        role: roleId
      };

      if (isEditing && id) {
        if (import.meta.env.DEV) console.log(`[DEBUG] Updating person ${id} with PATCH request`);
        await updatePersonMutation.mutateAsync({ id: parseInt(id), data: apiData });
        setToast({ message: 'Person updated', type: 'success' });
      } else {
        if (import.meta.env.DEV) console.log('🔍 [DEBUG] Creating new person with POST request');
        const result = await peopleApi.create(apiData);
        setToast({ message: 'Person created', type: 'success' });
        if (import.meta.env.DEV) console.log('🔍 [DEBUG] Create API response:', result);
      }

      if (import.meta.env.DEV) console.log('🔍 [DEBUG] API call successful, navigating to /people');
      await new Promise((r) => setTimeout(r, 800));
      navigate('/people');
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('🔍 [DEBUG] API call failed:', {
        error: err,
        message: err.message,
        status: err.status,
        response: err.response
      });
      setError(err.message || `Failed to ${isEditing ? 'update' : 'create'} person`);
      setToast({ message: err.message || 'Failed to save person', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof PersonFormData, value: string | number | null) => {
    if (import.meta.env.DEV) console.log('🔍 [DEBUG] handleChange called:', { field, value, type: typeof value });
    
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      if (import.meta.env.DEV) console.log('🔍 [DEBUG] Updated formData:', newData);
      return newData;
    });
    
    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#cccccc]">
          {isEditing ? 'Edit Person' : 'Add New Person'}
        </h1>
        <p className="text-[#969696] mt-1">
          {isEditing ? 'Update team member information' : 'Add a new team member to track their workload'}
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <Card className="bg-red-500/20 border-red-500/50 p-4 mb-6">
          <div className="text-red-400 font-medium mb-2">Form Error:</div>
          <div className="text-red-300 text-sm">{error}</div>
          <details className="mt-2">
            <summary className="text-red-400 text-xs cursor-pointer">Debug Info</summary>
            <div className="mt-1 text-red-300 text-xs font-mono whitespace-pre-wrap">
              Check browser console for detailed logs
            </div>
          </details>
        </Card>
      )}

      {/* Form */}
      <Card className="bg-[#2d2d30] border-[#3e3e42] p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Name Field */}
          <div>
            <Input
              label="Full Name"
              name="name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Enter full name"
              required
              error={validationErrors.name}
              className="bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]"
            />
            <p className="text-[#969696] text-sm mt-1">
              This will be displayed in reports and assignments
            </p>
          </div>

          {/* Weekly Capacity Field */}
          <div>
            <Input
              label="Weekly Capacity (hours)"
              name="weeklyCapacity"
              type="number"
              inputMode="numeric"
              value={formData.weeklyCapacity}
              onChange={(e) => handleChange('weeklyCapacity', parseInt(e.target.value) || 0)}
              placeholder="36"
              min="1"
              max="80"
              required
              error={validationErrors.weeklyCapacity}
              className="bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]"
            />
            <p className="text-[#969696] text-sm mt-1">
              Typical full-time: 40h, Part-time: 20h, Contractor: 36h
            </p>
          </div>

          {/* Role Field */}
          <div>
            <label className="block text-sm font-medium text-[#cccccc] mb-2">
              Role/Title *
            </label>
            <select
              value={formData.role || ''}
              onChange={(e) => handleChange('role', e.target.value)}
              className="w-full px-3 py-2 bg-[#3e3e42] border border-[#3e3e42] rounded-md text-[#cccccc] focus:outline-none focus:ring-2 focus:ring-[#007acc] focus:border-transparent min-h-[44px]"
              disabled={loading}
              required
            >
              <option value="">Select a role...</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            {validationErrors.role && (
              <p className="text-red-400 text-sm mt-1">{validationErrors.role}</p>
            )}
            <p className="text-[#969696] text-sm mt-1">
              Select the person's role within the organization
            </p>
          </div>

          {/* Department Field - Phase 2 */}
          <div>
            <label className="block text-sm font-medium text-[#cccccc] mb-2">
              Department
            </label>
            <select
              value={formData.department || ''}
              onChange={(e) => handleChange('department', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2 bg-[#3e3e42] border border-[#3e3e42] rounded-md text-[#cccccc] focus:outline-none focus:ring-2 focus:ring-[#007acc] focus:border-transparent min-h-[44px]"
              disabled={loading}
            >
              <option value="">None Assigned</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
            <p className="text-[#969696] text-sm mt-1">
              Assign this person to a department for organizational tracking
            </p>
          </div>

          {/* Location Field */}
          <div>
            <Input
              label="Location"
              name="location"
              value={formData.location}
              onChange={(e) => handleChange('location', e.target.value)}
              placeholder="e.g., New York, NY or Remote"
              className="bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]"
            />
            <p className="text-[#969696] text-sm mt-1">
              City and state, or indicate if remote. Leave blank if not specified.
            </p>
          </div>

          {/* Form Actions */}
          <div className="flex justify-between pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate('/people')}
              disabled={loading}
            >
              Cancel
            </Button>
            
            <Button
              type="submit"
              variant="primary"
              disabled={loading}
            >
              {loading ? 'Saving...' : (isEditing ? 'Update Person' : 'Add Person')}
            </Button>
          </div>

        </form>
      </Card>
      </div>
      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </Layout>
  );
};

export default PersonForm;




