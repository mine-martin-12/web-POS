import React from 'react';
import { Check, X } from 'lucide-react';

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

export interface PasswordValidation {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
  isValid: boolean;
}

export const validatePassword = (password: string): PasswordValidation => {
  const minLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  
  return {
    minLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecialChar,
    isValid: minLength && hasUppercase && hasLowercase && hasNumber && hasSpecialChar,
  };
};

const PasswordStrengthIndicator: React.FC<PasswordStrengthIndicatorProps> = ({ 
  password, 
  className = "" 
}) => {
  const validation = validatePassword(password);

  const requirements = [
    { key: 'minLength', label: 'At least 8 characters', met: validation.minLength },
    { key: 'hasUppercase', label: 'One uppercase letter', met: validation.hasUppercase },
    { key: 'hasLowercase', label: 'One lowercase letter', met: validation.hasLowercase },
    { key: 'hasNumber', label: 'One number', met: validation.hasNumber },
    { key: 'hasSpecialChar', label: 'One special character', met: validation.hasSpecialChar },
  ];

  if (!password) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="text-sm font-medium text-foreground">Password Requirements:</div>
      <div className="space-y-1">
        {requirements.map((req) => (
          <div key={req.key} className="flex items-center gap-2 text-sm">
            {req.met ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <X className="h-4 w-4 text-red-500" />
            )}
            <span className={req.met ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
              {req.label}
            </span>
          </div>
        ))}
      </div>
      {validation.isValid && (
        <div className="text-sm text-green-600 dark:text-green-400 font-medium">
          ✓ Password meets all requirements
        </div>
      )}
    </div>
  );
};

export default PasswordStrengthIndicator;