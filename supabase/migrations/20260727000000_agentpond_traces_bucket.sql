-- AgentPond writes trace batches from Edge Functions with server-only access.
-- Keep the bucket private because traces can contain document and chat content.
insert into storage.buckets (id, name, public)
values ('agentpond', 'agentpond', false)
on conflict (id) do update
set public = false;
