/**
 * Project Form - Create/Edit project with VSCode dark theme
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Project } from '@/types/models';
import { projectsApi } from '@/services/api';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';

const ProjectForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;

  const [formData, setFormData] = useState<Partial<Project>>({
    name: '',
    status: 'active',
    client: 'Internal',
    description: '',
    startDate: '',
    endDate: '',
    estimatedHours: undefined,
    projectNumber: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isEditing && id) {
      loadProject();
    }
  }, [isEditing, id]);

  const loadProject = async () => {
    try {
      setLoading(true);
      const project = await projectsApi.get(parseInt(id!));
      setFormData(project);
    } catch (err: any) {
      setError('Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      errors.name = 'Project name is required';
    }

    if (!formData.client?.trim()) {
      errors.client = 'Client is required';
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

      const projectData = {
        ...formData,
        name: formData.name?.trim(),
        client: formData.client?.trim(),
        description: formData.description?.trim(),
        estimatedHours: formData.estimatedHours || undefined,
      };

      if (isEditing && id) {
        await projectsApi.update(parseInt(id), projectData);
      } else {
        await projectsApi.create(projectData as Omit<Project, 'id' | 'createdAt' | 'updatedAt'>);
      }

      navigate('/projects');
    } catch (err: any) {
      setError(err.message || `Failed to ${isEditing ? 'update' : 'create'} project`);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof Project, value: any) => {
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
            {isEditing ? 'Edit Project' : 'Create New Project'}
          </h1>
          <p className="text-[#969696] mt-1">
            {isEditing ? 'Update project information' : 'Add a new project to track assignments'}
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
            
            {/* Project Name */}
            <div>
              <Input
                label="Project Name"
                name="name"
                value={formData.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g., Website Redesign, Mobile App"
                required
                error={validationErrors.name}
                className="bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]"
              />
            </div>

            {/* Client */}
            <div>
              <Input
                label="Client"
                name="client"
                value={formData.client || ''}
                onChange={(e) => handleChange('client', e.target.value)}
                placeholder="e.g., Acme Corp, Internal"
                required
                error={validationErrors.client}
                className="bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-[#cccccc] mb-2">
                Status
              </label>
              <select
                value={formData.status || 'active'}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full px-3 py-2 rounded-md border text-sm transition-colors bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="active_ca">Active CA</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-[#cccccc] mb-2">
                Description
              </label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 rounded-md border text-sm transition-colors bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] placeholder-[#969696] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
                placeholder="Brief description of the project"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Start Date */}
              <div>
                <Input
                  label="Start Date"
                  name="startDate"
                  type="date"
                  value={formData.startDate || ''}
                  onChange={(e) => handleChange('startDate', e.target.value)}
                  className="bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]"
                />
              </div>

              {/* End Date */}
              <div>
                <Input
                  label="End Date"
                  name="endDate"
                  type="date"
                  value={formData.endDate || ''}
                  onChange={(e) => handleChange('endDate', e.target.value)}
                  className="bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Estimated Hours */}
              <div>
                <Input
                  label="Estimated Hours"
                  name="estimatedHours"
                  type="number"
                  min="0"
                  step="1"
                  value={formData.estimatedHours || ''}
                  onChange={(e) => handleChange('estimatedHours', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="Total project hours"
                  className="bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]"
                />
              </div>

              {/* Project Number */}
              <div>
                <Input
                  label="Project Number"
                  name="projectNumber"
                  value={formData.projectNumber || ''}
                  onChange={(e) => handleChange('projectNumber', e.target.value)}
                  placeholder="e.g., PRJ-2024-001"
                  className="bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]"
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-between pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate('/projects')}
                disabled={loading}
              >
                Cancel
              </Button>
              
              <Button
                type="submit"
                variant="primary"
                disabled={loading}
              >
                {loading ? 'Saving...' : (isEditing ? 'Update Project' : 'Create Project')}
              </Button>
            </div>

          </form>
        </Card>
      </div>
    </Layout>
  );
};

export default ProjectForm;