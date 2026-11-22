import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { supabaseKey } from "./keys.ts";
export type DeliveryConfig = Record<string, string>;
export function env(name: string, config?: DeliveryConfig) {
  const value = Deno.env.get(name) || config?.[name];
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}
export const publicKey = () =>
  supabaseKey("publishable", (name) => Deno.env.get(name));
export function admin() {
  return createClient(
    env("SUPABASE_URL"),
    supabaseKey("secret", (name) => Deno.env.get(name)),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
let cached: { expires: number; value: DeliveryConfig } | null = null;
export async function deliveryConfig(db: ReturnType<typeof admin>) {
  if (cached && cached.expires > Date.now()) return cached.value;
  const { data, error } = await db.rpc("delivery_config");
  if (error) throw new Error("Delivery settings unavailable");
  cached = { expires: Date.now() + 60000, value: data || {} };
  return cached.value;
}
export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}
export function cors(req: Request, config?: DeliveryConfig) {
  const origin = req.headers.get("Origin");
  const allowed = env("APP_URL", config).replace(/\/$/, "");
  if (origin !== allowed) throw new Error("Origin not allowed.");
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
export async function secureEqual(a: string, b: string) {
  const encode = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", encode.encode(a)),
    crypto.subtle.digest("SHA-256", encode.encode(b)),
  ]);
  const left = new Uint8Array(x),
    right = new Uint8Array(y);
  let diff = 0;
  for (let j = 0; j < left.length; j++) diff |= left[j] ^ right[j];
  return diff === 0;
}
