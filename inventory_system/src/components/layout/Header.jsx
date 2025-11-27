import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  UserCircleIcon, 
  BellIcon, 
  ChevronDownIcon,
  ArrowRightOnRectangleIcon,
  UserIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '../../contexts/NavigationContext';

const Header = () => {
  const { user: currentUser, signOut: logout } = useAuth();
  const { sidebarCollapsed } = useNavigation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  
  // Example notifications - in a real app these would come from an API or context
  const notifications = [
    { id: 1, message: 'Low stock: Item A123 (5 remaining)', time: '2 hours ago', read: false },
    { id: 2, message: 'Inventory reconciliation scheduled', time: '1 day ago', read: true },
  ];

  const toggleDropdown = () => {
    setDropdownOpen(!dropdownOpen);
    // Close notifications if open
    if (notificationsOpen) setNotificationsOpen(false);
  };

  const toggleNotifications = () => {
    setNotificationsOpen(!notificationsOpen);
    // Close user dropdown if open
    if (dropdownOpen) setDropdownOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    // Redirect happens in router based on auth state
  };

  return (
    <header 
      className={`fixed top-0 right-0 h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-20 transition-all duration-300 ${
        sidebarCollapsed ? 'left-16' : 'left-64'
      } md:left-auto md:w-auto w-full`}
    >
      <div className="flex items-center justify-between h-full px-4">
        <Link to="/dashboard" className="flex items-center space-x-2">
          <img 
            src="/assets/images/logo.png" 
            alt="Logo" 
            className="h-8 w-8 object-contain"
          />
        </Link>
        
        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <div className="relative">
            <button 
              onClick={toggleNotifications}
              className="relative p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <BellIcon className="h-5 w-5" />
              {notifications.some(n => !n.read) && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              )}
            </button>
            
            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl py-2 border border-gray-200 dark:border-gray-700 z-50">
                <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-200">Notifications</h3>
                </div>
                {notifications.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto">
                    {notifications.map(notification => (
                      <div 
                        key={notification.id}
                        className={`px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${
                          !notification.read ? 'bg-blue-50 dark:bg-blue-900' : ''
                        }`}
                      >
                        <p className="text-sm text-gray-800 dark:text-gray-200">{notification.message}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{notification.time}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No notifications</div>
                )}
                <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700">
                  <button className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
                    Mark all as read
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {/* User Profile */}
          <div className="relative">
            <button 
              onClick={toggleDropdown}
              className="flex items-center space-x-2 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <UserCircleIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {currentUser?.username || 'User'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {currentUser?.role || 'User'}
                </p>
              </div>
              <ChevronDownIcon className="hidden md:block h-4 w-4 text-gray-500 dark:text-gray-400" />
            </button>
            
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl py-2 border border-gray-200 dark:border-gray-700 z-50">
                <Link 
                  to="/profile" 
                  className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => setDropdownOpen(false)}
                >
                  <UserIcon className="h-4 w-4 mr-2" />
                  Profile
                </Link>
                <Link 
                  to="/settings" 
                  className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => setDropdownOpen(false)}
                >
                  <Cog6ToothIcon className="h-4 w-4 mr-2" />
                  Settings
                </Link>
                <hr className="my-1 border-gray-200 dark:border-gray-700" />
                <button 
                  onClick={handleLogout} 
                  className="flex w-full items-center px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <ArrowRightOnRectangleIcon className="h-4 w-4 mr-2" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;