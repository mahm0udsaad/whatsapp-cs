-- ===========================================================================
-- Unread tracking: include bot replies
--
-- Product decision:
--   A conversation should remain / become unread when the bot replies and no
--   human has opened the thread yet. Manual human replies still should NOT
--   increment unread, because the sender is already inside the conversation.
--
-- Implementation:
--   * customer messages always increment unread_count
--   * agent messages increment unread_count only when they were not sent by a
--     team member directly. Manual sends stamp metadata.sent_by_team_member_id;
--     bot replies do not.
-- ===========================================================================

create or replace function public.tg_increment_unread_on_visible_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sent_by_team_member_id text;
begin
  sent_by_team_member_id := coalesce(new.metadata ->> 'sent_by_team_member_id', '');

  if new.role = 'customer'
     or (new.role = 'agent' and sent_by_team_member_id = '') then
    update public.conversations
       set unread_count = coalesce(unread_count, 0) + 1
     where id = new.conversation_id;
  end if;

  return new;
end;
$$;

drop trigger if exists increment_unread_on_customer_message
  on public.messages;

drop trigger if exists increment_unread_on_visible_message
  on public.messages;

create trigger increment_unread_on_visible_message
  after insert on public.messages
  for each row
  execute function public.tg_increment_unread_on_visible_message();

comment on function public.tg_increment_unread_on_visible_message() is
  'Increments conversations.unread_count for customer messages and bot/automated agent replies, but not manual human sends.';
