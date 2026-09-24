import { PGlite } from '../.consent-tests/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Runs real Mine schema migrations and the real application policies/trigger.
// Only the surrounding Supabase auth and EM user/opportunity tables are fixtures.
const mine = process.env.MINE_SOURCE ?? 'C:/Users/Owner/.codex/worktrees/1eba/Mine';
const db = new PGlite();
const migration = async (folder, prefix) => {
  const name = (await readdir(folder)).find(name => name.startsWith(prefix + '_'));
  assert.ok(name, `missing migration ${prefix}`);
  await db.exec(await readFile(path.join(folder, name), 'utf8'));
};
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE SCHEMA auth; CREATE SCHEMA private;
  CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE TABLE public.users(id uuid PRIMARY KEY REFERENCES auth.users(id), role text, status text);
  CREATE TABLE public.opportunities(id uuid PRIMARY KEY, posted_by uuid, title varchar(200), side text,
    contract_type varchar(20), status text, unpublished_by_admin boolean DEFAULT false, deleted_at timestamptz);
  CREATE TABLE public.company_profiles(id uuid PRIMARY KEY, company_name varchar(200));
  CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
  CREATE FUNCTION private.current_user_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT role FROM public.users WHERE id = auth.uid() AND status = 'ACTIVE' $$;
  CREATE FUNCTION private.current_user_is_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.users WHERE id = auth.uid() AND status = 'ACTIVE') $$;
  GRANT USAGE ON SCHEMA auth, private TO authenticated, anon;
`);
await migration('supabase/migrations', '011');
await db.exec(`ALTER TABLE public.applications ADD COLUMN completed_at timestamptz;
  ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
  CREATE POLICY applications_select_own ON public.applications FOR SELECT TO authenticated USING (true);
  CREATE POLICY applications_select_poster ON public.applications FOR SELECT TO authenticated USING (true);
  CREATE POLICY applications_insert_own ON public.applications FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY applications_update_withdraw ON public.applications FOR UPDATE TO authenticated USING (true);
  CREATE POLICY applications_update_poster ON public.applications FOR UPDATE TO authenticated USING (true);
`);
await migration('supabase/migrations', '068');
for (const prefix of ['083', '086', '087', '088', '092', '093', '098']) {
  await migration(path.join(mine, 'supabase/migrations'), prefix);
}
await db.exec('GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated');
await migration('supabase/migrations', '099');

const ids = Array.from({length: 6}, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const [engineer, mineUser, company, outsider, instructor, otherMine] = ids;
for (const [i, id] of ids.entries()) {
  await db.query('INSERT INTO auth.users VALUES ($1, $2)', [id, `person${i}@example.test`]);
  await db.query("INSERT INTO public.users VALUES ($1, $2, 'ACTIVE')", [id, i === 2 ? 'COMPANY' : i === 4 ? 'INSTRUCTOR' : 'ENGINEER']);
}
await db.query("INSERT INTO public.mine_profiles(user_id, display_name) VALUES ($1, 'Before edit')", [mineUser]);
await db.query("INSERT INTO public.mine_work_experiences(user_id, company_name, description) VALUES ($1, 'Example work', 'Built a service')", [mineUser]);
await db.query("INSERT INTO public.mine_educations(user_id, school_name) VALUES ($1, 'Example school')", [mineUser]);
await db.query('INSERT INTO public.mine_engineer_account_links(mine_user_id, engineer_user_id) VALUES ($1, $2)', [mineUser, engineer]);
await db.query("INSERT INTO public.company_profiles VALUES ($1, 'Hiring company')", [company]);
let count = 0;
async function as(user, sql, params = []) {
  await db.exec('SET ROLE authenticated');
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? '']);
    return (await db.query(sql, params)).rows;
  } finally { await db.exec('RESET ROLE'); }
}
async function rejected(user, sql, params, code) {
  await assert.rejects(as(user, sql, params), e => e.code === code); count++;
}
async function opportunity() {
  const [{id}] = (await db.query("INSERT INTO public.opportunities VALUES (gen_random_uuid(), $1, 'Role', 'ENGINEER', 'employment', 'published', false, null) RETURNING id", [company])).rows;
  return id;
}
async function issue(opp) {
  const [{token}] = await as(engineer, 'SELECT public.create_mine_engineer_application_share_token($1) token', [opp]);
  return token;
}
const preview = 'SELECT * FROM public.get_mine_engineer_application_share_request($1)';
const complete = 'SELECT public.complete_mine_engineer_application_share_request($1, $2, $3) id';
const opp = await opportunity();
const token = await issue(opp);
await rejected(outsider, preview, [token], '22023');
await rejected(null, preview, [token], '22023');
await rejected(mineUser, complete, [token, true, false], '22023');
const [shown] = await as(mineUser, preview, [token]);
assert.equal(shown.documents.rirekisho.content['基本情報']['氏名'], 'Before edit'); count++;
assert.equal(shown.documents.shokumu.content['職務経歴'][0]['職務内容'], 'Built a service'); count++;
await db.query("UPDATE public.mine_profiles SET display_name = 'After edit' WHERE user_id = $1", [mineUser]);
await rejected(engineer, 'INSERT INTO public.applications(opportunity_id, applicant_id) VALUES ($1, $2)', [opp, engineer], '42501');
await rejected(mineUser, complete, [token, null, false], '22023');
const [{id: app}] = await as(mineUser, complete, [token, true, false]);
const [{id: retry}] = await as(mineUser, complete, [token, false, true]);
assert.equal(app, retry); count++;
const [share] = await as(company, 'SELECT * FROM public.application_mine_document_shares WHERE application_id = $1', [app]);
assert.deepEqual(share.rirekisho_snapshot, shown.documents.rirekisho); count++;
assert.equal(share.shokumu_keirekisho_snapshot, null); count++;
assert.equal((await as(outsider, 'SELECT * FROM public.application_mine_document_shares')).length, 0); count++;
assert.equal((await as(engineer, 'SELECT * FROM public.application_mine_document_shares')).length, 1); count++;
await rejected(company, 'UPDATE public.application_mine_document_shares SET shared_rirekisho = false', [], '42501');
await rejected(mineUser, 'SELECT * FROM public.mine_engineer_application_share_requests', [], '42501');
await rejected(mineUser, 'SELECT private.mine_application_documents($1)', [outsider], '42501');
await rejected(engineer, 'SELECT public.create_mine_engineer_application_share_token($1)', [opp], '23505');
await db.query("UPDATE public.users SET status = 'SUSPENDED' WHERE id = $1", [company]);
assert.equal((await as(company, 'SELECT * FROM public.application_mine_document_shares')).length, 0); count++;
await db.query("UPDATE public.users SET status = 'ACTIVE' WHERE id = $1", [company]);
for (const selections of [[false,false], [false,true], [true,true]]) {
  const tok = await issue(await opportunity()); await as(mineUser, preview, [tok]);
  const [{id}] = await as(mineUser, complete, [tok, ...selections]);
  const [row] = await as(company, 'SELECT * FROM public.application_mine_document_shares WHERE application_id = $1', [id]);
  assert.equal(row.rirekisho_snapshot !== null, selections[0]);
  assert.equal(row.shokumu_keirekisho_snapshot !== null, selections[1]); count++;
}
const expired = await issue(await opportunity());
await as(mineUser, preview, [expired]);
await db.query("UPDATE public.mine_engineer_application_share_requests SET expires_at = now() - interval '1 second' WHERE token_digest = md5($1)", [expired]);
await rejected(mineUser, complete, [expired, true, true], '22023');
const closedOpp = await opportunity(), closed = await issue(closedOpp);
await as(mineUser, preview, [closed]);
await db.query("UPDATE public.opportunities SET status = 'closed' WHERE id = $1", [closedOpp]);
await rejected(mineUser, complete, [closed, true, true], '22023');
assert.equal((await db.query('SELECT * FROM public.applications WHERE opportunity_id = $1', [closedOpp])).rows.length, 0); count++;
const replaceOpp = await opportunity(), old = await issue(replaceOpp);
await issue(replaceOpp); await rejected(mineUser, preview, [old], '22023');
const relink = await issue(await opportunity());
await db.query('UPDATE public.mine_engineer_account_links SET mine_user_id = $1 WHERE engineer_user_id = $2', [otherMine, engineer]);
await rejected(otherMine, preview, [relink], '22023');
await rejected(mineUser, preview, [relink], '22023');
// Instructor applications retain their existing path.
const training = await opportunity();
await db.query("UPDATE public.opportunities SET side = 'TRAINING', contract_type = 'training' WHERE id = $1", [training]);
await as(instructor, 'INSERT INTO public.applications(opportunity_id, applicant_id) VALUES ($1, $2)', [training, instructor]); count++;
console.log(`PASS: ${count} consent assertions; real migrations 011, 068, Mine 083/086/087/088/092/093/098, and 099 applied.`);
await db.close();
