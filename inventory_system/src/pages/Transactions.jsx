import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import { toast } from 'react-toastify';

// Mock data for transactions
const mockTransactions = [
  { id: 1, type: 'Inbound', reference: 'PO-12345', date: '2023-05-15', quantity: 50, itemName: 'Widget A', status: 'Completed' },
  { id: 2, type: 'Outbound', reference: 'SO-67890', date: '2023-05-16', quantity: 25, itemName: 'Widget B', status: 'Completed' },
  { id: 3, type: 'Transfer', reference: 'TR-54321', date: '2023-05-17', quantity: 10, itemName: 'Widget C', status: 'Pending' },
  { id: 4, type: 'Adjustment', reference: 'ADJ-98765', date: '2023-05-18', quantity: -5, itemName: 'Widget D', status: 'Completed' },
  { id: 5, type: 'Inbound', reference: 'PO-24680', date: '2023-05-19', quantity: 100, itemName: 'Widget E', status: 'Pending' },
];

function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { hasPermission } = useAuth();

  // Fetch transactions data
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        // In a real app, you would fetch from an API
        // const response = await apiClient.get('/transactions');
        // setTransactions(response.data);
        
        // For demo purposes, we'll use mock data with a delay to simulate loading
        setTimeout(() => {
          setTransactions(mockTransactions);
          setIsLoading(false);
        }, 500);
      } catch (error) {
        console.error('Error fetching transactions:', error);
        toast.error('Failed to load transactions');
        setIsLoading(false);
      }
    };

    fetchTransactions();
  }, []);

  // Render loading state
  if (isLoading) {
    return (
      <div className="p-4">
        <PageHeader title="Transactions" />
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <PageHeader title="Transactions" />

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                {hasPermission('edit_transactions') && (
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{transaction.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{transaction.type}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{transaction.reference}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{transaction.date}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{transaction.itemName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <span className={transaction.quantity < 0 ? 'text-red-600' : 'text-green-600'}>
                      {transaction.quantity}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      transaction.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {transaction.status}
                    </span>
                  </td>
                  {hasPermission('edit_transactions') && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button className="text-indigo-600 hover:text-indigo-900 mr-3">View</button>
                      {transaction.status === 'Pending' && (
                        <button className="text-green-600 hover:text-green-900">Complete</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Transactions; 