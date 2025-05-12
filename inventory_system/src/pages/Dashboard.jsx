import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArchiveBoxIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChartBarIcon,
  QrCodeIcon,
  TagIcon,
  ArrowUpTrayIcon,
  ListBulletIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { FiPackage, FiDatabase, FiBarChart2, FiUsers, FiActivity, FiSearch, FiShoppingCart, FiAlertCircle, FiTrendingUp } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { productLookupService } from '../services/databaseService';
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
  const [dashboardStats, setDashboardStats] = useState({
    totalProducts: null,
    sumOfQuantities: null,
  });
  const [recentScans, setRecentScans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const stats = await productLookupService.getDashboardStats();
        const scans = await productLookupService.getRecentScanEvents(5);
        console.log("[Dashboard.jsx] Fetched recent scans from service:", scans);
        setDashboardStats(stats);
        setRecentScans(scans || []);

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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Products"
          value={dashboardStats.totalProducts}
          icon={<ArchiveBoxIcon className="h-6 w-6" />}
          colorClass="bg-blue-500"
          toLink="/inventory"
        />
        <StatCard 
          title="Total Stock Quantity"
          value={dashboardStats.sumOfQuantities}
          icon={<TagIcon className="h-6 w-6" />}
          colorClass="bg-green-500"
        />
      </div>

      <Card>
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Recent Scans</h2>
          {recentScans.length > 0 ? (
            <div className="space-y-3">
              {recentScans.map((scan) => (
                <div key={scan.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600">
                  <div className="flex items-center min-w-0">
                    <div className="p-2 bg-purple-100 dark:bg-purple-500/20 rounded-full mr-3 shrink-0">
                      <QrCodeIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate" title={scan.description || scan.scanned_code}>
                        {scan.description || scan.scanned_code}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        LPN: {scan.lpn || 'N/A'} | ASIN: {scan.asin || 'N/A'} | Price: {typeof scan.price === 'number' ? `$${scan.price.toFixed(2)}` : 'N/A'}
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
            <p className="text-sm text-gray-500 dark:text-gray-400">No recent scan activity to display.</p>
          )}
        </div>
      </Card>

    </div>
  );
};

export default Dashboard;