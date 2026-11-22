import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  debt = "33333333-3333-4333-8333-333333333333";
let db: PGlite;
let iid: string;
async function owner(id = a, aal = "aal1") {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claims','{"aal":"${aal}","session_id":"${id}"}',false);`,
  );
}
async function root() {
  await db.exec("reset role");
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz,phone text,phone_confirmed_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade);
 create schema vault;
 create table vault.decrypted_secrets(name text,decrypted_secret text);
 create table auth.mfa_factors(user_id uuid,status text,factor_type text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 insert into auth.users values('${a}','{}','a@example.com',now(),'12025550101',now()),('${b}','{}','b@example.com',now(),'12025550102',now());
 insert into auth.sessions values('${a}','${a}'),('${b}','${b}');`);
  for (const file of readdirSync(
    new URL("../supabase/migrations/", import.meta.url),
  )
    .filter((file) => file.endsWith(".sql") && !file.endsWith("_scheduler.sql"))
    .sort())
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  await owner();
  await db.query("select public.create_debt($1,$2,$3,$4,$5,$6,$7::jsonb)", [
    debt,
    "Test debt",
    "Store",
    "Shopping",
    "",
    20000,
    JSON.stringify([
      { due_date: "2027-12-02", amount_cents: 5000 },
      { due_date: "2027-12-16", amount_cents: 15000 },
    ]),
  ]);
  iid = (
    await db.query<{ id: string }>(
      "select id from public.installments order by amount_cents",
    )
  ).rows[0].id;
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe("actual PostgreSQL ownership and financial invariants", () => {
  it("does not expose another account’s debts, payments or reminders", async () => {
    await owner(b);
    for (const table of ["debts", "installments", "payments", "reminders"])
      expect(
        (await db.query(`select * from public.${table}`)).rows,
      ).toHaveLength(0);
    await expect(
      db.query("select public.update_debt($1,$2,$3,$4,$5)", [
        debt,
        "Stolen",
        "",
        "Other",
        "",
      ]),
    ).rejects.toThrow("Debt not found");
  });
  it("rejects direct client inserts and worker calls", async () => {
    await owner();
    await expect(
      db.query(
        `insert into public.debts(owner_id,name,total_cents) values($1,'Bypass',1)`,
        [a],
      ),
    ).rejects.toThrow("permission denied");
    await expect(
      db.query("select * from public.claim_reminders(1)"),
    ).rejects.toThrow("permission denied");
  });
  it("rejects an unbalanced schedule atomically", async () => {
    await owner();
    await expect(
      db.query("select public.create_debt($1,$2,$3,$4,$5,$6,$7::jsonb)", [
        "44444444-4444-4444-8444-444444444444",
        "Bad",
        "",
        "Other",
        "",
        100,
        JSON.stringify([{ due_date: "2027-01-01", amount_cents: 99 }]),
      ]),
    ).rejects.toThrow("add up");
    expect((await db.query("select * from public.debts")).rows).toHaveLength(1);
  });
  it("records partial payments idempotently, rejects conflicting retries and overpayments", async () => {
    await owner();
    const id = "55555555-5555-4555-8555-555555555555";
    const args = [id, iid, 2500, "2026-01-01"];
    await db.query("select public.mark_paid($1,$2,$3,$4)", args);
    await db.query("select public.mark_paid($1,$2,$3,$4)", args);
    expect((await db.query("select * from public.payments")).rows).toHaveLength(
      1,
    );
    await expect(
      db.query("select public.mark_paid($1,$2,$3,$4)", [
        id,
        iid,
        2600,
        "2026-01-01",
      ]),
    ).rejects.toThrow("conflicts");
    await expect(
      db.query("select public.mark_paid($1,$2,$3,$4)", [
        "66666666-6666-4666-8666-666666666666",
        iid,
        2501,
        "2026-01-01",
      ]),
    ).rejects.toThrow("exceeds");
  });
  it("protects paid totals when changing installments", async () => {
    await owner();
    await expect(
      db.query("select public.edit_installment($1,$2,$3)", [
        iid,
        "2027-12-02",
        2000,
      ]),
    ).rejects.toThrow("recorded payments");
    await db.query("select public.edit_installment($1,$2,$3)", [
      iid,
      "2027-12-03",
      6000,
    ]);
    expect(
      Number(
        (
          await db.query<{ total_cents: number }>(
            "select total_cents from public.debts",
          )
        ).rows[0].total_cents,
      ),
    ).toBe(21000);
  });
  it("requires verified phone consent for SMS and rejects SSRF push endpoints", async () => {
    await owner();
    await expect(
      db.query("select public.set_reminders($1,$2,$3,$4)", [
        iid,
        ["sms"],
        [1],
        "09:00",
      ]),
    ).rejects.toThrow("opt in");
    await expect(
      db.query("select public.register_push($1,$2,$3)", [
        "https://127.0.0.1/internal",
        "a".repeat(87),
        "b".repeat(22),
      ]),
    ).rejects.toThrow("Unsupported");
    await db.query("select public.save_preferences($1,$2,$3,$4,$5,$6,$7)", [
      "Alice",
      "America/New_York",
      "system",
      true,
      true,
      true,
      false,
    ]);
    await db.query("select public.set_reminders($1,$2,$3,$4)", [
      iid,
      ["sms", "email"],
      [1, 0],
      "09:00",
    ]);
    expect(
      (await db.query("select * from public.reminders where active")).rows,
    ).toHaveLength(4);
  });
  it("cancels pending reminders after a complete payment and keeps reversal history", async () => {
    await owner();
    await db.query("select public.mark_paid($1,$2,$3,$4)", [
      "77777777-7777-4777-8777-777777777777",
      iid,
      3500,
      "2026-01-02",
    ]);
    expect(
      (await db.query("select * from public.reminders where state='pending'"))
        .rows,
    ).toHaveLength(0);
    await db.query(
      "select public.reverse_payment('77777777-7777-4777-8777-777777777777')",
    );
    expect(
      (
        await db.query(
          "select * from public.payments where reversed_at is not null",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.reminders where state='pending'"))
        .rows,
    ).toHaveLength(0);
  });
  it("requires MFA for enrolled users, including direct reads and RPC writes", async () => {
    await root();
    await db.query(
      "insert into auth.mfa_factors values($1,'verified','totp')",
      [a],
    );
    await owner();
    await expect(db.query("select * from public.debts")).rejects.toThrow(
      "authenticator",
    );
    await expect(
      db.query("select public.delete_debt($1)", [debt]),
    ).rejects.toThrow("authenticator");
    await owner(a, "aal2");
    expect((await db.query("select * from public.debts")).rows).toHaveLength(1);
  });
  it("prevents unverified accounts from claiming consent", async () => {
    await root();
    await db.query(
      "update auth.users set phone_confirmed_at=null where id=$1",
      [b],
    );
    await owner(b);
    await expect(
      db.query("select public.save_preferences($1,$2,$3,$4,$5,$6,$7)", [
        "Bob",
        "UTC",
        "light",
        true,
        true,
        true,
        false,
      ]),
    ).rejects.toThrow("Verify your phone");
  });
  it("expires uncertain processing leases without resending", async () => {
    await root();
    await db.query(
      "insert into public.reminders(owner_id,installment_id,channel,days_before,send_time,scheduled_at,state,lease_until) values($1,$2,'email',7,'09:00',now()-interval '1 hour','processing',now()-interval '1 minute')",
      [a, iid],
    );
    await db.exec("set role service_role");
    await db.query("select * from public.claim_reminders(5)");
    await root();
    expect(
      (
        await db.query<{ error_code: string }>(
          "select error_code from public.reminders where error_code='delivery_uncertain'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("rejects logged-out tokens even while their JWT expiry has not passed", async () => {
    await root();
    await db.query("delete from auth.sessions where id=$1", [a]);
    await owner(a, "aal2");
    await expect(db.query("select public.ensure_profile()")).rejects.toThrow(
      "session has ended",
    );
  });
  it("keeps privileged implementations out of public API schema", async () => {
    await root();
    const result = await db.query<{ count: number }>(
      "select count(*)::int as count from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef",
    );
    expect(result.rows[0].count).toBe(0);
  });
});
