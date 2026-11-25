import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm'
import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_NAME, HEURE_LIMITE } from './config.js'

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
let hashType = new URLSearchParams(location.hash.slice(1)).get('type')
const $ = s => document.querySelector(s)
const app = $('#app')
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const nowP = () => new Date().toLocaleString('sv', { timeZone: 'Europe/Paris' })
const today = () => nowP().slice(0, 10)
const shift = (m, n) => { const d = new Date(m + 'T12:00'); d.setMonth(d.getMonth() + n); return d.toLocaleDateString('sv').slice(0, 8) + '01' }
const daysOf = m => { const d = new Date(m + 'T12:00'), mo = d.getMonth(), out = []; while (d.getMonth() === mo) { out.push(d.toLocaleDateString('sv')); d.setDate(d.getDate() + 1) } return out }
const fmt = (d, o) => new Date(d + 'T12:00').toLocaleDateString('fr-FR', o)
const name = x => x.profiles?.full_name || '?'
const st = { me: null, tab: null, month: today().slice(0, 8) + '01', day: today(), q: '' }

const TABS = {
  client: [['cal', 'Mes dîners']],
  admin: [['pointage', 'Pointage'], ['mois', 'Mois'], ['camp', 'Campagne'], ['cal', 'Mes dîners']],
}
TABS.creator = [...TABS.admin, ['equipe', 'Équipe']]

// ---------- Écrans de connexion ----------
const loginHtml = (msg = '') => `<div class="box"><h2>${APP_NAME}</h2><p class="discret">${msg}</p>
  <input id="email" type="email" placeholder="E-mail" autocomplete="username">
  <input id="pwd" type="password" placeholder="Mot de passe" autocomplete="current-password">
  <button data-act="login">Se connecter</button></div>`
const pwdHtml = () => `<div class="box"><h2>Bienvenue</h2><p>Choisissez votre mot de passe.</p>
  <input id="pwd" type="password" placeholder="Nouveau mot de passe (8 caractères min.)" autocomplete="new-password">
  <button data-act="setpwd">Enregistrer</button></div>`

async function boot() {
  const { data: { session } } = await sb.auth.getSession()
  if (!session) return (app.innerHTML = loginHtml())
  if (hashType === 'invite' || hashType === 'recovery') return (app.innerHTML = pwdHtml())
  const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).single()
  if (!data?.active) { await sb.auth.signOut(); return (app.innerHTML = loginHtml('Compte désactivé ou introuvable.')) }
  st.me = data
  sb.channel('rt').on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => st.tab === 'pointage' && render()).subscribe()
  render()
}

async function render() {
  const tabs = TABS[st.me.role]
  if (!tabs.some(t => t[0] === st.tab)) st.tab = tabs[0][0]
  const body = await VIEWS[st.tab]()
  app.innerHTML = `<header><img class="logo" src="assets/logo.png" alt="" onerror="this.remove()"><h1>${APP_NAME}</h1>
    <button class="ghost" data-act="logout">Quitter</button></header>
    <nav>${tabs.map(([id, l]) => `<button class="${id === st.tab ? 'on' : ''}" data-act="tab" data-id="${id}">${l}</button>`).join('')}</nav>
    <main>${body}</main>`
  filt()
}
const filt = () => document.querySelectorAll('[data-n]').forEach(el => (el.hidden = !el.dataset.n.includes(st.q.toLowerCase())))
const monthNav = () => `<div class="centre"><button class="ghost" data-act="month" data-n="-1">‹</button><strong>${fmt(st.month, { month: 'long', year: 'numeric' })}</strong><button class="ghost" data-act="month" data-n="1">›</button></div>`
const range = days => [days[0], days.at(-1)]

// ---------- Vues ----------
const VIEWS = {
  async cal() {
    const days = daysOf(st.month), [a, z] = range(days)
    const [c, r, cl] = await Promise.all([
      sb.from('campaigns').select('*').eq('month', st.month).maybeSingle(),
      sb.from('reservations').select('*').eq('user_id', st.me.id).gte('day', a).lte('day', z),
      sb.from('closed_days').select('day').gte('day', a).lte('day', z)])
    st.res = Object.fromEntries(r.data.map(x => [x.day, x]))
    const closed = new Set(cl.data.map(x => x.day)), t = today(), h = +nowP().slice(11, 13)
    const open = c.data?.status === 'open' && new Date() < new Date(c.data.deadline)
    const banner = !c.data ? 'Aucune campagne pour ce mois.' : open
      ? `Campagne ouverte jusqu'au ${new Date(c.data.deadline).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}.`
      : `Campagne terminée : vous pouvez seulement décocher, jusqu'à ${HEURE_LIMITE}h le jour même.`
    const cells = Array((new Date(st.month + 'T12:00').getDay() + 6) % 7).fill('<span class="jour vide"></span>')
    for (const d of days) {
      const on = st.res[d] && !st.res[d].cancelled_at
      const can = closed.has(d) ? false : on ? (d > t || (d === t && h < HEURE_LIMITE)) : (open && d > t)
      cells.push(`<button class="jour ${on ? 'on' : ''} ${closed.has(d) ? 'ferme' : ''} ${can ? '' : 'locked'}" ${can ? `data-act="toggle" data-day="${d}"` : ''}
        title="${closed.has(d) ? 'Pas de repas' : ''}">${+d.slice(8)}</button>`)
    }
    const n = Object.values(st.res).filter(x => !x.cancelled_at).length
    return `${monthNav()}<div class="bandeau">${banner}</div><div class="grille">${cells.join('')}</div>
      <p class="discret">${n} dîner${n > 1 ? 's' : ''} réservé${n > 1 ? 's' : ''} ce mois-ci.</p>`
  },

  async pointage() {
    const [r, p, s] = await Promise.all([
      sb.from('reservations').select('id,user_id,picked_up_at,profiles!user_id(full_name)').eq('day', st.day).is('cancelled_at', null),
      sb.from('profiles').select('id,full_name').eq('active', true).order('full_name'),
      sb.from('services').select('closed_at').eq('day', st.day).maybeSingle()])
    const rows = r.data.sort((x, y) => name(x).localeCompare(name(y)))
    const left = rows.filter(x => !x.picked_up_at), done = rows.filter(x => x.picked_up_at)
    const booked = new Set(rows.map(x => x.user_id))
    return `<input type="date" id="dpick" value="${st.day}">
      <div class="compteur">${left.length} restant${left.length > 1 ? 's' : ''}<small>sur ${rows.length} réservés</small></div>
      <input id="q" placeholder="Rechercher un nom" value="${esc(st.q)}">
      ${left.map(x => `<div class="ligne" data-n="${esc(name(x).toLowerCase())}"><span>${esc(name(x))}</span><button data-act="pick" data-id="${x.id}">Est passé</button></div>`).join('') || '<p class="discret">Personne en attente.</p>'}
      <h3>Déjà passés (${done.length})</h3>
      ${done.map(x => `<div class="ligne" data-n="${esc(name(x).toLowerCase())}"><span>${esc(name(x))} <span class="discret">${new Date(x.picked_up_at).toLocaleTimeString('fr-FR', { timeStyle: 'short' })}</span></span><button class="ghost" data-act="unpick" data-id="${x.id}">Annuler</button></div>`).join('')}
      <h3>Ajout sur place</h3>
      <div class="ligne"><select id="who"><option value="">Choisir…</option>${p.data.filter(u => !booked.has(u.id)).map(u => `<option value="${u.id}">${esc(u.full_name)}</option>`).join('')}</select><button data-act="addsite">Ajouter</button></div>
      ${s.data?.closed_at ? '<p class="discret">Service clôturé.</p>' : '<button class="ghost" data-act="endservice">Clôturer le service</button>'}`
  },

  async mois() {
    const days = daysOf(st.month), [a, z] = range(days)
    const [r, cl, cp] = await Promise.all([
      sb.from('reservations').select('user_id,day,picked_up_at').is('cancelled_at', null).gte('day', a).lte('day', z),
      sb.from('closed_days').select('day').gte('day', a).lte('day', z),
      sb.from('profiles').select('id', { count: 'exact', head: true }).eq('active', true).eq('role', 'client')])
    const closed = new Set(cl.data.map(x => x.day)), by = {}
    r.data.forEach(x => (by[x.day] ??= []).push(x))
    const rep = new Set(r.data.map(x => x.user_id)).size
    return `${monthNav()}<div class="bandeau">${rep} personne(s) ont répondu, sur ${cp.count ?? 0} client(s) actifs.</div>
      ${days.map(d => `<div class="ligne"><span>${fmt(d, { weekday: 'long', day: 'numeric' })}</span>
        <strong>${closed.has(d) ? 'fermé' : (by[d]?.length ?? 0)}</strong>
        <button class="ghost" data-act="closeday" data-day="${d}" data-closed="${closed.has(d) ? 1 : 0}">${closed.has(d) ? 'Rouvrir' : 'Fermer'}</button></div>`).join('')}`
  },

  async camp() {
    const { data } = await sb.from('campaigns').select('*').order('month', { ascending: false })
    return `<h3>Lancer une campagne</h3>
      <p class="discret">Mois concerné, puis date limite de saisie.</p>
      <input id="cm" type="month"><input id="cd" type="datetime-local">
      <button data-act="campaign">Lancer la campagne</button>
      <h3>Campagnes</h3>${data.map(c => `<div class="ligne"><span>${fmt(c.month, { month: 'long', year: 'numeric' })} <span class="discret">${c.status === 'open' ? 'jusqu\'au ' + new Date(c.deadline).toLocaleDateString('fr-FR') : 'clôturée'}</span></span>
        ${c.status === 'open' ? `<button class="ghost" data-act="closecamp" data-day="${c.month}">Clôturer</button>` : ''}</div>`).join('')}`
  },

  async equipe() {
    const [p, r] = await Promise.all([
      sb.from('profiles').select('*').order('full_name'),
      sb.from('reservations').select('user_id').is('cancelled_at', null).is('picked_up_at', null).lt('day', today())])
    const miss = {}; r.data.forEach(x => (miss[x.user_id] = (miss[x.user_id] || 0) + 1))
    return `<h3>Inviter quelqu'un</h3>
      <input id="ie" type="email" placeholder="E-mail"><input id="in" placeholder="Nom complet">
      <select id="ir"><option value="client">Client</option><option value="admin">Admin</option></select>
      <button data-act="invite">Envoyer l'invitation</button>
      <h3>Comptes</h3>${p.data.map(u => `<div class="ligne"><span>${esc(u.full_name)}<br><span class="discret">${miss[u.id] || 0} non-retrait(s)</span></span>
        <select data-uid="${u.id}" data-f="role">${['client', 'admin', 'creator'].map(o => `<option ${o === u.role ? 'selected' : ''}>${o}</option>`).join('')}</select>
        <label><input type="checkbox" style="width:auto" data-uid="${u.id}" data-f="active" ${u.active ? 'checked' : ''}> actif</label></div>`).join('')}`
  },
}

// ---------- Actions ----------
const now = () => new Date().toISOString()
const fail = ({ error }) => error && alert(error.message)
const ACT = {
  async login() { const { error } = await sb.auth.signInWithPassword({ email: $('#email').value, password: $('#pwd').value }); if (error) return alert('E-mail ou mot de passe incorrect.'); await boot() },
  async setpwd() { const { error } = await sb.auth.updateUser({ password: $('#pwd').value }); if (error) return alert(error.message); hashType = null; history.replaceState(null, '', location.pathname); await boot() },
  async logout() { await sb.auth.signOut(); location.reload() },
  tab: b => (st.tab = b.dataset.id),
  month: b => (st.month = shift(st.month, +b.dataset.n)),
  async toggle(b) {
    const x = st.res[b.dataset.day], on = x && !x.cancelled_at, t = sb.from('reservations')
    fail(await (on ? t.update({ cancelled_at: now() }).eq('id', x.id) : x ? t.update({ cancelled_at: null }).eq('id', x.id) : t.insert({ user_id: st.me.id, day: b.dataset.day })))
  },
  async pick(b) { fail(await sb.from('reservations').update({ picked_up_at: now(), validated_by: st.me.id }).eq('id', b.dataset.id)) },
  async unpick(b) { fail(await sb.from('reservations').update({ picked_up_at: null, validated_by: null }).eq('id', b.dataset.id)) },
  async addsite() {
    const uid = $('#who').value; if (!uid) return
    fail(await sb.from('reservations').upsert({ user_id: uid, day: st.day, cancelled_at: null, picked_up_at: now(), validated_by: st.me.id, added_by: st.me.id }, { onConflict: 'user_id,day' }))
  },
  async endservice() { fail(await sb.from('services').upsert({ day: st.day, closed_at: now() })) },
  async closeday(b) { const t = sb.from('closed_days'); fail(await (b.dataset.closed === '1' ? t.delete().eq('day', b.dataset.day) : t.insert({ day: b.dataset.day }))) },
  async campaign() {
    const m = $('#cm').value, d = $('#cd').value; if (!m || !d) return alert('Choisissez un mois et une date limite.')
    fail(await sb.from('campaigns').upsert({ month: m + '-01', deadline: new Date(d).toISOString(), status: 'open' }))
  },
  async closecamp(b) { fail(await sb.from('campaigns').update({ status: 'closed' }).eq('month', b.dataset.day)) },
  async invite() {
    const { error } = await sb.functions.invoke('invite-user', { body: { email: $('#ie').value, full_name: $('#in').value, role: $('#ir').value } })
    alert(error ? 'Échec : ' + error.message : 'Invitation envoyée.')
  },
}

app.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return
  b.disabled = true
  await ACT[b.dataset.act](b)
  if (st.me) await render()
})
app.addEventListener('input', e => { if (e.target.id === 'q') { st.q = e.target.value; filt() } })
app.addEventListener('change', async e => {
  const t = e.target
  if (t.id === 'dpick') { st.day = t.value || today(); return render() }
  if (!t.dataset.uid) return
  fail(await sb.from('profiles').update({ [t.dataset.f]: t.type === 'checkbox' ? t.checked : t.value }).eq('id', t.dataset.uid))
})

boot()
