import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArchiveBoxIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChartBarIcon,
  QrCodeIcon,
  TagIcon,
  ArrowUpTrayIcon,
  ListBulletIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CurrencyDollarIcon,
  ShoppingCartIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  PrinterIcon,
  ArrowTopRightOnSquareIcon
} from '@heroicons/react/24/outline';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { FiPackage, FiDatabase, FiBarChart2, FiUsers, FiActivity, FiSearch, FiShoppingCart, FiAlertCircle, FiTrendingUp } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { productLookupService } from '../services/databaseService';
import { inventoryService } from '../config/supabaseClient';
import { toast } from 'react-toastify';

// Reusable StatCard component (can be moved to ui components if used elsewhere)
const StatCard = ({ title, value, icon, colorClass = 'bg-blue-500', toLink }) => {
  const content = (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 ${toLink ? 'hover:shadow-lg transition-shadow duration-300' : ''}`}>
      <div className="flex items-center">
        <div className={`p-3 rounded-full ${colorClass} bg-opacity-20 text-${colorClass.split('-')[1]}-600 dark:text-${colorClass.split('-')[1]}-400`}>
          {icon}
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-semibold text-gray-700 dark:text-gray-200">{value !== null && value !== undefined ? value : '...'}</p>
        </div>
      </div>
    </div>
  );
  return toLink ? <Link to={toLink}>{content}</Link> : content;
};

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dashboardStats, setDashboardStats] = useState({
    totalProducts: null,
    sumOfQuantities: null,
    totalInventoryValue: null,
    lowStockItems: null,
    outOfStockItems: null,
    totalInventoryItems: null,
  });
  const [recentScans, setRecentScans] = useState([]);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [recentInventoryActivity, setRecentInventoryActivity] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Fetch basic stats
        const stats = await productLookupService.getDashboardStats();
        const scans = await productLookupService.getRecentScanEvents(5);
        
        // Fetch inventory data for enhanced stats
        const inventoryResult = await inventoryService.getInventory({ page: 1, limit: 1000 });
        const inventoryItems = inventoryResult.data || [];
        
        // Calculate inventory statistics
        const totalInventoryItems = inventoryItems.length;
        const totalInventoryValue = inventoryItems.reduce((sum, item) => {
          const price = parseFloat(item.price) || 0;
          const quantity = parseInt(item.quantity) || 0;
          return sum + (price * quantity);
        }, 0);
        
        // Find low stock items (quantity < 10)
        const lowStock = inventoryItems.filter(item => {
          const qty = parseInt(item.quantity) || 0;
          return qty > 0 && qty < 10;
        });
        
        // Find out of stock items
        const outOfStock = inventoryItems.filter(item => {
          const qty = parseInt(item.quantity) || 0;
          return qty === 0;
        });
        
        // Get recent inventory additions (last 5)
        const recentActivity = inventoryItems
          .sort((a, b) => {
            const dateA = new Date(a.created_at || a.updated_at || 0);
            const dateB = new Date(b.created_at || b.updated_at || 0);
            return dateB - dateA;
          })
          .slice(0, 5);
        
        setDashboardStats({
          ...stats,
          totalInventoryValue,
          lowStockItems: lowStock.length,
          outOfStockItems: outOfStock.length,
          totalInventoryItems
        });
        
        setRecentScans(scans || []);
        setLowStockProducts(lowStock.slice(0, 5));
        setRecentInventoryActivity(recentActivity);

      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load dashboard data.');
        toast.error('Failed to load dashboard data.');
      }
      setIsLoading(false);
    };

    fetchData();
  }, []);

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown time';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);

      if (diffSeconds < 2) return 'just now';
      if (diffSeconds < 60) return `${diffSeconds}s ago`;
      const diffMinutes = Math.round(diffSeconds / 60);
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      const diffHours = Math.round(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString();
    } catch (error) {
      return 'Invalid date';
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return <div className="text-center p-4 text-red-600">Error: {error}</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Welcome back! Here's what's happening with your inventory.</p>
        </div>
        <div className="mt-4 md:mt-0 flex gap-2">
          <Button 
            variant="primary" 
            onClick={() => navigate('/scanner')}
            className="flex items-center"
          >
            <QrCodeIcon className="h-5 w-5 mr-2" />
            Scan Product
          </Button>
          <Button 
            variant="outline" 
            onClick={() => navigate('/inventory')}
            className="flex items-center"
          >
            <ArchiveBoxIcon className="h-5 w-5 mr-2" />
            View Inventory
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Products"
          value={dashboardStats.totalProducts || dashboardStats.totalInventoryItems || 0}
          icon={<ArchiveBoxIcon className="h-6 w-6" />}
          colorClass="bg-blue-500"
          toLink="/inventory"
        />
        <StatCard 
          title="Total Stock Quantity"
          value={dashboardStats.sumOfQuantities || 0}
          icon={<TagIcon className="h-6 w-6" />}
          colorClass="bg-green-500"
        />
        <StatCard 
          title="Inventory Value"
          value={dashboardStats.totalInventoryValue ? `$${dashboardStats.totalInventoryValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}
          icon={<CurrencyDollarIcon className="h-6 w-6" />}
          colorClass="bg-yellow-500"
        />
        <StatCard 
          title="Low Stock Items"
          value={dashboardStats.lowStockItems || 0}
          icon={<ExclamationTriangleIcon className="h-6 w-6" />}
          colorClass="bg-orange-500"
          toLink="/inventory"
        />
      </div>

      {/* Alerts Section */}
      {dashboardStats.outOfStockItems > 0 && (
        <Card>
          <div className="p-6 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500">
            <div className="flex items-center">
              <ExclamationTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400 mr-3" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-800 dark:text-red-300">
                  {dashboardStats.outOfStockItems} Item{dashboardStats.outOfStockItems !== 1 ? 's' : ''} Out of Stock
                </h3>
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                  Some items need immediate attention. Review your inventory to restock.
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={() => navigate('/inventory')}
                className="ml-4"
              >
                View Inventory
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              onClick={() => navigate('/scanner')}
              className="flex flex-col items-center justify-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            >
              <QrCodeIcon className="h-8 w-8 text-blue-600 dark:text-blue-400 mb-2" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Scan Product</span>
            </button>
            <button
              onClick={() => navigate('/inventory')}
              className="flex flex-col items-center justify-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            >
              <PlusIcon className="h-8 w-8 text-green-600 dark:text-green-400 mb-2" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Add to Inventory</span>
            </button>
            <button
              onClick={() => navigate('/inventory')}
              className="flex flex-col items-center justify-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
            >
              <MagnifyingGlassIcon className="h-8 w-8 text-purple-600 dark:text-purple-400 mb-2" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Search Products</span>
            </button>
            <button
              onClick={() => navigate('/scanner')}
              className="flex flex-col items-center justify-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
            >
              <PrinterIcon className="h-8 w-8 text-orange-600 dark:text-orange-400 mb-2" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Print Labels</span>
            </button>
          </div>
        </div>
      </Card>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                <ExclamationTriangleIcon className="h-5 w-5 text-orange-500 mr-2" />
                Low Stock Items
              </h2>
              {lowStockProducts.length > 0 && (
                <Link to="/inventory" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                  View All
                </Link>
              )}
            </div>
            {lowStockProducts.length > 0 ? (
              <div className="space-y-3">
                {lowStockProducts.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {item.name || 'Unknown Product'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        SKU: {item.sku || 'N/A'}
                      </p>
                    </div>
                    <div className="ml-4 text-right">
                      <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                        Qty: {item.quantity || 0}
                      </p>
                      {item.price && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          ${parseFloat(item.price).toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                🎉 All items are well stocked!
              </p>
            )}
          </div>
        </Card>

        {/* Recent Inventory Activity */}
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                <ClockIcon className="h-5 w-5 text-blue-500 mr-2" />
                Recent Inventory Activity
              </h2>
              <Link to="/inventory" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                View All
              </Link>
            </div>
            {recentInventoryActivity.length > 0 ? (
              <div className="space-y-3">
                {recentInventoryActivity.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600">
                    <div className="flex items-center min-w-0 flex-1">
                      <div className="p-2 bg-green-100 dark:bg-green-500/20 rounded-full mr-3 shrink-0">
                        <ShoppingCartIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {item.name || 'Unknown Product'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Qty: {item.quantity || 0} • Location: {item.location || 'Default'}
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap ml-2">
                      {formatDate(item.created_at || item.updated_at)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                No recent inventory activity.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Recent Scans */}
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              <QrCodeIcon className="h-5 w-5 text-purple-500 mr-2" />
              Recent Scans
            </h2>
            <Link to="/scanner" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              View All
            </Link>
          </div>
          {recentScans.length > 0 ? (
            <div className="space-y-3">
              {recentScans.map((scan) => (
                <div key={scan.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600">
                  <div className="flex items-center min-w-0 flex-1">
                    <div className="p-2 bg-purple-100 dark:bg-purple-500/20 rounded-full mr-3 shrink-0">
                      <QrCodeIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={scan.description || scan.scanned_code}>
                        {scan.description || scan.scanned_code}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {scan.lpn && `LPN: ${scan.lpn} • `}
                        {scan.asin && `ASIN: ${scan.asin} • `}
                        {typeof scan.price === 'number' && `Price: $${scan.price.toFixed(2)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap ml-2">
                    <ClockIcon className="h-4 w-4 mr-1 shrink-0" />
                    {formatDate(scan.scanned_at)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No recent scan activity. Start scanning products to see them here!
            </p>
          )}
        </div>
      </Card>

    </div>
  );
};

export default Dashboard;