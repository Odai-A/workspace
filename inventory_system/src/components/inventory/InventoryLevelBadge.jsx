import React from 'react';

const InventoryLevelBadge = ({ quantity, minQuantity }) => {
  // Determine stock level status and color
  let status, bgColor, textColor;
  
  if (quantity <= 0) {
    status = 'Out of Stock';
    bgColor = 'bg-red-100';
    textColor = 'text-red-800';
  } else if (quantity < minQuantity) {
    status = 'Low Stock';
    bgColor = 'bg-yellow-100';
    textColor = 'text-yellow-800';
  } else {
    status = 'In Stock';
    bgColor = 'bg-green-100';
    textColor = 'text-green-800';
  }
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium ${bgColor} ${textColor}`}>
      {status}
    </span>
  );
};

export default InventoryLevelBadge;