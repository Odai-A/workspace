import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { FiSave, FiPlusCircle, FiEdit, FiTrash2, FiKey, FiBell, FiSun, FiMoon } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';

// Toggle switch component
const Toggle = ({ enabled, onChange, label }) => {
  return (
    <div className="flex items-center">
      <label className="inline-flex relative items-center cursor-pointer">
        <input 
          type="checkbox" 
          className="sr-only peer" 
          checked={enabled} 
          onChange={onChange}
        />
        <div 
          className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"
        />
        <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">
          {label}
        </span>
      </label>
    </div>
  );
};

const Settings = () => {
  const { user } = useAuth();
  
  // App preferences
  const [darkMode, setDarkMode] = useState(localStorage.getItem('theme') === 'dark');
  const [autoScan, setAutoScan] = useState(localStorage.getItem('autoScan') === 'true');
  
  // Notification settings
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [stockAlerts, setStockAlerts] = useState(true);
  const [activityUpdates, setActivityUpdates] = useState(false);
  
  // API keys
  const [apiKeys, setApiKeys] = useState([
    { id: 1, name: 'F2A Barcode API', value: import.meta.env.VITE_F2A_BARCODE_API_KEY || '', isEditing: false }
  ]);
  
  // Form for adding/editing API key
  const [newApiKey, setNewApiKey] = useState({ name: '', value: '' });
  const [isAddingKey, setIsAddingKey] = useState(false);
  
  // Toggle dark mode
  const handleDarkModeToggle = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
    
    // Apply theme to document
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    toast.success(`Theme switched to ${newMode ? 'dark' : 'light'} mode`);
  };

  // Toggle auto scan
  const handleAutoScanToggle = () => {
    const newValue = !autoScan;
    setAutoScan(newValue);
    localStorage.setItem('autoScan', newValue.toString());
    toast.success(`Auto scan ${newValue ? 'enabled' : 'disabled'}`);
  };

  // Save notification settings
  const saveNotificationSettings = async () => {
    try {
      // In a real app, you would save these to user preferences in the database
      toast.success('Notification preferences saved');
    } catch (error) {
      console.error('Error saving notification settings:', error);
      toast.error('Failed to save notification settings');
    }
  };

  // Add new API key
  const handleAddApiKey = () => {
    if (!newApiKey.name || !newApiKey.value) {
      toast.error('Please enter both name and value for the API key');
      return;
    }
    
    const id = Date.now();
    setApiKeys([...apiKeys, { id, ...newApiKey, isEditing: false }]);
    setNewApiKey({ name: '', value: '' });
    setIsAddingKey(false);
    toast.success(`API key "${newApiKey.name}" added`);
  };

  // Toggle edit mode for an API key
  const toggleEditKey = (id) => {
    setApiKeys(
      apiKeys.map((key) => 
        key.id === id ? { ...key, isEditing: !key.isEditing } : key
      )
    );
  };

  // Update an API key
  const updateApiKey = (id, field, value) => {
    setApiKeys(
      apiKeys.map((key) => 
        key.id === id ? { ...key, [field]: value } : key
      )
    );
  };

  // Delete an API key
  const deleteApiKey = (id, name) => {
    setApiKeys(apiKeys.filter((key) => key.id !== id));
    toast.success(`API key "${name}" removed`);
  };

  // Save API key changes
  const saveApiKey = async (id) => {
    // In a real app, you would save this to your database
    // Here we're just updating local state
    setApiKeys(
      apiKeys.map((key) => 
        key.id === id ? { ...key, isEditing: false } : key
      )
    );
    toast.success('API key updated');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Settings</h1>
        
        {/* App Preferences */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden mb-6">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
              <FiSun className="mr-2" /> 
              <FiMoon className="mr-2" /> 
              App Preferences
            </h2>
            
            <div className="space-y-4">
              <Toggle
                enabled={darkMode}
                onChange={handleDarkModeToggle}
                label="Dark Mode"
              />
              
              <Toggle
                enabled={autoScan}
                onChange={handleAutoScanToggle}
                label="Auto-process scanned items"
              />
            </div>
          </div>
        </div>
        
        {/* Notification Settings */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden mb-6">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
              <FiBell className="mr-2" /> 
              Notification Settings
            </h2>
            
            <div className="space-y-4">
              <Toggle
                enabled={emailNotifications}
                onChange={() => setEmailNotifications(!emailNotifications)}
                label="Email Notifications"
              />
              
              <Toggle
                enabled={stockAlerts}
                onChange={() => setStockAlerts(!stockAlerts)}
                label="Low Stock Alerts"
              />
              
              <Toggle
                enabled={activityUpdates}
                onChange={() => setActivityUpdates(!activityUpdates)}
                label="Activity Updates"
              />
              
              <div className="pt-4">
                <button
                  onClick={saveNotificationSettings}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center"
                >
                  <FiSave className="mr-2" />
                  Save Notification Settings
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* API Keys */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
              <FiKey className="mr-2" /> 
              API Keys
            </h2>
            
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <div 
                  key={key.id} 
                  className="border border-gray-200 dark:border-gray-700 rounded-md p-4"
                >
                  {key.isEditing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Key Name
                        </label>
                        <input
                          type="text"
                          value={key.name}
                          onChange={(e) => updateApiKey(key.id, 'name', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Key Value
                        </label>
                        <input
                          type="text"
                          value={key.value}
                          onChange={(e) => updateApiKey(key.id, 'value', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => saveApiKey(key.id)}
                          className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center"
                        >
                          <FiSave className="mr-2" />
                          Save
                        </button>
                        <button
                          onClick={() => toggleEditKey(key.id)}
                          className="px-3 py-2 bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex justify-between items-center">
                        <h3 className="text-md font-medium text-gray-800 dark:text-gray-200">{key.name}</h3>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => toggleEditKey(key.id)}
                            className="p-1 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            <FiEdit className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => deleteApiKey(key.id, key.name)}
                            className="p-1 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                          >
                            <FiTrash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {key.value ? `${key.value.substring(0, 6)}...${key.value.substring(key.value.length - 4)}` : 'No key set'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {/* Add new API key form */}
              {isAddingKey ? (
                <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4">
                  <h3 className="text-md font-medium text-gray-800 dark:text-gray-200 mb-3">Add New API Key</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Key Name
                      </label>
                      <input
                        type="text"
                        value={newApiKey.name}
                        onChange={(e) => setNewApiKey({ ...newApiKey, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                        placeholder="e.g., Amazon API"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Key Value
                      </label>
                      <input
                        type="text"
                        value={newApiKey.value}
                        onChange={(e) => setNewApiKey({ ...newApiKey, value: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                        placeholder="Enter API key"
                      />
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={handleAddApiKey}
                        className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center"
                      >
                        <FiSave className="mr-2" />
                        Save
                      </button>
                      <button
                        onClick={() => setIsAddingKey(false)}
                        className="px-3 py-2 bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingKey(true)}
                  className="flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                >
                  <FiPlusCircle className="mr-2" />
                  Add new API key
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings; 