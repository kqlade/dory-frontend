// src/components/App.tsx
import React from 'react';
import Header from '@/components/header';
import Content from '@/components/content';

const App: React.FC = () => {
  return (
    <div style={{
      backgroundColor: '#1E1E1E',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflowX: 'hidden',
      boxSizing: 'border-box',
      borderRadius: '12px',
      overflow: 'hidden'
    }}>
      <Header />
      <Content />
    </div>
  );
};

export default App;