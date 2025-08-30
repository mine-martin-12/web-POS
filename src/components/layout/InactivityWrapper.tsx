import React from 'react';
import { useInactivityTimeout } from '@/hooks/useInactivityTimeout';

interface InactivityWrapperProps {
  children: React.ReactNode;
  timeoutMinutes?: number;
  warningMinutes?: number;
}

const InactivityWrapper: React.FC<InactivityWrapperProps> = ({ 
  children, 
  timeoutMinutes = 6,
  warningMinutes = 3
}) => {
  // Convert minutes to milliseconds
  const timeout = timeoutMinutes * 60 * 1000;
  const warningTime = warningMinutes * 60 * 1000;

  useInactivityTimeout({ timeout, warningTime });

  return <>{children}</>;
};

export default InactivityWrapper;