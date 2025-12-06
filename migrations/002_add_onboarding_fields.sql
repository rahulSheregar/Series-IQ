-- Add onboarding conversation tracking fields to user_profile table
ALTER TABLE user_profile
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS onboarding_current_question INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS onboarding_answers JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Create index on onboarding_completed for faster queries
CREATE INDEX IF NOT EXISTS idx_user_profile_onboarding_completed ON user_profile(onboarding_completed);

-- Add comment
COMMENT ON COLUMN user_profile.onboarding_completed IS 'Whether the user has completed the 7-question onboarding';
COMMENT ON COLUMN user_profile.onboarding_current_question IS 'Current question number (1-7), NULL if not in onboarding or completed';
COMMENT ON COLUMN user_profile.onboarding_answers IS 'JSON object storing answers to onboarding questions';
COMMENT ON COLUMN user_profile.name IS 'User name collected during onboarding';

