-- =============================================================================
-- Reassign Conversation — Phase 2
-- =============================================================================
-- Extends claim_conversation() with two optional args so managers can:
--   * reassign a conversation (already claimed) to a specific team member
--   * force a conversation back to bot mode
--   * unassign a conversation (return to the shared queue)
-- Backward-compatible with the existing 3-arg callers thanks to default values.
--
-- Adds an event_type column to conversation_claim_events so the audit trail
-- can distinguish claim from reassign/force_bot/unassign.
--
-- team_member_id on the audit table is NOT NULL. For unassign/force_bot rows
-- we write the actor's own team_member_id when available, otherwise the
-- previously-assigned team_member (if any). If neither exists the event row
-- is skipped for that edge case (admin is a pure owner with no team_members
-- record — extremely rare because mobile login requires a team_members row).
-- =============================================================================

-- ---- 1. Audit event type --------------------------------------------------
alter table public.conversation_claim_events
  add column if not exists event_type text not null default 'claim';

-- Drop any prior check and add the new one idempotently.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.conversation_claim_events'::regclass
      and conname = 'conversation_claim_events_event_type_check'
  ) then
    execute 'alter table public.conversation_claim_events drop constraint conversation_claim_events_event_type_check';
  end if;
end $$;

alter table public.conversation_claim_events
  add constraint conversation_claim_events_event_type_check
  check (event_type in ('claim','reassign','force_bot','unassign'));

-- ---- 2. Drop the 3-arg signature so we can recreate with optional args ----
drop function if exists public.claim_conversation(uuid, text, uuid);

-- ---- 3. New claim_conversation() with reassign support --------------------
create or replace function public.claim_conversation(
  p_conversation_id uuid,
  p_mode text,
  p_team_member_id uuid,
  p_force boolean default false,
  p_assign_to_team_member_id uuid default null
) returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user       uuid := auth.uid();
  v_conv       public.conversations%rowtype;
  v_is_admin   boolean;
  v_actor_tm   uuid;
  v_event      text;
  v_audit_tm   uuid;
begin
  if p_conversation_id is null then
    raise exception 'missing_arguments';
  end if;

  -- Snapshot conversation (FOR UPDATE so a concurrent claim doesn't race).
  select * into v_conv
    from public.conversations
   where id = p_conversation_id
   for update;
  if not found then
    raise exception 'conversation_not_found';
  end if;

  v_is_admin := public.is_restaurant_admin(v_conv.restaurant_id, v_user);

  -- ---- Manager reassign path --------------------------------------------
  if p_force = true then
    if not v_is_admin then
      raise exception 'forbidden_not_admin';
    end if;

    -- Resolve an actor team_member id for the audit row (first admin row in
    -- this tenant, else any active row, else whatever we have).
    select id into v_actor_tm
      from public.team_members
     where restaurant_id = v_conv.restaurant_id
       and user_id = v_user
       and is_active = true
     order by (role = 'admin') desc
     limit 1;

    if p_assign_to_team_member_id is not null then
      -- Reassign to a specific team member.
      if not exists (
        select 1 from public.team_members
         where id = p_assign_to_team_member_id
           and restaurant_id = v_conv.restaurant_id
           and is_active = true
      ) then
        raise exception 'target_member_not_in_restaurant';
      end if;

      update public.conversations set
        handler_mode        = 'human',
        assigned_to         = p_assign_to_team_member_id,
        assigned_at         = now(),
        assigned_by_user_id = v_user,
        bot_paused          = true
       where id = p_conversation_id
       returning * into v_conv;

      v_event    := 'reassign';
      v_audit_tm := p_assign_to_team_member_id;

    elsif p_mode = 'bot' then
      -- Force back to bot.
      update public.conversations set
        handler_mode        = 'bot',
        assigned_to         = null,
        assigned_at         = null,
        assigned_by_user_id = v_user,
        bot_paused          = false
       where id = p_conversation_id
       returning * into v_conv;

      v_event    := 'force_bot';
      v_audit_tm := coalesce(v_actor_tm, v_conv.assigned_to);

    else
      -- Unassign (return to shared queue).
      update public.conversations set
        handler_mode        = 'unassigned',
        assigned_to         = null,
        assigned_at         = null,
        assigned_by_user_id = v_user
       where id = p_conversation_id
       returning * into v_conv;

      v_event    := 'unassign';
      v_audit_tm := coalesce(v_actor_tm, v_conv.assigned_to);
    end if;

    -- Record the audit row if we have a team_member_id (schema requires NOT NULL).
    if v_audit_tm is not null then
      insert into public.conversation_claim_events
        (conversation_id, restaurant_id, team_member_id, mode, event_type, claimed_by_user_id)
        values (v_conv.id, v_conv.restaurant_id, v_audit_tm, coalesce(p_mode, v_conv.handler_mode), v_event, v_user);
    end if;

    return v_conv;
  end if;

  -- ---- Regular claim path (unchanged semantics) --------------------------
  if p_team_member_id is null then
    raise exception 'missing_arguments';
  end if;

  if p_mode not in ('human','bot') then
    raise exception 'invalid_mode';
  end if;

  -- Caller must own the team_member row they're claiming as.
  if not exists (
    select 1 from public.team_members
     where id = p_team_member_id
       and user_id = v_user
       and is_active = true
       and restaurant_id = v_conv.restaurant_id
  ) then
    raise exception 'not_a_team_member';
  end if;

  -- Atomic: only claim when still unassigned.
  update public.conversations set
    handler_mode        = p_mode,
    assigned_to         = case when p_mode = 'human' then p_team_member_id else null end,
    assigned_at         = case when p_mode = 'human' then now() else null end,
    assigned_by_user_id = v_user,
    bot_paused          = (p_mode = 'human')
   where id = p_conversation_id
     and handler_mode = 'unassigned'
   returning * into v_conv;

  if not found then
    -- Already claimed (or wrong tenant). Return the current row so the caller
    -- can show who already has it without overwriting anything.
    select * into v_conv
      from public.conversations
     where id = p_conversation_id;
    if not found then
      raise exception 'conversation_not_found';
    end if;
    return v_conv;
  end if;

  insert into public.conversation_claim_events
    (conversation_id, restaurant_id, team_member_id, mode, event_type, claimed_by_user_id)
    values (v_conv.id, v_conv.restaurant_id, p_team_member_id, p_mode, 'claim', v_user);

  return v_conv;
end
$$;

revoke all on function public.claim_conversation(uuid, text, uuid, boolean, uuid) from public;
grant execute on function public.claim_conversation(uuid, text, uuid, boolean, uuid)
  to authenticated, service_role;
