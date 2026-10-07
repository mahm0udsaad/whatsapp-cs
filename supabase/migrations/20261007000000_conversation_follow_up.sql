-- Inbox follow-up: an agent can flag a conversation "needs follow-up" (with an
-- optional note), and the mobile inbox can tell who spoke last so it can show
-- an "awaiting reply" bucket.
--
-- Additive only. Old app builds keep working: mobile_inbox_list keeps its
-- signature and existing columns; new columns are appended to the result.

alter table public.conversations
  add column if not exists follow_up_at timestamptz,
  add column if not exists follow_up_by uuid references public.team_members(id) on delete set null,
  add column if not exists follow_up_note text;

create index if not exists conversations_follow_up_idx
  on public.conversations (restaurant_id, follow_up_at)
  where follow_up_at is not null;

-- Return type changes, so the function must be dropped and recreated.
drop function if exists public.mobile_inbox_list(uuid, integer, boolean);

create function public.mobile_inbox_list(
  p_restaurant_id uuid,
  p_limit integer default 100,
  p_include_archived boolean default false
)
returns table(
  id uuid,
  customer_name text,
  customer_phone text,
  status text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  handler_mode text,
  assigned_to uuid,
  unread_count integer,
  archived_at timestamptz,
  preview text,
  assignee_name text,
  label_ids uuid[],
  -- Latest message of any role (drives the row preview + "who spoke last").
  last_message_content text,
  last_message_metadata jsonb,
  last_message_role text,
  -- 'customer' | 'team' | 'bot' | 'system'
  last_message_sender text,
  last_message_sender_name text,
  -- Latest agent-side (team or bot) message; awaiting reply when
  -- last_inbound_at > last_outbound_at.
  last_outbound_at timestamptz,
  follow_up_at timestamptz,
  follow_up_note text,
  follow_up_by uuid,
  follow_up_by_name text
)
language sql
stable
set search_path to 'public'
as $function$
  with page as (
    select c.id
    from public.conversations c
    where c.restaurant_id = p_restaurant_id
      and (p_include_archived or c.archived_at is null)
    order by c.last_message_at desc nulls last
    limit greatest(p_limit, 1)
  ),
  -- Work queues must not depend on pagination: always include flagged
  -- conversations and recent ones where the customer spoke last, even when
  -- they fall outside the current page.
  queue as (
    select c.id
    from public.conversations c
    where c.restaurant_id = p_restaurant_id
      and c.archived_at is null
      and not p_include_archived
      and (
        c.follow_up_at is not null
        or (
          c.last_inbound_at >= now() - interval '7 days'
          and c.last_inbound_at >= c.last_message_at - interval '1 second'
        )
      )
    order by c.last_message_at desc nulls last
    limit 200
  ),
  conv as (
    select c.id, c.customer_name, c.customer_phone, c.status,
           c.last_message_at, c.last_inbound_at, c.handler_mode,
           c.assigned_to, c.unread_count, c.archived_at,
           c.follow_up_at, c.follow_up_note, c.follow_up_by
    from public.conversations c
    where c.id in (select id from page union select id from queue)
  ),
  latest_customer as (
    select distinct on (m.conversation_id)
      m.conversation_id, m.content, m.created_at
    from public.messages m
    where m.conversation_id in (select id from conv)
      and m.role = 'customer'
    order by m.conversation_id, m.created_at desc
  ),
  latest_any as (
    select distinct on (m.conversation_id)
      m.conversation_id, m.content, m.metadata, m.role,
      case
        when m.metadata->>'sent_by_team_member_id' ~* '^[0-9a-f-]{36}$'
          then (m.metadata->>'sent_by_team_member_id')::uuid
      end as sent_by
    from public.messages m
    where m.conversation_id in (select id from conv)
    order by m.conversation_id, m.created_at desc
  ),
  latest_outbound as (
    select m.conversation_id, max(m.created_at) as created_at
    from public.messages m
    where m.conversation_id in (select id from conv)
      and m.role = 'agent'
    group by m.conversation_id
  ),
  labels_agg as (
    select a.conversation_id, array_agg(a.label_id order by a.assigned_at) as label_ids
    from public.conversation_label_assignments a
    where a.conversation_id in (select id from conv)
    group by a.conversation_id
  )
  select
    c.id, c.customer_name, c.customer_phone, c.status,
    c.last_message_at, c.last_inbound_at, c.handler_mode,
    c.assigned_to, c.unread_count, c.archived_at,
    lc.content as preview,
    tm.full_name as assignee_name,
    coalesce(la.label_ids, '{}'::uuid[]) as label_ids,
    lm.content as last_message_content,
    lm.metadata as last_message_metadata,
    lm.role as last_message_role,
    case
      when lm.role is null then null
      when lm.role = 'customer' then 'customer'
      when lm.role = 'system' then 'system'
      when lm.sent_by is not null then 'team'
      else 'bot'
    end as last_message_sender,
    sender.full_name as last_message_sender_name,
    lo.created_at as last_outbound_at,
    c.follow_up_at, c.follow_up_note, c.follow_up_by,
    fu.full_name as follow_up_by_name
  from conv c
  left join latest_customer lc on lc.conversation_id = c.id
  left join latest_any lm on lm.conversation_id = c.id
  left join latest_outbound lo on lo.conversation_id = c.id
  left join public.team_members tm on tm.id = c.assigned_to
  left join public.team_members sender on sender.id = lm.sent_by
  left join public.team_members fu on fu.id = c.follow_up_by
  left join labels_agg la on la.conversation_id = c.id
  order by c.last_message_at desc nulls last;
$function$;

grant execute on function public.mobile_inbox_list(uuid, integer, boolean)
  to anon, authenticated, service_role;
