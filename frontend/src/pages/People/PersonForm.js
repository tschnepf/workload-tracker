import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Person Form - Create/Edit person with dark mode styling
 * Chunk 2: Only name + weeklyCapacity fields (progressive usage strategy)
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { peopleApi, departmentsApi } from '@/services/api';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
const PersonForm = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEditing = !!id;
    const [formData, setFormData] = useState({
        name: '',
        weeklyCapacity: 36, // Default from master guide
        role: 'Engineer', // Default role from Django model
        department: null, // Phase 2: No department initially
        location: '', // Location can be empty initially
    });
    const [departments, setDepartments] = useState([]); // Phase 2: Department list
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [validationErrors, setValidationErrors] = useState({});
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
        }
        catch (err) {
            console.error('Error loading departments:', err);
        }
    };
    const loadPerson = async (personId) => {
        try {
            setLoading(true);
            console.log('🔍 [DEBUG] Loading person with ID:', personId);
            const person = await peopleApi.get(personId);
            console.log('🔍 [DEBUG] Person data loaded from API:', person);
            const newFormData = {
                name: person.name,
                weeklyCapacity: person.weeklyCapacity || 36,
                role: person.role || 'Engineer', // Load role with fallback
                department: person.department || null, // Phase 2: Load department
                location: person.location || '', // Load location
            };
            console.log('🔍 [DEBUG] Setting form data to:', newFormData);
            setFormData(newFormData);
        }
        catch (err) {
            console.error('🔍 [DEBUG] Error loading person:', err);
            setError(err.message || 'Failed to load person');
        }
        finally {
            setLoading(false);
        }
    };
    const validateForm = () => {
        const errors = {};
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
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) {
            return;
        }
        try {
            setLoading(true);
            setError(null);
            // Debug logging to see what data is being submitted
            console.log('🔍 [DEBUG] Form submission data:', {
                isEditing,
                id,
                formData,
                formDataJSON: JSON.stringify(formData, null, 2)
            });
            if (isEditing && id) {
                console.log(`🔍 [DEBUG] Updating person ${id} with PATCH request`);
                const result = await peopleApi.update(parseInt(id), formData);
                console.log('🔍 [DEBUG] Update API response:', result);
            }
            else {
                console.log('🔍 [DEBUG] Creating new person with POST request');
                const result = await peopleApi.create(formData);
                console.log('🔍 [DEBUG] Create API response:', result);
            }
            console.log('🔍 [DEBUG] API call successful, navigating to /people');
            navigate('/people');
        }
        catch (err) {
            console.error('🔍 [DEBUG] API call failed:', {
                error: err,
                message: err.message,
                status: err.status,
                response: err.response
            });
            setError(err.message || `Failed to ${isEditing ? 'update' : 'create'} person`);
        }
        finally {
            setLoading(false);
        }
    };
    const handleChange = (field, value) => {
        console.log('🔍 [DEBUG] handleChange called:', { field, value, type: typeof value });
        setFormData(prev => {
            const newData = { ...prev, [field]: value };
            console.log('🔍 [DEBUG] Updated formData:', newData);
            return newData;
        });
        // Clear validation error when user starts typing
        if (validationErrors[field]) {
            setValidationErrors(prev => ({ ...prev, [field]: '' }));
        }
    };
    return (_jsx(Layout, { children: _jsxs("div", { className: "max-w-2xl mx-auto", children: [_jsxs("div", { className: "mb-6", children: [_jsx("h1", { className: "text-2xl font-bold text-[#cccccc]", children: isEditing ? 'Edit Person' : 'Add New Person' }), _jsx("p", { className: "text-[#969696] mt-1", children: isEditing ? 'Update team member information' : 'Add a new team member to track their workload' })] }), error && (_jsxs(Card, { className: "bg-red-500/20 border-red-500/50 p-4 mb-6", children: [_jsx("div", { className: "text-red-400 font-medium mb-2", children: "Form Error:" }), _jsx("div", { className: "text-red-300 text-sm", children: error }), _jsxs("details", { className: "mt-2", children: [_jsx("summary", { className: "text-red-400 text-xs cursor-pointer", children: "Debug Info" }), _jsx("div", { className: "mt-1 text-red-300 text-xs font-mono whitespace-pre-wrap", children: "Check browser console for detailed logs" })] })] })), _jsx(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-6", children: _jsxs("form", { onSubmit: handleSubmit, className: "space-y-6", children: [_jsxs("div", { children: [_jsx(Input, { label: "Full Name", name: "name", value: formData.name, onChange: (e) => handleChange('name', e.target.value), placeholder: "Enter full name", required: true, error: validationErrors.name, className: "bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]" }), _jsx("p", { className: "text-[#969696] text-sm mt-1", children: "This will be displayed in reports and assignments" })] }), _jsxs("div", { children: [_jsx(Input, { label: "Weekly Capacity (hours)", name: "weeklyCapacity", type: "number", value: formData.weeklyCapacity, onChange: (e) => handleChange('weeklyCapacity', parseInt(e.target.value) || 0), placeholder: "36", min: "1", max: "80", required: true, error: validationErrors.weeklyCapacity, className: "bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]" }), _jsx("p", { className: "text-[#969696] text-sm mt-1", children: "Typical full-time: 40h, Part-time: 20h, Contractor: 36h" })] }), _jsxs("div", { children: [_jsx(Input, { label: "Role/Title", name: "role", value: formData.role, onChange: (e) => handleChange('role', e.target.value), placeholder: "e.g., Senior Engineer, Project Manager, Designer", required: true, error: validationErrors.role, className: "bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]" }), _jsx("p", { className: "text-[#969696] text-sm mt-1", children: "Job title or role within the organization" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-[#cccccc] mb-2", children: "Department" }), _jsxs("select", { value: formData.department || '', onChange: (e) => handleChange('department', e.target.value ? parseInt(e.target.value) : null), className: "w-full px-3 py-2 bg-[#3e3e42] border border-[#3e3e42] rounded-md text-[#cccccc] focus:outline-none focus:ring-2 focus:ring-[#007acc] focus:border-transparent", disabled: loading, children: [_jsx("option", { value: "", children: "None Assigned" }), departments.map((dept) => (_jsx("option", { value: dept.id, children: dept.name }, dept.id)))] }), _jsx("p", { className: "text-[#969696] text-sm mt-1", children: "Assign this person to a department for organizational tracking" })] }), _jsxs("div", { children: [_jsx(Input, { label: "Location", name: "location", value: formData.location, onChange: (e) => handleChange('location', e.target.value), placeholder: "e.g., New York, NY or Remote", className: "bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]" }), _jsx("p", { className: "text-[#969696] text-sm mt-1", children: "City and state, or indicate if remote. Leave blank if not specified." })] }), _jsxs("div", { className: "flex justify-between pt-4", children: [_jsx(Button, { type: "button", variant: "ghost", onClick: () => navigate('/people'), disabled: loading, children: "Cancel" }), _jsx(Button, { type: "submit", variant: "primary", disabled: loading, children: loading ? 'Saving...' : (isEditing ? 'Update Person' : 'Add Person') })] })] }) })] }) }));
};
export default PersonForm;
