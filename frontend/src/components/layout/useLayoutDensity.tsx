import React, { createContext, useContext, useMemo, useState } from 'react';

type Density = 'default' | 'compact';

type DensityCtx = {
  density: Density;
  setMainPadding: (d: Density) => void;
};

const Ctx = createContext<DensityCtx | null>(null);

export const LayoutDensityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [density, setDensity] = useState<Density>('default');
  const value = useMemo<DensityCtx>(() => ({ density, setMainPadding: setDensity }), [density]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useLayoutDensity(): DensityCtx {
  const ctx = useContext(Ctx);
  if (!ctx) return { density: 'default', setMainPadding: () => {} };
  return ctx;
}

