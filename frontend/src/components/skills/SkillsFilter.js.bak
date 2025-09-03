import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Skills Filter Component - Advanced skills filtering for search and filtering
 */
import { useState, useEffect, useRef } from 'react';
import { skillTagsApi } from '@/services/api';
const SkillsFilter = ({ selectedSkills, onSkillsChange, placeholder = "Filter by skills...", className = "", maxDisplayedSkills = 5 }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [availableSkills, setAvailableSkills] = useState([]);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef(null);
    useEffect(() => {
        loadSkills();
    }, []);
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
                setSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const loadSkills = async () => {
        try {
            setLoading(true);
            const response = await skillTagsApi.list();
            setAvailableSkills(response.results || []);
        }
        catch (err) {
            console.error('Failed to load skills:', err);
        }
        finally {
            setLoading(false);
        }
    };
    const filteredSkills = availableSkills.filter(skill => skill.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !selectedSkills.includes(skill.name));
    const handleSkillSelect = (skillName) => {
        onSkillsChange([...selectedSkills, skillName]);
        setSearchTerm('');
    };
    const handleSkillRemove = (skillName) => {
        onSkillsChange(selectedSkills.filter(skill => skill !== skillName));
    };
    const handleClearAll = () => {
        onSkillsChange([]);
    };
    return (_jsxs("div", { ref: containerRef, className: `relative ${className}`, children: [_jsxs("div", { className: "min-h-[42px] px-3 py-2 bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] focus-within:border-[#007acc] cursor-text", onClick: () => setIsOpen(true), children: [_jsxs("div", { className: "flex flex-wrap gap-1 mb-1", children: [selectedSkills.slice(0, maxDisplayedSkills).map((skill) => (_jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs", children: [skill, _jsx("button", { onClick: (e) => {
                                            e.stopPropagation();
                                            handleSkillRemove(skill);
                                        }, className: "hover:text-blue-300 transition-colors", children: "\u00D7" })] }, skill))), selectedSkills.length > maxDisplayedSkills && (_jsxs("span", { className: "px-2 py-1 bg-slate-500/20 text-slate-400 rounded text-xs", children: ["+", selectedSkills.length - maxDisplayedSkills, " more"] }))] }), _jsx("input", { type: "text", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), onFocus: () => setIsOpen(true), placeholder: selectedSkills.length > 0 ? "Add more skills..." : placeholder, className: "bg-transparent border-none outline-none text-[#cccccc] placeholder-[#969696] w-full text-sm" })] }), selectedSkills.length > 0 && (_jsx("button", { onClick: handleClearAll, className: "absolute right-2 top-1/2 transform -translate-y-1/2 text-[#969696] hover:text-[#cccccc] text-sm", children: "Clear all" })), isOpen && (_jsxs("div", { className: "absolute top-full left-0 right-0 mt-1 max-h-48 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 overflow-auto", children: [loading && (_jsx("div", { className: "px-3 py-2 text-sm text-[#969696]", children: "Loading skills..." })), !loading && filteredSkills.length === 0 && searchTerm && (_jsxs("div", { className: "px-3 py-2 text-sm text-[#969696]", children: ["No skills found matching \"", searchTerm, "\""] })), !loading && filteredSkills.length === 0 && !searchTerm && selectedSkills.length === availableSkills.length && (_jsx("div", { className: "px-3 py-2 text-sm text-[#969696]", children: "All available skills selected" })), filteredSkills.slice(0, 10).map((skill) => (_jsx("button", { onClick: () => handleSkillSelect(skill.name), className: "w-full px-3 py-2 text-left text-sm text-[#cccccc] hover:bg-[#3e3e42] transition-colors", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { children: skill.name }), skill.category && (_jsx("span", { className: "text-xs text-[#969696]", children: skill.category }))] }) }, skill.id))), filteredSkills.length > 10 && (_jsxs("div", { className: "px-3 py-2 text-xs text-[#969696] border-t border-[#3e3e42]", children: [filteredSkills.length - 10, " more skills available..."] }))] }))] }));
};
export default SkillsFilter;
