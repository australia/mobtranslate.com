-- Create table for user word likes/loves
CREATE TABLE IF NOT EXISTS public.user_word_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id UUID NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
  liked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  is_love BOOLEAN DEFAULT FALSE NOT NULL, -- false = like, true = love
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure a user can only like a word once
  UNIQUE(user_id, word_id)
);

-- Create indexes for performance
CREATE INDEX idx_user_word_likes_user_id ON public.user_word_likes(user_id);
CREATE INDEX idx_user_word_likes_word_id ON public.user_word_likes(word_id);
CREATE INDEX idx_user_word_likes_liked_at ON public.user_word_likes(liked_at DESC);

-- Enable RLS
ALTER TABLE public.user_word_likes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view all likes (for like counts)
CREATE POLICY "Likes are viewable by everyone" 
ON public.user_word_likes 
FOR SELECT 
USING (true);

-- Users can only insert their own likes
CREATE POLICY "Users can like words" 
ON public.user_word_likes 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can only update their own likes (to change like to love)
CREATE POLICY "Users can update their own likes" 
ON public.user_word_likes 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own likes
CREATE POLICY "Users can unlike words" 
ON public.user_word_likes 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_word_likes_updated_at 
BEFORE UPDATE ON public.user_word_likes 
FOR EACH ROW 
EXECUTE FUNCTION public.update_updated_at_column();

-- Add like_count to words view (optional - for performance)
CREATE OR REPLACE VIEW public.words_with_stats AS
SELECT 
  w.*,
  COUNT(DISTINCT uwl.user_id) AS like_count,
  COUNT(DISTINCT CASE WHEN uwl.is_love THEN uwl.user_id END) AS love_count
FROM public.words w
LEFT JOIN public.user_word_likes uwl ON w.id = uwl.word_id
GROUP BY w.id;