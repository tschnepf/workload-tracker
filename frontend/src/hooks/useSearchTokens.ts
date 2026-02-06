import * as React from 'react';

export type SearchTokenOp = 'or' | 'and' | 'not';
export type SearchToken = { id: string; term: string; op: SearchTokenOp };

type Options = {
  defaultOp?: SearchTokenOp;
};

export function useSearchTokens(options?: Options) {
  const [searchInput, setSearchInput] = React.useState('');
  const [searchTokens, setSearchTokens] = React.useState<SearchToken[]>([]);
  const [searchOp, setSearchOp] = React.useState<SearchTokenOp>(options?.defaultOp ?? 'or');
  const [activeTokenId, setActiveTokenId] = React.useState<string | null>(null);
  const searchTokenSeq = React.useRef(0);

  const normalizedSearchTokens = React.useMemo(
    () => searchTokens
      .map((token) => ({ ...token, term: token.term.trim().toLowerCase() }))
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
  }, [activeTokenId, activeToken]);

  const addSearchToken = React.useCallback(() => {
    const term = searchInput.trim();
    if (!term) return;
    const normalized = term.toLowerCase();
    setSearchTokens((prev) => {
      const alreadyExists = prev.some((token) => token.term.trim().toLowerCase() === normalized && token.op === searchOp);
      if (alreadyExists) return prev;
      const nextId = `search-${searchTokenSeq.current += 1}`;
      return [...prev, { id: nextId, term, op: searchOp }];
    });
    setSearchInput('');
    setActiveTokenId(null);
  }, [searchInput, searchOp]);

  const removeSearchToken = React.useCallback((id: string) => {
    setSearchTokens((prev) => prev.filter((token) => token.id !== id));
    setActiveTokenId((prev) => (prev === id ? null : prev));
  }, []);

  const handleSearchOpChange = React.useCallback((value: SearchTokenOp) => {
    if (activeToken) {
      setSearchTokens((prev) => prev.map((token) => (token.id === activeToken.id ? { ...token, op: value } : token)));
    } else {
      setSearchOp(value);
    }
  }, [activeToken]);

  const handleSearchKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSearchToken();
      return;
    }
    if (e.key === 'Backspace' && searchInput.length === 0 && searchTokens.length > 0) {
      e.preventDefault();
      setSearchTokens((prev) => prev.slice(0, -1));
      return;
    }
    if (e.key === 'Escape') {
      setSearchInput('');
      setActiveTokenId(null);
    }
  }, [addSearchToken, searchInput.length, searchTokens.length]);

  const matchesTokensText = React.useCallback((text: string) => {
    if (!normalizedSearchTokens.length) return true;
    const haystack = (text || '').toLowerCase();
    let hasOr = false;
    let orMatched = false;

    for (const token of normalizedSearchTokens) {
      const match = haystack.includes(token.term);
      if (token.op === 'not') {
        if (match) return false;
        continue;
      }
      if (token.op === 'and') {
        if (!match) return false;
        continue;
      }
      hasOr = true;
      if (match) orMatched = true;
    }

    if (hasOr && !orMatched) return false;
    return true;
  }, [normalizedSearchTokens]);

  return {
    searchInput,
    setSearchInput,
    searchTokens,
    setSearchTokens,
    searchOp,
    activeTokenId,
    setActiveTokenId,
    normalizedSearchTokens,
    addSearchToken,
    removeSearchToken,
    handleSearchOpChange,
    handleSearchKeyDown,
    matchesTokensText,
    activeToken,
  };
}
