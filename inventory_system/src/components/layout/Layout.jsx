import React from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '../../contexts/NavigationContext';
import { 
  HomeIcon,
  ArchiveBoxIcon,
  TagIcon,
  QrCodeIcon,
  ArrowsRightLeftIcon,
  ChartBarIcon,
  UsersIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { FiUser, FiLogOut } from 'react-icons/fi';

// Map for icon components
const iconMap = {
  HomeIcon,
  ArchiveBoxIcon,
  TagIcon,
  QrCodeIcon,
  ArrowsRightLeftIcon,
  ChartBarIcon,
  UsersIcon,
  Cog6ToothIcon,
};

const Layout = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const { navigationItems, activeRoute, sidebarCollapsed, toggleSidebar } = useNavigation();

  // Handle logout
  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className={`bg-white w-64 flex-shrink-0 hidden md:block shadow-lg transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <div className="flex flex-col h-full">
          {/* App name/logo */}
          <div className="h-16 flex items-center justify-center border-b border-gray-200">
            <h1 className={`text-xl font-bold text-gray-800 ${sidebarCollapsed ? 'hidden' : 'block'}`}>
              Inventory System
            </h1>
          </div>

          {/* Navigation links */}
          <nav className="flex-1 overflow-y-auto py-4 px-3">
            <ul className="space-y-2">
              {navigationItems.map((item) => {
                const Icon = iconMap[item.icon];
                const isActive = location.pathname === item.path;
                
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={`flex items-center p-2 rounded-lg ${
                        isActive
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {Icon && <Icon className="h-5 w-5 mr-3" />}
                      {!sidebarCollapsed && <span>{item.name}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* User section */}
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <FiUser className="h-8 w-8 text-gray-400" />
              </div>
              {!sidebarCollapsed && (
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-700">{user?.email}</p>
                  <button
                    onClick={handleLogout}
                    className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
                  >
                    <FiLogOut className="h-4 w-4 mr-1" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow h-16 flex items-center justify-between px-6">
          <div className="flex items-center">
            <button
              onClick={toggleSidebar}
              className="text-gray-500 focus:outline-none md:hidden"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="ml-4 text-lg font-semibold text-gray-800">
              {navigationItems.find(item => location.pathname === item.path)?.name || 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center">
            <span className="text-sm text-gray-600 mr-2">
              {user?.email || 'Not signed in'}
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100">
          <div className="container mx-auto px-4 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout; 