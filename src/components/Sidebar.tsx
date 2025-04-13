import React, { useState, ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ChevronRight, MoreHorizontal, Plus, ChevronDown, Settings, CornerDownRight, UserPlus, ChevronsLeft } from 'lucide-react';
import './Sidebar.css';

interface SidebarItem {
  label: string;
  icon?: string | ReactNode;
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

const SidebarLink: React.FC<SidebarItem & { level?: number }> = ({
  label,
  icon,
  href,
  notificationCount,
  children,
  level = 0,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const hasChildren = !!children?.length;
  
  const handleClick = () => {
    if (hasChildren) setExpanded(!expanded);
  };

  // Action buttons that only appear on hover for expandable items
  const actionButtons = hasChildren ? (
    <div className="sidebar-actions">
      <button className="sidebar-action-button" aria-label="More options">
        <MoreHorizontal size={14} />
      </button>
      <button className="sidebar-action-button" aria-label="Add item">
        <Plus size={14} />
      </button>
    </div>
  ) : level > 0 ? (
    // For nested items, only show the three dots, not the plus button
    <div className="sidebar-actions">
      <button className="sidebar-action-button" aria-label="More options">
        <MoreHorizontal size={14} />
      </button>
    </div>
  ) : null;

  // Content changes based on expanded/collapsed state
  const content = (
    <>
      <span className="sidebar-item-icon">
        {level > 0 ? (
          <CornerDownRight size={14} strokeWidth={1.5} className="corner-icon" />
        ) : hasChildren && (!expanded || isHovered) ? (
          expanded && isHovered ? (
            <ChevronDown size={16} />
          ) : (
            <ChevronRight size={16} />
          )
        ) : (
          icon
        )}
      </span>
      <span className="sidebar-item-text">{label}</span>
      {notificationCount && (
        <span className="notification-count">{notificationCount}</span>
      )}
      {isHovered && actionButtons}
    </>
  );

  return (
    <li className="sidebar-item">
      {href ? (
        <NavLink 
          to={href}
          className={({ isActive }) => 
            `sidebar-link ${hasChildren ? 'has-children' : ''} ${isActive ? 'active' : ''}`
          }
          onClick={hasChildren ? handleClick : undefined}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          end={href === '/'}
        >
          {content}
        </NavLink>
      ) : (
        <div
          className={`sidebar-link ${hasChildren ? 'has-children' : ''}`}
          onClick={handleClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {content}
        </div>
      )}
      {hasChildren && expanded && (
        <ul className="sidebar-nested-list">
          {children!.map((child) => (
            <SidebarLink key={child.label} {...child} level={level + 1} />
          ))}
        </ul>
      )}
    </li>
  );
};

const SidebarSection: React.FC<SidebarSection> = ({
  title,
  items,
  collapsible,
  defaultOpen = true,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  // Action buttons for the section header
  const sectionActionButtons = (
    <div className="sidebar-actions">
      <button className="sidebar-action-button" aria-label="Add item">
        <Plus size={14} />
      </button>
      <button className="sidebar-action-button" aria-label="More options">
        <MoreHorizontal size={14} />
      </button>
    </div>
  );

  return (
    <section className="sidebar-section">
      {title && (
        <h2 
          className={`sidebar-section-header ${open ? 'expanded' : 'collapsed'}`}
          onClick={() => collapsible && setOpen(!open)}
        >
          <span className="sidebar-section-title">
            {collapsible && !open ? (
              <ChevronRight size={14} />
            ) : (
              title
            )}
          </span>
          {sectionActionButtons}
        </h2>
      )}
      {(!collapsible || open) && (
        <ul className="sidebar-list">
          {items.map((item) => (
            <SidebarLink key={item.label} {...item} />
          ))}
        </ul>
      )}
    </section>
  );
};

const Sidebar = ({
  sections,
  isOpen,
  isExpanded,
  onToggleExpand
}: {
  sections: SidebarSection[];
  isOpen: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) => {
  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''} ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div 
        className="sidebar-content"
        onClick={(e) => {
          // Only handle click if sidebar is collapsed and not clicking on the settings icon
          if (!isExpanded && !(e.target as Element).closest('.settings-icon-link')) {
            onToggleExpand();
          }
        }}
      >
        <div className="sidebar-header">
          <button 
            className="sidebar-collapse-button" 
            aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
            onClick={onToggleExpand}
          >
            <ChevronsLeft size={18} />
          </button>
        </div>
        
        <nav className="sidebar-nav">
          {sections.map((section, i) => (
            <SidebarSection key={i} {...section} />
          ))}
        </nav>
        
        <div className="sidebar-footer">
          {/* Footer content if needed */}
        </div>
        
        <Link 
          to="/settings"
          className="settings-icon-link" 
          aria-label="Settings"
        >
          <Settings size={18} />
        </Link>
      </div>
    </aside>
  );
};

export default Sidebar;