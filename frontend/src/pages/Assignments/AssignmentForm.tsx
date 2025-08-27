/**
 * Assignment Form - Create/Edit assignment with 12-week hour planning
 * RETROFIT: Changed from percentage to hours-per-week with 12-week timeline
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Assignment, Person } from '@/types/models';
import { assignmentsApi, peopleApi } from '@/services/api';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';

interface WeeklyHours {
  [weekKey: string]: number;
}

interface AssignmentFormData {
  person: number | '';
  projectName: string;
  weeklyHours: WeeklyHours;
}

// Helper function to get the next 12 weeks starting from current week (Sunday)
const getNext12Weeks = (): string[] => {
  const today = new Date();
  const currentSunday = new Date(today);
  currentSunday.setDate(today.getDate() - ((today.getDay()) % 7));
  
  const weeks: string[] = [];
  for (let i = 0; i < 12; i++) {
    const weekDate = new Date(currentSunday);
    weekDate.setDate(currentSunday.getDate() + (i * 7));
    weeks.push(weekDate.toISOString().split('T')[0]); // YYYY-MM-DD format
  }
  return weeks;
};

// Helper function to format week display
const formatWeekDisplay = (weekKey: string): string => {
  const date = new Date(weekKey + 'T00:00:00');
  const endDate = new Date(date);
  endDate.setDate(date.getDate() + 6);
  
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${date.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
};

const AssignmentForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;

  const [people, setPeople] = useState<Person[]>([]);
  const [availableWeeks] = useState<string[]>(getNext12Weeks());
  const [formData, setFormData] = useState<AssignmentFormData>({
    person: '',
    projectName: '',
    weeklyHours: {},
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [bulkHours, setBulkHours] = useState<number>(0);

  useEffect(() => {
    loadPeople();
    if (isEditing && id) {
      // Note: For simplicity in Chunk 3, we're not implementing edit mode
      // This would require a get assignment endpoint
    }
  }, [isEditing, id]);

  const loadPeople = async () => {
    try {
      const response = await peopleApi.list();
      setPeople(response.results || []);
    } catch (err: any) {
      setError('Failed to load people list');
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.person) {
      errors.person = 'Please select a person';
    }

    if (!formData.projectName.trim()) {
      errors.projectName = 'Project name is required';
    }

    // Validate weekly hours
    const totalHours = Object.values(formData.weeklyHours).reduce((sum, hours) => sum + hours, 0);
    if (totalHours === 0) {
      errors.weeklyHours = 'Please allocate at least some hours per week';
    }

    // Check if any week exceeds person capacity
    if (formData.person) {
      const selectedPerson = people.find(p => p.id === formData.person);
      if (selectedPerson) {
        for (const [week, hours] of Object.entries(formData.weeklyHours)) {
          if (hours > selectedPerson.weeklyCapacity) {
            errors[`week_${week}`] = `Hours for week ${formatWeekDisplay(week)} exceed capacity (${selectedPerson.weeklyCapacity}h)`;
          }
        }
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

    try {
      setLoading(true);
      setError(null);

      const assignmentData = {
        person: Number(formData.person),
        projectName: formData.projectName.trim(),
        weeklyHours: formData.weeklyHours,
      };

      if (isEditing && id) {
        await assignmentsApi.update(parseInt(id), assignmentData);
      } else {
        await assignmentsApi.create(assignmentData);
      }

      navigate('/assignments');
    } catch (err: any) {
      setError(err.message || `Failed to ${isEditing ? 'update' : 'create'} assignment`);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof AssignmentFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleWeeklyHoursChange = (weekKey: string, hours: number) => {
    setFormData(prev => ({
      ...prev,
      weeklyHours: {
        ...prev.weeklyHours,
        [weekKey]: Math.max(0, hours)
      }
    }));

    // Clear week-specific validation errors
    const weekErrorKey = `week_${weekKey}`;
    if (validationErrors[weekErrorKey]) {
      setValidationErrors(prev => ({ ...prev, [weekErrorKey]: '', weeklyHours: '' }));
    }
  };

  const handleBulkSet = () => {
    if (bulkHours >= 0) {
      const newWeeklyHours: WeeklyHours = {};
      availableWeeks.forEach(week => {
        newWeeklyHours[week] = bulkHours;
      });
      setFormData(prev => ({ ...prev, weeklyHours: newWeeklyHours }));
    }
  };

  const getTotalHours = (): number => {
    return Object.values(formData.weeklyHours).reduce((sum, hours) => sum + hours, 0);
  };

  const getSelectedPersonCapacity = (): number => {
    if (!formData.person) return 0;
    const selectedPerson = people.find(p => p.id === formData.person);
    return selectedPerson?.weeklyCapacity || 0;
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-50">
            {isEditing ? 'Edit Assignment' : 'Create New Assignment'}
          </h1>
          <p className="text-slate-400 mt-1">
            Assign a team member to a project with weekly hour allocations for the next 12 weeks
          </p>
          {formData.person && (
            <div className="mt-2 text-sm text-slate-300">
              Total hours: <span className="font-semibold text-blue-400">{getTotalHours()}h</span>
              {' • '}
              Selected person capacity: <span className="font-semibold text-green-400">{getSelectedPersonCapacity()}h/week</span>
            </div>
          )}
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
            
            {/* Person Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                Person <span className="text-red-400">*</span>
              </label>
              <select
                value={formData.person}
                onChange={(e) => handleChange('person', e.target.value)}
                className="w-full px-3 py-2 rounded-md border text-sm transition-colors bg-slate-700 border-slate-600 text-slate-50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">Select a person...</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} ({person.weeklyCapacity}h capacity)
                  </option>
                ))}
              </select>
              {validationErrors.person && (
                <p className="text-sm text-red-400 mt-1">{validationErrors.person}</p>
              )}
            </div>

            {/* Project Name */}
            <div>
              <Input
                label="Project Name"
                name="projectName"
                value={formData.projectName}
                onChange={(e) => handleChange('projectName', e.target.value)}
                placeholder="e.g., Website Redesign, Mobile App"
                required
                error={validationErrors.projectName}
                className="bg-slate-700 border-slate-600 text-slate-50"
              />
              <p className="text-slate-400 text-sm mt-1">
                Enter the name of the project or initiative
              </p>
            </div>

            {/* Bulk Hours Setter */}
            <div className="bg-slate-700/50 p-4 rounded-lg border border-slate-600">
              <label className="block text-sm font-medium text-slate-200 mb-2">
                Quick Set All Weeks
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={bulkHours}
                  onChange={(e) => setBulkHours(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="px-3 py-1 rounded border text-sm bg-slate-600 border-slate-500 text-slate-50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none w-20"
                  placeholder="0"
                />
                <span className="text-slate-300 text-sm">hours per week</span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBulkSet}
                  className="text-blue-400 hover:text-blue-300 px-3 py-1"
                >
                  Apply to All
                </Button>
              </div>
              <p className="text-slate-400 text-xs mt-1">
                Set the same hours for all 12 weeks, then adjust individual weeks as needed
              </p>
            </div>

            {/* Weekly Hours Grid */}
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-3">
                Weekly Hours Allocation <span className="text-red-400">*</span>
              </label>
              
              {validationErrors.weeklyHours && (
                <p className="text-sm text-red-400 mb-3">{validationErrors.weeklyHours}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {availableWeeks.map((weekKey) => {
                  const weekError = validationErrors[`week_${weekKey}`];
                  const currentHours = formData.weeklyHours[weekKey] || 0;
                  const capacity = getSelectedPersonCapacity();
                  const isOverCapacity = capacity > 0 && currentHours > capacity;
                  
                  return (
                    <div
                      key={weekKey}
                      className={`p-3 rounded-lg border ${
                        isOverCapacity 
                          ? 'bg-red-500/20 border-red-500/50' 
                          : 'bg-slate-700 border-slate-600'
                      }`}
                    >
                      <div className="text-xs text-slate-300 mb-1">
                        {formatWeekDisplay(weekKey)}
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={currentHours}
                          onChange={(e) => handleWeeklyHoursChange(weekKey, parseFloat(e.target.value) || 0)}
                          className={`w-full px-2 py-1 text-sm rounded border ${
                            isOverCapacity
                              ? 'bg-red-900/50 border-red-500 text-red-300'
                              : 'bg-slate-600 border-slate-500 text-slate-50'
                          } focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none`}
                          placeholder="0"
                        />
                        <span className="text-xs text-slate-400">h</span>
                      </div>
                      {weekError && (
                        <p className="text-xs text-red-400 mt-1">{weekError}</p>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <p className="text-slate-400 text-sm mt-2">
                Enter hours per week for each of the next 12 weeks. Red highlighting indicates hours exceed the person's capacity.
              </p>
            </div>

            {/* Form Actions */}
            <div className="flex justify-between pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate('/assignments')}
                disabled={loading}
              >
                Cancel
              </Button>
              
              <Button
                type="submit"
                variant="primary"
                disabled={loading}
              >
                {loading ? 'Saving...' : (isEditing ? 'Update Assignment' : 'Create Assignment')}
              </Button>
            </div>

          </form>
        </Card>
      </div>
    </Layout>
  );
};

export default AssignmentForm;