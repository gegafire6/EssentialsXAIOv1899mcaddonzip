// Persistent clan rules. Existing members/owner/officers/tag/home fields remain compatible.
const copy = value => JSON.parse(JSON.stringify(value));
export const clanRole = (c, id) => c.owner === id ? 'Leader' : (c.officers ?? []).includes(id) ? 'Officer' : 'Member';
const integer = value => Number.isSafeInteger(value) && value >= 0;
const fail = text => { throw new Error(text); };
let serial = 0;
export class Clans {
  constructor(api) { this.api = api; this.table = api.table; }
  of(pid) { return this.table.entries().map(([id, c]) => ({ id, c })).find(m => m.c.members.includes(pid)); }
  ref(m) { return { id: m.id, instance: m.c.instance ?? `legacy:${m.c.created ?? ''}` }; }
  find(query) {
    const q = String(query ?? '').trim().toLowerCase();
    return this.table.entries().map(([id, c]) => ({ id, c })).find(m => [m.id, m.c.tag, m.c.name].some(v => String(v).toLowerCase() === q));
  }
  member(p, expected, rank = 'Member') {
    this.api.access(p);
    const m = this.of(p.id);
    if (!m) fail("You're not in a clan.");
    if (expected && (m.id !== expected.id || this.ref(m).instance !== expected.instance)) fail('Clan changed. Reopen the menu.');
    const r = clanRole(m.c, p.id);
    if (rank === 'Leader' && r !== 'Leader' || rank === 'Officer' && r === 'Member') fail(`${rank} permission required.`);
    return { id: m.id, c: copy(m.c) };
  }
  save(m) { this.table.set(m.id, m.c); return m; }
  validName(name, except) {
    name = String(name ?? '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{2,19}$/.test(name)) fail('Name: 3-20 letters, numbers, spaces, _ or -.');
    if (this.table.entries().some(([id,c]) => id !== except && [c.name,c.tag].some(value => value.toLowerCase() === name.toLowerCase()))) fail('Clan name taken.');
    return name;
  }
  create(p, name, tag) {
    this.api.access(p);
    if (this.of(p.id)) fail("You're already in a clan.");
    name = this.validName(name);
    if (!tag) {
      const base = name.replace(/[^a-z0-9]/gi, '').toUpperCase();
      tag = base.slice(0,5).padEnd(2,'X');
      for (let i=1; this.find(tag); i++) { if (i > 999) fail('Specify an unused tag.'); tag = base.slice(0,2).padEnd(2,'X') + i; }
    }
    tag = String(tag).toUpperCase();
    if (!/^[A-Z0-9]{2,5}$/.test(tag)) fail('Tag: 2-5 letters/numbers.');
    if (this.find(tag) || this.table.entries().some(([,c]) => c.tag.toUpperCase() === name.toUpperCase())) fail('Clan name or tag taken.');
    const cost = this.api.admin(p) ? 0 : this.api.config().createCost;
    if (!integer(cost)) fail('Invalid clan creation cost.');
    const balance = cost ? this.money(p.id) : 0;
    if (cost > balance) fail('Not enough money to create a clan.');
    const m = { id: tag.toLowerCase(), c: { name, tag, color:'§b', owner:p.id, officers:[], members:[p.id], bank:0, kills:0, created:this.api.now(), instance:`${this.api.now()}:${++serial}`, open:false, invites:{}, allies:[], enemies:[], requests:{} } };
    if (cost) this.api.setBalance(p.id, balance-cost);
    try { return this.save(m); } catch(e) { if (cost) this.api.setBalance(p.id,balance); throw e; }
  }
  invite(p, target, expected) {
    const m = this.member(p,expected,'Officer');
    if (!target || this.of(target.id)) fail('Player unavailable or already in a clan.');
    if (m.c.members.length >= this.api.config().maxMembers) fail('Clan is full.');
    m.c.invites = Object.fromEntries(Object.entries(m.c.invites ?? {}).filter(([,expires]) => expires > this.api.now()));
    m.c.invites[target.id] = this.api.now() + this.api.config().inviteSeconds*1000;
    return this.save(m);
  }
  pending(pid) { return this.table.entries().map(([id,c])=>({id,c})).filter(m => (m.c.invites?.[pid] ?? 0) > this.api.now()); }
  join(p, query, expected) {
    this.api.access(p);
    if (this.of(p.id)) fail('Leave your clan first.');
    const pending = this.pending(p.id);
    const m = query ? this.find(query) : pending.length === 1 ? pending[0] : undefined;
    if (!m) fail('Choose a clan name/tag; no unique pending invite.');
    if (expected && (m.id !== expected.id || this.ref(m).instance !== expected.instance)) fail('Clan changed. Reopen the menu.');
    const c = copy(m.c);
    if (!c.open && !(c.invites?.[p.id] > this.api.now())) fail('Invite required or expired.');
    if (c.members.length >= this.api.config().maxMembers) fail('Clan is full.');
    c.members.push(p.id); if(c.invites) delete c.invites[p.id];
    return this.save({id:m.id,c});
  }
  remove(p, tid, expected) {
    const m = this.member(p,expected,tid === p.id ? 'Member' : 'Officer');
    if (!m.c.members.includes(tid) || tid === m.c.owner) fail('Leader must transfer leadership or disband.');
    if (tid !== p.id && clanRole(m.c,p.id) !== 'Leader' && clanRole(m.c,tid) !== 'Member') fail('Officers cannot kick other officers.');
    m.c.members = m.c.members.filter(id=>id!==tid); m.c.officers = (m.c.officers??[]).filter(id=>id!==tid);
    return this.save(m);
  }
  rank(p, tid, op, expected) {
    const m = this.member(p,expected,'Leader');
    if (!m.c.members.includes(tid) || tid === p.id) fail('Choose another clan member.');
    m.c.officers = (m.c.officers??[]).filter(id=>id!==tid && id!==p.id);
    if (op === 'promote') m.c.officers.push(tid);
    else if (op === 'transfer') m.c.owner = tid;
    else if (op !== 'demote') fail('Unknown rank action.');
    return this.save(m);
  }
  settings(p, changes, expected) {
    const m = this.member(p,expected,'Leader');
    if (changes.name !== undefined) m.c.name = this.validName(changes.name,m.id);
    if (changes.open !== undefined) m.c.open = !!changes.open;
    if (changes.color !== undefined && /^§[0-9a-f]$/.test(changes.color)) m.c.color = changes.color;
    return this.save(m);
  }
  sethome(p, home, expected) { const m = this.member(p,expected,'Officer'); m.c.home = copy(home); return this.save(m); }
  money(pid) { if (!this.api.economy()) fail('Economy is disabled.'); const value=this.api.balance(pid); if(!integer(value)) fail('Invalid account balance.'); return value; }
  bank(p, input, withdraw, expected) {
    const m = this.member(p,expected,withdraw?'Leader':'Member');
    if (!/^[1-9]\d*$/.test(String(input))) fail('Enter a positive whole amount.');
    const amount=Number(input), bank=m.c.bank??0, balance=this.money(p.id);
    if (!integer(amount) || !integer(bank)) fail('Invalid or excessive amount.');
    const nextBank=bank+(withdraw?-amount:amount), nextBalance=balance+(withdraw?amount:-amount);
    if (!integer(nextBank) || !integer(nextBalance)) fail('Insufficient funds or balance limit.');
    m.c.bank=nextBank;
    this.api.setBalance(p.id,nextBalance);
    try { return this.save(m); } catch(e) { this.api.setBalance(p.id,balance); throw e; }
  }
  relation(p, query, op, expected) {
    const m=this.member(p,expected,'Leader'), found=this.find(query);
    if(!found || found.id===m.id) fail('Choose another clan.');
    const t={id:found.id,c:copy(found.c)};
    for(const x of [m,t]) { x.c.allies??=[]; x.c.enemies??=[]; x.c.requests=Object.fromEntries(Object.entries(x.c.requests??{}).filter(([,r])=>r.expires>this.api.now())); }
    if(op==='ally') {
      const request=m.c.requests[t.id];
      if(request?.instance===this.ref(t).instance && request.expires>this.api.now()) {
        for(const [a,b] of [[m,t],[t,m]]) {
          a.c.allies=[...new Set([...a.c.allies,b.id])]; a.c.enemies=a.c.enemies.filter(id=>id!==b.id); delete a.c.requests[b.id];
        }
      } else {
        t.c.requests[m.id]={instance:this.ref(m).instance,expires:this.api.now()+this.api.config().inviteSeconds*1000};
      }
    } else if(op==='enemy' || op==='neutral') {
      for(const [a,b] of [[m,t],[t,m]]) {
        a.c.allies=a.c.allies.filter(id=>id!==b.id); delete a.c.requests[b.id];
        a.c.enemies=a.c.enemies.filter(id=>id!==b.id); if(op==='enemy') a.c.enemies.push(b.id);
      }
    } else fail('Use ally, enemy or neutral.');
    this.save(t); return this.save(m);
  }
  allied(a,b) { return !!(a && b && a.c.allies?.includes(b.id) && b.c.allies?.includes(a.id)); }
  protected(a,b) { const x=this.of(a),y=this.of(b); return !!(x && y && (x.id===y.id ? !this.api.config().friendlyFire : this.allied(x,y))); }
  disband(p, expected, admin=false) {
    this.api.access(p);
    const found = admin ? this.table.get(expected.id) : this.member(p,expected,'Leader').c;
    if(!found || admin && !this.api.adminAccess(p)) fail('Permission expired.');
    const m={id:expected.id,c:found};
    if(this.ref(m).instance!==expected.instance) fail('Clan changed. Reopen the menu.');
    const bank=found.bank??0;
    if(!integer(bank)) fail('Invalid clan balance.');
    const balance=bank?this.money(found.owner):0;
    if(!integer(balance+bank)) fail('Leader balance limit. Withdraw funds first.');
    if(bank) this.api.setBalance(found.owner,balance+bank);
    try { this.table.delete(m.id); } catch(e) { if(bank)this.api.setBalance(found.owner,balance); throw e; }
    for(const [id,c] of this.table.entries()) {
      const next=copy(c); next.allies=(next.allies??[]).filter(x=>x!==m.id); next.enemies=(next.enemies??[]).filter(x=>x!==m.id);
      if(next.requests)delete next.requests[m.id]; this.table.set(id,next);
    }
    return m;
  }
}
