create schema duewell_private;
revoke all on schema duewell_private from public,anon,authenticated;
grant usage on schema duewell_private to authenticated,service_role;
-- Enrolled users must complete MFA for both reads and RPC writes.
create function duewell_private.request_user() returns uuid language plpgsql stable security definer set search_path='' as $$
declare uid uuid=auth.uid();
begin
 if uid is null then raise exception 'Sign in to continue.'; end if;
 if not exists(select 1 from auth.users where id=uid) or not exists(select 1 from auth.sessions where id=nullif(auth.jwt()->>'session_id','')::uuid and user_id=uid) then raise exception 'Your session has ended. Sign in again.'; end if;
 if exists(select 1 from auth.mfa_factors where user_id=uid and status='verified' and factor_type='totp') and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'Verify your authenticator code to continue.'; end if;
 return uid;
end $$;
-- Money is integer cents. Every client-visible row belongs to one auth user.
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check(length(display_name)<=80),
 timezone text not null default 'UTC', theme text not null default 'system' check(theme in ('light','dark','system')),
 private_content boolean not null default true, email_enabled boolean not null default true,
 sms_enabled boolean not null default false, push_enabled boolean not null default false,
 consent_phone text, sms_consent_at timestamptz, sms_consent_version text,
 created_at timestamptz not null default now()
);
create table public.debts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120), lender text not null default '' check(length(lender)<=120),
 category text not null default 'Personal' check(category in ('Shopping','Auto','Home','Health','Personal','Other')),
 notes text not null default '' check(length(notes)<=2000), total_cents bigint not null check(total_cents between 1 and 1000000000),
 created_at timestamptz not null default now(), unique(id,owner_id)
);
create table public.installments (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 debt_id uuid not null, due_date date not null check(due_date between '1900-01-01' and '2200-12-31'),
 amount_cents bigint not null check(amount_cents between 1 and 1000000000),
 foreign key(debt_id,owner_id) references public.debts(id,owner_id) on delete cascade, unique(id,owner_id)
);
create table public.payments (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 installment_id uuid not null, amount_cents bigint not null check(amount_cents>0), paid_on date not null,
 created_at timestamptz not null default now(), reversed_at timestamptz,
 foreign key(installment_id,owner_id) references public.installments(id,owner_id) on delete cascade
);
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<=2048), p256dh text not null check(length(p256dh)<=180),
 auth text not null check(length(auth)<=80), created_at timestamptz not null default now()
);
create table public.reminders (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 installment_id uuid not null, channel text not null check(channel in ('push','email','sms')),
 days_before int not null check(days_before in (0,1,3,7)), send_time time not null, scheduled_at timestamptz not null,
 active boolean not null default true, state text not null default 'pending' check(state in ('pending','processing','accepted','delivered','failed','cancelled','skipped')),
 attempts int not null default 0, lease_until timestamptz, next_attempt_at timestamptz,
 provider_id text, error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(installment_id,owner_id) references public.installments(id,owner_id) on delete cascade
);
create index debts_owner_lookup on public.debts(owner_id);
create index payments_owner_lookup on public.payments(owner_id);
create index reminders_owner_lookup on public.reminders(owner_id,channel,updated_at);
create index push_owner_lookup on public.push_subscriptions(owner_id);
create index installments_owner_due on public.installments(owner_id,due_date);
create index payments_installment on public.payments(installment_id) where reversed_at is null;
create index reminders_due on public.reminders(scheduled_at) where state='pending' and active;
create index reminders_provider on public.reminders(provider_id) where provider_id is not null;
create unique index reminders_active_unique on public.reminders(installment_id,channel,days_before) where active;

-- Clients have SELECT only. Mutations use the narrow, ownership-checked RPCs below.
alter table public.profiles enable row level security;
alter table public.debts enable row level security;
alter table public.installments enable row level security;
alter table public.payments enable row level security;
alter table public.reminders enable row level security;
alter table public.push_subscriptions enable row level security;
create policy profile_owner on public.profiles for select to authenticated using(id=(select duewell_private.request_user()));
create policy debts_owner on public.debts for select to authenticated using(owner_id=(select duewell_private.request_user()));
create policy installments_owner on public.installments for select to authenticated using(owner_id=(select duewell_private.request_user()));
create policy payments_owner on public.payments for select to authenticated using(owner_id=(select duewell_private.request_user()));
create policy reminders_owner on public.reminders for select to authenticated using(owner_id=(select duewell_private.request_user()));
revoke all on public.profiles,public.debts,public.installments,public.payments,public.reminders,public.push_subscriptions from anon,authenticated;
grant select on public.profiles,public.debts,public.installments,public.payments,public.reminders to authenticated;

create function duewell_private.ensure_profile() returns public.profiles language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 if duewell_private.request_user() is null then raise exception 'Sign in to continue.'; end if;
 insert into public.profiles(id,display_name,timezone) select id,left(coalesce(raw_user_meta_data->>'display_name',''),80),coalesce((select name from pg_timezone_names where name=raw_user_meta_data->>'timezone'),'UTC') from auth.users where id=duewell_private.request_user() on conflict do nothing;
 select * into p from public.profiles where id=duewell_private.request_user(); return p;
end $$;

create function duewell_private.save_preferences(p_name text,p_timezone text,p_theme text,p_private boolean,p_email boolean,p_sms boolean,p_push boolean)
returns void language plpgsql security definer set search_path='' as $$
declare phone_number text; confirmed timestamptz; previous_zone text;
begin
 perform duewell_private.ensure_profile();
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Choose a valid time zone.'; end if;
 select timezone into previous_zone from public.profiles where id=duewell_private.request_user();
 select phone,phone_confirmed_at into phone_number,confirmed from auth.users where id=duewell_private.request_user();
 if p_sms and (confirmed is null or coalesce(phone_number,'')='') then raise exception 'Verify your phone number before enabling SMS.'; end if;
 update public.profiles set display_name=trim(p_name),timezone=p_timezone,theme=p_theme,private_content=p_private,email_enabled=p_email,sms_enabled=p_sms,push_enabled=p_push,
 consent_phone=case when p_sms then phone_number else null end,
 sms_consent_at=case when p_sms then case when sms_enabled and consent_phone=phone_number then sms_consent_at else now() end else null end,
 sms_consent_version=case when p_sms then 'duewell-2026-11-22' else null end where id=duewell_private.request_user();
 -- A zone change cancels pending reminders, rather than silently sending at the old time.
 update public.reminders r set state='cancelled',active=false,error_code='preferences_changed',updated_at=now()
 where r.owner_id=duewell_private.request_user() and r.state='pending' and
 (previous_zone is distinct from p_timezone or (r.channel='sms' and not p_sms) or (r.channel='email' and not p_email) or (r.channel='push' and not p_push));
end $$;

create function duewell_private.create_debt(p_id uuid,p_name text,p_lender text,p_category text,p_notes text,p_total bigint,p_schedule jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare n int; sum_amount bigint;
begin
 perform duewell_private.ensure_profile();
 if exists(select 1 from public.debts where id=p_id) then
  if exists(select 1 from public.debts where id=p_id and owner_id=duewell_private.request_user() and name=trim(p_name) and lender=trim(p_lender) and category=p_category and notes=p_notes and total_cents=p_total) and (select count(*) from public.installments where debt_id=p_id)=jsonb_array_length(p_schedule) and not exists(select due_date,amount_cents from public.installments where debt_id=p_id except all select (x->>'due_date')::date,(x->>'amount_cents')::bigint from jsonb_array_elements(p_schedule) x) then return p_id; end if;
  raise exception 'Invalid request.';
 end if;
 if (select count(*) from public.debts where owner_id=duewell_private.request_user())>=500 then raise exception 'Debt limit reached (500).'; end if;
 if jsonb_typeof(p_schedule)<>'array' then raise exception 'Provide an installment schedule.'; end if;
 n=jsonb_array_length(p_schedule);
 select sum((x->>'amount_cents')::bigint) into sum_amount from jsonb_array_elements(p_schedule) x;
 if n<1 or n>120 or sum_amount is distinct from p_total then raise exception 'The schedule must contain 1–120 installments and add up to the debt total.'; end if;
 insert into public.debts(id,owner_id,name,lender,category,notes,total_cents) values(p_id,duewell_private.request_user(),trim(p_name),trim(p_lender),p_category,p_notes,p_total);
 insert into public.installments(owner_id,debt_id,due_date,amount_cents) select duewell_private.request_user(),p_id,(x->>'due_date')::date,(x->>'amount_cents')::bigint from jsonb_array_elements(p_schedule) x;
 return p_id;
end $$;
create function duewell_private.update_debt(p_id uuid,p_name text,p_lender text,p_category text,p_notes text) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.debts set name=trim(p_name),lender=trim(p_lender),category=p_category,notes=p_notes where id=p_id and owner_id=duewell_private.request_user();
 if not found then raise exception 'Debt not found.'; end if;
end $$;
create function duewell_private.delete_debt(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.debts where id=p_id and owner_id=duewell_private.request_user(); if not found then raise exception 'Debt not found.'; end if;
end $$;
create function duewell_private.mark_paid(p_id uuid,p_installment uuid,p_amount bigint,p_date date) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.installments; used bigint; zone text; existing public.payments;
begin
 select * into i from public.installments where id=p_installment and owner_id=duewell_private.request_user() for update;
 if not found then raise exception 'Installment not found.'; end if;
 select * into existing from public.payments where id=p_id;
 if found then
  if existing.owner_id=duewell_private.request_user() and existing.installment_id=p_installment and existing.amount_cents=p_amount and existing.paid_on=p_date then return p_id; end if;
  raise exception 'Payment request conflicts with an existing payment.';
 end if;
 select timezone into zone from public.profiles where id=duewell_private.request_user();
 if p_date>(now() at time zone coalesce(zone,'UTC'))::date or p_date<'1900-01-01' then raise exception 'Choose a valid payment date, today or earlier.'; end if;
 select coalesce(sum(amount_cents),0) into used from public.payments where installment_id=i.id and reversed_at is null;
 if p_amount is null or p_amount<1 or p_amount>i.amount_cents-used then raise exception 'Payment exceeds the remaining balance or is not positive.'; end if;
 insert into public.payments(id,owner_id,installment_id,amount_cents,paid_on) values(p_id,duewell_private.request_user(),i.id,p_amount,p_date);
 if p_amount=i.amount_cents-used then
  update public.reminders set state='cancelled',active=false,error_code='payment_completed',updated_at=now() where installment_id=i.id and state='pending';
 end if;
 return p_id;
end $$;
create function duewell_private.reverse_payment(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare iid uuid;
begin
 select installment_id into iid from public.payments where id=p_id and owner_id=duewell_private.request_user();
 if not found then raise exception 'Payment not found.'; end if;
 perform 1 from public.installments where id=iid for update;
 update public.payments set reversed_at=coalesce(reversed_at,now()) where id=p_id and owner_id=duewell_private.request_user();
 -- Cancelled reminders stay cancelled; the user can schedule a new one explicitly.
end $$;
create function duewell_private.edit_installment(p_id uuid,p_date date,p_amount bigint) returns void language plpgsql security definer set search_path='' as $$
declare i public.installments; used bigint;
begin
 select * into i from public.installments where id=p_id and owner_id=duewell_private.request_user() for update;
 if not found then raise exception 'Installment not found.'; end if;
 select coalesce(sum(amount_cents),0) into used from public.payments where installment_id=i.id and reversed_at is null;
 if p_amount<greatest(1,used) then raise exception 'An installment cannot be less than its recorded payments.'; end if;
 update public.debts set total_cents=total_cents-i.amount_cents+p_amount where id=i.debt_id;
 update public.installments set due_date=p_date,amount_cents=p_amount where id=i.id;
 update public.reminders set state='cancelled',active=false,error_code='schedule_changed',updated_at=now() where installment_id=i.id and state='pending';
end $$;

create function duewell_private.register_push(p_endpoint text,p_p256dh text,p_auth text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform duewell_private.ensure_profile();
 -- Browser endpoints are later fetched by the server. Strict allowlisting prevents SSRF.
 if p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/' then raise exception 'Unsupported push service.'; end if;
 if p_p256dh !~ '^[A-Za-z0-9_-]{87,88}={0,2}$' or p_auth !~ '^[A-Za-z0-9_-]{22,24}={0,2}$' then raise exception 'Invalid push subscription.'; end if;
 if (select count(*) from public.push_subscriptions where owner_id=duewell_private.request_user())>=10 and not exists(select 1 from public.push_subscriptions where endpoint=p_endpoint and owner_id=duewell_private.request_user()) then raise exception 'Device limit reached.'; end if;
 -- Never reassign another account's subscription.
 insert into public.push_subscriptions(owner_id,endpoint,p256dh,auth) values(duewell_private.request_user(),p_endpoint,p_p256dh,p_auth)
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth where public.push_subscriptions.owner_id=duewell_private.request_user();
 if not found then raise exception 'This device is subscribed to another account. Unsubscribe there first.'; end if;
 update public.profiles set push_enabled=true where id=duewell_private.request_user();
end $$;
create function duewell_private.remove_push(p_endpoint text) returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.push_subscriptions where endpoint=p_endpoint and owner_id=duewell_private.request_user();
end $$;
create function duewell_private.set_reminders(p_installment uuid,p_channels text[],p_offsets int[],p_time time)
returns int language plpgsql security definer set search_path='' as $$
declare i public.installments; p public.profiles; c text; o int; at_time timestamptz; cnt int=0; contact auth.users;
begin
 select * into i from public.installments where id=p_installment and owner_id=duewell_private.request_user() for update;
 if not found then raise exception 'Installment not found.'; end if;
 select * into p from public.profiles where id=duewell_private.request_user(); select * into contact from auth.users where id=duewell_private.request_user();
 if i.amount_cents<=(select coalesce(sum(amount_cents),0) from public.payments where installment_id=i.id and reversed_at is null) then raise exception 'This installment is already paid.'; end if;
 if coalesce(cardinality(p_channels),0)<1 or cardinality(p_channels)>3 or coalesce(cardinality(p_offsets),0)<1 or cardinality(p_offsets)>4 or p_time is null then raise exception 'Choose channels, reminder days, and a time.'; end if;
 update public.reminders set active=false,state=case when state='pending' then 'cancelled' else state end,updated_at=now() where installment_id=i.id and active;
 foreach c in array p_channels loop
  if c not in ('push','email','sms') or c is null then raise exception 'Invalid channel.'; end if;
  if c='sms' and (not p.sms_enabled or contact.phone_confirmed_at is null or p.consent_phone is distinct from contact.phone or coalesce(contact.phone,'')='') then raise exception 'Verify your number and opt in to SMS in Settings first.'; end if;
  if c='email' and (not p.email_enabled or contact.email_confirmed_at is null) then raise exception 'Enable email reminders and verify your email first.'; end if;
  if c='push' and (not p.push_enabled or not exists(select 1 from public.push_subscriptions where owner_id=duewell_private.request_user())) then raise exception 'Enable notifications on a device first.'; end if;
  foreach o in array p_offsets loop
   if o is null or o not in (0,1,3,7) then raise exception 'Invalid reminder offset.'; end if;
   at_time=((i.due_date-o)+p_time) at time zone p.timezone;
   if at_time>now() then
    insert into public.reminders(owner_id,installment_id,channel,days_before,send_time,scheduled_at) values(duewell_private.request_user(),i.id,c,o,p_time,at_time) on conflict do nothing;
    cnt=cnt+1;
   end if;
  end loop;
 end loop;
 if cnt=0 then raise exception 'All selected reminder times have already passed. Choose a later time.'; end if;
 return cnt;
end $$;
create function duewell_private.cancel_reminder(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.reminders set active=false,state='cancelled',updated_at=now() where id=p_id and owner_id=duewell_private.request_user() and state='pending';
 if not found then raise exception 'Only pending reminders can be cancelled.'; end if;
end $$;

-- SECURITY DEFINER defaults to PUBLIC execution in PostgreSQL: revoke explicitly.
revoke execute on all functions in schema duewell_private from public,anon,authenticated;
grant execute on function duewell_private.request_user(),duewell_private.ensure_profile(),duewell_private.save_preferences(text,text,text,boolean,boolean,boolean,boolean),duewell_private.create_debt(uuid,text,text,text,text,bigint,jsonb),duewell_private.update_debt(uuid,text,text,text,text),duewell_private.delete_debt(uuid),duewell_private.mark_paid(uuid,uuid,bigint,date),duewell_private.reverse_payment(uuid),duewell_private.edit_installment(uuid,date,bigint),duewell_private.register_push(text,text,text),duewell_private.remove_push(text),duewell_private.set_reminders(uuid,text[],int[],time),duewell_private.cancel_reminder(uuid) to authenticated;
grant all on all tables in schema public to service_role;

-- Public endpoints are invoker wrappers; privileged implementations remain unexposed.
create function public.ensure_profile() returns public.profiles language sql security invoker set search_path='' as $api$ select duewell_private.ensure_profile(); $api$;
revoke execute on function public.ensure_profile() from public,anon,authenticated;
grant execute on function public.ensure_profile() to authenticated;
create function public.save_preferences(p_name text,p_timezone text,p_theme text,p_private boolean,p_email boolean,p_sms boolean,p_push boolean) returns void language sql security invoker set search_path='' as $api$ select duewell_private.save_preferences(p_name, p_timezone, p_theme, p_private, p_email, p_sms, p_push); $api$;
revoke execute on function public.save_preferences(p_name text, p_timezone text, p_theme text, p_private boolean, p_email boolean, p_sms boolean, p_push boolean) from public,anon,authenticated;
grant execute on function public.save_preferences(p_name text, p_timezone text, p_theme text, p_private boolean, p_email boolean, p_sms boolean, p_push boolean) to authenticated;
create function public.create_debt(p_id uuid,p_name text,p_lender text,p_category text,p_notes text,p_total bigint,p_schedule jsonb) returns uuid language sql security invoker set search_path='' as $api$ select duewell_private.create_debt(p_id, p_name, p_lender, p_category, p_notes, p_total, p_schedule); $api$;
revoke execute on function public.create_debt(p_id uuid, p_name text, p_lender text, p_category text, p_notes text, p_total bigint, p_schedule jsonb) from public,anon,authenticated;
grant execute on function public.create_debt(p_id uuid, p_name text, p_lender text, p_category text, p_notes text, p_total bigint, p_schedule jsonb) to authenticated;
create function public.update_debt(p_id uuid,p_name text,p_lender text,p_category text,p_notes text) returns void language sql security invoker set search_path='' as $api$ select duewell_private.update_debt(p_id, p_name, p_lender, p_category, p_notes); $api$;
revoke execute on function public.update_debt(p_id uuid, p_name text, p_lender text, p_category text, p_notes text) from public,anon,authenticated;
grant execute on function public.update_debt(p_id uuid, p_name text, p_lender text, p_category text, p_notes text) to authenticated;
create function public.delete_debt(p_id uuid) returns void language sql security invoker set search_path='' as $api$ select duewell_private.delete_debt(p_id); $api$;
revoke execute on function public.delete_debt(p_id uuid) from public,anon,authenticated;
grant execute on function public.delete_debt(p_id uuid) to authenticated;
create function public.mark_paid(p_id uuid,p_installment uuid,p_amount bigint,p_date date) returns uuid language sql security invoker set search_path='' as $api$ select duewell_private.mark_paid(p_id, p_installment, p_amount, p_date); $api$;
revoke execute on function public.mark_paid(p_id uuid, p_installment uuid, p_amount bigint, p_date date) from public,anon,authenticated;
grant execute on function public.mark_paid(p_id uuid, p_installment uuid, p_amount bigint, p_date date) to authenticated;
create function public.reverse_payment(p_id uuid) returns void language sql security invoker set search_path='' as $api$ select duewell_private.reverse_payment(p_id); $api$;
revoke execute on function public.reverse_payment(p_id uuid) from public,anon,authenticated;
grant execute on function public.reverse_payment(p_id uuid) to authenticated;
create function public.edit_installment(p_id uuid,p_date date,p_amount bigint) returns void language sql security invoker set search_path='' as $api$ select duewell_private.edit_installment(p_id, p_date, p_amount); $api$;
revoke execute on function public.edit_installment(p_id uuid, p_date date, p_amount bigint) from public,anon,authenticated;
grant execute on function public.edit_installment(p_id uuid, p_date date, p_amount bigint) to authenticated;
create function public.register_push(p_endpoint text,p_p256dh text,p_auth text) returns void language sql security invoker set search_path='' as $api$ select duewell_private.register_push(p_endpoint, p_p256dh, p_auth); $api$;
revoke execute on function public.register_push(p_endpoint text, p_p256dh text, p_auth text) from public,anon,authenticated;
grant execute on function public.register_push(p_endpoint text, p_p256dh text, p_auth text) to authenticated;
create function public.remove_push(p_endpoint text) returns void language sql security invoker set search_path='' as $api$ select duewell_private.remove_push(p_endpoint); $api$;
revoke execute on function public.remove_push(p_endpoint text) from public,anon,authenticated;
grant execute on function public.remove_push(p_endpoint text) to authenticated;
create function public.set_reminders(p_installment uuid,p_channels text[],p_offsets int[],p_time time) returns int language sql security invoker set search_path='' as $api$ select duewell_private.set_reminders(p_installment, p_channels, p_offsets, p_time); $api$;
revoke execute on function public.set_reminders(p_installment uuid, p_channels text[], p_offsets int[], p_time time) from public,anon,authenticated;
grant execute on function public.set_reminders(p_installment uuid, p_channels text[], p_offsets int[], p_time time) to authenticated;
create function public.cancel_reminder(p_id uuid) returns void language sql security invoker set search_path='' as $api$ select duewell_private.cancel_reminder(p_id); $api$;
revoke execute on function public.cancel_reminder(p_id uuid) from public,anon,authenticated;
grant execute on function public.cancel_reminder(p_id uuid) to authenticated;
