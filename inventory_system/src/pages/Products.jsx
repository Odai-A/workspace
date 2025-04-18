import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  QrCodeIcon,
} from '@heroicons/react/24/outline';
import MainLayout from '../components/layout/MainLayout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Table from '../components/ui/Table';
import { useAuth } from '../contexts/AuthContext';

const Products = () => {
  const { apiClient } = useAuth();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    status: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  
  // Sample data for categories and statuses
  const categories = ['All Categories', 'Smart Speakers', 'Streaming Devices', 'E-readers', 'Smart Home', 'Tablets'];
  const statuses = ['All', 'Active', 'Inactive'];
  
  // Sample product data - in a real app, this would come from an API
  const sampleProductData = [
    { 
      id: 1, 
      name: 'Amazon Echo Dot', 
      sku: '123456789012',
      upc: 'AB123456789',
      price: 49.99,
      cost: 25.00,
      category: 'Smart Speakers',
      description: 'Smart speaker with Alexa voice control',
      total_stock: 365,
      min_stock: 50,
      status: 'Active',
      created_at: '2023-01-15T10:00:00Z',
      updated_at: '2023-04-10T14:30:00Z',
      images: ['echo-dot.jpg'],
    },
    { 
      id: 2, 
      name: 'Fire TV Stick', 
      sku: '036000291452',
      upc: 'CD987654321',
      price: 39.99,
      cost: 18.50,
      category: 'Streaming Devices',
      description: 'Stream content to your TV',
      total_stock: 88,
      min_stock: 40,
      status: 'Active',
      created_at: '2023-01-20T11:00:00Z',
      updated_at: '2023-04-12T09:15:00Z',
      images: ['fire-tv-stick.jpg'],
    },
    { 
      id: 3, 
      name: 'Kindle Paperwhite', 
      sku: '042100005264',
      upc: 'EF246813579',
      price: 129.99,
      cost: 75.00,
      category: 'E-readers',
      description: 'E-reader with adjustable light',
      total_stock: 80,
      min_stock: 30,
      status: 'Active',
      created_at: '2023-01-25T09:30:00Z',
      updated_at: '2023-04-11T11:45:00Z',
      images: ['kindle-paperwhite.jpg'],
    },
    { 
      id: 4, 
      name: 'Ring Doorbell', 
      sku: '812345678901',
      upc: 'GH135792468',
      price: 99.99,
      cost: 60.00,
      category: 'Smart Home',
      description: 'Video doorbell with motion detection',
      total_stock: 0,
      min_stock: 15,
      status: 'Active',
      created_at: '2023-02-05T14:00:00Z',
      updated_at: '2023-04-14T08:20:00Z',
      images: ['ring-doorbell.jpg'],
    },
    { 
      id: 5, 
      name: 'Amazon Echo Show', 
      sku: '712345678901',
      upc: 'IJ975318642',
      price: 129.99,
      cost: 80.00,
      category: 'Smart Speakers',
      description: 'Smart display with Alexa',
      total_stock: 37,
      min_stock: 25,
      status: 'Active',
      created_at: '2023-02-10T10:30:00Z',
      updated_at: '2023-04-15T10:10:00Z',
      images: ['echo-show.jpg'],
    },
    { 
      id: 6, 
      name: 'Fire HD Tablet', 
      sku: '612345678901',
      upc: 'KL246813579',
      price: 149.99,
      cost: 90.00,
      category: 'Tablets',
      description: 'HD display tablet',
      total_stock: 12,
      min_stock: 20,
      status: 'Active',
      created_at: '2023-02-15T09:00:00Z',
      updated_at: '2023-04-16T13:45:00Z',
      images: ['fire-tablet.jpg'],
    },
    { 
      id: 7, 
      name: 'Amazon Smart Plug', 
      sku: '512345678901',
      upc: 'MN864213579',
      price: 24.99,
      cost: 10.00,
      category: 'Smart Home',
      description: 'Voice control your lights, fans, and appliances',
      total_stock: 85,
      min_stock: 30,
      status: 'Active',
      created_at: '2023-02-20T15:30:00Z',
      updated_at: '2023-04-16T15:30:00Z',
      images: ['smart-plug.jpg'],
    },
    { 
      id: 8, 
      name: 'Ring Floodlight Cam', 
      sku: '412345678901',
      upc: 'OP753159842',
      price: 199.99,
      cost: 125.00,
      category: 'Smart Home',
      description: 'Motion-activated HD security camera with floodlights',
      total_stock: 28,
      min_stock: 15,
      status: 'Active',
      created_at: '2023-02-25T11:15:00Z',
      updated_at: '2023-04-17T09:20:00Z',
      images: ['floodlight-cam.jpg'],
    },
    { 
      id: 9, 
      name: 'Echo Buds', 
      sku: '312345678901',
      upc: 'QR159753486',
      price: 119.99,
      cost: 70.00,
      category: 'Smart Speakers',
      description: 'Wireless earbuds with dynamic audio and active noise cancellation',
      total_stock: 45,
      min_stock: 20,
      status: 'Inactive',
      created_at: '2023-03-01T14:20:00Z',
      updated_at: '2023-04-10T16:15:00Z',
      images: ['echo-buds.jpg'],
    },
    { 
      id: 10, 
      name: 'Kindle Kids', 
      sku: '212345678901',
      upc: 'ST753951852',
      price: 109.99,
      cost: 60.00,
      category: 'E-readers',
      description: 'Includes a Kindle, 1 year of Amazon Kids+, and a kid-friendly cover',
      total_stock: 50,
      min_stock: 25,
      status: 'Active',
      created_at: '2023-03-05T10:45:00Z',
      updated_at: '2023-04-12T11:30:00Z',
      images: ['kindle-kids.jpg'],
    },
  ];

  // Fetch products data on component mount
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        // In a real app, this would be an API call
        // const response = await apiClient.get('/products');
        // setProducts(response.data);
        
        // Using sample data for now
        setTimeout(() => {
          setProducts(sampleProductData);
          setLoading(false);
        }, 800);
      } catch (error) {
        console.error('Failed to fetch products:', error);
        setLoading(false);
      }
    };
    
    fetchProducts();
  }, []);

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  // Reset filters
  const handleResetFilters = () => {
    setFilters({
      category: '',
      status: '',
    });
    setSearchTerm('');
  };

  // Export to CSV (simplified example)
  const handleExport = () => {
    // Logic to generate and download CSV would go here
    alert('Export functionality would generate a CSV file with the current filtered products data.');
  };

  // Delete product handler (simplified example)
  const handleDeleteProduct = (product) => {
    if (confirm(`Are you sure you want to delete ${product.name}?`)) {
      alert(`Product ${product.name} would be deleted in a real app.`);
    }
  };

  // Apply filters and search to products data
  const filteredProducts = products.filter(product => {
    // Search term filter - match against product name or SKU or UPC
    const matchesSearch = searchTerm === '' || 
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.upc.toLowerCase().includes(searchTerm.toLowerCase());
      
    // Category filter
    const matchesCategory = filters.category === '' || filters.category === 'All Categories' ||
      product.category === filters.category;
      
    // Status filter
    const matchesStatus = filters.status === '' || filters.status === 'All' ||
      product.status === filters.status;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Table columns configuration
  const columns = [
    {
      accessorKey: 'name',
      header: 'Product',
      cell: ({ row }) => (
        <div>
          <Link 
            to={`/products/${row.original.id}`}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            {row.original.name}
          </Link>
          <div className="text-xs text-gray-500 mt-1">SKU: {row.original.sku}</div>
        </div>
      ),
    },
    {
      accessorKey: 'price',
      header: 'Price',
      cell: ({ row }) => (
        <div className="font-medium">${row.original.price.toFixed(2)}</div>
      ),
    },
    {
      accessorKey: 'category',
      header: 'Category',
    },
    {
      accessorKey: 'total_stock',
      header: 'Total Stock',
      cell: ({ row }) => {
        const stockStatus = row.original.total_stock <= 0 
          ? 'text-red-600' 
          : row.original.total_stock < row.original.min_stock 
            ? 'text-yellow-600' 
            : 'text-green-600';
        
        return (
          <div className={`font-medium ${stockStatus}`}>
            {row.original.total_stock}
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium ${
          row.original.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {row.original.status}
        </span>
      ),
    },
    {
      accessorKey: 'updated_at',
      header: 'Last Updated',
      cell: ({ row }) => formatDate(row.original.updated_at),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end space-x-2">
          <button 
            className="p-1 text-blue-600 hover:text-blue-800" 
            title="View Barcode"
            onClick={() => alert(`View barcode for ${row.original.name}`)}
          >
            <QrCodeIcon className="h-5 w-5" />
          </button>
          <button 
            className="p-1 text-gray-600 hover:text-gray-800" 
            title="Edit Product"
            onClick={() => alert(`Edit ${row.original.name}`)}
          >
            <PencilIcon className="h-5 w-5" />
          </button>
          <button 
            className="p-1 text-red-600 hover:text-red-800" 
            title="Delete Product"
            onClick={() => handleDeleteProduct(row.original)}
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <MainLayout>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-600">
            View and manage all products in your inventory
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
            onClick={() => alert('Add product functionality would open a form here')}
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Product
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
                placeholder="Search by product name, SKU, or UPC..."
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
                disabled={!searchTerm && !filters.category && !filters.status}
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
        
        {/* Products Table */}
        <Table 
          data={filteredProducts}
          columns={columns}
          loading={loading}
          pagination
          rowsPerPage={10}
          noDataMessage="No products found. Try adjusting your search or filters."
          onRowClick={(product) => alert(`You clicked on ${product.name}`)}
        />
      </Card>
    </MainLayout>
  );
};

export default Products;