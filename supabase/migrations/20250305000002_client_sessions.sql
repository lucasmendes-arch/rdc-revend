-- Client sessions table for Kanban tracking
CREATE TABLE public.client_sessions (
  id uuid default gen_random_uuid() primary key,
  session_id text not null unique,
  user_id uuid references auth.users,
  email text,
  status text not null default 'visitou' check (status in ('visitou', 'escolhendo', 'comprou')),
  last_page text,
  cart_items_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE public.client_sessions DISABLE ROW LEVEL SECURITY;

CREATE INDEX idx_client_sessions_status ON public.client_sessions(status);
CREATE INDEX idx_client_sessions_updated ON public.client_sessions(updated_at desc);
CREATE INDEX idx_client_sessions_session_id ON public.client_sessions(session_id);
