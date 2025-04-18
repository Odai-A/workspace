import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArchiveBoxIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChartBarIcon,
  QrCodeIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import MainLayout from '../components/layout/MainLayout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

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

const Dashboard = () => {
  const { currentUser } = useAuth();
  const [inventorySummary, setInventorySummary] = useState(sampleInventorySummary);
  const [recentActivity, setRecentActivity] = useState(sampleRecentActivity);
  const [topProducts, setTopProducts] = useState(sampleTopProducts);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // In a real app, fetch data from API here
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Simulating API calls
        // const summaryResponse = await api.get('/analytics/summary');
        // const activityResponse = await api.get('/transactions/recent');
        // const productsResponse = await api.get('/products/top');
        
        // setInventorySummary(summaryResponse.data);
        // setRecentActivity(activityResponse.data);
        // setTopProducts(productsResponse.data);
        
        // Using sample data for now
        setTimeout(() => {
          setLoading(false);
        }, 500);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Format timestamp to a more readable format
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  // Get icon for activity type
  const getActivityIcon = (type) => {
    switch (type) {
      case 'stock_in':
        return <ArrowDownIcon className="h-5 w-5 text-green-500" />;
      case 'stock_out':
        return <ArrowUpIcon className="h-5 w-5 text-red-500" />;
      case 'transfer':
        return <ArrowUpIcon className="h-5 w-5 text-blue-500" />;
      default:
        return null;
    }
  };

  // Get description for activity type
  const getActivityDescription = (activity) => {
    switch (activity.type) {
      case 'stock_in':
        return `${activity.quantity} units received at ${activity.location}`;
      case 'stock_out':
        return `${activity.quantity} units shipped from ${activity.location}`;
      case 'transfer':
        return `${activity.quantity} units transferred from ${activity.fromLocation} to ${activity.toLocation}`;
      default:
        return '';
    }
  };

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">
          Welcome back, {currentUser?.username || 'User'}. Here's what's happening with your inventory today.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <Card className="bg-white">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Items</p>
                  <p className="text-2xl font-bold text-gray-900">{inventorySummary.totalItems.toLocaleString()}</p>
                </div>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <ArchiveBoxIcon className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              <div className="mt-4">
                <Link to="/inventory" className="text-sm text-blue-600 hover:text-blue-800">
                  View inventory
                </Link>
              </div>
            </Card>

            <Card className="bg-white">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Locations</p>
                  <p className="text-2xl font-bold text-gray-900">{inventorySummary.totalLocations}</p>
                </div>
                <div className="p-2 bg-green-100 rounded-lg">
                  <TagIcon className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <div className="mt-4">
                <Link to="/locations" className="text-sm text-green-600 hover:text-green-800">
                  Manage locations
                </Link>
              </div>
            </Card>

            <Card className="bg-white">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Low Stock Items</p>
                  <p className="text-2xl font-bold text-gray-900">{inventorySummary.lowStockItems}</p>
                </div>
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <ChartBarIcon className="h-6 w-6 text-yellow-600" />
                </div>
              </div>
              <div className="mt-4">
                <Link to="/reports/low-stock" className="text-sm text-yellow-600 hover:text-yellow-800">
                  View report
                </Link>
              </div>
            </Card>

            <Card className="bg-white">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Out of Stock</p>
                  <p className="text-2xl font-bold text-red-600">{inventorySummary.outOfStockItems}</p>
                </div>
                <div className="p-2 bg-red-100 rounded-lg">
                  <QrCodeIcon className="h-6 w-6 text-red-600" />
                </div>
              </div>
              <div className="mt-4">
                <Link to="/reports/out-of-stock" className="text-sm text-red-600 hover:text-red-800">
                  View report
                </Link>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Activity */}
            <div className="lg:col-span-2">
              <Card
                title="Recent Activity"
                headerAction={
                  <Link to="/transactions">
                    <Button variant="outline" size="sm">View All</Button>
                  </Link>
                }
              >
                <div className="space-y-4">
                  {recentActivity.length > 0 ? (
                    recentActivity.map((activity) => (
                      <div key={activity.id} className="flex items-start">
                        <div className="flex-shrink-0 mr-3">
                          {getActivityIcon(activity.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{activity.item}</p>
                          <p className="text-xs text-gray-500">{getActivityDescription(activity)}</p>
                        </div>
                        <div className="text-xs text-right text-gray-500">
                          <p>{formatDate(activity.timestamp)}</p>
                          <p>{activity.user}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm">No recent activity</p>
                  )}
                </div>
              </Card>
            </div>

            {/* Top Products */}
            <div>
              <Card title="Top Products">
                <div className="space-y-4">
                  {topProducts.map((product, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="text-sm font-medium w-6">{index + 1}.</span>
                        <span className="text-sm">{product.name}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-medium">{product.stock}</span>
                        <span className={`text-xs ${
                          product.movement.startsWith('+') ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {product.movement}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <Link to="/reports/products" className="text-sm text-blue-600 hover:text-blue-800">
                    View detailed report
                  </Link>
                </div>
              </Card>

              {/* Quick Actions */}
              <Card title="Quick Actions" className="mt-6">
                <div className="grid grid-cols-2 gap-3">
                  <Button fullWidth variant="outline-primary">
                    <QrCodeIcon className="h-4 w-4 mr-2" />
                    Scan Items
                  </Button>
                  <Button fullWidth variant="outline-primary">
                    <ArrowDownIcon className="h-4 w-4 mr-2" />
                    Receive
                  </Button>
                  <Button fullWidth variant="outline-primary">
                    <ArrowUpIcon className="h-4 w-4 mr-2" />
                    Ship
                  </Button>
                  <Button fullWidth variant="outline-primary">
                    <ChartBarIcon className="h-4 w-4 mr-2" />
                    Reports
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </MainLayout>
  );
};

export default Dashboard;