import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface UseInactivityTimeoutProps {
  timeout?: number; // in milliseconds
  warningTime?: number; // in milliseconds before timeout to show warning
}

export const useInactivityTimeout = ({ 
  timeout = 30 * 60 * 1000, // 30 minutes default
  warningTime = 5 * 60 * 1000 // 5 minutes warning default
}: UseInactivityTimeoutProps = {}) => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const timeoutRef = useRef<NodeJS.Timeout>();
  const warningTimeoutRef = useRef<NodeJS.Timeout>();
  const lastActivityRef = useRef<number>(Date.now());

  const showWarning = useCallback(() => {
    toast({
      title: "Session Expiring Soon",
      description: "You will be logged out in 3 minutes due to inactivity. Click anywhere to stay logged in.",
      variant: "destructive",
      duration: 10000, // Show for 10 seconds
    });
  }, [toast]);

  const handleLogout = useCallback(async () => {
    await signOut();
    toast({
      title: "Logged Out",
      description: "You have been logged out due to inactivity.",
      variant: "destructive",
    });
  }, [signOut, toast]);

  const resetTimeout = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    // Clear existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }

    // Only set timeouts if user is logged in
    if (user) {
      // Set warning timeout
      warningTimeoutRef.current = setTimeout(() => {
        showWarning();
      }, timeout - warningTime);

      // Set logout timeout
      timeoutRef.current = setTimeout(() => {
        handleLogout();
      }, timeout);
    }
  }, [user, timeout, warningTime, showWarning, handleLogout]);

  const handleActivity = useCallback(() => {
    resetTimeout();
  }, [resetTimeout]);

  useEffect(() => {
    if (!user) {
      // Clear timeouts if user is not logged in
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      return;
    }

    // Activity events to monitor
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
    ];

    // Add event listeners
    events.forEach((event) => {
      document.addEventListener(event, handleActivity, true);
    });

    // Initialize timeout
    resetTimeout();

    // Cleanup
    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity, true);
      });
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, [user, handleActivity, resetTimeout]);

  return {
    resetTimeout,
    lastActivity: lastActivityRef.current,
  };
};