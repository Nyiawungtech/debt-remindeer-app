/** The modern key dictionaries are injected by Supabase; values never go to clients. */
export function supabaseKey(
  kind: "publishable" | "secret",
  read: (name: string) => string | undefined,
) {
  const variable =
    kind === "secret" ? "SUPABASE_SECRET_KEYS" : "SUPABASE_PUBLISHABLE_KEYS";
  const dictionary = read(variable);
  if (dictionary) {
    const value = JSON.parse(dictionary).default;
    if (typeof value !== "string" || !value)
      throw new Error(`Missing default key in ${variable}`);
    return value;
  }
  const legacy = read(
    kind === "secret" ? "SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_ANON_KEY",
  );
  if (!legacy) throw new Error(`Missing server configuration: ${variable}`);
  return legacy;
}
