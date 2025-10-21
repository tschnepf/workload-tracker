import React, { createContext, useContext, useMemo, useState } from 'react';

type Slots = { left: React.ReactNode; right: React.ReactNode };

type Ctx = {
  slots: Slots;
  setLeft: (node: React.ReactNode) => void;
  setRight: (node: React.ReactNode) => void;
  clearLeft: () => void;
  clearRight: () => void;
};

const TopBarSlotsContext = createContext<Ctx | null>(null);

export const TopBarSlotsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [left, setLeftState] = useState<React.ReactNode>(null);
  const [right, setRightState] = useState<React.ReactNode>(null);

  const value = useMemo<Ctx>(() => ({
    slots: { left, right },
    setLeft: (n) => setLeftState(n ?? null),
    setRight: (n) => setRightState(n ?? null),
    clearLeft: () => setLeftState(null),
    clearRight: () => setRightState(null),
  }), [left, right]);

  return (
    <TopBarSlotsContext.Provider value={value}>{children}</TopBarSlotsContext.Provider>
  );
};

export function useTopBarSlots(): Pick<Ctx, 'setLeft' | 'setRight' | 'clearLeft' | 'clearRight'> {
  const ctx = useContext(TopBarSlotsContext);
  if (!ctx) {
    // No-op fallback for tests or non-layout render trees
    return { setLeft: () => {}, setRight: () => {}, clearLeft: () => {}, clearRight: () => {} };
  }
  const { setLeft, setRight, clearLeft, clearRight } = ctx;
  return { setLeft, setRight, clearLeft, clearRight };
}

export function useTopBarSlotValues(): Slots {
  const ctx = useContext(TopBarSlotsContext);
  return ctx?.slots ?? { left: null, right: null };
}

