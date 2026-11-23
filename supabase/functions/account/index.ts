import {
  admin,
  cors,
  env,
  json,
  publicKey,
  deliveryConfig,
} from "../_shared/common.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.2";
Deno.serve(async (req) => {
  const db = admin();
  let config: Record<string, string>;
  try {
    config = await deliveryConfig(db);
  } catch {
    return json({ error: "Account service is awaiting configuration" }, 503);
  }
  let headers: Record<string, string>;
  try {
    headers = cors(req, config);
  } catch {
    return json({ error: "Origin not allowed" }, 403);
  }
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST")
    return json({ error: "Method not allowed" }, 405, headers);
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) return json({ error: "Sign in to continue" }, 401, headers);
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);
  if (error || !user?.email)
    return json({ error: "Sign in to continue" }, 401, headers);
  // getUser above validates the JWT before its assurance claim is inspected.
  const claims = JSON.parse(
    atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
  );
  if (
    user.factors?.some((f) => f.status === "verified") &&
    claims.aal !== "aal2"
  )
    return json(
      { error: "Complete two-step verification first" },
      403,
      headers,
    );
  let password: string;
  try {
    const payload = await req.json();
    if (
      payload.action !== "delete" ||
      typeof payload.password !== "string" ||
      payload.password.length > 1024
    )
      throw new Error();
    password = payload.password;
  } catch {
    return json({ error: "Invalid request" }, 400, headers);
  }
  const verifier = createClient(env("SUPABASE_URL"), publicKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verified, error: checkError } =
    await verifier.auth.signInWithPassword({ email: user.email, password });
  if (checkError || verified.user?.id !== user.id)
    return json({ error: "Password verification failed" }, 403, headers);
  const { error: deleteError } = await db.auth.admin.deleteUser(user.id);
  if (deleteError)
    return json(
      { error: "Could not delete the account. Try again." },
      500,
      headers,
    );
  return json({ deleted: true }, 200, headers);
});
