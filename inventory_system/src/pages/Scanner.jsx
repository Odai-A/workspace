import React, { useState } from 'react';
import { mockService } from '../services/mockData';
import { toast } from 'react-toastify';

const Scanner = () => {
  const [barcode, setBarcode] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);

  const handleScan = async (e) => {
    e.preventDefault();
    setScanning(true);
    setResult(null);
    setError(null);
    try {
      const response = await mockService.scanBarcode(barcode);
      if (response.success) {
        setResult(response.data);
        toast.success('Product found!');
      } else {
        setError(response.error);
        toast.error(response.error);
      }
    } catch (err) {
      setError('Scan failed');
      toast.error('Scan failed');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded shadow">
      <h1 className="text-2xl font-bold mb-4">Barcode Scanner</h1>
      <form onSubmit={handleScan} className="flex flex-col gap-4">
        <input
          type="text"
          className="border p-2 rounded"
          placeholder="Enter or scan barcode..."
          value={barcode}
          onChange={e => setBarcode(e.target.value)}
          disabled={scanning}
        />
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          disabled={scanning || !barcode}
        >
          {scanning ? 'Scanning...' : 'Scan'}
        </button>
      </form>
      {result && (
        <div className="mt-6 p-4 bg-green-50 rounded">
          <h2 className="font-semibold text-green-700 mb-2">Product Info</h2>
          <pre className="text-sm text-gray-800 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
      {error && (
        <div className="mt-6 p-4 bg-red-50 rounded text-red-700">
          {error}
        </div>
      )}
    </div>
  );
};

export default Scanner;