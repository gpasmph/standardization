// Usage: node --env-file=.env scripts/create-user.mjs <email> <password> <prod|qa> ["Full Name"]
import { createClient } from '@supabase/supabase-js';

const [email, password, role, name = ''] = process.argv.slice(2);
if (!email || !password || !['prod', 'qa'].includes(role)) {
  console.error('Usage: create-user.mjs <email> <password> <prod|qa> ["Full Name"]'); process.exit(1);
}
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
if (error) { console.error('Create failed:', error.message); process.exit(1); }
const { error: e2 } = await sb.from('profiles').upsert({ id: data.user.id, email, full_name: name, role });
if (e2) { console.error('Profile failed:', e2.message); process.exit(1); }
console.log(`Created ${role} user ${email}`);
