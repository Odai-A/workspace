import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { scanTaskService } from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Table from '../components/ui/Table';
import { ChevronLeftIcon, PencilIcon, TrashIcon, ClockIcon, TagIcon, IdentificationIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';

const ScanTaskDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) {
      setError('No task ID provided');
      setLoading(false);
      return;
    }

    fetchTaskDetail(id);
  }, [id]);

  const fetchTaskDetail = async (taskId) => {
    setLoading(true);
    try {
      const response = await scanTaskService.getTaskById(taskId);
      
      if (response && response.succeeded) {
        setTask(response.data);
      } else {
        setError(response.messages?.[0] || 'Failed to load task details');
        toast.error(response.messages?.[0] || 'Failed to load task details');
      }
    } catch (error) {
      console.error('Error fetching task details:', error);
      setError('An error occurred while loading task details');
      toast.error('An error occurred while loading task details');
    } finally {
      setLoading(false);
    }
  };

  // Get task state display name
  const getTaskStateDisplay = (state) => {
    switch (state) {
      case 0:
        return { label: 'Pending', color: 'gray' };
      case 1:
        return { label: 'In Progress', color: 'blue' };
      case 2:
        return { label: 'Completed', color: 'green' };
      case 3:
        return { label: 'Failed', color: 'red' };
      default:
        return { label: 'Unknown', color: 'gray' };
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Calculate duration in human readable format
  const getDuration = (duration) => {
    if (!duration && duration !== 0) return 'N/A';
    
    // Duration is in seconds
    if (duration < 60) {
      return `${duration} seconds`;
    } else if (duration < 3600) {
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      return `${minutes} min ${seconds} sec`;
    } else {
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      return `${hours} hr ${minutes} min`;
    }
  };

  // Return to scan tasks list
  const handleBack = () => {
    navigate('/scan-tasks');
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="p-6 bg-red-50 border border-red-300">
          <h1 className="text-xl font-bold text-red-700 mb-4">Error</h1>
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={handleBack}>
            <ChevronLeftIcon className="w-5 h-5 mr-2" />
            Back to Scan Tasks
          </Button>
        </Card>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="p-6">
          <h1 className="text-xl font-bold mb-4">Task Not Found</h1>
          <p className="text-gray-600 mb-4">The scan task you're looking for doesn't exist or you don't have permission to view it.</p>
          <Button onClick={handleBack}>
            <ChevronLeftIcon className="w-5 h-5 mr-2" />
            Back to Scan Tasks
          </Button>
        </Card>
      </div>
    );
  }

  const taskState = getTaskStateDisplay(task.taskState);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button onClick={handleBack} variant="outline" className="flex items-center">
          <ChevronLeftIcon className="w-5 h-5 mr-2" />
          Back to Scan Tasks
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Task Overview */}
        <Card className="p-6 md:col-span-2">
          <div className="flex justify-between items-start mb-4">
            <h1 className="text-2xl font-bold">Task #{task.id}</h1>
            <Badge color={taskState.color} size="lg">{taskState.label}</Badge>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Barcode</h3>
              <p className="text-lg font-semibold font-mono">{task.barCode || 'N/A'}</p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">ASIN</h3>
              <p className="text-lg font-semibold font-mono">{task.asin || 'Not Available'}</p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">Assigned</h3>
              <p className="text-base">{formatDate(task.assignmentDate)}</p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">Created</h3>
              <p className="text-base">{formatDate(task.createdOn)}</p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">Finished</h3>
              <p className="text-base">
                {task.finishedOn ? formatDate(task.finishedOn) : 'Not Finished'}
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">User</h3>
              <p className="text-base">{task.user || 'N/A'}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            {task.asin && (
              <Button onClick={() => window.open(`https://www.amazon.com/dp/${task.asin}`, '_blank')}>
                View on Amazon
              </Button>
            )}
            
            <Button
              variant="outline"
              onClick={() => navigate(`/scanner?code=${task.barCode}`)}
            >
              Scan Again
            </Button>
          </div>
        </Card>

        {/* Task Stats */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Task Statistics</h2>
          
          <div className="space-y-4">
            <div className="flex items-center">
              <ClockIcon className="w-5 h-5 mr-3 text-gray-500" />
              <div>
                <h3 className="text-sm font-medium text-gray-500">Total Duration</h3>
                <p className="text-lg font-semibold">{getDuration(task.duration)}</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <ClockIcon className="w-5 h-5 mr-3 text-gray-500" />
              <div>
                <h3 className="text-sm font-medium text-gray-500">Processing Time</h3>
                <p className="text-lg font-semibold">{getDuration(task.processingDuration)}</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <TagIcon className="w-5 h-5 mr-3 text-gray-500" />
              <div>
                <h3 className="text-sm font-medium text-gray-500">Barcode Format</h3>
                <p className="text-lg font-semibold">
                  {task.barCode?.startsWith('X') ? 'FNSKU' : 'Standard'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center">
              <IdentificationIcon className="w-5 h-5 mr-3 text-gray-500" />
              <div>
                <h3 className="text-sm font-medium text-gray-500">User ID</h3>
                <p className="text-base font-mono truncate max-w-[200px]">{task.userId || 'N/A'}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ScanTaskDetail; 