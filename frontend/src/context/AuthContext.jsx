/**
 * Authentication Context Provider
 * ===============================
 * Manages user authentication state, token persistence in localStorage,
 * login session establishment, and logout cleanup across the application.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

// Create React context for authentication state
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // State for active authenticated user profile
  const [user, setUser] = useState(null);
  
  // State indicating whether local credentials are currently being checked
  const [loading, setLoading] = useState(true);

  // Synchronize authentication state on initial component mount
  useEffect(() => {
    // Check local storage for persistent session
    const storedUser = localStorage.getItem('user_profile');
    const accessToken = localStorage.getItem('access_token');

    // If both stored profile and valid access token exist, restore session
    if (storedUser && accessToken) {
      try {
        // Parse cached user JSON object
        setUser(JSON.parse(storedUser));
      } catch (parseError) {
        // In case of malformed local cache, clear storage
        localStorage.clear();
      }
    } else {
      // No active session detected
      setUser(null);
    }

    // Mark initialization check as complete
    setLoading(false);
  }, []);

  /**
   * Authenticates user against backend JWT endpoint and persists tokens.
   */
  const login = async (username, password) => {
    // Dispatch login request to API service
    const response = await api.auth.login(username, password);
    const { access, refresh, user: userProfile } = response.data;

    // Persist session tokens and user profile to browser storage
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    localStorage.setItem('user_profile', JSON.stringify(userProfile));

    // Update in-memory user state
    setUser(userProfile);
    return userProfile;
  };

  /**
   * Destroys active session tokens and resets user state.
   */
  const logout = () => {
    // Remove authentication keys from storage
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_profile');

    // Reset user state to null
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAuthenticated: !!user
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Custom React hook for consuming authentication context.
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  // Guard check to ensure hook is called within provider
  if (!context) {
    throw new Error('useAuth must be consumed within an AuthProvider subtree.');
  }
  return context;
};
