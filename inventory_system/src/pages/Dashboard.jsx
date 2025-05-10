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
import { FiPackage, FiDatabase, FiBarChart2, FiUsers, FiActivity, FiSearch, FiShoppingCart, FiAlertCircle, FiTrendingUp } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
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

  // Mock data for demonstration
  const mockStats = [
    { title: 'Total Products', value: '1,234', icon: FiPackage, color: 'bg-blue-500' },
    { title: 'Active Orders', value: '56', icon: FiShoppingCart, color: 'bg-green-500' },
    { title: 'Low Stock Items', value: '12', icon: FiAlertCircle, color: 'bg-yellow-500' },
    { title: 'Monthly Sales', value: '$45,678', icon: FiTrendingUp, color: 'bg-purple-500' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {mockStats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className={`p-3 rounded-full ${stat.color} bg-opacity-10`}>
                  <Icon className={`h-6 w-6 ${stat.color.replace('bg-', 'text-')}`} />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-lg font-semibold text-gray-900">{stat.value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {[1, 2, 3].map((item) => (
              <div key={item} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <FiPackage className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-900">Product Update</p>
                    <p className="text-sm text-gray-500">Updated inventory for Product {item}</p>
                  </div>
                </div>
                <span className="text-sm text-gray-500">2 hours ago</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button className="p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
              <div className="text-blue-600 mb-2">📦</div>
              <span className="text-sm font-medium">New Scan</span>
            </button>
            <button className="p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
              <div className="text-green-600 mb-2">➕</div>
              <span className="text-sm font-medium">Add Product</span>
            </button>
            <button className="p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
              <div className="text-purple-600 mb-2">📊</div>
              <span className="text-sm font-medium">View Reports</span>
            </button>
            <button className="p-4 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors">
              <div className="text-yellow-600 mb-2">⚙️</div>
              <span className="text-sm font-medium">Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;