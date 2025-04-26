import React from 'react';
import PropTypes from 'prop-types';

/**
 * A reusable page header component for section titles
 */
function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="border-b border-gray-200 pb-4 mb-6 flex justify-between items-center">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex space-x-3">{actions}</div>}
    </div>
  );
}

PageHeader.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  actions: PropTypes.node,
};

export default PageHeader; 