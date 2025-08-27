/**
 * Assignment Grid - Real implementation of the spreadsheet-like assignment interface
 * Replaces the form-based AssignmentForm with a modern grid view
 */

import React, { useState, useEffect } from 'react';
import { Assignment, Person } from '@/types/models';
import { assignmentsApi, peopleApi } from '@/services/api';
import Layout from '@/components/layout/Layout';

interface PersonWithAssignments extends Person {
  assignments: Assignment[];
  isExpanded: boolean;
}

// Get next 12 Monday dates
const getNext12Mondays = (): { date: string, display: string, fullDisplay: string }[] => {
  const today = new Date();
  const currentMonday = new Date(today);
  const daysFromMonday = (today.getDay() + 6) % 7;
  currentMonday.setDate(today.getDate() - daysFromMonday);
  
  const mondays: { date: string, display: string, fullDisplay: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const monday = new Date(currentMonday);
    monday.setDate(currentMonday.getDate() + (i * 7));
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    mondays.push({
      date: monday.toISOString().split('T')[0],
      display: `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      fullDisplay: `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    });
  }
  return mondays;
};

const AssignmentGrid: React.FC = () => {
  const [people, setPeople] = useState<PersonWithAssignments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingAssignment, setIsAddingAssignment] = useState<number | null>(null);
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [editingCell, setEditingCell] = useState<{ personId: number, assignmentId: number, week: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<{ personId: number, assignmentId: number, week: string } | null>(null);
  const [selectedCells, setSelectedCells] = useState<{ personId: number, assignmentId: number, week: string }[]>([]);
  const [selectionStart, setSelectionStart] = useState<{ personId: number, assignmentId: number, week: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const weeks = getNext12Mondays();

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Global keyboard navigation and direct typing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if we have a selected cell and we're not in edit mode
      if (!selectedCell || editingCell) return;

      const { personId, assignmentId, week } = selectedCell;
      const person = people.find(p => p.id === personId);
      const assignment = person?.assignments.find(a => a.id === assignmentId);
      
      if (!person || !assignment) return;

      const currentWeekIndex = weeks.findIndex(w => w.date === week);

      // Handle direct number typing - should clear existing value and start with new number
      if (/^[0-9.]$/.test(e.key)) {
        e.preventDefault();
        // Start editing with the typed character (replaces existing value)
        setEditingCell({ personId, assignmentId, week });
        setEditingValue(e.key); // Start fresh with just the typed character
        return;
      }

      // Handle Enter key - only when NOT in edit mode (edit mode handles its own Enter)
      if (e.key === 'Enter') {
        e.preventDefault();
        // Move to next week (this should only happen when just selecting, not editing)
        if (currentWeekIndex < weeks.length - 1) {
          const nextCell = { personId, assignmentId, week: weeks[currentWeekIndex + 1].date };
          setSelectedCell(nextCell);
          setSelectionStart(nextCell);
          setSelectedCells([]);
        }
        return;
      }

      // Handle Tab key - move to next cell
      if (e.key === 'Tab') {
        e.preventDefault();
        // Move to next week
        if (currentWeekIndex < weeks.length - 1) {
          const nextCell = { personId, assignmentId, week: weeks[currentWeekIndex + 1].date };
          setSelectedCell(nextCell);
          setSelectionStart(nextCell);
          setSelectedCells([]);
        }
        return;
      }

      // Handle arrow key navigation
      let newCell = null;
      switch (e.key) {
        case 'ArrowLeft':
          if (currentWeekIndex > 0) {
            newCell = { personId, assignmentId, week: weeks[currentWeekIndex - 1].date };
          }
          break;
        case 'ArrowRight':
          if (currentWeekIndex < weeks.length - 1) {
            newCell = { personId, assignmentId, week: weeks[currentWeekIndex + 1].date };
          }
          break;
        // Add more navigation logic for up/down arrows if needed
      }

      if (newCell) {
        e.preventDefault();
        
        if (e.shiftKey && selectionStart) {
          // Extend selection
          const startWeekIndex = weeks.findIndex(w => w.date === selectionStart.week);
          const endWeekIndex = weeks.findIndex(w => w.date === newCell.week);
          const [minIndex, maxIndex] = [Math.min(startWeekIndex, endWeekIndex), Math.max(startWeekIndex, endWeekIndex)];
          
          const newSelectedCells = [];
          for (let i = minIndex; i <= maxIndex; i++) {
            newSelectedCells.push({
              personId: selectionStart.personId,
              assignmentId: selectionStart.assignmentId,
              week: weeks[i].date
            });
          }
          setSelectedCells(newSelectedCells);
        } else {
          // Single selection
          setSelectedCells([]);
          setSelectionStart(newCell);
        }
        
        setSelectedCell(newCell);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCell, editingCell, people, weeks, selectionStart]);

  // Global mouse up handler for drag selection
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [isDragging]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [peopleResponse, assignmentsResponse] = await Promise.all([
        peopleApi.list(),
        assignmentsApi.list()
      ]);
      
      const peopleData = peopleResponse.results || [];
      const assignmentsData = assignmentsResponse.results || [];
      
      const peopleWithAssignments: PersonWithAssignments[] = peopleData.map(person => ({
        ...person,
        assignments: assignmentsData.filter(assignment => assignment.person === person.id),
        isExpanded: true
      }));
      
      setPeople(peopleWithAssignments);
      
    } catch (err: any) {
      setError('Failed to load assignment data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Toggle person expansion
  const togglePersonExpanded = (personId: number) => {
    setPeople(prev => prev.map(person => 
      person.id === personId 
        ? { ...person, isExpanded: !person.isExpanded }
        : person
    ));
  };

  // Get person's total hours for a specific week
  const getPersonTotalHours = (person: PersonWithAssignments, week: string) => {
    return person.assignments.reduce((total, assignment) => 
      total + (assignment.weeklyHours[week] || 0), 0
    );
  };

  // Add new assignment
  const addAssignment = async (personId: number, projectName: string) => {
    try {
      const newAssignment = await assignmentsApi.create({
        person: personId,
        projectName: projectName.trim(),
        weeklyHours: {}
      });
      
      setPeople(prev => prev.map(person => 
        person.id === personId 
          ? { ...person, assignments: [...person.assignments, newAssignment] }
          : person
      ));
      
      setIsAddingAssignment(null);
      setNewProjectName('');
      
    } catch (err: any) {
      console.error('Failed to create assignment:', err);
      alert('Failed to create assignment: ' + err.message);
    }
  };

  // Remove assignment
  const removeAssignment = async (assignmentId: number, personId: number) => {
    if (!confirm('Are you sure you want to remove this assignment?')) return;
    
    try {
      await assignmentsApi.delete(assignmentId);
      
      setPeople(prev => prev.map(person => 
        person.id === personId 
          ? { ...person, assignments: person.assignments.filter(a => a.id !== assignmentId) }
          : person
      ));
      
    } catch (err: any) {
      console.error('Failed to delete assignment:', err);
      alert('Failed to delete assignment: ' + err.message);
    }
  };

  // Update assignment hours
  const updateAssignmentHours = async (personId: number, assignmentId: number, week: string, hours: number) => {
    try {
      // Find the assignment to update
      const person = people.find(p => p.id === personId);
      const assignment = person?.assignments.find(a => a.id === assignmentId);
      
      if (!assignment) return;
      
      // Update the weekly hours
      const updatedWeeklyHours = {
        ...assignment.weeklyHours,
        [week]: hours
      };
      
      // Call API to update
      await assignmentsApi.update(assignmentId, {
        weeklyHours: updatedWeeklyHours
      });
      
      // Update local state
      setPeople(prev => prev.map(person => 
        person.id === personId 
          ? {
              ...person,
              assignments: person.assignments.map(a =>
                a.id === assignmentId 
                  ? { ...a, weeklyHours: updatedWeeklyHours }
                  : a
              )
            }
          : person
      ));
      
    } catch (err: any) {
      console.error('Failed to update assignment hours:', err);
      alert('Failed to update hours: ' + err.message);
    }
  };

  // Helper function to check if a cell is in the selected cells array
  const isCellSelected = (personId: number, assignmentId: number, week: string) => {
    return selectedCells.some(cell => 
      cell.personId === personId && 
      cell.assignmentId === assignmentId && 
      cell.week === week
    );
  };

  // Update multiple cells at once (for bulk editing)
  const updateMultipleCells = async (cells: { personId: number, assignmentId: number, week: string }[], hours: number) => {
    try {
      // Group cells by assignment to minimize API calls
      const assignmentUpdates = new Map();
      
      cells.forEach(cell => {
        const key = `${cell.personId}-${cell.assignmentId}`;
        if (!assignmentUpdates.has(key)) {
          const person = people.find(p => p.id === cell.personId);
          const assignment = person?.assignments.find(a => a.id === cell.assignmentId);
          if (assignment) {
            assignmentUpdates.set(key, {
              personId: cell.personId,
              assignmentId: cell.assignmentId,
              weeklyHours: { ...assignment.weeklyHours }
            });
          }
        }
        
        const update = assignmentUpdates.get(key);
        if (update) {
          update.weeklyHours[cell.week] = hours;
        }
      });

      // Execute all updates
      const promises = Array.from(assignmentUpdates.values()).map(async (update) => {
        await assignmentsApi.update(update.assignmentId, {
          weeklyHours: update.weeklyHours
        });
        return update;
      });

      const completedUpdates = await Promise.all(promises);

      // Update local state
      setPeople(prev => prev.map(person => {
        const personUpdates = completedUpdates.filter(u => u.personId === person.id);
        if (personUpdates.length === 0) return person;

        return {
          ...person,
          assignments: person.assignments.map(assignment => {
            const assignmentUpdate = personUpdates.find(u => u.assignmentId === assignment.id);
            return assignmentUpdate 
              ? { ...assignment, weeklyHours: assignmentUpdate.weeklyHours }
              : assignment;
          })
        };
      }));

    } catch (err: any) {
      console.error('Failed to update multiple cells:', err);
      alert('Failed to update multiple cells: ' + err.message);
    }
  };

  // Get utilization badge styling
  const getUtilizationBadgeStyle = (hours: number, capacity: number) => {
    if (hours === 0) return 'bg-[#3e3e42] text-[#969696]';
    const percentage = (hours / capacity) * 100;
    if (percentage <= 70) return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    if (percentage <= 85) return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
    if (percentage <= 100) return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
    return 'bg-red-500/20 text-red-300 border border-red-500/30';
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-[#969696]">Loading assignments...</div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-red-400">{error}</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#cccccc]">Assignment Grid</h1>
            <p className="text-[#969696] text-sm">Manage team workload allocation across 12 weeks</p>
          </div>
          <div className="text-xs text-[#969696]">
            {people.length} people • {people.reduce((total, p) => total + p.assignments.length, 0)} assignments
          </div>
        </div>

        {/* Grid Container */}
        <div className="bg-[#1e1e1e] border border-[#3e3e42] rounded-lg overflow-x-auto">
          <div className="min-w-[1400px]">
            
            {/* Sticky Header */}
            <div className="sticky top-0 bg-[#2d2d30] border-b border-[#3e3e42] z-10">
              <div className="grid grid-cols-[280px_40px_repeat(12,70px)] gap-px p-2">
                <div className="font-medium text-[#cccccc] text-sm px-2 py-1">Team Member</div>
                <div className="text-center text-xs text-[#969696] px-1">+/-</div>
                {weeks.map((week, index) => (
                  <div key={week.date} className="text-center px-1">
                    <div className="text-xs font-medium text-[#cccccc]">{week.display}</div>
                    <div className="text-[10px] text-[#757575]">W{index + 1}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Data Rows */}
            <div>
              {people.map((person) => (
                <div key={person.id} className="border-b border-[#3e3e42] last:border-b-0">
                  
                  {/* Person Row */}
                  <div className="grid grid-cols-[280px_40px_repeat(12,70px)] gap-px p-2 hover:bg-[#2d2d30]/50 transition-colors">
                    
                    {/* Person Info */}
                    <div className="flex items-center gap-2 pl-3 pr-2 py-1">
                      <button
                        onClick={() => togglePersonExpanded(person.id!)}
                        className="flex-shrink-0 w-5 h-5 flex items-center justify-center hover:bg-[#3e3e42] rounded text-[#969696] hover:text-[#cccccc] transition-all duration-200"
                      >
                        <svg 
                          width="12" 
                          height="12" 
                          viewBox="0 0 12 12" 
                          className={`transition-transform duration-200 ${person.isExpanded ? 'rotate-90' : 'rotate-0'}`}
                        >
                          <path 
                            d="M4 2 L8 6 L4 10" 
                            fill="none" 
                            stroke="currentColor" 
                            strokeWidth="1.5" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-[#cccccc] text-sm truncate">{person.name}</div>
                        <div className="text-xs text-[#969696]">{person.role} • {person.weeklyCapacity}h/wk</div>
                      </div>
                    </div>

                    {/* Add Assignment Button */}
                    <div className="flex items-center justify-center">
                      <button 
                        className="w-7 h-7 rounded text-white hover:text-[#969696] hover:bg-[#3e3e42] transition-colors text-center text-sm font-medium leading-none font-mono"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Add new assignment"
                        onClick={() => {
                          setIsAddingAssignment(person.id!);
                          setNewProjectName('');
                        }}
                      >
                        +
                      </button>
                    </div>

                    {/* Person's Weekly Totals */}
                    {weeks.map((week) => {
                      const totalHours = getPersonTotalHours(person, week.date);
                      
                      return (
                        <div key={week.date} className="flex items-center justify-center px-1">
                          <div className={`px-2 py-1 rounded-full text-xs font-medium min-w-[40px] text-center ${getUtilizationBadgeStyle(totalHours, person.weeklyCapacity!)}`}>
                            {totalHours > 0 ? `${totalHours}h` : '—'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Assignment Rows */}
                  {person.isExpanded && person.assignments.map((assignment) => (
                    <div key={assignment.id} className="grid grid-cols-[280px_40px_repeat(12,70px)] gap-px p-1 bg-[#252526] hover:bg-[#2d2d30] transition-colors">
                      
                      {/* Assignment Name */}
                      <div className="flex items-center py-1 pl-[60px] pr-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[#cccccc] text-xs truncate">{assignment.projectName}</div>
                        </div>
                      </div>

                      {/* Remove Assignment Button */}
                      <div className="flex items-center justify-center">
                        <button 
                          className="w-7 h-7 rounded text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors text-center text-sm font-medium leading-none font-mono"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Remove assignment"
                          onClick={() => removeAssignment(assignment.id!, person.id!)}
                        >
                          ×
                        </button>
                      </div>

                      {/* Hour Cells - Editable with Multi-Select */}
                      {weeks.map((week) => {
                        const hours = assignment.weeklyHours?.[week.date] || 0;
                        const cellKey = { personId: person.id!, assignmentId: assignment.id!, week: week.date };
                        const isEditing = editingCell?.personId === person.id && 
                                         editingCell?.assignmentId === assignment.id && 
                                         editingCell?.week === week.date;
                        const isSelected = selectedCell?.personId === person.id && 
                                          selectedCell?.assignmentId === assignment.id && 
                                          selectedCell?.week === week.date;
                        const isMultiSelected = isCellSelected(person.id!, assignment.id!, week.date);

                        return (
                          <div key={week.date} className="flex items-center justify-center px-1">
                            {isEditing ? (
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                className="w-12 h-6 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] text-center focus:border-[#007acc] focus:ring-1 focus:ring-[#007acc] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                onBlur={() => {
                                  const numValue = parseFloat(editingValue) || 0;
                                  if (selectedCells.length > 0) {
                                    updateMultipleCells(selectedCells, numValue);
                                    setSelectedCells([]);
                                  } else {
                                    updateAssignmentHours(person.id!, assignment.id!, week.date, numValue);
                                  }
                                  setEditingCell(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === 'Tab') {
                                    e.preventDefault();
                                    e.stopPropagation(); // Prevent global handler from also running
                                    const numValue = parseFloat(editingValue) || 0;
                                    if (selectedCells.length > 0) {
                                      updateMultipleCells(selectedCells, numValue);
                                      setSelectedCells([]);
                                    } else {
                                      updateAssignmentHours(person.id!, assignment.id!, week.date, numValue);
                                    }
                                    setEditingCell(null);
                                    
                                    // Move to next cell
                                    const currentWeekIndex = weeks.findIndex(w => w.date === week.date);
                                    if (currentWeekIndex < weeks.length - 1) {
                                      const nextCell = { 
                                        personId: person.id!, 
                                        assignmentId: assignment.id!, 
                                        week: weeks[currentWeekIndex + 1].date 
                                      };
                                      setSelectedCell(nextCell);
                                      setSelectionStart(nextCell);
                                    }
                                  } else if (e.key === 'Escape') {
                                    setEditingCell(null);
                                  }
                                }}
                                autoFocus
                              />
                            ) : (
                              <div 
                                className={`w-12 h-6 text-xs rounded flex items-center justify-center cursor-pointer transition-colors ${
                                  isMultiSelected 
                                    ? 'ring-2 ring-purple-400 bg-purple-500/30 text-[#cccccc]'
                                    : isSelected 
                                      ? 'ring-2 ring-blue-400 bg-blue-500/20 text-[#cccccc]'
                                      : 'text-[#cccccc] hover:bg-[#3e3e42]'
                                }`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  // Single click should only select the cell, never start editing
                                  setSelectedCell(cellKey);
                                  setSelectionStart(cellKey);
                                  setSelectedCells([]);
                                }}
                                onMouseDown={(e) => {
                                  // Always allow drag selection to start from any cell
                                  e.preventDefault();
                                  setSelectedCell(cellKey);
                                  setSelectionStart(cellKey);
                                  setIsDragging(true);
                                  setSelectedCells([]);
                                }}
                                onMouseEnter={() => {
                                  if (isDragging && selectionStart) {
                                    // Create selection from start to current cell (horizontal only for now)
                                    const startWeekIndex = weeks.findIndex(w => w.date === selectionStart.week);
                                    const currentWeekIndex = weeks.findIndex(w => w.date === week.date);
                                    
                                    if (selectionStart.personId === person.id && selectionStart.assignmentId === assignment.id) {
                                      const [minIndex, maxIndex] = [Math.min(startWeekIndex, currentWeekIndex), Math.max(startWeekIndex, currentWeekIndex)];
                                      const newSelectedCells = [];
                                      for (let i = minIndex; i <= maxIndex; i++) {
                                        newSelectedCells.push({
                                          personId: person.id!,
                                          assignmentId: assignment.id!,
                                          week: weeks[i].date
                                        });
                                      }
                                      setSelectedCells(newSelectedCells);
                                    }
                                  }
                                }}
                                onMouseUp={() => {
                                  setIsDragging(false);
                                }}
                              >
                                {hours > 0 ? hours : '—'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* Add Assignment Form */}
                  {person.isExpanded && isAddingAssignment === person.id && (
                    <div className="grid grid-cols-[280px_40px_repeat(12,70px)] gap-px p-1 bg-[#2d2d30] border border-blue-500/30">
                      <div className="flex items-center py-1 pl-[60px] pr-2">
                        <input
                          type="text"
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newProjectName.trim()) {
                              addAssignment(person.id!, newProjectName);
                            } else if (e.key === 'Escape') {
                              setIsAddingAssignment(null);
                              setNewProjectName('');
                            }
                          }}
                          placeholder="Project name..."
                          className="w-full px-2 py-1 text-xs bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none"
                          autoFocus
                        />
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <button 
                          className="w-5 h-5 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors flex items-center justify-center"
                          title="Save assignment"
                          onClick={() => newProjectName.trim() && addAssignment(person.id!, newProjectName)}
                          disabled={!newProjectName.trim()}
                        >
                          ✓
                        </button>
                        <button 
                          className="w-5 h-5 rounded bg-[#3e3e42] hover:bg-[#4e4e52] text-white text-xs font-medium transition-colors flex items-center justify-center"
                          title="Cancel"
                          onClick={() => {
                            setIsAddingAssignment(null);
                            setNewProjectName('');
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      {weeks.map((week) => (
                        <div key={week.date} className="flex items-center justify-center">
                          <div className="w-12 h-6 flex items-center justify-center text-[#757575] text-xs">—</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty State */}
                  {person.isExpanded && person.assignments.length === 0 && (
                    <div className="grid grid-cols-[280px_40px_repeat(12,70px)] gap-px p-1 bg-[#252526]">
                      <div className="flex items-center py-1 pl-[60px] pr-2">
                        <div className="text-[#757575] text-xs italic">
                          No assignments
                        </div>
                      </div>
                      <div></div>
                      {weeks.map((week) => (
                        <div key={week.date} className="flex items-center justify-center">
                          <div className="w-12 h-6 flex items-center justify-center text-[#757575] text-xs">—</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex justify-between items-center text-xs text-[#969696] px-1">
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span>Available (≤70%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span>Busy (71-85%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500"></div>
              <span>Full (86-100%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              <span>Overallocated (&gt;100%)</span>
            </div>
          </div>
          <div>Real assignment grid - Full functionality coming next</div>
        </div>
      </div>
    </Layout>
  );
};

export default AssignmentGrid;