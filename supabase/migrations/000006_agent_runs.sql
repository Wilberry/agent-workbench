-- Create agent_runs table for persistent workflow execution tracking
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workflow JSONB NOT NULL DEFAULT '["Planner", "Executor", "Reviewer"]',
  current_step INTEGER NOT NULL DEFAULT 0,
  execution_trace JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_agent_runs_user_id ON agent_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_conversation_id ON agent_runs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON agent_runs(created_at DESC);

-- Enable RLS
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own runs
CREATE POLICY "Users can view own agent runs"
  ON agent_runs FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can only insert their own runs
CREATE POLICY "Users can insert own agent runs"
  ON agent_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Service role can update runs (for background worker)
CREATE POLICY "Service role can update agent runs"
  ON agent_runs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- For service role (backend only), allow full access
CREATE POLICY "Service role bypass agent runs"
  ON agent_runs FOR ALL
  USING (current_setting('role') = 'authenticated')
  WITH CHECK (current_setting('role') = 'authenticated');

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_agent_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_runs_updated_at_trigger
BEFORE UPDATE ON agent_runs
FOR EACH ROW
EXECUTE FUNCTION update_agent_runs_updated_at();
