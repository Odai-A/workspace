import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../config/supabaseClient';
import { getApiEndpoint } from '../utils/apiConfig';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { toast } from 'react-toastify';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  UserIcon,
  ShieldCheckIcon,
  BriefcaseIcon,
  QrCodeIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';

function Users() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'employee'
  });
  const { user: currentUser } = useAuth();
  const [userLimits, setUserLimits] = useState({
    current_count: 0,
    max_users: 0,
    plan: null,
    can_add_users: false
  });

  // Fetch users from Supabase
  useEffect(() => {
    fetchUsers();
    fetchUserLimits();
  }, []);

  // Fetch user limits
  const fetchUserLimits = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(getApiEndpoint('/users/limits'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUserLimits(data);
      }
    } catch (error) {
      console.error('Error fetching user limits:', error);
    }
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      console.log('Fetching users from Supabase...');
      
      // Fetch users directly from Supabase users table
      // This will show all users that have profiles in the users table
      // (including unconfirmed users if the trigger created their profile)
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) {
        console.error('Error fetching users:', usersError);
        
        // If RLS blocks access, provide helpful guidance
        if (usersError.code === '42501') {
          toast.error('Permission denied. Please ensure your account has administrator privileges. Verify Row Level Security policies in Supabase if the issue persists.', { autoClose: 10000 });
        } else {
          toast.error(`Failed to load user list: ${usersError.message}`);
        }
        throw usersError;
      }

      console.log('Users fetched:', usersData?.length || 0, 'users');

      if (!usersData || usersData.length === 0) {
        console.warn('No users found in users table');
        toast.info('No users found. Please add your first employee to begin.', { autoClose: 3000 });
        setUsers([]);
        setIsLoading(false);
        return;
      }

      // Enrich each user with scan statistics
      const enrichedUsers = await Promise.all(
        usersData.map(async (user) => await enrichUserWithStats(user))
      );

      console.log('Enriched users:', enrichedUsers.length);
      setUsers(enrichedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      
      // Don't show duplicate error toast if we already showed one above
      if (error.code !== '42501') {
        toast.error(`Failed to load user list: ${error.message || 'An unknown error occurred'}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Enrich user with scan count and activity status
  const enrichUserWithStats = async (user) => {
    const userId = user.id;
    
    let scanCount = 0;
    let lastScan = null;
    let isActivelyScanning = false;

    try {
      // Get scan count from scan_history
      const { count, error: countError } = await supabase
        .from('scan_history')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (!countError) {
        scanCount = count || 0;

        // Get last scan time
        const { data: lastScanData, error: lastScanError } = await supabase
          .from('scan_history')
          .select('scanned_at')
          .eq('user_id', userId)
          .order('scanned_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!lastScanError && lastScanData) {
          lastScan = lastScanData;
          // Determine if user is actively scanning (scanned in last 30 minutes)
          const lastScanTime = new Date(lastScan.scanned_at);
          const timeDiff = new Date() - lastScanTime;
          isActivelyScanning = timeDiff < 30 * 60 * 1000; // 30 minutes
        }
      }
    } catch (error) {
      console.warn('Error fetching scan stats:', error);
    }

    // Last login - we can't access this from client without admin API
    // You can add a last_login field to the users table if needed
    const lastLogin = 'N/A';

    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      role: user.role || 'employee',
      status: 'Active', // You can add a status field to users table if needed
      lastLogin: lastLogin,
      scanCount: scanCount,
      isActivelyScanning: isActivelyScanning,
      lastScanTime: lastScan?.scanned_at ? new Date(lastScan.scanned_at).toLocaleString() : null,
      createdAt: user.created_at
    };
  };


  // Handle add user
  const handleAddUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.firstName) {
      toast.error('Please complete all required fields.');
      return;
    }

    try {
      console.log('Creating user via backend API:', newUser.email);
      
      // Get the current session token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Authentication required. Please log in to create users.');
        return;
      }

      // Use backend API to create user with admin privileges
      // This auto-confirms the user so they can log in immediately
      const response = await fetch(getApiEndpoint('/users'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          email: newUser.email,
          password: newUser.password,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role || 'employee'
        })
      });

      const result = await response.json();

      if (!response.ok) {
        // Show specific error message from backend (e.g., user limit reached)
        const errorMessage = result.message || result.error || `Failed to create user: ${response.statusText}`;
        toast.error(errorMessage, { autoClose: 6000 });
        throw new Error(errorMessage);
      }

      console.log('✅ User created successfully via backend API');
      toast.success(`Employee account created successfully. The employee may now log in using the email address: ${newUser.email}`);
      
      setShowAddModal(false);
      setNewUser({ email: '', password: '', firstName: '', lastName: '', role: 'employee' });
      
      // Refresh users list and limits
      await fetchUsers();
      await fetchUserLimits();
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error(`Failed to create user account: ${error.message}`);
    }
  };

  // Handle edit user
  const handleEditUser = async () => {
    if (!editingUser) return;

    try {
      // Update user profile in users table
      const { error: profileError } = await supabase
        .from('users')
        .update({
          first_name: editingUser.firstName,
          last_name: editingUser.lastName,
          role: editingUser.role
        })
        .eq('id', editingUser.id);

      if (profileError) throw profileError;

      // Update password if provided (requires admin API, which we can't use from client)
      // For password updates, you'll need to use Supabase Edge Functions or have users reset their own passwords
      if (editingUser.newPassword) {
        toast.info('Password updates require administrator access. Users may reset their own passwords via email.');
      }

      toast.success('User account updated successfully.');
      setShowEditModal(false);
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error(`Failed to update user account: ${error.message}`);
    }
  };

  // Handle delete user
  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`Are you sure you want to delete user ${userEmail}? This action cannot be undone.`)) {
      return;
    }

    if (userId === currentUser?.id) {
      toast.error('You cannot delete your own account. Please contact an administrator for assistance.');
      return;
    }

    try {
      // Delete from users table (this will cascade delete from auth.users if foreign key is set up)
      // Note: To fully delete from auth.users, you'll need an Edge Function or backend
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      toast.success('User profile deleted successfully. Note: Authentication user deletion requires administrator access.');
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error(`Failed to delete user account: ${error.message}`);
    }
  };

  // Handle role change
  const handleRoleChange = async (userId, newRole) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      toast.success('User role updated successfully.');
      fetchUsers();
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error(`Failed to update user role: ${error.message}`);
    }
  };

  // Get status badge class
  const getStatusClass = (status, isActivelyScanning) => {
    if (isActivelyScanning) {
      return 'bg-green-100 text-green-800 border border-green-300';
    }
    switch (status) {
      case 'Active':
        return 'bg-blue-100 text-blue-800';
      case 'Inactive':
        return 'bg-gray-100 text-gray-800';
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get role badge class
  const getRoleClass = (role) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-800';
      case 'manager':
        return 'bg-blue-100 text-blue-800';
      case 'employee':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Render loading state
  if (isLoading) {
    return (
      <div>
        <PageHeader title="Users & Employees" />
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Users & Employees</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your team members and their roles</p>
          {userLimits.max_users > 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              {userLimits.current_count} / {userLimits.max_users} users used
              {userLimits.plan && ` (${userLimits.plan} plan)`}
            </p>
          )}
          {!userLimits.has_subscription && userLimits.max_users === 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
              A paid subscription is required to add users
            </p>
          )}
        </div>
        <Button
          variant="primary"
          onClick={() => setShowAddModal(true)}
          className="mt-4 md:mt-0 flex items-center"
          disabled={!userLimits.can_add_users}
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Add Employee
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Scans
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Activity
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Login
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {users.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    No users found. Add your first employee to get started.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                          <UserIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {user.firstName} {user.lastName}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className={`text-xs font-semibold px-3 py-1 rounded-full border-0 ${getRoleClass(user.role)} cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
                      >
                        <option value="employee">Employee</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusClass(user.status, user.isActivelyScanning)}`}>
                        {user.isActivelyScanning ? (
                          <>
                            <CheckCircleIcon className="h-3 w-3 mr-1" />
                            Active Scanning
                          </>
                        ) : (
                          <>
                            <XCircleIcon className="h-3 w-3 mr-1" />
                            {user.status}
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900 dark:text-white">
                        <QrCodeIcon className="h-4 w-4 mr-1 text-gray-400 dark:text-gray-500" />
                        {user.scanCount}
                      </div>
                      {user.lastScanTime && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Last: {new Date(user.lastScanTime).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {user.isActivelyScanning ? (
                        <div className="flex items-center text-green-600">
                          <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                          Scanning Now
                        </div>
                      ) : (
                        <div className="flex items-center text-gray-400">
                          <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
                          Not Active
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setEditingUser({
                              ...user,
                              newPassword: ''
                            });
                            setShowEditModal(true);
                          }}
                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 p-1"
                          title="Edit User"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id, user.email)}
                          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 p-1"
                          title="Delete User"
                          disabled={user.id === currentUser?.id}
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Add New Employee</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name *</label>
                <input
                  type="text"
                  value={newUser.firstName}
                  onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="John"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                <input
                  type="text"
                  value={newUser.lastName}
                  onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password *</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Minimum 6 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role *</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              
              {/* Login Instructions */}
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <p className="text-sm text-blue-800 dark:text-blue-200 font-medium mb-1">📧 Login Instructions for Employee:</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  After creating this employee, they can log in immediately at the <strong>/login</strong> page using:
                </p>
                <ul className="text-xs text-blue-700 dark:text-blue-300 mt-1 ml-4 list-disc">
                  <li>Email: The email address you enter above</li>
                  <li>Password: The password you set above</li>
                </ul>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 italic">
                  No email confirmation required - they can log in right away!
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddModal(false);
                  setNewUser({ email: '', password: '', firstName: '', lastName: '', role: 'employee' });
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={handleAddUser}>
                Add Employee
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Edit User</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name *</label>
                <input
                  type="text"
                  value={editingUser.firstName}
                  onChange={(e) => setEditingUser({ ...editingUser, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                <input
                  type="text"
                  value={editingUser.lastName}
                  onChange={(e) => setEditingUser({ ...editingUser, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={editingUser.email}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Email cannot be changed</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password (leave blank to keep current)</label>
                <input
                  type="password"
                  value={editingUser.newPassword || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, newPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role *</label>
                <select
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUser(null);
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={handleEditUser}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Users;
