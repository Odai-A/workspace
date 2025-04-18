import React, { forwardRef } from 'react';

const Input = forwardRef(({
  type = 'text',
  label,
  placeholder,
  error,
  helperText,
  fullWidth = false,
  disabled = false,
  required = false,
  className = '',
  id,
  name,
  onChange,
  onBlur,
  value,
  defaultValue,
  ...props
}, ref) => {
  // Generate ID for the input if not provided
  const inputId = id || `input-${name}-${Math.random().toString(36).substring(2, 9)}`;
  
  // Base styles
  const baseInputStyles = 'block rounded-md shadow-sm border-gray-300 focus:ring-blue-500 focus:border-blue-500 sm:text-sm';
  
  // Width styles
  const widthStyles = fullWidth ? 'w-full' : '';
  
  // Error styles
  const errorStyles = error ? 'border-red-300 text-red-900 placeholder-red-300 focus:outline-none focus:ring-red-500 focus:border-red-500' : '';
  
  // Disabled styles
  const disabledStyles = disabled ? 'bg-gray-100 cursor-not-allowed' : '';
  
  return (
    <div className={`${fullWidth ? 'w-full' : ''} ${className}`}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          type={type}
          id={inputId}
          name={name}
          className={`
            ${baseInputStyles}
            ${widthStyles}
            ${errorStyles}
            ${disabledStyles}
          `}
          placeholder={placeholder}
          disabled={disabled}
          ref={ref}
          onChange={onChange}
          onBlur={onBlur}
          value={value}
          defaultValue={defaultValue}
          required={required}
          {...props}
        />
        {type === 'password' && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            {/* Password toggle icon could go here in a real implementation */}
          </div>
        )}
      </div>
      {(error || helperText) && (
        <p className={`mt-1 text-sm ${error ? 'text-red-600' : 'text-gray-500'}`}>
          {error || helperText}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;