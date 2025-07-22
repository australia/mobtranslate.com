-- Add is_completed column to quiz_sessions table
ALTER TABLE quiz_sessions 
ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false;

-- Update existing sessions based on their status
-- Mark sessions as completed if they have attempts
UPDATE quiz_sessions
SET is_completed = true
WHERE id IN (
  SELECT DISTINCT session_id 
  FROM quiz_attempts
);

-- Add an index for better query performance
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_is_completed 
ON quiz_sessions(user_id, is_completed);

-- Add a comment to document the column
COMMENT ON COLUMN quiz_sessions.is_completed IS 'Indicates whether the quiz session has been completed by the user';