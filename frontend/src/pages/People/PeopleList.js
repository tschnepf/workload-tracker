import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * People List - Split-panel layout following ProjectsList.tsx pattern
 * Left panel: People list with filtering
 * Right panel: Person details with skills management
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { peopleApi, personSkillsApi, departmentsApi, rolesApi } from '@/services/api';
import Sidebar from '@/components/layout/Sidebar';
import SkillsAutocomplete from '@/components/skills/SkillsAutocomplete';
const PeopleList = () => {
    const [people, setPeople] = useState([]);
    const [departments, setDepartments] = useState([]); // Phase 2: Department filter
    const [roles, setRoles] = useState([]); // Phase 1: Role management
    const [selectedPerson, setSelectedPerson] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState([]); // Multi-select department filter
    const [locationFilter, setLocationFilter] = useState([]); // Multi-select location filter
    const [sortBy, setSortBy] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // Bulk actions state
    const [bulkMode, setBulkMode] = useState(false);
    const [selectedPeopleIds, setSelectedPeopleIds] = useState(new Set());
    const [bulkDepartment, setBulkDepartment] = useState('');
    // Person skills data
    const [personSkills, setPersonSkills] = useState([]);
    const [editingSkills, setEditingSkills] = useState(false);
    const [editingProficiency, setEditingProficiency] = useState(null); // skillTagName-skillType key
    const [skillsData, setSkillsData] = useState({
        strengths: [],
        development: [],
        learning: []
    });
    // Inline editing state for person details
    const [editingPersonData, setEditingPersonData] = useState(null);
    const [isUpdatingPerson, setIsUpdatingPerson] = useState(false);
    // Gear menu state
    const [showGearMenu, setShowGearMenu] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    // Dropdown states
    const [showDepartmentDropdown, setShowDepartmentDropdown] = useState(false);
    const [showLocationDropdown, setShowLocationDropdown] = useState(false);
    // Location autocomplete state
    const [showLocationAutocomplete, setShowLocationAutocomplete] = useState(false);
    const [locationInputValue, setLocationInputValue] = useState('');
    const [selectedLocationIndex, setSelectedLocationIndex] = useState(-1);
    // Role autocomplete state - CRITICAL: follows AUTOCOMPLETE STANDARDS
    const [showRoleAutocomplete, setShowRoleAutocomplete] = useState(false);
    const [roleInputValue, setRoleInputValue] = useState('');
    const [selectedRoleIndex, setSelectedRoleIndex] = useState(-1);
    const proficiencyLevels = [
        { value: 'beginner', label: 'Beginner' },
        { value: 'intermediate', label: 'Intermediate' },
        { value: 'advanced', label: 'Advanced' },
        { value: 'expert', label: 'Expert' }
    ];
    // Roles are now loaded from API instead of hardcoded
    useEffect(() => {
        loadPeople();
        loadDepartments(); // Phase 2: Load departments for filter
        loadRoles(); // Phase 1: Load roles for dropdowns
    }, []);
    // Phase 2: Load departments for filter dropdown
    const loadDepartments = async () => {
        try {
            const departmentsList = await departmentsApi.listAll();
            setDepartments(departmentsList);
        }
        catch (err) {
            console.error('Error loading departments:', err);
        }
    };
    // Phase 1: Load roles for dropdown
    const loadRoles = async () => {
        try {
            const rolesList = await rolesApi.listAll();
            setRoles(rolesList);
        }
        catch (err) {
            console.error('Error loading roles:', err);
        }
    };
    useEffect(() => {
        if (selectedPerson?.id) {
            loadPersonSkills(selectedPerson.id);
        }
    }, [selectedPerson]);
    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            const target = event.target;
            if (editingProficiency && !target.closest('.proficiency-dropdown')) {
                setEditingProficiency(null);
            }
            if (showGearMenu && !target.closest('.gear-menu')) {
                setShowGearMenu(false);
            }
            if (showDepartmentDropdown && !target.closest('.department-filter')) {
                setShowDepartmentDropdown(false);
            }
            if (showLocationDropdown && !target.closest('.location-filter')) {
                setShowLocationDropdown(false);
            }
            if (showLocationAutocomplete && !target.closest('.location-autocomplete')) {
                setShowLocationAutocomplete(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [editingProficiency, showGearMenu, showDepartmentDropdown, showLocationDropdown, showLocationAutocomplete]);
    const loadPeople = async () => {
        try {
            setLoading(true);
            const peopleList = await peopleApi.listAll();
            setPeople(peopleList);
            // Auto-select first person if none selected
            if (peopleList.length > 0 && !selectedPerson) {
                setSelectedPerson(peopleList[0]);
                setSelectedIndex(0);
                setEditingPersonData({ ...peopleList[0] }); // Initialize editing data
                setLocationInputValue(peopleList[0].location || ''); // Initialize location input value
                setRoleInputValue(peopleList[0].roleName || ''); // Initialize role input value
            }
        }
        catch (err) {
            setError('Failed to load people');
        }
        finally {
            setLoading(false);
        }
    };
    const loadPersonSkills = async (personId) => {
        try {
            const response = await personSkillsApi.list({ person: personId });
            const skills = response.results || [];
            setPersonSkills(skills);
            // Group skills by type
            const grouped = {
                strengths: skills.filter(skill => skill.skillType === 'strength'),
                development: skills.filter(skill => skill.skillType === 'development'),
                learning: skills.filter(skill => skill.skillType === 'learning')
            };
            setSkillsData(grouped);
        }
        catch (err) {
            console.error('Failed to load person skills:', err);
        }
    };
    const handlePersonClick = (person, index) => {
        setSelectedPerson(person);
        setSelectedIndex(index);
        setEditingPersonData({ ...person }); // Initialize editing data with current person data
        setLocationInputValue(person.location || ''); // Initialize location input value
        setRoleInputValue(person.roleName || ''); // Initialize role input value
    };
    const handlePersonFieldChange = (field, value) => {
        if (!editingPersonData)
            return;
        setEditingPersonData(prev => ({
            ...prev,
            [field]: value
        }));
    };
    const savePersonField = async (field, overrideValue) => {
        console.log('🔍 [DEBUG] savePersonField called with:', {
            field,
            overrideValue,
            selectedPersonId: selectedPerson?.id,
            editingPersonData,
            isUpdatingPerson
        });
        if (!selectedPerson?.id || !editingPersonData || isUpdatingPerson) {
            console.log('🔍 [DEBUG] savePersonField early return - conditions not met:', {
                hasSelectedPersonId: !!selectedPerson?.id,
                hasEditingPersonData: !!editingPersonData,
                isUpdatingPerson
            });
            return;
        }
        try {
            setIsUpdatingPerson(true);
            setError(null);
            // Use override value if provided, otherwise use current form data
            const fieldValue = overrideValue !== undefined ? overrideValue : editingPersonData[field];
            const updateData = {
                [field]: fieldValue
            };
            // Handle special cases
            if (field === 'weeklyCapacity') {
                updateData.weeklyCapacity = Number(fieldValue) || 36;
            }
            console.log('🔍 [DEBUG] About to call peopleApi.update with:', {
                id: selectedPerson.id,
                updateData,
                field,
                fieldValue,
                usedOverrideValue: overrideValue !== undefined
            });
            const result = await peopleApi.update(selectedPerson.id, updateData);
            console.log('🔍 [DEBUG] peopleApi.update result:', result);
            // Handle special cases for updates that need additional data
            let finalUpdateData = { ...updateData };
            if (field === 'department') {
                const selectedDept = departments.find(d => d.id === fieldValue);
                finalUpdateData.departmentName = selectedDept?.name || '';
                console.log('🔍 [DEBUG] Department update - adding departmentName:', {
                    deptId: fieldValue,
                    deptName: finalUpdateData.departmentName,
                    selectedDept
                });
            }
            if (field === 'role') {
                const selectedRole = roles.find(r => r.id === fieldValue);
                finalUpdateData.roleName = selectedRole?.name || '';
                console.log('🔍 [DEBUG] Role update - adding roleName:', {
                    roleId: fieldValue,
                    roleName: finalUpdateData.roleName,
                    selectedRole
                });
            }
            // Update local state
            setSelectedPerson(prev => ({ ...prev, ...finalUpdateData }));
            // Update the people list
            setPeople(prev => prev.map(person => person.id === selectedPerson.id
                ? { ...person, ...finalUpdateData }
                : person));
        }
        catch (err) {
            setError(`Failed to update ${field}: ${err.message}`);
            // Reset editing data to original values on error
            setEditingPersonData({ ...selectedPerson });
        }
        finally {
            setIsUpdatingPerson(false);
        }
    };
    const handleNameEdit = () => {
        setEditingName(true);
        setShowGearMenu(false);
    };
    const handleNameSave = async () => {
        if (!selectedPerson?.id || !editingPersonData?.name?.trim()) {
            setEditingName(false);
            return;
        }
        try {
            setIsUpdatingPerson(true);
            await peopleApi.update(selectedPerson.id, { name: editingPersonData.name.trim() });
            // Update local state
            setSelectedPerson(prev => ({ ...prev, name: editingPersonData.name.trim() }));
            setPeople(prev => prev.map(person => person.id === selectedPerson.id
                ? { ...person, name: editingPersonData.name.trim() }
                : person));
            setEditingName(false);
        }
        catch (err) {
            setError(`Failed to update name: ${err.message}`);
        }
        finally {
            setIsUpdatingPerson(false);
        }
    };
    const handleNameCancel = () => {
        if (selectedPerson) {
            setEditingPersonData(prev => ({ ...prev, name: selectedPerson.name }));
        }
        setEditingName(false);
    };
    const handleDeletePerson = async () => {
        if (!selectedPerson?.id)
            return;
        try {
            setIsUpdatingPerson(true);
            await peopleApi.delete(selectedPerson.id);
            // Remove from local state
            const updatedPeople = people.filter(p => p.id !== selectedPerson.id);
            setPeople(updatedPeople);
            // Select next person or clear selection
            if (updatedPeople.length > 0) {
                const nextIndex = Math.min(selectedIndex, updatedPeople.length - 1);
                setSelectedPerson(updatedPeople[nextIndex]);
                setSelectedIndex(nextIndex);
                setEditingPersonData({ ...updatedPeople[nextIndex] });
            }
            else {
                setSelectedPerson(null);
                setSelectedIndex(-1);
                setEditingPersonData(null);
            }
            setShowDeleteConfirm(false);
            setShowGearMenu(false);
        }
        catch (err) {
            setError(`Failed to delete person: ${err.message}`);
        }
        finally {
            setIsUpdatingPerson(false);
        }
    };
    const handleSkillsEdit = () => {
        setEditingSkills(true);
    };
    const handleSkillsSave = async () => {
        if (!selectedPerson?.id)
            return;
        try {
            // Get all current skills for this person
            const currentSkills = [...skillsData.strengths, ...skillsData.development, ...skillsData.learning];
            // Delete all existing skills for this person
            for (const skill of personSkills) {
                if (skill.id) {
                    await personSkillsApi.delete(skill.id);
                }
            }
            // Create new skills
            for (const skill of currentSkills) {
                // Skip skills with invalid skillTagId
                if (!skill.skillTagId) {
                    continue;
                }
                const skillData = {
                    person: selectedPerson.id,
                    skillTagId: skill.skillTagId,
                    skillType: skill.skillType,
                    proficiencyLevel: skill.proficiencyLevel || 'beginner',
                    notes: skill.notes || ''
                };
                await personSkillsApi.create(skillData);
            }
            // Reload person skills
            await loadPersonSkills(selectedPerson.id);
            setEditingSkills(false);
        }
        catch (err) {
            setError('Failed to update skills');
        }
    };
    const handleSkillsCancel = () => {
        // Reset to original data
        if (selectedPerson?.id) {
            loadPersonSkills(selectedPerson.id);
        }
        setEditingSkills(false);
    };
    const updateSkillsByType = (skillType, skills) => {
        setSkillsData(prev => ({
            ...prev,
            [skillType]: skills
        }));
    };
    const handleProficiencyClick = (skill, skillType) => {
        if (editingSkills)
            return; // Only allow proficiency editing when NOT in skills edit mode
        const key = `${skill.skillTagName}-${skillType}`;
        setEditingProficiency(editingProficiency === key ? null : key);
    };
    const handleProficiencyChange = async (skill, skillType, newProficiency) => {
        if (!selectedPerson?.id)
            return;
        try {
            // Find the actual PersonSkill record to update
            const apiSkillType = skillType === 'strengths' ? 'strength' : skillType.slice(0, -1); // Map to API format
            const skillToUpdate = personSkills.find(s => s.skillTagName === skill.skillTagName && s.skillType === apiSkillType);
            if (skillToUpdate?.id) {
                // Update in database immediately
                await personSkillsApi.update(skillToUpdate.id, {
                    proficiencyLevel: newProficiency
                });
                // Update local state
                const updatedSkills = skillsData[skillType].map(s => s.skillTagName === skill.skillTagName
                    ? { ...s, proficiencyLevel: newProficiency }
                    : s);
                updateSkillsByType(skillType, updatedSkills);
                // Also update the main personSkills array
                const updatedPersonSkills = personSkills.map(s => s.id === skillToUpdate.id
                    ? { ...s, proficiencyLevel: newProficiency }
                    : s);
                setPersonSkills(updatedPersonSkills);
            }
        }
        catch (error) {
            console.error('Failed to update proficiency level:', error);
            setError('Failed to update skill proficiency');
        }
        setEditingProficiency(null);
    };
    const handleBulkAssignment = async () => {
        if (!bulkDepartment || selectedPeopleIds.size === 0)
            return;
        try {
            setLoading(true);
            setError(null);
            // Update each selected person
            const updatePromises = Array.from(selectedPeopleIds).map(personId => {
                const updateData = {
                    department: bulkDepartment === 'unassigned' ? null : parseInt(bulkDepartment)
                };
                return peopleApi.update(personId, updateData);
            });
            await Promise.all(updatePromises);
            // Reload people data to reflect changes
            await loadPeople();
            await loadDepartments();
            // Clear bulk selection
            setSelectedPeopleIds(new Set());
            setBulkDepartment('');
            // Show success message (could be improved with a proper toast)
            const departmentName = bulkDepartment === 'unassigned'
                ? 'removed from departments'
                : departments.find(d => d.id?.toString() === bulkDepartment)?.name || 'unknown department';
        }
        catch (err) {
            setError(`Failed to update department assignments: ${err.message}`);
        }
        finally {
            setLoading(false);
        }
    };
    // Extract unique locations from people data
    const uniqueLocations = Array.from(new Set(people
        .map(person => person.location?.trim())
        .filter(location => location && location !== ''))).sort();
    // Filtered locations for autocomplete
    const filteredLocations = uniqueLocations.filter(location => location.toLowerCase().includes(locationInputValue.toLowerCase()));
    // Filtered roles for autocomplete - CRITICAL: follows AUTOCOMPLETE STANDARDS
    const filteredRoles = roles.filter(role => role.isActive && role.name.toLowerCase().includes(roleInputValue.toLowerCase()));
    // Helper function to select a location from autocomplete
    const selectLocation = (location) => {
        setLocationInputValue(location);
        handlePersonFieldChange('location', location);
        setShowLocationAutocomplete(false);
        setSelectedLocationIndex(-1);
        savePersonField('location', location);
    };
    // Helper function to select a role from autocomplete - CRITICAL: follows AUTOCOMPLETE STANDARDS
    const selectRole = (role) => {
        setRoleInputValue(role.name);
        handlePersonFieldChange('role', role.id);
        handlePersonFieldChange('roleName', role.name);
        setShowRoleAutocomplete(false);
        setSelectedRoleIndex(-1);
        savePersonField('role', role.id);
    };
    // Handle column header clicks for sorting
    const handleColumnSort = (column) => {
        if (sortBy === column) {
            // Toggle direction if clicking the same column
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        }
        else {
            // Set new column and reset to ascending
            setSortBy(column);
            setSortDirection('asc');
        }
    };
    // Sortable column header component
    const SortableHeader = ({ column, children, className = "" }) => (_jsxs("button", { onClick: () => handleColumnSort(column), className: `flex items-center gap-1 text-left hover:text-[#cccccc] transition-colors ${className}`, children: [children, sortBy === column && (_jsx("svg", { className: `w-3 h-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M6 9l6 6 6-6" }) }))] }));
    // Filter and sort people
    const filteredAndSortedPeople = people
        .filter(person => {
        // Enhanced search filter (includes notes/description + location search)
        const matchesSearch = !searchTerm ||
            person.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            person.roleName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            person.departmentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            person.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            person.notes?.toLowerCase().includes(searchTerm.toLowerCase());
        // Department filter - Multi-select
        const matchesDepartment = departmentFilter.length === 0 ||
            departmentFilter.includes(person.department?.toString() || '') ||
            (departmentFilter.includes('unassigned') && !person.department);
        // Location filter - Multi-select
        const matchesLocation = locationFilter.length === 0 ||
            locationFilter.includes(person.location?.trim() || '') ||
            (locationFilter.includes('unspecified') && (!person.location || person.location.trim() === ''));
        return matchesSearch && matchesDepartment && matchesLocation;
    })
        .sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
            case 'location':
                const aLoc = a.location?.trim() || 'zzz_unspecified'; // Put unspecified at end
                const bLoc = b.location?.trim() || 'zzz_unspecified';
                comparison = aLoc.localeCompare(bLoc);
                break;
            case 'department':
                const aDept = a.departmentName || 'zzz_unassigned';
                const bDept = b.departmentName || 'zzz_unassigned';
                comparison = aDept.localeCompare(bDept);
                break;
            case 'weeklyCapacity':
                comparison = (a.weeklyCapacity || 0) - (b.weeklyCapacity || 0);
                break;
            case 'role':
                const aRole = a.roleName || 'zzz_no_role';
                const bRole = b.roleName || 'zzz_no_role';
                comparison = aRole.localeCompare(bRole);
                break;
            case 'name':
            default:
                comparison = a.name.localeCompare(b.name);
                break;
        }
        return sortDirection === 'asc' ? comparison : -comparison;
    });
    // Auto-select first person from filtered list
    useEffect(() => {
        if (filteredAndSortedPeople.length > 0 && !selectedPerson) {
            setSelectedPerson(filteredAndSortedPeople[0]);
            setSelectedIndex(0);
            setEditingPersonData({ ...filteredAndSortedPeople[0] }); // Initialize editing data
            setLocationInputValue(filteredAndSortedPeople[0].location || ''); // Initialize location input value
        }
    }, [filteredAndSortedPeople, selectedPerson]);
    if (loading) {
        return (_jsx("div", { className: "min-h-screen bg-[#1e1e1e] flex items-center justify-center", children: _jsx("div", { className: "text-[#969696]", children: "Loading people..." }) }));
    }
    return (_jsxs("div", { className: "min-h-screen bg-[#1e1e1e] flex", children: [_jsx(Sidebar, {}), _jsxs("div", { className: "flex-1 flex h-screen bg-[#1e1e1e]", children: [_jsxs("div", { className: "w-1/2 border-r border-[#3e3e42] flex flex-col min-w-0", children: [_jsxs("div", { className: "p-3 border-b border-[#3e3e42]", children: [_jsxs("div", { className: "flex justify-between items-center mb-2", children: [_jsx("h1", { className: "text-lg font-semibold text-[#cccccc]", children: "People" }), _jsx(Link, { to: "/people/new", children: _jsx("button", { className: "px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors", children: "+ New" }) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("input", { type: "text", placeholder: "Search people (name, role, department, location, notes)", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), className: "w-full px-3 py-1.5 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none" }), _jsxs("div", { className: "department-filter relative", children: [_jsxs("div", { onClick: () => setShowDepartmentDropdown(!showDepartmentDropdown), className: "w-full px-3 py-1.5 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] min-h-[32px] flex flex-wrap items-center gap-1 cursor-pointer hover:border-[#007acc] focus:border-[#007acc]", children: [departmentFilter.length === 0 ? (_jsx("span", { className: "text-[#969696]", children: "All Departments" })) : (_jsxs(_Fragment, { children: [departmentFilter.map((deptId, index) => {
                                                                        const department = departments.find(d => d.id?.toString() === deptId);
                                                                        const displayName = deptId === 'unassigned' ? 'Not Assigned' : department?.name || 'Unknown';
                                                                        return (_jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 bg-[#007acc]/20 text-[#007acc] rounded text-xs border border-[#007acc]/30", children: [displayName, _jsx("button", { onClick: (e) => {
                                                                                        e.stopPropagation();
                                                                                        setDepartmentFilter(prev => prev.filter(d => d !== deptId));
                                                                                    }, className: "hover:text-[#007acc] hover:bg-[#007acc]/30 rounded-full w-3 h-3 flex items-center justify-center", children: "\u00D7" })] }, index));
                                                                    }), _jsx("button", { onClick: (e) => {
                                                                            e.stopPropagation();
                                                                            setDepartmentFilter([]);
                                                                        }, className: "text-xs text-[#969696] hover:text-[#cccccc] ml-1", children: "Clear All" })] })), _jsx("svg", { className: "ml-auto w-4 h-4 text-[#969696]", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: _jsx("path", { d: "M6 9l6 6 6-6" }) })] }), showDepartmentDropdown && (_jsxs("div", { className: "absolute top-full left-0 right-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-40 max-h-40 overflow-y-auto", children: [_jsxs("button", { onClick: () => {
                                                                    if (!departmentFilter.includes('unassigned')) {
                                                                        setDepartmentFilter(prev => [...prev, 'unassigned']);
                                                                    }
                                                                }, className: `w-full text-left px-3 py-2 text-sm hover:bg-[#3e3e42] transition-colors ${departmentFilter.includes('unassigned') ? 'bg-[#007acc]/20 text-[#007acc]' : 'text-[#cccccc]'}`, disabled: departmentFilter.includes('unassigned'), children: ["Not Assigned (", people.filter(p => !p.department).length, ")"] }), departments.map((dept) => (_jsxs("button", { onClick: () => {
                                                                    const deptId = dept.id?.toString() || '';
                                                                    if (!departmentFilter.includes(deptId)) {
                                                                        setDepartmentFilter(prev => [...prev, deptId]);
                                                                    }
                                                                }, className: `w-full text-left px-3 py-2 text-sm hover:bg-[#3e3e42] transition-colors ${departmentFilter.includes(dept.id?.toString() || '') ? 'bg-[#007acc]/20 text-[#007acc]' : 'text-[#cccccc]'}`, disabled: departmentFilter.includes(dept.id?.toString() || ''), children: [dept.name, " (", people.filter(p => p.department === dept.id).length, ")"] }, dept.id)))] }))] }), _jsxs("div", { className: "location-filter relative", children: [_jsxs("div", { onClick: () => setShowLocationDropdown(!showLocationDropdown), className: "w-full px-3 py-1.5 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] min-h-[32px] flex flex-wrap items-center gap-1 cursor-pointer hover:border-[#007acc] focus:border-[#007acc]", children: [locationFilter.length === 0 ? (_jsx("span", { className: "text-[#969696]", children: "All Locations" })) : (_jsxs(_Fragment, { children: [locationFilter.map((location, index) => (_jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 bg-[#007acc]/20 text-[#007acc] rounded text-xs border border-[#007acc]/30", children: [location === 'unspecified' ? 'Not Specified' : location, _jsx("button", { onClick: (e) => {
                                                                                    e.stopPropagation();
                                                                                    setLocationFilter(prev => prev.filter(l => l !== location));
                                                                                }, className: "hover:text-[#007acc] hover:bg-[#007acc]/30 rounded-full w-3 h-3 flex items-center justify-center", children: "\u00D7" })] }, index))), _jsx("button", { onClick: (e) => {
                                                                            e.stopPropagation();
                                                                            setLocationFilter([]);
                                                                        }, className: "text-xs text-[#969696] hover:text-[#cccccc] ml-1", children: "Clear All" })] })), _jsx("svg", { className: "ml-auto w-4 h-4 text-[#969696]", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: _jsx("path", { d: "M6 9l6 6 6-6" }) })] }), showLocationDropdown && (_jsxs("div", { className: "absolute top-full left-0 right-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-40 max-h-40 overflow-y-auto", children: [_jsxs("button", { onClick: () => {
                                                                    if (!locationFilter.includes('unspecified')) {
                                                                        setLocationFilter(prev => [...prev, 'unspecified']);
                                                                    }
                                                                }, className: `w-full text-left px-3 py-2 text-sm hover:bg-[#3e3e42] transition-colors ${locationFilter.includes('unspecified') ? 'bg-[#007acc]/20 text-[#007acc]' : 'text-[#cccccc]'}`, disabled: locationFilter.includes('unspecified'), children: ["Not Specified (", people.filter(p => !p.location || p.location.trim() === '').length, ")"] }), uniqueLocations.map((location) => (_jsxs("button", { onClick: () => {
                                                                    if (!locationFilter.includes(location)) {
                                                                        setLocationFilter(prev => [...prev, location]);
                                                                    }
                                                                }, className: `w-full text-left px-3 py-2 text-sm hover:bg-[#3e3e42] transition-colors ${locationFilter.includes(location) ? 'bg-[#007acc]/20 text-[#007acc]' : 'text-[#cccccc]'}`, disabled: locationFilter.includes(location), children: [location, " (", people.filter(p => p.location?.trim() === location).length, ")"] }, location)))] }))] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("button", { onClick: () => {
                                                            setBulkMode(!bulkMode);
                                                            setSelectedPeopleIds(new Set());
                                                        }, className: `px-2 py-1 text-xs rounded border transition-colors ${bulkMode
                                                            ? 'bg-[#007acc] border-[#007acc] text-white'
                                                            : 'bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52]'}`, children: bulkMode ? 'Exit Bulk Mode' : 'Bulk Actions' }), bulkMode && selectedPeopleIds.size > 0 && (_jsxs("span", { className: "text-xs text-[#969696]", children: [selectedPeopleIds.size, " selected"] }))] })] })] }), error && (_jsx("div", { className: "p-3 bg-red-500/20 border-b border-red-500/50", children: _jsx("div", { className: "text-red-400 text-sm", children: error }) })), _jsxs("div", { className: "flex-1 overflow-hidden", children: [_jsxs("div", { className: "grid grid-cols-12 gap-2 px-2 py-1.5 text-xs text-[#969696] font-medium border-b border-[#3e3e42] bg-[#2d2d30]", children: [bulkMode && _jsx("div", { className: "col-span-1", children: "SELECT" }), _jsx("div", { className: bulkMode ? "col-span-3" : "col-span-3", children: _jsx(SortableHeader, { column: "name", children: "NAME" }) }), _jsx("div", { className: bulkMode ? "col-span-2" : "col-span-2", children: _jsx(SortableHeader, { column: "department", children: "DEPARTMENT" }) }), _jsx("div", { className: bulkMode ? "col-span-2" : "col-span-2", children: _jsx(SortableHeader, { column: "location", children: "LOCATION" }) }), _jsx("div", { className: bulkMode ? "col-span-2" : "col-span-2", children: _jsx(SortableHeader, { column: "weeklyCapacity", children: "CAPACITY" }) }), _jsx("div", { className: bulkMode ? "col-span-2" : "col-span-3", children: _jsx(SortableHeader, { column: "role", children: "ROLE" }) })] }), _jsx("div", { className: "overflow-y-auto h-full", children: filteredAndSortedPeople.length === 0 ? (_jsx("div", { className: "flex items-center justify-center py-12", children: _jsxs("div", { className: "text-center text-[#969696]", children: [_jsx("div", { className: "text-lg mb-2", children: "No people found" }), _jsx("div", { className: "text-sm", children: "Try adjusting your search or create a new person" })] }) })) : (_jsxs(_Fragment, { children: [filteredAndSortedPeople.map((person, index) => (_jsxs("div", { onClick: bulkMode ? undefined : () => handlePersonClick(person, index), className: `grid grid-cols-12 gap-2 px-2 py-1.5 text-sm border-b border-[#3e3e42] transition-colors focus:outline-none ${bulkMode
                                                        ? 'hover:bg-[#3e3e42]/30'
                                                        : `cursor-pointer hover:bg-[#3e3e42]/50 ${selectedPerson?.id === person.id ? 'bg-[#007acc]/20 border-[#007acc]' : ''}`}`, tabIndex: 0, children: [bulkMode && (_jsx("div", { className: "col-span-1 flex items-center", children: _jsx("input", { type: "checkbox", checked: selectedPeopleIds.has(person.id), onChange: (e) => {
                                                                    const newSelected = new Set(selectedPeopleIds);
                                                                    if (e.target.checked) {
                                                                        newSelected.add(person.id);
                                                                    }
                                                                    else {
                                                                        newSelected.delete(person.id);
                                                                    }
                                                                    setSelectedPeopleIds(newSelected);
                                                                }, className: "w-3 h-3 text-[#007acc] bg-[#3e3e42] border-[#3e3e42] rounded focus:ring-[#007acc] focus:ring-2" }) })), _jsx("div", { className: "col-span-3 text-[#cccccc] font-medium", children: person.name }), _jsx("div", { className: "col-span-2 text-[#969696] text-xs", children: person.departmentName || 'None' }), _jsx("div", { className: "col-span-2 text-[#969696] text-xs", children: person.location || 'Not specified' }), _jsxs("div", { className: "col-span-2 text-[#969696] text-xs", children: [person.weeklyCapacity || 36, "h/week"] }), _jsx("div", { className: `${bulkMode ? 'col-span-2' : 'col-span-3'} text-[#969696] text-xs`, children: person.roleName || 'Not specified' })] }, person.id))), _jsx("div", { className: "py-1.5", children: _jsx("div", { className: "py-1.5", children: _jsx("div", { className: "py-1.5" }) }) })] })) })] }), bulkMode && selectedPeopleIds.size > 0 && (_jsx("div", { className: "p-3 border-t border-[#3e3e42] bg-[#2d2d30]", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("span", { className: "text-sm text-[#cccccc] font-medium", children: ["Assign ", selectedPeopleIds.size, " people to:"] }), _jsxs("select", { value: bulkDepartment, onChange: (e) => setBulkDepartment(e.target.value), className: "px-3 py-1.5 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] focus:border-[#007acc] focus:outline-none", children: [_jsx("option", { value: "", children: "Select Department..." }), _jsx("option", { value: "unassigned", children: "Remove from Department" }), departments.map((dept) => (_jsx("option", { value: dept.id, children: dept.name }, dept.id)))] }), _jsx("button", { onClick: handleBulkAssignment, disabled: !bulkDepartment, className: "px-3 py-1.5 text-sm rounded bg-[#007acc] text-white hover:bg-[#005fa3] disabled:opacity-50 disabled:cursor-not-allowed transition-colors", children: "Assign" }), _jsx("button", { onClick: () => setSelectedPeopleIds(new Set()), className: "px-3 py-1.5 text-sm rounded border border-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors", children: "Clear Selection" })] }) }))] }), _jsx("div", { className: "w-1/2 flex flex-col bg-[#2d2d30] min-w-0", children: selectedPerson ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "p-4 border-b border-[#3e3e42]", children: _jsxs("div", { className: "flex justify-between items-start mb-3", children: [_jsxs("div", { className: "flex-1", children: [editingName ? (_jsxs("div", { className: "mb-2", children: [_jsx("input", { type: "text", value: editingPersonData?.name || '', onChange: (e) => handlePersonFieldChange('name', e.target.value), onKeyDown: (e) => {
                                                                    if (e.key === 'Enter') {
                                                                        handleNameSave();
                                                                    }
                                                                    else if (e.key === 'Escape') {
                                                                        handleNameCancel();
                                                                    }
                                                                }, onBlur: handleNameSave, disabled: isUpdatingPerson, className: "text-xl font-bold bg-[#3e3e42] border border-[#3e3e42] rounded px-2 py-1 text-[#cccccc] focus:outline-none focus:ring-1 focus:ring-[#007acc] focus:border-transparent disabled:opacity-50 w-full", autoFocus: true }), _jsx("div", { className: "text-xs text-[#969696] mt-1", children: "Press Enter to save, Escape to cancel" })] })) : (_jsx("h2", { className: "text-xl font-bold text-[#cccccc] mb-2", children: selectedPerson.name })), _jsxs("div", { className: "grid grid-cols-2 gap-4 text-sm", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[#969696] text-xs mb-1", children: "Role:" }), _jsxs("select", { value: editingPersonData?.role || '', onChange: (e) => {
                                                                            const roleId = e.target.value ? parseInt(e.target.value) : null;
                                                                            console.log('🔍 [DEBUG] Role dropdown changed to:', roleId);
                                                                            handlePersonFieldChange('role', roleId);
                                                                            // Pass the new value directly to avoid state timing issues
                                                                            savePersonField('role', roleId);
                                                                        }, disabled: isUpdatingPerson, className: "w-full px-2 py-1 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] focus:outline-none focus:ring-1 focus:ring-[#007acc] focus:border-transparent disabled:opacity-50", children: [_jsx("option", { value: "", children: "Select Role..." }), roles.map((role) => (_jsx("option", { value: role.id, children: role.name }, role.id)))] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[#969696] text-xs mb-1", children: "Weekly Capacity:" }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("input", { type: "number", min: "1", max: "80", value: editingPersonData?.weeklyCapacity || 36, onChange: (e) => handlePersonFieldChange('weeklyCapacity', parseInt(e.target.value) || 36), onBlur: () => savePersonField('weeklyCapacity'), disabled: isUpdatingPerson, className: "w-16 px-2 py-1 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] focus:outline-none focus:ring-1 focus:ring-[#007acc] focus:border-transparent disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" }), _jsx("span", { className: "text-[#969696]", children: "hours/week" })] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[#969696] text-xs mb-1", children: "Department:" }), _jsxs("select", { value: editingPersonData?.department || '', onChange: (e) => {
                                                                            const deptId = e.target.value ? parseInt(e.target.value) : null;
                                                                            console.log('🔍 [DEBUG] Department dropdown changed to:', { deptId, rawValue: e.target.value });
                                                                            handlePersonFieldChange('department', deptId);
                                                                            // Also update the department name for display
                                                                            const selectedDept = departments.find(d => d.id === deptId);
                                                                            handlePersonFieldChange('departmentName', selectedDept?.name || '');
                                                                            // Pass the new value directly to avoid state timing issues
                                                                            savePersonField('department', deptId);
                                                                        }, disabled: isUpdatingPerson, className: "w-full px-2 py-1 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] focus:outline-none focus:ring-1 focus:ring-[#007acc] focus:border-transparent disabled:opacity-50", children: [_jsx("option", { value: "", children: "No Department" }), departments.map((dept) => (_jsx("option", { value: dept.id, children: dept.name }, dept.id)))] })] }), _jsxs("div", { className: "location-autocomplete relative", children: [_jsx("div", { className: "text-[#969696] text-xs mb-1", children: "Location:" }), _jsx("input", { type: "text", value: locationInputValue, onChange: (e) => {
                                                                            const value = e.target.value;
                                                                            setLocationInputValue(value);
                                                                            handlePersonFieldChange('location', value);
                                                                            setShowLocationAutocomplete(value.length > 0 && filteredLocations.length > 0);
                                                                            setSelectedLocationIndex(-1); // Reset selection when typing
                                                                        }, onFocus: () => {
                                                                            if (locationInputValue.length > 0 && filteredLocations.length > 0) {
                                                                                setShowLocationAutocomplete(true);
                                                                            }
                                                                        }, onKeyDown: (e) => {
                                                                            if (!showLocationAutocomplete || filteredLocations.length === 0)
                                                                                return;
                                                                            switch (e.key) {
                                                                                case 'ArrowDown':
                                                                                    e.preventDefault();
                                                                                    setSelectedLocationIndex(prev => prev < filteredLocations.length - 1 ? prev + 1 : 0);
                                                                                    break;
                                                                                case 'ArrowUp':
                                                                                    e.preventDefault();
                                                                                    setSelectedLocationIndex(prev => prev > 0 ? prev - 1 : filteredLocations.length - 1);
                                                                                    break;
                                                                                case 'Enter':
                                                                                    e.preventDefault();
                                                                                    if (selectedLocationIndex >= 0 && selectedLocationIndex < filteredLocations.length) {
                                                                                        selectLocation(filteredLocations[selectedLocationIndex]);
                                                                                    }
                                                                                    break;
                                                                                case 'Escape':
                                                                                    e.preventDefault();
                                                                                    setShowLocationAutocomplete(false);
                                                                                    setSelectedLocationIndex(-1);
                                                                                    break;
                                                                            }
                                                                        }, onBlur: (e) => {
                                                                            // Delay closing to allow for clicks on autocomplete options
                                                                            setTimeout(() => {
                                                                                setShowLocationAutocomplete(false);
                                                                                setSelectedLocationIndex(-1);
                                                                                savePersonField('location');
                                                                            }, 150);
                                                                        }, placeholder: "e.g., New York, NY or Remote", disabled: isUpdatingPerson, className: "w-full px-2 py-1 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:outline-none focus:ring-1 focus:ring-[#007acc] focus:border-transparent disabled:opacity-50" }), showLocationAutocomplete && filteredLocations.length > 0 && (_jsx("div", { className: "absolute top-full left-0 right-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 max-h-40 overflow-y-auto", children: filteredLocations.map((location, index) => (_jsx("button", { onClick: () => selectLocation(location), onMouseEnter: () => setSelectedLocationIndex(index), className: `w-full text-left px-3 py-2 text-sm transition-colors border-b border-[#3e3e42] last:border-b-0 ${selectedLocationIndex === index
                                                                                ? 'bg-[#007acc]/20 text-[#007acc] border-[#007acc]/30'
                                                                                : 'text-[#cccccc] hover:bg-[#3e3e42]'}`, children: location }, index))) }))] })] })] }), _jsxs("div", { className: "flex gap-2 items-start", children: [isUpdatingPerson && (_jsxs("div", { className: "px-2 py-0.5 text-xs text-[#007acc] flex items-center gap-1", children: [_jsx("div", { className: "w-3 h-3 border border-[#007acc] border-t-transparent rounded-full animate-spin" }), "Saving..."] })), _jsxs("div", { className: "gear-menu relative", children: [_jsx("button", { onClick: () => setShowGearMenu(!showGearMenu), disabled: isUpdatingPerson, className: "p-1 text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42] rounded transition-colors disabled:opacity-50", title: "Person options", children: _jsxs("svg", { className: "w-4 h-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [_jsx("path", { d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" }), _jsx("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" })] }) }), showGearMenu && (_jsxs("div", { className: "absolute right-0 top-full mt-1 w-48 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50", children: [_jsxs("button", { onClick: handleNameEdit, disabled: isUpdatingPerson || editingName, className: "w-full text-left px-3 py-2 text-sm text-[#cccccc] hover:bg-[#3e3e42] transition-colors disabled:opacity-50 flex items-center gap-2", children: [_jsxs("svg", { className: "w-4 h-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [_jsx("path", { d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" }), _jsx("path", { d: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" })] }), "Edit Name"] }), _jsx("div", { className: "border-t border-[#3e3e42]" }), _jsxs("button", { onClick: () => setShowDeleteConfirm(true), disabled: isUpdatingPerson, className: "w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center gap-2", children: [_jsxs("svg", { className: "w-4 h-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [_jsx("path", { d: "M3 6h18" }), _jsx("path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }), _jsx("path", { d: "M8 6V4c0-1 1-2 2-2h4c-1 0 2 1 2 2v2" }), _jsx("line", { x1: "10", y1: "11", x2: "10", y2: "17" }), _jsx("line", { x1: "14", y1: "11", x2: "14", y2: "17" })] }), "Delete Person"] })] }))] })] })] }) }), showDeleteConfirm && (_jsx("div", { className: "fixed inset-0 bg-black/50 flex items-center justify-center z-50", children: _jsxs("div", { className: "bg-[#2d2d30] border border-[#3e3e42] rounded-lg p-6 max-w-md mx-4", children: [_jsxs("div", { className: "flex items-center gap-3 mb-4", children: [_jsx("div", { className: "w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center", children: _jsx("svg", { className: "w-5 h-5 text-red-400", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: _jsx("path", { d: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" }) }) }), _jsxs("div", { children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc]", children: "Delete Person" }), _jsx("p", { className: "text-sm text-[#969696]", children: "This action cannot be undone" })] })] }), _jsxs("p", { className: "text-[#cccccc] mb-6", children: ["Are you sure you want to delete ", _jsx("strong", { children: selectedPerson.name }), "? This will permanently remove all their data, assignments, and skills."] }), _jsxs("div", { className: "flex gap-3 justify-end", children: [_jsx("button", { onClick: () => setShowDeleteConfirm(false), disabled: isUpdatingPerson, className: "px-4 py-2 text-sm border border-[#3e3e42] text-[#cccccc] hover:bg-[#3e3e42] rounded transition-colors disabled:opacity-50", children: "Cancel" }), _jsx("button", { onClick: handleDeletePerson, disabled: isUpdatingPerson, className: "px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-2", children: isUpdatingPerson ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "w-4 h-4 border border-white border-t-transparent rounded-full animate-spin" }), "Deleting..."] })) : ('Delete Person') })] })] }) })), _jsxs("div", { className: "flex-1 overflow-y-auto p-4 space-y-4", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("h3", { className: "text-lg font-semibold text-[#cccccc]", children: "Skills & Expertise" }), _jsx("div", { className: "flex gap-2", children: editingSkills ? (_jsxs(_Fragment, { children: [_jsx("button", { onClick: handleSkillsSave, className: "px-2 py-0.5 text-xs rounded border bg-[#007acc] border-[#007acc] text-white hover:bg-[#005fa3] transition-colors", children: "Save Skills" }), _jsx("button", { onClick: handleSkillsCancel, className: "px-2 py-0.5 text-xs rounded border bg-transparent border-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors", children: "Cancel" })] })) : (_jsx("button", { onClick: handleSkillsEdit, className: "px-2 py-0.5 text-xs rounded border bg-[#007acc] border-[#007acc] text-white hover:bg-[#005fa3] transition-colors", children: "Edit Skills" })) })] }), _jsxs("div", { className: "bg-[#3e3e42]/50 p-4 rounded-lg border border-[#3e3e42]", children: [_jsxs("h4", { className: "text-sm font-medium text-[#cccccc] mb-3 flex items-center gap-2", children: [_jsx("span", { className: "w-2 h-2 bg-emerald-400 rounded-full" }), "Strengths"] }), editingSkills ? (_jsx(SkillsAutocomplete, { selectedSkills: skillsData.strengths, onSkillsChange: (skills) => updateSkillsByType('strengths', skills), skillType: "strength", placeholder: "Add strengths...", className: "w-full px-3 py-2 text-sm bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none" })) : (_jsxs("div", { className: "flex flex-wrap gap-2", children: [skillsData.strengths.map((skill, index) => {
                                                            const proficiencyKey = `${skill.skillTagName}-strengths`;
                                                            const isEditingThisProficiency = editingProficiency === proficiencyKey;
                                                            return (_jsxs("div", { className: "relative", children: [_jsxs("span", { className: "px-3 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1", children: [skill.skillTagName, _jsxs("span", { className: `ml-1 opacity-75 ${!editingSkills ? 'cursor-pointer hover:opacity-100 hover:underline' : ''}`, onClick: () => handleProficiencyClick(skill, 'strengths'), children: ["(", skill.proficiencyLevel, ")"] })] }), isEditingThisProficiency && !editingSkills && (_jsx("div", { className: "proficiency-dropdown absolute top-full left-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 min-w-32", children: proficiencyLevels.map((level) => (_jsx("button", { onClick: () => handleProficiencyChange(skill, 'strengths', level.value), className: `w-full text-left px-3 py-1 text-xs hover:bg-[#3e3e42] transition-colors border-b border-[#3e3e42] last:border-b-0 ${skill.proficiencyLevel === level.value
                                                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                                                : 'text-[#cccccc]'}`, children: level.label }, level.value))) }))] }, index));
                                                        }), skillsData.strengths.length === 0 && (_jsx("span", { className: "text-[#969696] text-sm", children: "No strengths listed" }))] }))] }), _jsxs("div", { className: "bg-[#3e3e42]/50 p-4 rounded-lg border border-[#3e3e42]", children: [_jsxs("h4", { className: "text-sm font-medium text-[#cccccc] mb-3 flex items-center gap-2", children: [_jsx("span", { className: "w-2 h-2 bg-amber-400 rounded-full" }), "Areas for Improvement"] }), editingSkills ? (_jsx(SkillsAutocomplete, { selectedSkills: skillsData.development, onSkillsChange: (skills) => updateSkillsByType('development', skills), skillType: "development", placeholder: "Add development areas...", className: "w-full px-3 py-2 text-sm bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none" })) : (_jsxs("div", { className: "flex flex-wrap gap-2", children: [skillsData.development.map((skill, index) => {
                                                            const proficiencyKey = `${skill.skillTagName}-development`;
                                                            const isEditingThisProficiency = editingProficiency === proficiencyKey;
                                                            return (_jsx("span", { className: "px-3 py-1 rounded-full text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30", children: skill.skillTagName }, index));
                                                        }), skillsData.development.length === 0 && (_jsx("span", { className: "text-[#969696] text-sm", children: "No development areas listed" }))] }))] }), _jsxs("div", { className: "bg-[#3e3e42]/50 p-4 rounded-lg border border-[#3e3e42]", children: [_jsxs("h4", { className: "text-sm font-medium text-[#cccccc] mb-3 flex items-center gap-2", children: [_jsx("span", { className: "w-2 h-2 bg-blue-400 rounded-full" }), "Currently Learning"] }), editingSkills ? (_jsx(SkillsAutocomplete, { selectedSkills: skillsData.learning, onSkillsChange: (skills) => updateSkillsByType('learning', skills), skillType: "learning", placeholder: "Add learning goals...", className: "w-full px-3 py-2 text-sm bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none" })) : (_jsxs("div", { className: "flex flex-wrap gap-2", children: [skillsData.learning.map((skill, index) => {
                                                            const proficiencyKey = `${skill.skillTagName}-learning`;
                                                            const isEditingThisProficiency = editingProficiency === proficiencyKey;
                                                            return (_jsx("span", { className: "px-3 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30", children: skill.skillTagName }, index));
                                                        }), skillsData.learning.length === 0 && (_jsx("span", { className: "text-[#969696] text-sm", children: "No learning goals listed" }))] }))] })] })] })) : (_jsx("div", { className: "flex-1 flex items-center justify-center", children: _jsxs("div", { className: "text-center text-[#969696]", children: [_jsx("div", { className: "text-lg mb-2", children: "Select a person" }), _jsx("div", { className: "text-sm", children: "Choose a person from the list to view details" })] }) })) })] })] }));
};
export default PeopleList;
