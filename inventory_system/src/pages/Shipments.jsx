import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/ui/Button';
import { PlusIcon, TruckIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';

// Mock data for shipments
const mockShipments = [
  { id: 1, shipmentNumber: 'SHP-12345', date: '2023-05-15', status: 'Delivered', trackingNumber: 'TRK-12345-A', carrier: 'FedEx', destination: 'Warehouse 1' },
  { id: 2, shipmentNumber: 'SHP-67890', date: '2023-05-16', status: 'In Transit', trackingNumber: 'TRK-67890-B', carrier: 'UPS', destination: 'Warehouse 2' },
  { id: 3, shipmentNumber: 'SHP-54321', date: '2023-05-17', status: 'Processing', trackingNumber: 'TRK-54321-C', carrier: 'DHL', destination: 'Warehouse 3' },
  { id: 4, shipmentNumber: 'SHP-98765', date: '2023-05-18', status: 'Delivered', trackingNumber: 'TRK-98765-D', carrier: 'USPS', destination: 'Warehouse 1' },
  { id: 5, shipmentNumber: 'SHP-24680', date: '2023-05-19', status: 'Cancelled', trackingNumber: 'TRK-24680-E', carrier: 'FedEx', destination: 'Warehouse 2' },
];

function Shipments() {
  const [shipments, setShipments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  // Fetch shipments data
  useEffect(() => {
    const fetchShipments = async () => {
      try {
        // In a real app, you would fetch from an API
        // const response = await apiClient.get('/shipments');
        // setShipments(response.data);
        
        // For demo purposes, we'll use mock data with a delay to simulate loading
        setTimeout(() => {
          setShipments(mockShipments);
          setIsLoading(false);
        }, 500);
      } catch (error) {
        console.error('Error fetching shipments:', error);
        toast.error('Failed to load shipments');
        setIsLoading(false);
      }
    };

    fetchShipments();
  }, []);

  // Get status class for badge
  const getStatusClass = (status) => {
    switch (status) {
      case 'Delivered':
        return 'bg-green-100 text-green-800';
      case 'In Transit':
        return 'bg-blue-100 text-blue-800';
      case 'Processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'Cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleCreateShipment = () => {
    toast.info('Create shipment functionality would be implemented here');
    // In a real app, this would navigate to a shipment creation form
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Shipments</h1>
        <Button 
          variant="primary" 
          onClick={handleCreateShipment}
          className="flex items-center"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Create Shipment
        </Button>
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shipment #</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Carrier</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tracking #</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Destination</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {shipments.map((shipment) => (
                <tr key={shipment.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{shipment.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{shipment.shipmentNumber}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{shipment.date}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{shipment.carrier}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{shipment.trackingNumber}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{shipment.destination}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusClass(shipment.status)}`}>
                      {shipment.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <button className="text-indigo-600 hover:text-indigo-900 mr-3">Details</button>
                    {shipment.trackingNumber && (
                      <button className="text-blue-600 hover:text-blue-900">Track</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Shipments; 