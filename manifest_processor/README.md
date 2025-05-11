# Amazon Liquidation Manifest Processor

This system allows you to import and search Amazon liquidation manifests using PostgreSQL with full-text search capabilities.

## Setup

1. Install dependencies:
```bash
pip install psycopg2-binary
```

2. Start the PostgreSQL container:
```bash
docker-compose up -d
```

3. Place your CSV manifest files in the `manifests` directory.

## Usage

### Importing Manifests

To import a manifest CSV file:
```bash
python import_manifest.py manifests/your_manifest.csv
```

### Searching Manifests

Connect to the database:
```bash
psql -h localhost -U manifest_user -d manifests_db
```
Password: manifest_password

Example search queries:

1. Full-text search across all fields:
```sql
SELECT * FROM manifests WHERE ts @@ plainto_tsquery('search_term');
```

2. Search specific JSON fields:
```sql
SELECT * FROM manifests WHERE data->>'LPN' = 'LPN123';
```

3. Combined search:
```sql
SELECT * FROM manifests 
WHERE ts @@ plainto_tsquery('search_term')
AND data->>'Category' = 'Electronics';
```

4. Search with partial matches:
```sql
SELECT * FROM manifests 
WHERE data->>'Description' ILIKE '%keyword%';
```

## Directory Structure

- `docker-compose.yml`: Docker configuration
- `init/`: SQL initialization scripts
- `manifests/`: Directory for CSV files
- `import_manifest.py`: Python script for importing CSVs

## Notes

- The system automatically creates full-text search indexes
- All data is stored in both raw text and JSONB format
- The database persists data in a Docker volume
- No schema changes are needed for different CSV formats 