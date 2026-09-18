import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Explicitly creates only isolated, fictitious video-demo accounts and data.
// Generated credentials stay local, ignored by Git, with owner-only access.
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const file = '.video-demo.local.json';
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { run: crypto.randomBytes(5).toString('hex'), accounts: {} };
const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
async function account(role) {
  const c = client();
  let a = state.accounts[role];
  if (!a) { a = {email:`a26.video.${state.run}.${role}@example.com`,password:crypto.randomBytes(24).toString('base64url')}; state.accounts[role]=a; save(); }
  let res = await c.auth.signInWithPassword(a);
  if (res.error) res = await c.auth.signUp({...a, options:{data:{full_name:`Démo A26 ${role}`}}});
  if(res.error) throw new Error(`${role}: ${res.error.message}`);
  if(!res.data.session) throw new Error(`${role}: confirmation e-mail requise`);
  a.id=res.data.user.id; save();
  console.log(`Compte ${role} prêt`);
  return c;
}
const admin=await account('admin_rh');
if(!state.org_id){
  const {data,error}=await admin.rpc('create_demo_org',{p_kind:'pme'});
  if(error) throw new Error(`Création démo: ${error.message}`);
  state.org_id=data;save();
  console.log('Organisation fictive créée');
}
for(const role of ['manager','employee','approveur_paie']){
  const c=await account(role);
  if(!state.accounts[role].joined){
    const code=`A26-VIDEO-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    const {error:ie}=await admin.from('org_invites').insert({org_id:state.org_id,code,role,created_by:state.accounts.admin_rh.id});
    if(ie)throw new Error(`Invitation ${role}: ${ie.message}`);
    const {error:re}=await c.rpc('redeem_invite',{p_code:code});
    if(re)throw new Error(`Adhésion ${role}: ${re.message}`);
    state.accounts[role].joined=true;save();
  }
}
const {data:employees,error:ee}=await admin.from('employees').select('id,employee_number,user_id').eq('org_id',state.org_id).order('employee_number');
if(ee)throw new Error(ee.message);
for(const role of ['employee','manager']){
  const a=state.accounts[role];
  if(a.employee_id)continue;
  const e=employees.find(e=>!e.user_id);
  if(!e)throw new Error('Aucune fiche disponible');
  const {error}=await admin.from('employees').update({email:a.email,user_id:a.id}).eq('id',e.id).eq('org_id',state.org_id);
  if(error)throw new Error(`Rattachement ${role}: ${error.message}`);
  e.user_id=a.id;a.employee_id=e.id;a.employee_number=e.employee_number;save();
}
console.log(`Préparation terminée : ${employees.length} salariés, quatre comptes. Identifiants conservés dans ${file}, non affichés.`);
