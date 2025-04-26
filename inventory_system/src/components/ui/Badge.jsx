import React from 'react';

const Badge = ({ children, color = 'gray', size = 'md', className = '', ...props }) => {
  // Define color variants
  const colorVariants = {
    gray: 'bg-gray-100 text-gray-800',
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    purple: 'bg-purple-100 text-purple-800',
    indigo: 'bg-indigo-100 text-indigo-800',
  };

  // Define size variants
  const sizeVariants = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };

  // Get the color and size classes
  const colorClass = colorVariants[color] || colorVariants.gray;
  const sizeClass = sizeVariants[size] || sizeVariants.md;

  return (
    <span 
      className={`inline-flex items-center rounded-md font-medium ${colorClass} ${sizeClass} ${className}`} 
      {...props}
    >
      {children}
    </span>
  );
};

export default Badge; 