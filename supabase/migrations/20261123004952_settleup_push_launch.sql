-- Public beta: email and Web Push. SMS remains deferred.
alter table public.profiles drop constraint email_only_preferences;
alter table public.profiles add constraint sms_disabled_preferences check(not sms_enabled);
alter table public.reminders drop constraint email_only_queue;
alter table public.reminders add constraint supported_reminder_queue
 check(channel in ('email','push') or (not active and state not in ('pending','processing')));

create or replace function duewell_private.save_preferences(p_name text,p_timezone text,p_theme text,p_private boolean,p_email boolean,p_sms boolean,p_push boolean)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid=duewell_private.request_user(); previous_zone text;
begin
 if p_sms then raise exception 'SMS reminders are not available in this release.'; end if;
 perform duewell_private.ensure_profile();
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Choose a valid time zone.'; end if;
 select timezone into previous_zone from public.profiles where id=uid;
 update public.profiles set display_name=trim(p_name),timezone=p_timezone,theme=p_theme,
 private_content=p_private,email_enabled=p_email,sms_enabled=false,push_enabled=p_push,
 consent_phone=null,sms_consent_at=null,sms_consent_version=null where id=uid;
 -- Never silently retain a schedule in the previous time zone.
 update public.reminders r set state='cancelled',active=false,
 error_code='preferences_changed',updated_at=now()
 where r.owner_id=uid and r.state='pending' and
 (previous_zone is distinct from p_timezone or (r.channel='email' and not p_email) or (r.channel='push' and not p_push));
end $$;

create or replace function duewell_private.set_reminders(p_installment uuid,p_channels text[],p_offsets int[],p_time time)
returns int language plpgsql security definer set search_path='' as $$
declare uid uuid=duewell_private.request_user(); i public.installments; p public.profiles;
 contact auth.users; c text; o int; at_time timestamptz; cnt int=0; inserted_count int;
begin
 if coalesce(cardinality(p_channels),0)<1 or cardinality(p_channels)>2 then raise exception 'Choose email, notifications, or both.'; end if;
 foreach c in array p_channels loop
  if c is null or c not in ('email','push') then raise exception 'SMS reminders are not available in this release.'; end if;
 end loop;
 select * into i from public.installments where id=p_installment and owner_id=uid for update;
 if not found then raise exception 'Installment not found.'; end if;
 select * into p from public.profiles where id=uid;
 select * into contact from auth.users where id=uid;
 if i.amount_cents<=(select coalesce(sum(amount_cents),0) from public.payments where installment_id=i.id and reversed_at is null) then raise exception 'This installment is already paid.'; end if;
 if coalesce(cardinality(p_offsets),0)<1 or cardinality(p_offsets)>4 or p_time is null then raise exception 'Choose reminder days and a time.'; end if;
 update public.reminders set active=false,state=case when state='pending' then 'cancelled' else state end,updated_at=now() where installment_id=i.id and active;
 foreach c in array p_channels loop
  if c='email' and (not p.email_enabled or contact.email_confirmed_at is null or coalesce(contact.email,'')='') then raise exception 'Enable email reminders and verify your email first.'; end if;
  if c='push' and (not p.push_enabled or not exists(select 1 from public.push_subscriptions where owner_id=uid)) then raise exception 'Enable notifications on a device first.'; end if;
  foreach o in array p_offsets loop
   if o is null or o not in (0,1,3,7) then raise exception 'Invalid reminder offset.'; end if;
   at_time=((i.due_date-o)+p_time) at time zone p.timezone;
   if at_time>now() then
    insert into public.reminders(owner_id,installment_id,channel,days_before,send_time,scheduled_at) values(uid,i.id,c,o,p_time,at_time) on conflict do nothing;
    get diagnostics inserted_count=row_count;
    cnt=cnt+inserted_count;
   end if;
  end loop;
 end loop;
 if cnt=0 then raise exception 'All selected reminder times have already passed. Choose a later time.'; end if;
 return cnt;
end $$;

create function duewell_private.has_push_subscription(p_endpoint text) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.push_subscriptions where endpoint=p_endpoint and owner_id=duewell_private.request_user());
$$;
revoke execute on function duewell_private.has_push_subscription(text) from public,anon,authenticated;
grant execute on function duewell_private.has_push_subscription(text) to authenticated;
create function public.has_push_subscription(p_endpoint text) returns boolean language sql security invoker set search_path='' as $$ select duewell_private.has_push_subscription(p_endpoint); $$;
revoke execute on function public.has_push_subscription(text) from public,anon,authenticated;
grant execute on function public.has_push_subscription(text) to authenticated;

create or replace function duewell_private.register_push(p_endpoint text,p_p256dh text,p_auth text) returns void language plpgsql security definer set search_path='' as $$
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

create or replace function duewell_private.claim_reminders(p_limit int default 25)
returns setof public.reminders language plpgsql security definer set search_path='' as $$
begin
 -- An expired lease has an uncertain send result. Do not resend automatically.
 update public.reminders set state='failed',error_code='delivery_uncertain',lease_until=null,updated_at=now()
 where state='processing' and lease_until<now();
 return query with due as (
  select r.id from public.reminders r where r.channel in ('email','push') and r.active and r.state='pending'
  and r.scheduled_at<=now() and r.scheduled_at>now()-interval '24 hours'
  and (r.next_attempt_at is null or r.next_attempt_at<=now()) and r.attempts<4
  order by r.scheduled_at limit least(greatest(p_limit,1),50) for update skip locked
 ) update public.reminders r set state='processing',attempts=attempts+1,
 lease_until=now()+interval '5 minutes',updated_at=now() from due where r.id=due.id returning r.*;
 update public.reminders set state='skipped',active=false,error_code='expired',updated_at=now()
 where state='pending' and scheduled_at<=now()-interval '24 hours';
end $$;

create or replace function duewell_private.reminder_payload(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.reminders; i public.installments; d public.debts; p public.profiles; u auth.users; left_cents bigint; devices jsonb;
begin
 select * into r from public.reminders where id=p_id and channel in ('email','push') and state='processing' and active;
 if not found then return null; end if;
 select * into i from public.installments where id=r.installment_id;
 select * into d from public.debts where id=i.debt_id;
 select * into p from public.profiles where id=r.owner_id;
 select * into u from auth.users where id=r.owner_id;
 select i.amount_cents-coalesce(sum(amount_cents),0) into left_cents from public.payments where installment_id=i.id and reversed_at is null;
 if left_cents<=0 or p.id is null or u.id is null then return null; end if;
 if r.channel='email' then
  if not p.email_enabled or u.email_confirmed_at is null or coalesce(u.email,'')='' then return null; end if;
  return jsonb_build_object('channel','email','email',u.email,'private_content',p.private_content,'name',d.name,'due_date',i.due_date,'amount_cents',left_cents,'debt_id',d.id);
 end if;
 if not p.push_enabled then return null; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'endpoint',endpoint,'keys',jsonb_build_object('p256dh',p256dh,'auth',auth))),'[]'::jsonb) into devices from public.push_subscriptions where owner_id=r.owner_id;
 if jsonb_array_length(devices)=0 then return null; end if;
 return jsonb_build_object('channel','push','private_content',p.private_content,'name',d.name,'due_date',i.due_date,'amount_cents',left_cents,'debt_id',d.id,'subscriptions',devices);
end $$;

create or replace function duewell_private.delivery_config() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(upper(substring(name from 9)),decrypted_secret),'{}'::jsonb)
 from vault.decrypted_secrets where name in ('duewell_app_url','duewell_worker_secret','duewell_resend_api_key','duewell_email_from','duewell_vapid_subject','duewell_vapid_public_key','duewell_vapid_private_key');
$$;
