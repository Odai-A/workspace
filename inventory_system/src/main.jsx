import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import App from './App.jsx'
import './index.css'

console.log('Main.jsx is loading the App with AuthProvider...')

// Add error handling for React rendering
window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error);
  // Log additional details for auth context errors
  if (event.error?.message?.includes('useAuth must be used within an AuthProvider')) {
    console.error('AuthProvider error detected. Check that all components using useAuth are wrapped in AuthProvider');
  }
});

const root = document.getElementById('root')
console.log('Root element:', root)

try {
  // Wrap the App component with AuthProvider at the highest level
  createRoot(root).render(
    <StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </StrictMode>,
  )
  console.log('App rendered successfully')
} catch (error) {
  console.error('Error rendering the application:', error)
  // Display a helpful error message in the DOM
  if (root) {
    root.innerHTML = `
      <div style="padding: 20px; color: red; font-family: sans-serif;">
        <h2>Application Error</h2>
        <p>${error.message}</p>
        <p>Check the browser console for more details.</p>
        ${error.message.includes('AuthProvider') ? 
          '<p>Authentication context error: Make sure AuthProvider is properly set up.</p>' : ''}
      </div>
    `
  }
} 