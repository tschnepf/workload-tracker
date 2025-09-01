import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Assignment Form - Create/Edit assignment with 12-week hour planning
 * RETROFIT: Changed from percentage to hours-per-week with 12-week timeline
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { assignmentsApi, peopleApi, projectsApi, departmentsApi, personSkillsApi, skillTagsApi } from '@/services/api';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { useDebounce } from '@/hooks/useDebounce';
// Helper function to get the next 12 weeks starting from current week (Sunday)
const getNext12Weeks = () => {
    const today = new Date();
    const currentSunday = new Date(today);
    currentSunday.setDate(today.getDate() - ((today.getDay()) % 7));
    const weeks = [];
    for (let i = 0; i < 12; i++) {
        const weekDate = new Date(currentSunday);
        weekDate.setDate(currentSunday.getDate() + (i * 7));
        weeks.push(weekDate.toISOString().split('T')[0]); // YYYY-MM-DD format
    }
    return weeks;
};
// Helper function to format week display
const formatWeekDisplay = (weekKey) => {
    const date = new Date(weekKey + 'T00:00:00');
    const endDate = new Date(date);
    endDate.setDate(date.getDate() + 6);
    const options = { month: 'short', day: 'numeric' };
    return `${date.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
};
// Helper function to get department name for a person
const getDepartmentName = (person, departments) => {
    if (!person.department)
        return 'No Department';
    const dept = departments.find(d => d.id === person.department);
    return dept?.name || 'Unknown Department';
};
const AssignmentForm = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEditing = !!id;
    // Helper function to calculate skill match score
    const calculateSkillMatchScore = (_person, personSkills, requiredSkills) => {
        if (requiredSkills.length === 0)
            return 0;
        const personStrengths = personSkills
            .filter(skill => skill.skillType === 'strength')
            .map(skill => skill.skillTagName?.toLowerCase() || '');
        const matches = requiredSkills.filter(required => personStrengths.some(strength => strength.includes(required.toLowerCase()) || required.toLowerCase().includes(strength)));
        return Math.round((matches.length / requiredSkills.length) * 100);
    };
    // Helper function to extract skills from input text - will be used when skills input is processed
    const extractSkillsFromText = (text, availableSkills) => {
        if (!text.trim())
            return [];
        const words = text.toLowerCase().split(/[,\s]+/).filter(word => word.length > 2);
        const foundSkills = [];
        // Match against existing skill names
        availableSkills.forEach(skill => {
            const skillName = skill.name.toLowerCase();
            if (words.some(word => skillName.includes(word) || word.includes(skillName))) {
                foundSkills.push(skill.name);
            }
        });
        // Also include explicit comma-separated values
        text.split(',').forEach(skill => {
            const trimmed = skill.trim();
            if (trimmed.length > 2 && !foundSkills.some(existing => existing.toLowerCase().includes(trimmed.toLowerCase()))) {
                foundSkills.push(trimmed);
            }
        });
        return foundSkills;
    };
    // Helper function to sort people by department and skill matching
    const sortPeopleByDepartmentAndSkills = (people, selectedPersonId, departments, peopleSkills, requiredSkills) => {
        if (!selectedPersonId && requiredSkills.length === 0)
            return people;
        const selectedPerson = people.find(p => p.id === Number(selectedPersonId));
        const selectedDepartment = selectedPerson?.department;
        return [...people].sort((a, b) => {
            // Calculate skill match scores
            const aSkills = peopleSkills.get(a.id) || [];
            const bSkills = peopleSkills.get(b.id) || [];
            const aSkillScore = calculateSkillMatchScore(a, aSkills, requiredSkills);
            const bSkillScore = calculateSkillMatchScore(b, bSkills, requiredSkills);
            // If we have required skills, prioritize skill matching
            if (requiredSkills.length > 0) {
                if (aSkillScore !== bSkillScore) {
                    return bSkillScore - aSkillScore; // Higher skill score first
                }
            }
            // Same department as selected person comes next
            if (selectedDepartment) {
                const aDept = a.department;
                const bDept = b.department;
                if (aDept === selectedDepartment && bDept !== selectedDepartment)
                    return -1;
                if (bDept === selectedDepartment && aDept !== selectedDepartment)
                    return 1;
            }
            // Then sort by department name
            const aDeptName = getDepartmentName(a, departments);
            const bDeptName = getDepartmentName(b, departments);
            if (aDeptName !== bDeptName)
                return aDeptName.localeCompare(bDeptName);
            // Finally sort by person name
            return a.name.localeCompare(b.name);
        });
    };
    // Helper function to get skill mismatch warnings
    const getSkillWarnings = (person, personSkills, requiredSkills) => {
        const warnings = [];
        if (requiredSkills.length === 0)
            return warnings;
        const personStrengths = personSkills
            .filter(skill => skill.skillType === 'strength')
            .map(skill => skill.skillTagName || '');
        const personDevelopment = personSkills
            .filter(skill => skill.skillType === 'development')
            .map(skill => skill.skillTagName || '');
        const matchedSkills = requiredSkills.filter(required => personStrengths.some(strength => strength.toLowerCase().includes(required.toLowerCase()) || required.toLowerCase().includes(strength.toLowerCase())));
        const developmentMatches = requiredSkills.filter(required => personDevelopment.some(dev => dev.toLowerCase().includes(required.toLowerCase()) || required.toLowerCase().includes(dev.toLowerCase())));
        const unmatchedSkills = requiredSkills.filter(required => !matchedSkills.some(matched => matched.toLowerCase().includes(required.toLowerCase())));
        if (matchedSkills.length === 0 && requiredSkills.length > 0) {
            warnings.push(`⚠️ No skill matches found for: ${requiredSkills.join(', ')}`);
        }
        if (developmentMatches.length > 0) {
            warnings.push(`📈 Development opportunity: ${person.name} is learning ${developmentMatches.join(', ')}`);
        }
        if (unmatchedSkills.length > 0 && matchedSkills.length > 0) {
            warnings.push(`⚠️ Missing skills: ${unmatchedSkills.join(', ')}`);
        }
        return warnings;
    };
    const [people, setPeople] = useState([]);
    const [projects, setProjects] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [peopleSkills, setPeopleSkills] = useState(new Map());
    const [skillTags, setSkillTags] = useState([]);
    const [projectSkills, setProjectSkills] = useState([]); // Skills required for this project
    const [availableWeeks] = useState(getNext12Weeks());
    const [formData, setFormData] = useState({
        person: '',
        project: '',
        weeklyHours: {},
    });
    const [skillsInput, setSkillsInput] = useState(''); // Skills required input field
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [validationErrors, setValidationErrors] = useState({});
    const [bulkHours, setBulkHours] = useState(0);
    const [personSearchText, setPersonSearchText] = useState('');
    const [filteredPeople, setFilteredPeople] = useState([]);
    const [showPersonDropdown, setShowPersonDropdown] = useState(false);
    // Debounced person search for better performance
    const debouncedPersonSearch = useDebounce(personSearchText, 300);
    useEffect(() => {
        loadPeople();
        loadProjects();
        loadDepartments();
        loadSkillsData();
        if (isEditing && id) {
            // Note: For simplicity in Chunk 3, we're not implementing edit mode
            // This would require a get assignment endpoint
        }
    }, [isEditing, id]);
    // Parse skills from input
    useEffect(() => {
        const skills = extractSkillsFromText(skillsInput, skillTags);
        setProjectSkills(skills);
    }, [skillsInput, skillTags, extractSkillsFromText]);
    // Update filtered people when dependencies change
    useEffect(() => {
        if (people.length > 0) {
            const sorted = sortPeopleByDepartmentAndSkills(people, formData.person, departments, peopleSkills, projectSkills);
            setFilteredPeople(sorted);
        }
    }, [people, formData.person, departments, peopleSkills, projectSkills]);
    // Sync search text with selected person
    useEffect(() => {
        if (formData.person) {
            const selectedPerson = people.find(p => p.id === formData.person);
            if (selectedPerson && personSearchText !== selectedPerson.name) {
                setPersonSearchText(selectedPerson.name);
            }
        }
        else {
            setPersonSearchText('');
        }
    }, [formData.person, people]);
    const loadPeople = async () => {
        try {
            const response = await peopleApi.list();
            const peopleList = response.results || [];
            setPeople(peopleList);
            setFilteredPeople(sortPeopleByDepartmentAndSkills(peopleList, formData.person, departments, peopleSkills, projectSkills));
        }
        catch (err) {
            setError('Failed to load people list');
        }
    };
    const loadProjects = async () => {
        try {
            const projectsList = await projectsApi.listAll();
            setProjects(projectsList);
        }
        catch (err) {
            setError('Failed to load projects list');
        }
    };
    const loadDepartments = async () => {
        try {
            const response = await departmentsApi.list();
            setDepartments(response.results || []);
        }
        catch (err) {
            console.error('Failed to load departments list:', err);
            // Don't set error for departments as it's not critical for assignment creation
        }
    };
    const loadSkillsData = async () => {
        try {
            // Load all skill tags for autocomplete
            const skillTagsResponse = await skillTagsApi.list();
            setSkillTags(skillTagsResponse.results || []);
            // Load people skills in batch
            const skillsResponse = await personSkillsApi.list();
            const skillsMap = new Map();
            // Group skills by person ID
            (skillsResponse.results || []).forEach(skill => {
                if (!skillsMap.has(skill.person)) {
                    skillsMap.set(skill.person, []);
                }
                skillsMap.get(skill.person).push(skill);
            });
            setPeopleSkills(skillsMap);
        }
        catch (err) {
            console.error('Failed to load skills data:', err);
            // Don't set error for skills as it's not critical for assignment creation
        }
    };
    const validateForm = () => {
        const errors = {};
        if (!formData.person) {
            errors.person = 'Please select a person';
        }
        if (!formData.project) {
            errors.project = 'Please select a project';
        }
        // Validate weekly hours
        const totalHours = Object.values(formData.weeklyHours).reduce((sum, hours) => sum + hours, 0);
        if (totalHours === 0) {
            errors.weeklyHours = 'Please allocate at least some hours per week';
        }
        // Check if any week exceeds person capacity
        if (formData.person) {
            const selectedPerson = people.find(p => p.id === formData.person);
            if (selectedPerson) {
                for (const [week, hours] of Object.entries(formData.weeklyHours)) {
                    if (hours > (selectedPerson.weeklyCapacity || 0)) {
                        errors[`week_${week}`] = `Hours for week ${formatWeekDisplay(week)} exceed capacity (${selectedPerson.weeklyCapacity || 0}h)`;
                    }
                }
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
        try {
            setLoading(true);
            setError(null);
            const assignmentData = {
                person: Number(formData.person),
                project: Number(formData.project),
                weeklyHours: formData.weeklyHours,
            };
            if (isEditing && id) {
                await assignmentsApi.update(parseInt(id), assignmentData);
            }
            else {
                await assignmentsApi.create(assignmentData);
            }
            navigate('/assignments');
        }
        catch (err) {
            setError(err.message || `Failed to ${isEditing ? 'update' : 'create'} assignment`);
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
    const handleWeeklyHoursChange = (weekKey, hours) => {
        setFormData(prev => ({
            ...prev,
            weeklyHours: {
                ...prev.weeklyHours,
                [weekKey]: Math.max(0, hours)
            }
        }));
        // Clear week-specific validation errors
        const weekErrorKey = `week_${weekKey}`;
        if (validationErrors[weekErrorKey]) {
            setValidationErrors(prev => ({ ...prev, [weekErrorKey]: '', weeklyHours: '' }));
        }
    };
    const handleBulkSet = () => {
        if (bulkHours >= 0) {
            const newWeeklyHours = {};
            availableWeeks.forEach(week => {
                newWeeklyHours[week] = bulkHours;
            });
            setFormData(prev => ({ ...prev, weeklyHours: newWeeklyHours }));
        }
    };
    const getTotalHours = () => {
        return Object.values(formData.weeklyHours).reduce((sum, hours) => sum + hours, 0);
    };
    const getSelectedPersonCapacity = () => {
        if (!formData.person)
            return 0;
        const selectedPerson = people.find(p => p.id === formData.person);
        return selectedPerson?.weeklyCapacity || 0;
    };
    // Handle immediate input update (no delay for UI feedback)
    const handlePersonSearchChange = (value) => {
        setPersonSearchText(value);
        setShowPersonDropdown(true);
        // Clear validation error
        if (validationErrors.person) {
            setValidationErrors(prev => ({ ...prev, person: '' }));
        }
    };
    // Perform actual search with debounced value
    const performPersonSearch = (searchText) => {
        const sorted = sortPeopleByDepartmentAndSkills(people, formData.person, departments, peopleSkills, projectSkills);
        if (searchText.trim() === '') {
            setFilteredPeople(sorted);
        }
        else {
            const filtered = sorted.filter(person => person.name.toLowerCase().includes(searchText.toLowerCase()));
            setFilteredPeople(filtered);
        }
    };
    // Effect to trigger search when debounced value changes
    useEffect(() => {
        if (people.length > 0) {
            performPersonSearch(debouncedPersonSearch);
        }
    }, [debouncedPersonSearch, people, departments, peopleSkills, projectSkills, formData.person]);
    const selectPerson = (person) => {
        setFormData(prev => ({ ...prev, person: person.id }));
        setPersonSearchText(person.name);
        setShowPersonDropdown(false);
        setFilteredPeople(sortPeopleByDepartmentAndSkills(people, person.id, departments, peopleSkills, projectSkills));
    };
    return (_jsx(Layout, { children: _jsxs("div", { className: "max-w-4xl mx-auto", children: [_jsxs("div", { className: "mb-6", children: [_jsx("h1", { className: "text-2xl font-bold text-[#cccccc]", children: isEditing ? 'Edit Assignment' : 'Create New Assignment' }), _jsx("p", { className: "text-[#969696] mt-1", children: "Assign a team member to a project with weekly hour allocations for the next 12 weeks" }), formData.person && (_jsxs("div", { className: "mt-2 text-sm text-slate-300", children: ["Total hours: ", _jsxs("span", { className: "font-semibold text-blue-400", children: [getTotalHours(), "h"] }), ' • ', "Selected person capacity: ", _jsxs("span", { className: "font-semibold text-green-400", children: [getSelectedPersonCapacity(), "h/week"] })] }))] }), error && (_jsx(Card, { className: "bg-red-500/20 border-red-500/50 p-4 mb-6", children: _jsx("div", { className: "text-red-400", children: error }) })), _jsx(Card, { className: "bg-[#2d2d30] border-[#3e3e42] p-6", children: _jsxs("form", { onSubmit: handleSubmit, className: "space-y-6", children: [_jsxs("div", { className: "relative", children: [_jsxs("label", { className: "block text-sm font-medium text-[#cccccc] mb-2", children: ["Person ", _jsx("span", { className: "text-red-400", children: "*" })] }), _jsx("input", { type: "text", value: personSearchText, onChange: (e) => handlePersonSearchChange(e.target.value), onFocus: () => setShowPersonDropdown(true), onBlur: () => {
                                            // Delay hiding to allow for click selection
                                            setTimeout(() => setShowPersonDropdown(false), 200);
                                        }, placeholder: "Type to search people...", className: "w-full px-3 py-2 rounded-md border text-sm transition-colors bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] placeholder-[#969696] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" }), validationErrors.person && (_jsx("p", { className: "text-sm text-red-400 mt-1", children: validationErrors.person })), showPersonDropdown && filteredPeople.length > 0 && (_jsx("div", { className: "absolute z-50 w-full mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded-md shadow-lg max-h-60 overflow-auto", children: filteredPeople.map((person) => {
                                            const isSelectedDepartment = formData.person &&
                                                people.find(p => p.id === formData.person)?.department === person.department;
                                            const departmentName = getDepartmentName(person, departments);
                                            const personSkillsList = peopleSkills.get(person.id) || [];
                                            const skillScore = calculateSkillMatchScore(person, personSkillsList, projectSkills);
                                            let prefix = '';
                                            if (skillScore >= 80)
                                                prefix = '🎯 '; // Perfect match
                                            else if (skillScore >= 50)
                                                prefix = '⭐ '; // Good match
                                            else if (isSelectedDepartment)
                                                prefix = '🏢 '; // Same department
                                            const skillInfo = skillScore > 0 ? ` (${skillScore}% skill match)` : '';
                                            return (_jsxs("div", { className: "px-3 py-2 cursor-pointer hover:bg-[#3e3e42] text-[#cccccc] text-sm", onClick: () => selectPerson(person), children: [_jsxs("div", { className: "font-medium", children: [prefix, person.name] }), _jsxs("div", { className: "text-xs text-[#969696]", children: [departmentName, " \u2022 ", person.weeklyCapacity, "h capacity", skillInfo] })] }, person.id));
                                        }) })), formData.person && (_jsx("div", { className: "mt-3 space-y-3", children: (() => {
                                            const selectedPerson = people.find(p => p.id === Number(formData.person));
                                            if (!selectedPerson)
                                                return null;
                                            const personDept = getDepartmentName(selectedPerson, departments);
                                            const sameDeptCount = people.filter(p => p.department === selectedPerson.department).length - 1;
                                            const personSkillsList = peopleSkills.get(selectedPerson.id) || [];
                                            const skillScore = calculateSkillMatchScore(selectedPerson, personSkillsList, projectSkills);
                                            const skillWarnings = getSkillWarnings(selectedPerson, personSkillsList, projectSkills);
                                            return (_jsxs(_Fragment, { children: [_jsx("div", { className: "p-3 bg-[#3e3e42]/30 rounded border border-[#3e3e42]", children: _jsxs("div", { className: "text-sm", children: [_jsx("div", { className: "text-[#cccccc] font-medium mb-1", children: "\uD83D\uDCCA Assignment Insights" }), _jsxs("div", { className: "text-[#969696]", children: [_jsxs("div", { children: ["Department: ", _jsx("span", { className: "text-[#cccccc]", children: personDept })] }), _jsxs("div", { children: ["Capacity: ", _jsxs("span", { className: "text-[#cccccc]", children: [selectedPerson.weeklyCapacity || 0, "h/week"] })] }), projectSkills.length > 0 && (_jsxs("div", { className: `mt-1 ${skillScore >= 80 ? 'text-emerald-400' :
                                                                                skillScore >= 50 ? 'text-blue-400' :
                                                                                    skillScore > 0 ? 'text-amber-400' : 'text-red-400'}`, children: ["\uD83C\uDFAF Skill match: ", skillScore, "%"] })), sameDeptCount > 0 && (_jsxs("div", { className: "mt-1 text-blue-400", children: ["\uD83D\uDCA1 ", sameDeptCount, " other people available in ", personDept] }))] })] }) }), skillWarnings.length > 0 && (_jsx("div", { className: "p-3 bg-amber-500/20 border border-amber-500/30 rounded", children: _jsxs("div", { className: "text-sm", children: [_jsx("div", { className: "text-amber-400 font-medium mb-1", children: "\u26A0\uFE0F Skills Assessment" }), _jsx("div", { className: "space-y-1", children: skillWarnings.map((warning, idx) => (_jsx("div", { className: "text-amber-300 text-xs", children: warning }, idx))) })] }) })), personSkillsList.length > 0 && (_jsx("div", { className: "p-3 bg-blue-500/10 border border-blue-500/30 rounded", children: _jsxs("div", { className: "text-sm", children: [_jsxs("div", { className: "text-blue-400 font-medium mb-2", children: ["\uD83D\uDCAA ", selectedPerson.name, "'s Skills"] }), _jsxs("div", { className: "flex flex-wrap gap-1", children: [personSkillsList
                                                                            .filter(skill => skill.skillType === 'strength')
                                                                            .slice(0, 5)
                                                                            .map(skill => (_jsx("span", { className: "px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs", children: skill.skillTagName }, skill.id))), personSkillsList.filter(skill => skill.skillType === 'strength').length > 5 && (_jsxs("span", { className: "px-2 py-1 bg-slate-500/20 text-slate-400 rounded text-xs", children: ["+", personSkillsList.filter(skill => skill.skillType === 'strength').length - 5, " more"] }))] })] }) }))] }));
                                        })() }))] }), _jsxs("div", { children: [_jsxs("label", { className: "block text-sm font-medium text-[#cccccc] mb-2", children: ["Required Skills ", _jsx("span", { className: "text-[#969696]", children: "(optional)" })] }), _jsx("input", { type: "text", value: skillsInput, onChange: (e) => setSkillsInput(e.target.value), placeholder: "e.g., React, Python, Project Management, Heat Calculations", className: "w-full px-3 py-2 rounded-md border text-sm transition-colors bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" }), _jsx("p", { className: "text-[#969696] text-sm mt-1", children: "Enter skills needed for this assignment (comma-separated). This helps match the best person for the job." }), projectSkills.length > 0 && (_jsxs("div", { className: "mt-2 flex flex-wrap gap-1", children: [_jsx("span", { className: "text-xs text-[#969696]", children: "Detected skills:" }), projectSkills.map((skill, idx) => (_jsx("span", { className: "px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs", children: skill }, idx)))] }))] }), _jsxs("div", { children: [_jsxs("label", { className: "block text-sm font-medium text-[#cccccc] mb-2", children: ["Project ", _jsx("span", { className: "text-red-400", children: "*" })] }), _jsxs("select", { value: formData.project, onChange: (e) => handleChange('project', e.target.value), className: "w-full px-3 py-2 rounded-md border text-sm transition-colors bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none", children: [_jsx("option", { value: "", children: "Select a project..." }), projects.map((project) => (_jsxs("option", { value: project.id, children: [project.name, " (", project.client, ")"] }, project.id)))] }), validationErrors.project && (_jsx("p", { className: "text-sm text-red-400 mt-1", children: validationErrors.project })), _jsx("p", { className: "text-[#969696] text-sm mt-1", children: "Select the project for this assignment" }), formData.person && formData.project && (_jsx("div", { className: "mt-3 p-3 bg-blue-500/10 rounded border border-blue-500/30", children: (() => {
                                            const selectedPerson = people.find(p => p.id === Number(formData.person));
                                            const selectedProject = projects.find(p => p.id === Number(formData.project));
                                            if (!selectedPerson || !selectedProject)
                                                return null;
                                            const sameDeptPeople = people.filter(p => p.department === selectedPerson.department && p.id !== selectedPerson.id);
                                            return (_jsxs("div", { className: "text-sm", children: [_jsx("div", { className: "text-blue-400 font-medium mb-1", children: "\uD83E\uDD1D Collaboration Opportunity" }), _jsxs("div", { className: "text-[#969696]", children: ["Assigning ", _jsx("span", { className: "text-[#cccccc]", children: selectedPerson.name }), " from", ' ', _jsx("span", { className: "text-[#cccccc]", children: getDepartmentName(selectedPerson, departments) }), " to", ' ', _jsx("span", { className: "text-[#cccccc]", children: selectedProject.name }), sameDeptPeople.length > 0 && (_jsxs("div", { className: "mt-1", children: ["Consider also involving: ", sameDeptPeople.slice(0, 3).map(p => p.name).join(', '), sameDeptPeople.length > 3 && ` and ${sameDeptPeople.length - 3} others`] }))] })] }));
                                        })() }))] }), _jsxs("div", { className: "bg-[#3e3e42]/50 p-4 rounded-lg border border-[#3e3e42]", children: [_jsx("label", { className: "block text-sm font-medium text-[#cccccc] mb-2", children: "Quick Set All Weeks" }), _jsxs("div", { className: "flex gap-2 items-center", children: [_jsx("input", { type: "number", min: "0", step: "0.5", value: bulkHours, onChange: (e) => setBulkHours(Math.max(0, parseFloat(e.target.value) || 0)), className: "px-3 py-1 rounded border text-sm bg-slate-600 border-slate-500 text-[#cccccc] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none w-20", placeholder: "0" }), _jsx("span", { className: "text-slate-300 text-sm", children: "hours per week" }), _jsx(Button, { type: "button", variant: "ghost", onClick: handleBulkSet, className: "text-blue-400 hover:text-blue-300 px-3 py-1", children: "Apply to All" })] }), _jsx("p", { className: "text-[#969696] text-xs mt-1", children: "Set the same hours for all 12 weeks, then adjust individual weeks as needed" })] }), _jsxs("div", { children: [_jsxs("label", { className: "block text-sm font-medium text-[#cccccc] mb-3", children: ["Weekly Hours Allocation ", _jsx("span", { className: "text-red-400", children: "*" })] }), validationErrors.weeklyHours && (_jsx("p", { className: "text-sm text-red-400 mb-3", children: validationErrors.weeklyHours })), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3", children: availableWeeks.map((weekKey) => {
                                            const weekError = validationErrors[`week_${weekKey}`];
                                            const currentHours = formData.weeklyHours[weekKey] || 0;
                                            const capacity = getSelectedPersonCapacity();
                                            const isOverCapacity = capacity > 0 && currentHours > capacity;
                                            return (_jsxs("div", { className: `p-3 rounded-lg border ${isOverCapacity
                                                    ? 'bg-red-500/20 border-red-500/50'
                                                    : 'bg-[#3e3e42] border-[#3e3e42]'}`, children: [_jsx("div", { className: "text-xs text-slate-300 mb-1", children: formatWeekDisplay(weekKey) }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("input", { type: "number", min: "0", step: "0.5", value: currentHours, onChange: (e) => handleWeeklyHoursChange(weekKey, parseFloat(e.target.value) || 0), className: `w-full px-2 py-1 text-sm rounded border ${isOverCapacity
                                                                    ? 'bg-red-900/50 border-red-500 text-red-300'
                                                                    : 'bg-slate-600 border-slate-500 text-[#cccccc]'} focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none`, placeholder: "0" }), _jsx("span", { className: "text-xs text-[#969696]", children: "h" })] }), weekError && (_jsx("p", { className: "text-xs text-red-400 mt-1", children: weekError }))] }, weekKey));
                                        }) }), _jsx("p", { className: "text-[#969696] text-sm mt-2", children: "Enter hours per week for each of the next 12 weeks. Red highlighting indicates hours exceed the person's capacity." })] }), _jsxs("div", { className: "flex justify-between pt-4", children: [_jsx(Button, { type: "button", variant: "ghost", onClick: () => navigate('/assignments'), disabled: loading, children: "Cancel" }), _jsx(Button, { type: "submit", variant: "primary", disabled: loading, children: loading ? 'Saving...' : (isEditing ? 'Update Assignment' : 'Create Assignment') })] })] }) })] }) }));
};
export default AssignmentForm;
