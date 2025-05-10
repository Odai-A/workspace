-- Create the manifests table
CREATE TABLE manifests (
    id SERIAL PRIMARY KEY,
    raw_row TEXT,
    data JSONB,
    ts TSVECTOR
);

-- Create a function to update the tsvector
CREATE OR REPLACE FUNCTION update_tsvector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.ts := to_tsvector('english', NEW.raw_row);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER update_tsvector_trigger
    BEFORE INSERT OR UPDATE ON manifests
    FOR EACH ROW
    EXECUTE FUNCTION update_tsvector();

-- Create indexes for better performance
CREATE INDEX manifests_ts_idx ON manifests USING GIN (ts);
CREATE INDEX manifests_data_idx ON manifests USING GIN (data); 