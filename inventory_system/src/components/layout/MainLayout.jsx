import React from 'react';
import { useNavigation } from '../../contexts/NavigationContext';
import Sidebar from './Sidebar';
import Header from './Header';

const MainLayout = ({ children }) => {
  const { sidebarCollapsed } = useNavigation();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content */}
      <div 
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'
        }`}
      >
        {/* Header */}
        <Header />
        
        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6 pt-20">
          {children}
        </main>
        
        {/* Footer */}
        <footer className="py-4 px-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} Amazon Inventory Management System
          </p>
        </footer>
      </div>
    </div>
  );
};

export default MainLayout;