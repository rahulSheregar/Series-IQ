-- Add fields to track last read message and chat ID for each user
ALTER TABLE user_profile
ADD COLUMN IF NOT EXISTS last_read_message_offset BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_chat_id INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index on last_chat_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profile_last_chat_id ON user_profile(last_chat_id);

-- Add comments
COMMENT ON COLUMN user_profile.last_read_message_offset IS 'Kafka offset of the last message read/processed for this user';
COMMENT ON COLUMN user_profile.last_chat_id IS 'Chat ID of the last message read/processed for this user';
COMMENT ON COLUMN user_profile.last_read_at IS 'Timestamp when the last message was read/processed';

