import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import { toast } from 'react-toastify';

// Mock data for locations
const mockLocations = [
  { id: 1, name: 'Warehouse 1', address: '123 Main St, New York, NY 10001', type: 'Warehouse', capacity: 1000, utilized: 650 },
  { id: 2, name: 'Warehouse 2', address: '456 Elm St, Chicago, IL 60007', type: 'Warehouse', capacity: 750, utilized: 500 },
  { id: 3, name: 'Warehouse 3', address: '789 Oak St, Los Angeles, CA 90001', type: 'Warehouse', capacity: 500, utilized: 350 },
  { id: 4, name: 'Retail Store 1', address: '101 Maple Ave, Boston, MA 02108', type: 'Retail', capacity: 200, utilized: 150 },
  { id: 5, name: 'Distribution Center', address: '202 Pine Rd, Austin, TX 78701', type: 'Distribution', capacity: 1500, utilized: 1100 },
];

function Locations() {
  const [locations, setLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { hasPermission } = useAuth();

  // Fetch locations data
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        // In a real app, you would fetch from an API
        // const response = await apiClient.get('/locations');
        // setLocations(response.data);
        
        // For demo purposes, we'll use mock data with a delay to simulate loading
        setTimeout(() => {
          setLocations(mockLocations);
          setIsLoading(false);
        }, 500);
      } catch (error) {
        console.error('Error fetching locations:', error);
        toast.error('Failed to load locations');
        setIsLoading(false);
      }
    };

    fetchLocations();
  }, []);

  // Calculate utilization percentage
  const calculateUtilization = (utilized, capacity) => {
    const percentage = (utilized / capacity) * 100;
    return percentage.toFixed(1);
  };

  // Get utilization color class
  const getUtilizationColorClass = (percentage) => {
    const numPercentage = parseFloat(percentage);
    if (numPercentage < 50) return 'bg-green-500';
    if (numPercentage < 75) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="p-4">
        <PageHeader title="Locations" />
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <PageHeader 
        title="Locations" 
        actions={
          hasPermission('edit_locations') && (
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium">
              Add Location
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {locations.map((location) => {
          const utilizationPct = calculateUtilization(location.utilized, location.capacity);
          const utilizationColorClass = getUtilizationColorClass(utilizationPct);
          
          return (
            <div key={location.id} className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-indigo-500 rounded-md p-3">
                    <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">{location.name}</dt>
                      <dd className="flex items-baseline">
                        <div className="text-lg font-semibold text-gray-900">{location.type}</div>
                      </dd>
                    </dl>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-sm text-gray-500 truncate">{location.address}</p>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-700">Capacity Utilization</span>
                    <span className="text-sm font-medium text-gray-700">{utilizationPct}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className={`${utilizationColorClass} h-2.5 rounded-full`} 
                      style={{ width: `${utilizationPct}%` }}
                    ></div>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {location.utilized} / {location.capacity} units
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-4 sm:px-6">
                <div className="text-sm flex justify-end">
                  <button className="font-medium text-indigo-600 hover:text-indigo-500">
                    View details
                  </button>
                  {hasPermission('edit_locations') && (
                    <button className="ml-4 font-medium text-indigo-600 hover:text-indigo-500">
                      Edit
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Locations; 