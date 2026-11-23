-- Non-delivery smoke test: all synthetic auth users and app rows are rolled back.
begin;
select set_config('duewell.qa_a',gen_random_uuid()::text,true),set_config('duewell.qa_b',gen_random_uuid()::text,true),set_config('duewell.qa_debt',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) select current_setting('duewell.qa_a')::uuid,'qa-a-'||current_setting('duewell.qa_a')||'@example.invalid','{}'::jsonb,now() union all select current_setting('duewell.qa_b')::uuid,'qa-b-'||current_setting('duewell.qa_b')||'@example.invalid','{}'::jsonb,now();
insert into auth.sessions(id,user_id) select current_setting('duewell.qa_a')::uuid,current_setting('duewell.qa_a')::uuid union all select current_setting('duewell.qa_b')::uuid,current_setting('duewell.qa_b')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('duewell.qa_a'),true),set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('duewell.qa_a'),'session_id',current_setting('duewell.qa_a'),'aal','aal1')::text,true);
select public.create_debt(current_setting('duewell.qa_debt')::uuid,'Transactional QA','Sample','Shopping','Test only',20000,'[{"due_date":"2027-12-02","amount_cents":5000},{"due_date":"2027-12-16","amount_cents":15000}]');
do $verify$
declare iid uuid; pid uuid=gen_random_uuid(); actual bigint;
begin
 select id into iid from public.installments where debt_id=current_setting('duewell.qa_debt')::uuid order by amount_cents limit 1;
 perform public.mark_paid(pid,iid,2500,current_date);
 perform public.mark_paid(pid,iid,2500,current_date);
 select sum(amount_cents) into actual from public.payments where installment_id=iid;
 if actual<>2500 then raise exception 'Payment idempotency failed'; end if;
 begin
  perform public.mark_paid(gen_random_uuid(),iid,2501,current_date);
  raise exception 'Overpayment protection failed';
 exception when others then if sqlerrm not like '%exceeds%' then raise; end if;
 end;
 perform public.save_preferences('QA','America/New_York','system',true,true,false,false);
 perform public.set_reminders(iid,array['email'],array[1,0],'09:00');
 if (select count(*) from public.reminders where active and channel='email')<>2 then raise exception 'Email schedule failed'; end if;
 begin
  perform public.set_reminders(iid,array['sms'],array[1],'09:00');
  raise exception 'SMS guard failed';
 exception when others then if sqlerrm not like '%SMS reminders%' then raise; end if;
 end;
 begin
  perform public.register_push('https://127.0.0.1/','unused','unused');
  raise exception 'Push guard failed';
 exception when others then if sqlerrm not like '%Unsupported push service%' then raise; end if;
 end;
 perform public.save_preferences('QA','America/New_York','system',true,false,false,false);
 if exists(select 1 from public.reminders where state='pending') then raise exception 'Email opt-out failed'; end if;
 if has_function_privilege('authenticated','public.delivery_config()','execute') then raise exception 'Delivery secrets exposed'; end if;
end $verify$;
select set_config('request.jwt.claim.sub',current_setting('duewell.qa_b'),true),set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('duewell.qa_b'),'session_id',current_setting('duewell.qa_b'),'aal','aal1')::text,true);
do $verify$
begin
 if exists(select 1 from public.debts) or exists(select 1 from public.payments) then raise exception 'Cross-account read protection failed'; end if;
 begin
  perform public.delete_debt(current_setting('duewell.qa_debt')::uuid);
  raise exception 'Cross-account deletion protection failed';
 exception when others then if sqlerrm not like '%Debt not found%' then raise; end if;
 end;
end $verify$;
reset role;
rollback;
select jsonb_build_object('checks_passed',array['owner isolation','payment idempotency','overpayment protection','worker secret isolation','cross-account mutation rejection','email scheduling','SMS and push endpoint guards','email opt-out'],'synthetic_data_rolled_back',true) as verification;
