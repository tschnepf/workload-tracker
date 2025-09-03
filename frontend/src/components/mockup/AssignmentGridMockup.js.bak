import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Assignment Grid Mockup v2 - Compact, modern, scalable interface
 * Optimized for large datasets with many people and projects
 */
import React, { useState } from 'react';
import Card from '@/components/ui/Card';
// Mock data - expanded dataset for testing scalability
const mockPeople = [
    {
        id: 1,
        name: 'Tim Schnepf',
        role: 'Senior Developer',
        weeklyCapacity: 36,
        isExpanded: true,
        assignments: [
            {
                id: 1,
                projectName: 'ADC CMH01',
                weeklyHours: { '2025-08-25': 18, '2025-09-01': 16, '2025-09-08': 20, '2025-09-15': 18, '2025-09-22': 12, '2025-09-29': 18, '2025-10-06': 18, '2025-10-13': 18, '2025-10-20': 18, '2025-10-27': 18, '2025-11-03': 18, '2025-11-10': 18 }
            },
            {
                id: 2,
                projectName: 'Website Redesign',
                weeklyHours: { '2025-08-25': 8, '2025-09-01': 12, '2025-09-08': 0, '2025-09-15': 8, '2025-09-22': 16, '2025-09-29': 8, '2025-10-06': 8, '2025-10-13': 8, '2025-10-20': 8, '2025-10-27': 8, '2025-11-03': 8, '2025-11-10': 8 }
            },
            {
                id: 3,
                projectName: 'API Integration',
                weeklyHours: { '2025-08-25': 4, '2025-09-01': 0, '2025-09-08': 8, '2025-09-15': 6, '2025-09-22': 4, '2025-09-29': 0, '2025-10-06': 0, '2025-10-13': 0, '2025-10-20': 0, '2025-10-27': 0, '2025-11-03': 0, '2025-11-10': 0 }
            }
        ]
    },
    {
        id: 2,
        name: 'Sarah Johnson',
        role: 'UI Designer',
        weeklyCapacity: 40,
        isExpanded: false,
        assignments: [
            {
                id: 4,
                projectName: 'Mobile App',
                weeklyHours: { '2025-08-25': 32, '2025-09-01': 32, '2025-09-08': 32, '2025-09-15': 32, '2025-09-22': 32, '2025-09-29': 32, '2025-10-06': 32, '2025-10-13': 32, '2025-10-20': 32, '2025-10-27': 32, '2025-11-03': 32, '2025-11-10': 32 }
            },
            {
                id: 5,
                projectName: 'Brand Guidelines',
                weeklyHours: { '2025-08-25': 8, '2025-09-01': 8, '2025-09-08': 8, '2025-09-15': 8, '2025-09-22': 0, '2025-09-29': 0, '2025-10-06': 0, '2025-10-13': 0, '2025-10-20': 0, '2025-10-27': 0, '2025-11-03': 0, '2025-11-10': 0 }
            }
        ]
    },
    {
        id: 3,
        name: 'Mike Chen',
        role: 'DevOps Engineer',
        weeklyCapacity: 40,
        isExpanded: true,
        assignments: []
    },
    {
        id: 4,
        name: 'Emma Rodriguez',
        role: 'Product Manager',
        weeklyCapacity: 38,
        isExpanded: false,
        assignments: [
            {
                id: 6,
                projectName: 'Product Strategy',
                weeklyHours: { '2025-08-25': 20, '2025-09-01': 20, '2025-09-08': 20, '2025-09-15': 20, '2025-09-22': 20, '2025-09-29': 20, '2025-10-06': 20, '2025-10-13': 20, '2025-10-20': 20, '2025-10-27': 20, '2025-11-03': 20, '2025-11-10': 20 }
            },
            {
                id: 7,
                projectName: 'Market Research',
                weeklyHours: { '2025-08-25': 10, '2025-09-01': 15, '2025-09-08': 12, '2025-09-15': 8, '2025-09-22': 6, '2025-09-29': 4, '2025-10-06': 0, '2025-10-13': 0, '2025-10-20': 0, '2025-10-27': 0, '2025-11-03': 0, '2025-11-10': 0 }
            }
        ]
    },
    {
        id: 5,
        name: 'James Wilson',
        role: 'Backend Developer',
        weeklyCapacity: 40,
        isExpanded: true,
        assignments: [
            {
                id: 8,
                projectName: 'Database Migration',
                weeklyHours: { '2025-08-25': 35, '2025-09-01': 30, '2025-09-08': 25, '2025-09-15': 20, '2025-09-22': 15, '2025-09-29': 10, '2025-10-06': 5, '2025-10-13': 0, '2025-10-20': 0, '2025-10-27': 0, '2025-11-03': 0, '2025-11-10': 0 }
            }
        ]
    }
];
// Get next 12 Monday dates
const getNext12Mondays = () => {
    const today = new Date();
    const currentMonday = new Date(today);
    // Get this Monday (or today if it's Monday)
    const daysFromMonday = (today.getDay() + 6) % 7; // Convert Sunday=0 to Sunday=6
    currentMonday.setDate(today.getDate() - daysFromMonday);
    const mondays = [];
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
const AssignmentGridMockup = () => {
    const [people, setPeople] = useState(mockPeople);
    const [editingCell, setEditingCell] = useState(null);
    const [selectedCell, setSelectedCell] = useState(null);
    const [selectedCells, setSelectedCells] = useState([]);
    const [selectionStart, setSelectionStart] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [hoveredRow, setHoveredRow] = useState(null);
    const [editingValue, setEditingValue] = useState('');
    const weeks = getNext12Mondays();
    // Function to update hour values
    const updateAssignmentHours = (personId, assignmentId, week, hours) => {
        setPeople(prevPeople => prevPeople.map(person => person.id === personId
            ? {
                ...person,
                assignments: person.assignments.map(assignment => assignment.id === assignmentId
                    ? {
                        ...assignment,
                        weeklyHours: {
                            ...assignment.weeklyHours,
                            [week]: Math.max(0, hours) // Ensure non-negative
                        }
                    }
                    : assignment)
            }
            : person));
    };
    // Function to update multiple cells at once
    const updateMultipleCells = (cells, hours) => {
        setPeople(prevPeople => {
            let updatedPeople = [...prevPeople];
            cells.forEach(cell => {
                updatedPeople = updatedPeople.map(person => person.id === cell.personId
                    ? {
                        ...person,
                        assignments: person.assignments.map(assignment => assignment.id === cell.assignmentId
                            ? {
                                ...assignment,
                                weeklyHours: {
                                    ...assignment.weeklyHours,
                                    [cell.week]: Math.max(0, hours)
                                }
                            }
                            : assignment)
                    }
                    : person);
            });
            return updatedPeople;
        });
    };
    // Function to check if a cell is selected
    const isCellSelected = (personId, assignmentId, week) => {
        return selectedCells.some(cell => cell.personId === personId && cell.assignmentId === assignmentId && cell.week === week);
    };
    // Function to get cells in the same row (assignment) between two weeks
    const getCellsBetween = (start, end) => {
        // Only select within the same assignment row
        if (start.personId !== end.personId || start.assignmentId !== end.assignmentId) {
            return [start];
        }
        const startWeekIndex = weeks.findIndex(w => w.date === start.week);
        const endWeekIndex = weeks.findIndex(w => w.date === end.week);
        if (startWeekIndex === -1 || endWeekIndex === -1)
            return [start];
        const minIndex = Math.min(startWeekIndex, endWeekIndex);
        const maxIndex = Math.max(startWeekIndex, endWeekIndex);
        const cells = [];
        for (let i = minIndex; i <= maxIndex; i++) {
            cells.push({
                personId: start.personId,
                assignmentId: start.assignmentId,
                week: weeks[i].date
            });
        }
        return cells;
    };
    // Function to extend selection with shift+arrow
    const extendSelection = (direction) => {
        if (!selectedCell)
            return;
        const currentWeekIndex = weeks.findIndex(w => w.date === selectedCell.week);
        let newWeekIndex = currentWeekIndex;
        if (direction === 'right' && currentWeekIndex < weeks.length - 1) {
            newWeekIndex = currentWeekIndex + 1;
        }
        else if (direction === 'left' && currentWeekIndex > 0) {
            newWeekIndex = currentWeekIndex - 1;
        }
        if (newWeekIndex !== currentWeekIndex) {
            const newCell = {
                personId: selectedCell.personId,
                assignmentId: selectedCell.assignmentId,
                week: weeks[newWeekIndex].date
            };
            // If this is the first shift selection, start from current cell
            const startCell = selectionStart || selectedCell;
            const cellsBetween = getCellsBetween(startCell, newCell);
            setSelectionStart(startCell);
            setSelectedCells(cellsBetween);
            setSelectedCell(newCell);
        }
    };
    const togglePersonExpanded = (personId) => {
        setPeople(prev => prev.map(person => person.id === personId
            ? { ...person, isExpanded: !person.isExpanded }
            : person));
    };
    const getPersonTotalHours = (person, week) => {
        return person.assignments.reduce((total, assignment) => total + (assignment.weeklyHours[week] || 0), 0);
    };
    const getUtilizationBadgeStyle = (hours, capacity) => {
        if (hours === 0)
            return 'bg-slate-600 text-slate-400';
        const percentage = (hours / capacity) * 100;
        if (percentage <= 70)
            return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        if (percentage <= 85)
            return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
        if (percentage <= 100)
            return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
        return 'bg-red-500/20 text-red-300 border border-red-500/30';
    };
    const getHourCellStyle = (hours, capacity, isSelected = false, isMultiSelected = false) => {
        let baseStyle = '';
        if (hours === 0)
            baseStyle = 'text-slate-500 hover:text-slate-300';
        else {
            const percentage = (hours / capacity) * 100;
            baseStyle = percentage <= 100 ? 'text-slate-200 font-medium' : 'text-red-400 font-medium';
        }
        if (isMultiSelected) {
            baseStyle += ' ring-2 ring-purple-400 bg-purple-500/30';
        }
        else if (isSelected) {
            baseStyle += ' ring-2 ring-blue-400 bg-blue-500/20';
        }
        return baseStyle;
    };
    // Get all editable cells in order for keyboard navigation
    const getAllEditableCells = () => {
        const cells = [];
        people.forEach(person => {
            if (person.isExpanded) {
                person.assignments.forEach(assignment => {
                    weeks.forEach(week => {
                        cells.push({ personId: person.id, assignmentId: assignment.id, week: week.date });
                    });
                });
            }
        });
        return cells;
    };
    // Navigate to next/previous cell
    const navigateCell = (direction) => {
        if (!selectedCell)
            return;
        const currentWeekIndex = weeks.findIndex(w => w.date === selectedCell.week);
        let newCell = null;
        switch (direction) {
            case 'right':
                // Move to next week in same assignment
                if (currentWeekIndex < weeks.length - 1) {
                    newCell = {
                        personId: selectedCell.personId,
                        assignmentId: selectedCell.assignmentId,
                        week: weeks[currentWeekIndex + 1].date
                    };
                }
                break;
            case 'left':
                // Move to previous week in same assignment
                if (currentWeekIndex > 0) {
                    newCell = {
                        personId: selectedCell.personId,
                        assignmentId: selectedCell.assignmentId,
                        week: weeks[currentWeekIndex - 1].date
                    };
                }
                break;
            case 'down':
                // Move to same week column, next assignment
                const currentPerson = people.find(p => p.id === selectedCell.personId);
                if (currentPerson && currentPerson.isExpanded) {
                    const currentAssignmentIndex = currentPerson.assignments.findIndex(a => a.id === selectedCell.assignmentId);
                    if (currentAssignmentIndex < currentPerson.assignments.length - 1) {
                        // Next assignment in same person
                        newCell = {
                            personId: selectedCell.personId,
                            assignmentId: currentPerson.assignments[currentAssignmentIndex + 1].id,
                            week: selectedCell.week
                        };
                    }
                    else {
                        // Next person's first assignment
                        const currentPersonIndex = people.findIndex(p => p.id === selectedCell.personId);
                        for (let i = currentPersonIndex + 1; i < people.length; i++) {
                            if (people[i].isExpanded && people[i].assignments.length > 0) {
                                newCell = {
                                    personId: people[i].id,
                                    assignmentId: people[i].assignments[0].id,
                                    week: selectedCell.week
                                };
                                break;
                            }
                        }
                    }
                }
                break;
            case 'up':
                // Move to same week column, previous assignment
                const currentPersonUp = people.find(p => p.id === selectedCell.personId);
                if (currentPersonUp && currentPersonUp.isExpanded) {
                    const currentAssignmentIndexUp = currentPersonUp.assignments.findIndex(a => a.id === selectedCell.assignmentId);
                    if (currentAssignmentIndexUp > 0) {
                        // Previous assignment in same person
                        newCell = {
                            personId: selectedCell.personId,
                            assignmentId: currentPersonUp.assignments[currentAssignmentIndexUp - 1].id,
                            week: selectedCell.week
                        };
                    }
                    else {
                        // Previous person's last assignment
                        const currentPersonIndexUp = people.findIndex(p => p.id === selectedCell.personId);
                        for (let i = currentPersonIndexUp - 1; i >= 0; i--) {
                            if (people[i].isExpanded && people[i].assignments.length > 0) {
                                newCell = {
                                    personId: people[i].id,
                                    assignmentId: people[i].assignments[people[i].assignments.length - 1].id,
                                    week: selectedCell.week
                                };
                                break;
                            }
                        }
                    }
                }
                break;
        }
        // Verify the new cell exists before setting it
        if (newCell) {
            const targetPerson = people.find(p => p.id === newCell.personId);
            const targetAssignment = targetPerson?.assignments.find(a => a.id === newCell.assignmentId);
            if (targetPerson?.isExpanded && targetAssignment) {
                setSelectedCell(newCell);
            }
        }
    };
    // Get next cell in tab order (left to right, top to bottom)
    const getNextCell = (currentCell) => {
        const allCells = getAllEditableCells();
        const currentIndex = allCells.findIndex(cell => cell.personId === currentCell.personId &&
            cell.assignmentId === currentCell.assignmentId &&
            cell.week === currentCell.week);
        if (currentIndex >= 0 && currentIndex < allCells.length - 1) {
            return allCells[currentIndex + 1];
        }
        return null;
    };
    // Get previous cell in tab order
    const getPrevCell = (currentCell) => {
        const allCells = getAllEditableCells();
        const currentIndex = allCells.findIndex(cell => cell.personId === currentCell.personId &&
            cell.assignmentId === currentCell.assignmentId &&
            cell.week === currentCell.week);
        if (currentIndex > 0) {
            return allCells[currentIndex - 1];
        }
        return null;
    };
    // Handle keyboard events
    const handleKeyDown = (e) => {
        // Allow Shift+Arrow even when editing to start multi-selection
        const isShiftArrow = e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
        if (editingCell && !isShiftArrow)
            return; // Don't interfere when editing, except for Shift+Arrow
        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault();
                if (e.shiftKey) {
                    // If we're editing, save the value and exit edit mode first
                    if (editingCell) {
                        const numValue = parseFloat(editingValue) || 0;
                        updateAssignmentHours(editingCell.personId, editingCell.assignmentId, editingCell.week, numValue);
                        setEditingCell(null);
                        // Set the cell we were editing as selected
                        if (!selectedCell) {
                            setSelectedCell(editingCell);
                        }
                    }
                    extendSelection('right');
                }
                else {
                    // Clear multi-selection when navigating normally
                    setSelectedCells([]);
                    setSelectionStart(null);
                    navigateCell('right');
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (e.shiftKey) {
                    // If we're editing, save the value and exit edit mode first
                    if (editingCell) {
                        const numValue = parseFloat(editingValue) || 0;
                        updateAssignmentHours(editingCell.personId, editingCell.assignmentId, editingCell.week, numValue);
                        setEditingCell(null);
                        // Set the cell we were editing as selected
                        if (!selectedCell) {
                            setSelectedCell(editingCell);
                        }
                    }
                    extendSelection('left');
                }
                else {
                    // Clear multi-selection when navigating normally
                    setSelectedCells([]);
                    setSelectionStart(null);
                    navigateCell('left');
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                // Clear multi-selection when navigating vertically
                setSelectedCells([]);
                setSelectionStart(null);
                navigateCell('down');
                break;
            case 'ArrowUp':
                e.preventDefault();
                // Clear multi-selection when navigating vertically
                setSelectedCells([]);
                setSelectionStart(null);
                navigateCell('up');
                break;
            case 'Tab':
                e.preventDefault();
                // Clear multi-selection when tabbing
                setSelectedCells([]);
                setSelectionStart(null);
                if (selectedCell) {
                    const nextCell = e.shiftKey ? getPrevCell(selectedCell) : getNextCell(selectedCell);
                    if (nextCell) {
                        setSelectedCell(nextCell);
                    }
                }
                break;
            case 'Enter':
            case ' ':
                if (selectedCell) {
                    e.preventDefault();
                    if (selectedCells.length > 0) {
                        // Multi-cell editing mode
                        setEditingValue('');
                        setEditingCell(selectedCell);
                    }
                    else {
                        // Single cell editing - get current value to initialize editing
                        const currentPerson = people.find(p => p.id === selectedCell.personId);
                        const currentAssignment = currentPerson?.assignments.find(a => a.id === selectedCell.assignmentId);
                        const currentHours = currentAssignment?.weeklyHours[selectedCell.week] || 0;
                        setEditingValue(currentHours.toString());
                        setEditingCell(selectedCell);
                    }
                }
                break;
            default:
                // If it's a number or decimal, start editing immediately
                if (/^[0-9.]$/.test(e.key) && selectedCell) {
                    e.preventDefault();
                    // Start with the typed character
                    setEditingValue(e.key);
                    setEditingCell(selectedCell);
                }
                break;
        }
    };
    // Auto-select first cell on component mount
    React.useEffect(() => {
        const allCells = getAllEditableCells();
        if (allCells.length > 0 && !selectedCell) {
            setSelectedCell(allCells[0]);
        }
    }, [people]);
    // Focus management and mouse handling
    React.useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            // Don't handle global events if we're editing - let the input handle it
            if (editingCell)
                return;
            // Convert to React.KeyboardEvent-like object
            const reactEvent = {
                key: e.key,
                shiftKey: e.shiftKey,
                preventDefault: () => e.preventDefault()
            };
            handleKeyDown(reactEvent);
        };
        const handleGlobalMouseUp = () => {
            if (isDragging) {
                setIsDragging(false);
            }
        };
        document.addEventListener('keydown', handleGlobalKeyDown);
        document.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            document.removeEventListener('keydown', handleGlobalKeyDown);
            document.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [selectedCell, editingCell, isDragging]);
    return (_jsxs("div", { className: "space-y-4", tabIndex: 0, onKeyDown: handleKeyDown, children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-slate-50", children: "Assignment Grid v2" }), _jsx("p", { className: "text-slate-400 text-sm", children: "Compact, scalable workload planning interface \u2022 Use arrow keys to navigate" })] }), _jsxs("div", { className: "text-xs text-slate-400", children: [people.length, " people \u2022 ", people.reduce((total, p) => total + p.assignments.length, 0), " assignments"] })] }), _jsx(Card, { className: "bg-slate-900 border-slate-700 overflow-hidden", children: _jsx("div", { className: "overflow-x-auto", children: _jsxs("div", { className: "min-w-[1400px]", children: [_jsx("div", { className: "sticky top-0 bg-slate-800 border-b border-slate-600 z-10", children: _jsxs("div", { className: "grid grid-cols-[280px_repeat(12,70px)_80px] gap-px p-2", children: [_jsx("div", { className: "font-medium text-slate-200 text-sm px-2 py-1", children: "Team Member" }), weeks.map((week, index) => (_jsxs("div", { className: "text-center px-1", children: [_jsx("div", { className: "text-xs font-medium text-slate-200", children: week.display }), _jsxs("div", { className: "text-[10px] text-slate-500", children: ["W", index + 1] })] }, week.date))), _jsx("div", { className: "text-center text-xs text-slate-400 px-2", children: "Actions" })] }) }), _jsx("div", { children: people.map((person) => (_jsxs("div", { className: "border-b border-slate-700 last:border-b-0", children: [_jsxs("div", { className: "grid grid-cols-[280px_repeat(12,70px)_80px] gap-px p-2 hover:bg-slate-800/50 transition-colors", onMouseEnter: () => setHoveredRow({ type: 'person', id: person.id }), onMouseLeave: () => setHoveredRow(null), children: [_jsxs("div", { className: "flex items-center gap-2 pl-3 pr-2 py-1", children: [_jsx("button", { onClick: () => togglePersonExpanded(person.id), className: "flex-shrink-0 w-5 h-5 flex items-center justify-center hover:bg-slate-600 rounded text-slate-400 hover:text-slate-200 transition-all duration-200", children: _jsx("svg", { width: "12", height: "12", viewBox: "0 0 12 12", className: `transition-transform duration-200 ${person.isExpanded ? 'rotate-90' : 'rotate-0'}`, children: _jsx("path", { d: "M4 2 L8 6 L4 10", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "font-medium text-slate-50 text-sm truncate", children: person.name }), _jsxs("div", { className: "text-xs text-slate-400", children: [person.role, " \u2022 ", person.weeklyCapacity, "h/wk"] })] })] }), weeks.map((week) => {
                                                    const totalHours = getPersonTotalHours(person, week.date);
                                                    const percentage = Math.round((totalHours / person.weeklyCapacity) * 100);
                                                    return (_jsx("div", { className: "flex items-center justify-center px-1", children: _jsx("div", { className: `px-2 py-1 rounded-full text-xs font-medium min-w-[40px] text-center ${getUtilizationBadgeStyle(totalHours, person.weeklyCapacity)}`, children: totalHours > 0 ? `${totalHours}h` : '—' }) }, week.date));
                                                }), _jsx("div", { className: "flex items-center justify-center", children: _jsx("button", { className: "w-7 h-7 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors flex items-center justify-center", title: "Add new assignment", children: "+" }) })] }), person.isExpanded && person.assignments.map((assignment) => (_jsxs("div", { className: "grid grid-cols-[280px_repeat(12,70px)_80px] gap-px p-1 bg-slate-850 hover:bg-slate-800 transition-colors", onMouseEnter: () => setHoveredRow({ type: 'assignment', id: assignment.id }), onMouseLeave: () => setHoveredRow(null), children: [_jsx("div", { className: "flex items-center py-1 pl-[60px] pr-2", children: _jsx("div", { className: "min-w-0 flex-1", children: _jsx("div", { className: "text-slate-300 text-xs truncate", children: assignment.projectName }) }) }), weeks.map((week) => {
                                                    const hours = assignment.weeklyHours[week.date] || 0;
                                                    const isEditing = editingCell?.personId === person.id &&
                                                        editingCell?.assignmentId === assignment.id &&
                                                        editingCell?.week === week.date;
                                                    const isSelected = selectedCell?.personId === person.id &&
                                                        selectedCell?.assignmentId === assignment.id &&
                                                        selectedCell?.week === week.date;
                                                    const isMultiSelected = isCellSelected(person.id, assignment.id, week.date);
                                                    return (_jsx("div", { className: "flex items-center justify-center px-1", children: isEditing ? (_jsx("input", { type: "number", min: "0", step: "0.5", value: editingValue, onChange: (e) => setEditingValue(e.target.value), className: "w-12 h-6 text-xs rounded border bg-slate-700 border-slate-500 text-slate-50 text-center focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none", onBlur: () => {
                                                                // Save the value when losing focus
                                                                const numValue = parseFloat(editingValue) || 0;
                                                                updateAssignmentHours(person.id, assignment.id, week.date, numValue);
                                                                setEditingCell(null);
                                                                setSelectedCell({ personId: person.id, assignmentId: assignment.id, week: week.date });
                                                            }, onKeyDown: (e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    e.stopPropagation(); // Prevent global handler interference
                                                                    const numValue = parseFloat(editingValue) || 0;
                                                                    if (selectedCells.length > 0) {
                                                                        // Multi-cell editing - update all selected cells
                                                                        updateMultipleCells(selectedCells, numValue);
                                                                        // Clear multi-selection after bulk edit
                                                                        setSelectedCells([]);
                                                                        setSelectionStart(null);
                                                                        setEditingCell(null);
                                                                        // Keep current cell selected
                                                                        setSelectedCell({ personId: person.id, assignmentId: assignment.id, week: week.date });
                                                                    }
                                                                    else {
                                                                        // Single cell editing - save and move to next cell
                                                                        updateAssignmentHours(person.id, assignment.id, week.date, numValue);
                                                                        setEditingCell(null);
                                                                        const currentCell = { personId: person.id, assignmentId: assignment.id, week: week.date };
                                                                        const nextCell = getNextCell(currentCell);
                                                                        if (nextCell) {
                                                                            setSelectedCell(nextCell);
                                                                        }
                                                                        else {
                                                                            setSelectedCell(currentCell);
                                                                        }
                                                                    }
                                                                }
                                                                else if (e.key === 'Escape') {
                                                                    e.preventDefault();
                                                                    // Cancel edit, keep cell selected
                                                                    setEditingCell(null);
                                                                    setSelectedCell({ personId: person.id, assignmentId: assignment.id, week: week.date });
                                                                }
                                                                else if (e.key === 'Tab') {
                                                                    e.preventDefault();
                                                                    e.stopPropagation(); // Prevent the global tab handler from also firing
                                                                    // Save current edit and move to next cell
                                                                    const numValue = parseFloat(editingValue) || 0;
                                                                    updateAssignmentHours(person.id, assignment.id, week.date, numValue);
                                                                    setEditingCell(null);
                                                                    const currentCell = { personId: person.id, assignmentId: assignment.id, week: week.date };
                                                                    const nextCell = e.shiftKey ? getPrevCell(currentCell) : getNextCell(currentCell);
                                                                    if (nextCell) {
                                                                        setSelectedCell(nextCell);
                                                                    }
                                                                }
                                                            }, autoFocus: true, onFocus: (e) => e.target.select() })) : (_jsx("button", { onMouseDown: (e) => {
                                                                e.preventDefault();
                                                                const cell = { personId: person.id, assignmentId: assignment.id, week: week.date };
                                                                setSelectedCell(cell);
                                                                setSelectionStart(cell);
                                                                setSelectedCells([cell]);
                                                                setIsDragging(true);
                                                            }, onMouseEnter: () => {
                                                                if (isDragging && selectionStart) {
                                                                    const endCell = { personId: person.id, assignmentId: assignment.id, week: week.date };
                                                                    const cellsBetween = getCellsBetween(selectionStart, endCell);
                                                                    setSelectedCells(cellsBetween);
                                                                    setSelectedCell(endCell);
                                                                }
                                                            }, onMouseUp: () => {
                                                                if (isDragging) {
                                                                    setIsDragging(false);
                                                                    // If only one cell selected, switch to editing mode
                                                                    if (selectedCells.length === 1) {
                                                                        setSelectedCells([]);
                                                                        setSelectionStart(null);
                                                                        setEditingCell({ personId: person.id, assignmentId: assignment.id, week: week.date });
                                                                        setEditingValue(hours.toString());
                                                                    }
                                                                }
                                                            }, className: `w-12 h-6 text-xs rounded transition-all hover:bg-slate-600 ${getHourCellStyle(hours, person.weeklyCapacity, isSelected, isMultiSelected)} select-none`, title: selectedCells.length > 1
                                                                ? `${selectedCells.length} cells selected • Type number and press Enter to bulk edit`
                                                                : `${hours}h for ${week.fullDisplay} • Shift+arrows or drag to select • Type to edit`, tabIndex: -1, children: hours > 0 ? hours : '—' })) }, week.date));
                                                }), _jsx("div", { className: "flex items-center justify-center", children: _jsx("button", { className: "w-6 h-6 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-center text-xs", title: "Remove assignment", children: "\u00D7" }) })] }, assignment.id))), person.isExpanded && person.assignments.length === 0 && (_jsxs("div", { className: "grid grid-cols-[280px_repeat(12,70px)_80px] gap-px p-1 bg-slate-850", children: [_jsx("div", { className: "flex items-center py-1 pl-[60px] pr-2", children: _jsx("div", { className: "text-slate-500 text-xs italic", children: "No assignments" }) }), weeks.map((week) => (_jsx("div", { className: "flex items-center justify-center", children: _jsx("div", { className: "w-12 h-6 flex items-center justify-center text-slate-600 text-xs", children: "\u2014" }) }, week.date))), _jsx("div", {})] }))] }, person.id))) })] }) }) }), _jsxs("div", { className: "flex justify-between items-center text-xs text-slate-400 px-1", children: [_jsxs("div", { className: "flex gap-6", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 rounded-full bg-emerald-500" }), _jsx("span", { children: "Available (\u226470%)" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 rounded-full bg-blue-500" }), _jsx("span", { children: "Busy (71-85%)" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 rounded-full bg-amber-500" }), _jsx("span", { children: "Full (86-100%)" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 rounded-full bg-red-500" }), _jsx("span", { children: "Overallocated (>100%)" })] })] }), _jsx("div", { children: "Arrow keys to navigate \u2022 Shift+arrows or drag to select multiple \u2022 Tab/Enter to save \u2022 Type numbers for bulk edit \u2022 + to add \u2022 \u00D7 to remove" })] })] }));
};
export default AssignmentGridMockup;
