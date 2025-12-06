-- Create pending_match_details table to track match reveal flow state
CREATE TABLE IF NOT EXISTS pending_match_details (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_phone VARCHAR(20) NOT NULL,      -- User who asked for matches
  matched_phone VARCHAR(20) NOT NULL,        -- The matched user
  matched_name VARCHAR(255),
  match_score DECIMAL(3,2),
  match_reason TEXT,                         -- AI-generated: why they matched
  detailed_summary TEXT,                     -- AI-generated: full profile summary
  chat_id INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE,    -- When they asked for details (or NULL)
  expired_at TIMESTAMP WITH TIME ZONE       -- Auto-expire after 24h
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_pending_match_requester_phone ON pending_match_details(requester_phone);
CREATE INDEX IF NOT EXISTS idx_pending_match_created_at ON pending_match_details(created_at);

-- Add comments
COMMENT ON TABLE pending_match_details IS 'Tracks pending match details for two-stage reveal flow';
COMMENT ON COLUMN pending_match_details.requester_phone IS 'Phone number of user who requested the match';
COMMENT ON COLUMN pending_match_details.matched_phone IS 'Phone number of the matched user';
COMMENT ON COLUMN pending_match_details.match_reason IS 'AI-generated short explanation of why they matched';
COMMENT ON COLUMN pending_match_details.detailed_summary IS 'AI-generated detailed profile summary';
COMMENT ON COLUMN pending_match_details.responded_at IS 'Timestamp when user requested full details (NULL if not yet)';
COMMENT ON COLUMN pending_match_details.expired_at IS 'Timestamp when this pending match expires (24h after creation)';


