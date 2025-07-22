-- Create spaced repetition state tracking
CREATE TABLE IF NOT EXISTS public.spaced_repetition_states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id UUID NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
  
  -- SM-2 Algorithm fields
  bucket SMALLINT DEFAULT 0 NOT NULL, -- 0=new, 1-2=learning, 3-4=review, 5=mastered
  ef REAL DEFAULT 2.5 NOT NULL, -- easiness factor
  interval_days INTEGER DEFAULT 0 NOT NULL, -- days until next review
  due_date TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_seen TIMESTAMPTZ,
  
  -- Performance tracking
  total_attempts INTEGER DEFAULT 0 NOT NULL,
  correct_attempts INTEGER DEFAULT 0 NOT NULL,
  streak INTEGER DEFAULT 0 NOT NULL, -- consecutive correct answers
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure one state per user-word pair
  UNIQUE(user_id, word_id)
);

-- Create quiz attempts log
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id UUID NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
  session_id UUID, -- group attempts into sessions
  
  -- Attempt details
  is_correct BOOLEAN NOT NULL,
  response_time_ms INTEGER NOT NULL,
  selected_answer TEXT, -- what they chose
  correct_answer TEXT, -- what was correct
  distractors JSONB, -- the other options shown
  
  -- Context
  bucket_at_time SMALLINT, -- what bucket the word was in when attempted
  attempt_number INTEGER, -- nth attempt for this word by this user
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  user_agent TEXT,
  ip_address INET
);

-- Create quiz sessions
CREATE TABLE IF NOT EXISTS public.quiz_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Session metadata
  language_id UUID REFERENCES public.languages(id),
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  total_questions INTEGER DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  total_time_ms INTEGER,
  
  -- Settings used
  session_size INTEGER DEFAULT 20,
  time_limit_ms INTEGER DEFAULT 3000,
  
  -- Performance metrics
  streak INTEGER DEFAULT 0,
  accuracy_percentage DECIMAL(5,2),
  avg_response_time_ms INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_spaced_states_user_due ON public.spaced_repetition_states(user_id, due_date);
CREATE INDEX idx_spaced_states_word ON public.spaced_repetition_states(word_id);
CREATE INDEX idx_spaced_states_bucket ON public.spaced_repetition_states(bucket);
CREATE INDEX idx_quiz_attempts_user_word ON public.quiz_attempts(user_id, word_id);
CREATE INDEX idx_quiz_attempts_session ON public.quiz_attempts(session_id);
CREATE INDEX idx_quiz_attempts_created ON public.quiz_attempts(created_at DESC);
CREATE INDEX idx_quiz_sessions_user ON public.quiz_sessions(user_id, started_at DESC);

-- Enable RLS
ALTER TABLE public.spaced_repetition_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for spaced_repetition_states
CREATE POLICY "Users can view their own spaced repetition states" 
ON public.spaced_repetition_states 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own spaced repetition states" 
ON public.spaced_repetition_states 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own spaced repetition states" 
ON public.spaced_repetition_states 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for quiz_attempts
CREATE POLICY "Users can view their own quiz attempts" 
ON public.quiz_attempts 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own quiz attempts" 
ON public.quiz_attempts 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for quiz_sessions
CREATE POLICY "Users can view their own quiz sessions" 
ON public.quiz_sessions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own quiz sessions" 
ON public.quiz_sessions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own quiz sessions" 
ON public.quiz_sessions 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Teachers can view aggregated data (no personal info)
CREATE POLICY "Teachers can view aggregated quiz data" 
ON public.quiz_attempts 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM auth.users u 
    WHERE u.id = auth.uid() 
    AND u.raw_user_meta_data->>'role' = 'teacher'
  )
);

-- Add triggers for updated_at
CREATE TRIGGER update_spaced_repetition_states_updated_at 
BEFORE UPDATE ON public.spaced_repetition_states 
FOR EACH ROW 
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to calculate next review date
CREATE OR REPLACE FUNCTION calculate_next_review_date(
  current_bucket SMALLINT,
  ef REAL,
  interval_days INTEGER
) RETURNS TIMESTAMPTZ AS $$
BEGIN
  CASE current_bucket
    WHEN 0 THEN RETURN NOW(); -- New words: immediate
    WHEN 1 THEN RETURN NOW(); -- Learning-1: same session
    WHEN 2 THEN RETURN NOW() + INTERVAL '4 hours'; -- Learning-2: 4h
    WHEN 3 THEN RETURN NOW() + INTERVAL '1 day'; -- Review-1: 24h
    WHEN 4 THEN RETURN NOW() + INTERVAL '4 days'; -- Review-2: 4d
    WHEN 5 THEN RETURN NOW() + (interval_days * ef || ' days')::INTERVAL; -- Mastered: calculated
    ELSE RETURN NOW();
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Create function to update spaced repetition state after attempt
CREATE OR REPLACE FUNCTION update_spaced_repetition_state(
  p_user_id UUID,
  p_word_id UUID,
  p_is_correct BOOLEAN,
  p_response_time_ms INTEGER
) RETURNS void AS $$
DECLARE
  current_state spaced_repetition_states%ROWTYPE;
  new_ef REAL;
  new_bucket SMALLINT;
  new_interval INTEGER;
  quality INTEGER;
BEGIN
  -- Get current state or create new one
  SELECT * INTO current_state 
  FROM spaced_repetition_states 
  WHERE user_id = p_user_id AND word_id = p_word_id;
  
  IF NOT FOUND THEN
    -- Create new state for first attempt
    INSERT INTO spaced_repetition_states (user_id, word_id)
    VALUES (p_user_id, p_word_id);
    
    SELECT * INTO current_state 
    FROM spaced_repetition_states 
    WHERE user_id = p_user_id AND word_id = p_word_id;
  END IF;
  
  -- Calculate quality score based on correctness and speed
  IF p_is_correct THEN
    IF p_response_time_ms < 3000 THEN
      quality := 5; -- Perfect: correct and fast
    ELSE
      quality := 4; -- Good: correct but slow
    END IF;
  ELSE
    quality := 2; -- Poor: incorrect
  END IF;
  
  -- Update EF using SM-2 formula
  new_ef := GREATEST(1.3, current_state.ef + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  
  -- Update bucket based on performance
  IF p_is_correct THEN
    new_bucket := LEAST(5, current_state.bucket + 1);
    new_interval := CASE 
      WHEN new_bucket <= 2 THEN 0
      WHEN new_bucket = 3 THEN 1
      WHEN new_bucket = 4 THEN 4
      ELSE GREATEST(current_state.interval_days * new_ef, 14)::INTEGER
    END;
  ELSE
    -- Reset on failure
    new_bucket := GREATEST(0, current_state.bucket - 1);
    new_interval := 0;
  END IF;
  
  -- Update the state
  UPDATE spaced_repetition_states SET
    bucket = new_bucket,
    ef = new_ef,
    interval_days = new_interval,
    due_date = calculate_next_review_date(new_bucket, new_ef, new_interval),
    last_seen = NOW(),
    total_attempts = total_attempts + 1,
    correct_attempts = correct_attempts + (CASE WHEN p_is_correct THEN 1 ELSE 0 END),
    streak = CASE WHEN p_is_correct THEN streak + 1 ELSE 0 END,
    updated_at = NOW()
  WHERE user_id = p_user_id AND word_id = p_word_id;
END;
$$ LANGUAGE plpgsql;

-- Create view for user progress summary
CREATE OR REPLACE VIEW user_quiz_progress AS
SELECT 
  s.user_id,
  l.code as language_code,
  l.name as language_name,
  COUNT(*) as total_words,
  COUNT(*) FILTER (WHERE s.bucket = 0) as new_words,
  COUNT(*) FILTER (WHERE s.bucket IN (1, 2)) as learning_words,
  COUNT(*) FILTER (WHERE s.bucket IN (3, 4)) as review_words,
  COUNT(*) FILTER (WHERE s.bucket = 5) as mastered_words,
  COUNT(*) FILTER (WHERE s.due_date <= NOW()) as due_for_review,
  AVG(s.ef) as avg_easiness,
  MAX(s.streak) as best_streak
FROM spaced_repetition_states s
JOIN words w ON s.word_id = w.id
JOIN languages l ON w.language_id = l.id
GROUP BY s.user_id, l.id, l.code, l.name;