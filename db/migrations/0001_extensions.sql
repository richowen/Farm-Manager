-- Enable PostGIS. pgcrypto gives us gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
