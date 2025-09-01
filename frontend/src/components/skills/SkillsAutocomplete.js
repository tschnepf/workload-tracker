import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Skills Autocomplete Component - Following existing role autocomplete pattern
 * Based on ProjectsList.tsx role search implementation (Line 912-937)
 */
import { useState, useEffect } from 'react';
import { skillTagsApi } from '@/services/api';
const SkillsAutocomplete = ({ selectedSkills, onSkillsChange, skillType = 'all', placeholder = "Add skills...", className = "w-full px-2 py-1 text-xs bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none" }) => {
    const [skillSearch, setSkillSearch] = useState('');
    const [skillResults, setSkillResults] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [isCreatingSkill, setIsCreatingSkill] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    // Search skills using real API
    const searchSkills = async (searchTerm) => {
        if (searchTerm.length < 2) {
            setSkillResults([]);
            setShowDropdown(false);
            return;
        }
        try {
            const response = await skillTagsApi.list({ search: searchTerm });
            const filtered = response.results.filter(skill => !selectedSkills.some(selected => selected.skillTagName === skill.name)).slice(0, 5);
            setSkillResults(filtered);
            setShowDropdown(filtered.length > 0);
            setSelectedIndex(-1); // Reset selection when results change
        }
        catch (error) {
            console.error('Error searching skills:', error);
            setSkillResults([]);
            setShowDropdown(false);
        }
    };
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            searchSkills(skillSearch);
        }, 300); // Debounce search
        return () => clearTimeout(timeoutId);
    }, [skillSearch, selectedSkills]);
    const handleSkillSelect = (skill) => {
        const newSkill = {
            id: 0, // Will be set by backend
            person: 0, // Will be set by parent component
            skillTagId: skill.id,
            skillTagName: skill.name,
            skillType: skillType === 'all' ? 'strength' : skillType,
            proficiencyLevel: 'beginner',
            notes: '',
            lastUsed: null,
            createdAt: '',
            updatedAt: ''
        };
        onSkillsChange([...selectedSkills, newSkill]);
        setSkillSearch('');
        setShowDropdown(false);
        setSelectedIndex(-1);
    };
    const handleSkillRemove = (skillToRemove) => {
        onSkillsChange(selectedSkills.filter(skill => skill.skillTagName !== skillToRemove.skillTagName));
    };
    const createNewSkill = async (skillName) => {
        if (!skillName.trim() || isCreatingSkill)
            return;
        setIsCreatingSkill(true);
        try {
            // Create new skill tag in the database
            const newSkillTag = await skillTagsApi.create({
                name: skillName.trim(),
                category: '', // Default empty category
                description: ''
            });
            // Add the new skill to the user's skills
            const newSkill = {
                id: 0,
                person: 0,
                skillTagId: newSkillTag.id,
                skillTagName: newSkillTag.name,
                skillType: skillType === 'all' ? 'strength' : skillType,
                proficiencyLevel: 'beginner',
                notes: '',
                lastUsed: null,
                createdAt: '',
                updatedAt: ''
            };
            onSkillsChange([...selectedSkills, newSkill]);
            setSkillSearch('');
            setShowDropdown(false);
            setSelectedIndex(-1);
        }
        catch (error) {
            console.error('Failed to create new skill:', error);
        }
        finally {
            setIsCreatingSkill(false);
        }
    };
    const handleKeyDown = (e) => {
        const totalOptions = skillResults.length + (skillSearch.length >= 2 && !skillResults.some(skill => skill.name.toLowerCase() === skillSearch.trim().toLowerCase()) ? 1 : 0); // +1 for "Create new" option if shown
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (showDropdown || skillSearch.length >= 2) {
                setSelectedIndex(prev => prev < totalOptions - 1 ? prev + 1 : prev);
            }
        }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (showDropdown || skillSearch.length >= 2) {
                setSelectedIndex(prev => prev > -1 ? prev - 1 : -1);
            }
        }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < skillResults.length) {
                // Select existing skill
                handleSkillSelect(skillResults[selectedIndex]);
            }
            else if (selectedIndex === skillResults.length && skillSearch.length >= 2) {
                // Create new skill (last option)
                createNewSkill(skillSearch.trim());
            }
        }
        else if (e.key === 'Escape') {
            setShowDropdown(false);
            setSelectedIndex(-1);
        }
        else if (e.key === 'Tab' && skillSearch.trim()) {
            e.preventDefault();
            // Check if the typed skill already exists (case-insensitive)
            const existingSkill = skillResults.find(skill => skill.name.toLowerCase() === skillSearch.trim().toLowerCase());
            if (existingSkill) {
                handleSkillSelect(existingSkill);
            }
            else {
                // Create new skill
                createNewSkill(skillSearch.trim());
            }
        }
    };
    const getSkillTypeColor = (type) => {
        switch (type) {
            case 'strength': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            case 'development': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
            case 'learning': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
        }
    };
    return (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "relative", children: [_jsx("input", { type: "text", placeholder: placeholder, value: skillSearch, onChange: (e) => setSkillSearch(e.target.value), onKeyDown: handleKeyDown, disabled: isCreatingSkill, className: `${className} ${isCreatingSkill ? 'opacity-50 cursor-wait' : ''}` }), (showDropdown && skillResults.length > 0) || (skillSearch.length >= 2 && !isCreatingSkill) ? (_jsxs("div", { className: "absolute top-full left-0 right-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 max-h-32 overflow-y-auto", children: [skillResults.map((skill, index) => (_jsxs("button", { onClick: () => handleSkillSelect(skill), className: `w-full text-left px-2 py-1 text-xs hover:bg-[#3e3e42] transition-colors text-[#cccccc] border-b border-[#3e3e42] last:border-b-0 ${selectedIndex === index ? 'bg-[#007acc]/30 border-[#007acc]' : ''}`, children: [_jsx("div", { className: "font-medium", children: skill.name }), skill.category && (_jsx("div", { className: "text-[#969696]", children: skill.category }))] }, skill.id))), skillSearch.length >= 2 && !skillResults.some(skill => skill.name.toLowerCase() === skillSearch.trim().toLowerCase()) && (_jsx("button", { onClick: () => createNewSkill(skillSearch.trim()), className: `w-full text-left px-2 py-1 text-xs hover:bg-[#3e3e42] transition-colors text-[#969696] border-t border-[#3e3e42] bg-[#3e3e42]/30 ${selectedIndex === skillResults.length ? 'bg-[#007acc]/30 border-[#007acc]' : ''}`, disabled: isCreatingSkill, children: _jsxs("div", { className: "flex items-center gap-1", children: [_jsxs("span", { children: ["+ Create \"", skillSearch.trim(), "\""] }), _jsx("span", { className: "text-xs opacity-75", children: "(Enter/Tab)" })] }) }))] })) : null] }), _jsx("div", { className: "flex flex-wrap gap-1", children: selectedSkills.map((skill, index) => (_jsxs("div", { className: `px-2 py-1 rounded-full border text-xs font-medium flex items-center gap-1 ${getSkillTypeColor(skill.skillType)}`, children: [skill.skillTagName, _jsx("button", { onClick: () => handleSkillRemove(skill), className: "hover:opacity-80 transition-opacity", children: "\u00D7" })] }, `${skill.skillTagName}-${index}`))) })] }));
};
export default SkillsAutocomplete;
