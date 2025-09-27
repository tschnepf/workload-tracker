/**
 * RoleForm Component - Add/edit role form with autocomplete name field
 * Phase 2.3: Follows AUTOCOMPLETE STANDARDS
 */

import React, { useState, useEffect } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { Role } from '@/types/models';
import { rolesApi } from '@/services/api';

interface RoleFormProps {
  role: Role | null; // null for create, Role object for edit
  onSave: () => void;
  onCancel: () => void;
}

const RoleForm: React.FC<RoleFormProps> = ({ role, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Autocomplete state for name field - CRITICAL: follows AUTOCOMPLETE STANDARDS
  const [existingRoles, setExistingRoles] = useState<Role[]>([]);
  const [nameInputValue, setNameInputValue] = useState('');
  const [showNameAutocomplete, setShowNameAutocomplete] = useState(false);
  const [filteredRoles, setFilteredRoles] = useState<Role[]>([]);
  const [selectedRoleIndex, setSelectedRoleIndex] = useState(-1);

  useAuthenticatedEffect(() => {
    // Initialize form data
    if (role) {
      setFormData({
        name: role.name || '',
        description: role.description || '',
        isActive: role.isActive ?? true,
      });
      setNameInputValue(role.name || '');
    } else {
      setFormData({
        name: '',
        description: '',
        isActive: true,
      });
      setNameInputValue('');
    }
    
    // Load existing roles for autocomplete
    loadExistingRoles();
  }, [role]);

  // Filter roles for autocomplete
  useEffect(() => {
    if (nameInputValue.trim() === '') {
      setFilteredRoles([]);
      setShowNameAutocomplete(false);
      return;
    }

    const filtered = existingRoles
      .filter(r => 
        r.name.toLowerCase().includes(nameInputValue.toLowerCase()) &&
        r.id !== role?.id // Don't suggest the role we're currently editing
      )
      .slice(0, 5); // Limit to 5 suggestions

    setFilteredRoles(filtered);
    setSelectedRoleIndex(-1);
  }, [nameInputValue, existingRoles, role?.id]);

  const loadExistingRoles = async () => {
    try {
      const page = await rolesApi.list();
      setExistingRoles(page.results || []);
    } catch (err) {
      console.error('Error loading existing roles:', err);
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Role name is required';
    } else if (formData.name.trim().length < 2) {
      errors.name = 'Role name must be at least 2 characters';
    } else if (formData.name.trim().length > 100) {
      errors.name = 'Role name cannot exceed 100 characters';
    }

    // Check for duplicate names (case-insensitive)
    const isDuplicate = existingRoles.some(r => 
      r.name.toLowerCase() === formData.name.trim().toLowerCase() &&
      r.id !== role?.id
    );
    if (isDuplicate) {
      errors.name = 'A role with this name already exists';
    }

    if (formData.description && formData.description.length > 500) {
      errors.description = 'Description cannot exceed 500 characters';
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

      const roleData = {
        name: formData.name.trim(),
        description: formData.description.trim() || '',
        isActive: formData.isActive,
      };

      if (role) {
        // Update existing role
        await rolesApi.update(role.id, roleData);
      } else {
        // Create new role
        await rolesApi.create(roleData);
      }

      onSave();
    } catch (err: any) {
      setError(`Failed to ${role ? 'update' : 'create'} role: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Keyboard navigation for autocomplete - CRITICAL: follows AUTOCOMPLETE STANDARDS
  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (!showNameAutocomplete || filteredRoles.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedRoleIndex(prev => prev < filteredRoles.length - 1 ? prev + 1 : 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedRoleIndex(prev => prev > 0 ? prev - 1 : filteredRoles.length - 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedRoleIndex >= 0 && selectedRoleIndex < filteredRoles.length) {
          selectRoleName(filteredRoles[selectedRoleIndex].name);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowNameAutocomplete(false);
        setSelectedRoleIndex(-1);
        break;
    }
  };

  const selectRoleName = (roleName: string) => {
    setNameInputValue(roleName);
    setFormData(prev => ({ ...prev, name: roleName }));
    setShowNameAutocomplete(false);
    setSelectedRoleIndex(-1);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNameInputValue(value);
    setFormData(prev => ({ ...prev, name: value }));
    
    // Clear validation error when user starts typing
    if (validationErrors.name) {
      setValidationErrors(prev => ({ ...prev, name: '' }));
    }

    // Show autocomplete if there are filtered results
    setShowNameAutocomplete(filteredRoles.length > 0);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text)]">
            {role ? 'Edit Role' : 'Add New Role'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {/* Role Name Field with Autocomplete */}
          <div className="relative">
            <label className="block text-sm font-medium text-[var(--text)] mb-2">
              Role Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={nameInputValue}
              onChange={handleNameChange}
              onKeyDown={handleNameKeyDown}
              onFocus={() => {
                if (filteredRoles.length > 0) {
                  setShowNameAutocomplete(true);
                }
              }}
              onBlur={() => {
                // Delay hiding to allow click on dropdown items
                setTimeout(() => {
                  setShowNameAutocomplete(false);
                }, 150);
              }}
              className={`w-full px-3 py-2 bg-[var(--card)] border rounded text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] focus:border-transparent ${
                validationErrors.name ? 'border-red-500' : 'border-[var(--border)]'
              }`}
              placeholder="e.g., Senior Engineer, Product Manager"
              disabled={loading}
            />
            
            {/* Name Autocomplete Dropdown */}
            {showNameAutocomplete && filteredRoles.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg z-50 max-h-40 overflow-y-auto">
                {filteredRoles.map((role, index) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => selectRoleName(role.name)}
                    onMouseEnter={() => setSelectedRoleIndex(index)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors border-b border-[var(--border)] last:border-b-0 ${
                      selectedRoleIndex === index
                        ? 'bg-[var(--surfaceOverlay)] text-[var(--primary)] border-[var(--primary)]/30'
                        : 'text-[var(--text)] hover:bg-[var(--cardHover)]'
                    }`}
                  >
                    {role.name}
                  </button>
                ))}
              </div>
            )}
            
            {validationErrors.name && (
              <p className="mt-1 text-sm text-red-400">{validationErrors.name}</p>
            )}
          </div>

          {/* Description Field */}
          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, description: e.target.value }));
                if (validationErrors.description) {
                  setValidationErrors(prev => ({ ...prev, description: '' }));
                }
              }}
              className={`w-full px-3 py-2 bg-[var(--card)] border rounded text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] focus:border-transparent resize-none ${
                validationErrors.description ? 'border-red-500' : 'border-[var(--border)]'
              }`}
              placeholder="Describe the role's responsibilities and requirements"
              rows={3}
              disabled={loading}
            />
            {validationErrors.description && (
              <p className="mt-1 text-sm text-red-400">{validationErrors.description}</p>
            )}
          </div>

          {/* Active Status */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
              className="mr-3 h-4 w-4 text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--border)] rounded bg-[var(--card)]"
              disabled={loading}
            />
            <label htmlFor="isActive" className="text-sm text-[var(--text)]">
              Role is active and available for assignment
            </label>
          </div>
        </form>

        {/* Form Actions */}
        <div className="px-6 py-4 border-t border-[var(--border)] flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-[var(--muted)] border border-[var(--border)] rounded hover:bg-[var(--surfaceHover)] transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 bg-[var(--primary)] hover:bg-[var(--primaryHover)] text-white rounded font-medium transition-colors disabled:opacity-50"
            disabled={loading}
          >
            {loading ? (role ? 'Updating...' : 'Creating...') : (role ? 'Update Role' : 'Create Role')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoleForm;

