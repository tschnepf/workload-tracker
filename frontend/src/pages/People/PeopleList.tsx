/**
 * People List - Split-panel layout following ProjectsList.tsx pattern
 * Left panel: People list with filtering
 * Right panel: Person details with skills management
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Person, PersonSkill, SkillTag } from '@/types/models';
import { peopleApi, personSkillsApi, skillTagsApi } from '@/services/api';
import Sidebar from '@/components/layout/Sidebar';
import SkillsAutocomplete from '@/components/skills/SkillsAutocomplete';

const PeopleList: React.FC = () => {
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Person skills data
  const [personSkills, setPersonSkills] = useState<PersonSkill[]>([]);
  const [editingSkills, setEditingSkills] = useState(false);
  const [editingProficiency, setEditingProficiency] = useState<string | null>(null); // skillTagName-skillType key
  const [skillsData, setSkillsData] = useState({
    strengths: [] as PersonSkill[],
    development: [] as PersonSkill[],
    learning: [] as PersonSkill[]
  });

  const proficiencyLevels = [
    { value: 'beginner', label: 'Beginner' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'advanced', label: 'Advanced' },
    { value: 'expert', label: 'Expert' }
  ];

  useEffect(() => {
    loadPeople();
  }, []);

  useEffect(() => {
    if (selectedPerson?.id) {
      loadPersonSkills(selectedPerson.id);
    }
  }, [selectedPerson]);

  // Close proficiency dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editingProficiency) {
        const target = event.target as HTMLElement;
        if (!target.closest('.proficiency-dropdown')) {
          setEditingProficiency(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editingProficiency]);

  const loadPeople = async () => {
    try {
      setLoading(true);
      const response = await peopleApi.list();
      const peopleList = response.results || [];
      setPeople(peopleList);
      
      // Auto-select first person if none selected
      if (peopleList.length > 0 && !selectedPerson) {
        setSelectedPerson(peopleList[0]);
        setSelectedIndex(0);
      }
    } catch (err: any) {
      setError('Failed to load people');
    } finally {
      setLoading(false);
    }
  };

  const loadPersonSkills = async (personId: number) => {
    try {
      const response = await personSkillsApi.list({ person: personId });
      const skills = response.results || [];
      setPersonSkills(skills);
      
      // Group skills by type
      const grouped = {
        strengths: skills.filter(skill => skill.skillType === 'strength'),
        development: skills.filter(skill => skill.skillType === 'development'),
        learning: skills.filter(skill => skill.skillType === 'learning')
      };
      setSkillsData(grouped);
    } catch (err: any) {
      console.error('Failed to load person skills:', err);
    }
  };

  const handlePersonClick = (person: Person, index: number) => {
    setSelectedPerson(person);
    setSelectedIndex(index);
  };

  const handleSkillsEdit = () => {
    setEditingSkills(true);
  };

  const handleSkillsSave = async () => {
    if (!selectedPerson?.id) return;

    try {
      // Get all current skills for this person
      const currentSkills = [...skillsData.strengths, ...skillsData.development, ...skillsData.learning];
      
      console.log('All skills to save:', currentSkills);
      console.log('Skills by type:', {
        strengths: skillsData.strengths,
        development: skillsData.development,
        learning: skillsData.learning
      });
      
      // Delete all existing skills for this person
      for (const skill of personSkills) {
        if (skill.id) {
          await personSkillsApi.delete(skill.id);
        }
      }
      
      // Create new skills
      for (const skill of currentSkills) {
        // Skip skills with invalid skillTagId
        if (!skill.skillTagId) {
          console.error('Skipping skill with missing skillTagId:', skill);
          continue;
        }
        
        const skillData = {
          person: selectedPerson.id,
          skillTagId: skill.skillTagId,
          skillType: skill.skillType,
          proficiencyLevel: skill.proficiencyLevel || 'beginner',
          notes: skill.notes || ''
        };
        
        console.log('Creating skill:', skillData);
        
        await personSkillsApi.create(skillData);
      }
      
      // Reload person skills
      await loadPersonSkills(selectedPerson.id);
      setEditingSkills(false);
    } catch (err: any) {
      setError('Failed to update skills');
    }
  };

  const handleSkillsCancel = () => {
    // Reset to original data
    if (selectedPerson?.id) {
      loadPersonSkills(selectedPerson.id);
    }
    setEditingSkills(false);
  };

  const updateSkillsByType = (skillType: 'strengths' | 'development' | 'learning', skills: PersonSkill[]) => {
    setSkillsData(prev => ({
      ...prev,
      [skillType]: skills
    }));
  };

  const handleProficiencyClick = (skill: PersonSkill, skillType: string) => {
    if (editingSkills) return; // Only allow proficiency editing when NOT in skills edit mode
    const key = `${skill.skillTagName}-${skillType}`;
    setEditingProficiency(editingProficiency === key ? null : key);
  };

  const handleProficiencyChange = async (skill: PersonSkill, skillType: 'strengths' | 'development' | 'learning', newProficiency: string) => {
    if (!selectedPerson?.id) return;

    try {
      // Find the actual PersonSkill record to update
      const apiSkillType = skillType === 'strengths' ? 'strength' : skillType.slice(0, -1); // Map to API format
      const skillToUpdate = personSkills.find(s => 
        s.skillTagName === skill.skillTagName && s.skillType === apiSkillType
      );

      if (skillToUpdate?.id) {
        // Update in database immediately
        await personSkillsApi.update(skillToUpdate.id, {
          proficiencyLevel: newProficiency
        });

        // Update local state
        const updatedSkills = skillsData[skillType].map(s => 
          s.skillTagName === skill.skillTagName 
            ? { ...s, proficiencyLevel: newProficiency }
            : s
        );
        
        updateSkillsByType(skillType, updatedSkills);
        
        // Also update the main personSkills array
        const updatedPersonSkills = personSkills.map(s => 
          s.id === skillToUpdate.id 
            ? { ...s, proficiencyLevel: newProficiency }
            : s
        );
        setPersonSkills(updatedPersonSkills);
      }
    } catch (error) {
      console.error('Failed to update proficiency level:', error);
      setError('Failed to update skill proficiency');
    }
    
    setEditingProficiency(null);
  };

  // Filter people
  const filteredPeople = people.filter(person =>
    !searchTerm || 
    person.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    person.role?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Auto-select first person from filtered list
  useEffect(() => {
    if (filteredPeople.length > 0 && !selectedPerson) {
      setSelectedPerson(filteredPeople[0]);
      setSelectedIndex(0);
    }
  }, [filteredPeople, selectedPerson]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center">
        <div className="text-[#969696]">Loading people...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex">
      <Sidebar />
      <div className="flex-1 flex h-screen bg-[#1e1e1e]">
        
        {/* Left Panel - People List */}
        <div className="w-1/2 border-r border-[#3e3e42] flex flex-col min-w-0">
          
          {/* Header */}
          <div className="p-3 border-b border-[#3e3e42]">
            <div className="flex justify-between items-center mb-2">
              <h1 className="text-lg font-semibold text-[#cccccc]">People</h1>
              <Link to="/people/new">
                <button className="px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors">
                  + New
                </button>
              </Link>
            </div>

            {/* Search */}
            <div>
              <input
                type="text"
                placeholder="Search people"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none"
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/20 border-b border-red-500/50">
              <div className="text-red-400 text-sm">{error}</div>
            </div>
          )}

          {/* People List */}
          <div className="flex-1 overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-2 py-1.5 text-xs text-[#969696] font-medium border-b border-[#3e3e42] bg-[#2d2d30]">
              <div className="col-span-4">NAME</div>
              <div className="col-span-3">ROLE</div>
              <div className="col-span-2">CAPACITY</div>
              <div className="col-span-3">TOP SKILLS</div>
            </div>

            {/* Table Body */}
            <div className="overflow-y-auto h-full">
              {filteredPeople.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center text-[#969696]">
                    <div className="text-lg mb-2">No people found</div>
                    <div className="text-sm">Try adjusting your search or create a new person</div>
                  </div>
                </div>
              ) : (
                filteredPeople.map((person, index) => (
                  <div
                    key={person.id}
                    onClick={() => handlePersonClick(person, index)}
                    className={`grid grid-cols-12 gap-2 px-2 py-1.5 text-sm border-b border-[#3e3e42] cursor-pointer hover:bg-[#3e3e42]/50 transition-colors focus:outline-none ${
                      selectedPerson?.id === person.id ? 'bg-[#007acc]/20 border-[#007acc]' : ''
                    }`}
                    tabIndex={0}
                  >
                    {/* Name */}
                    <div className="col-span-4 text-[#cccccc] font-medium">
                      {person.name}
                    </div>
                    
                    {/* Role */}
                    <div className="col-span-3 text-[#969696] text-xs">
                      {person.role || 'No Role'}
                    </div>
                    
                    {/* Capacity */}
                    <div className="col-span-2 text-[#969696] text-xs">
                      {person.weeklyCapacity || 36}h/week
                    </div>
                    
                    {/* Top Skills Preview */}
                    <div className="col-span-3 flex flex-wrap gap-1">
                      {/* This will be populated when we load skills */}
                      <span className="text-[#969696] text-xs">Skills...</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Person Details */}
        <div className="w-1/2 flex flex-col bg-[#2d2d30] min-w-0">
          {selectedPerson ? (
            <>
              {/* Person Header */}
              <div className="p-4 border-b border-[#3e3e42]">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h2 className="text-xl font-bold text-[#cccccc] mb-2">
                      {selectedPerson.name}
                    </h2>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-[#969696] text-xs">Role:</div>
                        <div className="text-[#cccccc]">{selectedPerson.role || 'No Role'}</div>
                      </div>
                      <div>
                        <div className="text-[#969696] text-xs">Weekly Capacity:</div>
                        <div className="text-[#cccccc]">{selectedPerson.weeklyCapacity || 36}h</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/people/${selectedPerson.id}/edit`}>
                      <button className="px-2 py-0.5 text-xs rounded border bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] hover:text-[#cccccc] transition-colors">
                        Edit Person
                      </button>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Skills Section */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-[#cccccc]">Skills & Expertise</h3>
                  <div className="flex gap-2">
                    {editingSkills ? (
                      <>
                        <button 
                          onClick={handleSkillsSave}
                          className="px-2 py-0.5 text-xs rounded border bg-[#007acc] border-[#007acc] text-white hover:bg-[#005fa3] transition-colors"
                        >
                          Save Skills
                        </button>
                        <button 
                          onClick={handleSkillsCancel}
                          className="px-2 py-0.5 text-xs rounded border bg-transparent border-[#3e3e42] text-[#969696] hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button 
                        onClick={handleSkillsEdit}
                        className="px-2 py-0.5 text-xs rounded border bg-[#007acc] border-[#007acc] text-white hover:bg-[#005fa3] transition-colors"
                      >
                        Edit Skills
                      </button>
                    )}
                  </div>
                </div>

                {/* Strengths */}
                <div className="bg-[#3e3e42]/50 p-4 rounded-lg border border-[#3e3e42]">
                  <h4 className="text-sm font-medium text-[#cccccc] mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                    Strengths
                  </h4>
                  {editingSkills ? (
                    <SkillsAutocomplete
                      selectedSkills={skillsData.strengths}
                      onSkillsChange={(skills) => updateSkillsByType('strengths', skills)}
                      skillType="strength"
                      placeholder="Add strengths..."
                      className="w-full px-3 py-2 text-sm bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none"
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {skillsData.strengths.map((skill, index) => {
                        const proficiencyKey = `${skill.skillTagName}-strengths`;
                        const isEditingThisProficiency = editingProficiency === proficiencyKey;
                        
                        return (
                          <div key={index} className="relative">
                            <span className="px-3 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              {skill.skillTagName}
                              <span 
                                className={`ml-1 opacity-75 ${!editingSkills ? 'cursor-pointer hover:opacity-100 hover:underline' : ''}`}
                                onClick={() => handleProficiencyClick(skill, 'strengths')}
                              >
                                ({skill.proficiencyLevel})
                              </span>
                            </span>
                            
                            {/* Proficiency Dropdown */}
                            {isEditingThisProficiency && !editingSkills && (
                              <div className="proficiency-dropdown absolute top-full left-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 min-w-32">
                                {proficiencyLevels.map((level) => (
                                  <button
                                    key={level.value}
                                    onClick={() => handleProficiencyChange(skill, 'strengths', level.value)}
                                    className={`w-full text-left px-3 py-1 text-xs hover:bg-[#3e3e42] transition-colors border-b border-[#3e3e42] last:border-b-0 ${
                                      skill.proficiencyLevel === level.value 
                                        ? 'bg-emerald-500/20 text-emerald-400' 
                                        : 'text-[#cccccc]'
                                    }`}
                                  >
                                    {level.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {skillsData.strengths.length === 0 && (
                        <span className="text-[#969696] text-sm">No strengths listed</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Development Areas */}
                <div className="bg-[#3e3e42]/50 p-4 rounded-lg border border-[#3e3e42]">
                  <h4 className="text-sm font-medium text-[#cccccc] mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                    Areas for Improvement
                  </h4>
                  {editingSkills ? (
                    <SkillsAutocomplete
                      selectedSkills={skillsData.development}
                      onSkillsChange={(skills) => updateSkillsByType('development', skills)}
                      skillType="development"
                      placeholder="Add development areas..."
                      className="w-full px-3 py-2 text-sm bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none"
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {skillsData.development.map((skill, index) => {
                        const proficiencyKey = `${skill.skillTagName}-development`;
                        const isEditingThisProficiency = editingProficiency === proficiencyKey;
                        
                        return (
                          <span key={index} className="px-3 py-1 rounded-full text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            {skill.skillTagName}
                          </span>
                        );
                      })}
                      {skillsData.development.length === 0 && (
                        <span className="text-[#969696] text-sm">No development areas listed</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Learning Goals */}
                <div className="bg-[#3e3e42]/50 p-4 rounded-lg border border-[#3e3e42]">
                  <h4 className="text-sm font-medium text-[#cccccc] mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                    Currently Learning
                  </h4>
                  {editingSkills ? (
                    <SkillsAutocomplete
                      selectedSkills={skillsData.learning}
                      onSkillsChange={(skills) => updateSkillsByType('learning', skills)}
                      skillType="learning"
                      placeholder="Add learning goals..."
                      className="w-full px-3 py-2 text-sm bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none"
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {skillsData.learning.map((skill, index) => {
                        const proficiencyKey = `${skill.skillTagName}-learning`;
                        const isEditingThisProficiency = editingProficiency === proficiencyKey;
                        
                        return (
                          <span key={index} className="px-3 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            {skill.skillTagName}
                          </span>
                        );
                      })}
                      {skillsData.learning.length === 0 && (
                        <span className="text-[#969696] text-sm">No learning goals listed</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-[#969696]">
                <div className="text-lg mb-2">Select a person</div>
                <div className="text-sm">Choose a person from the list to view details</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PeopleList;