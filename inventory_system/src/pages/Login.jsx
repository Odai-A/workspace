import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useAuth } from '../contexts/AuthContext';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

// Login validation schema
const schema = yup.object({
  username: yup.string().required('Username is required'),
  password: yup.string().required('Password is required'),
}).required();

const Login = () => {
  const navigate = useNavigate();
  const { login, currentUser, error, isLoading, setError } = useAuth();
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: yupResolver(schema)
  });

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (currentUser) {
      navigate('/dashboard', { replace: true });
    }
  }, [currentUser, navigate]);

  // Clear any previous errors when the component mounts
  useEffect(() => {
    setError(null);
  }, [setError]);

  const onSubmit = async (data) => {
    const success = await login(data.username, data.password);
    if (success) {
      navigate('/dashboard');
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h2 className="text-center text-3xl font-extrabold text-gray-900">
            Amazon Inventory Management
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Login to your account to continue
          </p>
        </div>

        <Card className="p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
              {error}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <Input
                label="Username"
                type="text"
                id="username"
                fullWidth
                placeholder="Enter your username"
                {...register('username')}
                error={errors.username?.message}
                autoComplete="username"
              />
            </div>

            <div>
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                id="password"
                fullWidth
                placeholder="Enter your password"
                {...register('password')}
                error={errors.password?.message}
                autoComplete="current-password"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="show-password"
                  name="show-password"
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  onChange={() => setShowPassword(!showPassword)}
                />
                <label htmlFor="show-password" className="ml-2 block text-sm text-gray-900">
                  Show password
                </label>
              </div>

              <div className="text-sm">
                <Link to="/forgot-password" className="font-medium text-blue-600 hover:text-blue-500">
                  Forgot your password?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              fullWidth
              variant="primary"
              size="lg"
              isLoading={isLoading}
            >
              Sign in
            </Button>
          </form>

          <div className="mt-6">
            <p className="text-center text-sm text-gray-600">
              Don't have an account?{' '}
              <Link to="/request-access" className="font-medium text-blue-600 hover:text-blue-500">
                Request access
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Login;