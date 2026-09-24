/**
 * SMART ATTENDANCE MANAGEMENT SYSTEM - FRONTEND ENTRYPOINT
 * 
 * Mounts the top-level React application component tree into the DOM root node.
 * Enables React.StrictMode for early detection of side-effects and deprecated APIs during development.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Locate root DOM container element configured in index.html
const rootElement = document.getElementById('root');

if (rootElement) {
  // Initialize concurrent React root and render application
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  // Critical fallback: Log error if target root DOM container is missing
  console.error("Fatal Error: Target root container '#root' was not found in the document DOM.");
}
