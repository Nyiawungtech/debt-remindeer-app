-- Worker-only functions. Neither anon nor authenticated may dispatch or read destinations.
create function duewell_private.claim_reminders(p_limit int default 25) returns setof public.reminders language plpgsql security definer set search_path='' as $$
begin
 -- An expired lease has an uncertain send result. Do not resend automatically.
 update public.reminders set state='failed',error_code='delivery_uncertain',lease_until=null,updated_at=now() where state='processing' and lease_until<now();
 return query with due as (
  select r.id from public.reminders r where r.active and r.state='pending' and r.scheduled_at<=now()
  and r.scheduled_at>now()-interval '24 hours' and (r.next_attempt_at is null or r.next_attempt_at<=now()) and r.attempts<4
  order by r.scheduled_at limit least(greatest(p_limit,1),50) for update skip locked
 ) update public.reminders r set state='processing',attempts=attempts+1,lease_until=now()+interval '5 minutes',updated_at=now() from due where r.id=due.id returning r.*;
 update public.reminders set state='skipped',error_code='expired',updated_at=now() where state='pending' and scheduled_at<=now()-interval '24 hours';
end $$;
create function duewell_private.reminder_payload(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.reminders; i public.installments; d public.debts; p public.profiles; u auth.users; left_cents bigint; devices jsonb;
begin
 select * into r from public.reminders where id=p_id and state='processing' and active;
 if not found then return null; end if;
 select * into i from public.installments where id=r.installment_id;
 select * into d from public.debts where id=i.debt_id;
 select * into p from public.profiles where id=r.owner_id;
 select * into u from auth.users where id=r.owner_id;
 select i.amount_cents-coalesce(sum(amount_cents),0) into left_cents from public.payments where installment_id=i.id and reversed_at is null;
 if left_cents<=0 then return null; end if;
 if r.channel='email' and (not p.email_enabled or u.email_confirmed_at is null) then return null; end if;
 if r.channel='sms' and (not p.sms_enabled or u.phone_confirmed_at is null or p.consent_phone is distinct from u.phone or p.sms_consent_at is null) then return null; end if;
 if r.channel='push' and not p.push_enabled then return null; end if;
 if r.channel='sms' and (select count(*) from public.reminders where owner_id=r.owner_id and channel='sms' and state in ('accepted','delivered','processing') and updated_at>now()-interval '24 hours' and id<>r.id)>=24 then
  raise exception 'sms_daily_limit';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'endpoint',endpoint,'keys',jsonb_build_object('p256dh',p256dh,'auth',auth))),'[]'::jsonb) into devices from public.push_subscriptions where owner_id=r.owner_id;
 return jsonb_build_object('channel',r.channel,'email',u.email,'phone',u.phone,'private_content',p.private_content,'name',d.name,'due_date',i.due_date,'amount_cents',left_cents,'debt_id',d.id,'subscriptions',devices);
end $$;
create function duewell_private.finish_reminder(p_id uuid,p_state text,p_provider text default null,p_error text default null,p_retry boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_state not in ('accepted','failed','skipped') then raise exception 'Invalid worker result.'; end if;
 update public.reminders set state=case when p_retry and attempts<4 then 'pending' else p_state end,
 provider_id=p_provider,error_code=p_error,lease_until=null,
 next_attempt_at=case when p_retry and attempts<4 then now()+make_interval(mins=>power(2,attempts)::int) else null end,updated_at=now()
 where id=p_id and state='processing';
end $$;
revoke execute on function duewell_private.claim_reminders(int),duewell_private.reminder_payload(uuid),duewell_private.finish_reminder(uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function duewell_private.claim_reminders(int),duewell_private.reminder_payload(uuid),duewell_private.finish_reminder(uuid,text,text,text,boolean) to service_role;

-- Public endpoints are invoker wrappers; privileged implementations remain unexposed.
create function public.claim_reminders(p_limit int default 25) returns setof public.reminders language sql security invoker set search_path='' as $api$ select * from duewell_private.claim_reminders(p_limit); $api$;
revoke execute on function public.claim_reminders(p_limit int) from public,anon,authenticated;
grant execute on function public.claim_reminders(p_limit int) to service_role;
create function public.reminder_payload(p_id uuid) returns jsonb language sql security invoker set search_path='' as $api$ select duewell_private.reminder_payload(p_id); $api$;
revoke execute on function public.reminder_payload(p_id uuid) from public,anon,authenticated;
grant execute on function public.reminder_payload(p_id uuid) to service_role;
create function public.finish_reminder(p_id uuid,p_state text,p_provider text default null,p_error text default null,p_retry boolean default false) returns void language sql security invoker set search_path='' as $api$ select duewell_private.finish_reminder(p_id, p_state, p_provider, p_error, p_retry); $api$;
revoke execute on function public.finish_reminder(p_id uuid, p_state text, p_provider text, p_error text, p_retry boolean) from public,anon,authenticated;
grant execute on function public.finish_reminder(p_id uuid, p_state text, p_provider text, p_error text, p_retry boolean) to service_role;
