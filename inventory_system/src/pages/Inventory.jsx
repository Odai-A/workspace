import React, { useState, useEffect } from 'react';
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
import InventoryLevelBadge from '../components/inventory/InventoryLevelBadge';
import AddStockModal from '../components/inventory/AddStockModal';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { mockService } from '../services/mockData';

const Inventory = () => {
  const { apiClient } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    location: '',
    status: '',
    category: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [error, setError] = useState(null);
  
  // Sample data for locations, categories, etc.
  const locations = ['All Locations', 'Warehouse A', 'Warehouse B', 'Warehouse C', 'Warehouse D'];
  const categories = ['All Categories', 'Smart Speakers', 'Streaming Devices', 'E-readers', 'Smart Home', 'Tablets'];
  const statuses = ['All', 'In Stock', 'Low Stock', 'Out of Stock'];
  
  // Fetch inventory data on component mount
  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      setLoading(true);
      const data = await mockService.getInventory();
      setInventoryItems(data);
      setError(null);
    } catch (err) {
      console.error('Error loading inventory:', err);
      setError('Failed to load inventory data');
      toast.error('Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      }).format(date);
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  // Reset filters
  const handleResetFilters = () => {
    setFilters({
      location: '',
      status: '',
      category: '',
    });
    setSearchTerm('');
    toast.info('Filters have been reset');
  };

  // Export to CSV
  const handleExport = () => {
    try {
      // Filter items if needed based on current filters/search
      const dataToExport = getFilteredInventory();
      
      // Convert data to CSV format
      const headers = ['Product Name', 'SKU', 'Quantity', 'Min Quantity', 'Location', 'Category', 'Status', 'Last Updated'];
      
      const csvRows = [
        headers.join(','),
        ...dataToExport.map(item => [
          `"${(item.product_name || item.name || '').replace(/"/g, '""')}"`,
          `"${(item.sku || '').replace(/"/g, '""')}"`,
          item.quantity || 0,
          item.min_quantity || 0,
          `"${(item.location || '').replace(/"/g, '""')}"`,
          `"${(item.category || '').replace(/"/g, '""')}"`,
          `"${getInventoryStatus(item.quantity, item.min_quantity)}"`,
          `"${formatDate(item.updated_at || item.last_updated)}"`
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
        const existingProduct = await mockService.getInventoryBySku(newItem.sku);
        
        if (existingProduct) {
          productId = existingProduct.id;
        } else {
          // Create a new product lookup entry
          const productData = {
            name: newItem.name,
            sku: newItem.sku,
            price: newItem.price || 0,
            category: newItem.category || 'Uncategorized',
            condition: newItem.condition || 'New',
            source: 'Manual Entry',
            created_at: new Date().toISOString()
          };
          
          const savedProduct = await mockService.addOrUpdateInventory(productData);
          productId = savedProduct.id;
        }
        
        // Check if inventory item with this SKU already exists
        const existingInventory = await mockService.getInventoryBySku(newItem.sku);
        
        if (existingInventory) {
          // Update existing inventory
          const updatedItem = await mockService.addOrUpdateInventory({
            ...existingInventory,
            quantity: existingInventory.quantity + (newItem.quantity || 0),
            updated_at: new Date().toISOString(),
            last_updated_reason: 'Added stock via form'
          });
          
          addedItems.push(updatedItem);
          toast.info(`Updated quantity for existing item: ${newItem.name}`);
        } else {
          // Add new inventory item
          const inventoryData = {
            product_id: productId,
            product_name: newItem.name,
            sku: newItem.sku,
            quantity: newItem.quantity || 0,
            min_quantity: newItem.min_quantity || 10,
            location: newItem.location,
            category: newItem.category || 'Uncategorized',
            status: 'Active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          const savedItem = await mockService.addOrUpdateInventory(inventoryData);
          addedItems.push(savedItem);
        }
      }
      
      // Refresh inventory list
      loadInventory();
      
      // Show success message
      toast.success(`Added ${addedItems.length} items to inventory`);
    } catch (error) {
      console.error('Error adding inventory items:', error);
      toast.error('Failed to add items to inventory. Please try again.');
    }
  };

  // Handle adjust stock for a specific item
  const handleAdjustStock = async (item) => {
    // For this example, we'll use a prompt to get a quantity adjustment
    // In a real app, this would be a modal with a form
    try {
      const quantityStr = prompt(`Adjust quantity for ${item.product_name}. Current: ${item.quantity}.\nEnter new quantity or +/- value:`);
      
      if (quantityStr === null) return; // User cancelled
      
      let newQuantity;
      if (quantityStr.startsWith('+') || quantityStr.startsWith('-')) {
        // It's an adjustment
        const adjustment = parseInt(quantityStr, 10);
        if (isNaN(adjustment)) {
          toast.error('Please enter a valid number');
          return;
        }
        newQuantity = item.quantity + adjustment;
      } else {
        // It's a new quantity
        newQuantity = parseInt(quantityStr, 10);
        if (isNaN(newQuantity)) {
          toast.error('Please enter a valid number');
          return;
        }
      }
      
      // Ensure quantity is not negative
      newQuantity = Math.max(0, newQuantity);
      
      // Update the inventory
      await mockService.addOrUpdateInventory({
        ...item,
        quantity: newQuantity,
        updated_at: new Date().toISOString(),
        last_updated_reason: 'Manual adjustment'
      });
      
      // Refresh inventory
      loadInventory();
      
      toast.success(`Updated ${item.product_name} quantity to ${newQuantity}`);
    } catch (error) {
      console.error('Error adjusting stock:', error);
      toast.error('Failed to adjust stock. Please try again.');
    }
  };

  // Handle viewing item details
  const handleViewDetails = (item) => {
    navigate(`/products/${item.product_id}`);
  };

  // Delete an inventory item
  const handleDeleteItem = async (item) => {
    if (window.confirm(`Are you sure you want to delete "${item.product_name}" from inventory?`)) {
      try {
        await mockService.deleteInventoryItem(item.id);
        
        // Update the local state
        setInventoryItems(inventoryItems.filter(i => i.id !== item.id));
        
        toast.success(`${item.product_name} has been removed from inventory`);
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
    return inventoryItems.filter(item => {
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
      header: 'Product',
      accessor: 'product_name',
      cell: (row) => (
        <div>
          <div className="font-medium">{row.product_name || row.name}</div>
          <div className="text-sm text-gray-500">SKU: {row.sku}</div>
        </div>
      ),
    },
    {
      header: 'Location',
      accessor: 'location',
    },
    {
      header: 'Quantity',
      accessor: 'quantity',
      cell: (row) => (
        <div className="text-center">{row.quantity}</div>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (row) => (
        <InventoryLevelBadge 
          status={getInventoryStatus(row.quantity, row.min_quantity)}
        />
      ),
    },
    {
      header: 'Last Updated',
      accessor: 'last_updated',
      cell: (row) => (
        <div className="text-sm">
          {formatDate(row.updated_at || row.last_updated)}
        </div>
      ),
    },
    {
      header: 'Actions',
      accessor: 'actions',
      cell: (row) => (
        <div className="flex justify-end space-x-2">
          <button
            onClick={() => handleAdjustStock(row)}
            className="text-blue-600 hover:text-blue-800"
            title="Adjust Stock"
          >
            <AdjustmentsHorizontalIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => handleViewDetails(row)}
            className="text-indigo-600 hover:text-indigo-800"
            title="View Details"
          >
            <ChevronDownIcon className="h-5 w-5" />
          </button>
        </div>
      ),
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
            onClick={() => setShowFilters(!showFilters)}
          >
            <FunnelIcon className="h-5 w-5 mr-2" />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </Button>
          
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
        {/* Search and Filters */}
        <div className="mb-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search by product name or SKU..."
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="secondary" 
                size="sm"
                onClick={handleResetFilters}
                disabled={!searchTerm && !filters.location && !filters.status && !filters.category}
              >
                <ArrowPathIcon className="h-4 w-4 mr-1" />
                Reset
              </Button>
            </div>
          </div>
          
          {/* Advanced Filters */}
          {showFilters && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex flex-wrap gap-4">
                <div className="min-w-[200px]">
                  <label htmlFor="location-filter" className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  <select
                    id="location-filter"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    value={filters.location}
                    onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                  >
                    <option value="">All Locations</option>
                    {locations.filter(loc => loc !== 'All Locations').map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="min-w-[200px]">
                  <label htmlFor="category-filter" className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    id="category-filter"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    value={filters.category}
                    onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                  >
                    <option value="">All Categories</option>
                    {categories.filter(cat => cat !== 'All Categories').map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="min-w-[200px]">
                  <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    id="status-filter"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  >
                    <option value="">All</option>
                    {statuses.filter(s => s !== 'All').map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Inventory Table */}
        <Table 
          data={getFilteredInventory()}
          columns={columns}
          loading={loading}
          pagination
          rowsPerPage={10}
          noDataMessage="No inventory items found. Try adjusting your search or filters."
          onRowClick={handleViewDetails}
        />
      </Card>

      {/* Add Stock Modal */}
      <AddStockModal 
        isOpen={showAddStockModal}
        onClose={() => setShowAddStockModal(false)}
        onAddItems={handleAddItems}
      />
    </div>
  );
};

export default Inventory;