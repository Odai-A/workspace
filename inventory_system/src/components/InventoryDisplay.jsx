import React, { useEffect, useState } from 'react';
// Assuming supabaseClient.js is in src/config/
import { supabase } from '../config/supabaseClient'; 

function InventoryDisplay() {
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchInventory() {
      try {
        setLoading(true);
        // --- Assuming table name is 'inventory' ---
        // --- Change if your table name is different ---
        const { data: fetchedData, error: fetchError } = await supabase
          .from('inventory') 
          .select('*'); // Fetches all columns

        if (fetchError) {
          // If RLS is enabled and no policy allows select, fetchError will occur.
          // Also check connection details in supabaseClient.js if needed.
          throw fetchError;
        }

        setInventoryItems(fetchedData || []);
      } catch (err) {
        console.error("Error fetching inventory:", err);
        setError(err.message || 'Failed to fetch inventory. Check console and RLS policies.');
      } finally {
        setLoading(false);
      }
    }

    fetchInventory();
  }, []); // Empty dependency array means this runs once on mount

  if (loading) return <p>Loading inventory data from Supabase...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div>
      <h1>Inventory Items</h1>
      {inventoryItems.length === 0 ? (
        <p>No inventory items found, or table is empty/inaccessible.</p>
      ) : (
        <ul>
          {inventoryItems.map((item) => (
            // --- Assuming 'id' is the primary key ---
            // --- Change if your primary key column is different ---
            // --- Adjust how 'item' is displayed based on your columns ---
            <li key={item.id || JSON.stringify(item)}> 
              {JSON.stringify(item)} {/* Displaying the raw item data */}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default InventoryDisplay; 