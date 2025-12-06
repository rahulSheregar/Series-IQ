-- Create user_context table to store AI-generated context for users
CREATE TABLE IF NOT EXISTS user_context (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_profile_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  context_text TEXT NOT NULL,
  key_topics JSONB DEFAULT '[]'::jsonb,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_profile_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_context_user_profile_id ON user_context(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_context_phone_number ON user_context(phone_number);

-- Create updated_at trigger
CREATE TRIGGER update_user_context_updated_at
  BEFORE UPDATE ON user_context
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE user_context IS 'Stores AI-generated context and key topics for users based on their onboarding information';
COMMENT ON COLUMN user_context.context_text IS 'AI-generated context description of the user';
COMMENT ON COLUMN user_context.key_topics IS 'JSON array of key topics/interests relevant to the user';

