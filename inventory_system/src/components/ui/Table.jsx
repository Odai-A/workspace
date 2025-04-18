import React, { useMemo } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';

const Table = ({
  data = [],
  columns = [],
  pagination = true,
  rowsPerPage = 10,
  sortable = true,
  loading = false,
  noDataMessage = 'No data available',
  className = '',
  striped = true,
  hover = true,
  bordered = false,
  compact = false,
  onRowClick,
}) => {
  // Setup table configuration
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: sortable ? getSortedRowModel() : undefined,
    getPaginationRowModel: pagination ? getPaginationRowModel() : undefined,
    initialState: {
      pagination: {
        pageSize: rowsPerPage,
      },
    },
  });

  // Styles configuration
  const tableClasses = `min-w-full divide-y divide-gray-200 ${className}`;
  const headerClasses = 'bg-gray-50';
  const headerCellClasses = 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';
  const bodyClasses = 'divide-y divide-gray-200 bg-white';
  
  const rowClasses = (index) => {
    let classes = '';
    if (striped && index % 2 !== 0) classes += 'bg-gray-50 ';
    if (hover) classes += 'hover:bg-gray-100 ';
    if (onRowClick) classes += 'cursor-pointer ';
    return classes;
  };

  const cellClasses = `px-6 ${compact ? 'py-2' : 'py-4'} text-sm text-gray-500`;
  const borderClasses = bordered ? 'border border-gray-200' : '';
  
  // Loading and empty state components
  const LoadingState = () => (
    <tr>
      <td colSpan={columns.length} className="px-6 py-4 text-center text-sm text-gray-500">
        <div className="flex items-center justify-center">
          <svg className="animate-spin h-5 w-5 mr-3 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading...
        </div>
      </td>
    </tr>
  );

  const EmptyState = () => (
    <tr>
      <td colSpan={columns.length} className="px-6 py-4 text-center text-sm text-gray-500">
        {noDataMessage}
      </td>
    </tr>
  );

  return (
    <div className="overflow-x-auto">
      <table className={`${tableClasses} ${borderClasses}`}>
        {/* Table Header */}
        <thead className={headerClasses}>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th 
                  key={header.id}
                  className={headerCellClasses}
                  onClick={header.column.getToggleSortingHandler()}
                  style={{ cursor: sortable ? 'pointer' : 'default' }}
                >
                  <div className="flex items-center">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    {/* Sort indicators */}
                    {sortable && (
                      <span className="ml-1">
                        {header.column.getIsSorted() === 'asc' ? '↑' : 
                         header.column.getIsSorted() === 'desc' ? '↓' : ''}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        
        {/* Table Body */}
        <tbody className={bodyClasses}>
          {loading ? (
            <LoadingState />
          ) : table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row, index) => (
              <tr 
                key={row.id} 
                className={rowClasses(index)}
                onClick={() => onRowClick && onRowClick(row.original)}
              >
                {row.getVisibleCells().map(cell => (
                  <td 
                    key={cell.id} 
                    className={cellClasses}
                  >
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <EmptyState />
          )}
        </tbody>
      </table>

      {/* Pagination Controls */}
      {pagination && data.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 sm:px-6">
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing{' '}
                <span className="font-medium">
                  {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-medium">
                  {Math.min(
                    (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                    data.length
                  )}
                </span>{' '}
                of <span className="font-medium">{data.length}</span> results
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 ${
                    !table.getCanPreviousPage() ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  Previous
                </button>
                <button
                  className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 ${
                    !table.getCanNextPage() ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Next
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Table;