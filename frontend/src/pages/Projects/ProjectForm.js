import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Project Form - Create/Edit project with VSCode dark theme
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { projectsApi } from '@/services/api';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
const ProjectForm = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEditing = !!id;
    const [formData, setFormData] = useState({
        name: '',
        status: 'active',
        client: '',
        description: '',
        startDate: '',
        estimatedHours: undefined,
        projectNumber: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [validationErrors, setValidationErrors] = useState({});
    const [availableClients, setAvailableClients] = useState([]);
    const [filteredClients, setFilteredClients] = useState([]);
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    useEffect(() => {
        if (isEditing && id) {
            loadProject();
        }
    }, [isEditing, id]);
    useEffect(() => {
        // Load available clients when component mounts
        const loadClients = async () => {
            try {
                const clients = await projectsApi.getClients();
                setAvailableClients(clients);
                setFilteredClients(clients);
            }
            catch (err) {
                console.error('Failed to load clients:', err);
            }
        };
        loadClients();
    }, []);
    const loadProject = async () => {
        try {
            setLoading(true);
            const project = await projectsApi.get(parseInt(id));
            setFormData(project);
        }
        catch (err) {
            setError('Failed to load project');
        }
        finally {
            setLoading(false);
        }
    };
    const validateForm = () => {
        const errors = {};
        if (!formData.name?.trim()) {
            errors.name = 'Project name is required';
        }
        if (!formData.client?.trim()) {
            errors.client = 'Client is required';
        }
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };
    const handleSubmit = async (e) => {
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
                startDate: formData.startDate?.trim() || null,
                endDate: null, // Never send endDate for new projects
            };
            if (isEditing && id) {
                await projectsApi.update(parseInt(id), projectData);
            }
            else {
                await projectsApi.create(projectData);
            }
            navigate('/projects');
        }
        catch (err) {
            console.error('Project form submission error:', err);
            let errorMessage = err.message || `Failed to ${isEditing ? 'update' : 'create'} project`;
            // If it's a validation error, try to extract specific field errors
            if (err.status === 400 && err.response) {
                console.error('Validation errors:', err.response);
                if (typeof err.response === 'object') {
                    const fieldErrors = Object.entries(err.response)
                        .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
                        .join('; ');
                    if (fieldErrors) {
                        errorMessage = `Validation errors: ${fieldErrors}`;
                    }
                }
            }
            setError(errorMessage);
        }
        finally {
            setLoading(false);
        }
    };
    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        // Clear validation error when user starts typing
        if (validationErrors[field]) {
            setValidationErrors(prev => ({ ...prev, [field]: '' }));
        }
    };
    const handleClientChange = (value) => {
        setFormData(prev => ({ ...prev, client: value }));
        // Filter clients based on input
        if (value.trim() === '') {
            setFilteredClients(availableClients);
        }
        else {
            const filtered = availableClients.filter(client => client.toLowerCase().includes(value.toLowerCase()));
            setFilteredClients(filtered);
        }
        setShowClientDropdown(true);
        // Clear validation error
        if (validationErrors.client) {
            setValidationErrors(prev => ({ ...prev, client: '' }));
        }
    };
    const selectClient = (client) => {
        setFormData(prev => ({ ...prev, client }));
        setShowClientDropdown(false);
        setFilteredClients(availableClients);
    };
    return (_jsx(Layout, { children: _jsxs("div", { className: "max-w-2xl mx-auto", children: [_jsxs("div", { className: "mb-6", children: [_jsx("h1", { className: "text-2xl font-bold text-[#cccccc]", children: isEditing ? 'Edit Project' : 'Create New Project' }), _jsx("p", { className: "text-[#969696] mt-1", children: isEditing ? 'Update project information' : 'Add a new project to track assignments' })] }), error && (_jsx(Card, { className: "bg-red-500/20 border-red-500/50 p-4 mb-6", children: _jsx("div", { className: "text-red-400", children: error }) })), _jsx(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-6", children: _jsxs("form", { onSubmit: handleSubmit, className: "space-y-6", children: [_jsx("div", { children: _jsx(Input, { label: "Project Name", name: "name", value: formData.name || '', onChange: (e) => handleChange('name', e.target.value), placeholder: "e.g., Website Redesign, Mobile App", required: true, error: validationErrors.name, className: "bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]" }) }), _jsxs("div", { className: "relative", children: [_jsxs("label", { className: "block text-sm font-medium text-[#cccccc] mb-2", children: ["Client ", _jsx("span", { className: "text-red-400", children: "*" })] }), _jsx("input", { type: "text", value: formData.client || '', onChange: (e) => handleClientChange(e.target.value), onFocus: () => setShowClientDropdown(true), onBlur: () => {
                                            // Delay hiding to allow for click selection
                                            setTimeout(() => setShowClientDropdown(false), 200);
                                        }, placeholder: "e.g., Acme Corp, Internal", className: "w-full px-3 py-2 rounded-md border text-sm transition-colors bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] placeholder-[#969696] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" }), validationErrors.client && (_jsx("p", { className: "text-red-400 text-xs mt-1", children: validationErrors.client })), showClientDropdown && filteredClients.length > 0 && (_jsx("div", { className: "absolute z-50 w-full mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded-md shadow-lg max-h-60 overflow-auto", children: filteredClients.map((client) => (_jsx("div", { className: "px-3 py-2 cursor-pointer hover:bg-[#3e3e42] text-[#cccccc] text-sm", onClick: () => selectClient(client), children: client }, client))) }))] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-[#cccccc] mb-2", children: "Status" }), _jsxs("select", { value: formData.status || 'active', onChange: (e) => handleChange('status', e.target.value), className: "w-full px-3 py-2 rounded-md border text-sm transition-colors bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none", children: [_jsx("option", { value: "active", children: "Active" }), _jsx("option", { value: "active_ca", children: "Active CA" }), _jsx("option", { value: "on_hold", children: "On Hold" }), _jsx("option", { value: "completed", children: "Completed" }), _jsx("option", { value: "cancelled", children: "Cancelled" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-[#cccccc] mb-2", children: "Description" }), _jsx("textarea", { value: formData.description || '', onChange: (e) => handleChange('description', e.target.value), rows: 4, className: "w-full px-3 py-2 rounded-md border text-sm transition-colors bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] placeholder-[#969696] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none", placeholder: "Brief description of the project" })] }), _jsxs("div", { children: [_jsx(Input, { label: "Start Date (Optional)", name: "startDate", type: "date", value: formData.startDate || '', onChange: (e) => handleChange('startDate', e.target.value), className: "bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]" }), _jsx("p", { className: "text-[#969696] text-sm mt-1", children: "Leave blank if project start date is not yet determined" })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [_jsx("div", { children: _jsx(Input, { label: "Estimated Hours", name: "estimatedHours", type: "number", min: "0", step: "1", value: formData.estimatedHours || '', onChange: (e) => handleChange('estimatedHours', e.target.value ? parseInt(e.target.value) : undefined), placeholder: "Total project hours", className: "bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]" }) }), _jsx("div", { children: _jsx(Input, { label: "Project Number", name: "projectNumber", value: formData.projectNumber || '', onChange: (e) => handleChange('projectNumber', e.target.value), placeholder: "e.g., PRJ-2024-001", className: "bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]" }) })] }), _jsxs("div", { className: "flex justify-between pt-4", children: [_jsx(Button, { type: "button", variant: "ghost", onClick: () => navigate('/projects'), disabled: loading, children: "Cancel" }), _jsx(Button, { type: "submit", variant: "primary", disabled: loading, children: loading ? 'Saving...' : (isEditing ? 'Update Project' : 'Create Project') })] })] }) })] }) }));
};
export default ProjectForm;
