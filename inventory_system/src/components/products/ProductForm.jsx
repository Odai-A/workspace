import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { XMarkIcon } from '@heroicons/react/24/outline';
import Button from '../ui/Button';
import Card from '../ui/Card';

const ProductForm = ({ 
  product = null, 
  onSave, 
  onCancel, 
  isModal = false,
  isLoading = false
}) => {
  const isEditMode = !!product;
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    upc: '',
    asin: '',
    fnsku: '',
    price: '',
    cost: '',
    category: '',
    description: '',
    total_stock: '',
    min_stock: '',
    status: 'Active',
    supplier: '',
    dimensions: {
      length: '',
      width: '',
      height: '',
      weight: '',
      unit: 'in/lb'
    },
    tags: '',
    images: []
  });

  // Categories and statuses options
  const categories = ['Smart Speakers', 'Streaming Devices', 'E-readers', 'Smart Home', 'Tablets'];
  const statuses = ['Active', 'Inactive'];
  
  // Set initial form data when product changes
  useEffect(() => {
    if (product) {
      setFormData({
        ...product,
        // Convert arrays to comma-separated strings for the form
        tags: product.tags ? product.tags.join(', ') : '',
        dimensions: product.dimensions || {
          length: '',
          width: '',
          height: '',
          weight: '',
          unit: 'in/lb'
        }
      });
    }
  }, [product]);

  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name.includes('.')) {
      // Handle nested objects (like dimensions.length)
      const [parent, child] = name.split('.');
      setFormData({
        ...formData,
        [parent]: {
          ...formData[parent],
          [child]: value
        }
      });
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };

  // Handle numeric input changes
  const handleNumericChange = (e) => {
    const { name, value } = e.target;
    
    // Allow empty values or valid numbers
    if (value === '' || !isNaN(value)) {
      if (name.includes('.')) {
        // Handle nested objects (like dimensions.length)
        const [parent, child] = name.split('.');
        setFormData({
          ...formData,
          [parent]: {
            ...formData[parent],
            [child]: value
          }
        });
      } else {
        setFormData({
          ...formData,
          [name]: value
        });
      }
    }
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.name || !formData.sku || !formData.price) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    // Process form data for submission
    const processedData = {
      ...formData,
      // Convert string values to appropriate types
      price: parseFloat(formData.price),
      cost: formData.cost ? parseFloat(formData.cost) : null,
      total_stock: formData.total_stock ? parseInt(formData.total_stock) : 0,
      min_stock: formData.min_stock ? parseInt(formData.min_stock) : 0,
      // Convert comma-separated tags back to array
      tags: formData.tags ? formData.tags.split(',').map(tag => tag.trim()).filter(Boolean) : [],
      // Process dimensions
      dimensions: {
        length: formData.dimensions.length ? parseFloat(formData.dimensions.length) : null,
        width: formData.dimensions.width ? parseFloat(formData.dimensions.width) : null,
        height: formData.dimensions.height ? parseFloat(formData.dimensions.height) : null,
        weight: formData.dimensions.weight ? parseFloat(formData.dimensions.weight) : null,
        unit: formData.dimensions.unit
      }
    };
    
    onSave(processedData);
  };

  // Component layout
  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information Section */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Product Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              required
              maxLength={255}
            />
          </div>
          
          <div>
            <label htmlFor="sku" className="block text-sm font-medium text-gray-700 mb-1">
              SKU <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="sku"
              name="sku"
              value={formData.sku}
              onChange={handleChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              required
              maxLength={100}
            />
          </div>
          
          <div>
            <label htmlFor="upc" className="block text-sm font-medium text-gray-700 mb-1">
              UPC
            </label>
            <input
              type="text"
              id="upc"
              name="upc"
              value={formData.upc}
              onChange={handleChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              maxLength={100}
            />
          </div>
          
          <div>
            <label htmlFor="asin" className="block text-sm font-medium text-gray-700 mb-1">
              ASIN
            </label>
            <input
              type="text"
              id="asin"
              name="asin"
              value={formData.asin}
              onChange={handleChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              maxLength={100}
            />
          </div>
          
          <div>
            <label htmlFor="fnsku" className="block text-sm font-medium text-gray-700 mb-1">
              FNSKU
            </label>
            <input
              type="text"
              id="fnsku"
              name="fnsku"
              value={formData.fnsku}
              onChange={handleChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              maxLength={100}
            />
          </div>
          
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              required
            >
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
              Price <span className="text-red-500">*</span>
            </label>
            <div className="relative rounded-md shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                type="text"
                id="price"
                name="price"
                value={formData.price}
                onChange={handleNumericChange}
                className="block w-full rounded-md border-gray-300 pl-7 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="0.00"
                required
              />
            </div>
          </div>
          
          <div>
            <label htmlFor="cost" className="block text-sm font-medium text-gray-700 mb-1">
              Cost
            </label>
            <div className="relative rounded-md shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                type="text"
                id="cost"
                name="cost"
                value={formData.cost}
                onChange={handleNumericChange}
                className="block w-full rounded-md border-gray-300 pl-7 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="0.00"
              />
            </div>
          </div>
          
          <div>
            <label htmlFor="total_stock" className="block text-sm font-medium text-gray-700 mb-1">
              Total Stock
            </label>
            <input
              type="number"
              id="total_stock"
              name="total_stock"
              value={formData.total_stock}
              onChange={handleNumericChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              min="0"
              step="1"
            />
          </div>
          
          <div>
            <label htmlFor="min_stock" className="block text-sm font-medium text-gray-700 mb-1">
              Minimum Stock
            </label>
            <input
              type="number"
              id="min_stock"
              name="min_stock"
              value={formData.min_stock}
              onChange={handleNumericChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              min="0"
              step="1"
            />
          </div>
          
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="supplier" className="block text-sm font-medium text-gray-700 mb-1">
              Supplier
            </label>
            <input
              type="text"
              id="supplier"
              name="supplier"
              value={formData.supplier}
              onChange={handleChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              maxLength={100}
            />
          </div>
        </div>
      </div>
      
      {/* Description Section */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">Description</h2>
        <div>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={4}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            placeholder="Product description..."
          />
        </div>
      </div>
      
      {/* Dimensions Section */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">Dimensions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label htmlFor="dimensions.length" className="block text-sm font-medium text-gray-700 mb-1">
              Length
            </label>
            <input
              type="text"
              id="dimensions.length"
              name="dimensions.length"
              value={formData.dimensions.length}
              onChange={handleNumericChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="0.0"
            />
          </div>
          
          <div>
            <label htmlFor="dimensions.width" className="block text-sm font-medium text-gray-700 mb-1">
              Width
            </label>
            <input
              type="text"
              id="dimensions.width"
              name="dimensions.width"
              value={formData.dimensions.width}
              onChange={handleNumericChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="0.0"
            />
          </div>
          
          <div>
            <label htmlFor="dimensions.height" className="block text-sm font-medium text-gray-700 mb-1">
              Height
            </label>
            <input
              type="text"
              id="dimensions.height"
              name="dimensions.height"
              value={formData.dimensions.height}
              onChange={handleNumericChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="0.0"
            />
          </div>
          
          <div>
            <label htmlFor="dimensions.weight" className="block text-sm font-medium text-gray-700 mb-1">
              Weight
            </label>
            <input
              type="text"
              id="dimensions.weight"
              name="dimensions.weight"
              value={formData.dimensions.weight}
              onChange={handleNumericChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="0.0"
            />
          </div>
          
          <div>
            <label htmlFor="dimensions.unit" className="block text-sm font-medium text-gray-700 mb-1">
              Unit
            </label>
            <select
              id="dimensions.unit"
              name="dimensions.unit"
              value={formData.dimensions.unit}
              onChange={handleChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="in/lb">inches / pounds</option>
              <option value="cm/kg">centimeters / kilograms</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Tags Section */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">Tags</h2>
        <div>
          <input
            type="text"
            id="tags"
            name="tags"
            value={formData.tags}
            onChange={handleChange}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            placeholder="Enter tags separated by commas (e.g. tag1, tag2, tag3)"
          />
          <p className="mt-1 text-sm text-gray-500">
            Enter tags separated by commas
          </p>
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex justify-end space-x-3 pt-4 border-t">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          variant="primary"
          disabled={isLoading}
        >
          {isLoading ? 'Saving...' : isEditMode ? 'Update Product' : 'Create Product'}
        </Button>
      </div>
    </form>
  );

  // If this is a modal, wrap in a Card
  if (isModal) {
    return (
      <Card className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">
            {isEditMode ? 'Edit Product' : 'Add New Product'}
          </h1>
          <button
            type="button"
            className="rounded-md text-gray-400 hover:text-gray-500"
            onClick={onCancel}
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        {formContent}
      </Card>
    );
  }

  // Otherwise return just the form
  return formContent;
};

export default ProductForm; 