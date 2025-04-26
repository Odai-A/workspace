import React, { useState, useRef } from 'react';
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  PlusIcon,
  DocumentTextIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { toast } from 'react-toastify';

const AddStockModal = ({ isOpen, onClose, onAddItems }) => {
  const [activeTab, setActiveTab] = useState('manual'); // 'manual' or 'import'
  const [items, setItems] = useState([{ sku: '', name: '', quantity: 1, location: '', category: '' }]);
  const [importedItems, setImportedItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);
  
  // Sample locations and categories - in a real app, these would be fetched from the API
  const locations = ['Warehouse A', 'Warehouse B', 'Warehouse C', 'Warehouse D'];
  const categories = ['Smart Speakers', 'Streaming Devices', 'E-readers', 'Smart Home', 'Tablets'];

  // Handle adding a new item row in manual entry
  const handleAddItemRow = () => {
    setItems([...items, { sku: '', name: '', quantity: 1, location: '', category: '' }]);
  };

  // Handle removing an item row in manual entry
  const handleRemoveItemRow = (index) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  // Handle item field changes in manual entry
  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    
    // Ensure valid quantity values
    if (field === 'quantity') {
      // Convert to number and ensure it's positive and not 0
      const numValue = parseInt(value, 10);
      newItems[index][field] = isNaN(numValue) || numValue <= 0 ? 1 : numValue;
    } else {
      newItems[index][field] = value;
    }
    
    setItems(newItems);
  };

  // Parse CSV data
  const parseCSV = (text) => {
    try {
      // Split the text by new lines
      const lines = text.split(/\r\n|\n/);
      
      // Extract headers from the first line
      const headers = lines[0].split(',').map(header => header.trim().toLowerCase());
      
      // Map expected column names
      const columnMap = {
        'sku': ['sku', 'barcode', 'upc', 'ean'],
        'name': ['name', 'product', 'item', 'description', 'title'],
        'quantity': ['quantity', 'qty', 'count', 'amount'],
        'location': ['location', 'warehouse', 'store'],
        'category': ['category', 'type', 'group']
      };
      
      // Find the index for each column
      const columnIndices = {};
      for (const [key, possibleHeaders] of Object.entries(columnMap)) {
        const index = headers.findIndex(h => possibleHeaders.includes(h));
        if (index !== -1) {
          columnIndices[key] = index;
        }
      }
      
      // If required columns are missing, throw an error
      if (!('sku' in columnIndices) || !('name' in columnIndices)) {
        throw new Error('CSV is missing required columns (SKU/Barcode and Product Name)');
      }
      
      // Parse the data rows
      const items = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue; // Skip empty lines
        
        const values = lines[i].split(',').map(val => val.trim());
        
        // Skip if we don't have enough values
        if (values.length < Math.max(...Object.values(columnIndices)) + 1) continue;
        
        const item = {
          id: i - 1,
          sku: columnIndices.sku !== undefined ? values[columnIndices.sku] : '',
          name: columnIndices.name !== undefined ? values[columnIndices.name] : '',
          quantity: columnIndices.quantity !== undefined ? parseInt(values[columnIndices.quantity], 10) || 1 : 1,
          location: columnIndices.location !== undefined ? values[columnIndices.location] : '',
          category: columnIndices.category !== undefined ? values[columnIndices.category] : ''
        };
        
        // Only add items with SKU and name, and ensure quantity is at least 1
        if (item.sku && item.name) {
          if (item.quantity <= 0) item.quantity = 1;
          items.push(item);
        }
      }
      
      return items;
    } catch (error) {
      console.error('Error parsing CSV:', error);
      throw error;
    }
  };

  // Handle file import
  const handleFileImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file extension
    const fileExtension = file.name.split('.').pop().toLowerCase();
    if (fileExtension !== 'csv') {
      toast.error('Please upload a CSV file');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        // Parse the CSV file
        const items = parseCSV(event.target.result);
        
        if (items.length === 0) {
          toast.error('No valid items found in the CSV file');
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          return;
        }
        
        // Validate items have required fields
        const invalidItems = items.filter(item => !item.sku || !item.name);
        if (invalidItems.length > 0) {
          toast.warning(`${invalidItems.length} items were skipped due to missing SKU or name`);
        }
        
        // Set the imported items
        setImportedItems(items);
        toast.success(`Successfully imported ${items.length} items`);
      } catch (error) {
        console.error('Error parsing file:', error);
        toast.error(`Failed to parse the file: ${error.message || 'Please check the format'}`);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    
    reader.onerror = () => {
      toast.error('Failed to read the file');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    
    reader.readAsText(file);
  };

  // Handle form submission for manual entry
  const handleManualSubmit = async () => {
    // Validate items
    const invalidItems = items.filter(item => !item.sku || !item.name || !item.location);
    if (invalidItems.length > 0) {
      toast.error('Please fill in all required fields (SKU, Name, Location) for all items');
      return;
    }

    // Ensure all quantities are positive numbers
    const invalidQuantities = items.filter(item => isNaN(item.quantity) || item.quantity <= 0);
    if (invalidQuantities.length > 0) {
      toast.error('Quantity must be a positive number for all items');
      return;
    }

    setIsSubmitting(true);
    try {
      // Ensure all items have a timestamp and required fields
      const processedItems = items.map(item => ({
        ...item,
        quantity: parseInt(item.quantity, 10),
        min_quantity: 10, // Default min quantity
        condition: 'New', // Default condition
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'Active'
      }));
      
      // Pass the items to the parent component which will handle persistence
      await onAddItems(processedItems);
      
      // Reset form and close modal
      setItems([{ sku: '', name: '', quantity: 1, location: '', category: '' }]);
      onClose();
      
    } catch (error) {
      console.error('Error adding stock:', error);
      toast.error('Failed to add stock items. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle form submission for imported items
  const handleImportSubmit = async () => {
    if (importedItems.length === 0) {
      toast.error('Please import items before submitting');
      return;
    }

    setIsSubmitting(true);
    try {
      // Ensure all items have a timestamp and required fields
      const processedItems = importedItems.map(item => ({
        ...item,
        quantity: parseInt(item.quantity, 10),
        min_quantity: 10, // Default min quantity
        condition: 'New', // Default condition
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'Active'
      }));
      
      // Pass the items to the parent component which will handle persistence
      await onAddItems(processedItems);
      
      // Reset form and close modal
      setImportedItems([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onClose();
      
    } catch (error) {
      console.error('Error adding imported stock:', error);
      toast.error('Failed to add imported items. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Download sample template
  const handleDownloadTemplate = () => {
    const csvContent = "SKU,Name,Quantity,Location,Category\n123456789,Product Name,10,Warehouse A,Category";
    
    // Create a blob and download it
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    // Create a URL for the blob
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'inventory_import_template.csv');
    
    // Append the link, click it, and remove it
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Template downloaded successfully');
  };

  // Reset the form when the modal closes
  const handleClose = () => {
    setItems([{ sku: '', name: '', quantity: 1, location: '', category: '' }]);
    setImportedItems([]);
    setActiveTab('manual');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Stock" size="lg">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          className={`py-2 px-4 ${
            activeTab === 'manual'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('manual')}
        >
          Manual Entry
        </button>
        <button
          className={`py-2 px-4 ${
            activeTab === 'import'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('import')}
        >
          Import from CSV
        </button>
      </div>

      {/* Manual Entry Tab */}
      {activeTab === 'manual' && (
        <div>
          <div className="mb-4">
            <p className="text-sm text-gray-600">
              Add items manually by filling in the details below. Click "Add Item" to add multiple items.
            </p>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.map((item, index) => (
              <div key={index} className="flex flex-wrap gap-3 mb-3 pb-3 border-b border-gray-200">
                <div className="w-full md:w-[calc(25%-0.75rem)]">
                  <label htmlFor={`sku-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                    SKU / Barcode*
                  </label>
                  <input
                    type="text"
                    id={`sku-${index}`}
                    value={item.sku}
                    onChange={(e) => handleItemChange(index, 'sku', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                <div className="w-full md:w-[calc(30%-0.75rem)]">
                  <label htmlFor={`name-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                    Product Name*
                  </label>
                  <input
                    type="text"
                    id={`name-${index}`}
                    value={item.name}
                    onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                <div className="w-full md:w-[calc(15%-0.75rem)]">
                  <label htmlFor={`quantity-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                    Quantity*
                  </label>
                  <input
                    type="number"
                    id={`quantity-${index}`}
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    required
                  />
                </div>
                
                <div className="w-full md:w-[calc(20%-0.75rem)]">
                  <label htmlFor={`location-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                    Location*
                  </label>
                  <select
                    id={`location-${index}`}
                    value={item.location}
                    onChange={(e) => handleItemChange(index, 'location', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select Location</option>
                    {locations.map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="w-full md:w-[calc(20%-0.75rem)]">
                  <label htmlFor={`category-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    id={`category-${index}`}
                    value={item.category}
                    onChange={(e) => handleItemChange(index, 'category', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Category</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="w-full md:w-[calc(10%-0.75rem)] flex items-end justify-center pb-1">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItemRow(index)}
                      className="text-red-600 hover:text-red-800"
                      aria-label="Remove item"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 mb-6">
            <Button
              variant="outline"
              onClick={handleAddItemRow}
              className="flex items-center"
            >
              <PlusIcon className="h-5 w-5 mr-1" />
              Add Item
            </Button>
          </div>

          <div className="flex justify-end space-x-3">
            <Button
              variant="secondary"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleManualSubmit}
              disabled={isSubmitting}
              className="flex items-center"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin h-4 w-4 mr-2 border-2 border-white rounded-full border-t-transparent"></div>
                  Processing...
                </>
              ) : (
                <>
                  <CheckIcon className="h-5 w-5 mr-1" />
                  Add to Inventory
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Import Tab */}
      {activeTab === 'import' && (
        <div>
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-3">
              Import stock items from a CSV file. Download the template below for the correct format.
            </p>
            
            <Button
              variant="outline"
              onClick={handleDownloadTemplate}
              className="flex items-center"
            >
              <ArrowDownTrayIcon className="h-5 w-5 mr-1" />
              Download Template
            </Button>
          </div>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Upload CSV File</label>
            <input 
              type="file"
              accept=".csv" 
              onChange={handleFileImport}
              ref={fileInputRef}
              className="w-full border border-gray-300 p-2 rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">
              File must be in CSV format with columns for SKU, Name, Quantity, Location, and Category
            </p>
          </div>
          
          {importedItems.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Imported Items ({importedItems.length})</h3>
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-md">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {importedItems.slice(0, 5).map((item, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{item.sku}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{item.name}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{item.quantity}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{item.location}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{item.category}</td>
                      </tr>
                    ))}
                    {importedItems.length > 5 && (
                      <tr>
                        <td colSpan="5" className="px-3 py-2 text-sm text-gray-500 text-center">
                          ...and {importedItems.length - 5} more items
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          <div className="flex justify-end space-x-3">
            <Button
              variant="secondary"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleImportSubmit}
              disabled={isSubmitting || importedItems.length === 0}
              className="flex items-center"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin h-4 w-4 mr-2 border-2 border-white rounded-full border-t-transparent"></div>
                  Processing...
                </>
              ) : (
                <>
                  <DocumentTextIcon className="h-5 w-5 mr-1" />
                  Import Items
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default AddStockModal; 