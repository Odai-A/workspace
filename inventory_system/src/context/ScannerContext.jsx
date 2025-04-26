import { createContext, useContext, useState, useEffect } from 'react';

// Create the Scanner Context
const ScannerContext = createContext();

// Custom hook to use the Scanner Context
export const useScanner = () => {
  const context = useContext(ScannerContext);
  if (!context) {
    throw new Error('useScanner must be used within a ScannerProvider');
  }
  return context;
};

// Scanner Provider Component
export const ScannerProvider = ({ children }) => {
  // Scanner states
  const [isScanning, setIsScanning] = useState(false);
  const [scannedCode, setScannedCode] = useState(null);
  const [scanHistory, setScanHistory] = useState([]);
  const [autoProcess, setAutoProcess] = useState(true);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const savedAutoProcess = localStorage.getItem('autoProcess');
    if (savedAutoProcess !== null) {
      setAutoProcess(savedAutoProcess === 'true');
    }
  }, []);

  // Save preferences to localStorage when changed
  useEffect(() => {
    localStorage.setItem('autoProcess', autoProcess.toString());
  }, [autoProcess]);

  // Toggle scanning state
  const toggleScanning = () => {
    setIsScanning(prev => !prev);
  };

  // Process a scanned code
  const processScannedCode = (code) => {
    if (!code) return;
    
    setScannedCode(code);
    setScanHistory(prev => {
      // Add to history only if not already present
      if (!prev.includes(code)) {
        return [code, ...prev].slice(0, 50); // Keep last 50 scans
      }
      return prev;
    });
  };

  // Clear the current scanned code
  const clearScannedCode = () => {
    setScannedCode(null);
  };

  // Toggle auto-processing of scanned items
  const toggleAutoProcess = () => {
    setAutoProcess(prev => !prev);
  };

  // The value that will be provided to consumers of this context
  const value = {
    isScanning,
    toggleScanning,
    scannedCode,
    processScannedCode,
    clearScannedCode,
    scanHistory,
    autoProcess,
    toggleAutoProcess
  };

  return (
    <ScannerContext.Provider value={value}>
      {children}
    </ScannerContext.Provider>
  );
};

export default ScannerProvider; 