import React, { createContext, useCallback, useContext, useState } from 'react';

interface DragCtx {
  isDragging: boolean;
  setDragging: (on: boolean) => void;
}

const DragContext = createContext<DragCtx | undefined>(undefined);

export const DragProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDragging, setIsDragging] = useState(false);
  const setDragging = useCallback((on: boolean) => setIsDragging(on), []);

  return (
    <DragContext.Provider value={{ isDragging, setDragging }}>
      {children}
    </DragContext.Provider>
  );
};

export const useDrag = () => {
  const ctx = useContext(DragContext);
  if (!ctx) throw new Error('useDrag must be used inside <DragProvider>');
  return ctx;
}; 