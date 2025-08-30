import React, { useEffect, useState } from 'react';

interface CSRFToken {
  token: string;
  timestamp: number;
}

const CSRF_TOKEN_KEY = 'csrf_token';
const TOKEN_EXPIRY = 3600000; // 1 hour in milliseconds

export const useCSRFProtection = () => {
  const [csrfToken, setCSRFToken] = useState<string>('');

  // Generate a new CSRF token
  const generateToken = (): string => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };

  // Get or create CSRF token
  const getCSRFToken = (): string => {
    try {
      const stored = localStorage.getItem(CSRF_TOKEN_KEY);
      if (stored) {
        const parsed: CSRFToken = JSON.parse(stored);
        const now = Date.now();
        
        // Check if token is still valid
        if (now - parsed.timestamp < TOKEN_EXPIRY) {
          return parsed.token;
        }
      }
    } catch (error) {
      console.warn('Error reading CSRF token from storage:', error);
    }

    // Generate new token
    const newToken = generateToken();
    const tokenData: CSRFToken = {
      token: newToken,
      timestamp: Date.now()
    };

    try {
      localStorage.setItem(CSRF_TOKEN_KEY, JSON.stringify(tokenData));
    } catch (error) {
      console.warn('Error storing CSRF token:', error);
    }

    return newToken;
  };

  // Validate CSRF token
  const validateCSRFToken = (token: string): boolean => {
    const currentToken = getCSRFToken();
    return token === currentToken;
  };

  // Get headers with CSRF token
  const getCSRFHeaders = (): Record<string, string> => {
    return {
      'X-CSRF-Token': getCSRFToken(),
      'Content-Type': 'application/json'
    };
  };

  useEffect(() => {
    const token = getCSRFToken();
    setCSRFToken(token);
  }, []);

  return {
    csrfToken,
    getCSRFToken,
    validateCSRFToken,
    getCSRFHeaders,
    refreshToken: () => {
      localStorage.removeItem(CSRF_TOKEN_KEY);
      const newToken = getCSRFToken();
      setCSRFToken(newToken);
    }
  };
};

// Higher-order component for CSRF protection
export const withCSRFProtection = (
  WrappedComponent: React.ComponentType<any>
) => {
  const CSRFProtectedComponent = (props: any) => {
    const csrf = useCSRFProtection();
    
    return React.createElement(WrappedComponent, { ...props, csrf });
  };

  CSRFProtectedComponent.displayName = `withCSRFProtection(${WrappedComponent.displayName || WrappedComponent.name})`;
  
  return CSRFProtectedComponent;
};