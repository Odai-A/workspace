import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowDownIcon,
  QrCodeIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';

import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

const InventoryReceive = () => {
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState({
    sku: '',
    name: '',
    quantity: 1,
    location: '',
    notes: ''
  });
  
  // Sample locations - in a real app, these would be fetched from the API
  const locations = ['Warehouse A', 'Warehouse B', 'Warehouse C', 'Warehouse D'];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProduct(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleScanBarcode = () => {
    // Navigate to scanner page with a return URL
    navigate('/scanner?mode=stock_in&return=/inventory/receive');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!product.sku || !product.name || !product.location) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    setLoading(true);
    
    try {
      // In a real app, this would be an API call
      // await apiClient.post('/inventory/receive', product);
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast.success(`Received ${product.quantity} units of ${product.name}`);
      
      // Reset form
      setProduct({
        sku: '',
        name: '',
        quantity: 1,
        location: '',
        notes: ''
      });
    } catch (error) {
      console.error('Error receiving inventory:', error);
      toast.error('Failed to process inventory receipt');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center mb-6">
        <Button 
          variant="outline" 
          onClick={() => navigate('/dashboard')}
          className="mr-4"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">Receive Inventory</h1>
      </div>
      
      <Card className="max-w-3xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium">Product Information</h2>
            <Button
              type="button"
              variant="outline"
              onClick={handleScanBarcode}
              className="flex items-center"
            >
              <QrCodeIcon className="h-5 w-5 mr-2" />
              Scan Barcode
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sku" className="block text-sm font-medium text-gray-700 mb-1">
                SKU / Barcode <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="sku"
                name="sku"
                value={product.sku}
                onChange={handleInputChange}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                required
              />
            </div>
            
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={product.name}
                onChange={handleInputChange}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                required
              />
            </div>
            
            <div>
              <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">
                Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="quantity"
                name="quantity"
                min="1"
                value={product.quantity}
                onChange={handleInputChange}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                required
              />
            </div>
            
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                Location <span className="text-red-500">*</span>
              </label>
              <select
                id="location"
                name="location"
                value={product.location}
                onChange={handleInputChange}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                required
              >
                <option value="">Select location</option>
                {locations.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows="3"
              value={product.notes}
              onChange={handleInputChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          
          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/dashboard')}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="success"
              isLoading={loading}
              disabled={loading}
              className="flex items-center"
            >
              <ArrowDownIcon className="h-5 w-5 mr-2" />
              Receive Inventory
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default InventoryReceive; 