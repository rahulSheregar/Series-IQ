-- Create user_daily_context table to store AI-generated context from daily updates
CREATE TABLE IF NOT EXISTS user_daily_context (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_profile_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  context_text TEXT NOT NULL,
  key_topics JSONB DEFAULT '[]'::jsonb,
  activities JSONB DEFAULT '[]'::jsonb,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_profile_id)
);

-- Create indexes for faster lookups and search
CREATE INDEX IF NOT EXISTS idx_user_daily_context_user_profile_id ON user_daily_context(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_daily_context_phone_number ON user_daily_context(phone_number);
CREATE INDEX IF NOT EXISTS idx_user_daily_context_key_topics ON user_daily_context USING GIN(key_topics);
CREATE INDEX IF NOT EXISTS idx_user_daily_context_activities ON user_daily_context USING GIN(activities);

-- Create updated_at trigger
CREATE TRIGGER update_user_daily_context_updated_at
  BEFORE UPDATE ON user_daily_context
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE user_daily_context IS 'Stores AI-generated context from daily updates for AI search and matching';
COMMENT ON COLUMN user_daily_context.context_text IS 'AI-generated context description from daily updates';
COMMENT ON COLUMN user_daily_context.key_topics IS 'JSON array of key topics/activities extracted from daily updates';
COMMENT ON COLUMN user_daily_context.activities IS 'JSON array of specific activities/events mentioned in daily updates';

