import React, { useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  /** When true, only visible rows mount (TanStack Virtual — same stack as Notion/Airtable-style data grids). */
  virtualized = false,
  /** Stable row id for keys + virtualization (e.g. inventory row key). */
  getRowId,
  /** Default height guess per row before measure (Inventory rows are often tall: image + many lines). */
  estimatedRowHeight = 120,
  virtualOverscan = 12,
  /** Scroll container height for virtual mode (Tailwind classes). */
  virtualScrollClassName = 'max-h-[min(72vh,760px)] overflow-auto rounded-md border border-gray-200 dark:border-gray-700',
  /**
   * CSS grid-template-columns for virtual mode (required for correct layout — `display:block` tbody + `display:table` tr
   * breaks column alignment vs thead in real browsers).
   */
  virtualGridTemplateColumns,
}) => {
  const parentRef = useRef(null);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: sortable ? getSortedRowModel() : undefined,
    getPaginationRowModel: pagination && !virtualized ? getPaginationRowModel() : undefined,
    getRowId: getRowId
      ? (originalRow, index) => {
          const id = getRowId(originalRow);
          return id != null && String(id) !== '' ? String(id) : `row-${index}`;
        }
      : undefined,
    initialState: {
      pagination: {
        pageSize: rowsPerPage,
      },
    },
  });

  const { rows } = table.getRowModel();

  const virtualGridColumns = useMemo(() => {
    if (virtualGridTemplateColumns) return virtualGridTemplateColumns;
    const n = columns.length;
    if (n === 0) return '1fr';
    // Sensible default for Inventory-like tables (select | description | qty | category | actions).
    if (n === 5) {
      return '2.75rem minmax(220px, 2.4fr) minmax(168px, 1.15fr) minmax(100px, 0.85fr) minmax(128px, 0.95fr)';
    }
    return `repeat(${n}, minmax(0, 1fr))`;
  }, [columns.length, virtualGridTemplateColumns]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: virtualOverscan,
    getItemKey: (index) => {
      const row = rows[index];
      return row?.id ?? index;
    },
  });

  useEffect(() => {
    if (virtualized) {
      rowVirtualizer.measure();
    }
  }, [rows.length, virtualized, rowVirtualizer, estimatedRowHeight]);

  /** Rows often grow after images decode; re-measure so virtual offsets stay correct. */
  useEffect(() => {
    if (!virtualized || rows.length === 0) return;
    const t1 = window.setTimeout(() => rowVirtualizer.measure(), 80);
    const t2 = window.setTimeout(() => rowVirtualizer.measure(), 350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [virtualized, rows.length, rowVirtualizer]);

  const tableClasses = `min-w-full divide-y divide-gray-200 dark:divide-gray-700 ${className}`;
  const headerClasses = 'bg-gray-50 dark:bg-gray-700';
  const headerCellClasses = 'px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider';
  const bodyClasses = 'divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800';

  const rowClasses = (index) => {
    let classes = '';
    if (striped && index % 2 !== 0) classes += 'bg-gray-50 dark:bg-gray-700 ';
    if (hover) classes += 'hover:bg-gray-100 dark:hover:bg-gray-700 ';
    if (onRowClick) classes += 'cursor-pointer ';
    return classes;
  };

  const cellClasses = `px-6 ${compact ? 'py-2' : 'py-4'} text-sm text-gray-500 dark:text-gray-400`;
  const borderClasses = bordered ? 'border border-gray-200 dark:border-gray-700' : '';

  const LoadingState = () => (
    <tr>
      <td colSpan={columns.length} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
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
      <td colSpan={columns.length} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
        {noDataMessage}
      </td>
    </tr>
  );

  const headerBlock = (
    <thead className={`${headerClasses} ${virtualized ? 'sticky top-0 z-20 shadow-sm' : ''}`}>
      {table.getHeaderGroups().map((headerGroup) => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map((header) => (
            <th
              key={header.id}
              className={headerCellClasses}
              onClick={header.column.getToggleSortingHandler()}
              style={{ cursor: sortable ? 'pointer' : 'default' }}
            >
              <div className="flex items-center">
                {flexRender(header.column.columnDef.header, header.getContext())}
                {sortable && (
                  <span className="ml-1">
                    {header.column.getIsSorted() === 'asc' ? '↑' : header.column.getIsSorted() === 'desc' ? '↓' : ''}
                  </span>
                )}
              </div>
            </th>
          ))}
        </tr>
      ))}
    </thead>
  );

  const renderClassicBody = () => (
    <tbody className={bodyClasses}>
      {loading ? (
        <LoadingState />
      ) : table.getRowModel().rows.length > 0 ? (
        table.getRowModel().rows.map((row, index) => (
          <tr key={row.id} className={rowClasses(index)} onClick={() => onRowClick && onRowClick(row.original)}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} className={cellClasses}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))
      ) : (
        <EmptyState />
      )}
    </tbody>
  );

  /** Virtual rows use CSS Grid so columns line up with the header (native table + block tbody does not). */
  const renderVirtualizedGrid = () => {
    const headerGroups = table.getHeaderGroups();
    const firstHeaderGroup = headerGroups[0];

    if (loading) {
      return (
        <div className={`${bodyClasses} flex items-center justify-center py-16`}>
          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
            <svg className="animate-spin h-5 w-5 mr-3 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading…
          </div>
        </div>
      );
    }

    if (rows.length === 0 || !firstHeaderGroup) {
      return (
        <div className={`${bodyClasses} py-12 text-center text-sm text-gray-500 dark:text-gray-400`}>
          {noDataMessage}
        </div>
      );
    }

    return (
      <div className={`w-full min-w-[880px] ${borderClasses}`}>
        <div
          role="row"
          className={`grid sticky top-0 z-20 ${headerClasses} shadow-sm border-b border-gray-200 dark:border-gray-600`}
          style={{ gridTemplateColumns: virtualGridColumns }}
        >
          {firstHeaderGroup.headers.map((header) => (
            <div
              key={header.id}
              role="columnheader"
              className={`${headerCellClasses} min-w-0`}
              onClick={header.column.getToggleSortingHandler()}
              style={{ cursor: sortable ? 'pointer' : 'default' }}
            >
              <div className="flex items-center">
                {flexRender(header.column.columnDef.header, header.getContext())}
                {sortable && (
                  <span className="ml-1 shrink-0">
                    {header.column.getIsSorted() === 'asc' ? '↑' : header.column.getIsSorted() === 'desc' ? '↓' : ''}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div
          className="relative w-full bg-white dark:bg-gray-800"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <div
                key={row.id}
                role="row"
                data-index={virtualRow.index}
                ref={typeof rowVirtualizer.measureElement === 'function' ? rowVirtualizer.measureElement : undefined}
                className={`grid absolute left-0 right-0 box-border border-b border-gray-200 dark:border-gray-700 items-start ${rowClasses(virtualRow.index)}`}
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  height: `${virtualRow.size}px`,
                  gridTemplateColumns: virtualGridColumns,
                }}
                onClick={() => onRowClick && onRowClick(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <div
                    key={cell.id}
                    role="gridcell"
                    className={`${cellClasses} min-w-0 break-words [overflow-wrap:anywhere]`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const tableInner = (
    <table className={`${tableClasses} ${borderClasses}`}>
      {headerBlock}
      {renderClassicBody()}
    </table>
  );

  return (
    <div className="overflow-x-auto">
      {virtualized ? (
        <div ref={parentRef} className={virtualScrollClassName}>
          {renderVirtualizedGrid()}
        </div>
      ) : (
        tableInner
      )}

      {pagination && !virtualized && data.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 sm:px-6">
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
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
                  type="button"
                  className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 ${
                    !table.getCanPreviousPage() ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 ${
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
