import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Departments List - Department management interface
 * Following PeopleList.tsx structure with VSCode dark theme
 */
import { useState, useEffect, useMemo } from 'react';
import { departmentsApi, peopleApi } from '@/services/api';
import Sidebar from '@/components/layout/Sidebar';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import DepartmentForm from './DepartmentForm';
const DepartmentsList = () => {
    const [departments, setDepartments] = useState([]);
    const [people, setPeople] = useState([]);
    const [selectedDepartment, setSelectedDepartment] = useState(null);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingDepartment, setEditingDepartment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [hasAutoSelected, setHasAutoSelected] = useState(false); // Track if we've auto-selected
    useEffect(() => {
        loadDepartments();
        loadPeople();
    }, []);
    // Filter and sort departments
    const filteredAndSortedDepartments = useMemo(() => {
        const filtered = departments.filter(dept => dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (dept.description && dept.description.toLowerCase().includes(searchTerm.toLowerCase())));
        return filtered.sort((a, b) => a.name.localeCompare(b.name));
    }, [departments, searchTerm]);
    // Auto-select first department when departments are loaded (per R2-REBUILD-STANDARDS.md)
    // Only auto-select once when departments first load, never override manual selections
    useEffect(() => {
        if (filteredAndSortedDepartments.length > 0 && !selectedDepartment && !hasAutoSelected) {
            setSelectedDepartment(filteredAndSortedDepartments[0]);
            setSelectedIndex(0);
            setHasAutoSelected(true);
        }
    }, [filteredAndSortedDepartments, hasAutoSelected]);
    const loadDepartments = async () => {
        try {
            setLoading(true);
            const response = await departmentsApi.list();
            setDepartments(response.results || []);
        }
        catch (err) {
            setError('Failed to load departments');
            console.error('Error loading departments:', err);
        }
        finally {
            setLoading(false);
        }
    };
    const loadPeople = async () => {
        try {
            const response = await peopleApi.list();
            setPeople(response.results || []);
        }
        catch (err) {
            console.error('Error loading people:', err);
        }
    };
    const handleCreateDepartment = () => {
        setEditingDepartment(null);
        setShowModal(true);
    };
    const handleEditDepartment = (department) => {
        setEditingDepartment(department);
        setShowModal(true);
    };
    const handleSaveDepartment = async (formData) => {
        try {
            let savedDepartment;
            if (editingDepartment?.id) {
                savedDepartment = await departmentsApi.update(editingDepartment.id, formData);
            }
            else {
                savedDepartment = await departmentsApi.create(formData);
            }
            // Refresh departments list
            await loadDepartments();
            // Select the saved/updated department
            setSelectedDepartment(savedDepartment);
            setShowModal(false);
            setEditingDepartment(null);
        }
        catch (err) {
            console.error('Failed to save department:', err);
            setError(`Failed to save department: ${err.message}`);
        }
    };
    const handleDeleteDepartment = async (department) => {
        if (!department.id)
            return;
        const confirmed = window.confirm(`Are you sure you want to delete "${department.name}"?`);
        if (!confirmed)
            return;
        try {
            await departmentsApi.delete(department.id);
            await loadDepartments();
            // Clear selection if deleted department was selected
            if (selectedDepartment?.id === department.id) {
                setSelectedDepartment(null);
                setSelectedIndex(-1);
            }
        }
        catch (err) {
            setError(`Failed to delete department: ${err.message}`);
            console.error('Error deleting department:', err);
        }
    };
    const getManagerName = (managerId) => {
        if (!managerId)
            return 'None';
        const manager = people.find(p => p.id === managerId);
        return manager ? manager.name : 'Unknown';
    };
    const getParentDepartmentName = (parentId) => {
        if (!parentId)
            return 'None';
        const parent = departments.find(d => d.id === parentId);
        return parent ? parent.name : 'Unknown';
    };
    if (loading) {
        return (_jsxs("div", { className: "flex h-screen bg-[#1e1e1e]", children: [_jsx(Sidebar, {}), _jsx("div", { className: "flex-1 p-8 text-[#cccccc]", children: "Loading departments..." })] }));
    }
    return (_jsxs("div", { className: "flex h-screen bg-[#1e1e1e]", children: [_jsx(Sidebar, {}), _jsx("div", { className: "flex-1 overflow-hidden", children: _jsxs("div", { className: "flex h-full", children: [_jsxs("div", { className: "w-1/3 p-6 border-r border-[#3e3e42] bg-[#252526]", children: [_jsxs("div", { className: "mb-6", children: [_jsxs("div", { className: "flex justify-between items-center mb-4", children: [_jsx("h1", { className: "text-2xl font-bold text-[#cccccc]", children: "Departments" }), _jsx(Button, { variant: "primary", onClick: handleCreateDepartment, children: "Add Department" })] }), _jsx(Input, { placeholder: "Search departments...", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), className: "w-full" })] }), error && (_jsx("div", { className: "mb-4 p-3 bg-red-900/30 border border-red-600 rounded text-red-400", children: error })), _jsxs("div", { className: "space-y-3", children: [filteredAndSortedDepartments.map((department, index) => (_jsx(Card, { className: `p-4 cursor-pointer transition-colors bg-[#2d2d30] border-[#3e3e42] hover:bg-[#3e3e42]/50 ${selectedDepartment?.id === department.id ? 'ring-2 ring-[#007acc]' : ''}`, onClick: () => {
                                                setSelectedDepartment(department);
                                                setSelectedIndex(index);
                                            }, children: _jsxs("div", { className: "flex justify-between items-start", children: [_jsxs("div", { className: "flex-1", children: [_jsx("h3", { className: "font-semibold text-[#cccccc] mb-1", children: department.name }), _jsxs("p", { className: "text-sm text-[#969696] mb-2", children: ["Manager: ", department.managerName || 'None'] }), department.description && (_jsx("p", { className: "text-sm text-[#969696] line-clamp-2", children: department.description })), department.parentDepartment && (_jsxs("p", { className: "text-xs text-[#969696] mt-1", children: ["Parent: ", getParentDepartmentName(department.parentDepartment)] }))] }), _jsx("div", { className: "ml-4", children: _jsx("span", { className: `px-2 py-1 rounded text-xs ${department.isActive
                                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                                : 'bg-gray-500/20 text-gray-400'}`, children: department.isActive ? 'Active' : 'Inactive' }) })] }) }, department.id))), filteredAndSortedDepartments.length === 0 && (_jsx("div", { className: "text-center py-8 text-[#969696]", children: searchTerm ? 'No departments match your search.' : 'No departments found.' }))] })] }), _jsx("div", { className: "flex-1 p-6 bg-[#1e1e1e]", children: selectedDepartment ? (_jsxs("div", { children: [_jsxs("div", { className: "flex justify-between items-start mb-6", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold text-[#cccccc] mb-2", children: selectedDepartment.name }), _jsx("div", { className: "flex items-center space-x-4", children: _jsx("span", { className: `px-3 py-1 rounded text-sm ${selectedDepartment.isActive
                                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                                : 'bg-gray-500/20 text-gray-400'}`, children: selectedDepartment.isActive ? 'Active' : 'Inactive' }) })] }), _jsxs("div", { className: "flex space-x-2", children: [_jsx(Button, { variant: "secondary", onClick: () => handleEditDepartment(selectedDepartment), children: "Edit" }), _jsx(Button, { variant: "danger", onClick: () => handleDeleteDepartment(selectedDepartment), children: "Delete" })] })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6 mb-8", children: [_jsxs(Card, { className: "p-6 bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("h3", { className: "font-semibold text-[#cccccc] mb-4", children: "Department Info" }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { children: [_jsx("span", { className: "text-sm text-[#969696]", children: "Name:" }), _jsx("p", { className: "text-[#cccccc]", children: selectedDepartment.name })] }), _jsxs("div", { children: [_jsx("span", { className: "text-sm text-[#969696]", children: "Manager:" }), _jsx("p", { className: "text-[#cccccc]", children: selectedDepartment.managerName || 'None assigned' })] }), _jsxs("div", { children: [_jsx("span", { className: "text-sm text-[#969696]", children: "Parent Department:" }), _jsx("p", { className: "text-[#cccccc]", children: getParentDepartmentName(selectedDepartment.parentDepartment) })] }), selectedDepartment.description && (_jsxs("div", { children: [_jsx("span", { className: "text-sm text-[#969696]", children: "Description:" }), _jsx("p", { className: "text-[#cccccc] mt-1", children: selectedDepartment.description })] }))] })] }), _jsxs(Card, { className: "p-6 bg-[#2d2d30] border-[#3e3e42]", children: [_jsx("h3", { className: "font-semibold text-[#cccccc] mb-4", children: "System Info" }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { children: [_jsx("span", { className: "text-sm text-[#969696]", children: "Created:" }), _jsx("p", { className: "text-[#cccccc]", children: selectedDepartment.createdAt ?
                                                                            new Date(selectedDepartment.createdAt).toLocaleDateString() :
                                                                            'Unknown' })] }), _jsxs("div", { children: [_jsx("span", { className: "text-sm text-[#969696]", children: "Updated:" }), _jsx("p", { className: "text-[#cccccc]", children: selectedDepartment.updatedAt ?
                                                                            new Date(selectedDepartment.updatedAt).toLocaleDateString() :
                                                                            'Unknown' })] }), _jsxs("div", { children: [_jsx("span", { className: "text-sm text-[#969696]", children: "Status:" }), _jsx("p", { className: selectedDepartment.isActive ? 'text-emerald-400' : 'text-gray-400', children: selectedDepartment.isActive ? 'Active' : 'Inactive' })] })] })] })] })] })) : (_jsx("div", { className: "flex items-center justify-center h-full text-[#969696]", children: _jsxs("div", { className: "text-center", children: [_jsx("h3", { className: "text-xl mb-2", children: "Select a Department" }), _jsx("p", { children: "Choose a department from the list to view details" })] }) })) })] }) }), showModal && (_jsx(DepartmentForm, { department: editingDepartment, departments: departments, people: people, onSave: handleSaveDepartment, onCancel: () => {
                    setShowModal(false);
                    setEditingDepartment(null);
                    setError(null);
                } }))] }));
};
export default DepartmentsList;
