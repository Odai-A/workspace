import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  PencilIcon,
  TrashIcon,
  QrCodeIcon,
  CubeIcon,
  TruckIcon,
  TagIcon,
  ArchiveBoxIcon,
} from '@heroicons/react/24/outline';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { apiClient } = useAuth();
  
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  
  // Sample inventory data - in a real app, this would come from an API
  const [inventoryLocations, setInventoryLocations] = useState([
    { id: 1, location: 'Warehouse A', quantity: 45 },
    { id: 2, location: 'Warehouse B', quantity: 32 },
    { id: 3, location: 'Warehouse C', quantity: 18 },
  ]);

  // Sample transaction data - in a real app, this would come from an API
  const [transactions, setTransactions] = useState([
    { id: 1, type: 'Stock In', quantity: 50, location: 'Warehouse A', date: '2023-04-05T10:30:00Z', user: 'John Doe' },
    { id: 2, type: 'Stock Out', quantity: 5, location: 'Warehouse A', date: '2023-04-06T14:15:00Z', user: 'Jane Smith' },
    { id: 3, type: 'Stock In', quantity: 20, location: 'Warehouse B', date: '2023-04-07T09:45:00Z', user: 'John Doe' },
    { id: 4, type: 'Stock Out', quantity: 3, location: 'Warehouse B', date: '2023-04-08T16:20:00Z', user: 'Jane Smith' },
  ]);

  // Sample product data for testing - in a real app, this would be fetched from an API
  const sampleProductData = [
    { 
      id: 1, 
      name: 'Amazon Echo Dot', 
      sku: '123456789012',
      upc: 'AB123456789',
      asin: 'B07FZ8S74R',
      fnsku: 'X00I3F4G5H',
      price: 49.99,
      cost: 25.00,
      category: 'Smart Speakers',
      description: 'Smart speaker with Alexa voice control. The most popular Echo device with improved sound and a new design.',
      total_stock: 365,
      min_stock: 50,
      status: 'Active',
      created_at: '2023-01-15T10:00:00Z',
      updated_at: '2023-04-10T14:30:00Z',
      images: ['echo-dot.jpg'],
      dimensions: {
        length: 3.9,
        width: 3.9,
        height: 3.5,
        weight: 0.7,
        unit: 'in/lb'
      },
      supplier: 'Amazon',
      tags: ['alexa', 'speaker', 'smart home']
    },
    { 
      id: 2, 
      name: 'Fire TV Stick', 
      sku: '036000291452',
      upc: 'CD987654321',
      asin: 'B08C1W5N87',
      fnsku: 'X00J4G5H6I',
      price: 39.99,
      cost: 18.50,
      category: 'Streaming Devices',
      description: 'Stream content to your TV. Enjoy fast streaming in Full HD.',
      total_stock: 88,
      min_stock: 40,
      status: 'Active',
      created_at: '2023-01-20T11:00:00Z',
      updated_at: '2023-04-12T09:15:00Z',
      images: ['fire-tv-stick.jpg'],
      dimensions: {
        length: 3.4,
        width: 1.2,
        height: 0.5,
        weight: 0.3,
        unit: 'in/lb'
      },
      supplier: 'Amazon',
      tags: ['tv', 'streaming', 'entertainment']
    },
    // Add more sample products as needed
  ];

  // Fetch product data
  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      try {
        // In a real app, this would be an API call
        // const response = await apiClient.get(`/products/${id}`);
        // setProduct(response.data);
        
        // Using sample data for now
        setTimeout(() => {
          const foundProduct = sampleProductData.find(p => p.id === parseInt(id));
          if (foundProduct) {
            setProduct(foundProduct);
          } else {
            setError('Product not found');
            toast.error('Product not found');
          }
          setLoading(false);
        }, 800);
      } catch (error) {
        console.error('Failed to fetch product:', error);
        setError('Failed to fetch product details');
        toast.error('Failed to fetch product details');
        setLoading(false);
      }
    };
    
    fetchProduct();
  }, [id]);

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // Handle delete product
  const handleDeleteProduct = () => {
    if (window.confirm(`Are you sure you want to delete ${product.name}?`)) {
      // In a real app, this would be an API call
      // await apiClient.delete(`/products/${id}`);
      toast.success('Product deleted successfully');
      navigate('/products');
    }
  };

  // Handle edit product
  const handleEditProduct = () => {
    toast.info('Edit product functionality would open a form here');
    // In a real app, this would navigate to an edit form or open a modal
  };

  // Handle generate barcode
  const handleGenerateBarcode = () => {
    toast.info('Barcode generation functionality would be implemented here');
    // In a real app, this would call an API to generate and potentially display a barcode
  };

  // Handle stock operations
  const handleStockOperation = (type) => {
    toast.info(`${type} operation would open a form here`);
    // In a real app, this would open a form or modal to handle stock operations
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <svg className="animate-spin h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div>
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">
                {error || 'Product not found'}
              </p>
            </div>
          </div>
        </div>
        <Button 
          variant="outline" 
          onClick={() => navigate('/products')}
          className="flex items-center"
        >
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          Back to Products
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Header with back button and actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center">
          <Button 
            variant="outline" 
            onClick={() => navigate('/products')}
            className="mr-4"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
            <div className="flex items-center text-gray-500 text-sm">
              <span className="mr-2">SKU: {product.sku}</span>
              <span className="mx-2 text-gray-300">|</span>
              <span>Category: {product.category}</span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            className="flex items-center"
            onClick={() => handleGenerateBarcode()}
          >
            <QrCodeIcon className="h-5 w-5 mr-2" />
            Generate Barcode
          </Button>
          <Button 
            variant="outline" 
            className="flex items-center"
            onClick={() => handleEditProduct()}
          >
            <PencilIcon className="h-5 w-5 mr-2" />
            Edit
          </Button>
          <Button 
            variant="danger" 
            className="flex items-center"
            onClick={() => handleDeleteProduct()}
          >
            <TrashIcon className="h-5 w-5 mr-2" />
            Delete
          </Button>
        </div>
      </div>
      
      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="flex items-center p-4">
          <div className="rounded-full bg-green-100 p-3 mr-4">
            <TagIcon className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Price</p>
            <p className="text-xl font-semibold">${product.price.toFixed(2)}</p>
          </div>
        </Card>
        
        <Card className="flex items-center p-4">
          <div className="rounded-full bg-blue-100 p-3 mr-4">
            <ArchiveBoxIcon className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Stock</p>
            <p className="text-xl font-semibold">{product.total_stock}</p>
          </div>
        </Card>
        
        <Card className="flex items-center p-4">
          <div className="rounded-full bg-yellow-100 p-3 mr-4">
            <CubeIcon className="h-6 w-6 text-yellow-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Min Stock</p>
            <p className="text-xl font-semibold">{product.min_stock}</p>
          </div>
        </Card>
        
        <Card className="flex items-center p-4">
          <div className="rounded-full bg-purple-100 p-3 mr-4">
            <TruckIcon className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <p className="text-xl font-semibold">{product.status}</p>
          </div>
        </Card>
      </div>
      
      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'details'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('details')}
          >
            Product Details
          </button>
          <button
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'inventory'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('inventory')}
          >
            Inventory
          </button>
          <button
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'transactions'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('transactions')}
          >
            Transactions
          </button>
        </nav>
      </div>
      
      {/* Tab Content */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {/* Product Details Tab */}
        {activeTab === 'details' && (
          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-sm text-gray-500">Product Name</p>
                    <p className="text-base font-medium">{product.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">SKU</p>
                    <p className="text-base font-medium">{product.sku}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">UPC</p>
                    <p className="text-base font-medium">{product.upc || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">ASIN</p>
                    <p className="text-base font-medium">{product.asin || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">FNSKU</p>
                    <p className="text-base font-medium">{product.fnsku || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Category</p>
                    <p className="text-base font-medium">{product.category}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Price</p>
                    <p className="text-base font-medium">${product.price.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Cost</p>
                    <p className="text-base font-medium">${product.cost?.toFixed(2) || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Supplier</p>
                    <p className="text-base font-medium">{product.supplier || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <p className="text-base font-medium">{product.status}</p>
                  </div>
                </div>
                
                <h3 className="text-lg font-medium text-gray-900 mb-4">Description</h3>
                <p className="text-base text-gray-700 mb-6">
                  {product.description || 'No description available.'}
                </p>
                
                {product.dimensions && (
                  <>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Dimensions</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                      <div>
                        <p className="text-sm text-gray-500">Length</p>
                        <p className="text-base font-medium">
                          {product.dimensions.length} {product.dimensions.unit.split('/')[0]}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Width</p>
                        <p className="text-base font-medium">
                          {product.dimensions.width} {product.dimensions.unit.split('/')[0]}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Height</p>
                        <p className="text-base font-medium">
                          {product.dimensions.height} {product.dimensions.unit.split('/')[0]}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Weight</p>
                        <p className="text-base font-medium">
                          {product.dimensions.weight} {product.dimensions.unit.split('/')[1]}
                        </p>
                      </div>
                    </div>
                  </>
                )}
                
                {product.tags && product.tags.length > 0 && (
                  <>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Tags</h3>
                    <div className="flex flex-wrap gap-2 mb-6">
                      {product.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Product Image</h3>
                {product.images && product.images.length > 0 ? (
                  <div className="bg-gray-100 rounded-lg p-2">
                    <img
                      src={`/images/${product.images[0]}`}
                      alt={product.name}
                      className="w-full h-auto rounded"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'https://via.placeholder.com/300x300?text=No+Image';
                      }}
                    />
                  </div>
                ) : (
                  <div className="bg-gray-100 rounded-lg p-2 flex items-center justify-center h-64">
                    <p className="text-gray-500">No image available</p>
                  </div>
                )}
                
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Date Information</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-500">Created At</p>
                      <p className="text-base font-medium">{formatDate(product.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Last Updated</p>
                      <p className="text-base font-medium">{formatDate(product.updated_at)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Inventory Tab */}
        {activeTab === 'inventory' && (
          <div className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
              <h3 className="text-lg font-medium text-gray-900">Current Inventory</h3>
              <div className="flex gap-2">
                <Button 
                  variant="success" 
                  className="flex items-center"
                  onClick={() => handleStockOperation('Stock In')}
                >
                  <ArrowLeftIcon className="h-5 w-5 mr-2" />
                  Stock In
                </Button>
                <Button 
                  variant="danger" 
                  className="flex items-center"
                  onClick={() => handleStockOperation('Stock Out')}
                >
                  <ArrowLeftIcon className="h-5 w-5 mr-2 rotate-180" />
                  Stock Out
                </Button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {inventoryLocations.map((loc) => (
                    <tr key={loc.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{loc.location}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{loc.quantity}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Button variant="ghost" size="sm" onClick={() => handleStockOperation('Adjust')}>
                          Adjust
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {inventoryLocations.length === 0 && (
                <p className="py-6 text-center text-gray-500">No inventory data available.</p>
              )}
            </div>
          </div>
        )}
        
        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">Recent Transactions</h3>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          transaction.type === 'Stock In' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {transaction.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{transaction.quantity}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{transaction.location}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatDate(transaction.date)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{transaction.user}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {transactions.length === 0 && (
                <p className="py-6 text-center text-gray-500">No transaction data available.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetail; 