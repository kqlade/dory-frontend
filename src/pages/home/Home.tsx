import React, { useState, useEffect, useRef } from 'react';
import './Home.css';
import { useAuth } from '../../hooks/useBackgroundAuth';
import NewTabSearchBar from '../../components/NewTabSearchBar';
import { detectOS } from '../../utils/osUtils';

const Home = () => {
  const [greeting, setGreeting] = useState('');
  const { user } = useAuth();
  const searchBarWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentHour = new Date().getHours();
    let newGreeting = 'Good evening'; // Default

    if (currentHour < 12) {
      newGreeting = 'Good morning';
    } else if (currentHour < 18) {
      newGreeting = 'Good afternoon';
    }

    // Add the user's first name if available
    if (user?.name) {
      const firstName = user.name.split(' ')[0];
      newGreeting = `${newGreeting}, ${firstName}`;
    }

    setGreeting(newGreeting);
  }, [user]); // Update greeting when user changes

  return (
    <div className="page">
      <header className="page-header">
        <h1>{greeting}</h1>
        <p className="page-subheader">Here's what you were working on recently</p>
      </header>
      <main className="page-content">
        {/* Content will go here */}
      </main>
      
      {/* Search bar positioned from the top of viewport */}
      <div className="home-search-wrapper" ref={searchBarWrapperRef}>
        <NewTabSearchBar />
        {/* Helper text for keyboard shortcut - OS specific */}
        <div className="shortcut-helper-text">
          Press {detectOS() === 'Mac OS' ? '⌘' : 'Ctrl'}+Shift+P to search from any page
        </div>
      </div>
    </div>
  );
};

export default Home;