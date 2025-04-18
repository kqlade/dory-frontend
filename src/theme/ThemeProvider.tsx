import React, { createContext, useContext, ReactNode } from 'react';
import useBackgroundPreferences from '../hooks/useBackgroundPreferences';
import { COLORS } from './colors';

/**
 * Theme context interface
 */
interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => Promise<any>;
  colors: typeof COLORS.light | typeof COLORS.dark;
}

// Create context with a default value (will be overridden by Provider)
const ThemeContext = createContext<ThemeContextType>({
  isDarkMode: false,
  toggleTheme: async () => {},
  colors: COLORS.light,
});

export { ThemeContext };

/**
 * Theme Provider props
 */
interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * ThemeProvider component that wraps the app and provides theme context
 * This uses the existing useBackgroundPreferences hook internally
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { isDarkMode, toggleTheme } = useBackgroundPreferences();
  
  // Select the appropriate color set based on theme
  const colors = isDarkMode ? COLORS.dark : COLORS.light;
  
  const value = {
    isDarkMode,
    toggleTheme,
    colors
  };
  
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * Custom hook to use the theme context
 * @returns The theme context value
 */
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}; 