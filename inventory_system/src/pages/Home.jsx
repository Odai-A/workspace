import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArchiveBoxIcon,
  QrCodeIcon,
  ChartBarIcon,
  CircleStackIcon,
  MagnifyingGlassIcon,
  PrinterIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  PhotoIcon,
  TagIcon,
  ClockIcon,
  ShieldCheckIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';

const Home = () => {
  const features = [
    {
      icon: <QrCodeIcon className="h-8 w-8" />,
      title: 'FNSKU Barcode Scanning',
      description: 'Scan any FNSKU barcode with your device camera and instantly retrieve complete product data. Automatic lookup returns prices, images, titles, ASINs, and more.',
    },
    {
      icon: <CircleStackIcon className="h-8 w-8" />,
      title: 'Instant Data Retrieval',
      description: 'Access a massive database that provides comprehensive product information immediately after scanning. Get prices, high-quality images, titles, and metadata in seconds.',
    },
    {
      icon: <PhotoIcon className="h-8 w-8" />,
      title: 'Product Images & Details',
      description: 'Every scan returns high-resolution product images, accurate pricing data, complete product titles, and all relevant product identifiers.',
    },
    {
      icon: <ArchiveBoxIcon className="h-8 w-8" />,
      title: 'Inventory Management',
      description: 'Automatically track scanned products in your inventory. Monitor stock levels, locations, and get alerts when items need restocking.',
    },
    {
      icon: <MagnifyingGlassIcon className="h-8 w-8" />,
      title: 'Quick Search & Lookup',
      description: 'Search your scanned products by FNSKU, ASIN, LPN, or description. Find any item instantly from your database of scanned products.',
    },
    {
      icon: <PrinterIcon className="h-8 w-8" />,
      title: 'Print Product Labels',
      description: 'Generate professional labels with product images, QR codes, and pricing information directly from your scanned FNSKU data.',
    },
  ];

  const benefits = [
    {
      title: 'Instant Data Access',
      description: 'Scan any FNSKU barcode and immediately receive complete product data - prices, images, titles, ASINs, and all metadata in one scan.',
      icon: <QrCodeIcon className="h-6 w-6" />,
    },
    {
      title: 'Massive Product Database',
      description: 'Access millions of products with comprehensive information. Every FNSKU scan queries our extensive database for accurate, up-to-date data.',
      icon: <CircleStackIcon className="h-6 w-6" />,
    },
    {
      title: 'Complete Product Information',
      description: 'Get everything you need from one scan: real-time prices, high-resolution images, detailed product titles, ASINs, and categorization.',
      icon: <CheckCircleIcon className="h-6 w-6" />,
    },
    {
      title: 'Fast & Reliable',
      description: 'Cached data ensures lightning-fast lookups. Scan FNSKU codes quickly and get instant results without delays or API costs.',
      icon: <ClockIcon className="h-6 w-6" />,
    },
  ];

  const dataHighlights = [
    { label: 'Product Prices', value: 'Real-time pricing data' },
    { label: 'Product Images', value: 'High-resolution product photos' },
    { label: 'Product Titles', value: 'Complete product descriptions' },
    { label: 'ASIN Information', value: 'Amazon product identifiers' },
    { label: 'FNSKU Codes', value: 'Fulfillment network SKUs' },
    { label: 'Categories', value: 'Organized product classifications' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Navigation */}
      <nav className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <img 
                src="/assets/images/logo.png" 
                alt="Logo" 
                className="h-12 w-auto object-contain"
              />
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/login"
                className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <div className="flex justify-center mb-8">
            <img 
              src="/assets/images/logo.png" 
              alt="Logo" 
              className="h-24 w-auto object-contain mb-4"
            />
          </div>
          <div className="flex justify-center mb-8">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-6 rounded-full">
              <QrCodeIcon className="h-20 w-20 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 dark:text-white mb-6">
            Scan FNSKU Barcodes
            <span className="block text-blue-600 dark:text-blue-400">Get Instant Product Data</span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            Simply scan any FNSKU barcode and instantly receive comprehensive product data including 
            prices, images, titles, ASINs, and detailed information. Powered by a massive database 
            that gives you everything you need to track and manage your inventory.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/register"
              className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl"
            >
              Start Scanning Now
              <ArrowRightIcon className="ml-2 h-5 w-5" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center px-8 py-3 border border-gray-300 dark:border-gray-600 text-base font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 bg-white dark:bg-gray-800">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Scan FNSKU, Get Complete Data
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            One scan gives you everything: prices, images, titles, ASINs, and detailed product information
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg hover:shadow-lg transition-shadow"
            >
              <div className="text-blue-600 dark:text-blue-400 mb-4">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Database Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 rounded-2xl p-12 text-white">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold mb-6">
                Every FNSKU Scan Returns Complete Data
              </h2>
              <p className="text-xl mb-8 text-blue-100">
                Scan any FNSKU barcode and instantly receive comprehensive product information. 
                Our massive database provides prices, high-quality images, titles, ASINs, 
                and all metadata you need. All data is cached for fast, cost-effective access.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {dataHighlights.map((item, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <CheckCircleIcon className="h-5 w-5 text-blue-200" />
                    <div>
                      <div className="font-semibold">{item.label}</div>
                      <div className="text-sm text-blue-100">{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-gray-900 dark:text-white">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <PhotoIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    <div>
                      <div className="font-semibold">Product Images</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">High-resolution photos</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <CurrencyDollarIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
                    <div>
                      <div className="font-semibold">Real-Time Prices</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Current market pricing</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <TagIcon className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                    <div>
                      <div className="font-semibold">Product Titles</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Complete descriptions</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <CircleStackIcon className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                    <div>
                      <div className="font-semibold">Metadata & More</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">ASINs, FNSKUs, categories</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 bg-gray-50 dark:bg-gray-800">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Why FNSKU Scanning Works
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Fast, accurate, and comprehensive - scan once, get all the data you need
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="bg-white dark:bg-gray-700 p-8 rounded-lg shadow-md hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="bg-blue-100 dark:bg-blue-900 p-3 rounded-lg">
                    <div className="text-blue-600 dark:text-blue-400">
                      {benefit.icon}
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    {benefit.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    {benefit.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-700 dark:to-indigo-700 rounded-2xl p-12 text-center text-white">
          <h2 className="text-4xl font-bold mb-4">
            Start Scanning FNSKU Barcodes Today
          </h2>
          <p className="text-xl mb-8 text-blue-100 max-w-2xl mx-auto">
            Get instant access to complete product data with every scan. Join businesses using FNSKU scanning to streamline their inventory operations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/register"
              className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-blue-600 bg-white hover:bg-gray-50 transition-colors shadow-lg hover:shadow-xl"
            >
              Get Started Free
              <ArrowRightIcon className="ml-2 h-5 w-5" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center px-8 py-3 border-2 border-white text-base font-medium rounded-md text-white hover:bg-white hover:text-blue-600 transition-colors"
            >
              Sign In to Your Account
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p>&copy; {new Date().getFullYear()} All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Home;

