import { createContext, useContext } from 'react';

export const LayoutContext = createContext<boolean>(false);
export const useInLayout = () => useContext(LayoutContext);

