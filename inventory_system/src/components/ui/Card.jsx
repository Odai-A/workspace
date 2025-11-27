import React from 'react';

const Card = ({ 
  children, 
  title,
  subtitle,
  className = '',
  padding = true,
  noDivider = false,
  headerAction,
  footer,
  variant = 'default',
  bordered = true,
  flat = false,
  ...props 
}) => {
  // Variant styles
  const variantStyles = {
    default: '',
    primary: 'border-blue-500',
    success: 'border-green-500',
    danger: 'border-red-500',
    warning: 'border-yellow-500',
    info: 'border-cyan-500',
  };

  const borderStyles = bordered ? `border ${variantStyles[variant]}` : '';
  const shadowStyles = !flat ? 'shadow-sm' : '';
  const paddingStyles = padding ? 'p-5' : '';

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg ${borderStyles} ${shadowStyles} ${className}`} {...props}>
      {/* Card Header */}
      {(title || headerAction) && (
        <div className={`flex items-center justify-between ${noDivider ? '' : 'border-b border-gray-200 dark:border-gray-700'} ${padding ? 'px-5 py-4' : 'p-0'}`}>
          <div>
            {title && <h3 className="text-lg font-medium text-gray-900 dark:text-white">{title}</h3>}
            {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>}
          </div>
          {headerAction && (
            <div className="ml-4">
              {headerAction}
            </div>
          )}
        </div>
      )}
      
      {/* Card Body */}
      <div className={paddingStyles}>
        {children}
      </div>
      
      {/* Card Footer */}
      {footer && (
        <div className={`${noDivider ? '' : 'border-t border-gray-200 dark:border-gray-700'} ${padding ? 'px-5 py-4' : 'p-0'}`}>
          {footer}
        </div>
      )}
    </div>
  );
};

export default Card;