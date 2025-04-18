import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  ChevronDownIcon,
  XMarkIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import MainLayout from '../components/layout/MainLayout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Table from '../components/ui/Table';
import InventoryLevelBadge from '../components/inventory/InventoryLevelBadge';
import { useAuth } from '../contexts/AuthContext';

const Inventory = () => {
  const { apiClient } = useAuth();
  const [loading, setLoading] = useState(true);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    location: '',
    status: '',
    category: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  
  // Sample data for locations, categories, etc.
  const locations = ['All Locations', 'Warehouse A', 'Warehouse B', 'Warehouse C', 'Warehouse D'];
  const categories = ['All Categories', 'Smart Speakers', 'Streaming Devices', 'E-readers', 'Smart Home', 'Tablets'];
  const statuses = ['All', 'In Stock', 'Low Stock', 'Out of Stock'];
  
  // Sample inventory data - in a real app, this would come from an API
  const sampleInventoryData = [
    { 
      id: 1, 
      product_id: 1,
      product_name: 'Amazon Echo Dot', 
      sku: '123456789012', 
      location: 'Warehouse A', 
      quantity: 245, 
      min_quantity: 50,
      category: 'Smart Speakers',
      last_updated: '2023-04-15T14:30:00Z' 
    },
    { 
      id: 2, 
      product_id: 1,
      product_name: 'Amazon Echo Dot', 
      sku: '123456789012', 
      location: 'Warehouse B', 
      quantity: 120, 
      min_quantity: 50,
      category: 'Smart Speakers',
      last_updated: '2023-04-15T14:30:00Z' 
    },
    { 
      id: 3, 
      product_id: 2,
      product_name: 'Fire TV Stick', 
      sku: '036000291452', 
      location: 'Warehouse A', 
      quantity: 30, 
      min_quantity: 40,
      category: 'Streaming Devices',
      last_updated: '2023-04-16T09:15:00Z' 
    },
    { 
      id: 4, 
      product_id: 2,
      product_name: 'Fire TV Stick', 
      sku: '036000291452', 
      location: 'Warehouse C', 
      quantity: 58, 
      min_quantity: 40,
      category: 'Streaming Devices',
      last_updated: '2023-04-16T09:15:00Z' 
    },
    { 
      id: 5, 
      product_id: 3,
      product_name: 'Kindle Paperwhite', 
      sku: '042100005264', 
      location: 'Warehouse B', 
      quantity: 62, 
      min_quantity: 30,
      category: 'E-readers',
      last_updated: '2023-04-16T11:45:00Z' 
    },
    { 
      id: 6, 
      product_id: 3,
      product_name: 'Kindle Paperwhite', 
      sku: '042100005264', 
      location: 'Warehouse D', 
      quantity: 18, 
      min_quantity: 30,
      category: 'E-readers',
      last_updated: '2023-04-16T11:45:00Z' 
    },
    { 
      id: 7, 
      product_id: 4,
      product_name: 'Ring Doorbell', 
      sku: '812345678901', 
      location: 'Warehouse C', 
      quantity: 0, 
      min_quantity: 15,
      category: 'Smart Home',
      last_updated: '2023-04-17T08:20:00Z' 
    },
    { 
      id: 8, 
      product_id: 5,
      product_name: 'Amazon Echo Show', 
      sku: '712345678901', 
      location: 'Warehouse A', 
      quantity: 37, 
      min_quantity: 25,
      category: 'Smart Speakers',
      last_updated: '2023-04-17T10:10:00Z' 
    },
    { 
      id: 9, 
      product_id: 6,
      product_name: 'Fire HD Tablet', 
      sku: '612345678901', 
      location: 'Warehouse B', 
      quantity: 12, 
      min_quantity: 20,
      category: 'Tablets',
      last_updated: '2023-04-17T13:45:00Z' 
    },
    { 
      id: 10, 
      product_id: 7,
      product_name: 'Amazon Smart Plug', 
      sku: '512345678901', 
      location: 'Warehouse D', 
      quantity: 85, 
      min_quantity: 30,
      category: 'Smart Home',
      last_updated: '2023-04-17T15:30:00Z' 
    },
  ];

  // Fetch inventory data on component mount
  useEffect(() => {
    const fetchInventory = async () => {
      setLoading(true);
      try {
        // In a real app, this would be an API call
        // const response = await apiClient.get('/inventory');
        // setInventoryItems(response.data);
        
        // Using sample data for now
        setTimeout(() => {
          setInventoryItems(sampleInventoryData);
          setLoading(false);
        }, 800);
      } catch (error) {
        console.error('Failed to fetch inventory:', error);
        setLoading(false);
      }
    };
    
    fetchInventory();
  }, []);

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(date);
  };

  // Reset filters
  const handleResetFilters = () => {
    setFilters({
      location: '',
      status: '',
      category: '',
    });
    setSearchTerm('');
  };

  // Export to CSV (simplified example)
  const handleExport = () => {
    // Logic to generate and download CSV would go here
    alert('Export functionality would generate a CSV file with the current filtered inventory data.');
  };

  // Apply filters and search to inventory data
  const filteredInventory = inventoryItems.filter(item => {
    // Search term filter - match against product name or SKU
    const matchesSearch = searchTerm === '' || 
      item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      item.sku.toLowerCase().includes(searchTerm.toLowerCase());
      
    // Location filter
    const matchesLocation = filters.location === '' || filters.location === 'All Locations' ||
      item.location === filters.location;
      
    // Category filter
    const matchesCategory = filters.category === '' || filters.category === 'All Categories' ||
      item.category === filters.category;
      
    // Status filter
    let matchesStatus = true;
    if (filters.status) {
      const status = getInventoryStatus(item.quantity, item.min_quantity);
      matchesStatus = filters.status === 'All' || filters.status === status;
    }
    
    return matchesSearch && matchesLocation && matchesCategory && matchesStatus;
  });

  // Determine inventory status
  const getInventoryStatus = (quantity, minQuantity) => {
    if (quantity <= 0) return 'Out of Stock';
    if (quantity < minQuantity) return 'Low Stock';
    return 'In Stock';
  };

  // Table columns configuration
  const columns = [
    {
      accessorKey: 'product_name',
      header: 'Product',
      cell: ({ row }) => (
        <div>
          <Link 
            to={`/products/${row.original.product_id}`}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            {row.original.product_name}
          </Link>
          <div className="text-xs text-gray-500 mt-1">SKU: {row.original.sku}</div>
        </div>
      ),
    },
    {
      accessorKey: 'location',
      header: 'Location',
    },
    {
      accessorKey: 'quantity',
      header: 'Quantity',
      cell: ({ row }) => (
        <div className="font-medium">{row.original.quantity}</div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <InventoryLevelBadge 
          quantity={row.original.quantity} 
          minQuantity={row.original.min_quantity} 
        />
      ),
    },
    {
      accessorKey: 'category',
      header: 'Category',
    },
    {
      accessorKey: 'last_updated',
      header: 'Last Updated',
      cell: ({ row }) => formatDate(row.original.last_updated),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end space-x-2">
          <Button variant="ghost" size="sm">Adjust</Button>
          <Button variant="outline" size="sm">Details</Button>
        </div>
      ),
    },
  ];

  return (
    <MainLayout>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-600">
            View and manage your inventory across all locations
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
            onClick={() => alert('Add inventory item functionality would open a form here')}
          >
            Add Inventory
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
          data={filteredInventory}
          columns={columns}
          loading={loading}
          pagination
          rowsPerPage={10}
          noDataMessage="No inventory items found. Try adjusting your search or filters."
        />
      </Card>
    </MainLayout>
  );
};

export default Inventory;