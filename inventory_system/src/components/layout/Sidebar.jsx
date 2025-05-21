import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Bars3Icon,
  XMarkIcon,
  HomeIcon,
  ArchiveBoxIcon,
  TagIcon,
  QrCodeIcon,
  ArrowsRightLeftIcon,
  TruckIcon,
  ChartBarIcon,
  MapPinIcon,
  UsersIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { useNavigation } from '../../contexts/NavigationContext';
import { useAuth } from '../../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';

// Map for icon components
const iconMap = {
  HomeIcon,
  ArchiveBoxIcon,
  TagIcon,
  QrCodeIcon,
  ArrowsRightLeftIcon,
  TruckIcon,
  ChartBarIcon,
  MapPinIcon,
  UsersIcon,
  Cog6ToothIcon,
};

const Sidebar = () => {
  const { 
    sidebarCollapsed, 
    toggleSidebar, 
    mobileNavOpen, 
    toggleMobileNav,
    navigationItems, 
    activeRoute, 
    setCurrentRoute 
  } = useNavigation();
  const { user, hasPermission, hasRole } = useAuth();
  const location = useLocation();

  // Filter navigation items based on user permissions and roles
  const authorizedItems = navigationItems.filter(item => {
    // If no permission required, show the item
    if (!item.permission && !item.role) return true;
    
    // If permission is required, check if user has it
    const hasRequiredPermission = item.permission ? hasPermission(item.permission) : true;
    
    // If role is required, check if user has it
    const hasRequiredRole = item.role ? hasRole(item.role) : true;
    
    return hasRequiredPermission && hasRequiredRole;
  });

  React.useEffect(() => {
    setCurrentRoute(location.pathname);
  }, [location.pathname, setCurrentRoute]);

  // Render navigation items
  const renderNavItems = () => {
    return authorizedItems.map((item) => {
      const Icon = iconMap[item.icon];
      const isActive = activeRoute === item.path;
      
      return (
        <Link
          key={item.path}
          to={item.path}
          className={`flex items-center py-3 px-3 rounded-lg transition-colors ${
            isActive 
              ? 'bg-blue-600 text-white' 
              : 'text-gray-600 hover:bg-gray-100'
          } ${sidebarCollapsed ? 'justify-center' : 'justify-start'}`}
          onClick={() => setCurrentRoute(item.path)}
        >
          {Icon && (
            <Icon 
              className={`h-5 w-5 ${isActive ? 'text-white' : 'text-gray-500'} ${
                !sidebarCollapsed && 'mr-3'
              }`} 
            />
          )}
          {!sidebarCollapsed && <span className="text-sm font-medium">{item.name}</span>}
        </Link>
      );
    });
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col h-screen bg-white border-r border-gray-200 transition-all duration-300 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        } fixed top-0 left-0 z-10`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
          <div className={`overflow-hidden ${sidebarCollapsed ? 'w-0' : 'w-full'}`}>
            <h1 className="text-lg font-bold text-blue-600">Inventory MS</h1>
          </div>
          <button
            onClick={toggleSidebar}
            className="p-1 rounded-md text-gray-500 hover:bg-gray-100"
          >
            {sidebarCollapsed ? (
              <Bars3Icon className="h-5 w-5" />
            ) : (
              <XMarkIcon className="h-5 w-5" />
            )}
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-2 overflow-y-auto">
          {renderNavItems()}
        </nav>
        <div className="p-3 border-t border-gray-200">
          {!sidebarCollapsed && user && (
            <div className="text-xs text-gray-500">
              <div className="font-medium">Logged in as:</div>
              <div>{user.email || 'User'}</div>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Navigation */}
      <div className="md:hidden">
        {/* Mobile menu button */}
        <button
          onClick={toggleMobileNav}
          className="fixed top-4 left-4 z-50 p-2 rounded-md text-gray-500 bg-white shadow-md"
        >
          <Bars3Icon className="h-6 w-6" />
        </button>

        {/* Mobile menu overlay */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75"
            onClick={toggleMobileNav}
          />
        )}

        {/* Mobile sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform ${
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
          } transition-transform duration-300 ease-in-out`}
        >
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
            <h1 className="text-lg font-bold text-blue-600">Inventory MS</h1>
            <button
              onClick={toggleMobileNav}
              className="p-1 rounded-md text-gray-500 hover:bg-gray-100"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 p-3 space-y-2 overflow-y-auto">
            {renderNavItems()}
          </nav>
          <div className="p-3 border-t border-gray-200">
            {user && (
              <div className="text-xs text-gray-500">
                <div className="font-medium">Logged in as:</div>
                <div>{user.email || 'User'}</div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
};

export default Sidebar;