import React from 'react';
import NewTabSearchBar from '../../components/NewTabSearchBar';
import ThemeToggle from '../../components/ThemeToggle';
import './newtab.css';

/**
 * This page is now minimal: it only renders the "DORY" text,
 * the self-contained search bar, and the ThemeToggle.
 */
const NewTab: React.FC = () => {
  return (
    <div className="newtab-container">
      {/* DORY heading */}
      <div className="dory-container">
        <div className="dory-text">
          <span className="word"><span className="dory-letter">D</span>ynamic</span>{' '}
          <span className="word"><span className="dory-letter">O</span>nline</span>{' '}
          <span className="word"><span className="dory-letter">R</span>ecall</span>{' '}
          <span className="word">for</span>{' '}
          <span className="word"><span className="dory-letter">Y</span>ou</span>
        </div>
      </div>

      {/* Positioned wrapper for the search bar */}
      <div className="search-bar-wrapper">
        <NewTabSearchBar />
      </div>

      {/* Theme toggle button */}
      <ThemeToggle />
    </div>
  );
};

export default NewTab;