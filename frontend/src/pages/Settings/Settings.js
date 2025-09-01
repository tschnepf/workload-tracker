import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Settings Page - Role management interface
 * Phase 2.2: Settings page with role management section
 */
import { useState, useEffect } from 'react';
import { rolesApi } from '@/services/api';
import Sidebar from '@/components/layout/Sidebar';
import RoleList from './components/RoleList';
import RoleForm from './components/RoleForm';
import RoleDeleteConfirm from './components/RoleDeleteConfirm';
const Settings = () => {
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // Role management state
    const [editingRole, setEditingRole] = useState(null);
    const [deletingRole, setDeletingRole] = useState(null);
    const [showRoleForm, setShowRoleForm] = useState(false);
    useEffect(() => {
        loadRoles();
    }, []);
    const loadRoles = async () => {
        try {
            setLoading(true);
            setError(null);
            const rolesList = await rolesApi.list();
            setRoles(rolesList.results || []);
        }
        catch (err) {
            setError(`Failed to load roles: ${err.message}`);
            console.error('Error loading roles:', err);
        }
        finally {
            setLoading(false);
        }
    };
    const handleCreateRole = () => {
        setEditingRole(null);
        setShowRoleForm(true);
    };
    const handleEditRole = (role) => {
        setEditingRole(role);
        setShowRoleForm(true);
    };
    const handleDeleteRole = (role) => {
        setDeletingRole(role);
    };
    const handleRoleFormClose = () => {
        setShowRoleForm(false);
        setEditingRole(null);
    };
    const handleRoleFormSave = () => {
        setShowRoleForm(false);
        setEditingRole(null);
        loadRoles(); // Refresh the list
    };
    const handleDeleteConfirm = () => {
        setDeletingRole(null);
        loadRoles(); // Refresh the list
    };
    const handleDeleteCancel = () => {
        setDeletingRole(null);
    };
    if (loading) {
        return (_jsxs("div", { className: "flex", children: [_jsx(Sidebar, {}), _jsx("div", { className: "flex-1 p-6", children: _jsx("div", { className: "text-[#cccccc]", children: "Loading settings..." }) })] }));
    }
    return (_jsxs("div", { className: "flex", children: [_jsx(Sidebar, {}), _jsxs("div", { className: "flex-1 p-6", children: [_jsxs("div", { className: "max-w-6xl mx-auto", children: [_jsx("h1", { className: "text-2xl font-bold text-[#cccccc] mb-6", children: "Settings" }), error && (_jsx("div", { className: "bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded mb-6", children: error })), _jsxs("div", { className: "bg-[#2d2d30] border border-[#3e3e42] rounded-lg p-6", children: [_jsxs("div", { className: "flex items-center justify-between mb-6", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-semibold text-[#cccccc] mb-1", children: "Role Management" }), _jsx("p", { className: "text-[#969696] text-sm", children: "Manage job roles used throughout the system. Roles can be assigned to people and used for reporting." })] }), _jsx("button", { onClick: handleCreateRole, className: "bg-[#007acc] hover:bg-[#005a9e] text-white px-4 py-2 rounded-md font-medium transition-colors", children: "Add Role" })] }), _jsx(RoleList, { roles: roles, onEditRole: handleEditRole, onDeleteRole: handleDeleteRole, loading: loading })] })] }), showRoleForm && (_jsx(RoleForm, { role: editingRole, onSave: handleRoleFormSave, onCancel: handleRoleFormClose })), deletingRole && (_jsx(RoleDeleteConfirm, { role: deletingRole, onConfirm: handleDeleteConfirm, onCancel: handleDeleteCancel }))] })] }));
};
export default Settings;
