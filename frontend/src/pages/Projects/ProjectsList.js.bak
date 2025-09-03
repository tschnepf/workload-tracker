import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Projects List - Split-panel layout with filterable project list and detailed project view
 */
import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useDebounce } from '@/hooks/useDebounce';
import { useProjects, useDeleteProject, useUpdateProject } from '@/hooks/useProjects';
import { usePeople } from '@/hooks/usePeople';
import { assignmentsApi, peopleApi } from '@/services/api';
import { useProjectFilterMetadata } from '@/hooks/useProjectFilterMetadata';
import { trackPerformanceEvent } from '@/utils/monitoring';
import Sidebar from '@/components/layout/Sidebar';
// Lazy load DeliverablesSection for better initial page performance
const DeliverablesSection = React.lazy(() => import('@/components/deliverables/DeliverablesSection'));
// Loading component for DeliverablesSection
const DeliverablesSectionLoader = () => (_jsx("div", { className: "border border-[#3e3e42] rounded-lg p-6 bg-[#2d2d30]", children: _jsx("div", { className: "flex items-center justify-center py-8", children: _jsxs("div", { className: "flex items-center space-x-3", children: [_jsx("div", { className: "animate-spin rounded-full h-6 w-6 border-b-2 border-[#007acc]" }), _jsx("div", { className: "text-[#969696]", children: "Loading deliverables..." })] }) }) }));
const AssignmentRow = React.memo(({ assignment, isEditing, editData, roleSearchResults, onEdit, onDelete, onSave, onCancel, onRoleSearch, onRoleSelect, onHoursChange, getCurrentWeekHours }) => {
    if (isEditing) {
        return (_jsx("div", { className: "p-3 bg-[#3e3e42]/50 rounded border border-[#3e3e42]", children: _jsxs("div", { className: "grid grid-cols-4 gap-4 items-center", children: [_jsx("div", { className: "text-[#cccccc]", children: assignment.personName || 'Unknown' }), _jsxs("div", { className: "relative", children: [_jsx("input", { type: "text", placeholder: "Role on project...", value: editData.roleSearch, onChange: (e) => onRoleSearch(e.target.value), className: "w-full px-2 py-1 text-xs bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none", autoFocus: true }), roleSearchResults.length > 0 && (_jsx("div", { className: "absolute top-full left-0 right-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 max-h-32 overflow-y-auto", children: roleSearchResults.map((role) => (_jsx("button", { onClick: () => onRoleSelect(role), className: "w-full text-left px-2 py-1 text-xs hover:bg-[#3e3e42] transition-colors text-[#cccccc] border-b border-[#3e3e42] last:border-b-0", children: role }, role))) }))] }), _jsx("div", { children: _jsx("input", { type: "number", min: "0", max: "80", step: "0.5", placeholder: "Hours", value: editData.currentWeekHours, onChange: (e) => onHoursChange(parseFloat(e.target.value) || 0), className: "w-full px-2 py-1 text-xs bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]" }) }), _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { onClick: onSave, className: "px-2 py-1 text-xs rounded border bg-[#007acc] border-[#007acc] text-white hover:bg-[#005fa3] transition-colors", children: "Save" }), _jsx("button", { onClick: onCancel, className: "px-2 py-1 text-xs rounded border bg-transparent border-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors", children: "Cancel" })] })] }) }));
    }
    return (_jsxs("div", { className: "flex justify-between items-center p-2 bg-[#3e3e42]/30 rounded", children: [_jsx("div", { className: "flex-1", children: _jsxs("div", { className: "grid grid-cols-3 gap-4", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[#cccccc]", children: assignment.personName || 'Unknown' }), _jsxs("div", { className: "flex flex-wrap gap-1 mt-1", children: [assignment.personSkills?.filter(skill => skill.skillType === 'strength').slice(0, 3).map((skill, index) => (_jsx("span", { className: "px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30", children: skill.skillTagName }, index))), assignment.personSkills?.filter(skill => skill.skillType === 'strength').length === 0 && (_jsx("span", { className: "text-[#969696] text-xs", children: "No skills listed" }))] })] }), _jsx("div", { className: "text-[#969696]", children: assignment.roleOnProject || 'Team Member' }), _jsxs("div", { className: "text-[#969696]", children: [getCurrentWeekHours(assignment), "h"] })] }) }), _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { onClick: onEdit, className: "text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-[#cccccc] hover:bg-[#3e3e42] hover:border-[#3e3e42] transition-colors", children: "Edit" }), _jsx("button", { onClick: onDelete, className: "text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-colors", children: "Delete" })] })] }));
});
AssignmentRow.displayName = 'AssignmentRow';
const PersonSearchResult = React.memo(({ person, isSelected, onSelect }) => {
    return (_jsx("button", { onClick: onSelect, role: "option", "aria-selected": isSelected, "aria-describedby": `person-${person.id}-details`, className: `w-full text-left px-2 py-2 text-xs hover:bg-[#3e3e42] transition-colors border-b border-[#3e3e42] last:border-b-0 ${isSelected ? 'bg-[#3e3e42]' : ''}`, children: _jsxs("div", { className: "flex justify-between items-start", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-[#cccccc] font-medium", children: person.name }), _jsx("div", { className: "text-[#969696] text-xs", children: person.role }), _jsx("div", { className: "flex flex-wrap gap-1 mt-1", children: person.hasSkillMatch && (_jsx("span", { className: "px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30", "aria-label": "This person has matching skills for your search", children: "\u2713 Skill Match" })) })] }), _jsxs("div", { className: "text-right ml-2", id: `person-${person.id}-details`, children: [_jsxs("div", { className: "text-[#cccccc] text-xs font-medium", children: [person.availableHours?.toFixed(1) || '0', "h available"] }), _jsxs("div", { className: "text-[#969696] text-xs", children: [person.utilizationPercent?.toFixed(0) || '0', "% utilized"] })] })] }) }, person.id));
});
PersonSearchResult.displayName = 'PersonSearchResult';
const ProjectsList = () => {
    // React Query hooks for data management
    const { projects, loading, error: projectsError } = useProjects();
    const { people } = usePeople();
    const deleteProjectMutation = useDeleteProject();
    const updateProjectMutation = useUpdateProject();
    // Local UI state
    const [selectedProject, setSelectedProject] = useState(null);
    const [statusFilter, setStatusFilter] = useState('Show All');
    const [sortBy, setSortBy] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [error, setError] = useState(null);
    const [warnings, setWarnings] = useState([]);
    const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
    // Assignment management
    const [assignments, setAssignments] = useState([]);
    // Optimized filter metadata (assignment counts + hasFutureDeliverables)
    const { filterMetadata, loading: filterMetaLoading, error: filterMetaError, invalidate: invalidateFilterMeta, refetch: refetchFilterMeta } = useProjectFilterMetadata();
    const [showAddAssignment, setShowAddAssignment] = useState(false);
    const [newAssignment, setNewAssignment] = useState({
        personSearch: '',
        selectedPerson: null,
        roleOnProject: '',
        roleSearch: '',
        weeklyHours: {}
    });
    const [personSearchResults, setPersonSearchResults] = useState([]);
    const [selectedPersonIndex, setSelectedPersonIndex] = useState(-1);
    // Pre-computed skills mapping for performance (Phase 4 optimization)
    const [personSkillsMap, setPersonSkillsMap] = useState(new Map());
    // Accessibility - Screen reader announcements (Phase 4 accessibility preservation)
    const [srAnnouncement, setSrAnnouncement] = useState('');
    // Debounced person search for better performance
    const debouncedPersonSearch = useDebounce(newAssignment.personSearch, 300);
    // Inline editing
    const [editingAssignment, setEditingAssignment] = useState(null);
    const [editData, setEditData] = useState({
        roleOnProject: '',
        currentWeekHours: 0,
        roleSearch: '',
    });
    const [availableRoles, setAvailableRoles] = useState([]);
    const [roleSearchResults, setRoleSearchResults] = useState([]);
    const statusOptions = ['active', 'active_ca', 'on_hold', 'completed', 'cancelled', 'active_no_deliverables', 'no_assignments', 'Show All'];
    const editableStatusOptions = ['active', 'active_ca', 'on_hold', 'completed', 'cancelled'];
    // Optional: log filter metadata status in development
    useEffect(() => {
        if (process.env.NODE_ENV === 'development' && filterMetadata) {
            const size = Object.keys(filterMetadata.projectFilters || {}).length;
            console.debug('Projects filter metadata loaded:', { entries: size });
        }
    }, [filterMetadata]);
    // Optimized filter helper functions (Step 3.2)
    const optimizedFilterFunctions = useMemo(() => {
        const hasNoAssignments = (projectId, metadata) => {
            if (!projectId)
                return false;
            const meta = metadata?.projectFilters?.[String(projectId)];
            if (!meta) {
                if (process.env.NODE_ENV === 'development') {
                    // Fallback to legacy logic not available here; default to conservative false
                    console.debug('Filter fallback: hasNoAssignments without metadata for project', projectId);
                }
                return false;
            }
            return meta.assignmentCount === 0;
        };
        const hasNoFutureDeliverables = (projectId, metadata) => {
            if (!projectId)
                return false;
            const meta = metadata?.projectFilters?.[String(projectId)];
            if (!meta) {
                if (process.env.NODE_ENV === 'development') {
                    // Fallback to legacy logic not available here; default to conservative false
                    console.debug('Filter fallback: hasNoFutureDeliverables without metadata for project', projectId);
                }
                return false;
            }
            return !meta.hasFutureDeliverables;
        };
        const matchesStatusFilter = (project, statusFilter, metadata) => {
            if (!project)
                return false;
            if (statusFilter === 'Show All')
                return true;
            if (statusFilter === 'active_no_deliverables') {
                // Active projects that do NOT have future deliverables
                return project.status === 'active' && hasNoFutureDeliverables(project.id, metadata);
            }
            if (statusFilter === 'no_assignments') {
                // Projects with zero assignments
                return hasNoAssignments(project.id, metadata);
            }
            // Default: direct status match
            return project.status === statusFilter;
        };
        return { hasNoAssignments, hasNoFutureDeliverables, matchesStatusFilter };
    }, []);
    // Set error from React Query if needed
    useEffect(() => {
        if (projectsError) {
            setError(projectsError);
        }
        else {
            setError(null);
        }
    }, [projectsError]);
    // No need to pre-load assignments; filter metadata supplies counts and future deliverable flags.
    // Pre-compute person skills map for performance (Phase 4 optimization)
    const precomputePersonSkills = useCallback(() => {
        const newSkillsMap = new Map();
        assignments.forEach(assignment => {
            if (assignment.person && assignment.personSkills) {
                const personId = assignment.person;
                const existingSkills = newSkillsMap.get(personId) || [];
                // Extract strength skills and convert to lowercase for matching
                const assignmentSkills = assignment.personSkills
                    .filter(skill => skill.skillType === 'strength')
                    .map(skill => skill.skillTagName?.toLowerCase() || '')
                    .filter(skill => skill.length > 0);
                // Combine and deduplicate skills for this person
                const combinedSkills = [...new Set([...existingSkills, ...assignmentSkills])];
                newSkillsMap.set(personId, combinedSkills);
            }
        });
        setPersonSkillsMap(newSkillsMap);
    }, [assignments]);
    // Recompute skills when assignments change
    useEffect(() => {
        if (assignments.length > 0) {
            precomputePersonSkills();
        }
    }, [assignments, precomputePersonSkills]);
    useEffect(() => {
        if (selectedProject?.id) {
            loadProjectAssignments(selectedProject.id);
        }
    }, [selectedProject]);
    const formatFilterStatus = (status) => {
        if (status === 'Show All')
            return 'Show All';
        if (status === 'active_no_deliverables')
            return 'Active - No Dates';
        if (status === 'active_ca')
            return 'Active CA';
        if (status === 'no_assignments')
            return 'No Assignments';
        return formatStatus(status);
    };
    const handleDelete = async (projectId) => {
        if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
            return;
        }
        try {
            await deleteProjectMutation.mutateAsync(projectId);
            // Clear selection if deleted project was selected
            if (selectedProject?.id === projectId) {
                const remainingProjects = projects.filter(p => p.id !== projectId);
                if (remainingProjects.length > 0) {
                    setSelectedProject(remainingProjects[0]);
                    setSelectedIndex(0);
                }
                else {
                    setSelectedProject(null);
                    setSelectedIndex(-1);
                }
            }
        }
        catch (err) {
            setError('Failed to delete project');
        }
    };
    // People data is now managed by React Query hook
    const loadProjectAssignments = async (projectId) => {
        try {
            // Get assignments filtered by project on the server side (much faster)
            const response = await assignmentsApi.list({ project: projectId });
            const projectAssignments = response.results || [];
            setAssignments(projectAssignments);
            // Extract unique roles from all assignments for autocomplete
            const roles = new Set();
            projectAssignments.forEach(assignment => {
                if (assignment.roleOnProject) {
                    roles.add(assignment.roleOnProject);
                }
            });
            // Also add roles from people
            people.forEach(person => {
                if (person.role) {
                    roles.add(person.role);
                }
            });
            const sortedRoles = Array.from(roles).sort();
            setAvailableRoles(sortedRoles);
        }
        catch (err) {
            console.error('Failed to load project assignments:', err);
        }
    };
    // Optimized calculatePersonAvailability using backend utilization endpoint
    const calculatePersonAvailability = async (person) => {
        try {
            // Get current week key
            const now = new Date();
            const dayOfWeek = now.getDay();
            const monday = new Date(now);
            monday.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
            const currentWeekKey = monday.toISOString().split('T')[0];
            // Use optimized API endpoint
            const utilizationData = await peopleApi.getPersonUtilization(person.id, currentWeekKey);
            return {
                availableHours: utilizationData.utilization.available_hours,
                utilizationPercent: Math.round(utilizationData.utilization.total_percentage),
                totalHours: utilizationData.utilization.allocated_hours
            };
        }
        catch (error) {
            console.error('Failed to calculate person availability:', error);
            return { availableHours: 0, utilizationPercent: 0, totalHours: 0 };
        }
    };
    // Optimized skill match calculation using pre-computed skills map (Phase 4)
    const calculateSkillMatch = useCallback((person, requiredSkills = []) => {
        if (requiredSkills.length === 0)
            return 0;
        // Get person's skills from pre-computed map (much faster than filtering assignments)
        const personSkills = personSkillsMap.get(person.id) || [];
        const matches = requiredSkills.filter(reqSkill => personSkills.some(personSkill => personSkill.includes(reqSkill.toLowerCase()) ||
            reqSkill.toLowerCase().includes(personSkill)));
        return matches.length / requiredSkills.length; // Return match ratio
    }, [personSkillsMap]);
    // Handle immediate input update (no delay for UI feedback)
    const handlePersonSearch = (searchTerm) => {
        setNewAssignment(prev => ({ ...prev, personSearch: searchTerm }));
        setSelectedPersonIndex(-1);
    };
    // Perform actual search with debounced value
    const performPersonSearch = async (searchTerm) => {
        // If no search term, show all people; if search term provided, filter by it
        let filtered = people;
        if (searchTerm.length > 0) {
            filtered = people.filter(person => person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                person.role?.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        // Detect potential skill requirements from search term
        const commonSkills = ['heat', 'lighting', 'hvac', 'autocad', 'python', 'design', 'mechanical', 'electrical'];
        const detectedSkills = commonSkills.filter(skill => searchTerm.toLowerCase().includes(skill));
        // Calculate availability and skill matching for each person
        const peopleWithData = await Promise.all(filtered.map(async (person) => {
            const availability = await calculatePersonAvailability(person);
            const skillMatchScore = calculateSkillMatch({ ...person, ...availability }, detectedSkills);
            return {
                ...person,
                ...availability,
                skillMatchScore,
                hasSkillMatch: skillMatchScore > 0
            };
        }));
        // Sort by skill match (if any), then availability, then name
        const sortedResults = peopleWithData
            .sort((a, b) => {
            // First priority: Skill match
            if (a.skillMatchScore !== b.skillMatchScore) {
                return b.skillMatchScore - a.skillMatchScore;
            }
            // Second priority: Availability
            if (b.availableHours !== a.availableHours) {
                return b.availableHours - a.availableHours;
            }
            // Third priority: Name
            return a.name.localeCompare(b.name);
        })
            .slice(0, 5);
        setPersonSearchResults(sortedResults);
        // Announce results for screen readers (Phase 4 accessibility)
        setSrAnnouncement(`Found ${sortedResults.length} people matching your search. ${sortedResults.filter(p => p.hasSkillMatch).length} with skill matches.`);
    };
    // Effect to trigger search when debounced value changes
    useEffect(() => {
        if (people.length > 0) {
            performPersonSearch(debouncedPersonSearch);
        }
    }, [debouncedPersonSearch, people]);
    const handlePersonSelect = (person) => {
        setNewAssignment(prev => ({
            ...prev,
            selectedPerson: person,
            personSearch: person.name,
        }));
        setPersonSearchResults([]);
        setSelectedPersonIndex(-1);
    };
    const handlePersonSearchKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (personSearchResults.length > 0) {
                setSelectedPersonIndex(prev => prev < personSearchResults.length - 1 ? prev + 1 : prev);
            }
        }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (personSearchResults.length > 0) {
                setSelectedPersonIndex(prev => prev > -1 ? prev - 1 : -1);
            }
        }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedPersonIndex >= 0 && selectedPersonIndex < personSearchResults.length) {
                handlePersonSelect(personSearchResults[selectedPersonIndex]);
            }
        }
        else if (e.key === 'Escape') {
            setPersonSearchResults([]);
            setSelectedPersonIndex(-1);
        }
    };
    // Memoized role suggestions based on person skills
    const getSkillBasedRoleSuggestions = useCallback((person) => {
        if (!person || !assignments)
            return [];
        // Get person's skills from their existing assignments
        const personAssignments = assignments.filter(a => a.person === person.id);
        const personSkills = personAssignments
            .flatMap(a => a.personSkills || [])
            .filter(skill => skill.skillType === 'strength')
            .map(skill => skill.skillTagName?.toLowerCase() || '');
        const skillBasedRoles = [];
        // Map skills to suggested roles
        if (personSkills.some(skill => skill.includes('heat') || skill.includes('hvac'))) {
            skillBasedRoles.push('HVAC Engineer', 'Mechanical Designer', 'Heat Calc Specialist');
        }
        if (personSkills.some(skill => skill.includes('lighting') || skill.includes('electrical'))) {
            skillBasedRoles.push('Lighting Designer', 'Electrical Engineer', 'Photometric Specialist');
        }
        if (personSkills.some(skill => skill.includes('autocad') || skill.includes('cad'))) {
            skillBasedRoles.push('CAD Designer', 'Technical Drafter', 'Design Engineer');
        }
        if (personSkills.some(skill => skill.includes('python') || skill.includes('programming'))) {
            skillBasedRoles.push('Automation Engineer', 'Technical Developer', 'Data Analyst');
        }
        if (personSkills.some(skill => skill.includes('project') || skill.includes('management'))) {
            skillBasedRoles.push('Project Manager', 'Team Lead', 'Coordinator');
        }
        return skillBasedRoles;
    }, [assignments]);
    const handleNewAssignmentRoleSearch = (searchTerm) => {
        setNewAssignment(prev => ({
            ...prev,
            roleSearch: searchTerm,
            roleOnProject: searchTerm
        }));
        if (searchTerm.length < 1) {
            setRoleSearchResults([]);
            return;
        }
        // Get existing roles that match the search
        const filteredExistingRoles = availableRoles.filter(role => role.toLowerCase().includes(searchTerm.toLowerCase()));
        // Get skill-based suggestions for the selected person
        const skillSuggestions = newAssignment.selectedPerson
            ? getSkillBasedRoleSuggestions(newAssignment.selectedPerson)
            : [];
        const filteredSkillRoles = skillSuggestions.filter(role => role.toLowerCase().includes(searchTerm.toLowerCase()));
        // Combine and deduplicate, prioritizing skill-based suggestions
        const allRoles = [...filteredSkillRoles, ...filteredExistingRoles];
        const uniqueRoles = Array.from(new Set(allRoles)).slice(0, 5);
        setRoleSearchResults(uniqueRoles);
    };
    const handleNewAssignmentRoleSelect = (role) => {
        setNewAssignment(prev => ({
            ...prev,
            roleOnProject: role,
            roleSearch: role
        }));
        setRoleSearchResults([]);
    };
    const handleAddAssignment = () => {
        setShowAddAssignment(true);
        setNewAssignment({
            personSearch: '',
            selectedPerson: null,
            roleOnProject: '',
            roleSearch: '',
            weeklyHours: {}
        });
    };
    const handleSaveAssignment = async () => {
        if (!selectedProject?.id || !newAssignment.selectedPerson?.id)
            return;
        try {
            // Check for overallocation warnings before creating
            const weeklyHours = newAssignment.weeklyHours || {};
            const totalNewHours = Object.values(weeklyHours).reduce((sum, hours) => sum + (hours || 0), 0);
            if (totalNewHours > 0) {
                // Get current week key for warning calculation
                const now = new Date();
                const dayOfWeek = now.getDay();
                const monday = new Date(now);
                monday.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
                const currentWeekKey = monday.toISOString().split('T')[0];
                const currentWeekHours = weeklyHours[currentWeekKey] || 0;
                if (currentWeekHours > 0 && selectedProject?.id) {
                    const conflictWarnings = await checkAssignmentConflicts(newAssignment.selectedPerson.id, selectedProject.id, currentWeekKey, currentWeekHours);
                    setWarnings(conflictWarnings);
                }
            }
            const assignmentData = {
                person: newAssignment.selectedPerson.id,
                project: selectedProject.id,
                roleOnProject: newAssignment.roleOnProject || 'Team Member',
                weeklyHours: newAssignment.weeklyHours,
                startDate: new Date().toISOString().split('T')[0], // Today
            };
            const newAssignment = await assignmentsApi.create(assignmentData);
            await loadProjectAssignments(selectedProject.id);
            // Invalidate filter metadata cache (counts + future dates)
            await invalidateFilterMeta();
            setShowAddAssignment(false);
        }
        catch (err) {
            setError('Failed to create assignment');
        }
    };
    const handleCancelAddAssignment = () => {
        setShowAddAssignment(false);
        setWarnings([]); // Clear warnings on cancel
        setNewAssignment({
            personSearch: '',
            selectedPerson: null,
            roleOnProject: '',
            roleSearch: '',
            weeklyHours: {}
        });
        setPersonSearchResults([]);
        setRoleSearchResults([]);
    };
    // Helper function to get current week hours for an assignment
    const getCurrentWeekHours = (assignment) => {
        // Get current week in YYYY-MM-DD format for the Monday of this week
        const now = new Date();
        const dayOfWeek = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
        const currentWeekKey = monday.toISOString().split('T')[0];
        return assignment.weeklyHours?.[currentWeekKey] || 0;
    };
    const handleDeleteAssignment = useCallback(async (assignmentId) => {
        if (!confirm('Are you sure you want to remove this assignment?')) {
            return;
        }
        try {
            await assignmentsApi.delete(assignmentId);
            if (selectedProject?.id) {
                await loadProjectAssignments(selectedProject.id);
            }
            // Invalidate filter metadata cache
            await invalidateFilterMeta();
        }
        catch (err) {
            setError('Failed to delete assignment');
        }
    }, [selectedProject?.id, loadProjectAssignments, invalidateFilterMeta]);
    const handleEditAssignment = useCallback((assignment) => {
        setEditingAssignment(assignment.id);
        const currentWeekHours = getCurrentWeekHours(assignment);
        const existingRole = assignment.roleOnProject || '';
        setEditData({
            roleOnProject: existingRole,
            currentWeekHours,
            roleSearch: existingRole, // Keep the existing role in the search field
        });
        // Clear any previous search results
        setRoleSearchResults([]);
    }, [getCurrentWeekHours]);
    const handleRoleSearch = useCallback((searchTerm) => {
        setEditData(prev => {
            const newData = { ...prev, roleSearch: searchTerm, roleOnProject: searchTerm };
            return newData;
        });
        if (searchTerm.length < 1) {
            setRoleSearchResults([]);
            return;
        }
        // Get existing roles that match the search
        const filteredExistingRoles = availableRoles.filter(role => role.toLowerCase().includes(searchTerm.toLowerCase()));
        // Get skill-based suggestions for the person being edited
        const editingAssignmentData = assignments.find(a => a.id === editingAssignment);
        const editingPerson = editingAssignmentData ? people.find(p => p.id === editingAssignmentData.person) : null;
        const skillSuggestions = editingPerson
            ? getSkillBasedRoleSuggestions(editingPerson)
            : [];
        const filteredSkillRoles = skillSuggestions.filter(role => role.toLowerCase().includes(searchTerm.toLowerCase()));
        // Combine and deduplicate, prioritizing skill-based suggestions
        const allRoles = [...filteredSkillRoles, ...filteredExistingRoles];
        const uniqueRoles = Array.from(new Set(allRoles)).slice(0, 5);
        setRoleSearchResults(uniqueRoles);
    }, [availableRoles, assignments, people, editingAssignment, getSkillBasedRoleSuggestions]);
    const handleRoleSelect = (role) => {
        setEditData(prev => ({ ...prev, roleOnProject: role, roleSearch: role }));
        setRoleSearchResults([]);
    };
    // Optimized checkAssignmentConflicts using backend conflict checking endpoint
    const checkAssignmentConflicts = async (personId, projectId, weekKey, newHours) => {
        try {
            // Use optimized API endpoint
            const conflictResponse = await assignmentsApi.checkConflicts(personId, projectId, weekKey, newHours);
            return conflictResponse.warnings;
        }
        catch (error) {
            console.error('Failed to check assignment conflicts:', error);
            return [];
        }
    };
    const handleSaveEdit = async (assignmentId) => {
        try {
            const assignment = assignments.find(a => a.id === assignmentId);
            if (!assignment)
                return;
            // Get current week key
            const now = new Date();
            const dayOfWeek = now.getDay();
            const monday = new Date(now);
            monday.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
            const currentWeekKey = monday.toISOString().split('T')[0];
            // Check for assignment conflicts and overallocation warnings before saving
            const currentWeekHours = assignment.weeklyHours?.[currentWeekKey] || 0;
            const hoursChange = editData.currentWeekHours - currentWeekHours;
            if (hoursChange > 0 && selectedProject?.id) { // Only check if we're increasing hours
                const conflictWarnings = await checkAssignmentConflicts(assignment.person, selectedProject.id, currentWeekKey, hoursChange);
                setWarnings(conflictWarnings);
            }
            else {
                setWarnings([]); // Clear warnings if reducing hours
            }
            // Update weekly hours with current week
            const updatedWeeklyHours = {
                ...assignment.weeklyHours,
                [currentWeekKey]: editData.currentWeekHours
            };
            // Use the role from editData, fallback to 'Team Member' if truly empty
            const roleToSave = editData.roleOnProject?.trim() || 'Team Member';
            const updateData = {
                roleOnProject: roleToSave,
                weeklyHours: updatedWeeklyHours
            };
            await assignmentsApi.update(assignmentId, updateData);
            if (selectedProject?.id) {
                await loadProjectAssignments(selectedProject.id);
            }
            // Invalidate filter metadata cache
            await invalidateFilterMeta();
            setEditingAssignment(null);
            setRoleSearchResults([]);
        }
        catch (err) {
            console.error('Failed to update assignment:', err);
            setError('Failed to update assignment');
        }
    };
    const handleCancelEdit = () => {
        setEditingAssignment(null);
        setRoleSearchResults([]);
        setWarnings([]); // Clear warnings on cancel
        setEditData({
            roleOnProject: '',
            currentWeekHours: 0,
            roleSearch: '',
        });
    };
    const handleStatusChange = async (newStatus) => {
        if (!selectedProject?.id)
            return;
        try {
            // Optimistic update - update local state immediately
            const optimisticProject = { ...selectedProject, status: newStatus };
            setSelectedProject(optimisticProject);
            setStatusDropdownOpen(false);
            // Perform actual update
            await updateProjectMutation.mutateAsync({
                id: selectedProject.id,
                data: { status: newStatus }
            });
            // Invalidate filter metadata as status is part of the payload
            await invalidateFilterMeta();
        }
        catch (err) {
            // Revert optimistic update on error
            setSelectedProject(selectedProject);
            setError('Failed to update project status');
        }
    };
    const handleProjectClick = (project, index) => {
        setSelectedProject(project);
        setSelectedIndex(index);
    };
    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'active': return 'text-emerald-400';
            case 'active_ca': return 'text-blue-400';
            case 'planning': return 'text-blue-400';
            case 'on_hold': return 'text-amber-400';
            case 'completed': return 'text-slate-400';
            case 'cancelled': return 'text-red-400';
            default: return 'text-slate-400';
        }
    };
    const formatStatus = (status) => {
        if (status === 'active_ca')
            return 'Active CA';
        return status?.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || 'Unknown';
    };
    const handleSort = (column) => {
        if (sortBy === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        }
        else {
            setSortBy(column);
            setSortDirection('asc');
        }
    };
    // Memoized filtered and sorted projects for better performance
    const filteredProjects = useMemo(() => {
        const tStart = performance.now();
        // New optimized filtering using helper functions (Step 3.3)
        const next = projects.filter(project => {
            const matchesStatus = optimizedFilterFunctions.matchesStatusFilter(project, statusFilter, filterMetadata);
            const matchesSearch = !searchTerm ||
                project.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                project.client?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                project.projectNumber?.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesStatus && matchesSearch;
        });
        // Record compute timing (controlled by monitoring debug)
        const tEnd = performance.now();
        trackPerformanceEvent('projects.filter.compute', tEnd - tStart, 'ms', {
            projects: projects.length,
            result: next.length,
            statusFilter,
        });
        return next;
    }, [projects, statusFilter, searchTerm, filterMetadata, optimizedFilterFunctions]);
    // Memoized sorted projects
    const sortedProjects = useMemo(() => [...filteredProjects].sort((a, b) => {
        let aValue, bValue;
        switch (sortBy) {
            case 'client':
                aValue = a.client || '';
                bValue = b.client || '';
                break;
            case 'name':
                aValue = a.name || '';
                bValue = b.name || '';
                break;
            case 'type':
                // We don't have type field in backend, using status as fallback
                aValue = a.status || '';
                bValue = b.status || '';
                break;
            case 'status':
                aValue = a.status || '';
                bValue = b.status || '';
                break;
            default:
                aValue = a.name || '';
                bValue = b.name || '';
        }
        // For string comparison
        const result = aValue.toString().localeCompare(bValue.toString());
        return sortDirection === 'asc' ? result : -result;
    }), [filteredProjects, sortBy, sortDirection]);
    // Auto-select first project from sorted/filtered list
    useEffect(() => {
        if (sortedProjects.length > 0 && !selectedProject) {
            setSelectedProject(sortedProjects[0]);
            setSelectedIndex(0);
        }
    }, [sortedProjects, selectedProject]);
    // Page ready timing: from mount to when projects + metadata are loaded
    const [pageStart] = useState(() => performance.now());
    useEffect(() => {
        if (!loading && !filterMetaLoading) {
            const readyDuration = performance.now() - pageStart;
            trackPerformanceEvent('projects.page.ready', readyDuration, 'ms', {
                projectsCount: projects.length,
                hasMetadata: Boolean(filterMetadata),
            });
        }
    }, [loading, filterMetaLoading, pageStart, projects.length, filterMetadata]);
    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                let newIndex = selectedIndex;
                if (e.key === 'ArrowUp' && selectedIndex > 0) {
                    newIndex = selectedIndex - 1;
                }
                else if (e.key === 'ArrowDown' && selectedIndex < sortedProjects.length - 1) {
                    newIndex = selectedIndex + 1;
                }
                if (newIndex !== selectedIndex) {
                    setSelectedIndex(newIndex);
                    setSelectedProject(sortedProjects[newIndex]);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, sortedProjects]);
    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (statusDropdownOpen) {
                const target = event.target;
                // Check if the click was outside the dropdown by looking for the dropdown container
                const dropdownContainer = target.closest('.status-dropdown-container');
                if (!dropdownContainer) {
                    setStatusDropdownOpen(false);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [statusDropdownOpen]);
    const SortIcon = ({ column }) => {
        if (sortBy !== column)
            return null;
        return (_jsx("span", { className: "ml-1 text-[#007acc]", children: sortDirection === 'asc' ? '▲' : '▼' }));
    };
    if (loading) {
        return (_jsx("div", { className: "min-h-screen bg-[#1e1e1e] flex items-center justify-center", children: _jsx("div", { className: "text-[#969696]", children: "Loading projects..." }) }));
    }
    return (_jsxs("div", { className: "min-h-screen bg-[#1e1e1e] flex", children: [_jsx(Sidebar, {}), _jsxs("div", { className: "flex-1 flex h-screen bg-[#1e1e1e]", children: [_jsxs("div", { className: "w-1/2 border-r border-[#3e3e42] flex flex-col min-w-0", children: [_jsxs("div", { className: "p-3 border-b border-[#3e3e42]", children: [_jsxs("div", { className: "flex justify-between items-center mb-2", children: [_jsx("h1", { className: "text-lg font-semibold text-[#cccccc]", children: "Projects" }), _jsx(Link, { to: "/projects/new", children: _jsx("button", { className: "px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors", children: "+ New" }) })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs text-[#969696] mb-1 block", children: "Filter by Status:" }), _jsx("div", { className: "flex flex-wrap gap-1", children: statusOptions.map((status) => (_jsx("button", { onClick: () => setStatusFilter(status), className: `px-2 py-0.5 text-xs rounded border transition-colors ${statusFilter === status
                                                                ? 'bg-[#007acc] border-[#007acc] text-white'
                                                                : 'bg-[#3e3e42] border-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42]/80'}`, "aria-label": `Filter projects by ${formatFilterStatus(status).toLowerCase()}`, "aria-pressed": statusFilter === status, children: formatFilterStatus(status) }, status))) })] }), _jsx("div", { children: _jsx("input", { type: "text", placeholder: "Search projects", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), className: "w-full px-3 py-1.5 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none" }) })] })] }), error && (_jsx("div", { className: "p-3 bg-red-500/20 border-b border-red-500/50", children: _jsx("div", { className: "text-red-400 text-sm", children: error }) })), (filterMetaLoading || filterMetaError) && (_jsx("div", { className: `p-3 border-b ${filterMetaError ? 'bg-amber-500/10 border-amber-500/30' : 'bg-[#2d2d30] border-[#3e3e42]'}`, children: _jsx("div", { className: `text-sm ${filterMetaError ? 'text-amber-400' : 'text-[#969696]'}`, children: filterMetaError ? (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { children: "Filter data unavailable; using fallback filters." }), _jsx("button", { onClick: () => refetchFilterMeta(), className: "px-2 py-1 text-xs rounded border bg-transparent border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors", disabled: filterMetaLoading, children: "Retry" })] })) : (_jsx("span", { children: "Loading filter metadata\u2026" })) }) })), warnings.length > 0 && (_jsx("div", { className: "p-3 bg-amber-500/20 border-b border-amber-500/50", children: warnings.map((warning, index) => (_jsx("div", { className: "text-amber-400 text-sm flex items-center gap-2", children: _jsx("span", { children: warning }) }, index))) })), _jsxs("div", { className: "flex-1 overflow-hidden", children: [_jsxs("div", { className: "grid grid-cols-8 gap-2 px-2 py-1.5 text-xs text-[#969696] font-medium border-b border-[#3e3e42] bg-[#2d2d30]", children: [_jsxs("div", { className: "col-span-2 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center", onClick: () => handleSort('client'), children: ["CLIENT", _jsx(SortIcon, { column: "client" })] }), _jsxs("div", { className: "col-span-3 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center", onClick: () => handleSort('name'), children: ["PROJECT", _jsx(SortIcon, { column: "name" })] }), _jsxs("div", { className: "col-span-1 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center", onClick: () => handleSort('type'), children: ["TYPE", _jsx(SortIcon, { column: "type" })] }), _jsxs("div", { className: "col-span-2 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center", onClick: () => handleSort('status'), children: ["STATUS", _jsx(SortIcon, { column: "status" })] })] }), _jsx("div", { className: "overflow-y-auto h-full", children: sortedProjects.length === 0 ? (_jsx("div", { className: "flex items-center justify-center py-12", children: _jsxs("div", { className: "text-center text-[#969696]", children: [_jsx("div", { className: "text-lg mb-2", children: statusFilter === 'no_assignments'
                                                            ? 'No projects without assignments'
                                                            : 'No projects found' }), _jsx("div", { className: "text-sm", children: statusFilter === 'no_assignments'
                                                            ? 'All projects have team members assigned. Try a different filter.'
                                                            : 'Try adjusting your filters or create a new project' })] }) })) : (sortedProjects.map((project, index) => (_jsxs("div", { onClick: () => handleProjectClick(project, index), className: `grid grid-cols-8 gap-2 px-2 py-1.5 text-sm border-b border-[#3e3e42] cursor-pointer hover:bg-[#3e3e42]/50 transition-colors focus:outline-none ${selectedProject?.id === project.id ? 'bg-[#007acc]/20 border-[#007acc]' : ''}`, tabIndex: 0, children: [_jsx("div", { className: "col-span-2 text-[#969696] text-xs", children: project.client || 'No Client' }), _jsxs("div", { className: "col-span-3", children: [_jsx("div", { className: "text-[#cccccc] font-medium leading-tight", children: project.name }), _jsx("div", { className: "text-[#969696] text-xs leading-tight", children: project.projectNumber || 'No Number' })] }), _jsx("div", { className: "col-span-1 text-[#969696] text-xs", children: formatStatus(project.status || '') }), _jsx("div", { className: "col-span-2", children: _jsx("span", { className: `${getStatusColor(project.status || '')} px-2 py-0.5 rounded text-xs`, children: formatStatus(project.status || '') }) })] }, project.id)))) })] })] }), _jsx("div", { className: "w-1/2 flex flex-col bg-[#2d2d30] min-w-0", children: selectedProject ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "p-4 border-b border-[#3e3e42]", children: [_jsxs("div", { className: "flex justify-between items-start mb-3", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-bold text-[#cccccc] mb-2", children: selectedProject.name }), _jsxs("div", { className: "grid grid-cols-2 gap-4 text-sm", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[#969696] text-xs", children: "Client:" }), _jsx("div", { className: "text-[#cccccc]", children: selectedProject.client || 'No Client' })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[#969696] text-xs", children: "Status:" }), _jsxs("div", { className: "relative status-dropdown-container", children: [_jsxs("button", { onClick: () => setStatusDropdownOpen(!statusDropdownOpen), className: `${getStatusColor(selectedProject.status || '')} hover:bg-[#3e3e42]/50 px-2 py-1 rounded text-sm transition-colors cursor-pointer flex items-center gap-1`, children: [formatStatus(selectedProject.status || ''), _jsx("svg", { className: "w-3 h-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("polyline", { points: "6,9 12,15 18,9" }) })] }), statusDropdownOpen && (_jsx("div", { className: "absolute top-full left-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 min-w-[120px]", children: editableStatusOptions.map((status) => (_jsx("button", { onClick: () => handleStatusChange(status), className: `w-full text-left px-3 py-2 text-sm hover:bg-[#3e3e42] transition-colors first:rounded-t last:rounded-b ${selectedProject.status === status ? 'bg-[#007acc]/20' : ''} ${getStatusColor(status)}`, children: formatStatus(status) }, status))) }))] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[#969696] text-xs", children: "Project Number:" }), _jsx("div", { className: "text-[#cccccc]", children: selectedProject.projectNumber || 'No Number' })] })] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx(Link, { to: `/projects/${selectedProject.id}/edit`, children: _jsx("button", { className: "px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors", children: "Edit Project" }) }), _jsx("button", { onClick: () => selectedProject.id && handleDelete(selectedProject.id), className: "px-2 py-0.5 text-xs rounded border bg-transparent border-[#3e3e42] text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-colors", children: "Delete" })] })] }), selectedProject.description && (_jsxs("div", { className: "mt-3 pt-3 border-t border-[#3e3e42]", children: [_jsx("div", { className: "text-[#969696] text-xs mb-1", children: "Description:" }), _jsx("div", { className: "text-[#cccccc] text-sm", children: selectedProject.description })] }))] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-4 space-y-4", children: [_jsxs("div", { className: "pb-4 border-b border-[#3e3e42]", children: [_jsxs("div", { className: "flex justify-between items-center mb-2", children: [_jsx("h3", { className: "text-base font-semibold text-[#cccccc]", children: "Assignments" }), _jsx("button", { onClick: handleAddAssignment, className: "px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors", children: "+ Add Assignment" })] }), _jsxs("div", { className: "space-y-2", children: [assignments.length > 0 ? (assignments.map((assignment) => (_jsx("div", { children: editingAssignment === assignment.id ? (
                                                            // Editing mode
                                                            _jsx("div", { className: "p-3 bg-[#3e3e42]/50 rounded border border-[#3e3e42]", children: _jsxs("div", { className: "grid grid-cols-4 gap-4 items-center", children: [_jsx("div", { className: "text-[#cccccc]", children: assignment.personName || 'Unknown' }), _jsxs("div", { className: "relative", children: [_jsx("input", { type: "text", placeholder: "Role on project...", value: editData.roleSearch, onChange: (e) => handleRoleSearch(e.target.value), className: "w-full px-2 py-1 text-xs bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none", autoFocus: true }), roleSearchResults.length > 0 && (_jsx("div", { className: "absolute top-full left-0 right-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 max-h-32 overflow-y-auto", children: roleSearchResults.map((role) => (_jsx("button", { onClick: () => handleRoleSelect(role), className: "w-full text-left px-2 py-1 text-xs hover:bg-[#3e3e42] transition-colors text-[#cccccc] border-b border-[#3e3e42] last:border-b-0", children: role }, role))) }))] }), _jsx("div", { children: _jsx("input", { type: "number", min: "0", max: "80", step: "0.5", placeholder: "Hours", value: editData.currentWeekHours, onChange: (e) => setEditData(prev => ({ ...prev, currentWeekHours: parseFloat(e.target.value) || 0 })), className: "w-full px-2 py-1 text-xs bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]" }) }), _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { onClick: () => assignment.id && handleSaveEdit(assignment.id), className: "px-2 py-1 text-xs rounded border bg-[#007acc] border-[#007acc] text-white hover:bg-[#005fa3] transition-colors", children: "Save" }), _jsx("button", { onClick: handleCancelEdit, className: "px-2 py-1 text-xs rounded border bg-transparent border-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors", children: "Cancel" })] })] }) })) : (
                                                            // Display mode
                                                            _jsxs("div", { className: "flex justify-between items-center p-2 bg-[#3e3e42]/30 rounded", children: [_jsx("div", { className: "flex-1", children: _jsxs("div", { className: "grid grid-cols-3 gap-4", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[#cccccc]", children: assignment.personName || 'Unknown' }), _jsxs("div", { className: "flex flex-wrap gap-1 mt-1", children: [assignment.personSkills?.filter(skill => skill.skillType === 'strength').slice(0, 3).map((skill, index) => (_jsx("span", { className: "px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30", children: skill.skillTagName }, index))), assignment.personSkills?.filter(skill => skill.skillType === 'strength').length === 0 && (_jsx("span", { className: "text-[#969696] text-xs", children: "No skills listed" }))] })] }), _jsx("div", { className: "text-[#969696]", children: assignment.roleOnProject || 'Team Member' }), _jsxs("div", { className: "text-[#969696]", children: [getCurrentWeekHours(assignment), "h"] })] }) }), _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { onClick: () => handleEditAssignment(assignment), className: "text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-[#cccccc] hover:bg-[#3e3e42] hover:border-[#3e3e42] transition-colors", children: "Edit" }), _jsx("button", { onClick: () => assignment.id && handleDeleteAssignment(assignment.id), className: "text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-colors", children: "Delete" })] })] })) }, assignment.id)))) : !showAddAssignment ? (_jsxs("div", { className: "text-center py-8", children: [_jsx("div", { className: "text-[#969696] text-sm", children: "No assignments yet" }), _jsx("div", { className: "text-[#969696] text-xs mt-1", children: "Click \"Add Assignment\" to get started" })] })) : null, showAddAssignment && (_jsxs("div", { className: "p-3 bg-[#3e3e42]/50 rounded border border-[#3e3e42]", children: [_jsxs("div", { className: "grid grid-cols-3 gap-4 mb-3", children: [_jsx("div", { className: "text-[#969696] text-xs uppercase font-medium", children: "PERSON" }), _jsx("div", { className: "text-[#969696] text-xs uppercase font-medium", children: "ROLE" }), _jsx("div", { className: "text-[#969696] text-xs uppercase font-medium", children: "ACTIONS" })] }), _jsxs("div", { className: "grid grid-cols-3 gap-4 items-center", children: [_jsxs("div", { className: "relative", children: [_jsx("input", { type: "text", placeholder: "Start typing name or click to see all...", value: newAssignment.personSearch, onChange: (e) => handlePersonSearch(e.target.value), onFocus: () => performPersonSearch(newAssignment.personSearch), onKeyDown: handlePersonSearchKeyDown, role: "combobox", "aria-expanded": personSearchResults.length > 0, "aria-haspopup": "listbox", "aria-owns": "person-search-results", "aria-describedby": "person-search-help", className: "w-full px-2 py-1 text-xs bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none", autoFocus: true }), _jsx("div", { id: "person-search-help", className: "sr-only", children: "Search for people to assign to this project. Use arrow keys to navigate results." }), _jsx("div", { "aria-live": "polite", "aria-atomic": "true", className: "sr-only", children: srAnnouncement }), personSearchResults.length > 0 && (_jsx("div", { id: "person-search-results", role: "listbox", className: "absolute top-full left-0 right-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 max-h-32 overflow-y-auto", children: personSearchResults.map((person, index) => (_jsxs("button", { onClick: () => handlePersonSelect(person), className: `w-full text-left px-2 py-1 text-xs hover:bg-[#3e3e42] transition-colors text-[#cccccc] border-b border-[#3e3e42] last:border-b-0 ${selectedPersonIndex === index ? 'bg-[#007acc]/30 border-[#007acc]' : ''}`, children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { className: "font-medium", children: person.name }), person.hasSkillMatch && (_jsx("span", { className: "text-xs px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30", children: "\uD83C\uDFAF Skill Match" }))] }), _jsxs("div", { className: "flex justify-between items-center", children: [_jsx("div", { className: "text-[#969696]", children: person.role }), person.availableHours !== undefined && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: `text-xs px-1 py-0.5 rounded ${person.utilizationPercent > 100 ? 'text-red-400 bg-red-500/20' :
                                                                                                                    person.utilizationPercent > 85 ? 'text-amber-400 bg-amber-500/20' :
                                                                                                                        person.availableHours > 0 ? 'text-emerald-400 bg-emerald-500/20' :
                                                                                                                            'text-blue-400 bg-blue-500/20'}`, children: [person.availableHours, "h available"] }), _jsxs("span", { className: "text-[#969696] text-xs", children: ["(", person.utilizationPercent, "% used)"] })] }))] })] }, person.id))) }))] }), _jsxs("div", { className: "relative", children: [_jsx("input", { type: "text", placeholder: "Role on project...", value: newAssignment.roleSearch, onChange: (e) => handleNewAssignmentRoleSearch(e.target.value), className: "w-full px-2 py-1 text-xs bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none" }), roleSearchResults.length > 0 && (_jsx("div", { className: "absolute top-full left-0 right-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 max-h-32 overflow-y-auto", children: roleSearchResults.map((role) => (_jsx("button", { onClick: () => handleNewAssignmentRoleSelect(role), className: "w-full text-left px-2 py-1 text-xs hover:bg-[#3e3e42] transition-colors text-[#cccccc] border-b border-[#3e3e42] last:border-b-0", children: role }, role))) }))] }), _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { onClick: handleSaveAssignment, disabled: !newAssignment.selectedPerson, className: "px-2 py-1 text-xs rounded border bg-[#007acc] border-[#007acc] text-white hover:bg-[#005fa3] disabled:opacity-50 disabled:cursor-not-allowed transition-colors", children: "Save" }), _jsx("button", { onClick: handleCancelAddAssignment, className: "px-2 py-1 text-xs rounded border bg-transparent border-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors", children: "Cancel" })] })] })] }))] })] }), _jsx(Suspense, { fallback: _jsx(DeliverablesSectionLoader, {}), children: _jsx(DeliverablesSection, { project: selectedProject }) })] })] })) : (_jsx("div", { className: "flex-1 flex items-center justify-center", children: _jsxs("div", { className: "text-center text-[#969696]", children: [_jsx("div", { className: "text-lg mb-2", children: "Select a project" }), _jsx("div", { className: "text-sm", children: "Choose a project from the list to view details" })] }) })) })] })] }));
};
export default ProjectsList;
