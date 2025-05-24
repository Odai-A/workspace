import React from 'react';

/**
 * Component to display warnings about missing or invalid Stripe price IDs
 * This can be shown to administrators to help debug Stripe integration issues
 */
const PriceIdWarning = ({ priceIds }) => {
  const invalidPriceIds = priceIds.filter(({ id, value }) => !value || value === 'undefined' || value.includes('your_'));
  
  if (invalidPriceIds.length === 0) {
    return null;
  }
  
  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6" role="alert">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <p className="text-sm text-yellow-700 font-medium">
            Admin Notice: Missing or Invalid Stripe Price IDs
          </p>
          <div className="mt-2 text-sm text-yellow-700">
            <p>The following Stripe price IDs are missing or invalid:</p>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              {invalidPriceIds.map(({ id, name, value }) => (
                <li key={id}>
                  <strong>{name}:</strong> {value ? `"${value}"` : 'Not set'}
                </li>
              ))}
            </ul>
            <p className="mt-2">
              To fix this issue:
            </p>
            <ol className="list-decimal pl-5 mt-1 space-y-1">
              <li>Create subscription products in your Stripe Dashboard</li>
              <li>Copy the price IDs from your Stripe Dashboard</li>
              <li>Add them to your .env files (backend AND frontend)</li>
              <li>Restart your application</li>
            </ol>
            <p className="mt-2">
              See <a href="/stripe_setup_guide.md" className="text-blue-600 hover:underline">Stripe Setup Guide</a> for details.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PriceIdWarning; 