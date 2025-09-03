import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Deliverables Section - STANDARDS COMPLIANT
 * Follows R2-REBUILD-STANDARDS.md and R2-REBUILD-DELIVERABLES.md
 * Integrates into existing Projects page split-panel layout
 * Features drag-and-drop reordering with grab handles
 */
import { useState, useEffect } from 'react';
import { deliverablesApi } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { PROJECT_FILTER_METADATA_KEY } from '@/hooks/useProjectFilterMetadata';
const DeliverablesSection = ({ project }) => {
    const queryClient = useQueryClient();
    const [deliverables, setDeliverables] = useState([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    useEffect(() => {
        if (project.id) {
            loadDeliverables();
        }
    }, [project.id]);
    const loadDeliverables = async () => {
        if (!project.id)
            return;
        try {
            setLoading(true);
            setError(null);
            const response = await deliverablesApi.list(project.id);
            setDeliverables(response.results || []);
        }
        catch (err) {
            setError('Failed to load deliverables');
            console.error('Failed to load deliverables:', err);
        }
        finally {
            setLoading(false);
        }
    };
    const handleAddDeliverable = () => {
        setShowAddForm(true);
    };
    const handleSaveDeliverable = async (deliverableData) => {
        if (!project.id)
            return;
        try {
            await deliverablesApi.create({
                project: project.id,
                ...deliverableData
            });
            await loadDeliverables();
            // Invalidate project filter metadata (future deliverables flags)
            await queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
            setShowAddForm(false);
        }
        catch (err) {
            setError('Failed to create deliverable');
        }
    };
    const handleUpdateDeliverable = async (id, deliverableData) => {
        try {
            await deliverablesApi.update(id, deliverableData);
            await loadDeliverables();
            await queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
            setEditingId(null);
        }
        catch (err) {
            setError('Failed to update deliverable');
        }
    };
    const handleDeleteDeliverable = async (id) => {
        if (!confirm('Are you sure you want to delete this deliverable?')) {
            return;
        }
        try {
            await deliverablesApi.delete(id);
            await loadDeliverables();
            await queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
        }
        catch (err) {
            setError('Failed to delete deliverable');
        }
    };
    const handleDragStart = (index) => {
        setDraggedIndex(index);
    };
    const handleDragOver = (e, index) => {
        e.preventDefault();
        setDragOverIndex(index);
    };
    const handleDragLeave = () => {
        setDragOverIndex(null);
    };
    const handleDrop = async (e, dropIndex) => {
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
            const deliverableIds = newDeliverables.map(d => d.id);
            await deliverablesApi.reorder(project.id, deliverableIds);
            await queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
        }
        catch (err) {
            setError('Failed to reorder deliverables');
            // Reload on error to get correct order
            await loadDeliverables();
        }
    };
    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    };
    return (_jsxs("div", { className: "border-t border-[#3e3e42] pt-4", children: [_jsxs("div", { className: "flex justify-between items-center mb-2", children: [_jsx("h3", { className: "text-base font-semibold text-[#cccccc]", children: "Deliverables" }), _jsx("button", { onClick: handleAddDeliverable, className: "px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors", children: "+ Add Deliverable" })] }), error && (_jsx("div", { className: "mb-2 p-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-xs", children: error })), loading ? (_jsx("div", { className: "text-center py-4 text-[#969696] text-sm", children: "Loading deliverables..." })) : deliverables.length === 0 && !showAddForm ? (_jsxs("div", { className: "text-center py-8", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "No deliverables yet" }), _jsx("div", { className: "text-[#969696] text-xs mt-1", children: "Click \"Add Deliverable\" to get started" })] })) : (_jsx("div", { className: "space-y-1", children: deliverables.map((deliverable, index) => (_jsx(DeliverableRow, { deliverable: deliverable, index: index, editing: editingId === deliverable.id, isDragged: draggedIndex === index, isDraggedOver: dragOverIndex === index, onEdit: () => setEditingId(deliverable.id), onSave: (data) => handleUpdateDeliverable(deliverable.id, data), onCancel: () => setEditingId(null), onDelete: () => handleDeleteDeliverable(deliverable.id), onDragStart: () => handleDragStart(index), onDragOver: (e) => handleDragOver(e, index), onDragLeave: handleDragLeave, onDrop: (e) => handleDrop(e, index), onDragEnd: handleDragEnd }, deliverable.id))) })), showAddForm && (_jsx(AddDeliverableForm, { onSave: handleSaveDeliverable, onCancel: () => setShowAddForm(false) }))] }));
};
const DeliverableRow = ({ deliverable, index, editing, isDragged, isDraggedOver, onEdit, onSave, onCancel, onDelete, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, }) => {
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
    const DragHandle = () => (_jsxs("div", { className: "cursor-grab active:cursor-grabbing flex flex-col justify-center items-center w-4 h-4 mr-2", onMouseDown: onDragStart, children: [_jsx("div", { className: "w-3 h-0.5 bg-[#969696] mb-0.5" }), _jsx("div", { className: "w-3 h-0.5 bg-[#969696] mb-0.5" }), _jsx("div", { className: "w-3 h-0.5 bg-[#969696]" })] }));
    if (editing) {
        return (_jsxs("div", { className: "p-2 bg-[#3e3e42]/50 rounded border border-[#3e3e42]", children: [_jsxs("div", { className: "grid grid-cols-6 gap-2 items-center text-xs mb-2", children: [_jsx("div", { className: "text-[#969696] font-medium w-4" }), " ", _jsx("div", { className: "text-[#969696] font-medium", children: "%" }), _jsx("div", { className: "text-[#969696] font-medium", children: "DESCRIPTION" }), _jsx("div", { className: "text-[#969696] font-medium", children: "DATE" }), _jsx("div", { className: "text-[#969696] font-medium", children: "NOTES" }), _jsx("div", { className: "text-[#969696] font-medium", children: "ACTIONS" })] }), _jsxs("div", { className: "grid grid-cols-6 gap-2 items-start", children: [_jsx("div", { className: "w-4" }), _jsx("input", { type: "number", min: "0", max: "100", value: editData.percentage || '', onChange: (e) => setEditData({
                                ...editData,
                                percentage: e.target.value ? Number(e.target.value) : null
                            }), placeholder: "%", className: "px-1 py-0.5 bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] text-xs [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]" }), _jsx("input", { type: "text", value: editData.description, onChange: (e) => setEditData({ ...editData, description: e.target.value }), placeholder: "Description", className: "px-1 py-0.5 bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] text-xs" }), _jsxs("div", { className: "relative", children: [_jsx("input", { type: "date", value: editData.date || '', onChange: (e) => setEditData({ ...editData, date: e.target.value || null }), className: "px-1 py-0.5 bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] text-xs w-full pr-5" }), editData.date && (_jsx("button", { onClick: () => setEditData({ ...editData, date: null }), className: "absolute right-0.5 top-0 bottom-0 px-1 text-red-400 hover:text-red-300 text-xs", children: "\u00D7" }))] }), _jsx("input", { type: "text", value: editData.notes, onChange: (e) => setEditData({ ...editData, notes: e.target.value }), placeholder: "Notes", className: "px-1 py-0.5 bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] text-xs" }), _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { onClick: () => onSave(editData), className: "px-1 py-0.5 bg-[#007acc] text-white text-xs rounded hover:bg-[#005fa3] transition-colors", children: "Save" }), _jsx("button", { onClick: onCancel, className: "px-1 py-0.5 bg-transparent border border-[#3e3e42] text-[#969696] text-xs rounded hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors", children: "Cancel" })] })] }), _jsxs("div", { className: "mt-2 flex items-center gap-2 ml-6", children: [_jsx("input", { type: "checkbox", id: `completed-${deliverable.id}`, checked: editData.isCompleted, onChange: (e) => setEditData({ ...editData, isCompleted: e.target.checked }), className: "w-3 h-3" }), _jsx("label", { htmlFor: `completed-${deliverable.id}`, className: "text-xs text-[#cccccc]", children: "Mark as completed" })] })] }));
    }
    return (_jsxs("div", { className: `flex items-center p-2 rounded text-xs transition-all ${isDragged
            ? 'opacity-50 transform scale-95'
            : isDraggedOver
                ? 'bg-[#007acc]/20 border border-[#007acc]/50'
                : deliverable.isCompleted
                    ? 'bg-[#3e3e42]/20 border border-[#3e3e42]/50'
                    : 'bg-[#3e3e42]/30'}`, draggable: !editing, onDragStart: onDragStart, onDragOver: onDragOver, onDragLeave: onDragLeave, onDrop: onDrop, onDragEnd: onDragEnd, children: [_jsx(DragHandle, {}), _jsxs("div", { className: "grid grid-cols-4 gap-4 flex-1", children: [_jsx("div", { className: `${deliverable.isCompleted ? 'text-[#969696] line-through' : 'text-[#cccccc]'}`, children: deliverable.percentage !== null ? `${deliverable.percentage}%` : '-' }), _jsx("div", { className: `${deliverable.isCompleted ? 'text-[#969696] line-through' : 'text-[#cccccc]'}`, children: deliverable.description || '-' }), _jsx("div", { className: "text-[#969696]", children: deliverable.date || '-' }), _jsx("div", { className: "text-[#969696]", children: deliverable.notes || '-' })] }), _jsxs("div", { className: "flex gap-1 items-center ml-2", children: [deliverable.isCompleted && (_jsx("span", { className: "text-emerald-400 text-xs mr-1", children: "\u2713" })), _jsx("button", { onClick: onEdit, className: "text-[#cccccc] hover:bg-[#3e3e42] px-1 py-0.5 rounded text-xs transition-colors", children: "Edit" }), _jsx("button", { onClick: onDelete, className: "text-red-400 hover:bg-red-500/20 px-1 py-0.5 rounded text-xs transition-colors", children: "Del" })] })] }));
};
const AddDeliverableForm = ({ onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        percentage: null,
        description: '',
        date: null,
        notes: '',
    });
    const handleSave = () => {
        onSave(formData);
    };
    return (_jsxs("div", { className: "p-2 bg-[#3e3e42]/50 rounded border border-[#3e3e42] mt-2", children: [_jsxs("div", { className: "grid grid-cols-6 gap-2 items-center text-xs mb-2", children: [_jsx("div", { className: "text-[#969696] font-medium w-4" }), " ", _jsx("div", { className: "text-[#969696] font-medium", children: "%" }), _jsx("div", { className: "text-[#969696] font-medium", children: "DESCRIPTION" }), _jsx("div", { className: "text-[#969696] font-medium", children: "DATE" }), _jsx("div", { className: "text-[#969696] font-medium", children: "NOTES" }), _jsx("div", { className: "text-[#969696] font-medium", children: "ACTIONS" })] }), _jsxs("div", { className: "grid grid-cols-6 gap-2 items-center", children: [_jsx("div", { className: "w-4" }), _jsx("input", { type: "number", min: "0", max: "100", value: formData.percentage || '', onChange: (e) => setFormData({
                            ...formData,
                            percentage: e.target.value ? Number(e.target.value) : null
                        }), placeholder: "% (optional)", className: "px-1 py-0.5 bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] text-xs [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]" }), _jsx("input", { type: "text", value: formData.description, onChange: (e) => setFormData({ ...formData, description: e.target.value }), placeholder: "Description (optional)", className: "px-1 py-0.5 bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] text-xs" }), _jsx("input", { type: "date", value: formData.date || '', onChange: (e) => setFormData({ ...formData, date: e.target.value || null }), className: "px-1 py-0.5 bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] text-xs" }), _jsx("input", { type: "text", value: formData.notes, onChange: (e) => setFormData({ ...formData, notes: e.target.value }), placeholder: "Notes (optional)", className: "px-1 py-0.5 bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] text-xs" }), _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { onClick: handleSave, className: "px-1 py-0.5 bg-[#007acc] text-white text-xs rounded hover:bg-[#005fa3] transition-colors", children: "Add" }), _jsx("button", { onClick: onCancel, className: "px-1 py-0.5 bg-transparent border border-[#3e3e42] text-[#969696] text-xs rounded hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors", children: "Cancel" })] })] })] }));
};
export default DeliverablesSection;
