// Mock data for development
const mockProducts = [
  {
    id: '1',
    name: 'Product 1',
    sku: 'SKU001',
    description: 'Description for Product 1',
    price: 99.99,
    quantity: 100,
    category: 'Electronics',
    location: 'Warehouse A',
    lastUpdated: new Date().toISOString()
  },
  {
    id: '2',
    name: 'Product 2',
    sku: 'SKU002',
    description: 'Description for Product 2',
    price: 149.99,
    quantity: 50,
    category: 'Furniture',
    location: 'Warehouse B',
    lastUpdated: new Date().toISOString()
  }
];

const mockInventory = [
  {
    id: 1,
    product_id: 'PROD001',
    sku: 'X000ABC123',
    quantity: 50,
    location: 'Warehouse A',
    created_at: '2024-03-10T10:00:00Z',
    updated_at: '2024-03-10T10:00:00Z'
  },
  {
    id: 2,
    product_id: 'PROD002',
    sku: 'X000DEF456',
    quantity: 25,
    location: 'Warehouse B',
    created_at: '2024-03-10T11:00:00Z',
    updated_at: '2024-03-10T11:00:00Z'
  },
  {
    id: 3,
    product_id: 'PROD003',
    sku: 'X000GHI789',
    quantity: 100,
    location: 'Warehouse A',
    created_at: '2024-03-10T12:00:00Z',
    updated_at: '2024-03-10T12:00:00Z'
  }
];

// Mock service functions
export const mockService = {
  // Products
  getProducts: async () => {
    return { data: mockProducts, error: null };
  },
  
  getProduct: async (id) => {
    const product = mockProducts.find(p => p.id === id);
    return { data: product, error: product ? null : 'Product not found' };
  },
  
  createProduct: async (product) => {
    const newProduct = {
      ...product,
      id: Date.now().toString(),
      lastUpdated: new Date().toISOString()
    };
    mockProducts.push(newProduct);
    return { data: newProduct, error: null };
  },
  
  updateProduct: async (id, updates) => {
    const index = mockProducts.findIndex(p => p.id === id);
    if (index === -1) {
      return { data: null, error: 'Product not found' };
    }
    mockProducts[index] = {
      ...mockProducts[index],
      ...updates,
      lastUpdated: new Date().toISOString()
    };
    return { data: mockProducts[index], error: null };
  },
  
  deleteProduct: async (id) => {
    const index = mockProducts.findIndex(p => p.id === id);
    if (index === -1) {
      return { error: 'Product not found' };
    }
    mockProducts.splice(index, 1);
    return { error: null };
  },
  
  // Inventory
  getInventory: async () => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    return mockInventory;
  },
  
  getInventoryBySku: async (sku) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockInventory.find(item => item.sku === sku);
  },
  
  addOrUpdateInventory: async (data) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const existingIndex = mockInventory.findIndex(item => item.sku === data.sku);
    
    if (existingIndex >= 0) {
      mockInventory[existingIndex] = {
        ...mockInventory[existingIndex],
        ...data,
        updated_at: new Date().toISOString()
      };
      return mockInventory[existingIndex];
    } else {
      const newItem = {
        id: mockInventory.length + 1,
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      mockInventory.push(newItem);
      return newItem;
    }
  },
  
  // Scanner
  scanBarcode: async (barcode) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    const item = mockInventory.find(item => item.sku === barcode);
    if (item) {
      return {
        success: true,
        data: item
      };
    }
    return {
      success: false,
      error: 'Product not found'
    };
  }
};

export default mockService; 