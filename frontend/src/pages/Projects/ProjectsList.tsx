/**
 * Projects List - Split-panel layout with filterable project list and detailed project view
 */

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Project, Person, Assignment } from '@/types/models';
import { useDebounce } from '@/hooks/useDebounce';
import { useProjects, useDeleteProject, useUpdateProject } from '@/hooks/useProjects';
import { usePeople } from '@/hooks/usePeople';
import { assignmentsApi, peopleApi } from '@/services/api';
import { useProjectFilterMetadata } from '@/hooks/useProjectFilterMetadata';
import type { ProjectFilterMetadataResponse } from '@/types/models';
import { trackPerformanceEvent } from '@/utils/monitoring';

interface PersonWithAvailability extends Person {
  availableHours?: number;
  utilizationPercent?: number;
  totalHours?: number;
  skillMatchScore?: number;
  hasSkillMatch?: boolean;
}
import Sidebar from '@/components/layout/Sidebar';

// Lazy load DeliverablesSection for better initial page performance
const DeliverablesSection = React.lazy(() => import('@/components/deliverables/DeliverablesSection'));

// Loading component for DeliverablesSection
const DeliverablesSectionLoader: React.FC = () => (
  <div className="border border-[#3e3e42] rounded-lg p-6 bg-[#2d2d30]">
    <div className="flex items-center justify-center py-8">
      <div className="flex items-center space-x-3">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#007acc]"></div>
        <div className="text-[#969696]">Loading deliverables...</div>
      </div>
    </div>
  </div>
);

// Memoized Assignment Row Component for performance (Phase 4 optimization)
interface AssignmentRowProps {
  assignment: Assignment;
  isEditing: boolean;
  editData: {
    roleOnProject: string;
    currentWeekHours: number;
    roleSearch: string;
  };
  roleSearchResults: string[];
  onEdit: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCancel: () => void;
  onRoleSearch: (value: string) => void;
  onRoleSelect: (role: string) => void;
  onHoursChange: (hours: number) => void;
  getCurrentWeekHours: (assignment: Assignment) => number;
}

const AssignmentRow = React.memo<AssignmentRowProps>(({
  assignment,
  isEditing,
  editData,
  roleSearchResults,
  onEdit,
  onDelete,
  onSave,
  onCancel,
  onRoleSearch,
  onRoleSelect,
  onHoursChange,
  getCurrentWeekHours
}) => {
  if (isEditing) {
    return (
      <div className="p-3 bg-[#3e3e42]/50 rounded border border-[#3e3e42]">
        <div className="grid grid-cols-4 gap-4 items-center">
          {/* Person Name (read-only) */}
          <div className="text-[#cccccc]">{assignment.personName || 'Unknown'}</div>
          
          {/* Role Input with Autocomplete */}
          <div className="relative">
            <input
              type="text"
              placeholder="Role on project..."
              value={editData.roleSearch}
              onChange={(e) => onRoleSearch(e.target.value)}
              className="w-full px-2 py-1 text-xs bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none"
              autoFocus
            />
            
            {/* Role Search Results Dropdown */}
            {roleSearchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 max-h-32 overflow-y-auto">
                {roleSearchResults.map((role) => (
                  <button
                    key={role}
                    onClick={() => onRoleSelect(role)}
                    className="w-full text-left px-2 py-1 text-xs hover:bg-[#3e3e42] transition-colors text-[#cccccc] border-b border-[#3e3e42] last:border-b-0"
                  >
                    {role}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Hours Input */}
          <div>
            <input
              type="number"
              min="0"
              max="80"
              step="0.5"
              placeholder="Hours"
              value={editData.currentWeekHours}
              onChange={(e) => onHoursChange(parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1 text-xs bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-1">
            <button
              onClick={onSave}
              className="px-2 py-1 text-xs rounded border bg-[#007acc] border-[#007acc] text-white hover:bg-[#005fa3] transition-colors"
            >
              Save
            </button>
            <button
              onClick={onCancel}
              className="px-2 py-1 text-xs rounded border bg-transparent border-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center p-2 bg-[#3e3e42]/30 rounded">
      <div className="flex-1">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[#cccccc]">{assignment.personName || 'Unknown'}</div>
            {/* Person Skills (Read-only) */}
            <div className="flex flex-wrap gap-1 mt-1">
              {assignment.personSkills?.filter(skill => skill.skillType === 'strength').slice(0, 3).map((skill, index) => (
                <span key={index} className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {skill.skillTagName}
                </span>
              ))}
              {assignment.personSkills?.filter(skill => skill.skillType === 'strength').length === 0 && (
                <span className="text-[#969696] text-xs">No skills listed</span>
              )}
            </div>
          </div>
          <div className="text-[#969696]">{assignment.roleOnProject || 'Team Member'}</div>
          <div className="text-[#969696]">{getCurrentWeekHours(assignment)}h</div>
        </div>
      </div>
      <div className="flex gap-1">
        <button 
          onClick={onEdit}
          className="text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-[#cccccc] hover:bg-[#3e3e42] hover:border-[#3e3e42] transition-colors"
        >
          Edit
        </button>
        <button 
          onClick={onDelete}
          className="text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
});

AssignmentRow.displayName = 'AssignmentRow';

// Memoized Person Search Result Component for performance (Phase 4 optimization)
interface PersonSearchResultProps {
  person: PersonWithAvailability;
  isSelected: boolean;
  onSelect: () => void;
}

const PersonSearchResult = React.memo<PersonSearchResultProps>(({
  person,
  isSelected,
  onSelect
}) => {
  return (
    <button
      key={person.id}
      onClick={onSelect}
      role="option"
      aria-selected={isSelected}
      aria-describedby={`person-${person.id}-details`}
      className={`w-full text-left px-2 py-2 text-xs hover:bg-[#3e3e42] transition-colors border-b border-[#3e3e42] last:border-b-0 ${
        isSelected ? 'bg-[#3e3e42]' : ''
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="text-[#cccccc] font-medium">{person.name}</div>
          <div className="text-[#969696] text-xs">{person.role}</div>
          
          {/* Skills Display */}
          <div className="flex flex-wrap gap-1 mt-1">
            {person.hasSkillMatch && (
              <span 
                className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                aria-label="This person has matching skills for your search"
              >
                ✓ Skill Match
              </span>
            )}
          </div>
        </div>
        
        <div className="text-right ml-2" id={`person-${person.id}-details`}>
          <div className="text-[#cccccc] text-xs font-medium">
            {person.availableHours?.toFixed(1) || '0'}h available
          </div>
          <div className="text-[#969696] text-xs">
            {person.utilizationPercent?.toFixed(0) || '0'}% utilized
          </div>
        </div>
      </div>
    </button>
  );
});

PersonSearchResult.displayName = 'PersonSearchResult';

const ProjectsList: React.FC = () => {
  // React Query hooks for data management
  const { projects, loading, error: projectsError } = useProjects();
  const { people } = usePeople();
  const deleteProjectMutation = useDeleteProject();
  const updateProjectMutation = useUpdateProject();
  
  // Local UI state
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [statusFilter, setStatusFilter] = useState('Show All');
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  
  
  // Assignment management
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  
  // Optimized filter metadata (assignment counts + hasFutureDeliverables)
  const { filterMetadata, loading: filterMetaLoading, error: filterMetaError, invalidate: invalidateFilterMeta, refetch: refetchFilterMeta } = useProjectFilterMetadata();
  const [showAddAssignment, setShowAddAssignment] = useState(false);
  const [newAssignment, setNewAssignment] = useState({
    personSearch: '',
    selectedPerson: null as Person | null,
    roleOnProject: '',
    roleSearch: '',
    weeklyHours: {} as { [key: string]: number }
  });
  const [personSearchResults, setPersonSearchResults] = useState<PersonWithAvailability[]>([]);
  const [selectedPersonIndex, setSelectedPersonIndex] = useState(-1);
  
  // Pre-computed skills mapping for performance (Phase 4 optimization)
  const [personSkillsMap, setPersonSkillsMap] = useState<Map<number, string[]>>(new Map());
  
  // Accessibility - Screen reader announcements (Phase 4 accessibility preservation)
  const [srAnnouncement, setSrAnnouncement] = useState<string>('');
  
  // Debounced person search for better performance
  const debouncedPersonSearch = useDebounce(newAssignment.personSearch, 300);
  
  // Inline editing
  const [editingAssignment, setEditingAssignment] = useState<number | null>(null);
  const [editData, setEditData] = useState({
    roleOnProject: '',
    currentWeekHours: 0,
    roleSearch: '',
  });
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [roleSearchResults, setRoleSearchResults] = useState<string[]>([]);

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
    const hasNoAssignments = (
      projectId: number | undefined,
      metadata: ProjectFilterMetadataResponse | null
    ): boolean => {
      if (!projectId) return false;
      const meta = metadata?.projectFilters?.[String(projectId)];
      if (!meta) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('Filter metadata not yet loaded; hasNoAssignments returns false for project', projectId);
        }
        return false;
      }
      return meta.assignmentCount === 0;
    };

    const hasNoFutureDeliverables = (
      projectId: number | undefined,
      metadata: ProjectFilterMetadataResponse | null
    ): boolean => {
      if (!projectId) return false;
      const meta = metadata?.projectFilters?.[String(projectId)];
      if (!meta) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('Filter metadata not yet loaded; hasNoFutureDeliverables returns false for project', projectId);
        }
        return false;
      }
      return !meta.hasFutureDeliverables;
    };

    const matchesStatusFilter = (
      project: Project,
      statusFilter: string,
      metadata: ProjectFilterMetadataResponse | null
    ): boolean => {
      if (!project) return false;
      if (statusFilter === 'Show All') return true;
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
    } else {
      setError(null);
    }
  }, [projectsError]);

  // No need to pre-load assignments; filter metadata supplies counts and future deliverable flags.

  // Pre-compute person skills map for performance (Phase 4 optimization)
  const precomputePersonSkills = useCallback(() => {
    const newSkillsMap = new Map<number, string[]>();
    
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






  const formatFilterStatus = (status: string): string => {
    if (status === 'Show All') return 'Show All';
    if (status === 'active_no_deliverables') return 'Active - No Dates';
    if (status === 'active_ca') return 'Active CA';
    if (status === 'no_assignments') return 'No Assignments';
    return formatStatus(status);
  };

  const handleDelete = async (projectId: number) => {
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
        } else {
          setSelectedProject(null);
          setSelectedIndex(-1);
        }
      }
    } catch (err: any) {
      setError('Failed to delete project');
    }
  };

  // People data is now managed by React Query hook

  const loadProjectAssignments = async (projectId: number) => {
    try {
      // Get assignments filtered by project on the server side (much faster)
      const response = await assignmentsApi.list({ project: projectId });
      const projectAssignments = response.results || [];
      
      setAssignments(projectAssignments);
      
      // Extract unique roles from all assignments for autocomplete
      const roles = new Set<string>();
      projectAssignments.forEach(assignment => {
        if (assignment.roleOnProject) {
          roles.add(assignment.roleOnProject);
        }
      });
      // Also add roles from people
      people.forEach(person => {
        if (person.role) {
          roles.add(String(person.role));
        }
      });
      const sortedRoles = Array.from(roles).sort();
      setAvailableRoles(sortedRoles);
    } catch (err: any) {
      console.error('Failed to load project assignments:', err);
    }
  };


  // Optimized calculatePersonAvailability using backend utilization endpoint
  const calculatePersonAvailability = async (person: Person): Promise<{ availableHours: number; utilizationPercent: number; totalHours: number }> => {
    try {
      // Get current week key
      const now = new Date();
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
      const currentWeekKey = monday.toISOString().split('T')[0];

      // Use optimized API endpoint
      const utilizationData = await peopleApi.getPersonUtilization(person.id!, currentWeekKey);
      
      return {
        availableHours: utilizationData.utilization.available_hours,
        utilizationPercent: Math.round(utilizationData.utilization.total_percentage),
        totalHours: utilizationData.utilization.allocated_hours
      };
      
    } catch (error) {
      console.error('Failed to calculate person availability:', error);
      return { availableHours: 0, utilizationPercent: 0, totalHours: 0 };
    }
  };

  // Optimized skill match calculation using pre-computed skills map (Phase 4)
  const calculateSkillMatch = useCallback((person: PersonWithAvailability, requiredSkills: string[] = []): number => {
    if (requiredSkills.length === 0) return 0;
    
    // Get person's skills from pre-computed map (much faster than filtering assignments)
    const personSkills = personSkillsMap.get(person.id) || [];
    
    const matches = requiredSkills.filter(reqSkill => 
      personSkills.some(personSkill => 
        personSkill.includes(reqSkill.toLowerCase()) || 
        reqSkill.toLowerCase().includes(personSkill)
      )
    );
    
    return matches.length / requiredSkills.length; // Return match ratio
  }, [personSkillsMap]);

  // Handle immediate input update (no delay for UI feedback)
  const handlePersonSearch = (searchTerm: string) => {
    setNewAssignment(prev => ({ ...prev, personSearch: searchTerm }));
    setSelectedPersonIndex(-1);
  };

  // Perform actual search with debounced value
  const performPersonSearch = async (searchTerm: string) => {
    // If no search term, show all people; if search term provided, filter by it
    let filtered = people;
    if (searchTerm.length > 0) {
      filtered = people.filter(person =>
        person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(person.role || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Detect potential skill requirements from search term
    const commonSkills = ['heat', 'lighting', 'hvac', 'autocad', 'python', 'design', 'mechanical', 'electrical'];
    const detectedSkills = commonSkills.filter(skill => 
      searchTerm.toLowerCase().includes(skill)
    );
    
    // Calculate availability and skill matching for each person
    const peopleWithData = await Promise.all(
      filtered.map(async (person) => {
        const availability = await calculatePersonAvailability(person);
        const skillMatchScore = calculateSkillMatch({ ...person, ...availability }, detectedSkills);
        return { 
          ...person, 
          ...availability,
          skillMatchScore,
          hasSkillMatch: skillMatchScore > 0
        };
      })
    );
    
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

  const handlePersonSelect = (person: Person) => {
    setNewAssignment(prev => ({
      ...prev,
      selectedPerson: person,
      personSearch: person.name,
    }));
    setPersonSearchResults([]);
    setSelectedPersonIndex(-1);
  };

  const handlePersonSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (personSearchResults.length > 0) {
        setSelectedPersonIndex(prev => 
          prev < personSearchResults.length - 1 ? prev + 1 : prev
        );
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (personSearchResults.length > 0) {
        setSelectedPersonIndex(prev => prev > -1 ? prev - 1 : -1);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedPersonIndex >= 0 && selectedPersonIndex < personSearchResults.length) {
        handlePersonSelect(personSearchResults[selectedPersonIndex]);
      }
    } else if (e.key === 'Escape') {
      setPersonSearchResults([]);
      setSelectedPersonIndex(-1);
    }
  };

  // Memoized role suggestions based on person skills
  const getSkillBasedRoleSuggestions = useCallback((person: Person | null): string[] => {
    if (!person || !assignments) return [];
    
    // Get person's skills from their existing assignments
    const personAssignments = assignments.filter(a => a.person === person.id);
    const personSkills = personAssignments
      .flatMap(a => a.personSkills || [])
      .filter(skill => skill.skillType === 'strength')
      .map(skill => skill.skillTagName?.toLowerCase() || '');
    
    const skillBasedRoles: string[] = [];
    
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

  const handleNewAssignmentRoleSearch = (searchTerm: string) => {
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
    const filteredExistingRoles = availableRoles.filter(role =>
      role.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Get skill-based suggestions for the selected person
    const skillSuggestions = newAssignment.selectedPerson 
      ? getSkillBasedRoleSuggestions(newAssignment.selectedPerson)
      : [];
    
    const filteredSkillRoles = skillSuggestions.filter(role =>
      role.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Combine and deduplicate, prioritizing skill-based suggestions
    const allRoles = [...filteredSkillRoles, ...filteredExistingRoles];
    const uniqueRoles = Array.from(new Set(allRoles)).slice(0, 5);
    
    setRoleSearchResults(uniqueRoles);
  };

  const handleNewAssignmentRoleSelect = (role: string) => {
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
    if (!selectedProject?.id || !newAssignment.selectedPerson?.id) return;

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

      const createdAssignment = await assignmentsApi.create(assignmentData);
      await loadProjectAssignments(selectedProject.id);
      // Invalidate filter metadata cache (counts + future dates)
      await invalidateFilterMeta();
      setShowAddAssignment(false);
    } catch (err: any) {
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
  const getCurrentWeekHours = (assignment: Assignment): number => {
    // Get current week in YYYY-MM-DD format for the Monday of this week
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    const currentWeekKey = monday.toISOString().split('T')[0];
    
    return assignment.weeklyHours?.[currentWeekKey] || 0;
  };

  const handleDeleteAssignment = useCallback(async (assignmentId: number) => {
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
    } catch (err: any) {
      setError('Failed to delete assignment');
    }
  }, [selectedProject?.id, loadProjectAssignments, invalidateFilterMeta]);

  const handleEditAssignment = useCallback((assignment: Assignment) => {
    setEditingAssignment(assignment.id!);
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

  const handleRoleSearch = useCallback((searchTerm: string) => {
    setEditData(prev => {
      const newData = { ...prev, roleSearch: searchTerm, roleOnProject: searchTerm };
      return newData;
    });
    
    if (searchTerm.length < 1) {
      setRoleSearchResults([]);
      return;
    }
    
    // Get existing roles that match the search
    const filteredExistingRoles = availableRoles.filter(role =>
      role.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Get skill-based suggestions for the person being edited
    const editingAssignmentData = assignments.find(a => a.id === editingAssignment);
    const editingPerson = editingAssignmentData ? people.find(p => p.id === editingAssignmentData.person) : null;
    
    const skillSuggestions = editingPerson 
      ? getSkillBasedRoleSuggestions(editingPerson)
      : [];
    
    const filteredSkillRoles = skillSuggestions.filter(role =>
      role.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Combine and deduplicate, prioritizing skill-based suggestions
    const allRoles = [...filteredSkillRoles, ...filteredExistingRoles];
    const uniqueRoles = Array.from(new Set(allRoles)).slice(0, 5);
    
    setRoleSearchResults(uniqueRoles);
  }, [availableRoles, assignments, people, editingAssignment, getSkillBasedRoleSuggestions]);

  const handleRoleSelect = (role: string) => {
    setEditData(prev => ({ ...prev, roleOnProject: role, roleSearch: role }));
    setRoleSearchResults([]);
  };


  // Optimized checkAssignmentConflicts using backend conflict checking endpoint
  const checkAssignmentConflicts = async (personId: number, projectId: number, weekKey: string, newHours: number): Promise<string[]> => {
    try {
      // Use optimized API endpoint
      const conflictResponse = await assignmentsApi.checkConflicts(personId, projectId, weekKey, newHours);
      
      return conflictResponse.warnings;
      
    } catch (error) {
      console.error('Failed to check assignment conflicts:', error);
      return [];
    }
  };

  const handleSaveEdit = async (assignmentId: number) => {
    try {
      const assignment = assignments.find(a => a.id === assignmentId);
      if (!assignment) return;

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
      } else {
        setWarnings([]); // Clear warnings if reducing hours
      }

      // Update weekly hours with current week
      const updatedWeeklyHours = {
        ...assignment.weeklyHours,
        [currentWeekKey]: editData.currentWeekHours
      };

      // Use the role from editData, default to 'Team Member' if truly empty
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
    } catch (err: any) {
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


  const handleStatusChange = async (newStatus: string) => {
    if (!selectedProject?.id) return;

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
    } catch (err: any) {
      // Revert optimistic update on error
      setSelectedProject(selectedProject);
      setError('Failed to update project status');
    }
  };

  const handleProjectClick = (project: Project, index: number) => {
    setSelectedProject(project);
    setSelectedIndex(index);
  };

  const getStatusColor = (status: string) => {
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

  const formatStatus = (status: string) => {
    if (status === 'active_ca') return 'Active CA';
    return status?.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ') || 'Unknown';
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('asc');
    }
  };

  // Memoized filtered and sorted projects for better performance
  const filteredProjects = useMemo(() => {
    const tStart = performance.now();
    // New optimized filtering using helper functions (Step 3.3)
    const next = projects.filter(project => {
      const matchesStatus = optimizedFilterFunctions.matchesStatusFilter(
        project,
        statusFilter,
        filterMetadata
      );

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
    let aValue: any, bValue: any;
    
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
        // We don't have type field in backend; use status instead
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        
        let newIndex = selectedIndex;
        if (e.key === 'ArrowUp' && selectedIndex > 0) {
          newIndex = selectedIndex - 1;
        } else if (e.key === 'ArrowDown' && selectedIndex < sortedProjects.length - 1) {
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
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownOpen) {
        const target = event.target as Element;
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

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return null;
    
    return (
      <span className="ml-1 text-[#007acc]">
        {sortDirection === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center">
        <div className="text-[#969696]">Loading projects...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex">
      <Sidebar />
      <div className="flex-1 flex h-screen bg-[#1e1e1e]">
        
        {/* Left Panel - Projects List */}
        <div className="w-1/2 border-r border-[#3e3e42] flex flex-col min-w-0">
          
          {/* Header */}
          <div className="p-3 border-b border-[#3e3e42]">
            <div className="flex justify-between items-center mb-2">
              <h1 className="text-lg font-semibold text-[#cccccc]">Projects</h1>
              <Link to="/projects/new">
                <button className="px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors">
                  + New
                </button>
              </Link>
            </div>

            {/* Filters */}
            <div className="space-y-2">
              {/* Status Filter */}
              <div>
                <label className="text-xs text-[#969696] mb-1 block">Filter by Status:</label>
                <div className="flex flex-wrap gap-1">
                  {statusOptions.map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                        statusFilter === status
                          ? 'bg-[#007acc] border-[#007acc] text-white'
                          : 'bg-[#3e3e42] border-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42]/80'
                      }`}
                      aria-label={`Filter projects by ${formatFilterStatus(status).toLowerCase()}`}
                      aria-pressed={statusFilter === status}
                    >
                      {formatFilterStatus(status)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search */}
              <div>
                <input
                  type="text"
                  placeholder="Search projects"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/20 border-b border-red-500/50">
              <div className="text-red-400 text-sm">{error}</div>
            </div>
          )}

          {/* Filter metadata status */}
          {(filterMetaLoading || filterMetaError) && (
            <div className={`p-3 border-b ${filterMetaError ? 'bg-amber-500/10 border-amber-500/30' : 'bg-[#2d2d30] border-[#3e3e42]'}`}>
              <div className={`text-sm ${filterMetaError ? 'text-amber-400' : 'text-[#969696]'}`}>
                {filterMetaError ? (
                  <div className="flex items-center gap-2">
                    <span>Filter data unavailable; special filters temporarily disabled.</span>
                    <button
                      onClick={() => refetchFilterMeta()}
                      className="px-2 py-1 text-xs rounded border bg-transparent border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors"
                      disabled={filterMetaLoading}
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <span>Loading filter metadata…</span>
                )}
              </div>
            </div>
          )}

          {/* Warnings Message */}
          {warnings.length > 0 && (
            <div className="p-3 bg-amber-500/20 border-b border-amber-500/50">
              {warnings.map((warning, index) => (
                <div key={index} className="text-amber-400 text-sm flex items-center gap-2">
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {/* Projects Table */}
          <div className="flex-1 overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-8 gap-2 px-2 py-1.5 text-xs text-[#969696] font-medium border-b border-[#3e3e42] bg-[#2d2d30]">
              <div className="col-span-2 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center" onClick={() => handleSort('client')}>
                CLIENT<SortIcon column="client" />
              </div>
              <div className="col-span-3 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center" onClick={() => handleSort('name')}>
                PROJECT<SortIcon column="name" />
              </div>
              <div className="col-span-1 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center" onClick={() => handleSort('type')}>
                TYPE<SortIcon column="type" />
              </div>
              <div className="col-span-2 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center" onClick={() => handleSort('status')}>
                STATUS<SortIcon column="status" />
              </div>
            </div>

            {/* Table Body */}
            <div className="overflow-y-auto h-full">
              {sortedProjects.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center text-[#969696]">
                    <div className="text-lg mb-2">
                      {statusFilter === 'no_assignments' 
                        ? 'No projects without assignments'
                        : 'No projects found'
                      }
                    </div>
                    <div className="text-sm">
                      {statusFilter === 'no_assignments'
                        ? 'All projects have team members assigned. Try a different filter.'
                        : 'Try adjusting your filters or create a new project'
                      }
                    </div>
                  </div>
                </div>
              ) : (
                sortedProjects.map((project, index) => (
                  <div
                    key={project.id}
                    onClick={() => handleProjectClick(project, index)}
                    className={`grid grid-cols-8 gap-2 px-2 py-1.5 text-sm border-b border-[#3e3e42] cursor-pointer hover:bg-[#3e3e42]/50 transition-colors focus:outline-none ${
                      selectedProject?.id === project.id ? 'bg-[#007acc]/20 border-[#007acc]' : ''
                    }`}
                    tabIndex={0}
                  >
                    {/* Client */}
                    <div className="col-span-2 text-[#969696] text-xs">
                      {project.client || 'No Client'}
                    </div>
                    
                    {/* Project Name & Number */}
                    <div className="col-span-3">
                      <div className="text-[#cccccc] font-medium leading-tight">{project.name}</div>
                      <div className="text-[#969696] text-xs leading-tight">{project.projectNumber || 'No Number'}</div>
                    </div>
                    
                    {/* Type (using status for now) */}
                    <div className="col-span-1 text-[#969696] text-xs">
                      {formatStatus(project.status || '')}
                    </div>
                    
                    {/* Status */}
                    <div className="col-span-2">
                      <span className={`${getStatusColor(project.status || '')} px-2 py-0.5 rounded text-xs`}>
                        {formatStatus(project.status || '')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Project Details */}
        <div className="w-1/2 flex flex-col bg-[#2d2d30] min-w-0">
          {selectedProject ? (
            <>
              {/* Project Header */}
              <div className="p-4 border-b border-[#3e3e42]">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h2 className="text-xl font-bold text-[#cccccc] mb-2">
                      {selectedProject.name}
                    </h2>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-[#969696] text-xs">Client:</div>
                        <div className="text-[#cccccc]">{selectedProject.client || 'No Client'}</div>
                      </div>
                      <div>
                        <div className="text-[#969696] text-xs">Status:</div>
                        <div className="relative status-dropdown-container">
                          <button
                            onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                            className={`${getStatusColor(selectedProject.status || '')} hover:bg-[#3e3e42]/50 px-2 py-1 rounded text-sm transition-colors cursor-pointer flex items-center gap-1`}
                          >
                            {formatStatus(selectedProject.status || '')}
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="6,9 12,15 18,9"/>
                            </svg>
                          </button>
                          
                          {statusDropdownOpen && (
                            <div className="absolute top-full left-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 min-w-[120px]">
                              {editableStatusOptions.map((status) => (
                                <button
                                  key={status}
                                  onClick={() => handleStatusChange(status)}
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-[#3e3e42] transition-colors first:rounded-t last:rounded-b ${
                                    selectedProject.status === status ? 'bg-[#007acc]/20' : ''
                                  } ${getStatusColor(status)}`}
                                >
                                  {formatStatus(status)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#969696] text-xs">Project Number:</div>
                        <div className="text-[#cccccc]">{selectedProject.projectNumber || 'No Number'}</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/projects/${selectedProject.id}/edit`}>
                      <button className="px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors">
                        Edit Project
                      </button>
                    </Link>
                    <button 
                      onClick={() => selectedProject.id && handleDelete(selectedProject.id)}
                      className="px-2 py-0.5 text-xs rounded border bg-transparent border-[#3e3e42] text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {selectedProject.description && (
                  <div className="mt-3 pt-3 border-t border-[#3e3e42]">
                    <div className="text-[#969696] text-xs mb-1">Description:</div>
                    <div className="text-[#cccccc] text-sm">{selectedProject.description}</div>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Assignments Section */}
                <div className="pb-4 border-b border-[#3e3e42]">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-base font-semibold text-[#cccccc]">
                      Assignments
                    </h3>
                    <button 
                      onClick={handleAddAssignment}
                      className="px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors"
                    >
                      + Add Assignment
                    </button>
                  </div>

                  {/* Assignments List */}
                  <div className="space-y-2">
                    {assignments.length > 0 ? (
                      assignments.map((assignment) => (
                        <div key={assignment.id}>
                          {editingAssignment === assignment.id ? (
                            // Editing mode
                            <div className="p-3 bg-[#3e3e42]/50 rounded border border-[#3e3e42]">
                              <div className="grid grid-cols-4 gap-4 items-center">
                                {/* Person Name (read-only) */}
                                <div className="text-[#cccccc]">{assignment.personName || 'Unknown'}</div>
                                
                                {/* Role Input with Autocomplete */}
                                <div className="relative">
                                  <input
                                    type="text"
                                    placeholder="Role on project..."
                                    value={editData.roleSearch}
                                    onChange={(e) => handleRoleSearch(e.target.value)}
                                    className="w-full px-2 py-1 text-xs bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none"
                                    autoFocus
                                  />
                                  
                                  {/* Role Search Results Dropdown */}
                                  {roleSearchResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 max-h-32 overflow-y-auto">
                                      {roleSearchResults.map((role) => (
                                        <button
                                          key={role}
                                          onClick={() => handleRoleSelect(role)}
                                          className="w-full text-left px-2 py-1 text-xs hover:bg-[#3e3e42] transition-colors text-[#cccccc] border-b border-[#3e3e42] last:border-b-0"
                                        >
                                          {role}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Hours Input */}
                                <div>
                                  <input
                                    type="number"
                                    min="0"
                                    max="80"
                                    step="0.5"
                                    placeholder="Hours"
                                    value={editData.currentWeekHours}
                                    onChange={(e) => setEditData(prev => ({ ...prev, currentWeekHours: parseFloat(e.target.value) || 0 }))}
                                    className="w-full px-2 py-1 text-xs bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                                  />
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => assignment.id && handleSaveEdit(assignment.id)}
                                    className="px-2 py-1 text-xs rounded border bg-[#007acc] border-[#007acc] text-white hover:bg-[#005fa3] transition-colors"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    className="px-2 py-1 text-xs rounded border bg-transparent border-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            // Display mode
                            <div className="flex justify-between items-center p-2 bg-[#3e3e42]/30 rounded">
                              <div className="flex-1">
                                <div className="grid grid-cols-3 gap-4">
                                  <div>
                                    <div className="text-[#cccccc]">{assignment.personName || 'Unknown'}</div>
                                    {/* Person Skills (Read-only) */}
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {assignment.personSkills?.filter(skill => skill.skillType === 'strength').slice(0, 3).map((skill, index) => (
                                        <span key={index} className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                          {skill.skillTagName}
                                        </span>
                                      ))}
                                      {assignment.personSkills?.filter(skill => skill.skillType === 'strength').length === 0 && (
                                        <span className="text-[#969696] text-xs">No skills listed</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-[#969696]">{assignment.roleOnProject || 'Team Member'}</div>
                                  <div className="text-[#969696]">{getCurrentWeekHours(assignment)}h</div>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <button 
                                  onClick={() => handleEditAssignment(assignment)}
                                  className="text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-[#cccccc] hover:bg-[#3e3e42] hover:border-[#3e3e42] transition-colors"
                                >
                                  Edit
                                </button>
                                <button 
                                  onClick={() => assignment.id && handleDeleteAssignment(assignment.id)}
                                  className="text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    ) : !showAddAssignment ? (
                      <div className="text-center py-8">
                        <div className="text-[#969696] text-sm">No assignments yet</div>
                        <div className="text-[#969696] text-xs mt-1">Click "Add Assignment" to get started</div>
                      </div>
                    ) : null}

                    {/* Add Assignment Form */}
                    {showAddAssignment && (
                      <div className="p-3 bg-[#3e3e42]/50 rounded border border-[#3e3e42]">
                        <div className="grid grid-cols-3 gap-4 mb-3">
                          <div className="text-[#969696] text-xs uppercase font-medium">PERSON</div>
                          <div className="text-[#969696] text-xs uppercase font-medium">ROLE</div>
                          <div className="text-[#969696] text-xs uppercase font-medium">ACTIONS</div>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4 items-center">
                          {/* Person Search */}
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Start typing name or click to see all..."
                              value={newAssignment.personSearch}
                              onChange={(e) => handlePersonSearch(e.target.value)}
                              onFocus={() => performPersonSearch(newAssignment.personSearch)}
                              onKeyDown={handlePersonSearchKeyDown}
                              role="combobox"
                              aria-expanded={personSearchResults.length > 0}
                              aria-haspopup="listbox"
                              aria-owns="person-search-results"
                              aria-describedby="person-search-help"
                              className="w-full px-2 py-1 text-xs bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none"
                              autoFocus
                            />
                            
                            {/* Screen reader help text */}
                            <div id="person-search-help" className="sr-only">
                              Search for people to assign to this project. Use arrow keys to navigate results.
                            </div>
                            
                            {/* ARIA live region for search results announcement */}
                            <div aria-live="polite" aria-atomic="true" className="sr-only">
                              {srAnnouncement}
                            </div>
                            
                            {/* Search Results Dropdown */}
                            {personSearchResults.length > 0 && (
                              <div 
                                id="person-search-results"
                                role="listbox"
                                className="absolute top-full left-0 right-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 max-h-32 overflow-y-auto"
                              >
                                {personSearchResults.map((person, index) => (
                                  <button
                                    key={person.id}
                                    onClick={() => handlePersonSelect(person)}
                                    className={`w-full text-left px-2 py-1 text-xs hover:bg-[#3e3e42] transition-colors text-[#cccccc] border-b border-[#3e3e42] last:border-b-0 ${
                                      selectedPersonIndex === index ? 'bg-[#007acc]/30 border-[#007acc]' : ''
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="font-medium">{person.name}</div>
                                      {person.hasSkillMatch && (
                                        <span className="text-xs px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                          🎯 Skill Match
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <div className="text-[#969696]">{person.role}</div>
                                      {person.availableHours !== undefined && (
                                        <div className="flex items-center gap-2">
                                          <span className={`text-xs px-1 py-0.5 rounded ${
                                            person.utilizationPercent! > 100 ? 'text-red-400 bg-red-500/20' :
                                            person.utilizationPercent! > 85 ? 'text-amber-400 bg-amber-500/20' :
                                            person.availableHours > 0 ? 'text-emerald-400 bg-emerald-500/20' :
                                            'text-blue-400 bg-blue-500/20'
                                          }`}>
                                            {person.availableHours}h available
                                          </span>
                                          <span className="text-[#969696] text-xs">
                                            ({person.utilizationPercent}% used)
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Role Input */}
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Role on project..."
                              value={newAssignment.roleSearch}
                              onChange={(e) => handleNewAssignmentRoleSearch(e.target.value)}
                              className="w-full px-2 py-1 text-xs bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none"
                            />
                            
                            {/* Role Search Results Dropdown */}
                            {roleSearchResults.length > 0 && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 max-h-32 overflow-y-auto">
                                {roleSearchResults.map((role) => (
                                  <button
                                    key={role}
                                    onClick={() => handleNewAssignmentRoleSelect(role)}
                                    className="w-full text-left px-2 py-1 text-xs hover:bg-[#3e3e42] transition-colors text-[#cccccc] border-b border-[#3e3e42] last:border-b-0"
                                  >
                                    {role}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-1">
                            <button
                              onClick={handleSaveAssignment}
                              disabled={!newAssignment.selectedPerson}
                              className="px-2 py-1 text-xs rounded border bg-[#007acc] border-[#007acc] text-white hover:bg-[#005fa3] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelAddAssignment}
                              className="px-2 py-1 text-xs rounded border bg-transparent border-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Deliverables Section - Lazy Loaded */}
                <Suspense fallback={<DeliverablesSectionLoader />}>
                  <DeliverablesSection project={selectedProject} />
                </Suspense>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-[#969696]">
                <div className="text-lg mb-2">Select a project</div>
                <div className="text-sm">Choose a project from the list to view details</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectsList;
