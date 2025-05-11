import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/ui/Button';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Mock data for top-selling products
const topSellingProductsData = {
  labels: ['Widget A', 'Widget B', 'Widget C', 'Widget D', 'Widget E'],
  datasets: [
    {
      label: 'Units Sold',
      data: [120, 98, 85, 75, 60],
      backgroundColor: 'rgba(255, 99, 132, 0.5)',
    },
  ],
};

// Chart options
const chartOptions = {
  responsive: true,
  plugins: {
    legend: {
      position: 'top',
    },
  },
};

function Reports() {
  const [activeTab, setActiveTab] = useState('sales');
  const { hasPermission } = useAuth();

  // Report types available to the user
  const reportTypes = [
    { id: 'sales', name: 'Top Selling Products', permission: 'view_reports' },
    { id: 'forecast', name: 'Inventory Forecast', permission: 'view_reports' },
  ];

  // Filter report types based on user permissions
  const availableReports = reportTypes.filter(report => 
    hasPermission(report.permission)
  );

  // Handle export actions
  const handleExportCSV = () => {
    // In a real app, this would trigger a CSV export
    alert('Exporting as CSV...');
  };

  const handleExportPDF = () => {
    // In a real app, this would trigger a PDF export
    alert('Exporting as PDF...');
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-600">View and generate reports for inventory analysis</p>
      </div>

      {/* Report tabs */}
      <div className="mb-6">
        <div className="sm:hidden">
          <label htmlFor="reportTab" className="sr-only">Select a report</label>
          <select
            id="reportTab"
            name="reportTab"
            className="block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
          >
            {availableReports.map((report) => (
              <option key={report.id} value={report.id}>{report.name}</option>
            ))}
          </select>
        </div>
        <div className="hidden sm:block">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              {availableReports.map((report) => (
                <button
                  key={report.id}
                  onClick={() => setActiveTab(report.id)}
                  className={`
                    whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                    ${activeTab === report.id
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                  `}
                >
                  {report.name}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* Report content */}
      <div className="bg-white p-6 rounded-lg shadow">
        {activeTab === 'sales' && (
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Top Selling Products</h2>
            <div className="h-80">
              <Bar options={chartOptions} data={topSellingProductsData} />
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-600">
                This report shows the top selling products based on unit sales.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'forecast' && (
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Inventory Forecast</h2>
            <div className="text-center py-10">
              <p className="text-gray-500">
                Inventory forecast report requires additional historical data. Feature coming soon.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Export options */}
      <div className="mt-6 flex justify-end space-x-3">
        <Button 
          variant="outline"
          onClick={handleExportCSV}
          className="flex items-center"
        >
          <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
          Export as CSV
        </Button>
        <Button 
          variant="outline"
          onClick={handleExportPDF}
          className="flex items-center"
        >
          <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
          Export as PDF
        </Button>
      </div>
    </div>
  );
}

export default Reports; 