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
  const [timeAnalytics, setTimeAnalytics] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Report types (API Cost Tracking removed per user request)
  const reportTypes = [
    { id: 'activity', name: 'Scan Activity', icon: ChartBarIcon },
    { id: 'users', name: 'Employee Scanning', icon: UserGroupIcon },
    { id: 'products', name: 'Product Popularity', icon: CubeIcon },
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
      
      // Get all scan data with details per user
      const { data: scans, error: scansError } = await supabase
        .from('scan_history')
        .select('user_id, scanned_at, scanned_code, product_description')
        .gte('scanned_at', startDate.toISOString())
        .lte('scanned_at', endDate.toISOString())
        .order('scanned_at', { ascending: false });

      if (scansError) throw scansError;

      // Group scans by user and calculate statistics
      const userScansMap = {};
      (scans || []).forEach(scan => {
        const userId = scan.user_id || 'unknown';
        if (!userScansMap[userId]) {
          userScansMap[userId] = [];
        }
        userScansMap[userId].push(scan);
      });

      // Get user details
      const userIds = Object.keys(userScansMap);
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, email, first_name, last_name')
        .in('id', userIds);

      if (usersError) throw usersError;

      // Map user data with detailed statistics
      const userData = userIds.map(userId => {
        const user = users?.find(u => u.id === userId);
        const userScans = userScansMap[userId] || [];
        const scanCount = userScans.length;
        
        // Calculate statistics
        const scanDates = userScans.map(s => new Date(s.scanned_at)).sort((a, b) => a - b);
        const firstScan = scanDates[0];
        const lastScan = scanDates[scanDates.length - 1];
        
        // Calculate scans per day
        const daysDiff = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
        const scansPerDay = (scanCount / daysDiff).toFixed(1);
        
        // Group by day to find most active day
        const dailyCounts = {};
        userScans.forEach(scan => {
          const date = new Date(scan.scanned_at).toLocaleDateString();
          dailyCounts[date] = (dailyCounts[date] || 0) + 1;
        });
        const maxScansInDay = Math.max(...Object.values(dailyCounts), 0);
        const mostActiveDay = Object.entries(dailyCounts).find(([_, count]) => count === maxScansInDay)?.[0] || 'N/A';

        return {
          id: userId,
          name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email : 'Unknown User',
          email: user?.email || 'N/A',
          scanCount: scanCount,
          firstScan: firstScan ? firstScan.toLocaleString() : 'N/A',
          lastScan: lastScan ? lastScan.toLocaleString() : 'N/A',
          scansPerDay: scansPerDay,
          mostActiveDay: mostActiveDay,
          maxScansInDay: maxScansInDay,
          allScans: userScans, // Store all scans for detailed view
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

  // (Removed) Fetch API cost tracking data – no longer needed

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
          // fetchApiCosts(), // API cost tracking removed
          fetchProductPopularity(),
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
          csvContent = 'Employee,Email,Total Scans,Scans Per Day,First Scan,Last Scan,Most Active Day,Max Scans In Day\n';
          userPerformance.users.forEach(user => {
            csvContent += `"${user.name}","${user.email}",${user.scanCount},${user.scansPerDay},"${user.firstScan}","${user.lastScan}","${user.mostActiveDay}",${user.maxScansInDay}\n`;
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Reports & Analytics</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Track performance, costs, and scale your operations</p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center space-x-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
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
      <div className="border-b border-gray-200 dark:border-gray-700">
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
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'}
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
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Scan Activity Trends</h2>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium">Total: {scanActivity.total}</span> | 
                  <span className="ml-2">Avg/Day: {scanActivity.average}</span>
                </div>
              </div>
              <div className="h-80">
                <Line data={scanActivity} options={chartOptions} />
              </div>
            </div>
          )}

          {/* User Performance / Employee Scanning */}
          {activeTab === 'users' && userPerformance && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Employee Scanning Activity</h2>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium">Total Scans: {userPerformance.totalScans}</span>
                  <span className="ml-4">Active Employees: {userPerformance.users.length}</span>
                </div>
              </div>
              {userPerformance.topPerformer && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Top Performer</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {userPerformance.topPerformer.name} - {userPerformance.topPerformer.scanCount} scans
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {userPerformance.topPerformer.scansPerDay} scans/day average
                  </p>
                </div>
              )}
              <div className="h-80 mb-6">
                <Bar
                  data={{
                    labels: userPerformance.users.map(u => u.name.length > 15 ? u.name.substring(0, 15) + '...' : u.name),
                    datasets: [{
                      label: 'Total Scans',
                      data: userPerformance.users.map(u => u.scanCount),
                      backgroundColor: 'rgba(59, 130, 246, 0.5)',
                    }],
                  }}
                  options={chartOptions}
                />
              </div>
              
              {/* Employee Statistics Table */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Employee Scanning Statistics</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Total Scans</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Scans/Day</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">First Scan</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Last Scan</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Most Active Day</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {userPerformance.users.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{user.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.email}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-semibold">{user.scanCount}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.scansPerDay}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.firstScan}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.lastScan}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {user.mostActiveDay} ({user.maxScansInDay} scans)
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button
                              onClick={() => setSelectedEmployee(selectedEmployee?.id === user.id ? null : user)}
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                            >
                              {selectedEmployee?.id === user.id ? 'Hide Details' : 'View Scans'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Detailed Scan History for Selected Employee */}
              {selectedEmployee && (
                <div className="mt-6 p-6 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Scan History: {selectedEmployee.name}
                    </h3>
                    <button
                      onClick={() => setSelectedEmployee(null)}
                      className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                      <thead className="bg-gray-100 dark:bg-gray-600">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Scan Time</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">FNSKU/Code</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Product</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                        {selectedEmployee.allScans && selectedEmployee.allScans.length > 0 ? (
                          selectedEmployee.allScans.map((scan, index) => (
                            <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                {new Date(scan.scanned_at).toLocaleString()}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono">
                                {scan.scanned_code || 'N/A'}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                                {scan.product_description || 'N/A'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="3" className="px-4 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                              No scan history available
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {selectedEmployee.allScans && selectedEmployee.allScans.length > 50 && (
                    <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                      Showing all {selectedEmployee.allScans.length} scans for this employee
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* API Cost Tracking section removed */}

          {/* Product Popularity */}
          {activeTab === 'products' && productPopularity && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Most Scanned Products</h2>
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

          {/* Time Analytics */}
          {activeTab === 'time' && timeAnalytics && (
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Time-Based Analytics</h2>
                <div className="mt-2 flex space-x-4 text-sm text-gray-600">
                  <span>Peak Hour: <span className="font-medium">{timeAnalytics.peakHour}:00</span></span>
                  <span>Peak Day: <span className="font-medium">{timeAnalytics.peakDay}</span></span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Scans by Hour</h3>
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
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Scans by Day of Week</h3>
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
