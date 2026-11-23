-- Run AFTER deploying reminder-worker and creating matching secrets in Vault.
-- Vault secrets: duewell_worker_url (full HTTPS Edge Function URL),
--               duewell_worker_secret (same value as Edge WORKER_SECRET).
-- Run only as a database administrator. No client receives these values.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $$
begin
 if not exists(select 1 from vault.decrypted_secrets where name='duewell_worker_url') or
 not exists(select 1 from vault.decrypted_secrets where name='duewell_worker_secret') then
 raise exception 'Create duewell_worker_url and duewell_worker_secret in Supabase Vault first.';
 end if;
 perform cron.unschedule(jobid) from cron.job where jobname='duewell-reminder-dispatch';
end $$;
select cron.schedule('duewell-reminder-dispatch','* * * * *', $job$
 select net.http_post(
 url := (select decrypted_secret from vault.decrypted_secrets where name='duewell_worker_url' limit 1),
 headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='duewell_worker_secret' limit 1)),
 body := '{}'::jsonb,timeout_milliseconds := 60000
 );
$job$);
