/** Owner-neutral public catalog fingerprints; never reads application rows. */
export const guestCatalogQueries = {
  roles: `SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls
    FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')`,
  relations: `SELECT c.relname,c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,
    c.relreplident,c.reloptions,c.relowner=(SELECT relowner FROM pg_class WHERE oid='public.events'::regclass) AS same_owner
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'`,
  columns: `SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,
    a.attcollation::regcollation::text AS collation,
    a.attgenerated,a.attidentity,pg_get_expr(d.adbin,d.adrelid) AS default_expression
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped`,
  // PG18 adds NOT NULL entries to pg_constraint. attnotnull above already
  // checks that invariant consistently across supported server versions.
  constraints: `SELECT c.relname,con.conname,con.convalidated,pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND con.contype <> 'n'`,
  indexes: `SELECT c.relname AS table_name,idx.relname AS index_name,pg_get_indexdef(i.indexrelid) AS definition,
    i.indisvalid,i.indisready,i.indislive
    FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_class idx ON idx.oid=i.indexrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'`,
  triggers: `SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal`,
  policies: `SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public'`,
  routines: `SELECT p.proname,oidvectortypes(p.proargtypes) AS arguments,md5(pg_get_functiondef(p.oid)) AS definition,
    p.prosecdef,p.proconfig,p.proowner=(SELECT relowner FROM pg_class WHERE oid='public.events'::regclass) AS same_owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'`,
  types: `SELECT t.typname,t.typtype,t.typcategory,format_type(t.typbasetype,t.typtypmod) AS base_type,
    (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid) AS labels
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'`,
  tablePrivileges: `SELECT c.relname,role_name,privilege_name,has_table_privilege(role_name,c.oid,privilege_name) AS allowed
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) AS role_name
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS privilege_name
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')`,
  columnPrivileges: `SELECT c.relname,a.attname,role_name,privilege_name,
    has_column_privilege(role_name,c.oid,a.attname,privilege_name) AS allowed
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) AS role_name
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) AS privilege_name
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped`,
  routinePrivileges: `SELECT p.proname,oidvectortypes(p.proargtypes) AS arguments,role_name,
    has_function_privilege(role_name,p.oid,'EXECUTE') AS allowed
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) AS role_name WHERE n.nspname='public'`,
  defaultPrivileges: `SELECT coalesce(n.nspname,'<global>') AS scope,d.defaclobjtype,x.privilege_type,x.is_grantable,
    CASE WHEN x.grantee=d.defaclrole THEN '<install-owner>' WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee,
    CASE WHEN x.grantor=d.defaclrole THEN '<install-owner>' ELSE pg_get_userbyid(x.grantor) END AS grantor
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) x
    WHERE d.defaclrole=(SELECT relowner FROM pg_class WHERE oid='public.events'::regclass)
      AND (d.defaclnamespace=0 OR n.nspname='public')`,
  directPrivileges: `SELECT object_name,grantee,grantor,privilege_type,is_grantable FROM (
    SELECT 'relation:'||c.relname AS object_name,
      CASE WHEN x.grantee=c.relowner THEN '<install-owner>' WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee,
      CASE WHEN x.grantor=c.relowner THEN '<install-owner>' ELSE pg_get_userbyid(x.grantor) END AS grantor,x.privilege_type,x.is_grantable
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) x WHERE n.nspname='public'
    UNION ALL
    SELECT 'column:'||c.relname||'.'||a.attname,
      CASE WHEN x.grantee=c.relowner THEN '<install-owner>' WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
      CASE WHEN x.grantor=c.relowner THEN '<install-owner>' ELSE pg_get_userbyid(x.grantor) END,x.privilege_type,x.is_grantable
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
    UNION ALL
    SELECT 'routine:'||p.proname||'('||oidvectortypes(p.proargtypes)||')',
      CASE WHEN x.grantee=p.proowner THEN '<install-owner>' WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
      CASE WHEN x.grantor=p.proowner THEN '<install-owner>' ELSE pg_get_userbyid(x.grantor) END,x.privilege_type,x.is_grantable
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl) x WHERE n.nspname='public'
    ) acl`,
};

export function guestCatalogFingerprintSql() {
  return (
    "SELECT jsonb_build_object(" +
    Object.entries(guestCatalogQueries)
      .map(
        ([name, query]) =>
          `'${name}',(SELECT md5(coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text COLLATE "C")::text,'[]')) FROM (${query}) row)`,
      )
      .join(",\n") +
    ") AS fingerprints"
  );
}
