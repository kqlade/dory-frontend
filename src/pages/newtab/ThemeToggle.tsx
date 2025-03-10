import React from 'react';
import { FiSun, FiMoon } from 'react-icons/fi';
import styled from 'styled-components';
import useDarkMode from './useDarkMode';

// Styled toggle button
const ToggleButton = styled.button`
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  background: transparent;
  cursor: pointer;
  transition: all 0.3s ease;
  padding: 0;
  z-index: 1000;
  color: var(--text-color);
  
  &:hover {
    transform: scale(1.1);
    border-color: var(--border-focus-color);
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--border-focus-color);
  }
`;

const ThemeToggle: React.FC = () => {
  const { isDarkMode, toggle } = useDarkMode();

  return (
    <ToggleButton
      onClick={toggle}
      aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDarkMode ? <FiSun size={20} /> : <FiMoon size={20} />}
    </ToggleButton>
  );
};

export default ThemeToggle;