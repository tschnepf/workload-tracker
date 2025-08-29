/**
 * Department Hierarchy Visualization - Organizational chart component
 * Shows parent-child department relationships with team information
 */

import React, { useState, useEffect } from 'react';
import { Department, Person } from '@/types/models';
import Card from '@/components/ui/Card';

interface DepartmentNode extends Department {
  children: DepartmentNode[];
  people: Person[];
  level: number;
}

interface DepartmentHierarchyProps {
  departments: Department[];
  people: Person[];
  onDepartmentClick?: (department: Department) => void;
  selectedDepartmentId?: number;
}

const DepartmentHierarchy: React.FC<DepartmentHierarchyProps> = ({
  departments,
  people,
  onDepartmentClick,
  selectedDepartmentId
}) => {
  const [hierarchyTree, setHierarchyTree] = useState<DepartmentNode[]>([]);

  useEffect(() => {
    if (departments.length > 0) {
      buildHierarchyTree();
    }
  }, [departments, people]);

  const buildHierarchyTree = () => {
    // Create department nodes with people assigned to each
    const deptNodes: { [key: number]: DepartmentNode } = {};
    
    departments.forEach(dept => {
      const departmentPeople = people.filter(person => person.department === dept.id);
      deptNodes[dept.id!] = {
        ...dept,
        children: [],
        people: departmentPeople,
        level: 0
      };
    });

    // Build parent-child relationships
    const rootNodes: DepartmentNode[] = [];
    
    departments.forEach(dept => {
      if (dept.parentDepartment && deptNodes[dept.parentDepartment]) {
        // This department has a parent
        deptNodes[dept.parentDepartment].children.push(deptNodes[dept.id!]);
      } else {
        // This is a root department
        rootNodes.push(deptNodes[dept.id!]);
      }
    });

    // Calculate levels for proper rendering
    const calculateLevels = (nodes: DepartmentNode[], level: number = 0) => {
      nodes.forEach(node => {
        node.level = level;
        calculateLevels(node.children, level + 1);
      });
    };
    
    calculateLevels(rootNodes);
    setHierarchyTree(rootNodes);
  };

  const DepartmentCard: React.FC<{ node: DepartmentNode }> = ({ node }) => {
    const isSelected = selectedDepartmentId === node.id;
    const hasChildren = node.children.length > 0;
    
    return (
      <div className="relative">
        <Card 
          className={`p-4 cursor-pointer transition-all bg-[#2d2d30] border-[#3e3e42] hover:bg-[#3e3e42]/50 ${
            isSelected ? 'ring-2 ring-[#007acc] bg-[#007acc]/10' : ''
          }`}
          onClick={() => onDepartmentClick?.(node)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              {/* Department Name */}
              <h3 className="font-semibold text-[#cccccc] mb-1 truncate">
                {node.name}
              </h3>
              
              {/* Manager */}
              <div className="text-xs text-[#969696] mb-2">
                Manager: {node.managerName || 'None assigned'}
              </div>
              
              {/* Team Size */}
              <div className="flex items-center gap-4 text-xs">
                <div className="text-blue-400">
                  👥 {node.people.length} people
                </div>
                
                {hasChildren && (
                  <div className="text-emerald-400">
                    🏢 {node.children.length} sub-dept{node.children.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
              
              {/* Description if available */}
              {node.description && (
                <div className="text-xs text-[#969696] mt-2 line-clamp-2">
                  {node.description}
                </div>
              )}
            </div>
            
            {/* Status Indicator */}
            <div className={`px-2 py-1 rounded text-xs ${
              node.isActive 
                ? 'bg-emerald-500/20 text-emerald-400' 
                : 'bg-gray-500/20 text-gray-400'
            }`}>
              {node.isActive ? 'Active' : 'Inactive'}
            </div>
          </div>
          
          {/* People Preview */}
          {node.people.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#3e3e42]/50">
              <div className="flex flex-wrap gap-1">
                {node.people.slice(0, 3).map((person, index) => (
                  <span 
                    key={person.id} 
                    className="px-2 py-1 bg-[#3e3e42]/50 text-xs text-[#cccccc] rounded"
                  >
                    {person.name}
                  </span>
                ))}
                {node.people.length > 3 && (
                  <span className="px-2 py-1 bg-[#3e3e42]/30 text-xs text-[#969696] rounded">
                    +{node.people.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>
        
        {/* Connection Lines */}
        {hasChildren && (
          <>
            {/* Vertical line down */}
            <div className="absolute left-1/2 bottom-0 w-px h-6 bg-[#3e3e42] transform -translate-x-0.5"></div>
            
            {/* Horizontal line across children */}
            {node.children.length > 1 && (
              <div className="absolute top-full left-1/2 mt-6 h-px bg-[#3e3e42] transform -translate-y-0.5"
                style={{
                  width: `${(node.children.length - 1) * 280 + 200}px`,
                  left: `calc(50% - ${((node.children.length - 1) * 280 + 200) / 2}px)`
                }}
              ></div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderHierarchyLevel = (nodes: DepartmentNode[], level: number = 0): React.ReactNode => {
    if (nodes.length === 0) return null;

    return (
      <div className="space-y-8">
        <div className={`flex ${nodes.length === 1 ? 'justify-center' : 'justify-center space-x-8'} flex-wrap gap-8`}>
          {nodes.map((node) => (
            <div key={node.id} className="flex flex-col items-center relative">
              {/* Vertical connection line from parent */}
              {level > 0 && (
                <div className="w-px h-6 bg-[#3e3e42] mb-2"></div>
              )}
              
              <div className="w-64">
                <DepartmentCard node={node} />
              </div>
              
              {/* Render children */}
              {node.children.length > 0 && (
                <div className="mt-8">
                  {renderHierarchyLevel(node.children, level + 1)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (hierarchyTree.length === 0) {
    return (
      <div className="text-center py-8 text-[#969696]">
        <h3 className="text-lg mb-2">No Department Hierarchy</h3>
        <p className="text-sm">Create departments to see the organizational structure</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Legend */}
      <div className="mb-6 p-4 bg-[#2d2d30] border border-[#3e3e42] rounded-lg">
        <h4 className="text-sm font-medium text-[#cccccc] mb-2">Legend</h4>
        <div className="flex flex-wrap gap-4 text-xs text-[#969696]">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-blue-400 rounded"></div>
            <span>Team members</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-emerald-400 rounded"></div>
            <span>Sub-departments</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-[#007acc] rounded"></div>
            <span>Selected department</span>
          </div>
        </div>
      </div>

      {/* Hierarchy Tree */}
      <div className="overflow-x-auto pb-6">
        <div className="min-w-max px-4">
          {renderHierarchyLevel(hierarchyTree)}
        </div>
      </div>
    </div>
  );
};

export default DepartmentHierarchy;