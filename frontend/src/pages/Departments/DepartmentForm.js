import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Department Form - Create/Edit department modal with VSCode dark theme
 * Following PersonForm.tsx structure with proper field mapping
 */
import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
const DepartmentForm = ({ department, departments, people, onSave, onCancel, }) => {
    const isEditing = !!department;
    const [formData, setFormData] = useState({
        name: '',
        parentDepartment: null,
        manager: null,
        description: '',
        isActive: true,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [validationErrors, setValidationErrors] = useState({});
    useEffect(() => {
        if (department) {
            setFormData({
                name: department.name,
                parentDepartment: department.parentDepartment,
                manager: department.manager,
                description: department.description || '',
                isActive: department.isActive !== false,
            });
        }
        else {
            setFormData({
                name: '',
                parentDepartment: null,
                manager: null,
                description: '',
                isActive: true,
            });
        }
    }, [department]);
    const validateForm = () => {
        const errors = {};
        if (!formData.name.trim()) {
            errors.name = 'Department name is required';
        }
        // Enhanced circular parent department validation
        if (formData.parentDepartment === department?.id) {
            errors.parentDepartment = 'Department cannot be its own parent';
        }
        else if (formData.parentDepartment && department?.id) {
            // Check for indirect circular references by walking up the hierarchy
            const checkCircularReference = (parentId, visitedIds = new Set()) => {
                if (visitedIds.has(parentId))
                    return true; // Circular reference detected
                if (visitedIds.size > 10)
                    return true; // Prevent infinite recursion
                const parentDept = departments.find(d => d.id === parentId);
                if (!parentDept || !parentDept.parentDepartment)
                    return false;
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
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) {
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const updateData = {
                name: formData.name.trim(),
                parentDepartment: formData.parentDepartment,
                manager: formData.manager,
                description: formData.description.trim(),
                isActive: formData.isActive,
            };
            await onSave(updateData);
        }
        catch (err) {
            setError(err.message || 'Failed to save department');
        }
        finally {
            setLoading(false);
        }
    };
    const handleInputChange = (field, value) => {
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
    return (_jsx("div", { className: "fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50", children: _jsx(Card, { className: "w-full max-w-lg bg-[#2d2d30] border-[#3e3e42] max-h-[90vh] overflow-y-auto", children: _jsxs("div", { className: "p-6", children: [_jsxs("div", { className: "flex justify-between items-center mb-6", children: [_jsx("h2", { className: "text-xl font-bold text-[#cccccc]", children: isEditing ? 'Edit Department' : 'Add Department' }), _jsx("button", { onClick: onCancel, className: "text-[#969696] hover:text-[#cccccc] text-xl", children: "\u00D7" })] }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [error && (_jsx("div", { className: "p-3 bg-red-900/30 border border-red-600 rounded text-red-400", children: error })), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-[#cccccc] mb-1", children: "Department Name *" }), _jsx(Input, { value: formData.name, onChange: (e) => handleInputChange('name', e.target.value), placeholder: "e.g. Engineering", className: `w-full ${validationErrors.name ? 'border-red-600' : ''}`, disabled: loading }), validationErrors.name && (_jsx("p", { className: "mt-1 text-sm text-red-400", children: validationErrors.name }))] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-[#cccccc] mb-1", children: "Parent Department" }), _jsxs("select", { value: formData.parentDepartment || '', onChange: (e) => handleInputChange('parentDepartment', e.target.value ? parseInt(e.target.value) : null), className: `w-full px-3 py-2 bg-[#3e3e42] border border-[#3e3e42] rounded-md text-[#cccccc] focus:outline-none focus:ring-2 focus:ring-[#007acc] focus:border-transparent ${validationErrors.parentDepartment ? 'border-red-600' : ''}`, disabled: loading, children: [_jsx("option", { value: "", children: "None (Top Level)" }), parentDepartmentOptions.map((dept) => (_jsx("option", { value: dept.id, children: dept.name }, dept.id)))] }), validationErrors.parentDepartment && (_jsx("p", { className: "mt-1 text-sm text-red-400", children: validationErrors.parentDepartment }))] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-[#cccccc] mb-1", children: "Manager" }), _jsxs("select", { value: formData.manager || '', onChange: (e) => handleInputChange('manager', e.target.value ? parseInt(e.target.value) : null), className: "w-full px-3 py-2 bg-[#3e3e42] border border-[#3e3e42] rounded-md text-[#cccccc] focus:outline-none focus:ring-2 focus:ring-[#007acc] focus:border-transparent", disabled: loading, children: [_jsx("option", { value: "", children: "None Assigned" }), people.map((person) => (_jsx("option", { value: person.id, children: person.name }, person.id)))] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-[#cccccc] mb-1", children: "Description" }), _jsx("textarea", { value: formData.description, onChange: (e) => handleInputChange('description', e.target.value), placeholder: "Brief description of the department's purpose...", rows: 3, className: "w-full px-3 py-2 bg-[#3e3e42] border border-[#3e3e42] rounded-md text-[#cccccc] focus:outline-none focus:ring-2 focus:ring-[#007acc] focus:border-transparent resize-none", disabled: loading })] }), _jsxs("div", { className: "flex items-center", children: [_jsx("input", { type: "checkbox", id: "isActive", checked: formData.isActive, onChange: (e) => handleInputChange('isActive', e.target.checked), className: "mr-2 w-4 h-4 text-[#007acc] bg-[#3e3e42] border-[#3e3e42] rounded focus:ring-[#007acc] focus:ring-2", disabled: loading }), _jsx("label", { htmlFor: "isActive", className: "text-sm text-[#cccccc]", children: "Department is active" })] }), _jsxs("div", { className: "flex justify-end space-x-3 pt-4", children: [_jsx(Button, { type: "button", variant: "secondary", onClick: onCancel, disabled: loading, children: "Cancel" }), _jsx(Button, { type: "submit", variant: "primary", disabled: loading, children: loading ? 'Saving...' : (isEditing ? 'Update' : 'Create') })] })] })] }) }) }));
};
export default DepartmentForm;
