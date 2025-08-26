/**
 * Person Form - Create/Edit person with dark mode styling
 * Chunk 2: Only name + weeklyCapacity fields (progressive usage strategy)
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Person } from '@/types/models';
import { peopleApi } from '@/services/api';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';

interface PersonFormData {
  name: string;
  weeklyCapacity: number;
}

const PersonForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;

  const [formData, setFormData] = useState<PersonFormData>({
    name: '',
    weeklyCapacity: 36, // Default from master guide
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isEditing && id) {
      loadPerson(parseInt(id));
    }
  }, [isEditing, id]);

  const loadPerson = async (personId: number) => {
    try {
      setLoading(true);
      const person = await peopleApi.get(personId);
      setFormData({
        name: person.name,
        weeklyCapacity: person.weeklyCapacity || 36,
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

  const handleChange = (field: keyof PersonFormData, value: string | number) => {
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
        <h1 className="text-2xl font-bold text-slate-50">
          {isEditing ? 'Edit Person' : 'Add New Person'}
        </h1>
        <p className="text-slate-400 mt-1">
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
      <Card className="bg-slate-800 border-slate-700 p-6">
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
              className="bg-slate-700 border-slate-600 text-slate-50"
            />
            <p className="text-slate-400 text-sm mt-1">
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
              className="bg-slate-700 border-slate-600 text-slate-50"
            />
            <p className="text-slate-400 text-sm mt-1">
              Typical full-time: 40h, Part-time: 20h, Contractor: 36h
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