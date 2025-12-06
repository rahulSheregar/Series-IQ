-- Create daily_updates table to store user's daily update responses
CREATE TABLE IF NOT EXISTS daily_updates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_profile_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  update_text TEXT NOT NULL,
  chat_id INTEGER,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_daily_updates_user_profile_id ON daily_updates(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_daily_updates_phone_number ON daily_updates(phone_number);
CREATE INDEX IF NOT EXISTS idx_daily_updates_responded_at ON daily_updates(responded_at);

-- Add comments
COMMENT ON TABLE daily_updates IS 'Stores daily update responses from users';
COMMENT ON COLUMN daily_updates.update_text IS 'User response to daily update request';
COMMENT ON COLUMN daily_updates.requested_at IS 'When the update request was sent';
COMMENT ON COLUMN daily_updates.responded_at IS 'When the user responded';

