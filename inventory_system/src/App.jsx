import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';

// Import contexts
import { AuthProvider } from './contexts/AuthContext';
import { NavigationProvider } from './contexts/NavigationContext';

// Import components
import ProtectedRoute from './components/auth/ProtectedRoute';

// Import pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Products from './pages/Products';
import Scanner from './pages/Scanner';
import NotFound from './pages/NotFound';

// Import styles
import 'react-toastify/dist/ReactToastify.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NavigationProvider>
          {/* Toast notifications container */}
          <ToastContainer
            position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
          />
          
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            
            {/* Protected routes */}
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/inventory" 
              element={
                <ProtectedRoute requiredPermission="view_inventory">
                  <Inventory />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/products" 
              element={
                <ProtectedRoute requiredPermission="view_products">
                  <Products />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/scanner" 
              element={
                <ProtectedRoute requiredPermission="use_scanner">
                  <Scanner />
                </ProtectedRoute>
              } 
            />
            
            {/* Additional routes would be added here */}
            
            {/* Redirect root to dashboard */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            
            {/* 404 route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </NavigationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;