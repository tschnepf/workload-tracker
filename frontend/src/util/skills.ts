// Skills utilities extracted from PeopleList normalization logic
// Behavior must remain identical to inline implementation

export function normalizeProficiencyLevel(
  level: string
): 'beginner' | 'intermediate' | 'advanced' | 'expert' {
  const normalized = (level || '').toLowerCase().trim();
  switch (normalized) {
    case 'beginner':
    case 'basic':
    case 'novice':
      return 'beginner';
    case 'intermediate':
    case 'medium':
    case 'mid':
      return 'intermediate';
    case 'advanced':
    case 'senior':
    case 'high':
      return 'advanced';
    case 'expert':
    case 'master':
    case 'professional':
      return 'expert';
    default:
      return 'beginner';
  }
}

