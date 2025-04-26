import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArchiveBoxIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChartBarIcon,
  QrCodeIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import DebugInfo from '../components/ui/DebugInfo';
import { FiPackage, FiDatabase, FiBarChart2, FiUsers, FiActivity, FiSearch } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { fetchProductByFnsku } from '../services/api';
import { toast } from 'react-toastify';

// Sample data - in a real app, this would come from the API
const sampleRecentActivity = [
  { id: 1, type: 'stock_in', item: 'Amazon Echo Dot', quantity: 50, location: 'Warehouse A', user: 'John Doe', timestamp: '2023-04-17T10:30:00Z' },
  { id: 2, type: 'stock_out', item: 'Fire TV Stick', quantity: 25, location: 'Warehouse B', user: 'Jane Smith', timestamp: '2023-04-17T09:15:00Z' },
  { id: 3, type: 'transfer', item: 'Kindle Paperwhite', quantity: 20, fromLocation: 'Warehouse A', toLocation: 'Warehouse C', user: 'Robert Johnson', timestamp: '2023-04-16T16:45:00Z' },
  { id: 4, type: 'stock_out', item: 'Amazon Echo Show', quantity: 15, location: 'Warehouse A', user: 'John Doe', timestamp: '2023-04-16T14:20:00Z' },
  { id: 5, type: 'stock_in', item: 'Ring Doorbell', quantity: 30, location: 'Warehouse B', user: 'Jane Smith', timestamp: '2023-04-16T11:05:00Z' },
];

const sampleInventorySummary = {
  totalItems: 5843,
  totalLocations: 8,
  lowStockItems: 24,
  outOfStockItems: 7,
};

const sampleTopProducts = [
  { name: 'Amazon Echo Dot', stock: 450, movement: '+12%' },
  { name: 'Fire TV Stick', stock: 320, movement: '-8%' },
  { name: 'Kindle Paperwhite', stock: 280, movement: '+5%' },
  { name: 'Ring Doorbell', stock: 210, movement: '+20%' },
  { name: 'Echo Show', stock: 175, movement: '-3%' },
];

const StatCard = ({ title, value, icon, color, href }) => {
  return (
    <Link 
      to={href} 
      className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow duration-300"
    >
      <div className="flex items-center">
        <div className={`p-3 rounded-full ${color} text-white`}>
          {icon}
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-semibold text-gray-700 dark:text-gray-200">{value}</p>
        </div>
      </div>
    </Link>
  );
};

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalProducts: 245,
    totalInventory: 1823,
    recentScans: 37,
    lowStock: 12
  });
  const [isLoading, setIsLoading] = useState(false);
  const [lookupFnsku, setLookupFnsku] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const lookupTimeoutRef = useRef(null);
  
  // Log when Dashboard component mounts
  useEffect(() => {
    console.log('Dashboard component mounted');
    console.log('Current user:', user?.email);
  }, [user]);

  // Effect to handle automatic lookup on FNSKU input change (with debounce)
  useEffect(() => {
    // Clear the previous timeout if there is one
    if (lookupTimeoutRef.current) {
      clearTimeout(lookupTimeoutRef.current);
    }

    const trimmedFnsku = lookupFnsku.trim();

    // Basic FNSKU format check (starts with X, at least 10 chars)
    if (trimmedFnsku.startsWith('X') && trimmedFnsku.length >= 10) {
      // Set a timeout to wait before performing the lookup
      lookupTimeoutRef.current = setTimeout(async () => {
        console.log(`Debounced lookup triggered for: ${trimmedFnsku}`);
        setIsLookingUp(true);
        try {
          // Call the API service (no mock data here)
          const productDetails = await fetchProductByFnsku(trimmedFnsku, { useMock: false });

          if (productDetails && productDetails.asin) {
            console.log(`ASIN found: ${productDetails.asin}. Opening Amazon page.`);
            toast.success(`ASIN ${productDetails.asin} found! Opening Amazon page...`);
            window.open(`https://www.amazon.com/dp/${productDetails.asin}`, '_blank');
            setLookupFnsku(''); // Clear input after successful lookup
          } else {
            console.warn('Product not found via API for FNSKU:', trimmedFnsku);
            toast.warn('Product information not found for this FNSKU.');
          }
        } catch (error) {
          console.error('Error during automatic FNSKU lookup:', error);
          toast.error('An error occurred during lookup.');
        } finally {
          setIsLookingUp(false);
        }
      }, 750); // Adjust debounce delay (milliseconds) as needed (e.g., 750ms)
    }

    // Cleanup function to clear timeout if component unmounts or lookupFnsku changes again
    return () => {
      if (lookupTimeoutRef.current) {
        clearTimeout(lookupTimeoutRef.current);
      }
    };
  }, [lookupFnsku]); // Rerun effect when lookupFnsku changes

  return (
    <div className="px-4 py-6">
      {/* Add debug component */}
      <DebugInfo />
      
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Welcome back, {user?.email || 'User'}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Here's an overview of your inventory management system
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 animate-pulse">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-gray-300 dark:bg-gray-700"></div>
                <div className="ml-4 w-full">
                  <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/4 mb-2"></div>
                  <div className="h-6 bg-gray-300 dark:bg-gray-700 rounded w-1/2"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="Products" 
            value={stats.totalProducts} 
            icon={<FiPackage size={24} />} 
            color="bg-blue-600" 
            href="/products" 
          />
          <StatCard 
            title="Inventory Items" 
            value={stats.totalInventory} 
            icon={<FiDatabase size={24} />} 
            color="bg-green-600" 
            href="/inventory" 
          />
          <StatCard 
            title="Recent Scans (7 days)" 
            value={stats.recentScans} 
            icon={<FiActivity size={24} />} 
            color="bg-purple-600" 
            href="/scanner" 
          />
          <StatCard 
            title="Low Stock Items" 
            value={stats.lowStock} 
            icon={<FiBarChart2 size={24} />} 
            color="bg-red-600" 
            href="/reports" 
          />
        </div>
      )}

      <div className="mt-12">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Quick FNSKU Lookup
        </h2>
        <Card className="p-4">
          <label htmlFor="fnsku-lookup" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Enter FNSKU for Automatic Amazon Lookup:
          </label>
          <div className="relative">
            <input
              type="text"
              id="fnsku-lookup"
              value={lookupFnsku}
              onChange={(e) => setLookupFnsku(e.target.value)}
              placeholder="Enter FNSKU (e.g., X000ABC123)"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:ring-blue-500 focus:border-blue-500 pr-10"
              disabled={isLookingUp}
            />
            {isLookingUp && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Once a valid FNSKU is entered, the Amazon product page will open automatically.
          </p>
        </Card>
      </div>

      <div className="mt-12">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link 
            to="/scanner" 
            className="flex items-center justify-center p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300"
          >
            <FiSearch className="text-blue-600 dark:text-blue-400 w-6 h-6 mr-3" />
            <span className="font-medium text-gray-700 dark:text-gray-200">Scan Products</span>
          </Link>
          <Link 
            to="/products" 
            className="flex items-center justify-center p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300"
          >
            <FiPackage className="text-green-600 dark:text-green-400 w-6 h-6 mr-3" />
            <span className="font-medium text-gray-700 dark:text-gray-200">Manage Products</span>
          </Link>
          <Link 
            to="/reports" 
            className="flex items-center justify-center p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300"
          >
            <FiBarChart2 className="text-purple-600 dark:text-purple-400 w-6 h-6 mr-3" />
            <span className="font-medium text-gray-700 dark:text-gray-200">View Reports</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;