const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('../backend/node_modules/pg');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/rls-etapa3');
const pgBin = path.join(output, 'pg17/pgsql/bin');
const localName = /^bovitrack_stage3_(legacy|restore)_[0-9]+_[a-f0-9]{6}$/;
const ident = value => '"' + value.replaceAll('"', '""') + '"';
const postgresEnv = (base, settings) => ({
  ...Object.fromEntries(Object.entries(base).filter(([key]) => !/^PG/i.test(key))), ...settings,
});

async function localClient(database) {
  assert.ok(database === 'postgres' || localName.test(database));
  const client = new Client({ host: '127.0.0.1', port: 55441, user: 'postgres', database,
    ssl: false, connectionTimeoutMillis: 5000, query_timeout: 30000 });
  await client.connect();
  await attestLocal(client, database, database !== 'postgres');
  return client;
}

async function attestLocal(client, expectedDatabase, requireMarker = true) {
  const expected = JSON.parse(fs.readFileSync(path.join(output, 'local-cluster.json'), 'utf8'));
  const { rows: [r] } = await client.query(`SELECT current_database() AS database,
    (pg_control_system()).system_identifier::text AS system_identifier,
    current_setting('server_version') AS version,inet_server_port() AS port,
    shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()`);
  assert.equal(r.system_identifier, expected.system_identifier, 'Cluster local inesperado');
  assert.equal(r.version, '17.6'); assert.equal(r.port, 55441); assert.equal(r.database, expectedDatabase);
  if (requireMarker) assert.equal(r.marker, 'bovitrack-stage3:' + expectedDatabase);
}

async function createLocalDatabase(database, { template } = {}) {
  assert.match(database, localName);
  if (template) assert.match(template, localName);
  const admin = await localClient('postgres');
  try {
    await attestLocal(admin, 'postgres', false);
    await admin.query('CREATE DATABASE ' + ident(database) + (template ? ' TEMPLATE ' + ident(template) : ''));
  } finally { await admin.end(); }
  const client = new Client({ host: '127.0.0.1', port: 55441, user: 'postgres', database, ssl: false });
  await client.connect();
  await attestLocal(client, database, false);
  await client.query('COMMENT ON DATABASE ' + ident(database) + " IS 'bovitrack-stage3:" + database + "'");
  return client;
}

async function writeLocal(client, database, sql, params) {
  assert.match(database, localName);
  await attestLocal(client, database);
  return client.query(sql, params);
}

async function fingerprint(client) {
  await client.query("SET TIME ZONE 'UTC'");
  const tables = (await client.query(`SELECT n.nspname AS schema,c.relname AS name FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','bovitrack_seg')
    AND c.relkind='r' ORDER BY n.nspname,c.relname`)).rows;
  const data = [];
  for (const t of tables) {
    const { rows: [r] } = await client.query('SELECT count(*)::int AS count,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,\'[]\')) AS digest FROM ' + ident(t.schema) + '.' + ident(t.name) + ' t');
    data.push({ table: t.schema + '.' + t.name, ...r });
  }
  return data;
}

async function securitySnapshot(client) {
  return (await client.query(`SELECT jsonb_build_object(
    'tables',(SELECT jsonb_agg(to_jsonb(x) ORDER BY relname) FROM
      (SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,pg_get_userbyid(c.relowner) AS owner
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r') x),
    'policies',(SELECT jsonb_agg(to_jsonb(x) ORDER BY tablename,policyname) FROM
      (SELECT * FROM pg_policies WHERE schemaname='public') x),
    'defaults',(SELECT jsonb_agg(to_jsonb(x) ORDER BY role,schema,type) FROM
      (SELECT pg_get_userbyid(d.defaclrole) AS role,n.nspname AS schema,d.defaclobjtype AS type,d.defaclacl::text
       FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname IN ('public','bovitrack_seg')) x),
    'columns',(SELECT jsonb_agg(to_jsonb(x) ORDER BY relname,attname) FROM
      (SELECT c.relname,a.attname,a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attacl IS NOT NULL) x)
  ) AS state`)).rows[0].state;
}

module.exports = { root, output, pgBin, ident, localName, localClient, attestLocal,
  createLocalDatabase, writeLocal, fingerprint, securitySnapshot, postgresEnv };
