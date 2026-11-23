-- Cover composite foreign keys for deletion, reconciliation and owner lookups.
create index installments_debt_owner on public.installments(debt_id,owner_id);
create index payments_installment_owner on public.payments(installment_id,owner_id);
create index reminders_installment_owner on public.reminders(installment_id,owner_id);
-- Push keys are server-only. State the deny rule explicitly as defense in depth.
create policy push_keys_server_only on public.push_subscriptions as restrictive for all to anon,authenticated using(false) with check(false);

-- Encrypted delivery settings are visible only to the server's service role.
create function duewell_private.delivery_config() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(upper(substring(name from 9)),decrypted_secret),'{}'::jsonb)
 from vault.decrypted_secrets where name in (
 'duewell_app_url','duewell_worker_secret','duewell_vapid_subject','duewell_vapid_public_key','duewell_vapid_private_key',
 'duewell_resend_api_key','duewell_email_from','duewell_twilio_account_sid','duewell_twilio_auth_token','duewell_twilio_messaging_service_sid','duewell_twilio_webhook_url');
$$;
revoke execute on function duewell_private.delivery_config() from public,anon,authenticated;
grant execute on function duewell_private.delivery_config() to service_role;
create function public.delivery_config() returns jsonb language sql security invoker set search_path='' as $$ select duewell_private.delivery_config(); $$;
revoke execute on function public.delivery_config() from public,anon,authenticated;
grant execute on function public.delivery_config() to service_role;
