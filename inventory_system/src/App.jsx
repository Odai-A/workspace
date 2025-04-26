import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { useAuth } from './context/AuthContext';
import { NavigationProvider } from './contexts/NavigationContext';
import 'react-toastify/dist/ReactToastify.css';

// Pages
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';
import Scanner from './pages/Scanner';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Register from './pages/Register';
import Users from './pages/Users';
import ScanTasks from './pages/ScanTasks';
import ScanTaskDetail from './pages/ScanTaskDetail';

// Components
import Layout from './components/layout/Layout';

function App() {
  const { loading, isAuthenticated } = useAuth();
  
  useEffect(() => {
    console.log('App rendered with auth state:', { loading, isAuthenticated });
  }, [loading, isAuthenticated]);
  
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
            <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/dashboard" replace />} />
            <Route path="/register" element={!isAuthenticated ? <Register /> : <Navigate to="/dashboard" replace />} />
            
            {/* Protected routes */}
            <Route 
              path="/" 
              element={isAuthenticated ? <Layout /> : <Navigate to="/login" replace />}
            >
              <Route index element={<Dashboard />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="products" element={<Products />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="reports" element={<Reports />} />
              <Route path="scanner" element={<Scanner />} />
              <Route path="settings" element={<Settings />} />
              <Route path="profile" element={<Profile />} />
              <Route path="users" element={<Users />} />
              <Route path="scan-tasks" element={<ScanTasks />} />
              <Route path="scan-tasks/:id" element={<ScanTaskDetail />} />
            </Route>
            
            {/* Fallback for unknown routes */}
            <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
          </Routes>
        </NavigationProvider>
      </Router>
    </>
  );
}

export default App;