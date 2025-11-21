import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../config/supabaseClient';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { ArrowDownTrayIcon, ChartBarIcon, UserGroupIcon, CurrencyDollarIcon, ClockIcon, CubeIcon } from '@heroicons/react/24/outline';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { toast } from 'react-toastify';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

function Reports() {
  const [activeTab, setActiveTab] = useState('activity');
  const [dateRange, setDateRange] = useState('7d'); // 7d, 30d, 90d, all
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  // Report data state
  const [scanActivity, setScanActivity] = useState(null);
  const [userPerformance, setUserPerformance] = useState(null);
  const [apiCosts, setApiCosts] = useState(null);
  const [productPopularity, setProductPopularity] = useState(null);
  const [inventoryStats, setInventoryStats] = useState(null);
  const [timeAnalytics, setTimeAnalytics] = useState(null);

  // Report types
  const reportTypes = [
    { id: 'activity', name: 'Scan Activity', icon: ChartBarIcon },
    { id: 'users', name: 'User Performance', icon: UserGroupIcon },
    { id: 'costs', name: 'API Cost Tracking', icon: CurrencyDollarIcon },
    { id: 'products', name: 'Product Popularity', icon: CubeIcon },
    { id: 'inventory', name: 'Inventory Analytics', icon: CubeIcon },
    { id: 'time', name: 'Time Analytics', icon: ClockIcon },
  ];

  // Calculate date range
  const getDateRange = () => {
    const now = new Date();
    let startDate = new Date();
    
    switch (dateRange) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case 'all':
        startDate = new Date(0); // Beginning of time
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }
    
    return { startDate, endDate: now };
  };

  // Fetch scan activity data
  const fetchScanActivity = async () => {
    try {
      const { startDate, endDate } = getDateRange();
      
      const { data, error } = await supabase
        .from('scan_history')
        .select('scanned_at')
        .gte('scanned_at', startDate.toISOString())
        .lte('scanned_at', endDate.toISOString())
        .order('scanned_at', { ascending: true });

      if (error) throw error;

      // Group by day
      const dailyCounts = {};
      (data || []).forEach(scan => {
        const date = new Date(scan.scanned_at).toLocaleDateString();
        dailyCounts[date] = (dailyCounts[date] || 0) + 1;
      });

      const labels = Object.keys(dailyCounts).sort();
      const counts = labels.map(date => dailyCounts[date]);

      setScanActivity({
        labels,
        datasets: [{
          label: 'Scans per Day',
          data: counts,
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 1,
        }],
        total: data?.length || 0,
        average: labels.length > 0 ? (data?.length / labels.length).toFixed(1) : 0,
      });
    } catch (error) {
      console.error('Error fetching scan activity:', error);
      toast.error('Failed to load scan activity data');
    }
  };

  // Fetch user performance data
  const fetchUserPerformance = async () => {
    try {
      const { startDate, endDate } = getDateRange();
      
      // Get scan counts per user
      const { data: scans, error: scansError } = await supabase
        .from('scan_history')
        .select('user_id, scanned_at')
        .gte('scanned_at', startDate.toISOString())
        .lte('scanned_at', endDate.toISOString());

      if (scansError) throw scansError;

      // Count scans per user
      const userCounts = {};
      (scans || []).forEach(scan => {
        const userId = scan.user_id || 'unknown';
        userCounts[userId] = (userCounts[userId] || 0) + 1;
      });

      // Get user details
      const userIds = Object.keys(userCounts);
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, email, first_name, last_name')
        .in('id', userIds);

      if (usersError) throw usersError;

      // Map user data
      const userData = userIds.map(userId => {
        const user = users?.find(u => u.id === userId);
        const count = userCounts[userId];
        return {
          id: userId,
          name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email : 'Unknown User',
          email: user?.email || 'N/A',
          scanCount: count,
        };
      }).sort((a, b) => b.scanCount - a.scanCount);

      setUserPerformance({
        users: userData,
        totalScans: scans?.length || 0,
        topPerformer: userData[0] || null,
      });
    } catch (error) {
      console.error('Error fetching user performance:', error);
      toast.error('Failed to load user performance data');
    }
  };

  // Fetch API cost tracking data
  const fetchApiCosts = async () => {
    try {
      const { data: cacheData, error: cacheError } = await supabase
        .from('api_lookup_cache')
        .select('source, lookup_count, created_at');

      if (cacheError) throw cacheError;

      // Calculate cache statistics
      const totalLookups = cacheData?.reduce((sum, item) => sum + (item.lookup_count || 0), 0) || 0;
      const uniqueItems = cacheData?.length || 0;
      const sourceBreakdown = {};
      
      (cacheData || []).forEach(item => {
        const source = item.source || 'unknown';
        sourceBreakdown[source] = (sourceBreakdown[source] || 0) + (item.lookup_count || 0);
      });

      // Estimate cost savings (assuming $0.01 per API call saved)
      const estimatedSavings = totalLookups * 0.01;

      setApiCosts({
        totalLookups,
        uniqueItems,
        sourceBreakdown,
        estimatedSavings,
        cacheHitRate: uniqueItems > 0 ? ((totalLookups / uniqueItems) * 100).toFixed(1) : 0,
      });
    } catch (error) {
      console.error('Error fetching API costs:', error);
      toast.error('Failed to load API cost data');
    }
  };

  // Fetch product popularity data
  const fetchProductPopularity = async () => {
    try {
      const { startDate, endDate } = getDateRange();
      
      // Get most scanned products
      const { data: scans, error: scansError } = await supabase
        .from('scan_history')
        .select('scanned_code, product_description, scanned_at')
        .gte('scanned_at', startDate.toISOString())
        .lte('scanned_at', endDate.toISOString());

      if (scansError) throw scansError;

      // Count scans per product
      const productCounts = {};
      (scans || []).forEach(scan => {
        const key = scan.scanned_code || scan.product_description || 'Unknown';
        productCounts[key] = (productCounts[key] || 0) + 1;
      });

      // Sort and get top 10
      const topProducts = Object.entries(productCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setProductPopularity({
        products: topProducts,
        totalUnique: Object.keys(productCounts).length,
      });
    } catch (error) {
      console.error('Error fetching product popularity:', error);
      toast.error('Failed to load product popularity data');
    }
  };

  // Fetch inventory statistics
  const fetchInventoryStats = async () => {
    try {
      const { data: inventory, error: inventoryError } = await supabase
        .from('manifest_data')
        .select('Quantity, MSRP');

      if (inventoryError) throw inventoryError;

      const totalItems = inventory?.length || 0;
      const totalQuantity = inventory?.reduce((sum, item) => sum + (parseInt(item.Quantity) || 0), 0) || 0;
      const totalValue = inventory?.reduce((sum, item) => {
        const qty = parseInt(item.Quantity) || 0;
        const price = parseFloat(item.MSRP) || 0;
        return sum + (qty * price);
      }, 0) || 0;
      
      const lowStock = inventory?.filter(item => {
        const qty = parseInt(item.Quantity) || 0;
        return qty > 0 && qty < 10;
      }).length || 0;

      const outOfStock = inventory?.filter(item => {
        const qty = parseInt(item.Quantity) || 0;
        return qty === 0;
      }).length || 0;

      setInventoryStats({
        totalItems,
        totalQuantity,
        totalValue,
        lowStock,
        outOfStock,
        averageValue: totalItems > 0 ? (totalValue / totalItems).toFixed(2) : 0,
      });
    } catch (error) {
      console.error('Error fetching inventory stats:', error);
      toast.error('Failed to load inventory statistics');
    }
  };

  // Fetch time-based analytics
  const fetchTimeAnalytics = async () => {
    try {
      const { startDate, endDate } = getDateRange();
      
      const { data: scans, error: scansError } = await supabase
        .from('scan_history')
        .select('scanned_at')
        .gte('scanned_at', startDate.toISOString())
        .lte('scanned_at', endDate.toISOString());

      if (scansError) throw scansError;

      // Group by hour of day
      const hourlyCounts = Array(24).fill(0);
      (scans || []).forEach(scan => {
        const hour = new Date(scan.scanned_at).getHours();
        hourlyCounts[hour]++;
      });

      // Group by day of week
      const dayOfWeekCounts = Array(7).fill(0);
      (scans || []).forEach(scan => {
        const day = new Date(scan.scanned_at).getDay();
        dayOfWeekCounts[day]++;
      });

      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      setTimeAnalytics({
        hourly: {
          labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
          data: hourlyCounts,
        },
        weekly: {
          labels: dayLabels,
          data: dayOfWeekCounts,
        },
        peakHour: hourlyCounts.indexOf(Math.max(...hourlyCounts)),
        peakDay: dayLabels[dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))],
      });
    } catch (error) {
      console.error('Error fetching time analytics:', error);
      toast.error('Failed to load time analytics data');
    }
  };

  // Load all reports
  useEffect(() => {
    const loadReports = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          fetchScanActivity(),
          fetchUserPerformance(),
          fetchApiCosts(),
          fetchProductPopularity(),
          fetchInventoryStats(),
          fetchTimeAnalytics(),
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    loadReports();
  }, [dateRange]);

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
    },
  };

  // Export to CSV
  const handleExportCSV = () => {
    let csvContent = '';
    
    switch (activeTab) {
      case 'activity':
        if (scanActivity) {
          csvContent = 'Date,Scans\n';
          scanActivity.labels.forEach((label, i) => {
            csvContent += `${label},${scanActivity.datasets[0].data[i]}\n`;
          });
        }
        break;
      case 'users':
        if (userPerformance) {
          csvContent = 'User,Email,Scans\n';
          userPerformance.users.forEach(user => {
            csvContent += `"${user.name}","${user.email}",${user.scanCount}\n`;
          });
        }
        break;
      case 'products':
        if (productPopularity) {
          csvContent = 'Product,Scan Count\n';
          productPopularity.products.forEach(product => {
            csvContent += `"${product.name}",${product.count}\n`;
          });
        }
        break;
    }

    if (csvContent) {
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      toast.success('Report exported successfully!');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-600 mt-1">Track performance, costs, and scale your operations</p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center space-x-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="flex items-center"
          >
            <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Report tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
          {reportTypes.map((report) => {
            const Icon = report.icon;
            return (
              <button
                key={report.id}
                onClick={() => setActiveTab(report.id)}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2
                  ${activeTab === report.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                `}
              >
                <Icon className="h-5 w-5" />
                <span>{report.name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Report content */}
      <Card>
        <div className="p-6">
          {/* Scan Activity */}
          {activeTab === 'activity' && scanActivity && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Scan Activity Trends</h2>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Total: {scanActivity.total}</span> | 
                  <span className="ml-2">Avg/Day: {scanActivity.average}</span>
                </div>
              </div>
              <div className="h-80">
                <Line data={scanActivity} options={chartOptions} />
              </div>
            </div>
          )}

          {/* User Performance */}
          {activeTab === 'users' && userPerformance && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">User Performance</h2>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Total Scans: {userPerformance.totalScans}</span>
                </div>
              </div>
              {userPerformance.topPerformer && (
                <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-600">Top Performer</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {userPerformance.topPerformer.name} - {userPerformance.topPerformer.scanCount} scans
                  </p>
                </div>
              )}
              <div className="h-80">
                <Bar
                  data={{
                    labels: userPerformance.users.map(u => u.name),
                    datasets: [{
                      label: 'Scans',
                      data: userPerformance.users.map(u => u.scanCount),
                      backgroundColor: 'rgba(59, 130, 246, 0.5)',
                    }],
                  }}
                  options={chartOptions}
                />
              </div>
              <div className="mt-4">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scans</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {userPerformance.users.map((user) => (
                      <tr key={user.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.scanCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* API Cost Tracking */}
          {activeTab === 'costs' && apiCosts && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">API Cost Tracking & Cache Performance</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <div className="p-4">
                    <p className="text-sm text-gray-600">Total Cache Lookups</p>
                    <p className="text-2xl font-bold text-gray-900">{apiCosts.totalLookups.toLocaleString()}</p>
                  </div>
                </Card>
                <Card>
                  <div className="p-4">
                    <p className="text-sm text-gray-600">Estimated Savings</p>
                    <p className="text-2xl font-bold text-green-600">${apiCosts.estimatedSavings.toFixed(2)}</p>
                  </div>
                </Card>
                <Card>
                  <div className="p-4">
                    <p className="text-sm text-gray-600">Cache Hit Rate</p>
                    <p className="text-2xl font-bold text-blue-600">{apiCosts.cacheHitRate}%</p>
                  </div>
                </Card>
              </div>
              <div className="h-64">
                <Doughnut
                  data={{
                    labels: Object.keys(apiCosts.sourceBreakdown),
                    datasets: [{
                      data: Object.values(apiCosts.sourceBreakdown),
                      backgroundColor: [
                        'rgba(59, 130, 246, 0.5)',
                        'rgba(16, 185, 129, 0.5)',
                        'rgba(245, 158, 11, 0.5)',
                        'rgba(239, 68, 68, 0.5)',
                      ],
                    }],
                  }}
                  options={chartOptions}
                />
              </div>
            </div>
          )}

          {/* Product Popularity */}
          {activeTab === 'products' && productPopularity && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Most Scanned Products</h2>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Unique Products: {productPopularity.totalUnique}</span>
                </div>
              </div>
              <div className="h-80">
                <Bar
                  data={{
                    labels: productPopularity.products.map(p => p.name.substring(0, 30) + (p.name.length > 30 ? '...' : '')),
                    datasets: [{
                      label: 'Scan Count',
                      data: productPopularity.products.map(p => p.count),
                      backgroundColor: 'rgba(16, 185, 129, 0.5)',
                    }],
                  }}
                  options={chartOptions}
                />
              </div>
            </div>
          )}

          {/* Inventory Analytics */}
          {activeTab === 'inventory' && inventoryStats && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Inventory Statistics</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <div className="p-4">
                    <p className="text-sm text-gray-600">Total Items</p>
                    <p className="text-2xl font-bold text-gray-900">{inventoryStats.totalItems.toLocaleString()}</p>
                  </div>
                </Card>
                <Card>
                  <div className="p-4">
                    <p className="text-sm text-gray-600">Total Quantity</p>
                    <p className="text-2xl font-bold text-gray-900">{inventoryStats.totalQuantity.toLocaleString()}</p>
                  </div>
                </Card>
                <Card>
                  <div className="p-4">
                    <p className="text-sm text-gray-600">Total Value</p>
                    <p className="text-2xl font-bold text-gray-900">${inventoryStats.totalValue.toLocaleString()}</p>
                  </div>
                </Card>
                <Card>
                  <div className="p-4">
                    <p className="text-sm text-gray-600">Low Stock Items</p>
                    <p className="text-2xl font-bold text-yellow-600">{inventoryStats.lowStock}</p>
                  </div>
                </Card>
                <Card>
                  <div className="p-4">
                    <p className="text-sm text-gray-600">Out of Stock</p>
                    <p className="text-2xl font-bold text-red-600">{inventoryStats.outOfStock}</p>
                  </div>
                </Card>
                <Card>
                  <div className="p-4">
                    <p className="text-sm text-gray-600">Average Item Value</p>
                    <p className="text-2xl font-bold text-gray-900">${inventoryStats.averageValue}</p>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* Time Analytics */}
          {activeTab === 'time' && timeAnalytics && (
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Time-Based Analytics</h2>
                <div className="mt-2 flex space-x-4 text-sm text-gray-600">
                  <span>Peak Hour: <span className="font-medium">{timeAnalytics.peakHour}:00</span></span>
                  <span>Peak Day: <span className="font-medium">{timeAnalytics.peakDay}</span></span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Scans by Hour</h3>
                  <div className="h-64">
                    <Bar
                      data={{
                        labels: timeAnalytics.hourly.labels,
                        datasets: [{
                          label: 'Scans',
                          data: timeAnalytics.hourly.data,
                          backgroundColor: 'rgba(59, 130, 246, 0.5)',
                        }],
                      }}
                      options={chartOptions}
                    />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Scans by Day of Week</h3>
                  <div className="h-64">
                    <Bar
                      data={{
                        labels: timeAnalytics.weekly.labels,
                        datasets: [{
                          label: 'Scans',
                          data: timeAnalytics.weekly.data,
                          backgroundColor: 'rgba(16, 185, 129, 0.5)',
                        }],
                      }}
                      options={chartOptions}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export default Reports;
