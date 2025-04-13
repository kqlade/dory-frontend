import React, { useState, useEffect } from 'react';
import './Home.css';

const Home = () => {
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const currentHour = new Date().getHours();
    let newGreeting = 'Good Evening'; // Default

    if (currentHour < 12) {
      newGreeting = 'Good Morning';
    } else if (currentHour < 18) {
      newGreeting = 'Good Afternoon';
    }

    setGreeting(newGreeting);
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <div className="page">
      <header className="page-header">
        <h1>{greeting}</h1>
        <p className="page-subheader">Here's what you were working on recently</p>
      </header>
      <main className="page-content">
        {/* Content will go here */}
      </main>
    </div>
  );
};

export default Home;