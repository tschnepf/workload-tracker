/**
 * Assignment Form - Create/Edit assignment with 12-week hour planning
 * RETROFIT: Changed from percentage to hours-per-week with 12-week timeline
 */

import React, { useState, useEffect } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { useNavigate, useParams } from 'react-router';
import { Person, Project, Department, PersonSkill, SkillTag } from '@/types/models';
import { assignmentsApi, peopleApi, projectsApi, departmentsApi, personSkillsApi, skillTagsApi } from '@/services/api';
import { createAssignment, updateAssignment } from '@/lib/mutations/assignments';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { useDebounce } from '@/hooks/useDebounce';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { getSundaysFrom } from '@/utils/weeks';

interface WeeklyHours {
  [weekKey: string]: number;
}

interface AssignmentFormData {
  person: number | '';
  project: number | '';
  weeklyHours: WeeklyHours;
}

type StepId = 'person' | 'skills' | 'weeks' | 'review';

interface StepDefinition {
  id: StepId;
  title: string;
  description: string;
}

const STEP_SEQUENCE: StepDefinition[] = [
  { id: 'person', title: 'Select Person', description: 'Choose a team member and target project' },
  { id: 'skills', title: 'Match Skills', description: 'Capture required skills and review fit' },
  { id: 'weeks', title: 'Allocate Weeks', description: 'Distribute hours across the 12-week horizon' },
  { id: 'review', title: 'Review & Submit', description: 'Confirm details before saving' },
];

// Weeks are generated via UTC-safe helpers (Sunday keys)
const getNext12Weeks = (): string[] => getSundaysFrom(new Date(), 12);

// Helper function to format week display
const formatWeekDisplay = (weekKey: string): string => {
  const date = new Date(weekKey + 'T00:00:00Z');
  const endDate = new Date(date);
  endDate.setDate(date.getDate() + 6);
  
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${date.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
};

// Helper function to get department name for a person
const getDepartmentName = (person: Person, departments: Department[]): string => {
  if (!person.department) return 'No Department';
  const dept = departments.find(d => d.id === person.department);
  return dept?.name || 'Unknown Department';
};


const AssignmentForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const { state: deptState } = useDepartmentFilter();

  // Server-side skill match scores (by personId) for ranking
  const [skillMatchScores, setSkillMatchScores] = useState<Map<number, number>>(new Map());

  // Helper function to extract skills from input text - will be used when skills input is processed
  const extractSkillsFromText = (text: string, availableSkills: SkillTag[]): string[] => {
    if (!text.trim()) return [];
    
    const words = text.toLowerCase().split(/[,\s]+/).filter(word => word.length > 2);
    const foundSkills: string[] = [];
    
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
      if (trimmed.length > 2 && !foundSkills.some(existing => 
        existing.toLowerCase().includes(trimmed.toLowerCase())
      )) {
        foundSkills.push(trimmed);
      }
    });
    
    return foundSkills;
  };

  // Helper function to sort people by department and skill matching
  const sortPeopleByDepartmentAndSkills = (
    people: Person[], 
    selectedPersonId: number | string, 
    departments: Department[],
    peopleSkills: Map<number, PersonSkill[]>,
    requiredSkills: string[]
  ): Person[] => {
    if (!selectedPersonId && requiredSkills.length === 0) return people;
    
    const selectedPerson = people.find(p => p.id === Number(selectedPersonId));
    const selectedDepartment = selectedPerson?.department;
    
    return [...people].sort((a, b) => {
      // Use server-side skill scores when available
      const aSkillScore = requiredSkills.length > 0 ? (skillMatchScores.get(a.id!) || 0) : 0;
      const bSkillScore = requiredSkills.length > 0 ? (skillMatchScores.get(b.id!) || 0) : 0;
      
      // If we have required skills, prioritize skill matching
      if (requiredSkills.length > 0) {
        if (aSkillScore !== bSkillScore) {
          return bSkillScore - aSkillScore;  // Higher skill score first
        }
      }
      
      // Same department as selected person comes next
      if (selectedDepartment) {
        const aDept = a.department;
        const bDept = b.department;
        
        if (aDept === selectedDepartment && bDept !== selectedDepartment) return -1;
        if (bDept === selectedDepartment && aDept !== selectedDepartment) return 1;
      }
      
      // Then sort by department name
      const aDeptName = getDepartmentName(a, departments);
      const bDeptName = getDepartmentName(b, departments);
      if (aDeptName !== bDeptName) return aDeptName.localeCompare(bDeptName);
      
      // Finally sort by person name
      return a.name.localeCompare(b.name);
    });
  };

  

  // Compute descendant department IDs when include-children is on
  const getDescendantDepartmentIds = (rootId: number | null | undefined, allDepts: Department[]): Set<number> => {
    const result = new Set<number>();
    if (rootId == null) return result;
    const stack = [rootId];
    while (stack.length) {
      const current = stack.pop()!;
      result.add(current);
      for (const d of allDepts) {
        if (d.parentDepartment === current && d.id != null && !result.has(d.id)) {
          stack.push(d.id);
        }
      }
    }
    return result;
  };

  // Helper function to get skill mismatch warnings
  const getSkillWarnings = (
    person: Person, 
    personSkills: PersonSkill[], 
    requiredSkills: string[]
  ): string[] => {
    const warnings: string[] = [];
    
    if (requiredSkills.length === 0) return warnings;
    
    const personStrengths = personSkills
      .filter(skill => skill.skillType === 'strength')
      .map(skill => skill.skillTagName || '');
    
    const personDevelopment = personSkills
      .filter(skill => skill.skillType === 'development')
      .map(skill => skill.skillTagName || '');
    
    const matchedSkills = requiredSkills.filter(required => 
      personStrengths.some(strength => 
        strength.toLowerCase().includes(required.toLowerCase()) || required.toLowerCase().includes(strength.toLowerCase())
      )
    );
    
    const developmentMatches = requiredSkills.filter(required => 
      personDevelopment.some(dev => 
        dev.toLowerCase().includes(required.toLowerCase()) || required.toLowerCase().includes(dev.toLowerCase())
      )
    );
    
    const unmatchedSkills = requiredSkills.filter(required => 
      !matchedSkills.some(matched => matched.toLowerCase().includes(required.toLowerCase()))
    );
    
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

  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [peopleSkills, setPeopleSkills] = useState<Map<number, PersonSkill[]>>(new Map());
  const [skillTags, setSkillTags] = useState<SkillTag[]>([]);
  const [projectSkills, setProjectSkills] = useState<string[]>([]);  // Skills required for this project
  const [availableWeeks] = useState<string[]>(getNext12Weeks());
  const [formData, setFormData] = useState<AssignmentFormData>({
    person: '',
    project: '',
    weeklyHours: {},
  });
  const [skillsInput, setSkillsInput] = useState<string>('');  // Skills required input field
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const currentStep = STEP_SEQUENCE[currentStepIndex];
  const isLastStep = currentStepIndex === STEP_SEQUENCE.length - 1;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [bulkHours, setBulkHours] = useState<number>(0);
  const [personSearchText, setPersonSearchText] = useState('');
  const [filteredPeople, setFilteredPeople] = useState<Person[]>([]);
  const [showPersonDropdown, setShowPersonDropdown] = useState(false);
  const [showAllDepartments, setShowAllDepartments] = useState(false);
  
  // Debounced person search for better performance
  const debouncedPersonSearch = useDebounce(personSearchText, 300);

  useAuthenticatedEffect(() => {
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

  // Fetch server-side skill match scores when required skills or filters change
  useAuthenticatedEffect(() => {
    const run = async () => {
      if (projectSkills.length === 0) { setSkillMatchScores(new Map()); return; }
      try {
        const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
        const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
        const res = await peopleApi.skillMatch(projectSkills, { department: dept, include_children: inc, limit: 200 });
        const map = new Map<number, number>();
        (res || []).forEach(item => { if (item.personId != null) map.set(item.personId, item.score || 0); });
        setSkillMatchScores(map);
      } catch {
        setSkillMatchScores(new Map());
      }
    };
    run();
  }, [JSON.stringify(projectSkills), deptState.selectedDepartmentId, deptState.includeChildren]);

  // Fetch server-side skill match scores for current required skills and department scope
  useAuthenticatedEffect(() => {
    const run = async () => {
      if (projectSkills.length === 0) { setSkillMatchScores(new Map()); return; }
      try {
        const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
        const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
        const res = await peopleApi.skillMatch(projectSkills, { department: dept, include_children: inc, limit: 200 });
        const map = new Map<number, number>();
        (res || []).forEach(item => { if (item.personId != null) map.set(item.personId, item.score || 0); });
        setSkillMatchScores(map);
      } catch {
        setSkillMatchScores(new Map());
      }
    };
    run();
  }, [JSON.stringify(projectSkills), deptState.selectedDepartmentId, deptState.includeChildren]);

  // Update filtered people when dependencies change
  useEffect(() => {
    if (people.length > 0) {
      let base = people;
      if (!showAllDepartments && deptState.selectedDepartmentId != null) {
        const allowed = deptState.includeChildren
          ? getDescendantDepartmentIds(Number(deptState.selectedDepartmentId), departments)
          : new Set<number>([Number(deptState.selectedDepartmentId)]);
        base = base.filter(p => (p.department != null) && allowed.has(Number(p.department)));
      }
      const sorted = sortPeopleByDepartmentAndSkills(base, formData.person, departments, peopleSkills, projectSkills);
      setFilteredPeople(sorted);
    }
  }, [people, formData.person, departments, peopleSkills, projectSkills, deptState.selectedDepartmentId, deptState.includeChildren, showAllDepartments]);

  // Sync search text with selected person
  useEffect(() => {
    if (formData.person) {
      const selectedPerson = people.find(p => p.id === formData.person);
      if (selectedPerson && personSearchText !== selectedPerson.name) {
        setPersonSearchText(selectedPerson.name);
      }
    } else {
      setPersonSearchText('');
    }
  }, [formData.person, people]);

  const loadPeople = async () => {
    try {
      const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
      const inc = deptState.includeChildren ? 1 : 0;
      const page = await peopleApi.list({ page: 1, page_size: 100, department: dept, include_children: dept != null ? inc : undefined });
      const peopleList = page.results || [];
      setPeople(peopleList);
      setFilteredPeople(sortPeopleByDepartmentAndSkills(peopleList, formData.person, departments, peopleSkills, projectSkills));
    } catch (err: any) {
      setError('Failed to load people list');
    }
  };

  const loadProjects = async () => {
    try {
      const page = await projectsApi.list({ page: 1, page_size: 100 });
      setProjects(page.results || []);
    } catch (err: any) {
      setError('Failed to load projects list');
    }
  };

  const loadDepartments = async () => {
    try {
      const response = await departmentsApi.list();
      setDepartments(response.results || []);
    } catch (err: any) {
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
      const skillsMap = new Map<number, PersonSkill[]>();
      
      // Group skills by person ID
      (skillsResponse.results || []).forEach(skill => {
        if (!skillsMap.has(skill.person)) {
          skillsMap.set(skill.person, []);
        }
        skillsMap.get(skill.person)!.push(skill);
      });
      
      setPeopleSkills(skillsMap);
    } catch (err: any) {
      console.error('Failed to load skills data:', err);
      // Don't set error for skills as it's not critical for assignment creation
    }
  };

  const validateForm = (): boolean => {
    const fieldErrors: Record<string, string> = {};
    if (!formData.person) fieldErrors.person = 'Please select a person';
    if (!formData.project) fieldErrors.project = 'Please select a project';
    const weeklyErrors = buildWeeklyHourErrors();
    const combined = { ...fieldErrors, ...weeklyErrors };
    setValidationErrors(combined);
    return Object.keys(combined).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
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
        await updateAssignment(parseInt(id), assignmentData, assignmentsApi);
      } else {
        await createAssignment(assignmentData, assignmentsApi);
      }

      navigate('/assignments');
    } catch (err: any) {
      setError(err.message || `Failed to ${isEditing ? 'update' : 'create'} assignment`);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof AssignmentFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const toCeilInt = (v: number) => {
    const n = Math.ceil(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const handleWeeklyHoursChange = (weekKey: string, hours: number) => {
    setFormData(prev => ({
      ...prev,
      weeklyHours: {
        ...prev.weeklyHours,
        [weekKey]: toCeilInt(hours)
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
      const newWeeklyHours: WeeklyHours = {};
      availableWeeks.forEach(week => {
        newWeeklyHours[week] = Math.ceil(bulkHours);
      });
      setFormData(prev => ({ ...prev, weeklyHours: newWeeklyHours }));
    }
  };

  const buildWeeklyHourErrors = () => {
    const weeklyErrors: Record<string, string> = {};
    const totalHours = Object.values(formData.weeklyHours).reduce((sum, hours) => sum + hours, 0);
    if (totalHours === 0) {
      weeklyErrors.weeklyHours = 'Please allocate at least some hours per week';
    }
    if (formData.person) {
      const selectedPerson = people.find(p => p.id === formData.person);
      const capacity = selectedPerson?.weeklyCapacity || 0;
      if (capacity > 0) {
        for (const [weekKey, hours] of Object.entries(formData.weeklyHours)) {
          if (hours > capacity) {
            weeklyErrors[`week_${weekKey}`] = `Exceeds capacity (${capacity}h)`;
          }
        }
      }
    }
    return weeklyErrors;
  };

  const clearWeeklyErrorState = (prevErrors: Record<string, string>) => {
    const next = { ...prevErrors };
    Object.keys(next).forEach((key) => {
      if (key === 'weeklyHours' || key.startsWith('week_')) {
        delete next[key];
      }
    });
    return next;
  };

  const validateWeeklySection = () => {
    const weeklyErrors = buildWeeklyHourErrors();
    setValidationErrors(prev => {
      const next = clearWeeklyErrorState(prev);
      return Object.keys(weeklyErrors).length ? { ...next, ...weeklyErrors } : next;
    });
    return Object.keys(weeklyErrors).length === 0;
  };

  const validatePersonProjectSection = () => {
    const personErrors: Record<string, string> = {};
    if (!formData.person) personErrors.person = 'Please select a person';
    if (!formData.project) personErrors.project = 'Please select a project';
    setValidationErrors(prev => {
      const next = { ...prev };
      delete next.person;
      delete next.project;
      return Object.keys(personErrors).length ? { ...next, ...personErrors } : next;
    });
    return Object.keys(personErrors).length === 0;
  };

  const validateStep = (stepId: StepId) => {
    if (stepId === 'person') {
      return validatePersonProjectSection();
    }
    if (stepId === 'weeks') {
      return validateWeeklySection();
    }
    return true;
  };

  const handleNextStep = () => {
    if (!validateStep(currentStep.id)) return;
    setCurrentStepIndex(prev => Math.min(prev + 1, STEP_SEQUENCE.length - 1));
  };

  const handlePreviousStep = () => {
    setCurrentStepIndex(prev => Math.max(prev - 1, 0));
  };

  const jumpToStep = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex > currentStepIndex) return;
    setCurrentStepIndex(targetIndex);
  };

  const getTotalHours = (): number => {
    return Object.values(formData.weeklyHours).reduce((sum, hours) => sum + hours, 0);
  };

  const getSelectedPersonCapacity = (): number => {
    if (!formData.person) return 0;
    const selectedPerson = people.find(p => p.id === formData.person);
    return selectedPerson?.weeklyCapacity || 0;
  };

  // Handle immediate input update (no delay for UI feedback)
  const handlePersonSearchChange = (value: string) => {
    setPersonSearchText(value);
    setShowPersonDropdown(true);
    
    // Clear validation error
    if (validationErrors.person) {
      setValidationErrors(prev => ({ ...prev, person: '' }));
    }
  };

  // Perform actual search with debounced value
  const performPersonSearch = (searchText: string) => {
    // Respect implicit global department filter in searches unless overridden
    let base = people;
    if (!showAllDepartments && deptState.selectedDepartmentId != null) {
      const allowed = deptState.includeChildren
        ? getDescendantDepartmentIds(Number(deptState.selectedDepartmentId), departments)
        : new Set<number>([Number(deptState.selectedDepartmentId)]);
      base = base.filter(p => (p.department != null) && allowed.has(Number(p.department)));
    }
    const sorted = sortPeopleByDepartmentAndSkills(base, formData.person, departments, peopleSkills, projectSkills);
    if (searchText.trim() === '') {
      setFilteredPeople(sorted);
    } else {
      const filtered = sorted.filter(person =>
        person.name.toLowerCase().includes(searchText.toLowerCase())
      );
      setFilteredPeople(filtered);
    }
  };

  // Effect to trigger search when debounced value changes
  useEffect(() => {
    if (people.length > 0) {
      performPersonSearch(debouncedPersonSearch);
    }
  }, [debouncedPersonSearch, people, departments, peopleSkills, projectSkills, formData.person]);

  const selectPerson = (person: Person) => {
    setFormData(prev => ({ ...prev, person: person.id! }));
    setPersonSearchText(person.name);
    setShowPersonDropdown(false);
    setFilteredPeople(sortPeopleByDepartmentAndSkills(people, person.id!, departments, peopleSkills, projectSkills));
  };

  const renderPersonStep = () => (
    <div className="space-y-6">
      <div className="relative">
        <label className="block text-sm font-medium text-[#cccccc] mb-2">
          Person <span className="text-red-400">*</span>
        </label>
        {deptState.selectedDepartmentId != null && (
          <div className="mb-2 flex items-center gap-2 text-xs text-[#cbd5e1]">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={!showAllDepartments}
                onChange={(e) => setShowAllDepartments(!e.target.checked)}
                className="w-3 h-3 text-[#007acc] bg-[#3e3e42] border-[#3e3e42] rounded focus:ring-[#007acc] focus:ring-1"
              />
              Limit to current department
            </label>
          </div>
        )}
        <input
          type="text"
          value={personSearchText}
          onChange={(e) => handlePersonSearchChange(e.target.value)}
          onFocus={() => setShowPersonDropdown(true)}
          onBlur={() => {
            setTimeout(() => setShowPersonDropdown(false), 200);
          }}
          placeholder="Type to search people..."
          className="w-full px-3 py-2 rounded-md border text-sm transition-colors bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] placeholder-[#969696] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        {validationErrors.person && (
          <p className="text-sm text-red-400 mt-1">{validationErrors.person}</p>
        )}
        {showPersonDropdown && filteredPeople.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded-md shadow-lg max-h-60 overflow-auto">
            {filteredPeople.map((person) => {
              const isSelectedDepartment = formData.person &&
                people.find(p => p.id === formData.person)?.department === person.department;
              const departmentName = getDepartmentName(person, departments);
              const personSkillsList = peopleSkills.get(person.id!) || [];
              const skillScore = skillMatchScores.get(person.id!) || 0;

              let prefix = '';
              if (skillScore >= 80) prefix = '🎯 ';
              else if (skillScore >= 50) prefix = '⭐ ';
              else if (isSelectedDepartment) prefix = '🏢 ';

              const skillInfo = skillScore > 0 ? ` (${skillScore}% skill match)` : '';

              return (
                <div
                  key={person.id}
                  className="px-3 py-2 cursor-pointer hover:bg-[#3e3e42] text-[#cccccc] text-sm"
                  onClick={() => selectPerson(person)}
                >
                  <div className="font-medium">
                    {prefix}{person.name}
                  </div>
                  <div className="text-xs text-[#969696]">
                    {departmentName} • {person.weeklyCapacity}h capacity{skillInfo}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-[#cccccc] mb-2">
          Project <span className="text-red-400">*</span>
        </label>
        <select
          value={formData.project}
          onChange={(e) => handleChange('project', e.target.value)}
          className="w-full px-3 py-2 rounded-md border text-sm transition-colors bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none min-h-[44px]"
        >
          <option value="">Select a project...</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name} ({project.client})
            </option>
          ))}
        </select>
        {validationErrors.project && (
          <p className="text-sm text-red-400 mt-1">{validationErrors.project}</p>
        )}
        <p className="text-[#969696] text-sm mt-1">
          Select the project for this assignment
        </p>
        {formData.person && formData.project && (
          <div className="mt-3 p-3 bg-blue-500/10 rounded border border-blue-500/30">
            {(() => {
              const selectedPerson = people.find(p => p.id === Number(formData.person));
              const selectedProject = projects.find(p => p.id === Number(formData.project));
              if (!selectedPerson || !selectedProject) return null;

              const sameDeptPeople = people.filter(
                p => p.department === selectedPerson.department && p.id !== selectedPerson.id
              );

              return (
                <div className="text-sm">
                  <div className="text-blue-400 font-medium mb-1">
                    🤝 Collaboration Opportunity
                  </div>
                  <div className="text-[#969696]">
                    Assigning <span className="text-[#cccccc]">{selectedPerson.name}</span> from{' '}
                    <span className="text-[#cccccc]">{getDepartmentName(selectedPerson, departments)}</span> to{' '}
                    <span className="text-[#cccccc]">{selectedProject.name}</span>
                    {sameDeptPeople.length > 0 && (
                      <div className="mt-1">
                        Consider also involving: {sameDeptPeople.slice(0, 3).map(p => p.name).join(', ')}
                        {sameDeptPeople.length > 3 && ` and ${sameDeptPeople.length - 3} others`}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );

  const renderSkillsStep = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-[#cccccc] mb-2">
          Required Skills <span className="text-[#969696]">(optional)</span>
        </label>
        <input
          type="text"
          value={skillsInput}
          onChange={(e) => setSkillsInput(e.target.value)}
          placeholder="e.g., React, Python, Project Management, Heat Calculations"
          className="w-full px-3 py-2 rounded-md border text-sm transition-colors bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        <p className="text-[#969696] text-sm mt-1">
          Enter skills needed for this assignment (comma-separated). This helps match the best person for the job.
        </p>
        {projectSkills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="text-xs text-[#969696]">Detected skills:</span>
            {projectSkills.map((skill, idx) => (
              <span key={idx} className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                {skill}
              </span>
            ))}
          </div>
        )}
      </div>

      {formData.person && (
        <div className="space-y-3">
          {(() => {
            const selectedPerson = people.find(p => p.id === Number(formData.person));
            if (!selectedPerson) return null;

            const personDept = getDepartmentName(selectedPerson, departments);
            const sameDeptCount = people.filter(p => p.department === selectedPerson.department).length - 1;
            const personSkillsList = peopleSkills.get(selectedPerson.id!) || [];
            const skillScore = skillMatchScores.get(selectedPerson.id!) || 0;
            const skillWarnings = getSkillWarnings(selectedPerson, personSkillsList, projectSkills);

            return (
              <>
                <div className="p-3 bg-[#3e3e42]/30 rounded border border-[#3e3e42]">
                  <div className="text-sm">
                    <div className="text-[#cccccc] font-medium mb-1">
                      📊 Assignment Insights
                    </div>
                    <div className="text-[#969696]">
                      <div>Department: <span className="text-[#cccccc]">{personDept}</span></div>
                      <div>Capacity: <span className="text-[#cccccc]">{selectedPerson.weeklyCapacity || 0}h/week</span></div>
                      {projectSkills.length > 0 && (
                        <div
                          className={`mt-1 ${
                            skillScore >= 80
                              ? 'text-emerald-400'
                              : skillScore >= 50
                              ? 'text-blue-400'
                              : skillScore > 0
                              ? 'text-amber-400'
                              : 'text-red-400'
                          }`}
                        >
                          🎯 Skill match: {skillScore}%
                        </div>
                      )}
                      {sameDeptCount > 0 && (
                        <div className="mt-1 text-blue-400">
                          💡 {sameDeptCount} other people available in {personDept}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {skillWarnings.length > 0 && (
                  <div className="p-3 bg-amber-500/20 border border-amber-500/30 rounded">
                    <div className="text-sm">
                      <div className="text-amber-400 font-medium mb-1">
                        ⚠️ Skills Assessment
                      </div>
                      <div className="space-y-1">
                        {skillWarnings.map((warning, idx) => (
                          <div key={idx} className="text-amber-300 text-xs">
                            {warning}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {personSkillsList.length > 0 && (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded">
                    <div className="text-sm">
                      <div className="text-blue-400 font-medium mb-2">
                        💪 {selectedPerson.name}'s Skills
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {personSkillsList
                          .filter(skill => skill.skillType === 'strength')
                          .slice(0, 5)
                          .map(skill => (
                            <span key={skill.id} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                              {skill.skillTagName}
                            </span>
                          ))}
                        {personSkillsList.filter(skill => skill.skillType === 'strength').length > 5 && (
                          <span className="px-2 py-1 bg-slate-500/20 text-slate-400 rounded text-xs">
                            +{personSkillsList.filter(skill => skill.skillType === 'strength').length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );

  const renderWeeksStep = () => (
    <div className="space-y-5">
      <div className="bg-[#3e3e42]/50 p-4 rounded-lg border border-[#3e3e42]">
        <label className="block text-sm font-medium text-[#cccccc] mb-2">
          Quick Set All Weeks
        </label>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="number"
            min="0"
            step="1"
            value={bulkHours}
            onChange={(e) => setBulkHours(Math.max(0, Math.ceil(parseFloat(e.target.value) || 0)))}
            className="px-3 py-1 rounded border text-sm bg-slate-600 border-slate-500 text-[#cccccc] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none w-24"
            placeholder="0"
          />
          <span className="text-slate-300 text-sm">hours per week</span>
          <Button
            type="button"
            variant="ghost"
            onClick={handleBulkSet}
            className="text-blue-400 hover:text-blue-300 px-3 py-1"
          >
            Apply to All
          </Button>
        </div>
        <p className="text-[#969696] text-xs mt-1">
          Set the same hours for all 12 weeks, then fine-tune individual weeks as needed.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-[#cccccc] mb-3">
          Weekly Hours Allocation <span className="text-red-400">*</span>
        </label>
        {validationErrors.weeklyHours && (
          <p className="text-sm text-red-400 mb-3">{validationErrors.weeklyHours}</p>
        )}
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="flex gap-3 pb-2">
              {availableWeeks.map((weekKey) => {
                const weekError = validationErrors[`week_${weekKey}`];
                const currentHours = formData.weeklyHours[weekKey] || 0;
                const capacity = getSelectedPersonCapacity();
                const isOverCapacity = capacity > 0 && currentHours > capacity;
                return (
                  <div
                    key={weekKey}
                    className={`flex-shrink-0 w-36 p-3 rounded-xl border ${
                      isOverCapacity ? 'bg-red-500/20 border-red-500/50' : 'bg-[#3e3e42] border-[#3e3e42]'
                    }`}
                  >
                    <div className="text-xs font-medium text-slate-200 sticky top-0 bg-[#3e3e42] pb-1">
                      {formatWeekDisplay(weekKey)}
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={currentHours}
                        onChange={(e) => handleWeeklyHoursChange(weekKey, Math.ceil(parseFloat(e.target.value) || 0))}
                        className={`w-full px-2 py-2 text-sm rounded border ${
                          isOverCapacity
                            ? 'bg-red-900/50 border-red-500 text-red-300'
                            : 'bg-slate-600 border-slate-500 text-[#cccccc]'
                        } focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none`}
                        placeholder="0"
                      />
                      <span className="text-xs text-[#969696]">h</span>
                    </div>
                    {weekError && (
                      <p className="text-xs text-red-400 mt-1">{weekError}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <p className="text-[#969696] text-sm mt-2">
          Drag horizontally to adjust all 12 weeks. Headers stay visible as you scroll so you always know which week you’re editing.
        </p>
      </div>
    </div>
  );

  const renderReviewStep = () => {
    const selectedPerson = people.find(p => p.id === Number(formData.person));
    const selectedProject = projects.find(p => p.id === Number(formData.project));
    return (
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="p-4 rounded-lg border border-[#3e3e42] bg-[#3e3e42]/40">
            <div className="text-xs uppercase tracking-wide text-[#969696] mb-1">Person</div>
            <div className="text-lg font-semibold text-[#cccccc]">
              {selectedPerson ? selectedPerson.name : 'Not selected'}
            </div>
            {selectedPerson && (
              <div className="text-sm text-[#969696] mt-1">
                Department: {getDepartmentName(selectedPerson, departments)} • Capacity: {selectedPerson.weeklyCapacity || 0}h/wk
              </div>
            )}
          </div>
          <div className="p-4 rounded-lg border border-[#3e3e42] bg-[#3e3e42]/40">
            <div className="text-xs uppercase tracking-wide text-[#969696] mb-1">Project</div>
            <div className="text-lg font-semibold text-[#cccccc]">
              {selectedProject ? selectedProject.name : 'Not selected'}
            </div>
            {selectedProject && (
              <div className="text-sm text-[#969696] mt-1">
                Client: {selectedProject.client || '—'}
              </div>
            )}
            <div className="mt-3 text-sm text-blue-300">
              Total planned hours: <span className="font-semibold text-blue-100">{getTotalHours()}h</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[#3e3e42] bg-[#2d2d30]">
          <div className="px-4 py-3 border-b border-[#3e3e42] text-sm font-medium text-[#cccccc]">
            Weekly Breakdown
          </div>
          <div className="divide-y divide-[#3e3e42]">
            {availableWeeks.map((weekKey) => (
              <div key={weekKey} className="px-4 py-2 text-sm flex items-center justify-between text-[#cccccc]">
                <span>{formatWeekDisplay(weekKey)}</span>
                <span className="font-semibold">{formData.weeklyHours[weekKey] || 0}h</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderCurrentStepContent = () => {
    switch (currentStep.id) {
      case 'person':
        return renderPersonStep();
      case 'skills':
        return renderSkillsStep();
      case 'weeks':
        return renderWeeksStep();
      case 'review':
        return renderReviewStep();
      default:
        return null;
    }
  };

  const renderStepperHeader = () => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        {STEP_SEQUENCE.map((step, index) => {
          const isCompleted = index < currentStepIndex;
          const isActive = index === currentStepIndex;
          return (
            <div key={step.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => jumpToStep(index)}
                disabled={!isCompleted && !isActive}
                className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm font-semibold ${
                  isActive
                    ? 'bg-blue-500 text-white border-blue-500'
                    : isCompleted
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400'
                    : 'bg-[#2d2d30] text-[#969696] border-[#3e3e42]'
                }`}
                aria-label={`Step ${index + 1}: ${step.title}`}
              >
                {index + 1}
              </button>
              <div className="min-w-[140px]">
                <div className={`text-sm font-medium ${isActive ? 'text-[#f3f4f6]' : 'text-[#cbd5e1]'}`}>
                  {step.title}
                </div>
                <div className="text-xs text-[#8b93a7]">{step.description}</div>
              </div>
              {index < STEP_SEQUENCE.length - 1 && (
                <div className="hidden md:block w-8 h-px bg-[#3e3e42]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#cccccc]">
            {isEditing ? 'Edit Assignment' : 'Create New Assignment'}
          </h1>
          <p className="text-[#969696] mt-1">
            Assign a team member to a project with weekly hour allocations for the next 12 weeks
          </p>
          {deptState.selectedDepartmentId != null && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-[#3e3e42] text-[#cbd5e1] border border-[#3e3e42]">
                Filtered by: <strong className="text-[#e5e7eb]">
                  {(() => {
                    const d = departments.find(d => d.id === deptState.selectedDepartmentId);
                    return d?.name || `Dept ${deptState.selectedDepartmentId}`;
                  })()}
                </strong>
              </span>
            </div>
          )}
          {formData.person && (
            <div className="mt-2 text-sm text-slate-300">
              Total hours: <span className="font-semibold text-blue-400">{getTotalHours()}h</span>
              {' • '}
              Selected person capacity: <span className="font-semibold text-green-400">{getSelectedPersonCapacity()}h/week</span>
            </div>
          )}
        </div>

        {error && (
          <Card className="bg-red-500/20 border-red-500/50 p-4 mb-6">
            <div className="text-red-400">{error}</div>
          </Card>
        )}

        <Card className="bg-[#2d2d30] border-[#3e3e42] p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {renderStepperHeader()}
            <div className="pt-4">{renderCurrentStepContent()}</div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate('/assignments')}
                disabled={loading}
              >
                Cancel
              </Button>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handlePreviousStep}
                  disabled={currentStepIndex === 0}
                >
                  Back
                </Button>
                {isLastStep ? (
                  <Button type="submit" variant="primary" disabled={loading}>
                    {loading ? 'Saving...' : (isEditing ? 'Update Assignment' : 'Create Assignment')}
                  </Button>
                ) : (
                  <Button type="button" variant="primary" onClick={handleNextStep}>
                    Next
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Card>
      </div>
    </Layout>
  );
};

export default AssignmentForm;
