export type TokenOp = 'or' | 'and' | 'not';
export type SearchTokenLike = { term: string; op: TokenOp };

const COMPARATOR_RE = /^(<=|>=|<|>)(\d+(?:\.\d+)?)$/;
const RANGE_RE = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/;

const CANONICAL_KEYWORDS = new Set(['available', 'optimal', 'full', 'overallocated']);
const ALIAS_TO_CANONICAL: Record<string, string> = {
  underloaded: 'available',
  overloaded: 'overallocated',
};

function normalizeTerm(term: string): string {
  return (term || '').trim().toLowerCase();
}

function parseNumericClause(clause: string): boolean {
  const trimmed = clause.trim();
  if (!trimmed) return false;
  if (COMPARATOR_RE.test(trimmed)) return true;
  const range = RANGE_RE.exec(trimmed);
  if (!range) return false;
  const min = Number(range[1]);
  const max = Number(range[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
  return min <= max;
}

function looksLikeNumericWorkloadExpression(term: string): boolean {
  const lower = normalizeTerm(term);
  if (!lower) return false;
  if (lower.includes('<') || lower.includes('>')) return true;
  if (/\d\s*-\s*\d/.test(lower)) return true;
  if (!lower.includes(',')) return false;
  return lower
    .split(',')
    .some((part) => /[<>]/.test(part) || /\d\s*-\s*\d/.test(part) || /^\s*\d+(\.\d+)?\s*$/.test(part));
}

export function normalizeWorkloadAliasTerm(term: string): string {
  const lowered = normalizeTerm(term);
  if (!lowered) return term;
  return ALIAS_TO_CANONICAL[lowered] || term.trim();
}

export function classifyWorkloadTokenTerm(term: string): {
  isWorkload: boolean;
  isInvalidWorkloadLike: boolean;
  canonicalTerm: string;
} {
  const lowered = normalizeTerm(term);
  const canonicalKeyword = ALIAS_TO_CANONICAL[lowered] || lowered;
  if (CANONICAL_KEYWORDS.has(canonicalKeyword)) {
    return { isWorkload: true, isInvalidWorkloadLike: false, canonicalTerm: canonicalKeyword };
  }

  const parts = lowered.split(',').map((p) => p.trim()).filter(Boolean);
  const hasMultiple = parts.length > 1;
  if (parts.length > 0 && parts.every(parseNumericClause)) {
    const canonicalTerm = parts.map((p) => p.replace(/\s+/g, '')).join(', ');
    return { isWorkload: true, isInvalidWorkloadLike: false, canonicalTerm };
  }

  const looksLike = hasMultiple || looksLikeNumericWorkloadExpression(lowered);
  return {
    isWorkload: false,
    isInvalidWorkloadLike: looksLike,
    canonicalTerm: term.trim(),
  };
}

export function isWorkloadTokenTerm(term: string): boolean {
  return classifyWorkloadTokenTerm(term).isWorkload;
}

export function hasInvalidWorkloadLikeTokens(tokens: Array<{ term: string }>): boolean {
  return tokens.some((token) => classifyWorkloadTokenTerm(token.term).isInvalidWorkloadLike);
}

export function filterTextCompatibleTokens<T extends SearchTokenLike>(tokens: T[]): T[] {
  return tokens.filter((token) => !isWorkloadTokenTerm(token.term));
}
