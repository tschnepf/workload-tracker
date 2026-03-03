export type TokenOp = 'or' | 'and' | 'not';
export type SearchTokenLike = { term: string; op: TokenOp };

const COMPARATOR_RE = /^(<=|>=|<|>)\s*(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)?$/i;
const RANGE_RE = /^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)?\s*-\s*(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)?$/i;
const EXACT_RE = /^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)?$/i;

const CANONICAL_KEYWORDS = new Set(['available', 'optimal', 'full', 'overallocated']);
const ALIAS_TO_CANONICAL: Record<string, string> = {
  underloaded: 'available',
  overloaded: 'overallocated',
};

type NumericClause =
  | { kind: 'lt' | 'lte' | 'gt' | 'gte' | 'eq'; value: number }
  | { kind: 'range'; min: number; max: number };

function normalizeTerm(term: string): string {
  return (term || '').trim().toLowerCase();
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(value).replace(/\.?0+$/, '');
}

function parseNumericClause(clause: string): NumericClause | null {
  const trimmed = clause.trim();
  if (!trimmed) return null;
  const comparator = COMPARATOR_RE.exec(trimmed);
  if (comparator) {
    const op = comparator[1];
    const value = Number(comparator[2]);
    if (!Number.isFinite(value)) return null;
    if (op === '<') return { kind: 'lt', value };
    if (op === '<=') return { kind: 'lte', value };
    if (op === '>') return { kind: 'gt', value };
    return { kind: 'gte', value };
  }
  const range = RANGE_RE.exec(trimmed);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    if (min > max) return null;
    return { kind: 'range', min, max };
  }
  const exact = EXACT_RE.exec(trimmed);
  if (exact) {
    const value = Number(exact[1]);
    if (!Number.isFinite(value)) return null;
    return { kind: 'eq', value };
  }
  return null;
}

function normalizeNumericClause(clause: NumericClause): string {
  if (clause.kind === 'range') {
    return `${formatNumber(clause.min)}-${formatNumber(clause.max)}`;
  }
  if (clause.kind === 'eq') {
    return formatNumber(clause.value);
  }
  if (clause.kind === 'lt') return `<${formatNumber(clause.value)}`;
  if (clause.kind === 'lte') return `<=${formatNumber(clause.value)}`;
  if (clause.kind === 'gt') return `>${formatNumber(clause.value)}`;
  return `>=${formatNumber(clause.value)}`;
}

function parseNumericExpression(term: string): NumericClause[] | null {
  const lowered = normalizeTerm(term);
  const parts = lowered.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const parsed = parts.map(parseNumericClause);
  if (parsed.some((clause) => clause == null)) return null;
  return parsed as NumericClause[];
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

  const numericClauses = parseNumericExpression(lowered);
  if (numericClauses && numericClauses.length > 0) {
    const canonicalTerm = numericClauses.map(normalizeNumericClause).join(', ');
    return { isWorkload: true, isInvalidWorkloadLike: false, canonicalTerm };
  }

  const parts = lowered.split(',').map((p) => p.trim()).filter(Boolean);
  const hasMultiple = parts.length > 1;
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

export function isNumericWorkloadTokenTerm(term: string): boolean {
  const classified = classifyWorkloadTokenTerm(term);
  if (!classified.isWorkload) return false;
  return !CANONICAL_KEYWORDS.has(normalizeTerm(classified.canonicalTerm));
}

export function matchesNumericWorkloadTerm(totalHours: number, term: string): boolean {
  const numericClauses = parseNumericExpression(term);
  if (!numericClauses || !numericClauses.length) return false;
  const value = Number.isFinite(totalHours) ? totalHours : 0;
  return numericClauses.some((clause) => {
    if (clause.kind === 'lt') return value < clause.value;
    if (clause.kind === 'lte') return value <= clause.value;
    if (clause.kind === 'gt') return value > clause.value;
    if (clause.kind === 'gte') return value >= clause.value;
    if (clause.kind === 'eq') return Math.abs(value - clause.value) < 0.0001;
    if (clause.kind === 'range') return value >= clause.min && value <= clause.max;
    return false;
  });
}

export function hasInvalidWorkloadLikeTokens(tokens: Array<{ term: string }>): boolean {
  return tokens.some((token) => classifyWorkloadTokenTerm(token.term).isInvalidWorkloadLike);
}

export function filterTextCompatibleTokens<T extends SearchTokenLike>(tokens: T[]): T[] {
  return tokens.filter((token) => !isWorkloadTokenTerm(token.term));
}
