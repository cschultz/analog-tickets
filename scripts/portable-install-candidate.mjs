/** Emits review-only SQL for a fresh synthetic database; never connects or applies it. */
import assert from "node:assert/strict";
import { portableInstallPlan, portableInstallSql } from "./portable-install-plan.mjs";

const preflight = `DO $portable_preflight$ BEGIN
  IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'fresh Supabase Auth prerequisites are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    RAISE EXCEPTION 'Supabase Data API roles are missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
  ) OR EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typisdefined AND t.typcategory <> 'A'
  ) THEN
    RAISE EXCEPTION 'public schema is not empty; fresh-only candidate refused';
  END IF;
END $portable_preflight$;`;

const postflight = `DO $portable_postflight$ DECLARE
  table_count integer;
  rls_count integer;
  policy_count integer;
  trigger_count integer;
  routine_count integer;
BEGIN
  SELECT count(*)::int, count(*) FILTER (WHERE c.relrowsecurity)::int
    INTO table_count, rls_count
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r';
  SELECT count(*)::int INTO policy_count FROM pg_policies WHERE schemaname='public';
  SELECT count(*)::int INTO trigger_count
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal;
  SELECT count(*)::int INTO routine_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public';
  IF (table_count, rls_count, policy_count, trigger_count, routine_count)
     IS DISTINCT FROM (20, 20, 15, 22, 29) THEN
    RAISE EXCEPTION 'draft install catalog count mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND (has_function_privilege('anon',p.oid,'EXECUTE')
        OR has_function_privilege('authenticated',p.oid,'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'browser role can execute a public routine';
  END IF;
END $portable_postflight$;`;

// Exercise effective defaults under the actual install role, then roll back
// only the probe objects. Catalog checks of pg_default_acl alone can miss the
// global PUBLIC function grant or a second grant path.
const futureObjectAclProbe = `SAVEPOINT portable_future_acl_probe;
CREATE TABLE public.analog_default_acl_probe (id integer);
CREATE SEQUENCE public.analog_default_acl_probe_seq;
CREATE FUNCTION public.analog_default_acl_probe_fn()
  RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
DO $portable_future_acl_probe$ BEGIN
  IF EXISTS (
       SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS role(name)
       CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
         ('TRUNCATE'),('REFERENCES'),('TRIGGER')) AS privilege(name)
       WHERE has_table_privilege(role.name,'public.analog_default_acl_probe',privilege.name)
     ) OR EXISTS (
       SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS role(name)
       CROSS JOIN (VALUES ('USAGE'),('SELECT'),('UPDATE')) AS privilege(name)
       WHERE has_sequence_privilege(role.name,'public.analog_default_acl_probe_seq',privilege.name)
     ) OR EXISTS (
       SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS role(name)
       WHERE has_function_privilege(role.name,'public.analog_default_acl_probe_fn()','EXECUTE')
     ) THEN
    RAISE EXCEPTION 'future public object has an automatic Data API grant';
  END IF;
END $portable_future_acl_probe$;
ROLLBACK TO SAVEPOINT portable_future_acl_probe;
RELEASE SAVEPOINT portable_future_acl_probe;`;

export async function buildPortableInstallCandidate() {
  const { files } = await portableInstallPlan();
  const steps = [];
  for (const [index, path] of files.entries()) {
    assert.match(path, /^[a-zA-Z0-9_./-]+$/);
    const sql = await portableInstallSql(path);
    assert.ok(sql.trim(), `empty draft install step: ${path}`);
    steps.push(`-- Draft step ${index + 1}/${files.length}: ${path}\n${sql.trim()}\n`);
  }
  return `-- REVIEW ONLY. Fresh synthetic database candidate, not a migration or approval to apply.
-- Do not run against a hosted project or one containing any application data.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
${preflight}
${steps.join("\n")}
${postflight}
${futureObjectAclProbe}
COMMIT;
`;
}

if (process.argv[1]?.endsWith("/portable-install-candidate.mjs")) {
  assert.deepEqual(process.argv.slice(2), ["--emit-review-sql"]);
  process.stdout.write(await buildPortableInstallCandidate());
}
