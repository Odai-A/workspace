import React, { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Table from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';
import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import { scanTaskService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';

const ScanTasks = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 0,
    totalCount: 0,
    pageSize: 10
  });
  const [newBarcode, setNewBarcode] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  // Load tasks on component mount and when pagination changes
  useEffect(() => {
    fetchTasks();
  }, [pagination.currentPage, pagination.pageSize]);

  // Fetch scan tasks with current pagination settings
  const fetchTasks = async () => {
    setLoading(true);
    try {
      const response = await scanTaskService.getMyTasks({
        searchString: searchTerm,
        pageNumber: pagination.currentPage,
        pageSize: pagination.pageSize
      });

      if (response && response.succeeded) {
        setTasks(response.data || []);
        setPagination({
          currentPage: response.currentPage,
          totalPages: response.totalPages,
          totalCount: response.totalCount,
          pageSize: response.pageSize
        });
      } else {
        toast.error(response.messages?.[0] || 'Failed to load scan tasks');
        setTasks([]);
      }
    } catch (error) {
      console.error('Error fetching scan tasks:', error);
      toast.error('An error occurred while loading scan tasks');
    } finally {
      setLoading(false);
    }
  };

  // Handle search form submission
  const handleSearch = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, currentPage: 1 })); // Reset to first page
    fetchTasks();
  };

  // Handle adding a new scan task
  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newBarcode) {
      toast.error('Please enter a barcode');
      return;
    }

    setAddingTask(true);
    try {
      const response = await scanTaskService.addOrGetTask(newBarcode);
      
      if (response && response.succeeded) {
        toast.success('Scan task added successfully');
        setNewBarcode('');
        fetchTasks(); // Refresh the task list
      } else {
        toast.error(response.messages?.[0] || 'Failed to add scan task');
      }
    } catch (error) {
      console.error('Error adding scan task:', error);
      toast.error('An error occurred while adding scan task');
    } finally {
      setAddingTask(false);
    }
  };

  // Handle page change
  const handlePageChange = (page) => {
    setPagination(prev => ({ ...prev, currentPage: page }));
  };

  // Format task state for display
  const getTaskStateDisplay = (state) => {
    switch (state) {
      case 0:
        return <Badge color="gray">Pending</Badge>;
      case 1:
        return <Badge color="blue">In Progress</Badge>;
      case 2:
        return <Badge color="green">Completed</Badge>;
      case 3:
        return <Badge color="red">Failed</Badge>;
      default:
        return <Badge color="gray">Unknown</Badge>;
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Table columns configuration
  const columns = [
    {
      header: 'ID',
      accessor: 'id',
    },
    {
      header: 'Barcode',
      accessor: 'barCode',
    },
    {
      header: 'ASIN',
      accessor: 'asin',
      cell: (value) => value || 'N/A',
    },
    {
      header: 'State',
      accessor: 'taskState',
      cell: (value) => getTaskStateDisplay(value),
    },
    {
      header: 'Created',
      accessor: 'createdOn',
      cell: (value) => formatDate(value),
    },
    {
      header: 'Finished',
      accessor: 'finishedOn',
      cell: (value) => formatDate(value),
    },
    {
      header: 'Actions',
      accessor: 'id',
      cell: (value) => (
        <Button
          size="sm"
          onClick={() => window.open(`/scan-tasks/${value}`, '_blank')}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Scan Tasks</h1>
        <Button
          onClick={() => window.open('/scanner', '_blank')}
          className="flex items-center"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          Scan New Item
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Search Form */}
        <Card className="p-4 md:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Search Scan Tasks</h2>
          <form onSubmit={handleSearch} className="flex items-end gap-4">
            <div className="flex-1">
              <Input
                label="Search Term"
                placeholder="Enter barcode, ASIN, or any search term"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={loading}>
              <MagnifyingGlassIcon className="w-5 h-5 mr-2" />
              Search
            </Button>
          </form>
        </Card>

        {/* Add Task Form */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Add New Task</h2>
          <form onSubmit={handleAddTask}>
            <Input
              label="Barcode / FNSKU"
              placeholder="Enter barcode to add"
              value={newBarcode}
              onChange={(e) => setNewBarcode(e.target.value)}
              className="mb-4"
            />
            <Button
              type="submit"
              className="w-full"
              disabled={addingTask || !newBarcode}
            >
              {addingTask ? 'Adding...' : 'Add Task'}
            </Button>
          </form>
        </Card>
      </div>

      {/* Tasks Table */}
      <Card className="p-4 mb-6">
        <h2 className="text-lg font-semibold mb-4">
          {loading ? 'Loading Scan Tasks...' : `Scan Tasks (${pagination.totalCount})`}
        </h2>
        
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No scan tasks found. Create a new task to get started.
          </div>
        ) : (
          <>
            <Table
              data={tasks}
              columns={columns}
            />
            
            {pagination.totalPages > 1 && (
              <div className="mt-6 flex justify-center">
                <Pagination
                  currentPage={pagination.currentPage}
                  totalPages={pagination.totalPages}
                  onPageChange={handlePageChange}
                />
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

export default ScanTasks; 