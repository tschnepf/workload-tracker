import * as React from 'react';

export type WorkPlanningSearchOp = 'or' | 'and' | 'not';

export type WorkPlanningSearchToken = {
  id: string;
  term: string;
  op: WorkPlanningSearchOp;
};

export type UseWorkPlanningSearchTokensOptions = {
  defaultOp?: WorkPlanningSearchOp;
  idPrefix?: string;
  includePendingInputToken?: boolean;
};

const normalizeTerm = (value: string) => value.trim().toLowerCase();

export function useWorkPlanningSearchTokens(options?: UseWorkPlanningSearchTokensOptions) {
  const defaultOp = options?.defaultOp ?? 'or';
  const idPrefix = options?.idPrefix ?? 'search';
  const includePendingInputToken = options?.includePendingInputToken ?? false;

  const [searchInput, setSearchInput] = React.useState('');
  const [searchTokens, setSearchTokens] = React.useState<WorkPlanningSearchToken[]>([]);
  const [searchOp, setSearchOp] = React.useState<WorkPlanningSearchOp>(defaultOp);
  const [activeTokenId, setActiveTokenId] = React.useState<string | null>(null);
  const seqRef = React.useRef(0);

  const normalizedSearchTokens = React.useMemo(
    () => searchTokens
      .map((token) => ({ ...token, term: normalizeTerm(token.term) }))
      .filter((token) => token.term.length > 0),
    [searchTokens]
  );

  const activeToken = React.useMemo(
    () => (activeTokenId ? searchTokens.find((token) => token.id === activeTokenId) ?? null : null),
    [activeTokenId, searchTokens]
  );

  React.useEffect(() => {
    if (activeTokenId && !activeToken) {
      setActiveTokenId(null);
    }
  }, [activeToken, activeTokenId]);

  const pendingSearchToken = React.useMemo(() => {
    const term = normalizeTerm(searchInput);
    if (!term) return null;
    return { term, op: searchOp };
  }, [searchInput, searchOp]);

  const searchTokensForApi = React.useMemo(() => {
    const tokens = normalizedSearchTokens.map(({ term, op }) => ({ term, op }));
    if (!includePendingInputToken || !pendingSearchToken) return tokens;
    if (!tokens.some((token) => token.term === pendingSearchToken.term && token.op === pendingSearchToken.op)) {
      tokens.push(pendingSearchToken);
    }
    return tokens;
  }, [includePendingInputToken, normalizedSearchTokens, pendingSearchToken]);

  const addSearchToken = React.useCallback((value?: string) => {
    const term = (value ?? searchInput).trim();
    if (!term) return;
    const normalized = normalizeTerm(term);
    setSearchTokens((prev) => {
      const alreadyExists = prev.some((token) => normalizeTerm(token.term) === normalized && token.op === searchOp);
      if (alreadyExists) return prev;
      seqRef.current += 1;
      return [...prev, { id: `${idPrefix}-${seqRef.current}`, term, op: searchOp }];
    });
    setSearchInput('');
    setActiveTokenId(null);
  }, [idPrefix, searchInput, searchOp]);

  const removeSearchToken = React.useCallback((id: string) => {
    setSearchTokens((prev) => prev.filter((token) => token.id !== id));
    setActiveTokenId((prev) => (prev === id ? null : prev));
  }, []);

  const handleSearchOpChange = React.useCallback((value: WorkPlanningSearchOp) => {
    if (activeToken) {
      setSearchTokens((prev) => prev.map((token) => (token.id === activeToken.id ? { ...token, op: value } : token)));
      return;
    }
    setSearchOp(value);
  }, [activeToken]);

  const handleSearchKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSearchToken();
      return;
    }
    if (e.key === 'Backspace' && searchInput.length === 0 && searchTokens.length > 0) {
      e.preventDefault();
      const lastToken = searchTokens[searchTokens.length - 1];
      setSearchTokens((prev) => prev.slice(0, -1));
      if (lastToken && lastToken.id === activeTokenId) {
        setActiveTokenId(null);
      }
      return;
    }
    if (e.key === 'Escape') {
      setSearchInput('');
      setActiveTokenId(null);
    }
  }, [activeTokenId, addSearchToken, searchInput.length, searchTokens]);

  const clearSearchTokens = React.useCallback(() => {
    setSearchInput('');
    setSearchTokens([]);
    setActiveTokenId(null);
  }, []);

  return {
    searchInput,
    setSearchInput,
    searchTokens,
    setSearchTokens,
    searchOp,
    setSearchOp,
    activeTokenId,
    setActiveTokenId,
    activeToken,
    normalizedSearchTokens,
    pendingSearchToken,
    searchTokensForApi,
    addSearchToken,
    removeSearchToken,
    handleSearchOpChange,
    handleSearchKeyDown,
    clearSearchTokens,
  };
}
