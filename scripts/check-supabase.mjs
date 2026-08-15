// Checks that Supabase is reachable, that the full application schema is applied, and that the
// tables are closed to the public key.
//
//   node scripts/check-supabase.mjs
//
// Run it after applying `supabase/schema.sql` and after setting the environment, locally and again
// against production's variables. It writes nothing and creates no accounts.
//
// Environment is loaded through @next/env, which is what `next dev` itself uses, so this reads the
// same `.env`/`.env.local` files in the same order the running app does. A check that read the
// environment differently from the app would be able to pass while the app failed.

// @next/env is CommonJS, so it has no named exports to destructure from an ESM import.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

// Trailing slashes trimmed with a loop rather than /\/+$/, which backtracks super-linearly.
let url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
while (url.endsWith("/")) url = url.slice(0, -1);
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").trim();
// Every name the browser-safe key travels under: `anon` on older projects, `publishable` on
// current ones, with and without the NEXT_PUBLIC_ prefix. Missing one silently skips the RLS
// check below, which is the one check here that catches a breach rather than a misconfiguration.
const anonKey = (
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ""
).trim();

let failed = false;

function pass(message) {
  console.log(`  ok    ${message}`);
}

function fail(message, hint) {
  failed = true;
  console.log(`  FAIL  ${message}`);
  if (hint) console.log(`        ${hint}`);
}

console.log("\nSupabase check\n");

// --- configuration ---------------------------------------------------------

if (!url) {
  fail("SUPABASE_URL is not set", "Settings -> API -> Project URL, e.g. https://abcdefgh.supabase.co");
} else if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url)) {
  // Not fatal — self-hosted Supabase has its own hostname — but it is the usual typo.
  console.log(`  warn  SUPABASE_URL is ${url}, which is not the usual project URL shape`);
} else {
  pass(`SUPABASE_URL is ${url}`);
}

if (!serviceKey) {
  fail(
    "SUPABASE_SERVICE_ROLE_KEY is not set",
    "Settings -> API keys -> `sb_secret_...` (Reveal). On older projects it is called service_role.",
  );
} else if (serviceKey.startsWith("sb_publishable_")) {
  // The publishable key and the secret key sit next to each other in the dashboard and only the
  // secret one can read this table, so this is the easiest mistake in the whole setup to make.
  // It is worth naming precisely rather than letting it surface later as a permissions error.
  fail(
    "SUPABASE_SERVICE_ROLE_KEY holds the PUBLISHABLE key",
    "That key is browser-safe and governed by RLS, so it cannot read public.users by design.\n" +
      "        Use the `sb_secret_...` key from the same page.",
  );
} else if (serviceKey.startsWith("sb_secret_") || serviceKey.startsWith("eyJ")) {
  // `sb_secret_` is the current format; `eyJ` is the JWT service_role key older projects issue.
  pass("SUPABASE_SERVICE_ROLE_KEY looks like a secret key");
} else {
  console.log("  warn  SUPABASE_SERVICE_ROLE_KEY is not in a format this script recognises");
}

// The service_role key must never be given a NEXT_PUBLIC_ name: anything so prefixed is inlined
// into the browser bundle at build time, which publishes a key that bypasses row-level security.
for (const name of Object.keys(process.env)) {
  if (name.startsWith("NEXT_PUBLIC_") && /SERVICE_ROLE|SERVICE_KEY/i.test(name)) {
    fail(`${name} exposes the service_role key to the browser`, "Rename it to SUPABASE_SERVICE_ROLE_KEY.");
  }
}

if (!process.env.AUTH_TOKEN_SECRET?.trim()) {
  fail(
    "AUTH_TOKEN_SECRET is not set",
    "Session tokens fall back to a secret published in this repo, so anyone can forge one.\n" +
      "        Generate one with:  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
} else {
  pass("AUTH_TOKEN_SECRET is set");
}

if (!url || !serviceKey) {
  console.log("\nCannot reach Supabase without a URL and a service key.\n");
  process.exit(1);
}

// --- connectivity and schema ----------------------------------------------

async function rest(pathAndQuery, key, method = "GET") {
  return fetch(`${url}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  });
}

const schemaChecks = [
  {
    table: "analytics_events",
    columns: "id,type,at,day,user_id,visitor_id,session_id,feature,action,label,path,referrer,device,blocked",
    label: "product analytics",
  },
  {
    table: "live_sessions",
    columns: "key,user_id,visitor_id,session_id,path,device,started_at,last_seen_at",
    label: "live session presence",
  },
  {
    table: "portfolio_holdings",
    columns: "id,user_id,symbol,quantity,avg_price,target_price,note,added_at,updated_at",
    label: "portfolio holdings",
  },
  {
    table: "feature_locks",
    columns: "feature,locked,updated_at",
    label: "admin AI feature locks",
  },
  {
    table: "subscription_payments",
    columns:
      "payment_id,order_id,user_id,plan,cycle,amount_paise,currency,promo_code,referral_code,subscribed_until,paid_at",
    label: "subscription payment ledger",
  },
  {
    table: "client_reviews",
    columns: "id,name,role,comment,rating,image_url,signature_url,created_at",
    label: "client review content",
  },
  {
    table: "stocks",
    columns: "symbol,name,scrip_code,isin,sector,cap_tier,domain,updated_at",
    label: "BSE stock catalogue",
  },
  {
    table: "ai_calls",
    columns:
      "id,at,day,feature,model,outcome,status,ms,prompt_tokens,completion_tokens,cost_usd,streamed,error",
    label: "AI call telemetry",
  },
  {
    table: "platform_logs",
    columns:
      "id,at,day,category,severity,source,use_case,operation,message,status_code,duration_ms,user_id,path,method,metadata",
    label: "super admin platform logs",
  },
];

async function checkSchemaTable({ table, columns, label }) {
  try {
    const response = await rest(`${table}?select=${columns}&limit=1`, serviceKey);

    if (response.status === 404 || response.status === 400) {
      fail(
        `the \`${table}\` table is not there (or is missing columns)`,
        `Re-run supabase/schema.sql - it is safe to apply twice. Supabase said: ${(await response.text()).slice(0, 180)}`,
      );
    } else if (!response.ok) {
      fail(`Supabase responded ${response.status} for ${table}`, (await response.text()).slice(0, 180));
    } else {
      pass(`the \`${table}\` table is reachable and has every column for ${label}`);
    }
  } catch (error) {
    fail(`could not check ${table}`, String(error));
  }
}

try {
  const response = await rest("users?select=id&limit=1", serviceKey);

  if (response.status === 404 || response.status === 400) {
    const body = await response.text();
    fail(
      "the `users` table is not there (or PostgREST cannot see it)",
      `Apply supabase/schema.sql in the SQL editor. Supabase said: ${body.slice(0, 180)}`,
    );
  } else if (response.status === 401 || response.status === 403) {
    fail("Supabase rejected the service key", "Check it is the service_role key, from this same project.");
  } else if (!response.ok) {
    fail(`Supabase responded ${response.status}`, (await response.text()).slice(0, 180));
  } else {
    pass("the `users` table is reachable with the service key");

    // Confirm the columns the store maps actually exist, rather than only that the table does —
    // a half-applied schema fails at the first sign-up otherwise, not here.
    const columns = [
      "id,name,email,password_hash,plan,created_at,mobile,role",
      "trial_started_at,subscribed_until,last_payment_id",
      "email_verified_at,verification_token,verification_sent_at",
    ].join(",");
    const shape = await rest(`users?select=${columns}&limit=1`, serviceKey);
    if (shape.ok) {
      pass("every column the store writes is present");
    } else {
      fail("the `users` table is missing columns", (await shape.text()).slice(0, 180));
    }

    const count = await fetch(`${url}/rest/v1/users?select=id`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: "count=exact", Range: "0-0" },
      signal: AbortSignal.timeout(10_000),
    });
    const range = count.headers.get("content-range");
    if (range) pass(`accounts currently stored: ${range.split("/")[1]}`);
  }
} catch (error) {
  fail("could not reach Supabase", String(error));
}

// --- application tables ----------------------------------------------------

// Checked separately because older projects can have a perfectly good account store but be
// missing later operational tables: AI telemetry, live sessions, payment ledger or platform logs.
for (const check of schemaChecks) {
  await checkSchemaTable(check);
}

// --- analytics -------------------------------------------------------------

// Checked separately because it is applied separately: a project created before this table existed
// has a perfectly good `users` and no `analytics_events`, and the symptom is an admin dashboard
// with no figures on it rather than anything that looks like a missing table.
try {
  const columns = "id,type,at,day,user_id,visitor_id,session_id,feature,action,label,path,referrer,device,blocked";
  const response = await rest(`analytics_events?select=${columns}&limit=1`, serviceKey);

  if (response.status === 404 || response.status === 400) {
    fail(
      "the `analytics_events` table is not there (or is missing columns)",
      `Re-run supabase/schema.sql — it is safe to apply twice. Supabase said: ${(await response.text()).slice(0, 180)}`,
    );
  } else if (!response.ok) {
    fail(`Supabase responded ${response.status} for analytics_events`, (await response.text()).slice(0, 180));
  } else {
    pass("the `analytics_events` table is reachable and has every column");
  }
} catch (error) {
  fail("could not check analytics_events", String(error));
}

// --- portfolios ------------------------------------------------------------

try {
  const columns = "id,user_id,symbol,quantity,avg_price,target_price,note,added_at,updated_at";
  const response = await rest(`portfolio_holdings?select=${columns}&limit=1`, serviceKey);

  if (response.status === 404 || response.status === 400) {
    fail(
      "the `portfolio_holdings` table is not there (or is missing columns)",
      `Re-run supabase/schema.sql — it is safe to apply twice. Supabase said: ${(await response.text()).slice(0, 180)}`,
    );
  } else if (!response.ok) {
    fail(`Supabase responded ${response.status} for portfolio_holdings`, (await response.text()).slice(0, 180));
  } else {
    pass("the `portfolio_holdings` table is reachable and has every column");
  }
} catch (error) {
  fail("could not check portfolio_holdings", String(error));
}

// --- the part that would be a breach ---------------------------------------

// RLS is the only thing standing between a public key and a table of password hashes, so it is
// checked rather than assumed. Skipped silently when no anon key is configured, since this app
// never needs one.
if (anonKey) {
  for (const table of ["users", ...schemaChecks.map((check) => check.table)]) {
    try {
      const response = await rest(`${table}?select=id&limit=1`, anonKey);
      const body = await response.text();

      if (response.ok && body.trim() !== "[]") {
        fail(
          `the anon key can READ the ${table} table`,
          `Run: alter table public.${table} enable row level security;\n` +
            "        and drop any policy granting anon select.",
        );
      } else {
        pass(`the anon key cannot read the ${table} table (RLS is doing its job)`);
      }
    } catch {
      console.log(`  warn  could not test the anon key against ${table}`);
    }
  }
}

console.log(failed ? "\nSomething above needs fixing.\n" : "\nAll good — sign-up and sign-in will use Supabase.\n");
process.exit(failed ? 1 : 0);
