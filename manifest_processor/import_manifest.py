#!/usr/bin/env python3
import csv
import json
import psycopg2
import sys
from pathlib import Path

def connect_db():
    return psycopg2.connect(
        dbname="manifests_db",
        user="manifest_user",
        password="manifest_password",
        host="localhost",
        port="5432"
    )

def import_csv(csv_path):
    conn = connect_db()
    cur = conn.cursor()
    
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            # Prepare the insert statement
            insert_query = """
                INSERT INTO manifests (raw_row, data)
                VALUES (%s, %s)
            """
            
            # Process each row
            for row in reader:
                # Convert row to JSON string
                json_data = json.dumps(dict(row))
                # Get the raw row as a string
                raw_row = ','.join(row.values())
                
                # Insert the data
                cur.execute(insert_query, (raw_row, json_data))
            
            # Commit the transaction
            conn.commit()
            print(f"Successfully imported {cur.rowcount} rows from {csv_path}")
            
    except Exception as e:
        print(f"Error importing CSV: {e}")
        conn.rollback()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python import_manifest.py <path_to_csv>")
        sys.exit(1)
    
    csv_path = Path(sys.argv[1])
    if not csv_path.exists():
        print(f"Error: File {csv_path} does not exist")
        sys.exit(1)
    
    import_csv(csv_path) 