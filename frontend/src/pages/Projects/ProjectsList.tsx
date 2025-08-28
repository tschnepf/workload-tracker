/**
 * Projects List - Split-panel layout with filterable project list and detailed project view
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Project, Person, Assignment, Deliverable, PersonSkill } from '@/types/models';
import { projectsApi, peopleApi, assignmentsApi, deliverablesApi } from '@/services/api';
import Sidebar from '@/components/layout/Sidebar';
import DeliverablesSection from '@/components/deliverables/DeliverablesSection';

const ProjectsList: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [statusFilter, setStatusFilter] = useState('Show All');
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  
  // Deliverables data for all projects
  const [projectDeliverables, setProjectDeliverables] = useState<{ [projectId: number]: Deliverable[] }>({});
  
  // Assignment management
  const [people, setPeople] = useState<Person[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [showAddAssignment, setShowAddAssignment] = useState(false);
  const [newAssignment, setNewAssignment] = useState({
    personSearch: '',
    selectedPerson: null as Person | null,
    roleOnProject: '',
    roleSearch: '',
    weeklyHours: {} as { [key: string]: number }
  });
  const [personSearchResults, setPersonSearchResults] = useState<Person[]>([]);
  const [selectedPersonIndex, setSelectedPersonIndex] = useState(-1);
  
  // Inline editing
  const [editingAssignment, setEditingAssignment] = useState<number | null>(null);
  const [editData, setEditData] = useState({
    roleOnProject: '',
    currentWeekHours: 0,
    roleSearch: '',
  });
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [roleSearchResults, setRoleSearchResults] = useState<string[]>([]);

  const statusOptions = ['active', 'active_ca', 'on_hold', 'completed', 'cancelled', 'active_no_deliverables', 'Show All'];
  const editableStatusOptions = ['active', 'active_ca', 'on_hold', 'completed', 'cancelled'];

  useEffect(() => {
    loadProjects();
    loadPeople();
  }, []);

  useEffect(() => {
    if (selectedProject?.id) {
      loadProjectAssignments(selectedProject.id);
    }
  }, [selectedProject]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await projectsApi.list();
      const projectsList = response.results || [];
      setProjects(projectsList);
      
      // Load deliverables for all projects to show next deliverable
      await loadAllProjectDeliverables(projectsList);
      
      // Selection will be handled by useEffect that watches sortedProjects
    } catch (err: any) {
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const loadAllProjectDeliverables = async (projectsList: Project[]) => {
    const deliverablesMap: { [projectId: number]: Deliverable[] } = {};
    
    // Load deliverables for each project in parallel
    await Promise.all(
      projectsList.map(async (project) => {
        if (project.id) {
          try {
            const response = await deliverablesApi.list(project.id);
            deliverablesMap[project.id] = response.results || [];
          } catch (err) {
            // If deliverables fail to load, just set empty array
            deliverablesMap[project.id] = [];
          }
        }
      })
    );
    
    setProjectDeliverables(deliverablesMap);
  };

  const getNextDeliverable = (projectId: number): Deliverable | null => {
    const deliverables = projectDeliverables[projectId] || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time for accurate date comparison
    
    // Filter deliverables that:
    // 1. Have a date set
    // 2. Are not completed
    // 3. Are today or in the future
    const upcomingDeliverables = deliverables
      .filter(d => d.date && !d.isCompleted)
      .filter(d => {
        // Parse date string manually to avoid timezone issues
        const [year, month, day] = d.date!.split('-').map(Number);
        const deliverableDate = new Date(year, month - 1, day);
        deliverableDate.setHours(0, 0, 0, 0);
        return deliverableDate >= today;
      })
      .sort((a, b) => {
        // Sort by date, then by percentage (lower percentage = earlier milestone)
        // Parse dates manually to avoid timezone issues
        const [aYear, aMonth, aDay] = a.date!.split('-').map(Number);
        const [bYear, bMonth, bDay] = b.date!.split('-').map(Number);
        const aDate = new Date(aYear, aMonth - 1, aDay);
        const bDate = new Date(bYear, bMonth - 1, bDay);
        const dateCompare = aDate.getTime() - bDate.getTime();
        if (dateCompare !== 0) return dateCompare;
        return (a.percentage || 0) - (b.percentage || 0);
      });

    return upcomingDeliverables.length > 0 ? upcomingDeliverables[0] : null;
  };

  const formatNextDeliverable = (deliverable: Deliverable): string => {
    const parts = [];
    
    if (deliverable.date) {
      // Parse date string manually to avoid timezone issues
      const [year, month, day] = deliverable.date.split('-').map(Number);
      const date = new Date(year, month - 1, day); // month is 0-indexed
      parts.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
    
    if (deliverable.percentage !== null) {
      parts.push(`${deliverable.percentage}%`);
    }
    
    if (deliverable.description) {
      parts.push(deliverable.description);
    }
    
    return parts.length > 0 ? parts.join(' • ') : '-';
  };

  const hasUpcomingDeliverableDates = (projectId: number): boolean => {
    const deliverables = projectDeliverables[projectId] || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return deliverables.some(d => {
      if (!d.date || d.isCompleted) return false;
      
      // Parse date string manually to avoid timezone issues
      const [year, month, day] = d.date.split('-').map(Number);
      const deliverableDate = new Date(year, month - 1, day);
      deliverableDate.setHours(0, 0, 0, 0);
      return deliverableDate >= today;
    });
  };

  const formatFilterStatus = (status: string): string => {
    if (status === 'Show All') return 'Show All';
    if (status === 'active_no_deliverables') return 'Active - No Dates';
    if (status === 'active_ca') return 'Active CA';
    return formatStatus(status);
  };

  const handleDelete = async (projectId: number) => {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return;
    }

    try {
      await projectsApi.delete(projectId);
      
      // Remove the project from the list
      const updatedProjects = projects.filter(p => p.id !== projectId);
      setProjects(updatedProjects);
      
      // Clear selection if deleted project was selected
      if (selectedProject?.id === projectId) {
        if (updatedProjects.length > 0) {
          setSelectedProject(updatedProjects[0]);
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

  const loadPeople = async () => {
    try {
      const response = await peopleApi.list();
      setPeople(response.results || []);
    } catch (err: any) {
      console.error('Failed to load people:', err);
    }
  };

  const loadProjectAssignments = async (projectId: number) => {
    try {
      const response = await assignmentsApi.list();
      const projectAssignments = response.results?.filter(a => a.project === projectId) || [];
      
      console.log('Loaded assignments after save:', projectAssignments.map(a => ({ 
        id: a.id, 
        personName: a.personName, 
        roleOnProject: a.roleOnProject 
      })));
      
      setAssignments(projectAssignments);
      
      // Extract unique roles from all assignments for autocomplete
      const roles = new Set<string>();
      response.results?.forEach(assignment => {
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
      console.log('Available roles for autocomplete:', sortedRoles);
      setAvailableRoles(sortedRoles);
    } catch (err: any) {
      console.error('Failed to load project assignments:', err);
    }
  };

  const handlePersonSearch = (searchTerm: string) => {
    setNewAssignment(prev => ({ ...prev, personSearch: searchTerm }));
    
    if (searchTerm.length < 2) {
      setPersonSearchResults([]);
      return;
    }
    
    const filtered = people.filter(person =>
      person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      person.role?.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 5); // Limit to 5 results
    
    setPersonSearchResults(filtered);
    setSelectedPersonIndex(-1); // Reset selection when results change
  };

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

  const handleNewAssignmentRoleSearch = (searchTerm: string) => {
    console.log('handleNewAssignmentRoleSearch called with:', searchTerm);
    console.log('Available roles to search:', availableRoles);
    setNewAssignment(prev => ({ 
      ...prev, 
      roleSearch: searchTerm, 
      roleOnProject: searchTerm 
    }));
    
    if (searchTerm.length < 1) {
      setRoleSearchResults([]);
      return;
    }
    
    const filtered = availableRoles.filter(role =>
      role.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 5);
    
    console.log('Filtered roles for new assignment search term "' + searchTerm + '":', filtered);
    setRoleSearchResults(filtered);
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
      const assignmentData = {
        person: newAssignment.selectedPerson.id,
        project: selectedProject.id,
        roleOnProject: newAssignment.roleOnProject || 'Team Member',
        weeklyHours: newAssignment.weeklyHours,
        startDate: new Date().toISOString().split('T')[0], // Today
      };

      await assignmentsApi.create(assignmentData);
      await loadProjectAssignments(selectedProject.id);
      setShowAddAssignment(false);
    } catch (err: any) {
      setError('Failed to create assignment');
    }
  };

  const handleCancelAddAssignment = () => {
    setShowAddAssignment(false);
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

  const handleDeleteAssignment = async (assignmentId: number) => {
    if (!confirm('Are you sure you want to remove this assignment?')) {
      return;
    }

    try {
      await assignmentsApi.delete(assignmentId);
      if (selectedProject?.id) {
        await loadProjectAssignments(selectedProject.id);
      }
    } catch (err: any) {
      setError('Failed to delete assignment');
    }
  };

  const handleEditAssignment = (assignment: Assignment) => {
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
  };

  const handleRoleSearch = (searchTerm: string) => {
    console.log('handleRoleSearch called with:', searchTerm);
    console.log('Available roles to search:', availableRoles);
    setEditData(prev => {
      const newData = { ...prev, roleSearch: searchTerm, roleOnProject: searchTerm };
      console.log('Setting editData to:', newData);
      return newData;
    });
    
    if (searchTerm.length < 1) {
      setRoleSearchResults([]);
      return;
    }
    
    const filtered = availableRoles.filter(role =>
      role.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 5);
    
    console.log('Filtered roles for search term "' + searchTerm + '":', filtered);
    setRoleSearchResults(filtered);
  };

  const handleRoleSelect = (role: string) => {
    setEditData(prev => ({ ...prev, roleOnProject: role, roleSearch: role }));
    setRoleSearchResults([]);
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
      
      console.log('Saving assignment with role:', roleToSave, 'Original editData:', editData);
      console.log('Sending to backend:', updateData);

      const updatedAssignment = await assignmentsApi.update(assignmentId, updateData);
      console.log('Backend returned:', updatedAssignment);

      if (selectedProject?.id) {
        await loadProjectAssignments(selectedProject.id);
      }
      
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
    setEditData({
      roleOnProject: '',
      currentWeekHours: 0,
      roleSearch: '',
    });
  };

  const getCurrentWeekHours = (assignment: Assignment): number => {
    // Get current week in YYYY-MM-DD format for the Monday of this week
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    const currentWeekKey = monday.toISOString().split('T')[0];
    
    return assignment.weeklyHours?.[currentWeekKey] || 0;
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedProject?.id) return;

    try {
      await projectsApi.update(selectedProject.id, { ...selectedProject, status: newStatus });
      
      // Update the project in the local state
      const updatedProjects = projects.map(p => 
        p.id === selectedProject.id ? { ...p, status: newStatus } : p
      );
      setProjects(updatedProjects);
      setSelectedProject({ ...selectedProject, status: newStatus });
      setStatusDropdownOpen(false);
    } catch (err: any) {
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

  // Filter projects
  const filteredProjects = projects.filter(project => {
    let matchesStatus = false;
    
    if (statusFilter === 'Show All') {
      matchesStatus = true;
    } else if (statusFilter === 'active_no_deliverables') {
      // Filter to active projects with no upcoming deliverable dates
      matchesStatus = project.status === 'active' && project.id && !hasUpcomingDeliverableDates(project.id);
    } else {
      matchesStatus = project.status === statusFilter;
    }
    
    const matchesSearch = !searchTerm || 
      project.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.client?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.projectNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesSearch;
  });

  // Sort projects
  const sortedProjects = [...filteredProjects].sort((a, b) => {
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
        // We don't have type field in backend, using status as fallback
        aValue = a.status || '';
        bValue = b.status || '';
        break;
      case 'status':
        aValue = a.status || '';
        bValue = b.status || '';
        break;
      case 'nextDeliverable':
        const aNext = a.id ? getNextDeliverable(a.id) : null;
        const bNext = b.id ? getNextDeliverable(b.id) : null;
        
        // Sort by date first, then by percentage
        if (!aNext && !bNext) {
          aValue = '';
          bValue = '';
        } else if (!aNext) {
          aValue = 'zzz'; // Sort projects without deliverables to the end
          bValue = bNext!.date || 'zzz';
        } else if (!bNext) {
          aValue = aNext.date || 'zzz';
          bValue = 'zzz';
        } else {
          aValue = aNext.date || 'zzz';
          bValue = bNext.date || 'zzz';
          
          // If dates are the same, sort by percentage
          if (aValue === bValue) {
            aValue = aNext.percentage || 0;
            bValue = bNext.percentage || 0;
          }
        }
        break;
      default:
        aValue = a.name || '';
        bValue = b.name || '';
    }

    // For date comparison
    if (sortBy === 'nextDeliverable') {
      return sortDirection === 'asc' ? aValue.getTime() - bValue.getTime() : bValue.getTime() - aValue.getTime();
    }

    // For string comparison
    const result = aValue.toString().localeCompare(bValue.toString());
    return sortDirection === 'asc' ? result : -result;
  });

  // Auto-select first project from sorted/filtered list
  useEffect(() => {
    if (sortedProjects.length > 0 && !selectedProject) {
      setSelectedProject(sortedProjects[0]);
      setSelectedIndex(0);
    }
  }, [sortedProjects, selectedProject]);

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
        setStatusDropdownOpen(false);
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
                          : 'bg-[#3e3e42] border-[#3e3e42] text-[#969696] hover:text-[#cccccc]'
                      }`}
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

          {/* Projects Table */}
          <div className="flex-1 overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-2 py-1.5 text-xs text-[#969696] font-medium border-b border-[#3e3e42] bg-[#2d2d30]">
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
              <div className="col-span-4 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center" onClick={() => handleSort('nextDeliverable')}>
                NEXT DELIVERABLE<SortIcon column="nextDeliverable" />
              </div>
            </div>

            {/* Table Body */}
            <div className="overflow-y-auto h-full">
              {sortedProjects.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center text-[#969696]">
                    <div className="text-lg mb-2">No projects found</div>
                    <div className="text-sm">Try adjusting your filters or create a new project</div>
                  </div>
                </div>
              ) : (
                sortedProjects.map((project, index) => (
                  <div
                    key={project.id}
                    onClick={() => handleProjectClick(project, index)}
                    className={`grid grid-cols-12 gap-2 px-2 py-1.5 text-sm border-b border-[#3e3e42] cursor-pointer hover:bg-[#3e3e42]/50 transition-colors focus:outline-none ${
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
                    
                    {/* Next Deliverable */}
                    <div className="col-span-4">
                      {(() => {
                        const nextDeliverable = project.id ? getNextDeliverable(project.id) : null;
                        return nextDeliverable ? (
                          <div className="text-[#cccccc] text-xs leading-tight">
                            {formatNextDeliverable(nextDeliverable)}
                          </div>
                        ) : (
                          <div className="text-[#969696] text-xs">-</div>
                        );
                      })()}
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
                        <div className="relative">
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
                              placeholder="Start typing name..."
                              value={newAssignment.personSearch}
                              onChange={(e) => handlePersonSearch(e.target.value)}
                              onKeyDown={handlePersonSearchKeyDown}
                              className="w-full px-2 py-1 text-xs bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none"
                              autoFocus
                            />
                            
                            {/* Search Results Dropdown */}
                            {personSearchResults.length > 0 && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 max-h-32 overflow-y-auto">
                                {personSearchResults.map((person, index) => (
                                  <button
                                    key={person.id}
                                    onClick={() => handlePersonSelect(person)}
                                    className={`w-full text-left px-2 py-1 text-xs hover:bg-[#3e3e42] transition-colors text-[#cccccc] border-b border-[#3e3e42] last:border-b-0 ${
                                      selectedPersonIndex === index ? 'bg-[#007acc]/30 border-[#007acc]' : ''
                                    }`}
                                  >
                                    <div className="font-medium">{person.name}</div>
                                    <div className="text-[#969696]">{person.role}</div>
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

                {/* Deliverables Section */}
                <DeliverablesSection project={selectedProject} />
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