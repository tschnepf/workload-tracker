/**
 * Person Form - Create/Edit person with dark mode styling
 * Chunk 2: Only name + weeklyCapacity fields (progressive usage strategy)
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Person, Department } from '@/types/models';
import { peopleApi, departmentsApi } from '@/services/api';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';

interface PersonFormData {
  name: string;
  weeklyCapacity: number;
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
    department: null, // Phase 2: No department initially
    location: '', // Location can be empty initially
  });

  const [departments, setDepartments] = useState<Department[]>([]); // Phase 2: Department list
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadDepartments(); // Phase 2: Always load departments
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
      console.error('Error loading departments:', err);
    }
  };

  const loadPerson = async (personId: number) => {
    try {
      setLoading(true);
      const person = await peopleApi.get(personId);
      setFormData({
        name: person.name,
        weeklyCapacity: person.weeklyCapacity || 36,
        department: person.department || null, // Phase 2: Load department
        location: person.location || '', // Load location
      });
    } catch (err: any) {
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

      if (isEditing && id) {
        await peopleApi.update(parseInt(id), formData);
      } else {
        await peopleApi.create(formData);
      }

      navigate('/people');
    } catch (err: any) {
      setError(err.message || `Failed to ${isEditing ? 'update' : 'create'} person`);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof PersonFormData, value: string | number | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
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
          <div className="text-red-400">{error}</div>
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

          {/* Department Field - Phase 2 */}
          <div>
            <label className="block text-sm font-medium text-[#cccccc] mb-2">
              Department
            </label>
            <select
              value={formData.department || ''}
              onChange={(e) => handleChange('department', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2 bg-[#3e3e42] border border-[#3e3e42] rounded-md text-[#cccccc] focus:outline-none focus:ring-2 focus:ring-[#007acc] focus:border-transparent"
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
    </Layout>
  );
};

export default PersonForm;