/**
 * Font Size Context — Global text scaling for projector mode
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type FontSizeScale = 1.0 | 1.2 | 1.4 | 1.6;

interface FontSizeContextType {
  scale: FontSizeScale;
  setScale: (scale: FontSizeScale) => void;
}

const FontSizeContext = createContext<FontSizeContextType | undefined>(undefined);

export function FontSizeProvider({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState<FontSizeScale>(() => {
    const saved = localStorage.getItem('lab-font-scale');
    if (saved === '1.2' || saved === '1.4' || saved === '1.6') return (saved as unknown) as FontSizeScale;
    return 1.0;
  });

  useEffect(() => {
    localStorage.setItem('lab-font-scale', scale.toString());
    document.documentElement.style.setProperty('--lab-font-scale', scale.toString());
  }, [scale]);

  return (
    <FontSizeContext.Provider value={{ scale, setScale }}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize() {
  const ctx = useContext(FontSizeContext);
  if (!ctx) throw new Error('useFontSize must be used within FontSizeProvider');
  return ctx;
}
