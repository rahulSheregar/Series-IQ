-- Add flag to allow users to opt out of daily update requests
ALTER TABLE user_profile
ADD COLUMN IF NOT EXISTS stop_daily_updates BOOLEAN DEFAULT FALSE;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_user_profile_stop_daily_updates ON user_profile(stop_daily_updates);

-- Add comment
COMMENT ON COLUMN user_profile.stop_daily_updates IS 'If true, user has opted out of daily update requests. Set to false to resume updates.';

