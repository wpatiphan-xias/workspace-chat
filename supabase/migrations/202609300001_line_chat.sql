create table public.line_contacts (
  line_user_id text primary key,
  display_name text not null,
  avatar_url text,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now()
);

create table public.line_messages (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null references public.line_contacts(line_user_id) on delete cascade,
  direction text not null check (direction in ('incoming', 'outgoing')),
  kind text not null check (kind in ('text', 'unsupported')),
  body text not null,
  status text not null check (status in ('received', 'pending', 'sent', 'failed')),
  line_message_id text unique,
  webhook_event_id text unique,
  client_message_id uuid unique,
  created_at timestamptz not null default now()
);

-- Keep unsend tombstones so a delayed or redelivered message cannot reappear.
create table public.line_unsent_messages (
  line_message_id text primary key,
  line_user_id text not null,
  created_at timestamptz not null default now()
);

create index line_contacts_recent_idx on public.line_contacts(last_message_at desc nulls last);
create index line_messages_contact_recent_idx on public.line_messages(line_user_id, created_at desc);

create function public.skip_unsent_line_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.direction = 'incoming' and exists (
    select 1 from public.line_unsent_messages
    where line_message_id = new.line_message_id
  ) then
    return null;
  end if;
  return new;
end;
$$;

create trigger line_messages_skip_unsent
before insert on public.line_messages
for each row execute function public.skip_unsent_line_message();

revoke all on function public.skip_unsent_line_message() from public, anon, authenticated;

create function public.refresh_line_contact_preview() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  contact_id text;
begin
  if tg_op = 'DELETE' then
    contact_id := old.line_user_id;
  else
    contact_id := new.line_user_id;
  end if;
  update public.line_contacts as contact
  set (last_message_at, last_message_preview) = (
    select message.created_at, message.body
    from public.line_messages as message
    where message.line_user_id = contact_id
    order by message.created_at desc, message.id desc
    limit 1
  )
  where contact.line_user_id = contact_id;
  return null;
end;
$$;

create trigger line_messages_refresh_contact
after insert or delete on public.line_messages
for each row execute function public.refresh_line_contact_preview();

revoke all on function public.refresh_line_contact_preview() from public, anon, authenticated;

alter table public.line_contacts enable row level security;
alter table public.line_messages enable row level security;
alter table public.line_unsent_messages enable row level security;

revoke all on public.line_contacts from anon, authenticated;
revoke all on public.line_messages from anon, authenticated;
revoke all on public.line_unsent_messages from anon, authenticated;
grant select on public.line_contacts to authenticated;
grant select on public.line_messages to authenticated;

create policy "Signed-in agents read LINE contacts"
on public.line_contacts for select to authenticated using (true);
create policy "Signed-in agents read LINE messages"
on public.line_messages for select to authenticated using (true);
