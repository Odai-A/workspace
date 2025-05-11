import React, { useState } from 'react';
import { toast } from 'react-toastify';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';

const ProductImport = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast.error('Please select a CSV file to import.');
      return;
    }

    setIsLoading(true);
    toast.info('Starting product import...');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      // Replace with your actual backend API endpoint
      // const response = await fetch('/api/products/import', {
      //   method: 'POST',
      //   body: formData,
      //   // Add headers if needed, e.g., for authorization
      // });

      // const data = await response.json();

      // Mock response for now
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate network delay
      const mockData = { succeeded: true, message: 'Successfully imported 150 products.', importedCount: 150 };
      // const mockData = { succeeded: false, message: 'Failed to import products. Invalid CSV format.' };


      if (mockData.succeeded) {
        toast.success(mockData.message || 'Products imported successfully!');
        setSelectedFile(null); // Reset file input
        // Optionally, you might want to navigate the user or refresh a product list
      } else {
        toast.error(mockData.message || 'Failed to import products.');
      }
    } catch (error) {
      console.error('Error importing products:', error);
      toast.error('An error occurred during the import process.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Import Products from CSV</h1>
      
      <Card className="max-w-xl mx-auto">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Upload Amazon Manifest CSV</h2>
          
          <div className="mb-4">
            <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              CSV File
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md">
              <div className="space-y-1 text-center">
                <ArrowUpTrayIcon className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600 dark:text-gray-400">
                  <label
                    htmlFor="file-upload"
                    className="relative cursor-pointer bg-white dark:bg-gray-800 rounded-md font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 dark:focus-within:ring-offset-gray-800 focus-within:ring-indigo-500"
                  >
                    <span>Upload a file</span>
                    <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".csv" onChange={handleFileChange} />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">CSV up to 10MB</p>
                {selectedFile && (
                  <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                    Selected: {selectedFile.name}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <Button
              onClick={handleImport}
              disabled={isLoading || !selectedFile}
              className="w-full flex justify-center items-center"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Importing...
                </>
              ) : (
                'Import Products'
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ProductImport; 