/**
 * Projects List Mockup - Based on reference image
 * Split-panel layout with filterable project list and detailed project view
 */

import React, { useState, useEffect } from 'react';

// Mock data to demonstrate the layout
const mockProjects = [
  {
    id: 1,
    name: 'Richmond Masterplanning',
    projectNumber: '#25.026.01',
    type: 'Greenfield',
    status: 'Active',
    client: 'Richmond Corp',
    nextDeliverable: '8/27/2025',
    deliverableType: 'Unknown Type'
  },
  {
    id: 2,
    name: 'KcService Due Diligence',
    projectNumber: '#25.026.01',
    type: 'Assessment',
    status: 'Active',
    client: 'KcService Ltd',
    nextDeliverable: '8/27/2025',
    deliverableType: 'Unknown Type'
  },
  {
    id: 3,
    name: 'Align Compass GA23',
    projectNumber: '#24.028.07',
    type: 'TTO',
    status: 'Active',
    client: 'Align Corp',
    nextDeliverable: '',
    deliverableType: ''
  },
  {
    id: 4,
    name: 'SNHA - ADC - CMH02',
    projectNumber: '#25.005',
    type: 'Greenfield',
    status: 'Active',
    client: 'SNHA',
    nextDeliverable: '8/14/2025',
    deliverableType: 'Unknown Type',
    isSelected: true
  },
  {
    id: 5,
    name: 'APLD - ELN02 TTO',
    projectNumber: '#24.030',
    type: 'Tenant Fit Out',
    status: 'Active',
    client: 'APLD',
    nextDeliverable: '',
    deliverableType: ''
  }
];

const mockAssignments = [
  { department: 'Electrical', person: 'Carl Weatherford', role: 'Electrical Support', hours: '0h' },
  { department: 'Fire', person: 'Andrew Searcho', role: 'Fire Protection Lead', hours: '0h' },
  { department: 'Fire', person: 'James Juren', role: 'Fire Protection Support', hours: '0h' },
  { department: 'Mechanical', person: 'Brendan Kisseback', role: 'Mechanical Lead', hours: '0h' },
  { department: 'Mechanical', person: 'Emma Reitano', role: 'Mechanical Support', hours: '0h' },
  { department: 'Mechanical', person: 'Connor Melbius', role: 'Mechanical Support', hours: '0h' }
];

const mockDeliverables = [
  {
    id: 1,
    description: 'Progress to client',
    type: 'Unknown Type',
    phase: '95%',
    hours: '0h',
    dueDate: '8/14/2025'
  },
  {
    id: 2,
    description: 'IFP (Stamped)',
    type: 'IFP',
    phase: '100%',
    hours: '0h',
    dueDate: ''
  }
];

const ProjectsListMockup: React.FC = () => {
  const [selectedProject, setSelectedProject] = useState(mockProjects.find(p => p.isSelected));
  const [statusFilter, setStatusFilter] = useState('Show All');
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(mockProjects.findIndex(p => p.isSelected));

  const statusOptions = ['Active', 'Active No Dates', 'On Hold', 'Complete', 'Cancelled', 'Show All'];

  const handleProjectClick = (project: typeof mockProjects[0], index: number) => {
    setSelectedProject(project);
    setSelectedIndex(index);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'text-emerald-400';
      case 'On Hold': return 'text-amber-400';
      case 'Complete': return 'text-slate-400';
      case 'Cancelled': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('asc');
    }
  };

  const sortedProjects = [...mockProjects].sort((a, b) => {
    let aValue: any, bValue: any;
    
    switch (sortBy) {
      case 'client':
        aValue = a.client;
        bValue = b.client;
        break;
      case 'name':
        aValue = a.name;
        bValue = b.name;
        break;
      case 'type':
        aValue = a.type;
        bValue = b.type;
        break;
      case 'status':
        aValue = a.status;
        bValue = b.status;
        break;
      case 'nextDeliverable':
        // Sort by date for next deliverable
        aValue = a.nextDeliverable ? new Date(a.nextDeliverable) : new Date('1900-01-01');
        bValue = b.nextDeliverable ? new Date(b.nextDeliverable) : new Date('1900-01-01');
        break;
      default:
        aValue = a.name;
        bValue = b.name;
    }

    // For date comparison
    if (sortBy === 'nextDeliverable') {
      return sortDirection === 'asc' ? aValue.getTime() - bValue.getTime() : bValue.getTime() - aValue.getTime();
    }

    // For string comparison
    const result = aValue.localeCompare(bValue);
    return sortDirection === 'asc' ? result : -result;
  });

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

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return null;
    
    return (
      <span className="ml-1 text-[#007acc]">
        {sortDirection === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex">
      <div className="w-16 bg-[#2d2d30] border-r border-[#3e3e42] flex-shrink-0">
        {/* Minimal sidebar placeholder */}
        <div className="p-2">
          <div className="w-8 h-8 bg-[#007acc] rounded flex items-center justify-center text-white text-xs font-bold">W</div>
        </div>
      </div>
      <div className="flex-1 flex h-screen bg-[#1e1e1e]">
        
        {/* Left Panel - Projects List */}
        <div className="w-1/2 border-r border-[#3e3e42] flex flex-col min-w-0">
          
          {/* Header */}
          <div className="p-3 border-b border-[#3e3e42]">
            <div className="flex justify-between items-center mb-2">
              <h1 className="text-lg font-semibold text-[#cccccc]">Projects</h1>
              <button className="px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors">
                + New
              </button>
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
                      {status}
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
              <div className="col-span-2 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center" onClick={() => handleSort('type')}>
                TYPE<SortIcon column="type" />
              </div>
              <div className="col-span-2 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center" onClick={() => handleSort('status')}>
                STATUS<SortIcon column="status" />
              </div>
              <div className="col-span-3 cursor-pointer hover:text-[#cccccc] transition-colors flex items-center" onClick={() => handleSort('nextDeliverable')}>
                NEXT DELIVERABLE<SortIcon column="nextDeliverable" />
              </div>
            </div>

            {/* Table Body */}
            <div className="overflow-y-auto h-full">
              {sortedProjects.map((project, index) => (
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
                    {project.client}
                  </div>
                  
                  {/* Project Name & Number */}
                  <div className="col-span-3">
                    <div className="text-[#cccccc] font-medium leading-tight">{project.name}</div>
                    <div className="text-[#969696] text-xs leading-tight">{project.projectNumber}</div>
                  </div>
                  
                  {/* Type */}
                  <div className="col-span-2 text-[#969696] text-xs">
                    {project.type}
                  </div>
                  
                  {/* Status */}
                  <div className="col-span-2">
                    <span className={`${getStatusColor(project.status)} text-xs`}>
                      {project.status}
                    </span>
                  </div>
                  
                  {/* Next Deliverable */}
                  <div className="col-span-3">
                    {project.nextDeliverable && (
                      <>
                        <div className="text-[#cccccc] text-xs leading-tight">{project.nextDeliverable}</div>
                        <div className="text-[#969696] text-xs leading-tight">{project.deliverableType}</div>
                      </>
                    )}
                  </div>
                </div>
              ))}
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
                        <div className="text-[#cccccc]">ADC</div>
                      </div>
                      <div>
                        <div className="text-[#969696] text-xs">Status:</div>
                        <div className={getStatusColor(selectedProject.status)}>Active</div>
                      </div>
                      <div>
                        <div className="text-[#969696] text-xs">Project Number:</div>
                        <div className="text-[#cccccc]">25.005</div>
                      </div>
                      <div>
                        <div className="text-[#969696] text-xs">Location:</div>
                        <div className="text-[#cccccc]">Cornsville, OH</div>
                      </div>
                    </div>
                  </div>
                  <button className="px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors">
                    Edit Project
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Assignments Section */}
                <div className="pb-4 border-b border-[#3e3e42]">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-base font-semibold text-[#cccccc]">
                      Assignments
                    </h3>
                    <button className="px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors">
                      + Add Assignment
                    </button>
                  </div>

                  {/* Assignments by Department */}
                  <div className="space-y-2">
                    {['Electrical', 'Fire', 'Mechanical'].map((dept) => (
                      <div key={dept}>
                        <h4 className="font-medium text-[#cccccc] mb-1 text-sm">{dept}</h4>
                        <div className="space-y-1">
                          {mockAssignments
                            .filter(a => a.department === dept)
                            .map((assignment, index) => (
                              <div key={index} className="flex justify-between items-center p-1.5 bg-[#3e3e42]/30 rounded text-xs">
                                <div className="flex-1">
                                  {index === 0 && (
                                    <div className="grid grid-cols-3 gap-4 text-[#969696] text-xs uppercase font-medium mb-1">
                                      <div>PERSON</div>
                                      <div>ROLE</div>
                                      <div>HOURS</div>
                                    </div>
                                  )}
                                  <div className="grid grid-cols-3 gap-4">
                                    <div className="text-[#cccccc]">{assignment.person}</div>
                                    <div className="text-[#969696]">{assignment.role}</div>
                                    <div className="text-[#969696]">{assignment.hours}</div>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <button className="text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-[#cccccc] hover:bg-[#3e3e42] hover:border-[#3e3e42] transition-colors">Edit</button>
                                  <button className="text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-colors">Delete</button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                    <div className="text-xs text-[#969696] mt-1">
                      Summary: 6 assignments • 0h total planned
                    </div>
                  </div>
                </div>

                {/* Deliverables Section */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-base font-semibold text-[#cccccc]">
                      Deliverables
                    </h3>
                    <button className="px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors">
                      + Add Deliverable
                    </button>
                  </div>

                  {/* Deliverables List */}
                  <div className="space-y-1">
                    {mockDeliverables.map((deliverable) => (
                      <div key={deliverable.id} className="flex justify-between items-center p-2 bg-[#3e3e42]/30 rounded">
                        <div>
                          <div className="text-[#cccccc] font-medium text-sm">{deliverable.description}</div>
                          <div className="text-xs text-[#969696]">
                            Type: {deliverable.type} • Phase: {deliverable.phase} • Hours: {deliverable.hours}
                            {deliverable.dueDate && (
                              <> • Due: {deliverable.dueDate}</>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button className="text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-[#cccccc] hover:bg-[#3e3e42] hover:border-[#3e3e42] transition-colors">Edit</button>
                          <button className="text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-colors">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
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

export default ProjectsListMockup;