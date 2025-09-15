/**
 * Deliverables Section - STANDARDS COMPLIANT
 * Follows R2-REBUILD-STANDARDS.md and R2-REBUILD-DELIVERABLES.md
 * Integrates into existing Projects page split-panel layout
 * Features drag-and-drop reordering with grab handles
 */

import React, { useState, useEffect } from 'react';
import { formatUtcToLocal } from '@/utils/dates';
import { Project, Deliverable } from '@/types/models';
import { deliverablesApi } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { PROJECT_FILTER_METADATA_KEY } from '@/hooks/useProjectFilterMetadata';

interface DeliverablesSectionProps {
  project: Project;
}

const DeliverablesSection: React.FC<DeliverablesSectionProps> = ({ project }) => {
  const queryClient = useQueryClient();
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (project.id) {
      loadDeliverables();
    }
  }, [project.id]);

  const loadDeliverables = async () => {
    if (!project.id) return;
    
    try {
      setLoading(true);
      setError(null);
      const response = await deliverablesApi.list(project.id);
      setDeliverables(response.results || []);
    } catch (err: any) {
      setError('Failed to load deliverables');
      console.error('Failed to load deliverables:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDeliverable = () => {
    setShowAddForm(true);
  };

  const handleSaveDeliverable = async (deliverableData: Partial<Deliverable>) => {
    if (!project.id) return;

    try {
      await deliverablesApi.create({
        project: project.id,
        ...deliverableData
      });
      await loadDeliverables();
      // Invalidate project filter metadata (future deliverables flags)
      await queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
      setShowAddForm(false);
    } catch (err: any) {
      setError('Failed to create deliverable');
    }
  };

  const handleUpdateDeliverable = async (id: number, deliverableData: Partial<Deliverable>) => {
    try {
      await deliverablesApi.update(id, deliverableData);
      await loadDeliverables();
      await queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
      setEditingId(null);
    } catch (err: any) {
      setError('Failed to update deliverable');
    }
  };

  const handleDeleteDeliverable = async (id: number) => {
    if (!confirm('Are you sure you want to delete this deliverable?')) {
      return;
    }

    try {
      await deliverablesApi.delete(id);
      await loadDeliverables();
      await queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
    } catch (err: any) {
      setError('Failed to delete deliverable');
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newDeliverables = [...deliverables];
    const [draggedItem] = newDeliverables.splice(draggedIndex, 1);
    newDeliverables.splice(dropIndex, 0, draggedItem);

    // Optimistically update UI
    setDeliverables(newDeliverables);
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Update sort order on backend
    try {
      const deliverableIds = newDeliverables.map(d => d.id!);
      await deliverablesApi.reorder(project.id!, deliverableIds);
      await queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
    } catch (err: any) {
      setError('Failed to reorder deliverables');
      // Reload on error to get correct order
      await loadDeliverables();
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="border-t border-[#3e3e42] pt-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-base font-semibold text-[#cccccc]">Deliverables</h3>
        <button
          onClick={handleAddDeliverable}
          className="px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors"
        >
          + Add Deliverable
        </button>
      </div>

      {error && (
        <div className="mb-2 p-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-4 text-[#969696] text-sm">Loading deliverables...</div>
      ) : deliverables.length === 0 && !showAddForm ? (
        <div className="text-center py-8">
          <div className="text-[#969696] text-sm">No deliverables yet</div>
          <div className="text-[#969696] text-xs mt-1">Click "Add Deliverable" to get started</div>
        </div>
      ) : (
        <div className="space-y-1">
          {deliverables.map((deliverable, index) => (
            <DeliverableRow
              key={deliverable.id}
              deliverable={deliverable}
              index={index}
              editing={editingId === deliverable.id}
              isDragged={draggedIndex === index}
              isDraggedOver={dragOverIndex === index}
              onEdit={() => setEditingId(deliverable.id!)}
              onSave={(data) => handleUpdateDeliverable(deliverable.id!, data)}
              onCancel={() => setEditingId(null)}
              onDelete={() => handleDeleteDeliverable(deliverable.id!)}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      {showAddForm && (
        <AddDeliverableForm
          onSave={handleSaveDeliverable}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
};

interface DeliverableRowProps {
  deliverable: Deliverable;
  index: number;
  editing: boolean;
  isDragged: boolean;
  isDraggedOver: boolean;
  onEdit: () => void;
  onSave: (data: Partial<Deliverable>) => void;
  onCancel: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

const DeliverableRow: React.FC<DeliverableRowProps> = ({
  deliverable,
  index,
  editing,
  isDragged,
  isDraggedOver,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}) => {
  const [editData, setEditData] = useState({
    percentage: deliverable.percentage,
    description: deliverable.description || '',
    date: deliverable.date,
    notes: deliverable.notes || '',
    isCompleted: deliverable.isCompleted || false,
  });

  // Update edit data when deliverable changes
  useEffect(() => {
    if (editing) {
      setEditData({
        percentage: deliverable.percentage,
        description: deliverable.description || '',
        date: deliverable.date,
        notes: deliverable.notes || '',
        isCompleted: deliverable.isCompleted || false,
      });
    }
  }, [deliverable, editing]);

  // Create the drag handle component (3-line horizontal grabber)
  const DragHandle = () => (
    <div 
      className="cursor-grab active:cursor-grabbing flex flex-col justify-center items-center w-4 h-4 mr-2"
      onMouseDown={onDragStart}
    >
      <div className="w-3 h-0.5 bg-[#969696] mb-0.5"></div>
      <div className="w-3 h-0.5 bg-[#969696] mb-0.5"></div>
      <div className="w-3 h-0.5 bg-[#969696]"></div>
    </div>
  );

  if (editing) {
    return (
      <div className="p-2 bg-[#3e3e42]/50 rounded border border-[#3e3e42]">
        <div className="grid grid-cols-6 gap-2 items-center text-xs mb-2">
          <div className="text-[#969696] font-medium w-4"></div> {/* Drag handle space */}
          <div className="text-[#969696] font-medium">%</div>
          <div className="text-[#969696] font-medium">DESCRIPTION</div>
          <div className="text-[#969696] font-medium">DATE</div>
          <div className="text-[#969696] font-medium">NOTES</div>
          <div className="text-[#969696] font-medium">ACTIONS</div>
        </div>
        
        <div className="grid grid-cols-6 gap-2 items-start">
          {/* Drag Handle - disabled during edit */}
          <div className="w-4"></div>

          {/* Percentage Input */}
          <input
            type="number"
            min="0"
            max="100"
            value={editData.percentage || ''}
            onChange={(e) => setEditData({
              ...editData,
              percentage: e.target.value ? Number(e.target.value) : null
            })}
            placeholder="%"
            className="px-1 py-0.5 bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] text-xs [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
          />

          {/* Description Input */}
          <input
            type="text"
            value={editData.description}
            onChange={(e) => setEditData({ ...editData, description: e.target.value })}
            placeholder="Description"
            className="px-1 py-0.5 bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] text-xs"
          />

          {/* Date Input with Remove Button */}
          <div className="relative">
            <input
              type="date"
              value={editData.date || ''}
              onChange={(e) => setEditData({ ...editData, date: e.target.value || null })}
              className="px-1 py-0.5 bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] text-xs w-full pr-5"
            />
            {editData.date && (
              <button
                onClick={() => setEditData({ ...editData, date: null })}
                className="absolute right-0.5 top-0 bottom-0 px-1 text-red-400 hover:text-red-300 text-xs"
              >
                ×
              </button>
            )}
          </div>

          {/* Notes Input */}
          <input
            type="text"
            value={editData.notes}
            onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
            placeholder="Notes"
            className="px-1 py-0.5 bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] text-xs"
          />

          {/* Action Buttons */}
          <div className="flex gap-1">
            <button
              onClick={() => onSave(editData)}
              className="px-1 py-0.5 bg-[#007acc] text-white text-xs rounded hover:bg-[#005fa3] transition-colors"
            >
              Save
            </button>
            <button
              onClick={onCancel}
              className="px-1 py-0.5 bg-transparent border border-[#3e3e42] text-[#969696] text-xs rounded hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Completion Checkbox */}
        <div className="mt-2 flex items-center gap-2 ml-6">
          <input
            type="checkbox"
            id={`completed-${deliverable.id}`}
            checked={editData.isCompleted}
            onChange={(e) => setEditData({ ...editData, isCompleted: e.target.checked })}
            className="w-3 h-3"
          />
          <label htmlFor={`completed-${deliverable.id}`} className="text-xs text-[#cccccc]">
            Mark as completed
          </label>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`flex items-center p-2 rounded text-xs transition-all ${
        isDragged 
          ? 'opacity-50 transform scale-95' 
          : isDraggedOver 
            ? 'bg-[#007acc]/20 border border-[#007acc]/50' 
            : deliverable.isCompleted 
              ? 'bg-[#3e3e42]/20 border border-[#3e3e42]/50' 
              : 'bg-[#3e3e42]/30'
      }`}
      draggable={!editing}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* Drag Handle */}
      <DragHandle />

      {/* Content Grid */}
      <div className="grid grid-cols-4 gap-4 flex-1">
        <div className={`${deliverable.isCompleted ? 'text-[#969696] line-through' : 'text-[#cccccc]'}`}>
          {deliverable.percentage !== null ? `${deliverable.percentage}%` : '-'}
        </div>
        <div className={`${deliverable.isCompleted ? 'text-[#969696] line-through' : 'text-[#cccccc]'}`}>
          {deliverable.description || '-'}
        </div>
        <div className="text-[#969696]">
          {deliverable.date ? formatUtcToLocal(deliverable.date) : '-'}
        </div>
        <div className="text-[#969696]">
          {deliverable.notes || '-'}
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="flex gap-1 items-center ml-2">
        {deliverable.isCompleted && (
          <span className="text-emerald-400 text-xs mr-1">✓</span>
        )}
        <button
          onClick={onEdit}
          className="text-[#cccccc] hover:bg-[#3e3e42] px-1 py-0.5 rounded text-xs transition-colors"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="text-red-400 hover:bg-red-500/20 px-1 py-0.5 rounded text-xs transition-colors"
        >
          Del
        </button>
      </div>
    </div>
  );
};

interface AddDeliverableFormProps {
  onSave: (data: Partial<Deliverable>) => void;
  onCancel: () => void;
}

const AddDeliverableForm: React.FC<AddDeliverableFormProps> = ({ onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    percentage: null as number | null,
    description: '',
    date: null as string | null,
    notes: '',
  });

  const handleSave = () => {
    onSave(formData);
  };

  return (
    <div className="p-2 bg-[#3e3e42]/50 rounded border border-[#3e3e42] mt-2">
      <div className="grid grid-cols-6 gap-2 items-center text-xs mb-2">
        <div className="text-[#969696] font-medium w-4"></div> {/* Drag handle space */}
        <div className="text-[#969696] font-medium">%</div>
        <div className="text-[#969696] font-medium">DESCRIPTION</div>
        <div className="text-[#969696] font-medium">DATE</div>
        <div className="text-[#969696] font-medium">NOTES</div>
        <div className="text-[#969696] font-medium">ACTIONS</div>
      </div>
      
      <div className="grid grid-cols-6 gap-2 items-center">
        {/* Empty space for drag handle alignment */}
        <div className="w-4"></div>

        <input
          type="number"
          min="0"
          max="100"
          value={formData.percentage || ''}
          onChange={(e) => setFormData({
            ...formData,
            percentage: e.target.value ? Number(e.target.value) : null
          })}
          placeholder="% (optional)"
          className="px-1 py-0.5 bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] text-xs [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
        />
        
        <input
          type="text"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Description (optional)"
          className="px-1 py-0.5 bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] text-xs"
        />
        
        <input
          type="date"
          value={formData.date || ''}
          onChange={(e) => setFormData({ ...formData, date: e.target.value || null })}
          className="px-1 py-0.5 bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] text-xs"
        />
        
        <input
          type="text"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Notes (optional)"
          className="px-1 py-0.5 bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] text-xs"
        />
        
        <div className="flex gap-1">
          <button
            onClick={handleSave}
            className="px-1 py-0.5 bg-[#007acc] text-white text-xs rounded hover:bg-[#005fa3] transition-colors"
          >
            Add
          </button>
          <button
            onClick={onCancel}
            className="px-1 py-0.5 bg-transparent border border-[#3e3e42] text-[#969696] text-xs rounded hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeliverablesSection;
