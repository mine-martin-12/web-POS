import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface UseInactivityTimeoutProps {
  timeout?: number; // in milliseconds
  warningTime?: number; // in milliseconds before timeout to show warning
}

export const useInactivityTimeout = ({ 
  timeout = 5 * 60 * 1000, // 5 minutes default
  warningTime = 2.5 * 60 * 1000 // 2.5 minutes warning default
}: UseInactivityTimeoutProps = {}) => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const timeoutRef = useRef<NodeJS.Timeout>();
  const warningTimeoutRef = useRef<NodeJS.Timeout>();
  const lastActivityRef = useRef<number>(Date.now());

  const showWarning = useCallback(() => {
    console.log('🚨 Inactivity warning shown');
    toast({
      title: "Session Expiring Soon",
      description: "You will be logged out in 2.5 minutes due to inactivity. Click anywhere to stay logged in.",
      variant: "destructive",
      duration: 30000, // Show for 30 seconds
    });
  }, [toast]);

  const handleLogout = useCallback(async () => {
    console.log('🚪 Auto logout due to inactivity');
    await signOut();
    toast({
      title: "Logged Out",
      description: "You have been logged out due to inactivity.",
      variant: "destructive",
    });
  }, [signOut, toast]);

  const resetTimeout = useCallback(() => {
    lastActivityRef.current = Date.now();
    console.log('⏰ Resetting inactivity timeout');
    
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
      
      console.log(`⏲️ Timeouts set: warning in ${(timeout - warningTime) / 1000}s, logout in ${timeout / 1000}s`);
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

    // Activity events to monitor - reduced sensitivity
    const events = [
      'mousedown',
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