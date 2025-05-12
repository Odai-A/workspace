import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  ChevronDownIcon,
  XMarkIcon,
  ArrowPathIcon,
  AdjustmentsHorizontalIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Table from '../components/ui/Table';
import Pagination from '../components/ui/Pagination';
import InventoryLevelBadge from '../components/inventory/InventoryLevelBadge';
import AddStockModal from '../components/inventory/AddStockModal';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { productLookupService } from '../services/databaseService';

const ITEMS_PER_PAGE = 15;

const Inventory = () => {
  const { apiClient } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState(null);
  
  // Sample data for locations, categories, etc.
  const locations = ['All Locations', 'Warehouse A', 'Warehouse B', 'Warehouse C', 'Warehouse D'];
  const categories = ['All Categories', 'Smart Speakers', 'Streaming Devices', 'E-readers', 'Smart Home', 'Tablets'];
  const statuses = ['All', 'In Stock', 'Low Stock', 'Out of Stock'];
  
  // Debounce search term
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to first page on new search
    }, 500);
    return () => clearTimeout(timerId);
  }, [searchTerm]);

  const fetchInventory = useCallback(async () => {
    console.log("fetchInventory called. Page:", currentPage, "Search:", debouncedSearchTerm);
    setLoading(true);
    setError(null);
    try {
      const result = await productLookupService.getProducts({
        page: currentPage,
        limit: ITEMS_PER_PAGE,
        searchQuery: debouncedSearchTerm,
        // TODO: Add filter parameters here if/when getProducts supports them
        // category: filters.category,
      });
      console.log("fetchInventory - Supabase result:", result);
      setProducts(result.data || []);
      setTotalItems(result.totalCount || 0);
    } catch (err) {
      console.error('Error loading inventory:', err);
      setError('Failed to load inventory data');
      toast.error('Failed to load inventory data');
      setProducts([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
      console.log("fetchInventory finished.");
    }
  }, [currentPage, debouncedSearchTerm]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString(); // Simpler date format
    } catch (error) {
      return 'Invalid Date';
    }
  };
  
  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  // Reset filters
  const handleResetFilters = () => {
    setSearchTerm('');
    toast.info('Filters have been reset');
  };

  // Export to CSV
  const handleExport = () => {
    try {
      // Filter items if needed based on current filters/search
      const dataToExport = products;
      
      // Convert data to CSV format
      const headers = ['Product Description', 'LPN', 'ASIN', 'Quantity', 'MSRP', 'Category'];
      
      const csvRows = [
        headers.join(','),
        ...dataToExport.map(item => [
          `"${(item.Description || '').replace(/"/g, '""')}"`,
          `"${(item['X-Z ASIN'] || '').replace(/"/g, '""')}"`,
          `"${(item['B00 Asin'] || '').replace(/"/g, '""')}"`,
          item.Quantity !== null && item.Quantity !== undefined ? item.Quantity.toString() : 'N/A',
          item.MSRP !== null && item.MSRP !== undefined ? `$${item.MSRP.toFixed(2)}` : 'N/A',
          `"${(item.Category || '').replace(/"/g, '""')}"`
        ].join(','))
      ];
      
      const csvString = csvRows.join('\n');
      
      // Create a download link
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      // Set up CSV file for download
      link.setAttribute('href', url);
      link.setAttribute('download', `inventory_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      
      // Append to document, trigger download and clean up
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Inventory data has been exported to CSV');
    } catch (error) {
      console.error('Error exporting inventory:', error);
      toast.error('Failed to export inventory data');
    }
  };

  // Handle adding stock - open modal
  const handleAddStock = () => {
    setShowAddStockModal(true);
  };

  // Handle adding new items through the modal
  const handleAddItems = async (newItems) => {
    try {
      const addedItems = [];
      
      for (const newItem of newItems) {
        // First, check if the product exists in the product lookup database
        let productId = null;
        const existingProduct = await productLookupService.getProductByFnSku(newItem.FnSku);
        
        if (existingProduct) {
          productId = existingProduct.id;
        } else {
          // Create a new product lookup entry
          const productData = {
            name: newItem.Description,
            FnSku: newItem.FnSku,
            B00Asin: newItem['B00 Asin'],
            category: newItem.Category || 'Uncategorized',
            condition: 'New',
            source: 'Manual Entry',
            created_at: new Date().toISOString()
          };
          
          const savedProduct = await productLookupService.addOrUpdateProduct(productData);
          productId = savedProduct.id;
        }
        
        // Check if inventory item with this SKU already exists
        const existingInventory = await productLookupService.getProductByFnSku(newItem.FnSku);
        
        if (existingInventory) {
          // Update existing inventory
          const updatedItem = await productLookupService.addOrUpdateProduct({
            ...existingInventory,
            quantity: existingInventory.quantity + (newItem.Quantity || 0),
            updated_at: new Date().toISOString(),
            last_updated_reason: 'Added stock via form'
          });
          
          addedItems.push(updatedItem);
          toast.info(`Updated quantity for existing item: ${newItem.Description}`);
        } else {
          // Add new inventory item
          const inventoryData = {
            product_id: productId,
            product_name: newItem.Description,
            FnSku: newItem.FnSku,
            quantity: newItem.Quantity || 0,
            min_quantity: 10,
            location: 'All Locations',
            category: newItem.Category || 'Uncategorized',
            status: 'Active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          const savedItem = await productLookupService.addOrUpdateProduct(inventoryData);
          addedItems.push(savedItem);
        }
      }
      
      // Refresh inventory list
      fetchInventory();
      
      // Show success message
      toast.success(`Added ${addedItems.length} items to inventory`);
    } catch (error) {
      console.error('Error adding inventory items:', error);
      toast.error('Failed to add items to inventory. Please try again.');
    }
  };

  // Handle adjust stock for a specific item
  const handleAdjustStock = (item) => {
    toast.info(`Adjust stock for ${item.Description} (ID: ${item.id}) - Rework needed for Supabase.`);
    // TODO: Implement modal and call productLookupService.saveProductLookup with updated quantity
  };

  // Handle viewing item details
  const handleViewDetails = (item) => {
    if (item["X-Z ASIN"]) {
        navigate(`/scanner?code=${item["X-Z ASIN"]}&type=lpn`); // Example redirect to scanner
    } else {
        toast.info('No LPN to view details with on scanner page.');
    }
  };

  // Delete an inventory item
  const handleDeleteItem = async (item) => {
    if (window.confirm(`Are you sure you want to delete "${item.Description}" from inventory?`)) {
      try {
        await productLookupService.deleteProduct(item.id);
        
        // Update the local state
        setProducts(products.filter(i => i.id !== item.id));
        
        toast.success(`${item.Description} has been removed from inventory`);
      } catch (error) {
        console.error('Error deleting inventory item:', error);
        toast.error('Failed to delete inventory item. Please try again.');
      }
    }
  };

  // Get inventory status based on quantity vs min quantity
  const getInventoryStatus = (quantity, minQuantity) => {
    if (quantity <= 0) return 'Out of Stock';
    if (quantity < minQuantity) return 'Low Stock';
    return 'In Stock';
  };

  // Filter inventory based on search and filters
  const getFilteredInventory = () => {
    return products.filter(item => {
      // Search term filter
      if (searchTerm && !JSON.stringify(item).toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      
      // Location filter
      if (filters.location && filters.location !== 'All Locations' && item.location !== filters.location) {
        return false;
      }
      
      // Category filter
      if (filters.category && filters.category !== 'All Categories' && item.category !== filters.category) {
        return false;
      }
      
      // Status filter
      if (filters.status && filters.status !== 'All') {
        const itemStatus = getInventoryStatus(item.quantity, item.min_quantity);
        if (itemStatus !== filters.status) {
          return false;
        }
      }
      
      return true;
    });
  };

  // Define table columns
  const columns = [
    {
      header: 'Product Description',
      accessor: 'Description',
      cell: (props) => {
        const rowData = props.row.original;
        // console.log("[Inventory.jsx Cell] Product Description Data:", rowData.Description, "LPN:", rowData['X-Z ASIN']);
        return (
          <div>
            <div className="font-medium truncate max-w-xs" title={rowData.Description}>{rowData.Description || 'N/A'}</div>
            <div className="text-xs text-gray-500">LPN: {rowData['X-Z ASIN'] || 'N/A'}</div>
            <div className="text-xs text-gray-500">FNSKU: {rowData['Fn Sku'] || 'N/A'}</div>
            <div className="text-xs text-gray-500">ASIN: {rowData['B00 Asin'] || 'N/A'}</div>
          </div>
        );
      },
    },
    {
      header: 'Qty',
      accessor: 'Quantity',
      cell: (props) => {
        const rowData = props.row.original;
        // console.log("[Inventory.jsx Cell] Qty Data:", rowData.Quantity);
        return (
          <div className="text-center">{rowData.Quantity !== null && rowData.Quantity !== undefined ? rowData.Quantity : 'N/A'}</div>
        );
      },
    },
    {
      header: 'MSRP',
      accessor: 'MSRP',
      cell: (props) => {
        const rowData = props.row.original;
        // console.log("[Inventory.jsx Cell] MSRP Data:", rowData.MSRP);
        return (
          <div className="text-right">{typeof rowData.MSRP === 'number' ? `$${rowData.MSRP.toFixed(2)}` : 'N/A'}</div>
        );
      },
    },
    {
      header: 'Category',
      accessor: 'Category',
    },
    {
      header: 'Actions',
      accessor: 'actions',
      cell: (props) => {
        const rowData = props.row.original;
        return (
          <div className="flex items-center justify-end space-x-1">
            {rowData['B00 Asin'] && (
                <button
                    onClick={(e) => { 
                        e.stopPropagation(); // Prevent onRowClick if any
                        window.open(`https://www.amazon.com/dp/${rowData['B00 Asin']}`, '_blank');
                    }}
                    className="p-1 text-yellow-600 hover:text-yellow-800"
                    title="View on Amazon"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path d="M10.75 1.915H13.25V4.18H11.875V2.95833H9.97917V1.915H10.75Z" />
                        <path fillRule="evenodd" d="M3.8075 18C3.62783 18 3.4725 17.9083 3.38083 17.765C3.28917 17.6217 0.8075 13.9867 0.8075 10.99C0.8075 8.605 1.57417 6.78667 3.1575 5.62C4.23583 4.78167 5.6075 4.375 7.18083 4.375C9.27417 4.375 10.5575 5.13167 11.4575 6.105C12.3575 7.07833 12.8075 8.45 12.8075 10.62C12.8075 10.8733 12.7908 11.1783 12.7575 11.62C12.6825 12.4367 12.4825 13.305 11.9742 14.335C11.5575 15.2033 11.0075 15.96 10.3242 16.55C9.64083 17.1483 8.8075 17.5767 7.78083 17.795C7.53583 17.8367 7.18083 17.86 6.68083 17.86C6.18083 17.86 5.77417 17.8283 5.47417 17.765C5.34917 17.7433 4.99083 17.7033 4.76583 17.63C4.19917 17.49 3.74083 17.2567 3.39083 16.915C2.89083 16.415 2.58583 15.7217 2.58583 14.785C2.58583 13.99 2.93583 13.2517 3.42417 12.785C3.9125 12.3183 4.62417 12.085 5.5575 12.085C6.32417 12.085 6.94917 12.2517 7.4075 12.585C7.87417 12.9183 8.19083 13.405 8.3575 14.04C8.3825 14.155 8.4075 14.2867 8.4075 14.4317C8.4075 14.685 8.33583 14.8967 8.19917 15.065C8.05417 15.2333 7.85417 15.3183 7.59917 15.3183C7.39917 15.3183 7.22417 15.255 7.07417 15.1233C6.91583 15.0083 6.76583 14.785 6.62417 14.4517C6.4825 14.1183 6.31583 13.8733 6.12417 13.715C5.9325 13.5567 5.7075 13.4783 5.44917 13.4783C4.9325 13.4783 4.5075 13.6533 4.17417 14.0033C3.8325 14.3533 3.66583 14.8183 3.66583 15.4C3.66583 15.9167 3.81583 16.3233 4.11583 16.62C4.41583 16.9167 4.82417 17.065 5.34083 17.065C5.7075 17.065 6.02417 16.99 6.29083 16.84C6.5575 16.69 6.79083 16.4817 6.99083 16.215C7.19083 15.9483 7.32417 15.6433 7.39083 15.295C7.4575 14.9467 7.49083 14.5733 7.49083 14.1767C7.49083 12.4717 7.07417 11.1367 6.24083 10.1733C5.4075 9.21 4.2575 8.72833 2.79083 8.72833C1.44083 8.72833 0.374167 9.15667 -0.509167 10.0133C-1.2825 10.7517 -1.67417 11.8683 -1.67417 13.3633C-1.67417 15.8717 -0.450833 18.8117 0.990833 20.015C1.11583 20.1583 1.17417 20.2817 1.17417 20.37C1.17417 20.5233 1.1075 20.6217 0.9825 20.6217L0.974167 20.62Z" clipRule="evenodd" />
                    </svg>
                </button>
            )}
            <button
                onClick={(e) => { e.stopPropagation(); handleAdjustStock(rowData); }}
                className="p-1 text-blue-600 hover:text-blue-800"
                title="Adjust Stock"
            >
                <AdjustmentsHorizontalIcon className="h-5 w-5" />
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); handleViewDetails(rowData); }}
                className="p-1 text-indigo-600 hover:text-indigo-800"
                title="View Details"
            >
                <ChevronDownIcon className="h-5 w-5" />
            </button>
          </div>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500 p-4">
        {error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-600">
            Track and manage stock levels across all locations
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <Button 
            variant="outline" 
            className="flex items-center"
            onClick={handleExport}
          >
            <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
            Export
          </Button>
          
          <Button 
            variant="primary"
            className="flex items-center"
            onClick={handleAddStock}
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Stock
          </Button>
        </div>
      </div>
      
      <Card>
        <div className="p-4">
          <div className="flex-1 relative mb-4">
            <input
              type="text"
              placeholder="Search by LPN, FNSKU, ASIN, or Description..."
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={handleSearchChange}
            />
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>
        
        {loading && products.length === 0 ? (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        ) : !loading && products.length === 0 && !error ? (
            <div className="text-center py-8 text-gray-500">
                No inventory items found. Try a different search.
            </div>
        ) : (
            <>
              {console.log("RENDERING TABLE: products state:", products)} 
              {console.log("RENDERING TABLE: columns state:", columns)} 
              <Table 
                  data={products}
                  columns={columns}
                  loading={loading} 
                  pagination={false} 
                  noDataMessage="No inventory items found. Try a different search."
                  onRowClick={handleViewDetails}
              />
            </>
        )}

        {!loading && totalItems > 0 && (
          <div className="p-4">
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(totalItems / ITEMS_PER_PAGE)}
              onPageChange={handlePageChange}
              totalItems={totalItems}
              itemsPerPage={ITEMS_PER_PAGE}
            />
          </div>
        )}
      </Card>

      {/* Temporarily comment out AddStockModal until its logic is refactored for Supabase */}
      {/* <AddStockModal 
        isOpen={showAddStockModal}
        onClose={() => setShowAddStockModal(false)}
        onAddItems={handleAddItems} 
      /> */}
    </div>
  );
};

export default Inventory;