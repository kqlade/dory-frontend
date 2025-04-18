import { useState, ReactNode, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../services/AuthContext';
import { Home, FolderOpen, Users, BookOpen, UserPlus, Mail, CalendarDays, HardDrive } from 'lucide-react';

interface SidebarItem {
  label: string;
  icon?: ReactNode;
  href?: string;
  notificationCount?: number;
  children?: SidebarItem[];
}

interface SidebarSection {
  title?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  items: SidebarItem[];
}

const AppLayout = () => {
  const [sidebarExpanded, setSidebarExpanded] = useState(window.innerWidth > 1024);
  const [sidebarOpen] = useState(true);
  const [greeting, setGreeting] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1024) {
        setSidebarExpanded(false);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const currentHour = new Date().getHours();
    let newGreeting = 'Good evening';

    if (currentHour < 12) {
      newGreeting = 'Good morning';
    } else if (currentHour < 18) {
      newGreeting = 'Good afternoon';
    }

    if (user?.name) {
      const firstName = user.name.split(' ')[0];
      newGreeting = `${newGreeting}, ${firstName}`;
    }

    setGreeting(newGreeting);
  }, [user]);

  const sidebarSections: SidebarSection[] = [{
    collapsible: false,
    defaultOpen: true,
    items: [
      { label: 'Home', icon: <Home size={18} />, href: '/app/home' },
      { label: 'Getting Started', icon: <BookOpen size={18} />, href: '/app/getting-started' },
      { 
        label: 'Collections',
        icon: <FolderOpen size={18} />, 
        children: [
          { label: 'Project Alpha', href: '/app/alpha' },
          { label: 'Project Beta', href: '/app/beta' }
        ]
      },
      { label: 'Share', icon: <UserPlus size={18} />, href: '/app/invite' }
    ]
  }];

  return (
    <div className={`app-container ${sidebarExpanded ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
      <Sidebar 
        isOpen={sidebarOpen} 
        sections={sidebarSections} 
        isExpanded={sidebarExpanded}
        onToggleExpand={() => setSidebarExpanded(!sidebarExpanded)}
      />
      <header className="app-header">
        <div className="header-left" />
        <div className="header-content">
          <div className="greeting-container">
            <h1 className="greeting">{greeting}</h1>
            <p className="subheader">Here's what you were working on recently</p>
          </div>
        </div>
        <div className="google-services">
          <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer" className="service-icon">
            <Mail size={20} />
            <span>Mail</span>
          </a>
          <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="service-icon">
            <CalendarDays size={20} />
            <span>Calendar</span>
          </a>
          <a href="https://drive.google.com" target="_blank" rel="noopener noreferrer" className="service-icon">
            <HardDrive size={20} />
            <span>Drive</span>
          </a>
        </div>
      </header>
      <main className="main-content">
        <div className="content-container">
          <Outlet />
        </div>
      </main>
      <footer className="app-footer">
        <ThemeToggle />
      </footer>
    </div>
  );
};

export default AppLayout;