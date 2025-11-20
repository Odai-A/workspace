import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../config/supabaseClient';
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

  // Fetch users from Supabase
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      console.log('Fetching users from Supabase...');
      
      // First, check current user's role
      const { data: { user: currentAuthUser } } = await supabase.auth.getUser();
      console.log('Current auth user:', currentAuthUser?.id);
      
      // Get current user's profile to check role
      const { data: currentUserProfile } = await supabase
        .from('users')
        .select('role, email')
        .eq('id', currentAuthUser?.id)
        .maybeSingle();
      
      console.log('Current user profile:', currentUserProfile);
      console.log('Current user role:', currentUserProfile?.role);
      
      // Fetch users from Supabase users table
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) {
        console.error('Error fetching users:', usersError);
        console.error('Error code:', usersError.code);
        console.error('Error message:', usersError.message);
        
        // If permission denied, try to fetch only own profile
        if (usersError.code === '42501' || usersError.message.includes('permission')) {
          console.warn('Permission denied for all users, trying to fetch own profile only');
          const { data: ownProfile } = await supabase
            .from('users')
            .select('*')
            .eq('id', currentAuthUser?.id)
            .maybeSingle();
          
          if (ownProfile) {
            const enriched = await enrichUserWithStats(ownProfile);
            setUsers([enriched]);
            toast.warning('Only showing your profile. You may need admin role to see all users.');
            setIsLoading(false);
            return;
          }
        }
        
        throw usersError;
      }

      console.log('Users fetched:', usersData?.length || 0, 'users');
      console.log('Users data:', usersData);

      if (!usersData || usersData.length === 0) {
        console.warn('No users found in users table');
        // Check if it's an RLS issue by trying to count
        const { count } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true });
        console.log('Total users count (if accessible):', count);
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
      
      if (error.code === '42501') {
        toast.error('Permission denied. Make sure your user has admin role in the users table.');
      } else {
        toast.error(`Failed to load users: ${error.message}`);
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
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      console.log('Creating user:', newUser.email);
      
      // Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
        options: {
          data: {
            first_name: newUser.firstName,
            last_name: newUser.lastName,
            role: newUser.role // Put in user_metadata for trigger
          },
          emailRedirectTo: window.location.origin
        }
      });

      if (authError) {
        console.error('Auth error:', authError);
        throw authError;
      }

      console.log('Auth data:', authData);

      if (authData.user) {
        console.log('User created in auth, ID:', authData.user.id);
        
        // Wait for trigger to create profile (trigger runs asynchronously)
        let retries = 0;
        const maxRetries = 10;
        let profileCreated = false;
        
        while (retries < maxRetries && !profileCreated) {
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Check if profile exists
          const { data: existingProfile, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('id', authData.user.id)
            .maybeSingle();
          
          if (existingProfile) {
            console.log('Profile found, updating role');
            profileCreated = true;
            
            // Update the role in the users table
            const { error: profileError } = await supabase
              .from('users')
              .update({
                role: newUser.role,
                first_name: newUser.firstName,
                last_name: newUser.lastName
              })
              .eq('id', authData.user.id);

            if (profileError) {
              console.error('Error updating profile:', profileError);
              toast.warning('User created but role update failed. Please update manually.');
            } else {
              console.log('Profile updated successfully');
            }
          } else if (checkError) {
            console.error('Error checking profile:', checkError);
          } else {
            console.log(`Profile not found yet, retry ${retries + 1}/${maxRetries}`);
          }
          
          retries++;
        }
        
        if (!profileCreated) {
          console.warn('⚠️ Profile was not created by trigger after', maxRetries, 'retries');
          console.warn('Attempting manual creation...');
          
          // Try to create manually as fallback
          const { data: insertedData, error: insertError } = await supabase
            .from('users')
            .insert({
              id: authData.user.id,
              email: newUser.email,
              first_name: newUser.firstName,
              last_name: newUser.lastName,
              role: newUser.role
            })
            .select()
            .single();
          
          if (insertError) {
            console.error('❌ Error creating profile manually:', insertError);
            console.error('Error details:', {
              code: insertError.code,
              message: insertError.message,
              details: insertError.details,
              hint: insertError.hint
            });
            
            // Provide helpful error message
            if (insertError.code === '42501') {
              toast.error('Permission denied. Please check RLS policies. You may need to run the migration script.');
            } else if (insertError.code === '23505') {
              toast.warning('User profile may already exist. Refreshing list...');
              await fetchUsers();
            } else {
              toast.error(`Profile creation failed: ${insertError.message}. Check console for details.`);
            }
          } else {
            console.log('✅ Profile created manually:', insertedData);
            toast.success('User profile created successfully!');
          }
        }

        toast.success('User created successfully. They will receive an email confirmation.');
        setShowAddModal(false);
        setNewUser({ email: '', password: '', firstName: '', lastName: '', role: 'employee' });
        
        // Refresh users list
        await fetchUsers();
      } else {
        throw new Error('Failed to create user - no user data returned');
      }
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error(`Failed to create user: ${error.message}`);
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
        toast.info('Password updates require admin access. Users can reset their own passwords via email.');
      }

      toast.success('User updated successfully');
      setShowEditModal(false);
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error(`Failed to update user: ${error.message}`);
    }
  };

  // Handle delete user
  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`Are you sure you want to delete user ${userEmail}? This action cannot be undone.`)) {
      return;
    }

    if (userId === currentUser?.id) {
      toast.error('You cannot delete your own account');
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

      toast.success('User profile deleted. Note: Auth user deletion requires admin access.');
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error(`Failed to delete user: ${error.message}`);
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

      toast.success('User role updated successfully');
      fetchUsers();
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error(`Failed to update role: ${error.message}`);
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
          <h1 className="text-3xl font-bold text-gray-900">Users & Employees</h1>
          <p className="text-gray-600 mt-1">Manage your team members and their roles</p>
        </div>
        <Button
          variant="primary"
          onClick={() => setShowAddModal(true)}
          className="mt-4 md:mt-0 flex items-center"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Add Employee
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
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
            <tbody className="bg-white divide-y divide-gray-200">
              {users.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                    No users found. Add your first employee to get started.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                          <UserIcon className="h-6 w-6 text-indigo-600" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.firstName} {user.lastName}
                          </div>
                          <div className="text-sm text-gray-500">{user.email}</div>
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
                      <div className="flex items-center text-sm text-gray-900">
                        <QrCodeIcon className="h-4 w-4 mr-1 text-gray-400" />
                        {user.scanCount}
                      </div>
                      {user.lastScanTime && (
                        <div className="text-xs text-gray-500 mt-1">
                          Last: {new Date(user.lastScanTime).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
                          className="text-indigo-600 hover:text-indigo-900 p-1"
                          title="Edit User"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id, user.email)}
                          className="text-red-600 hover:text-red-900 p-1"
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
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Add New Employee</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input
                  type="text"
                  value={newUser.firstName}
                  onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="John"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  type="text"
                  value={newUser.lastName}
                  onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Minimum 6 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
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
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Edit User</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input
                  type="text"
                  value={editingUser.firstName}
                  onChange={(e) => setEditingUser({ ...editingUser, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  type="text"
                  value={editingUser.lastName}
                  onChange={(e) => setEditingUser({ ...editingUser, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editingUser.email}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                />
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password (leave blank to keep current)</label>
                <input
                  type="password"
                  value={editingUser.newPassword || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, newPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
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
