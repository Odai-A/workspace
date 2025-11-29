import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { useAuth } from './contexts/AuthContext';
import { NavigationProvider } from './contexts/NavigationContext';
import 'react-toastify/dist/ReactToastify.css';
import './index.css'
// import InventoryDisplay from './components/InventoryDisplay' // Removed - debug component showing raw JSON

// Pages
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';
// import Scanner from './pages/Scanner'; // Commenting out the old Page-based scanner
import Scanner from './components/Scanner'; // This is the advanced scanner with external API
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Register from './pages/Register';
import Users from './pages/Users';
// import ScanTasks from './pages/ScanTasks'; // REMOVED
// import ScanTaskDetail from './pages/ScanTaskDetail'; // REMOVED
import ProductImport from './pages/ProductImport';
import PricingPage from './pages/PricingPage';
import CustomerDashboardPage from './pages/CustomerDashboardPage';
import SuccessPage from './pages/SuccessPage';
import CancelPage from './pages/CancelPage';

// Components
import Layout from './components/layout/Layout';

function App() {
  const { loading, isAuthenticated } = useAuth();
  
  // Show a simple loading indicator while auth state is being determined
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading application...</p>
      </div>
    );
  }
  
  return (
    <>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
      
      <Router>
        <NavigationProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={!isAuthenticated ? <Home /> : <Navigate to="/dashboard" replace />} />
            <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/dashboard" replace />} />
            <Route path="/register" element={!isAuthenticated ? <Register /> : <Navigate to="/dashboard" replace />} />
            <Route path="/checkout-success" element={<SuccessPage />} />
            <Route path="/checkout-cancel" element={<CancelPage />} />
            
            {/* Protected routes - nested under Layout */}
            <Route 
              element={isAuthenticated ? <Layout /> : <Navigate to="/login" replace />}
            >
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="reports" element={<Reports />} />
              <Route path="scanner" element={<Scanner />} />
              <Route path="settings" element={<Settings />} />
              <Route path="settings/subscription" element={<CustomerDashboardPage />} />
              <Route path="profile" element={<Profile />} />
              <Route path="users" element={<Users />} />
              <Route path="pricing" element={<PricingPage />} />
              {/* <Route path="scan-tasks" element={<ScanTasks />} /> */}
              <Route path="product-import" element={<ProductImport />} />
            </Route>
            
            {/* Fallback for unknown routes */}
            <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/"} replace />} />
          </Routes>
        </NavigationProvider>
      </Router>
    </>
  );
}

export default App;