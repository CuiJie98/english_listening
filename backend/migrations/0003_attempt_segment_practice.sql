ALTER TABLE attempts ADD COLUMN segment_index INTEGER;
ALTER TABLE attempts ADD COLUMN segment_start_sec REAL;
ALTER TABLE attempts ADD COLUMN segment_end_sec REAL;
ALTER TABLE attempts ADD COLUMN segment_text TEXT;
ALTER TABLE attempts ADD COLUMN self_rating TEXT;
