# Inventory Management System

A web application for inventory and product management with barcode scanning capabilities.

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Update the Supabase credentials and API keys

## Environment Variables

The application uses the following environment variables:

- `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous key
- `VITE_F2A_BARCODE_API_KEY`: API key for the barcode lookup service
- `VITE_API_URL`: Base URL for API calls
- `VITE_USE_MOCK_DATA`: Set to "true" to use mock data when API calls fail

## Development

Start the development server:

```
npm run dev
```

## Troubleshooting API Issues

If you encounter API connectivity issues:

1. **API Connection Refused**: 
   - Check that your backend API server is running
   - Verify that `VITE_API_URL` is set correctly in your `.env` file
   - If you can't connect to an external API, set `VITE_USE_MOCK_DATA=true` in your `.env` file

2. **Supabase Connection Issues**:
   - Verify your Supabase credentials in the `.env` file
   - Check that your Supabase project is active
   - The app will use a mock Supabase client if the credentials aren't valid

3. **Data Not Showing**:
   - Check browser console for errors
   - Verify that your database tables have been created
   - Ensure that Row Level Security (RLS) policies are configured correctly

## Database Structure

The application uses the following main tables:

1. `product_lookups`: Stores product information from barcode scans
2. `inventory`: Tracks inventory quantities and locations

## Mock Data

When `VITE_USE_MOCK_DATA` is enabled, the application will generate sample data for testing. This is useful when:

- External APIs are unavailable
- You're working offline
- You're developing features that depend on API responses

## Building for Production

```
npm run build
```

## License

[MIT](LICENSE)

## Project Structure

```
├── src/
│   ├── components/   # Reusable UI components
│   ├── contexts/     # React context providers
│   ├── hooks/        # Custom React hooks
│   ├── pages/        # Application pages
│   ├── services/     # API and service integrations
│   ├── utils/        # Utility functions and helpers
│   ├── App.jsx       # Main application component
│   ├── main.jsx      # Application entry point
│   └── index.css     # Global styles (Tailwind)
├── public/           # Static assets
├── .env              # Environment variables (create from .env.example)
├── index.html        # HTML template
├── vite.config.js    # Vite configuration
└── tailwind.config.js # Tailwind configuration
```

## Authentication

This application includes a demo authentication system that accepts any username and password for testing purposes. In a production environment, you would integrate with Supabase Auth or another authentication provider.

## Available Scripts

- `pnpm install` - Install dependencies
- `pnpm run dev` - Start development server
- `pnpm run build` - Build for production
- `pnpm run preview` - Preview production build locally
- `pnpm run lint` - Lint source files

## Tech Stack

- React 18
- Vite
- TailwindCSS
- Supabase
- React Router
- React Hook Form
- React Toastify
- Axios
- Chart.js

## API Integrations

This system includes integration with the f2a.barcode API service for looking up product details using FNSKU codes.

### FNSKU to ASIN Lookup

The system can retrieve product details directly from a FNSKU label using the f2a.barcode API:

1. API key is already configured in the system
2. FNSKU scanning is available on the Scanner page
3. When a FNSKU is scanned, the system will automatically look up the corresponding ASIN and product details

## Local Product Lookup Caching

This system includes a local caching mechanism for product lookups, which helps reduce API costs and improves performance.

### How It Works

1. When a product is scanned or manually entered, the system first checks the local database for cached information
2. If no cache exists, it looks up the product from external sources (either your own database or third-party APIs)
3. After successful lookup, product information is automatically saved to the local cache for future use
4. Subsequent lookups for the same product will use the cached data instead of making API calls

### Database Setup (Supabase)

To set up the product lookup caching database:

1. Create a Supabase project at [app.supabase.com](https://app.supabase.com/)
2. Get your project URL and anon key from the API settings
3. Add these to your `.env` file:
   ```
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
4. Run the SQL migration files in the `supabase/migrations` directory to create the required tables:
   - From the Supabase dashboard, go to SQL Editor
   - Open each migration file from the `supabase/migrations` directory
   - Execute the SQL statements to create the tables

### Benefits of Local Caching

- Reduces costs associated with third-party API calls
- Improves scanning and lookup performance
- Works offline for previously scanned products
- Builds your own product database over time

## Features

- User authentication and permission management
- Inventory tracking and management
- Product lookup via barcodes/FNSKUs
- Dashboard with key metrics
- Reports generation

## FNSKU Scanner

The FNSKU (Fulfillment Network Stock Keeping Unit) Scanner feature allows you to:

1. Scan FNSKU barcodes using your device's camera
2. Lookup product details via the F2A Barcode API
3. Save products to your local database for future reference
4. View detailed product information

### How to Use the Scanner

1. Navigate to the Scanner page
2. Click "Start Scanner" to activate your device's camera
3. Position the FNSKU barcode within the viewfinder
4. The system will automatically detect and process the code
5. Alternatively, you can enter the FNSKU code manually

### API Integration

The system integrates with the F2A Barcode API for product lookups. To configure the API:

1. Get your API key from F2A Barcode
2. Add your API key to the `.env` file as `VITE_F2A_BARCODE_API_KEY`

## Getting Started

### Prerequisites

- Node.js (v16+)
- npm or yarn
- Supabase account for backend

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure environment variables in `.env` file
4. Start the development server:
   ```
   npm run dev
   ```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_F2A_BARCODE_API_KEY=your_f2a_barcode_api_key
```
