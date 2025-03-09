// src/pages/graph/graph.js
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';

// DOM Elements
const graphContainer = document.getElementById('graph');
const loadingElement = document.getElementById('loading');
const sessionSelect = document.getElementById('session-select');
const refreshButton = document.getElementById('refresh-btn');
const tooltip = document.getElementById('tooltip');
const totalPagesElement = document.getElementById('total-pages');
const totalSessionsElement = document.getElementById('total-sessions');
const totalEdgesElement = document.getElementById('total-edges');
const mostActivePageElement = document.getElementById('most-active-page');

// Global variables
let network = null;
let sessions = [];
let pages = [];
let edges = [];
let currentSessionId = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadData();
    populateSessionSelect();
    updateStatistics();
    createGraph();
    setupEventListeners();
    loadingElement.style.display = 'none';
  } catch (error) {
    console.error('Error initializing graph:', error);
    loadingElement.textContent = 'Error loading data. Please try refreshing.';
  }
});

// Load data from IndexedDB
async function loadData() {
  const db = await openDB();
  
  // Load sessions
  sessions = await getAllFromStore(db, 'sessions');
  sessions.sort((a, b) => b.startTime - a.startTime); // Sort by most recent first
  
  // Get current session (most recent without endTime)
  currentSessionId = sessions.find(s => !s.endTime)?.sessionId || null;
  
  // Load pages
  pages = await getAllFromStore(db, 'pages');
  
  // Load edges
  edges = await getAllFromStore(db, 'edges');
  
  console.log(`Loaded ${sessions.length} sessions, ${pages.length} pages, ${edges.length} edges`);
}

// Open IndexedDB connection
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('DoryDB', 1);
    
    request.onerror = event => {
      reject('Error opening database');
    };
    
    request.onsuccess = event => {
      resolve(event.target.result);
    };
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      
      // Create object stores if they don't exist
      if (!db.objectStoreNames.contains('pages')) {
        const pagesStore = db.createObjectStore('pages', { keyPath: 'pageId' });
        pagesStore.createIndex('by-url', 'url', { unique: true });
      }
      
      if (!db.objectStoreNames.contains('edges')) {
        db.createObjectStore('edges', { keyPath: 'edgeId' });
      }
      
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'sessionId' });
      }
    };
  });
}

// Get all records from a store
function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    request.onsuccess = () => {
      resolve(request.result);
    };
    
    request.onerror = () => {
      reject(`Error getting data from ${storeName}`);
    };
  });
}

// Update statistics display
function updateStatistics() {
  // Update total counts
  totalPagesElement.textContent = pages.length;
  totalSessionsElement.textContent = sessions.length;
  totalEdgesElement.textContent = edges.length;
  
  // Find most active page
  if (pages.length > 0) {
    const sortedPages = [...pages].sort((a, b) => (b.totalActiveTime || 0) - (a.totalActiveTime || 0));
    const mostActivePage = sortedPages[0];
    const title = truncateString(mostActivePage.title || mostActivePage.url, 20);
    const time = formatTime(mostActivePage.totalActiveTime || 0);
    mostActivePageElement.textContent = `${title} (${time})`;
    mostActivePageElement.title = mostActivePage.url;
  } else {
    mostActivePageElement.textContent = 'No pages yet';
  }
}

// Populate session dropdown
function populateSessionSelect() {
  // Clear existing options except "All Sessions"
  while (sessionSelect.options.length > 1) {
    sessionSelect.remove(1);
  }
  
  // Add sessions to dropdown
  sessions.forEach(session => {
    const option = document.createElement('option');
    option.value = session.sessionId;
    
    const date = new Date(session.startTime);
    const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    let label = `Session ${session.sessionId} (${formattedDate})`;
    if (session.sessionId === currentSessionId) {
      label += ' - Current';
    }
    
    option.textContent = label;
    sessionSelect.appendChild(option);
  });
}

// Create the graph visualization
function createGraph() {
  const selectedSessionId = sessionSelect.value;
  
  // Filter edges by session if a specific session is selected
  let filteredEdges = edges;
  if (selectedSessionId !== 'all') {
    filteredEdges = edges.filter(edge => edge.sessionId === parseInt(selectedSessionId));
  }
  
  // Get unique page IDs from filtered edges
  const pageIds = new Set();
  filteredEdges.forEach(edge => {
    pageIds.add(edge.fromPageId);
    pageIds.add(edge.toPageId);
  });
  
  // Filter pages to only those in the filtered edges
  const filteredPages = selectedSessionId === 'all' 
    ? pages 
    : pages.filter(page => pageIds.has(page.pageId));
  
  // Create nodes array for vis.js
  const nodes = filteredPages.map(page => {
    // Calculate node size based on activity time (min 20, max 60)
    const size = Math.min(60, Math.max(25, 25 + (page.totalActiveTime || 0) / 10));
    
    // Determine color based on the most recent session this page was part of
    let color = '#9E9E9E'; // Default gray for older sessions
    let borderWidth = 1;
    
    // Find the most recent edge that includes this page
    const pageEdges = edges.filter(edge => 
      edge.fromPageId === page.pageId || edge.toPageId === page.pageId
    );
    
    if (pageEdges.length > 0) {
      // Sort by timestamp descending
      pageEdges.sort((a, b) => b.timestamp - a.timestamp);
      const mostRecentEdge = pageEdges[0];
      
      if (mostRecentEdge.sessionId === currentSessionId) {
        color = '#4CAF50'; // Green for current session
        borderWidth = 2;
      } else if (sessions.length > 1 && mostRecentEdge.sessionId === sessions[1].sessionId) {
        color = '#2196F3'; // Blue for previous session
      }
    }
    
    return {
      id: page.pageId,
      label: truncateString(page.title || page.url, 25),
      title: page.url,
      size: size,
      color: {
        background: color,
        border: color,
        highlight: {
          background: color,
          border: '#333'
        }
      },
      borderWidth: borderWidth,
      font: { 
        size: 14,
        color: '#333',
        face: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      },
      data: page // Store the full page data for tooltip
    };
  });
  
  // Create edges array for vis.js
  const visEdges = filteredEdges.map(edge => ({
    from: edge.fromPageId,
    to: edge.toPageId,
    arrows: 'to',
    smooth: { type: 'curvedCW', roundness: 0.2 },
    width: 1.5,
    color: {
      color: '#999',
      highlight: '#666'
    },
    data: edge // Store the full edge data for tooltip
  }));
  
  // Create the data object
  const data = {
    nodes: new DataSet(nodes),
    edges: new DataSet(visEdges)
  };
  
  // Configuration for the vis.js network
  const options = {
    nodes: {
      shape: 'dot',
      scaling: {
        min: 25,
        max: 60
      }
    },
    edges: {
      width: 1.5
    },
    physics: {
      stabilization: {
        iterations: 100,
        fit: true
      },
      barnesHut: {
        gravitationalConstant: -2000,
        centralGravity: 0.3,
        springLength: 150,
        springConstant: 0.04,
        damping: 0.09
      }
    },
    interaction: {
      hover: true,
      tooltipDelay: 200,
      zoomView: true,
      dragView: true
    },
    layout: {
      improvedLayout: true,
      hierarchical: {
        enabled: false
      }
    }
  };
  
  // Destroy existing network if it exists
  if (network) {
    network.destroy();
  }
  
  // Create the network
  network = new Network(graphContainer, data, options);
  
  // Add event listeners for hover effects and tooltips
  network.on('hoverNode', function(params) {
    const node = data.nodes.get(params.node);
    showTooltip(node.data, params.event);
  });
  
  network.on('blurNode', function() {
    hideTooltip();
  });
  
  network.on('hoverEdge', function(params) {
    const edge = data.edges.get(params.edge);
    const fromNode = data.nodes.get(edge.from);
    const toNode = data.nodes.get(edge.to);
    
    const session = sessions.find(s => s.sessionId === edge.data.sessionId);
    const date = new Date(edge.data.timestamp);
    
    const tooltipContent = `
      <strong>Navigation:</strong><br>
      From: ${fromNode.label}<br>
      To: ${toNode.label}<br>
      Time: ${date.toLocaleTimeString()}<br>
      Date: ${date.toLocaleDateString()}<br>
      Session: ${session ? session.sessionId : 'Unknown'}
    `;
    
    showTooltipHTML(tooltipContent, params.event);
  });
  
  network.on('blurEdge', function() {
    hideTooltip();
  });
  
  // Add click event to open page in new tab
  network.on('click', function(params) {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      const node = data.nodes.get(nodeId);
      if (node && node.data && node.data.url) {
        window.open(node.data.url, '_blank');
      }
    }
  });
}

// Show tooltip with page information
function showTooltip(page, event) {
  const firstVisit = new Date(page.firstVisit);
  const lastVisit = new Date(page.lastVisit);
  
  const tooltipContent = `
    <strong>${page.title || 'Untitled'}</strong><br>
    <a href="${page.url}" target="_blank">${truncateString(page.url, 40)}</a><br>
    <br>
    Active time: ${formatTime(page.totalActiveTime || 0)}<br>
    First visit: ${firstVisit.toLocaleString()}<br>
    Last visit: ${lastVisit.toLocaleString()}<br>
    <br>
    <small>Click to open in new tab</small>
  `;
  
  showTooltipHTML(tooltipContent, event);
}

// Show tooltip with HTML content
function showTooltipHTML(html, event) {
  tooltip.innerHTML = html;
  tooltip.style.display = 'block';
  
  // Position the tooltip near the cursor
  const x = event.clientX + 10;
  const y = event.clientY + 10;
  
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

// Hide tooltip
function hideTooltip() {
  tooltip.style.display = 'none';
}

// Set up event listeners
function setupEventListeners() {
  // Session select change
  sessionSelect.addEventListener('change', () => {
    createGraph();
  });
  
  // Refresh button
  refreshButton.addEventListener('click', async () => {
    loadingElement.style.display = 'block';
    loadingElement.textContent = 'Refreshing data...';
    
    try {
      await loadData();
      populateSessionSelect();
      updateStatistics();
      createGraph();
      loadingElement.style.display = 'none';
    } catch (error) {
      console.error('Error refreshing data:', error);
      loadingElement.textContent = 'Error refreshing data. Please try again.';
    }
  });
}

// Helper function to truncate strings
function truncateString(str, maxLength) {
  if (!str) return '';
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

// Helper function to format time in seconds to a readable format
function formatTime(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
} 