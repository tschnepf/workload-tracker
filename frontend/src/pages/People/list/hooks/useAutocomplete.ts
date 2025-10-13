import { useMemo, useState } from 'react';
import type { Role, Person } from '@/types/models';

export interface UseLocationAutocompleteOptions {
  people: Person[];
}

export function useLocationAutocomplete({ people }: UseLocationAutocompleteOptions) {
  const [showLocationAutocomplete, setShowLocationAutocomplete] = useState(false);
  const [locationInputValue, setLocationInputValue] = useState('');
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(-1);

  const uniqueLocations = useMemo(
    () => Array.from(new Set(
      people
        .map(p => p.location?.trim())
        .filter((loc): loc is string => !!loc && loc.length > 0)
    )).sort(),
    [people]
  );

  const filteredLocations = useMemo(
    () => uniqueLocations.filter(loc => loc.toLowerCase().includes(locationInputValue.toLowerCase())),
    [uniqueLocations, locationInputValue]
  );

  return {
    showLocationAutocomplete,
    setShowLocationAutocomplete,
    locationInputValue,
    setLocationInputValue,
    selectedLocationIndex,
    setSelectedLocationIndex,
    filteredLocations,
    uniqueLocations,
  };
}

export interface UseRoleAutocompleteOptions {
  roles: Role[];
}

export function useRoleAutocomplete({ roles }: UseRoleAutocompleteOptions) {
  const [showRoleAutocomplete, setShowRoleAutocomplete] = useState(false);
  const [roleInputValue, setRoleInputValue] = useState('');
  const [selectedRoleIndex, setSelectedRoleIndex] = useState(-1);

  const filteredRoles = useMemo(
    () => roles.filter(r => r.isActive && r.name.toLowerCase().includes(roleInputValue.toLowerCase())),
    [roles, roleInputValue]
  );

  return {
    showRoleAutocomplete,
    setShowRoleAutocomplete,
    roleInputValue,
    setRoleInputValue,
    selectedRoleIndex,
    setSelectedRoleIndex,
    filteredRoles,
  };
}

