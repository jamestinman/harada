-- Harada Chart Database Schema for Supabase
-- Run this in your Supabase SQL Editor

-- Create harada_charts table
CREATE TABLE IF NOT EXISTS harada_charts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'My Harada Chart',
  grid JSONB NOT NULL DEFAULT '[]'::jsonb,
  todos JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id) -- One chart per user for now
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_harada_charts_user_id ON harada_charts(user_id);
CREATE INDEX IF NOT EXISTS idx_harada_charts_updated_at ON harada_charts(updated_at);

-- Enable Row Level Security
ALTER TABLE harada_charts ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Users can only read their own charts
CREATE POLICY "Users can read own charts"
  ON harada_charts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own charts
CREATE POLICY "Users can insert own charts"
  ON harada_charts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own charts
CREATE POLICY "Users can update own charts"
  ON harada_charts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own charts
CREATE POLICY "Users can delete own charts"
  ON harada_charts
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_harada_charts_updated_at
  BEFORE UPDATE ON harada_charts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime for the table
-- Note: If this fails, enable realtime via Supabase Dashboard:
-- Database → Replication → harada_charts → Toggle "Realtime" ON
ALTER PUBLICATION supabase_realtime ADD TABLE harada_charts;
