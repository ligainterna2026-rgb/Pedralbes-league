const supabaseClient = window.supabase.createClient(
  window.LIGA_SUPABASE.url,
  window.LIGA_SUPABASE.anonKey
);

let authStateUser = null;
let authReady = false;

const LEAGUE_EMAIL = 'ligainterna2026@gmail.com';

const teams = {
  aston:{name:'Aston Birra F.C.',logo:'assets/aston-birra.jpeg',players:[['Nico',true],['Joaquin',false],['José',false],['Ambrosio',false],['Álvaro',false],['Diego',false],['Dibu',false]]},
  borrachia:{name:'Borrachia Dortmund',logo:'assets/borrachia-dortmund.jpeg',players:[['Dani Piqué',true],['Cruz',false],['Carlos Martínez',false],['Jaume Serra',false],['Joan Nafria',false],['Tomas Colomina',false],['Hugo',false]]},
  celta:{name:'Celta de Vino',logo:'assets/celta-de-vino.jpeg',players:[['Guillem',true],['Paupu',false],['Joan Bosch',false],['Pol Cons',false],['Marc Escofet',false],['Juan',false],['Samuel',false]]},
  fener:{name:'Fenerbahçupito',logo:'assets/fenerbahcupito.jpeg',players:[['Arnau Portavella',true],['Victor',false],['Rafa',false],['Mito',false],['Machuca',false],['Linguini',false],['Xavier Bautista',false],['Joan Tortosa',false]]},
  ordago:{name:'Ordago FC',logo:'assets/ordago-fc.jpeg',players:[['Migue',true],['Antonio',false],['Pou',false],['Tomas',false],['Jordi',false],['Etienne',false],['Albero',false],['Carlos Monge',false]]}
};

const defaultFixtures = [
  {round:1,home:'celta',away:'borrachia',rest:'aston'}, {round:1,home:'ordago',away:'fener',rest:'aston'},
  {round:2,home:'aston',away:'fener',rest:'borrachia'}, {round:2,home:'celta',away:'ordago',rest:'borrachia'},
  {round:3,home:'aston',away:'celta',rest:'fener'}, {round:3,home:'borrachia',away:'ordago',rest:'fener'},
  {round:4,home:'fener',away:'celta',rest:'ordago'}, {round:4,home:'borrachia',away:'aston',rest:'ordago'},
  {round:5,home:'ordago',away:'aston',rest:'celta'}, {round:5,home:'fener',away:'borrachia',rest:'celta'},
  {round:6,home:'borrachia',away:'celta',rest:'aston'}, {round:6,home:'fener',away:'ordago',rest:'aston'},
  {round:7,home:'fener',away:'aston',rest:'borrachia'}, {round:7,home:'ordago',away:'celta',rest:'borrachia'},
  {round:8,home:'celta',away:'aston',rest:'fener'}, {round:8,home:'ordago',away:'borrachia',rest:'fener'},
  {round:9,home:'celta',away:'fener',rest:'ordago'}, {round:9,home:'aston',away:'borrachia',rest:'ordago'},
  {round:10,home:'aston',away:'ordago',rest:'celta'}, {round:10,home:'borrachia',away:'fener',rest:'celta'}
].map((f,i)=>({...f,id:`m${i+1}`}));

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const store = {
  get(k,fallback){try{return JSON.parse(localStorage.getItem(k)) ?? fallback}catch{return fallback}},
  set(k,v){localStorage.setItem(k,JSON.stringify(v))},
  remove(k){localStorage.removeItem(k)}
};

let fixtures = store.get('league:fixtures',defaultFixtures.map(f=>({...f})));
function saveFixtures(){store.set('league:fixtures',fixtures)}
function roundNumbers(){return [...new Set(fixtures.map(f=>Number(f.round)).filter(Number.isFinite))].sort((a,b)=>a-b)}
function restingTeamsForRound(round){const playing=new Set(fixtures.filter(f=>Number(f.round)===Number(round)).flatMap(f=>[f.home,f.away]));return Object.keys(teams).filter(k=>!playing.has(k))}
function roundRestText(round){const rest=restingTeamsForRound(round);if(rest.length===1)return `Descansa: ${teams[rest[0]].name}`;if(rest.length===0)return 'Descansa: ninguno';return `Sin jugar: ${rest.map(k=>teams[k].name).join(', ')}`}

const allPlayers = Object.entries(teams).flatMap(([key,t])=>t.players.map(([name,captain])=>({name,team:t.name,key,captain})));
const IDEAL_POSITIONS=[{key:'goalkeeper',label:'Portero',short:'POR',className:'goalkeeper'},{key:'cierre',label:'Cierre',short:'CIE',className:'cierre'},{key:'alaLeft',label:'Ala izquierda',short:'ALA',className:'ala-left'},{key:'alaRight',label:'Ala derecha',short:'ALA',className:'ala-right'},{key:'pivot',label:'Pivot',short:'PIV',className:'pivot'}];
let playerReturnView='equipos';
let activePlayerName=null;
let teamReturnView='equipos';
let activeTeamKey=null;

function seedAccounts(){
  const accounts=store.get('league:accounts',[]);
  if(!accounts.some(a=>a.email.toLowerCase()===LEAGUE_EMAIL)){
    accounts.unshift({id:'league-admin',email:LEAGUE_EMAIL,password:null,displayName:'Liga Interna',linkedPlayer:null,roles:['admin'],createdAt:new Date().toISOString(),seeded:true});
    store.set('league:accounts',accounts);
  }
}
function accounts(){seedAccounts();return store.get('league:accounts',[])}
function saveAccounts(list){store.set('league:accounts',list)}
function currentUser(){return authStateUser}
async function loadCurrentUserFromSupabase(authUser=null){
  try{
    const user=authUser || (await supabaseClient.auth.getUser()).data.user;
    if(!user){authStateUser=null;authReady=true;refreshPermissionViews();return null}
    const [{data:profile},{data:roles},{data:player}] = await Promise.all([
      supabaseClient.from('profiles').select('display_name').eq('id',user.id).maybeSingle(),
      supabaseClient.from('user_roles').select('role').eq('user_id',user.id),
      supabaseClient.from('players').select('id,name,team_id,captain,photo_url').eq('user_id',user.id).maybeSingle()
    ]);
    authStateUser={
      id:user.id,
      email:user.email||'',
      displayName:profile?.display_name || user.user_metadata?.display_name || (user.email||'').split('@')[0],
      linkedPlayer:player?.name || null,
      linkedPlayerId:player?.id || null,
      roles:(roles||[]).map(r=>r.role)
    };
    authReady=true;
    refreshPermissionViews();
    return authStateUser;
  }catch(err){
    console.error('Error cargando sesión',err);
    authStateUser=null;authReady=true;refreshPermissionViews();return null;
  }
}
async function setSession(email){
  if(!email){await supabaseClient.auth.signOut();authStateUser=null;refreshPermissionViews();return}
}
function hasRole(role,user=currentUser()){return !!user?.roles?.includes(role)}
function isAdmin(){return hasRole('admin')}
function isPlayer(){return hasRole('player')}
function isReferee(){return hasRole('referee')}
function linkedPlayer(){return currentUser()?.linkedPlayer||null}
function claimedPlayerNames(exceptEmail=''){
  return new Set(accounts().filter(a=>a.linkedPlayer&&a.email.toLowerCase()!==String(exceptEmail).toLowerCase()).map(a=>a.linkedPlayer));
}
function availablePlayersForRegistration(){
  const claimed=claimedPlayerNames();
  return allPlayers.filter(p=>!claimed.has(p.name));
}
async function renderRegisterPlayerOptions(){
  const select=$('#registerPlayer'); if(!select)return;
  select.disabled=true;
  select.innerHTML='<option value="">Cargando jugadores...</option>';
  const {data,error}=await supabaseClient.from('signup_players').select('id,name,team_id,captain,available').eq('available',true).order('team_id').order('name');
  if(error){
    console.error(error);
    select.innerHTML='<option value="">No se pudieron cargar los jugadores</option>';
    const msg=$('#registerMsg'); if(msg)msg.textContent='No se pudo conectar con la lista de jugadores. Recarga la página.';
    return;
  }
  const available=data||[];
  const byTeam=Object.entries(teams).map(([key,t])=>({key,t,players:available.filter(p=>p.team_id===key)})).filter(g=>g.players.length);
  select.innerHTML='<option value="">Selecciona tu jugador</option>'+byTeam.map(g=>`<optgroup label="${escapeHtml(g.t.name)}">${g.players.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p.captain?' · Capitán':''}</option>`).join('')}</optgroup>`).join('');
  select.disabled=!available.length;
  const submit=$('#registerForm button[type="submit"]'); if(submit)submit.disabled=!available.length;
  const msg=$('#registerMsg'); if(msg&&!available.length)msg.textContent='Todos los jugadores ya tienen una cuenta vinculada.';
}
function refereeAssignments(){return store.get('league:refereeAssignments',{})}
function assignedRefEmail(matchId){return refereeAssignments()[matchId]||''}
function canManageMatch(matchId){const u=currentUser();if(!u)return false;if(hasRole('admin',u))return true;return hasRole('referee',u)&&assignedRefEmail(matchId).toLowerCase()===u.email.toLowerCase()}
function canEditPlayerPhoto(name){return isAdmin() || (isPlayer() && linkedPlayer()===name)}
function canVoteFor(name,matchId){
  if(isAdmin())return true;
  const u=currentUser(); if(!u||!hasRole('player',u)||u.linkedPlayer!==name)return false;
  const f=findFixture(matchId); if(!f)return false; const meta=allPlayers.find(p=>p.name===name);
  return !!meta && (meta.key===f.home||meta.key===f.away);
}

function navigate(view){
  if(view==='admin'&&!isAdmin())view=currentUser()?'cuenta':'acceso';
  document.body.dataset.view=view;
  $$('.view').forEach(v=>v.classList.remove('active'));
  $$('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const target=$(`#view-${view}`); if(!target)return;
  target.classList.add('active');
  setMobileMenu(false);
  window.scrollTo({top:0,behavior:'smooth'});
  if(view==='inicio')renderHomeDashboard();
  if(view==='jornadas')renderRounds();
  if(view==='clasificacion')renderStandings();
  if(view==='equipos')renderTeams();
  if(view==='equipo'&&activeTeamKey)renderTeamProfile(activeTeamKey);
  if(view==='jugador'&&activePlayerName)renderPlayerProfile(activePlayerName);
  if(view==='goleadores'||view==='asistencias'||view==='mvps'||view==='jugadores')renderRankings();
  if(view==='streaming')renderStreaming();
  if(view==='disponibilidad')renderAvailability();
  if(view==='premios')renderIdeal();
  if(view==='directo')renderLive();
  if(view==='cuenta')renderAccountPanel();
  if(view==='acceso')renderRegisterPlayerOptions();
  if(view==='admin')renderAdmin();
}
$$('.nav-link').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)));
function setMobileMenu(open){
  const n=$('#nav'),b=$('#menuBtn'),backdrop=$('#navBackdrop');
  n.classList.toggle('open',open); b.setAttribute('aria-expanded',String(open));
  b.textContent=open?'✕':'☰'; document.body.classList.toggle('menu-open',open);
  if(backdrop){backdrop.classList.toggle('show',open);backdrop.setAttribute('aria-hidden',String(!open));}
}
$('#menuBtn').addEventListener('click',()=>setMobileMenu(!$('#nav').classList.contains('open')));
$('#navBackdrop')?.addEventListener('click',()=>setMobileMenu(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape')setMobileMenu(false)});
$('#accountBtn').addEventListener('click',()=>navigate(currentUser()?'cuenta':'acceso'));

function refreshAuthUI(){
  const u=currentUser();
  $('#accountLabel').textContent=u?(u.linkedPlayer||u.displayName||u.email.split('@')[0]):'Entrar';
  $('#accountRole').textContent=u?(u.roles?.length?u.roles.map(roleLabel).join(' · '):(u.linkedPlayer?'Jugador':'Usuario')):'Visitante';
  $('#accountAvatar').textContent=u?'●':'👤';
  $$('.admin-only').forEach(el=>el.hidden=!isAdmin());
  $$('.admin-only-block').forEach(el=>el.hidden=!isAdmin());
}
function roleLabel(r){return r==='admin'?'Admin':r==='referee'?'Árbitro':r==='player'?'Jugador':r}
function roleBadges(u){
  if(!u?.roles?.length)return '<span class="role guest">PENDIENTE</span>';
  return u.roles.map(r=>`<span class="role ${r==='referee'?'ref':r}">${roleLabel(r).toUpperCase()}</span>`).join(' ');
}
function renderAccountPanel(){
  const u=currentUser();
  if(!u){$('#accountPanel').innerHTML='<div class="panel"><h2>Estás navegando como visitante</h2><p class="muted">Puedes ver toda la competición, pero no editar datos.</p><button class="primary" type="button" data-open-access>Entrar o registrarse</button></div>';return}
  const playerMeta=u.linkedPlayer?allPlayers.find(p=>p.name===u.linkedPlayer):null;
  $('#accountPanel').innerHTML=`<section class="panel account-summary"><div class="account-summary-main"><span class="account-big-avatar">${playerMeta?escapeHtml(playerMeta.name.split(' ').map(x=>x[0]).slice(0,2).join('')):'👤'}</span><div><span class="eyebrow">SESIÓN ACTIVA</span><h2>${escapeHtml(u.linkedPlayer||u.displayName||'Usuario')}</h2><p class="muted">${escapeHtml(u.email)}</p><div class="role-row">${roleBadges(u)}</div></div></div><div class="account-actions">${u.linkedPlayer?`<button class="secondary" type="button" data-player-profile="${escapeHtml(u.linkedPlayer)}">Abrir mi ficha</button>`:''}${isAdmin()?'<button class="ghost" type="button" data-open-admin>Panel de administración</button>':''}<button id="logoutBtn" class="ghost" type="button">Cerrar sesión</button></div></section><div class="notice">${u.linkedPlayer?'Tu cuenta está vinculada a '+escapeHtml(u.linkedPlayer)+'. El rol Jugador se activa automáticamente; los permisos de Árbitro o Administrador solo los asigna el administrador principal.':'Esta cuenta no está vinculada a un jugador.'}</div>`;
  $('#logoutBtn')?.addEventListener('click',async()=>{await setSession(null);navigate('inicio')});
  $('[data-open-admin]')?.addEventListener('click',()=>navigate('admin'));
}
document.addEventListener('click',e=>{const a=e.target.closest('[data-open-access]');if(a)navigate('acceso')});

$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=$('#loginEmail').value.trim().toLowerCase(), password=$('#loginPassword').value;
  const msg=$('#loginMsg');
  msg.textContent='Entrando...';
  const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error){msg.textContent='No se ha podido iniciar sesión. Revisa el correo y la contraseña.';return}
  await loadCurrentUserFromSupabase(data.user);
  msg.textContent='Sesión iniciada.';
  navigate('cuenta');
});
$('#registerForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=$('#registerEmail').value.trim().toLowerCase(),password=$('#registerPassword').value,playerId=$('#registerPlayer').value;
  const msg=$('#registerMsg');
  if(!/^\S+@\S+\.\S+$/.test(email)){ msg.textContent='Introduce un correo válido.'; return; }
  if(password.length<6){msg.textContent='La contraseña debe tener al menos 6 caracteres.';return}
  if(!playerId){msg.textContent='Selecciona qué jugador eres.';return}
  const selected=$('#registerPlayer').selectedOptions[0];
  const displayName=selected?.textContent?.replace(' · Capitán','').trim() || email.split('@')[0];
  msg.textContent='Creando cuenta...';
  const {data,error}=await supabaseClient.auth.signUp({
    email,password,
    options:{data:{player_id:playerId,display_name:displayName}}
  });
  if(error){
    const text=String(error.message||'').toLowerCase();
    msg.textContent=text.includes('already')?'Ese correo ya tiene una cuenta.':text.includes('jugador')?'Ese jugador ya está vinculado a otra cuenta.':'No se pudo crear la cuenta. Prueba de nuevo.';
    await renderRegisterPlayerOptions();
    return;
  }
  await renderRegisterPlayerOptions();
  if(data.session){
    await loadCurrentUserFromSupabase(data.user);
    msg.textContent='Cuenta creada y jugador vinculado.';
    navigate('cuenta');
  }else{
    msg.textContent='Cuenta creada. Revisa tu correo para confirmar la cuenta y después inicia sesión.';
  }
});
$('#demoAdminLogin')?.closest('.demo-login-panel')?.setAttribute('hidden','');

function defaultMatchState(){return {homeScore:0,awayScore:0,events:[],mvp:null,finished:false,started:false}}
function getStateFor(id){return store.get(`match:${id}`,defaultMatchState())}
function playersOf(teamKey){return teams[teamKey].players.map(p=>p[0])}
function findFixture(id){return fixtures.find(f=>f.id===id)}
function fixtureLabel(f){return `J${f.round} · ${teams[f.home].name} vs ${teams[f.away].name}`}
function playerPhoto(name){return store.get(`playerPhoto:${name}`,null)}
function playerAvatarHtml(name,extraClass=''){const photo=playerPhoto(name);return photo?`<span class="avatar ${extraClass}"><img src="${photo}" alt="Foto de ${escapeHtml(name)}"></span>`:`<span class="avatar ${extraClass}">${escapeHtml(name.split(' ').map(x=>x[0]).slice(0,2).join(''))}</span>`}
const playerProfileButton=name=>`<button type="button" class="player-name-button" data-player-profile="${escapeHtml(name)}">${escapeHtml(name)}</button>`;

function defaultAvailability(){return {options:[],votes:{},responded:{},confirmedOptionId:''}}
function availabilityData(matchId){
  const raw=store.get(`availability:${matchId}`,defaultAvailability());
  if(Array.isArray(raw?.options))return {...defaultAvailability(),...raw,votes:raw.votes||{},responded:raw.responded||{}};
  const migrated=defaultAvailability();
  if(raw?.slot){migrated.options=[{id:'legacy-1',date:'',time:'',label:String(raw.slot)}]}
  if(raw?.votes){Object.entries(raw.votes).forEach(([player,v])=>{migrated.responded[player]=true;migrated.votes[player]={'legacy-1':v==='yes'||v==='maybe'}})}
  store.set(`availability:${matchId}`,migrated);return migrated;
}
function saveAvailabilityData(matchId,data){store.set(`availability:${matchId}`,data)}
function availabilityOptionLabel(opt){
  if(!opt)return 'Fecha por decidir';
  if(opt.label)return opt.label;
  if(!opt.date||!opt.time)return 'Horario incompleto';
  const [y,m,d]=opt.date.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
  const weekday=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][date.getUTCDay()];
  const month=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][m-1];
  return `${weekday.charAt(0).toUpperCase()+weekday.slice(1)} ${d} de ${month} · ${opt.time}`;
}
function availabilityVoteLabel(opt){
  if(!opt?.date)return opt?.label||'Día';
  const date=new Date(`${opt.date}T00:00:00`),days=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  return `${days[date.getDay()]} ${date.getDate()} · ${opt.time||''}`;
}
function availabilityStatus(matchId){
  const av=availabilityData(matchId),confirmed=av.options.find(o=>o.id===av.confirmedOptionId);
  if(confirmed)return `📅 ${availabilityOptionLabel(confirmed)}`;
  return av.options.length?`${av.options.length} días para votar`:'Fecha por decidir';
}
function statusForFixture(f){const s=getStateFor(f.id);if(s.finished)return `${s.homeScore}–${s.awayScore}`;if(s.started)return `● EN JUEGO · ${s.homeScore}–${s.awayScore}`;return availabilityStatus(f.id)}
function renderRounds(){
  const rounds=roundNumbers();
  if(!rounds.length){$('#rounds').innerHTML='<div class="empty-state">No hay jornadas configuradas.</div>';return}
  $('#rounds').innerHTML=rounds.map(r=>{
    const fs=fixtures.filter(f=>Number(f.round)===Number(r));
    return `<article class="round-card"><div class="round-head"><h3>Jornada ${r}</h3><span>${escapeHtml(roundRestText(r))}</span></div>${fs.map(f=>{
      const s=getStateFor(f.id),playing=s.started&&!s.finished,finished=s.finished,center=finished||playing?`${s.homeScore}–${s.awayScore}`:'VS',action=finished||playing?'directo':'disponibilidad';
      return `<button class="fixture-button ${playing?'fixture-live':''}" data-match="${f.id}" data-match-action="${action}" aria-label="Abrir ${action} de ${teams[f.home].name} contra ${teams[f.away].name}"><div class="fixture-team"><img src="${teams[f.home].logo}" alt=""><span>${teams[f.home].name}</span></div><b class="fixture-score">${center}</b><div class="fixture-team right"><span>${teams[f.away].name}</span><img src="${teams[f.away].logo}" alt=""></div><span class="fixture-status">${statusForFixture(f)}</span></button>`;
    }).join('')}</article>`;
  }).join('');
  $$('#rounds [data-match]').forEach(b=>b.addEventListener('click',()=>b.dataset.matchAction==='directo'?openLiveMatch(b.dataset.match):openAvailability(b.dataset.match)));
}
function openAvailability(matchId){if(!findFixture(matchId))return;$('#availabilityMatch').value=matchId;renderAvailability();navigate('disponibilidad')}

function playerStats(){
  const stats={}; allPlayers.forEach(p=>stats[p.name]={name:p.name,team:p.team,key:p.key,goals:0,assists:0,mvps:0});
  fixtures.forEach(f=>{const s=getStateFor(f.id);(s.events||[]).forEach(e=>{if(stats[e.scorer])stats[e.scorer].goals+=Number(e.value||1);if(e.assist&&stats[e.assist])stats[e.assist].assists+=1});if(s.mvp&&stats[s.mvp])stats[s.mvp].mvps+=1});
  return stats;
}
function sortedBy(field){return Object.values(playerStats()).sort((a,b)=>b[field]-a[field]||a.name.localeCompare(b.name,'es'))}

function renderHomeTeams(){
  $('#homeTeams').innerHTML=Object.entries(teams).map(([key,t])=>`<button class="mini-team" data-team="${key}"><img src="${t.logo}" alt="Escudo ${t.name}"><b>${t.name}</b><span class="muted">${t.players.length} jugadores</span></button>`).join('');
  $$('#homeTeams [data-team]').forEach(btn=>btn.addEventListener('click',()=>openTeam(btn.dataset.team)));
}
function openTeam(key){
  if(!teams[key])return;
  teamReturnView=document.body.dataset.view==='equipo'?teamReturnView:(document.body.dataset.view||'equipos');
  activeTeamKey=key;renderTeamProfile(key);navigate('equipo');
}
function formForTeam(key){
  const rows=fixtures.filter(f=>f.home===key||f.away===key).filter(f=>getStateFor(f.id).finished).sort((a,b)=>Number(a.round)-Number(b.round));
  return rows.slice(-5).map(f=>{const s=getStateFor(f.id),isHome=f.home===key,gf=isHome?s.homeScore:s.awayScore,ga=isHome?s.awayScore:s.homeScore;return gf>ga?'G':gf<ga?'P':'E'});
}
function countedMatchState(f,includeLive=true){
  const s=getStateFor(f.id),provisional=s.started&&!s.finished;
  if(!s.finished && !(includeLive&&provisional))return null;
  return {state:s,provisional,homeScore:Number(s.homeScore||0),awayScore:Number(s.awayScore||0)};
}
function directStats(teamKeys,{includeLive=true}={}){
  const set=new Set(teamKeys),stats=Object.fromEntries(teamKeys.map(k=>[k,{pts:0,gf:0,gc:0,dg:0}]));
  fixtures.forEach(f=>{
    if(!set.has(f.home)||!set.has(f.away))return;
    const m=countedMatchState(f,includeLive);if(!m)return;
    const h=stats[f.home],a=stats[f.away],hs=m.homeScore,as=m.awayScore;
    h.gf+=hs;h.gc+=as;a.gf+=as;a.gc+=hs;
    if(hs>as)h.pts+=3;else if(hs<as)a.pts+=3;else{h.pts++;a.pts++}
  });
  Object.values(stats).forEach(x=>x.dg=x.gf-x.gc);
  return stats;
}
function fairPlayPoints(teamKey,{includeLive=true}={}){
  // Preparado para cuando registremos tarjetas: menos puntos = mejor juego limpio.
  // Amarilla = 1; doble amarilla/roja = 3, siguiendo el criterio federativo.
  let total=0;
  fixtures.forEach(f=>{
    if(f.home!==teamKey&&f.away!==teamKey)return;
    const m=countedMatchState(f,includeLive);if(!m)return;
    (m.state.events||[]).forEach(e=>{
      if(e.teamKey!==teamKey)return;
      if(e.type==='yellow')total+=1;
      if(e.type==='red'||e.type==='secondYellow')total+=3;
    });
  });
  return total;
}
function rankTwoTeamTie(keys,data,{includeLive=true}={}){
  const d=directStats(keys,{includeLive});
  return keys.slice().sort((ka,kb)=>{
    const a=data[ka],b=data[kb];
    return (d[kb].dg-d[ka].dg) || (b.dg-a.dg) || (b.gf-a.gf) || (fairPlayPoints(ka,{includeLive})-fairPlayPoints(kb,{includeLive})) || a.name.localeCompare(b.name,'es');
  });
}
function rankMultiTeamTie(keys,data,{includeLive=true}={}){
  const mini=directStats(keys,{includeLive});
  const sorted=keys.slice().sort((ka,kb)=>
    (mini[kb].pts-mini[ka].pts) || (mini[kb].dg-mini[ka].dg) || (data[kb].dg-data[ka].dg) || (data[kb].gf-data[ka].gf) || (fairPlayPoints(ka,{includeLive})-fairPlayPoints(kb,{includeLive})) || data[ka].name.localeCompare(data[kb].name,'es')
  );
  // Si un criterio separa algunos equipos y deja dos exactamente igualados, se aplica a esos dos
  // el desempate específico de dos clubes, como prevé la normativa española.
  const result=[];let i=0;
  while(i<sorted.length){
    const k=sorted[i],signature=[mini[k].pts,mini[k].dg,data[k].dg,data[k].gf,fairPlayPoints(k,{includeLive})];
    let j=i+1;
    while(j<sorted.length){
      const q=sorted[j],sig=[mini[q].pts,mini[q].dg,data[q].dg,data[q].gf,fairPlayPoints(q,{includeLive})];
      if(sig.some((v,n)=>v!==signature[n]))break;
      j++;
    }
    const subgroup=sorted.slice(i,j);
    if(subgroup.length===2)result.push(...rankTwoTeamTie(subgroup,data,{includeLive}));else result.push(...subgroup);
    i=j;
  }
  return result;
}
function sortStandingsSpanishStyle(data,{includeLive=true}={}){
  const byPoints={};Object.keys(data).forEach(k=>{const p=data[k].pts;(byPoints[p]??=[]).push(k)});
  const pointLevels=Object.keys(byPoints).map(Number).sort((a,b)=>b-a),ordered=[];
  pointLevels.forEach(p=>{
    const keys=byPoints[p];
    if(keys.length===1)ordered.push(keys[0]);
    else if(keys.length===2)ordered.push(...rankTwoTeamTie(keys,data,{includeLive}));
    else ordered.push(...rankMultiTeamTie(keys,data,{includeLive}));
  });
  return ordered.map(k=>data[k]);
}
function standingsData({includeLive=true}={}){
  const data={};Object.keys(teams).forEach(key=>data[key]={key,name:teams[key].name,pj:0,pg:0,pe:0,pp:0,gf:0,gc:0,dg:0,pts:0,form:formForTeam(key),live:null});
  fixtures.forEach(f=>{
    const m=countedMatchState(f,includeLive);if(!m)return;
    const s=m.state,provisional=m.provisional,h=data[f.home],a=data[f.away],hs=m.homeScore,as=m.awayScore;
    [h,a].forEach(x=>x.pj++);h.gf+=hs;h.gc+=as;a.gf+=as;a.gc+=hs;
    if(hs>as){h.pg++;a.pp++;h.pts+=3}else if(hs<as){a.pg++;h.pp++;a.pts+=3}else{h.pe++;a.pe++;h.pts++;a.pts++}
    if(provisional){h.live={matchId:f.id,side:'home',score:`${hs}–${as}`,opponent:f.away};a.live={matchId:f.id,side:'away',score:`${as}–${hs}`,opponent:f.home}}
  });
  Object.values(data).forEach(x=>x.dg=x.gf-x.gc);
  return sortStandingsSpanishStyle(data,{includeLive});
}
function renderPlayoffBracket(table=standingsData()){
  const wrap=$('#playoffBracket');if(!wrap)return;
  const seed=n=>table[n-1]||null,teamCard=(t,label)=>t?`<button type="button" class="bracket-team bracket-team-button" data-team-profile="${t.key}"><span>${label}</span><img src="${teams[t.key].logo}" alt=""><strong>${escapeHtml(t.name)}</strong></button>`:`<div class="bracket-team placeholder"><span>${label}</span><strong>Por decidir</strong></div>`;
  const first=seed(1),s2=seed(2),s3=seed(3),s4=seed(4),s5=seed(5);
  wrap.innerHTML=`<div class="bracket-column"><h3>Primera ronda</h3><article class="bracket-match"><span>Partido A</span>${teamCard(s2,'2º')}${teamCard(s5,'5º')}</article><article class="bracket-match"><span>Partido B</span>${teamCard(s3,'3º')}${teamCard(s4,'4º')}</article></div><div class="bracket-arrow">→</div><div class="bracket-column"><h3>Repesca</h3><article class="bracket-match"><span>Última plaza de semifinal</span>${teamCard(null,'Perdedor A')}${teamCard(null,'Perdedor B')}</article></div><div class="bracket-arrow">→</div><div class="bracket-column semifinals"><h3>Semifinales</h3><article class="bracket-match seeded"><span>Semifinal 1</span>${teamCard(first,'1º')}${teamCard(null,'Ganador repesca')}</article><article class="bracket-match"><span>Semifinal 2</span>${teamCard(null,'Ganador A')}${teamCard(null,'Ganador B')}</article></div><div class="bracket-arrow">→</div><div class="bracket-column"><h3>Final</h3><article class="bracket-match final-match"><span>Final</span>${teamCard(null,'Ganador SF1')}${teamCard(null,'Ganador SF2')}</article></div>`;
}
function renderStandings(){
  const table=standingsData();
  $('#standingsBody').innerHTML=table.map((r,i)=>{const liveClass=r.live?` live-row live-${r.live.side}`:'',liveCell=r.live?`<button class="live-score-pill" type="button" data-live-match="${r.live.matchId}"><span>EN JUEGO</span><strong>${r.live.score}</strong></button>`:'<span class="muted">—</span>';return `<tr class="${liveClass.trim()}"><td class="pos">${i+1}</td><td><button class="standings-team standings-team-button" type="button" data-team-profile="${r.key}"><img src="${teams[r.key].logo}" alt=""><strong>${r.name}</strong>${r.live?'<em>● EN JUEGO</em>':''}</button></td><td>${r.pj}</td><td>${r.pg}</td><td>${r.pe}</td><td>${r.pp}</td><td>${r.gf}</td><td>${r.gc}</td><td>${r.dg>0?'+':''}${r.dg}</td><td class="points">${r.pts}${r.live?'<small class="provisional-pts">PROV.</small>':''}</td><td><div class="form-dashes">${[...Array(5)].map((_,j)=>{const v=r.form[r.form.length-5+j];return `<span class="${v?`form-${v.toLowerCase()}`:''}">${v||'–'}</span>`}).join('')}</div></td><td>${liveCell}</td></tr>`}).join('');
  $$('#standingsBody [data-live-match]').forEach(b=>b.addEventListener('click',()=>openLiveMatch(b.dataset.liveMatch)));
  renderPlayoffBracket(table);
}
function renderTeams(){
  const stats=playerStats(),table=standingsData({includeLive:false}),pos=Object.fromEntries(table.map((r,i)=>[r.key,i+1]));
  $('#teamsGrid').innerHTML=Object.entries(teams).map(([key,t])=>{const goals=t.players.reduce((n,[p])=>n+(stats[p]?.goals||0),0);return `<button id="team-${key}" class="team-card team-summary-card" type="button" data-team-profile="${key}"><div class="team-card-head"><img src="${t.logo}" alt="Escudo ${t.name}"><div><span class="eyebrow">EQUIPO</span><h3>${t.name}</h3><span class="muted">${t.players.length} jugadores · ${pos[key]||'–'}º · ⚽ ${goals}</span></div></div><span class="team-open-hint">Abrir ficha del equipo →</span></button>`}).join('');
}
function rankingPlayerCell(p){return `<div class="ranking-player-cell">${playerAvatarHtml(p.name,'ranking-avatar')}<div>${playerProfileButton(p.name)}</div></div>`}
function renderRankings(){
  const scorers=sortedBy('goals'),assists=sortedBy('assists'),mvps=sortedBy('mvps');
  $('#scorersBody').innerHTML=scorers.map((p,i)=>`<tr><td class="pos">${i+1}</td><td>${rankingPlayerCell(p)}</td><td>${p.team}</td><td class="points emoji-stat">⚽ ${p.goals}</td></tr>`).join('');
  $('#assistsBody').innerHTML=assists.map((p,i)=>`<tr><td class="pos">${i+1}</td><td>${rankingPlayerCell(p)}</td><td>${p.team}</td><td class="points emoji-stat">🅰️ ${p.assists}</td></tr>`).join('');
  if($('#mvpsBody'))$('#mvpsBody').innerHTML=mvps.map((p,i)=>`<tr><td class="pos">${i+1}</td><td>${rankingPlayerCell(p)}</td><td>${p.team}</td><td class="points emoji-stat">⭐ ${p.mvps}</td></tr>`).join('');
  const combined=Object.values(playerStats()).map(p=>({...p,total:p.goals+p.assists+p.mvps})).sort((a,b)=>b.total-a.total||b.goals-a.goals||b.assists-a.assists||b.mvps-a.mvps||a.name.localeCompare(b.name,'es'));
  $('#playersRankingBody').innerHTML=combined.map((p,i)=>`<tr><td class="pos">${i+1}</td><td>${rankingPlayerCell(p)}</td><td>${p.team}</td><td class="emoji-stat">⚽ ${p.goals}</td><td class="emoji-stat">🅰️ ${p.assists}</td><td class="emoji-stat">⭐ ${p.mvps}</td><td>${p.total}</td></tr>`).join('');
}
function renderTeamProfile(key){
  const t=teams[key];if(!t)return;activeTeamKey=key;const stats=playerStats(),table=standingsData(),row=table.find(r=>r.key===key),position=table.findIndex(r=>r.key===key)+1;
  $('#teamProfileLogo').src=t.logo;$('#teamProfileName').textContent=t.name;$('#teamProfileMeta').textContent=`${t.players.length} jugadores · ${position}º · ${row?.pts||0} puntos · DG ${row?.dg>0?'+':''}${row?.dg||0}`;
  const played=fixtures.filter(f=>(f.home===key||f.away===key)&&getStateFor(f.id).finished).sort((a,b)=>Number(b.round)-Number(a.round)).slice(0,5),upcoming=fixtures.filter(f=>(f.home===key||f.away===key)&&!getStateFor(f.id).finished).sort((a,b)=>Number(a.round)-Number(b.round)).slice(0,5);
  $('#teamRecentMatches').innerHTML=played.length?played.map(f=>teamMatchHtml(f,key,true)).join(''):'<div class="empty-state">Todavía no ha jugado partidos.</div>';
  $('#teamUpcomingMatches').innerHTML=upcoming.length?upcoming.map(f=>teamMatchHtml(f,key,false)).join(''):'<div class="empty-state">No quedan partidos pendientes.</div>';
  $('#teamProfileRoster').innerHTML=t.players.map(([p,c])=>`<div class="player-row">${playerAvatarHtml(p)}<span>${playerProfileButton(p)}</span>${c?'<span class="captain" title="Capitán">C</span>':'<span></span>'}<span class="player-stat">⚽ ${stats[p]?.goals||0}</span><span class="player-stat">🅰️ ${stats[p]?.assists||0}</span><span class="player-stat">⭐ ${stats[p]?.mvps||0}</span></div>`).join('');
  $$('#teamUpcomingMatches [data-team-match]').forEach(b=>b.addEventListener('click',()=>openAvailability(b.dataset.teamMatch)));
  $$('#teamRecentMatches [data-team-live]').forEach(b=>b.addEventListener('click',()=>openLiveMatch(b.dataset.teamLive)));
}
function teamMatchHtml(f,key,finished){const s=getStateFor(f.id),opponent=f.home===key?f.away:f.home,isHome=f.home===key,score=finished?(isHome?`${s.homeScore}–${s.awayScore}`:`${s.awayScore}–${s.homeScore}`):'VS';return `<article class="team-match-row"><img src="${teams[opponent].logo}" alt=""><div><strong>${teams[opponent].name}</strong><small>Jornada ${f.round} · ${finished?'Finalizado':availabilityStatus(f.id)}</small></div><b>${score}</b><button class="ghost compact-btn" type="button" ${finished?`data-team-live="${f.id}"`:`data-team-match="${f.id}"`}>${finished?'Ver acta':'Disponibilidad'}</button></article>`}
function renderHomeDashboard(){
  const finished=fixtures.filter(f=>getStateFor(f.id).finished).slice().reverse().slice(0,5),pending=fixtures.filter(f=>!getStateFor(f.id).finished).slice(0,5);
  $('#recentResults').innerHTML=finished.length?finished.map(f=>homeMatchHtml(f,true)).join(''):'<div class="empty-state">Todavía no se ha finalizado ningún partido.</div>';
  $('#upcomingMatches').innerHTML=pending.length?pending.map(f=>homeMatchHtml(f,false)).join(''):'<div class="empty-state">No quedan partidos pendientes.</div>';
  const topG=sortedBy('goals')[0],topA=sortedBy('assists')[0],topM=sortedBy('mvps')[0];
  const topItems=[['#homeTopScorer','#homeTopScorerMeta',topG,'goals','⚽','goles'],['#homeTopAssist','#homeTopAssistMeta',topA,'assists','🅰️','asistencias'],['#homeTopMvp','#homeTopMvpMeta',topM,'mvps','⭐','MVP']];
  topItems.forEach(([btnSel,metaSel,p,field,icon,label])=>{const n=p?.[field]||0,btn=$(btnSel);btn.textContent=n?p.name:'—';btn.disabled=!n;if(n)btn.dataset.playerProfile=p.name;else delete btn.dataset.playerProfile;$(metaSel).textContent=`${icon} ${n} ${label}`});
  renderNextMatchCard();
}
function homeMatchHtml(f,finished){const s=getStateFor(f.id);return `<div class="home-match"><div class="club"><img src="${teams[f.home].logo}" alt=""><div><strong>${teams[f.home].name}</strong><small>Jornada ${f.round}</small></div></div><strong>${finished?`${s.homeScore}–${s.awayScore}`:'VS'}</strong><div class="club"><div><strong>${teams[f.away].name}</strong><small>${finished?'Finalizado':availabilityStatus(f.id)}</small></div><img src="${teams[f.away].logo}" alt=""></div></div>`}
function nextPendingFixture(){return fixtures.find(f=>!getStateFor(f.id).finished)||null}
function renderNextMatchCard(){
  const f=nextPendingFixture(),btn=$('#startNextMatch');
  if(!f){$('#nextRoundBadge').textContent='Temporada completada';$('#nextHomeName').textContent='—';$('#nextAwayName').textContent='—';$('#nextHomeLogo').removeAttribute('src');$('#nextAwayLogo').removeAttribute('src');$('#nextMatchStatus').textContent='No quedan partidos pendientes';btn.disabled=true;return}
  $('#nextRoundBadge').textContent=`Jornada ${f.round}`;$('#nextHomeLogo').src=teams[f.home].logo;$('#nextAwayLogo').src=teams[f.away].logo;$('#nextHomeName').textContent=teams[f.home].name;$('#nextAwayName').textContent=teams[f.away].name;$('#nextMatchStatus').textContent=availabilityStatus(f.id);btn.disabled=false;btn.dataset.match=f.id;btn.textContent=availabilityData(f.id).confirmedOptionId?'📅 Ver partido confirmado':'📅 Confirmar / votar partido';
}

function populateMatchSelects(){
  const opts=fixtures.map(f=>`<option value="${f.id}">${fixtureLabel(f)}</option>`).join('');
  $('#matchSelect').innerHTML=opts;$('#availabilityMatch').innerHTML=opts;$('#streamMatchSelect').innerHTML=opts;
  const rounds=roundNumbers();
  $('#idealRound').innerHTML=rounds.map(r=>`<option value="${r}">Jornada ${r}</option>`).join('');
}

function openLiveMatch(matchId){if(!findFixture(matchId))return;stopTimer();live.matchId=matchId;live.half=1;live.remaining=1200;if($('#matchSelect'))$('#matchSelect').value=matchId;renderLive();navigate('directo')}

let live={matchId:'m1',half:1,remaining:1200,running:false,interval:null};
function matchStateKey(){return `match:${live.matchId}`}
function getMatchState(){return store.get(matchStateKey(),defaultMatchState())}
function saveMatchState(s){store.set(matchStateKey(),s)}
function allMatchPlayers(f){return [...playersOf(f.home),...playersOf(f.away)]}
function timeText(sec){const m=Math.floor(sec/60),s=sec%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function elapsedMinute(){return Math.min(20,Math.floor((1200-live.remaining)/60)+1)}
function isSpecial(){return live.remaining<=120&&live.remaining>=0}
function updateSpecialRule(){const el=$('#specialRule');el.className='special-rule';if(!isSpecial()){el.textContent='Tiempo normal';return}if(live.half===1){el.classList.add('dice');el.textContent='🎲 Dado Kings League activo'}else{el.classList.add('double');el.textContent='⚡ GOL DOBLE activo'}}
function renderLive(){
  const f=findFixture(live.matchId),s=getMatchState(),editable=canManageMatch(live.matchId);if(!f)return;
  $('#liveEyebrow').textContent=editable?'MODO ÁRBITRO':'EN DIRECTO';$('#liveDescription').textContent=editable?'Tienes permisos para gestionar este partido.':'Sigue el marcador, el tiempo y los eventos. Solo el árbitro asignado puede editar.';
  $('#liveHalfControls').hidden=!editable;$('#liveTimerActions').hidden=!editable;$('#liveEventActions').hidden=!editable;$('#liveMvpPanel').hidden=!editable;$$('.live-editor-control').forEach(el=>el.hidden=!editable);
  $('#timer').textContent=timeText(live.remaining);$('#homeName').textContent=teams[f.home].name;$('#awayName').textContent=teams[f.away].name;$('#homeLogo').src=teams[f.home].logo;$('#awayLogo').src=teams[f.away].logo;$('#homeScore').textContent=s.homeScore;$('#awayScore').textContent=s.awayScore;
  $('#half1Btn').classList.toggle('active',live.half===1);$('#half2Btn').classList.toggle('active',live.half===2);const liveStatus=s.finished?'Partido finalizado':(s.started?`● EN JUEGO · ${live.half}ª parte`:availabilityStatus(live.matchId));$('#liveMatchLabel').textContent=liveStatus+(editable?' · Edición habilitada':' · Solo lectura');updateSpecialRule();
  $('#eventsList').innerHTML=s.events.length?s.events.slice().reverse().map(e=>`<div class="event-item"><div><b>⚽ ${playerProfileButton(e.scorer)}</b> · ${e.team}<small>${e.assist?`🅰️ ${playerProfileButton(e.assist)} · `:''}${e.scoreAfter?`Marcador ${e.scoreAfter}`:''}${e.value===2?' · ⚡ Gol doble':''}</small></div><strong>${e.half}ª · ${e.minute}'</strong></div>`).join(''):'<div class="muted">Todavía no hay eventos.</div>';
  $('#mvpSelect').innerHTML='<option value="">Selecciona MVP</option>'+allMatchPlayers(f).map(p=>`<option ${s.mvp===p?'selected':''}>${p}</option>`).join('');$('#mvpSaved').innerHTML=s.mvp?`⭐ MVP guardado: ${playerProfileButton(s.mvp)}`:'';
  ['#startTimer','#pauseTimer','#resetTimer','#half1Btn','#half2Btn','#homeGoal','#awayGoal','#undoGoal','#finishMatch','#mvpSelect','#saveMvp'].forEach(sel=>{const el=$(sel);if(el)el.disabled=!editable||((sel==='#homeGoal'||sel==='#awayGoal'||sel==='#finishMatch')&&s.finished)});
}
function stopTimer(){live.running=false;if(live.interval)clearInterval(live.interval);live.interval=null}
function requireMatchEdit(){if(!canManageMatch(live.matchId)){alert('Este partido está en modo solo lectura. Solo el administrador o el árbitro asignado puede editarlo.');return false}return true}
$('#startTimer').addEventListener('click',()=>{if(!requireMatchEdit()||live.running||live.remaining<=0)return;const s=getMatchState();s.started=true;saveMatchState(s);live.running=true;renderStandings();live.interval=setInterval(()=>{live.remaining--;renderLive();if(live.remaining<=0)stopTimer()},1000)});
$('#pauseTimer').addEventListener('click',()=>{if(requireMatchEdit())stopTimer()});
$('#resetTimer').addEventListener('click',()=>{if(!requireMatchEdit())return;stopTimer();live.remaining=1200;renderLive()});
$('#half1Btn').addEventListener('click',()=>{if(!requireMatchEdit())return;stopTimer();live.half=1;live.remaining=1200;renderLive()});
$('#half2Btn').addEventListener('click',()=>{if(!requireMatchEdit())return;stopTimer();live.half=2;live.remaining=1200;renderLive()});
$('#matchSelect').addEventListener('change',e=>{stopTimer();live.matchId=e.target.value;live.half=1;live.remaining=1200;renderLive()});
$('#viewerStreamBtn').addEventListener('click',()=>{if($('#streamMatchSelect'))$('#streamMatchSelect').value=live.matchId;renderStreaming();navigate('streaming')});
let goalSide='home';
function openGoal(side){if(!requireMatchEdit())return;const f=findFixture(live.matchId),teamKey=f[side];goalSide=side;$('#goalTeamSide').value=side;$('#goalTitle').textContent=`Gol · ${teams[teamKey].name}`;const ps=playersOf(teamKey);$('#scorerSelect').innerHTML=ps.map(p=>`<option>${p}</option>`).join('');$('#assistSelect').innerHTML='<option value="">Sin asistencia</option>'+ps.map(p=>`<option>${p}</option>`).join('');$('#goalValueNotice').textContent=(live.half===2&&isSpecial())?'Este gol contará DOBLE (2 goles).':(live.half===1&&isSpecial())?'Dado Kings League activo. El gol contará normal hasta definir su mecánica.':'Gol normal (1).';$('#goalDialog').showModal()}
$('#homeGoal').addEventListener('click',()=>openGoal('home'));$('#awayGoal').addEventListener('click',()=>openGoal('away'));
$('#goalForm').addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();if(!requireMatchEdit())return;const f=findFixture(live.matchId),s=getMatchState(),teamKey=f[goalSide],scorer=$('#scorerSelect').value,assist=$('#assistSelect').value;if(assist===scorer&&assist){alert('El goleador y el asistente no pueden ser la misma persona.');return}const value=(live.half===2&&isSpecial())?2:1;s.started=true;if(goalSide==='home')s.homeScore+=value;else s.awayScore+=value;const scoreAfter=`${s.homeScore}-${s.awayScore}`;s.events.push({id:Date.now(),team:teams[teamKey].name,teamKey,side:goalSide,scorer,assist,value,half:live.half,minute:elapsedMinute(),homeScoreAfter:s.homeScore,awayScoreAfter:s.awayScore,scoreAfter});saveMatchState(s);$('#goalDialog').close();renderLive();refreshDataViews()});
$('#undoGoal').addEventListener('click',()=>{if(!requireMatchEdit())return;const s=getMatchState(),e=s.events.pop();if(!e)return;if(e.side==='home')s.homeScore=Math.max(0,s.homeScore-e.value);else s.awayScore=Math.max(0,s.awayScore-e.value);saveMatchState(s);renderLive();refreshDataViews()});
$('#finishMatch').addEventListener('click',()=>{if(!requireMatchEdit())return;const s=getMatchState();if(!confirm('¿Finalizar el partido? El acta quedará marcada como finalizada.'))return;s.finished=true;s.started=false;saveMatchState(s);stopTimer();renderLive();refreshDataViews()});
$('#saveMvp').addEventListener('click',()=>{if(!requireMatchEdit())return;const v=$('#mvpSelect').value;if(!v)return;const s=getMatchState();s.mvp=v;saveMatchState(s);renderLive();refreshDataViews()});

function youtubeId(url){
  if(!url)return null;
  try{const u=new URL(url);if(u.hostname.includes('youtu.be'))return u.pathname.split('/').filter(Boolean)[0]||null;if(u.searchParams.get('v'))return u.searchParams.get('v');const parts=u.pathname.split('/').filter(Boolean);const idx=parts.findIndex(x=>['embed','live','shorts'].includes(x));if(idx>=0&&parts[idx+1])return parts[idx+1]}catch{}
  return null;
}
function streamData(id){return store.get(`stream:${id}`,{liveUrl:'',recordingUrl:''})}
function renderStreaming(){
  const id=$('#streamMatchSelect').value||fixtures[0].id,f=findFixture(id);if(!f)return;
  $('#streamHomeLogo').src=teams[f.home].logo;$('#streamAwayLogo').src=teams[f.away].logo;$('#streamHomeName').textContent=teams[f.home].name;$('#streamAwayName').textContent=teams[f.away].name;
  const data=streamData(id),videoId=youtubeId(data.liveUrl)||youtubeId(data.recordingUrl),isLive=!!youtubeId(data.liveUrl);
  $('#youtubeLiveUrl').value=data.liveUrl||'';$('#youtubeRecordingUrl').value=data.recordingUrl||'';
  if(videoId){$('#youtubePlayer').src=`https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;$('#youtubePlayerWrap').hidden=false;$('#streamingFallback').hidden=true}else{$('#youtubePlayer').src='';$('#youtubePlayerWrap').hidden=true;$('#streamingFallback').hidden=false}
  $('#streamBadge').textContent=isLive?'EN DIRECTO':data.recordingUrl?'GRABACIÓN':'FUERA DE DIRECTO';$('#streamBadge').classList.toggle('ready',isLive);$('#streamStatus').textContent=isLive?'Directo de YouTube integrado en la web.':data.recordingUrl?'Grabación disponible.':'Todavía no hay un enlace de YouTube para este partido.';
  $$('.admin-only-block').forEach(el=>el.hidden=!isAdmin());
  renderStreamArchive();
}
function renderStreamArchive(){
  const items=fixtures.map(f=>({f,data:streamData(f.id)})).filter(x=>youtubeId(x.data.recordingUrl));
  $('#streamArchive').className=items.length?'stream-recordings':'empty-state';
  $('#streamArchive').innerHTML=items.length?items.map(({f,data})=>`<article class="stream-recording"><div><strong>Jornada ${f.round} · ${teams[f.home].name} vs ${teams[f.away].name}</strong><span class="muted">Grabación de YouTube</span></div><a class="secondary link-button" href="${escapeHtml(data.recordingUrl)}" target="_blank" rel="noopener">▶ Ver partido</a></article>`).join(''):'Todavía no hay partidos grabados.';
}
$('#streamMatchSelect').addEventListener('change',renderStreaming);
$('#saveYoutubeLinks').addEventListener('click',()=>{if(!isAdmin()){alert('Solo el administrador puede configurar los enlaces de YouTube.');return}const id=$('#streamMatchSelect').value,liveUrl=$('#youtubeLiveUrl').value.trim(),recordingUrl=$('#youtubeRecordingUrl').value.trim();if(liveUrl&&!youtubeId(liveUrl)){alert('El enlace de YouTube Live no parece válido.');return}if(recordingUrl&&!youtubeId(recordingUrl)){alert('El enlace de grabación de YouTube no parece válido.');return}store.set(`stream:${id}`,{liveUrl,recordingUrl});renderStreaming()});

function availabilityKey(){return `availability:${$('#availabilityMatch').value}`}
function currentAvailability(){return availabilityData($('#availabilityMatch').value)}
function selectOptions(values,selected,placeholder){return `<option value="">${placeholder}</option>`+values.map(v=>`<option value="${String(v.value)}" ${String(selected)===String(v.value)?'selected':''}>${v.label}</option>`).join('')}
function weekdayFromDate(dateString){
  if(!dateString)return '';
  const [y,m,d]=dateString.split('-').map(Number);if(!y||!m||!d)return '';
  return String(new Date(y,m-1,d,12,0,0).getDay());
}
function nextDateForWeekday(weekday,hour,now=new Date()){
  if(weekday===''||hour==='')return null;
  const target=new Date(now.getFullYear(),now.getMonth(),now.getDate(),Number(hour),0,0,0);
  let diff=(Number(weekday)-now.getDay()+7)%7;
  target.setDate(target.getDate()+diff);
  if(diff===0&&target<=now)target.setDate(target.getDate()+7);
  return target;
}
function localYmd(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function autoDatePreview(weekday,hour){
  const date=nextDateForWeekday(weekday,hour);if(!date)return 'Elige día de la semana y hora';
  const month=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][date.getMonth()];
  const dayName=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][date.getDay()];
  return `${dayName} ${date.getDate()} de ${month} · ${hour}:00`;
}
function dateEditorValue(opt={}){
  return {weekday:opt.weekday!==undefined&&opt.weekday!==null&&opt.weekday!==''?String(opt.weekday):weekdayFromDate(opt.date),hour:opt.time?opt.time.split(':')[0]:''};
}
function availabilityEditorHtml(opt,index){
  const v=dateEditorValue(opt),weekdays=[{value:1,label:'Lunes'},{value:2,label:'Martes'},{value:3,label:'Miércoles'},{value:4,label:'Jueves'},{value:5,label:'Viernes'},{value:6,label:'Sábado'},{value:0,label:'Domingo'}],hours=Array.from({length:24},(_,i)=>({value:String(i).padStart(2,'0'),label:`${String(i).padStart(2,'0')}:00`}));
  const preview=opt?.date&&opt?.time?availabilityOptionLabel(opt):autoDatePreview(v.weekday,v.hour);
  return `<article class="availability-editor-card" data-option-editor="${index}"><div class="availability-editor-title"><span>DÍA ${index+1}</span><strong data-auto-date-preview>${preview}</strong></div><div class="weekday-time-grid"><label>Día de la semana<select data-field="weekday">${selectOptions(weekdays,v.weekday,'Día')}</select></label><label>Hora<select data-field="hour">${selectOptions(hours,v.hour,'Hora')}</select></label></div><div class="auto-date-note">📅 La fecha se calcula automáticamente según el próximo ${v.weekday!==''?weekdays.find(x=>String(x.value)===String(v.weekday))?.label.toLowerCase()||'día elegido':'día elegido'}.</div></article>`;
}
function updateAvailabilityEditorPreviews(){
  $$('#availabilityOptionEditors [data-option-editor]').forEach(card=>{const get=f=>card.querySelector(`[data-field="${f}"]`)?.value||'',weekday=get('weekday'),hour=get('hour'),preview=card.querySelector('[data-auto-date-preview]');if(preview)preview.textContent=autoDatePreview(weekday,hour)});
}
function readAvailabilityEditors(){
  const result=[];
  $$('#availabilityOptionEditors [data-option-editor]').forEach((card,index)=>{const get=f=>card.querySelector(`[data-field="${f}"]`)?.value||'',weekday=get('weekday'),hour=get('hour');if(weekday===''&&hour===''){result.push(null);return}if(weekday===''||hour===''){result.push({invalid:true,index});return}const date=nextDateForWeekday(weekday,hour);if(!date){result.push({invalid:true,index});return}result.push({id:`opt-${index+1}`,weekday:Number(weekday),date:localYmd(date),time:`${hour}:00`})});
  return result;
}
function availabilityVoteCounts(f,data,optId){
  const countTeam=key=>playersOf(key).reduce((n,p)=>n+(data.votes?.[p]?.[optId]?1:0),0);
  return {home:countTeam(f.home),away:countTeam(f.away)};
}
function renderAvailability(){
  const matchId=$('#availabilityMatch').value,f=findFixture(matchId),data=availabilityData(matchId);if(!f)return;
  const adminEditor=$('#availabilityAdminEditor');adminEditor.hidden=!isAdmin();
  if(isAdmin()){ $('#availabilityOptionEditors').innerHTML=[0,1,2].map(i=>availabilityEditorHtml(data.options[i]||{},i)).join(''); $$('#availabilityOptionEditors select').forEach(sel=>sel.addEventListener('change',updateAvailabilityEditorPreviews)); updateAvailabilityEditorPreviews(); }

  if(!data.options.length){
    $('#availabilityOptions').innerHTML='<div class="empty-state">El administrador todavía no ha publicado los 3 días para votar.</div>';
    $('#availabilityGrid').innerHTML='';
    $('#availabilitySummary').innerHTML='<b>Estado</b><br>Esperando los días y horas propuestos.';
    return;
  }

  const totals=data.options.map(opt=>{const c=availabilityVoteCounts(f,data,opt.id);return {...c,total:c.home+c.away}}),best=Math.max(...totals.map(x=>x.total));
  $('#availabilityOptions').innerHTML=data.options.map((opt,i)=>{const c=totals[i],confirmed=data.confirmedOptionId===opt.id;return `<article class="availability-option-card ${confirmed?'confirmed':''}"><div><span class="availability-option-number">${availabilityVoteLabel(opt)}</span><h3>${availabilityOptionLabel(opt)}</h3><div class="availability-big-count"><strong>${c.total}</strong><span>personas pueden</span></div><p>${teams[f.home].name}: <b>${c.home}</b> · ${teams[f.away].name}: <b>${c.away}</b></p></div><div class="availability-option-actions">${c.total===best&&best>0?'<span class="best-option">⭐ Más gente disponible</span>':''}${confirmed?'<span class="confirmed-option">✓ Horario confirmado</span>':isAdmin()?`<button class="ghost compact-btn" type="button" data-confirm-option="${opt.id}">Confirmar horario</button>`:''}</div></article>`}).join('');
  $$('#availabilityOptions [data-confirm-option]').forEach(btn=>btn.addEventListener('click',()=>{if(!isAdmin())return;const d=availabilityData(matchId);d.confirmedOptionId=btn.dataset.confirmOption;saveAvailabilityData(matchId,d);renderAvailability();renderRounds();renderHomeDashboard();renderLive()}));

  $('#availabilityGrid').innerHTML=[f.home,f.away].map(teamKey=>`<section class="availability-team-votes"><div class="availability-team-head"><img src="${teams[teamKey].logo}" alt=""><h3>${teams[teamKey].name}</h3></div>${playersOf(teamKey).map(player=>{const editable=canVoteFor(player,matchId),responded=!!data.responded?.[player];return `<div class="availability-player-row"><div class="availability-player-name">${playerProfileButton(player)}${responded?'<span class="responded-dot" title="Ha votado">✓</span>':''}</div><div class="availability-player-options">${data.options.map((opt,i)=>`<button class="availability-vote-chip ${data.votes?.[player]?.[opt.id]?'selected':''}" type="button" data-player="${escapeHtml(player)}" data-option="${opt.id}" ${editable?'':'disabled'}>${data.votes?.[player]?.[opt.id]?'✓ ':''}${availabilityVoteLabel(opt)}</button>`).join('')}<button class="availability-none-chip ${responded&&!Object.values(data.votes?.[player]||{}).some(Boolean)?'selected':''}" type="button" data-player="${escapeHtml(player)}" data-none="true" ${editable?'':'disabled'}>Ninguna</button></div></div>`}).join('')}</section>`).join('');

  $$('#availabilityGrid [data-option]').forEach(btn=>btn.addEventListener('click',()=>{const player=btn.dataset.player;if(!canVoteFor(player,matchId))return;const d=availabilityData(matchId);d.votes[player]=d.votes[player]||{};d.votes[player][btn.dataset.option]=!d.votes[player][btn.dataset.option];d.responded[player]=true;saveAvailabilityData(matchId,d);renderAvailability()}));
  $$('#availabilityGrid [data-none]').forEach(btn=>btn.addEventListener('click',()=>{const player=btn.dataset.player;if(!canVoteFor(player,matchId))return;const d=availabilityData(matchId);d.votes[player]={};d.responded[player]=true;saveAvailabilityData(matchId,d);renderAvailability()}));

  const responded=[...playersOf(f.home),...playersOf(f.away)].filter(p=>data.responded?.[p]).length,totalPlayers=playersOf(f.home).length+playersOf(f.away).length;
  const user=currentUser(),hint=user?(isPlayer()&&linkedPlayer()?`Tu voto: ${linkedPlayer()}. Puedes marcar varias opciones.`:'Tu cuenta no tiene un jugador vinculado.'):'Inicia sesión como jugador para votar.';
  $('#availabilitySummary').innerHTML=`<b>Participación</b><br>${responded} de ${totalPlayers} jugadores han respondido.<br><small>${escapeHtml(hint)}</small>`;
}
$('#availabilityMatch').addEventListener('change',renderAvailability);
$('#saveAvailabilityOptions').addEventListener('click',()=>{if(!isAdmin())return;const matchId=$('#availabilityMatch').value,current=availabilityData(matchId),items=readAvailabilityEditors();if(items.some(x=>x?.invalid)||items.filter(Boolean).length!==3){$('#availabilityAdminMsg').textContent='Elige día de la semana y hora en los 3 días.';return}const labels=items.map(x=>`${x.date} ${x.time}`);if(new Set(labels).size!==3){$('#availabilityAdminMsg').textContent='Los 3 días/horas deben ser diferentes.';return}current.options=items;current.confirmedOptionId='';current.votes={};current.responded={};saveAvailabilityData(matchId,current);$('#availabilityAdminMsg').textContent='3 días guardados. Los jugadores ya pueden votar.';renderAvailability();renderRounds();renderHomeDashboard();renderLive()});
$('#clearAvailabilityOptions').addEventListener('click',()=>{if(!isAdmin())return;if(!confirm('¿Borrar los días propuestos y todos los votos de este partido?'))return;saveAvailabilityData($('#availabilityMatch').value,defaultAvailability());$('#availabilityAdminMsg').textContent='Días borrados.';renderAvailability();renderRounds();renderHomeDashboard();renderLive()});

function normalizeIdealSelection(saved){
  const empty=Object.fromEntries(IDEAL_POSITIONS.map(pos=>[pos.key,'']));
  if(Array.isArray(saved)){
    IDEAL_POSITIONS.forEach((pos,index)=>{empty[pos.key]=saved[index]||''});
    return empty;
  }
  if(saved&&typeof saved==='object'){
    IDEAL_POSITIONS.forEach(pos=>{empty[pos.key]=saved[pos.key]||''});
  }
  return empty;
}
function idealSelectionFromForm(){
  const data={};
  IDEAL_POSITIONS.forEach(pos=>{const select=$(`#idealFive select[data-position="${pos.key}"]`);data[pos.key]=select?.value||''});
  return data;
}
function idealPlayerCardHtml(pos,playerName,editable=isAdmin()){
  const meta=playerName?allPlayers.find(p=>p.name===playerName):null,team=meta?teams[meta.key]:null;
  const selectHtml=`<div class="ideal-picker"><label for="ideal-${pos.key}">Jugador</label><select id="ideal-${pos.key}" data-position="${pos.key}" ${editable?'':'disabled'}><option value="">Selecciona jugador</option>${allPlayers.map(p=>`<option value="${escapeHtml(p.name)}" ${playerName===p.name?'selected':''}>${escapeHtml(p.name)} · ${p.team}</option>`).join('')}</select>${editable?'':'<small>Solo el administrador puede editar.</small>'}</div>`;
  if(playerName){
    return `<article class="ideal-player-card filled ${pos.className}"><div class="ideal-card-top"><span class="ideal-role-tag">${pos.label}</span>${team?`<img class="ideal-team-logo" src="${team.logo}" alt="${escapeHtml(team.name)}">`:''}</div>${playerAvatarHtml(playerName,'ideal-avatar')}
      <div class="ideal-player-copy"><strong>${playerProfileButton(playerName)}</strong><small>${escapeHtml(meta?.team||'')}</small></div>${selectHtml}</article>`;
  }
  return `<article class="ideal-player-card empty ${pos.className}"><div class="ideal-card-top"><span class="ideal-role-tag">${pos.label}</span></div><span class="ideal-empty-avatar">${pos.short}</span><div class="ideal-player-copy"><strong>Sin asignar</strong><small>Elige un jugador</small></div>${selectHtml}</article>`;
}
function updateIdealPreview(selection=idealSelectionFromForm()){
  const pitch=$('#idealPitch');
  if(pitch){
    const editable=isAdmin();
    pitch.innerHTML='<div class="court-line"></div><div class="mid-line"></div><div class="center-circle"></div><div class="penalty-top"></div><div class="penalty-bottom"></div><div class="goal-top"></div><div class="goal-bottom"></div>'+IDEAL_POSITIONS.map(pos=>idealPlayerCardHtml(pos,selection[pos.key]||'',editable)).join('');
    $$('#idealPitch select').forEach(select=>select.addEventListener('change',()=>updateIdealPreview()));
  }
}
function renderIdeal(){
  const round=$('#idealRound').value,saved=normalizeIdealSelection(store.get(`ideal:${round}`,[])),editable=isAdmin();
  $('#idealFive').innerHTML=`<div class="ideal-board"><div class="ideal-pitch ideal-pitch-editor" id="idealPitch"></div></div>`;
  updateIdealPreview(saved);
  const complete=IDEAL_POSITIONS.every(pos=>saved[pos.key]);
  $('#saveIdeal').disabled=!editable;$('#idealSaved').textContent=complete?'5 ideal guardado para esta jornada.':editable?'Selecciona un jugador en cada posición y guarda.':'Solo el administrador puede modificar el 5 ideal.';
}
$('#idealRound').addEventListener('change',renderIdeal);
$('#saveIdeal').addEventListener('click',()=>{
  if(!isAdmin()){alert('Solo el administrador puede elegir el 5 ideal.');return}
  const vals=idealSelectionFromForm(),chosen=Object.values(vals).filter(Boolean);
  if(chosen.length!==5){alert('Selecciona los 5 jugadores de la formación.');return}
  if(new Set(chosen).size!==5){alert('No puedes repetir jugadores en el 5 ideal.');return}
  store.set(`ideal:${$('#idealRound').value}`,vals);renderIdeal()
});

function renderPlayerProfile(name){
  activePlayerName=name;const meta=allPlayers.find(p=>p.name===name);if(!meta)return;const st=playerStats()[name],team=teams[meta.key],photo=playerPhoto(name);
  $('#playerProfileName').textContent=name;$('#playerProfileAvatar').innerHTML=photo?`<img src="${photo}" alt="Foto de ${escapeHtml(name)}">`:escapeHtml(name.split(' ').map(x=>x[0]).slice(0,2).join(''));$('#playerProfileTeam').textContent=team.name;$('#playerProfileTeamLogo').src=team.logo;$('#playerProfileCaptain').hidden=!meta.captain;
  $('#playerProfileGoals').textContent=st.goals;$('#playerProfileAssists').textContent=st.assists;$('#playerProfileMvps').textContent=st.mvps;
  $('#playerPhotoControls').hidden=!canEditPlayerPhoto(name);$('#removePlayerPhoto').disabled=!photo;
  const pending=fixtures.filter(f=>(f.home===meta.key||f.away===meta.key)&&!getStateFor(f.id).finished).sort((a,b)=>Number(a.round)-Number(b.round))[0];
  if(pending){const opp=pending.home===meta.key?pending.away:pending.home,av=availabilityData(pending.id),confirmed=av.options.find(o=>o.id===av.confirmedOptionId),myVotes=av.votes?.[name]||{},selected=av.options.filter(o=>myVotes[o.id]).map(availabilityVoteLabel);$('#playerPendingMatch').innerHTML=`<article class="player-pending-card"><div class="pending-opponent"><img src="${teams[opp].logo}" alt=""><div><strong>${teams[meta.key].name} vs ${teams[opp].name}</strong><span>Jornada ${pending.round}</span></div></div><div class="pending-status"><strong>${confirmed?availabilityOptionLabel(confirmed):(av.options.length?'Fecha por confirmar':'Esperando propuestas')}</strong><small>${selected.length?`Has marcado: ${selected.join(', ')}`:'Todavía no has marcado disponibilidad.'}</small></div><button class="primary" type="button" data-player-pending="${pending.id}">${confirmed?'Ver disponibilidad':'Votar disponibilidad'}</button></article>`;$('#playerPendingMatch [data-player-pending]')?.addEventListener('click',e=>openAvailability(e.currentTarget.dataset.playerPending))}else{$('#playerPendingMatch').innerHTML='<div class="empty-state">No quedan partidos pendientes para este jugador.</div>'}
  const activity=[];
  fixtures.forEach(f=>{const state=getStateFor(f.id),relevant=(state.events||[]).filter(e=>e.scorer===name||e.assist===name),isMvp=state.mvp===name;if(!relevant.length&&!isMvp)return;const details=[];relevant.forEach(e=>{const score=e.scoreAfter?` · ${e.scoreAfter}`:'';if(e.scorer===name)details.push(`<span>⚽ Gol${score} · ${e.half}ª parte · ${e.minute}'${e.value===2?' · gol doble':''}</span>`);if(e.assist===name)details.push(`<span>🅰️ Asistencia a ${playerProfileButton(e.scorer)}${score} · ${e.half}ª parte · ${e.minute}'</span>`)});if(isMvp)details.push('<span>⭐ MVP del partido</span>');activity.push(`<article class="player-history-item"><div class="history-match-head"><div><strong>Jornada ${f.round}</strong><span>${teams[f.home].name} ${state.finished?state.homeScore:'–'} ${state.finished?state.awayScore:'–'} ${teams[f.away].name}</span></div><span class="history-status">${state.finished?'Finalizado':statusForFixture(f)}</span></div><div class="history-events">${details.join('')}</div></article>`)});
  $('#playerMatchHistory').innerHTML=activity.length?activity.join(''):'<div class="empty-state">Este jugador todavía no tiene goles, asistencias ni MVP registrados.</div>';
}
function openPlayer(name){playerReturnView=document.body.dataset.view==='jugador'?playerReturnView:(document.body.dataset.view||'equipos');renderPlayerProfile(name);navigate('jugador')}
document.addEventListener('click',e=>{const b=e.target.closest('[data-player-profile]');if(!b)return;e.preventDefault();openPlayer(b.dataset.playerProfile)});
$('#playerBack').addEventListener('click',()=>navigate(playerReturnView||'equipos'));
$('#teamBack').addEventListener('click',()=>navigate(teamReturnView||'equipos'));
document.addEventListener('click',e=>{const b=e.target.closest('[data-team-profile]');if(!b)return;e.preventDefault();openTeam(b.dataset.teamProfile)});

async function resizeImageFile(file){
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{const size=512,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d'),side=Math.min(img.width,img.height),sx=(img.width-side)/2,sy=(img.height-side)/2;ctx.drawImage(img,sx,sy,side,side,0,0,size,size);resolve(canvas.toDataURL('image/jpeg',.82))};img.src=reader.result};reader.readAsDataURL(file)})
}
$('#playerPhotoInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file||!activePlayerName)return;if(!canEditPlayerPhoto(activePlayerName)){alert('No tienes permiso para cambiar esta foto.');return}if(!file.type.startsWith('image/')){alert('Selecciona una imagen.');return}try{const data=await resizeImageFile(file);store.set(`playerPhoto:${activePlayerName}`,data);renderPlayerProfile(activePlayerName);renderTeams()}catch{alert('No se pudo procesar la imagen.')}finally{e.target.value=''}});
$('#removePlayerPhoto').addEventListener('click',()=>{if(!activePlayerName||!canEditPlayerPhoto(activePlayerName))return;store.remove(`playerPhoto:${activePlayerName}`);renderPlayerProfile(activePlayerName);renderTeams()});

$$('[data-classification-tab]').forEach(btn=>btn.addEventListener('click',()=>{const tab=btn.dataset.classificationTab;$$('[data-classification-tab]').forEach(b=>b.classList.toggle('active',b===btn));$('#classificationGroupPanel').hidden=tab!=='group';$('#classificationKnockoutPanel').hidden=tab!=='knockout'}));
$('#startNextMatch').addEventListener('click',()=>{const id=$('#startNextMatch').dataset.match;if(!id)return;openAvailability(id)});

function teamOptions(selected){return Object.entries(teams).map(([key,t])=>`<option value="${key}" ${selected===key?'selected':''}>${escapeHtml(t.name)}</option>`).join('')}
function fixtureHasData(id){const s=getStateFor(id),av=availabilityData(id),stream=streamData(id);return !!(s.finished||s.events?.length||s.mvp||av.options?.length||Object.keys(av.votes||{}).length||stream.liveUrl||stream.recordingUrl)}
function clearFixtureLinkedData(id){store.remove(`match:${id}`);store.remove(`availability:${id}`);store.remove(`stream:${id}`);const refs=refereeAssignments();if(refs[id]){delete refs[id];store.set('league:refereeAssignments',refs)}}
function refreshAfterFixtureEdit(preferredId=''){
  saveFixtures();
  populateMatchSelects();
  if(!fixtures.length){renderRounds();renderHomeDashboard();renderAdmin();return}
  const id=fixtures.some(f=>f.id===preferredId)?preferredId:fixtures[0].id;
  live.matchId=id;live.half=1;live.remaining=1200;stopTimer();
  if($('#matchSelect'))$('#matchSelect').value=id;
  if($('#availabilityMatch'))$('#availabilityMatch').value=id;
  if($('#streamMatchSelect'))$('#streamMatchSelect').value=id;
  renderRounds();renderHomeDashboard();renderStandings();renderLive();renderStreaming();renderAvailability();renderIdeal();renderAdmin();
}
function renderFixtureEditor(){
  const wrap=$('#fixtureEditor');if(!wrap)return;
  const ordered=fixtures.slice().sort((a,b)=>Number(a.round)-Number(b.round)||String(a.id).localeCompare(String(b.id)));
  wrap.innerHTML=ordered.length?ordered.map(f=>`<article class="fixture-edit-row" data-fixture-id="${f.id}"><div class="fixture-edit-main"><label>Jornada<input type="number" min="1" max="99" step="1" data-fixture-round value="${Number(f.round)||1}"></label><label>Local<select data-fixture-home>${teamOptions(f.home)}</select></label><span class="fixture-edit-vs">VS</span><label>Visitante<select data-fixture-away>${teamOptions(f.away)}</select></label></div><div class="fixture-edit-meta"><span>${escapeHtml(roundRestText(f.round))}</span><div class="fixture-edit-actions"><button class="secondary compact-btn" type="button" data-save-fixture>Guardar</button><button class="ghost compact-btn" type="button" data-delete-fixture>Eliminar</button></div></div></article>`).join(''):'<div class="empty-state">No hay partidos configurados.</div>';
  $$('#fixtureEditor [data-save-fixture]').forEach(btn=>btn.addEventListener('click',()=>{
    const row=btn.closest('[data-fixture-id]'),id=row.dataset.fixtureId,f=fixtures.find(x=>x.id===id);if(!f)return;
    const round=Math.max(1,Math.min(99,Number(row.querySelector('[data-fixture-round]').value)||1));
    const home=row.querySelector('[data-fixture-home]').value,away=row.querySelector('[data-fixture-away]').value;
    if(home===away){alert('El equipo local y visitante no pueden ser el mismo.');return}
    const teamsChanged=f.home!==home||f.away!==away;
    if(teamsChanged&&fixtureHasData(id)){
      const ok=confirm('Este partido ya tiene datos asociados (resultado, eventos, disponibilidad o vídeo). Si cambias los equipos, esos datos se borrarán para evitar mezclar estadísticas. ¿Continuar?');
      if(!ok)return;clearFixtureLinkedData(id);
    }
    f.round=round;f.home=home;f.away=away;delete f.rest;
    refreshAfterFixtureEdit(id);
  }));
  $$('#fixtureEditor [data-delete-fixture]').forEach(btn=>btn.addEventListener('click',()=>{
    const row=btn.closest('[data-fixture-id]'),id=row.dataset.fixtureId,f=fixtures.find(x=>x.id===id);if(!f)return;
    const warning=fixtureHasData(id)?' También se borrarán sus datos asociados (resultado, disponibilidad y vídeo).':'';
    if(!confirm(`¿Eliminar ${teams[f.home].name} vs ${teams[f.away].name} de la Jornada ${f.round}?${warning}`))return;
    if(fixtureHasData(id))clearFixtureLinkedData(id);
    fixtures=fixtures.filter(x=>x.id!==id);refreshAfterFixtureEdit();
  }));
}
async function renderAdmin(){
  if(!isAdmin())return;
  renderFixtureEditor();
  const usersWrap=$('#adminUsers');
  if(usersWrap)usersWrap.innerHTML='<div class="empty-state">Cargando usuarios de Supabase...</div>';

  const [{data:profiles,error:profilesError},{data:roles,error:rolesError},{data:dbPlayers,error:playersError}] = await Promise.all([
    supabaseClient.from('profiles').select('id,email,display_name,created_at').order('created_at',{ascending:true}),
    supabaseClient.from('user_roles').select('user_id,role'),
    supabaseClient.from('players').select('id,name,team_id,user_id,captain').order('team_id').order('name')
  ]);

  if(profilesError||rolesError||playersError){
    console.error('Error cargando usuarios',profilesError||rolesError||playersError);
    if(usersWrap)usersWrap.innerHTML='<div class="empty-state">No se pudieron cargar los usuarios desde Supabase. Recarga la página.</div>';
    return;
  }

  const list=(profiles||[]).map(p=>{
    const player=(dbPlayers||[]).find(x=>x.user_id===p.id)||null;
    return {
      id:p.id,
      email:p.email||'',
      displayName:p.display_name||((p.email||'').split('@')[0]),
      linkedPlayer:player?.name||null,
      linkedPlayerId:player?.id||null,
      roles:(roles||[]).filter(r=>r.user_id===p.id).map(r=>r.role)
    };
  });

  if(usersWrap){
    usersWrap.innerHTML=list.length?list.map(u=>{
      const self=u.email.toLowerCase()===LEAGUE_EMAIL;
      return `<article class="admin-user-card" data-user-id="${escapeHtml(u.id)}">
        <div class="admin-user-head"><div><strong>${escapeHtml(u.email)}</strong><span class="muted">${u.linkedPlayer?`Jugador: ${escapeHtml(u.linkedPlayer)}`:'Cuenta administrativa sin jugador'}</span></div><div class="role-row">${roleBadges(u)}</div></div>
        <div class="admin-user-controls">
          <label>Corregir jugador<select data-user-player ${self&&!u.linkedPlayer?'disabled':''}>
            <option value="">Sin jugador</option>
            ${(dbPlayers||[]).map(p=>{
              const occupied=!!p.user_id&&p.user_id!==u.id;
              return `<option value="${escapeHtml(p.id)}" ${u.linkedPlayerId===p.id?'selected':''} ${occupied?'disabled':''}>${escapeHtml(p.name)} · ${escapeHtml(teams[p.team_id]?.name||p.team_id)}${occupied?' · ocupado':''}</option>`;
            }).join('')}
          </select></label>
          <div class="role-checks">
            ${u.linkedPlayer?'<label><input type="checkbox" data-role="player" checked disabled> Jugador</label>':''}
            <label><input type="checkbox" data-role="referee" ${u.roles?.includes('referee')?'checked':''}> Árbitro</label>
            <label><input type="checkbox" data-role="admin" ${u.roles?.includes('admin')?'checked':''} ${self?'disabled title="La cuenta principal conserva Admin"':''}> Admin</label>
          </div>
          <button class="secondary" type="button" data-save-user>Guardar permisos</button>
        </div>
      </article>`;
    }).join(''):'<div class="empty-state">Todavía no hay usuarios registrados.</div>';
  }

  $$('#adminUsers [data-save-user]').forEach(btn=>btn.addEventListener('click',async()=>{
    const card=btn.closest('[data-user-id]'),id=card.dataset.userId,u=list.find(x=>x.id===id);if(!u)return;
    const select=card.querySelector('[data-user-player]');
    const selectedPlayerId=select&&!select.disabled?select.value:(u.linkedPlayerId||'');
    const self=u.email.toLowerCase()===LEAGUE_EMAIL;
    const selectedRoles=[...card.querySelectorAll('[data-role]:checked:not(:disabled)')].map(x=>x.dataset.role);
    if(self&&!selectedRoles.includes('admin'))selectedRoles.push('admin');
    if(selectedPlayerId&&!selectedRoles.includes('player'))selectedRoles.unshift('player');
    const desiredRoles=[...new Set(selectedRoles)];

    btn.disabled=true;btn.textContent='Guardando...';
    try{
      if(u.linkedPlayerId&&u.linkedPlayerId!==selectedPlayerId){
        const {error}=await supabaseClient.from('players').update({user_id:null}).eq('id',u.linkedPlayerId).eq('user_id',u.id);
        if(error)throw error;
      }
      if(selectedPlayerId&&selectedPlayerId!==u.linkedPlayerId){
        const target=(dbPlayers||[]).find(p=>p.id===selectedPlayerId);
        if(target?.user_id&&target.user_id!==u.id)throw new Error('Ese jugador ya está ocupado.');
        const {error}=await supabaseClient.from('players').update({user_id:u.id}).eq('id',selectedPlayerId);
        if(error)throw error;
        if(target?.name){
          const {error:profileError}=await supabaseClient.from('profiles').update({display_name:target.name}).eq('id',u.id);
          if(profileError)throw profileError;
        }
      }

      const {error:deleteError}=await supabaseClient.from('user_roles').delete().eq('user_id',u.id);
      if(deleteError)throw deleteError;
      if(desiredRoles.length){
        const {error:insertError}=await supabaseClient.from('user_roles').insert(desiredRoles.map(role=>({user_id:u.id,role})));
        if(insertError)throw insertError;
      }
      alert('Usuario actualizado correctamente.');
      await renderAdmin();
      await loadCurrentUserFromSupabase();
    }catch(err){
      console.error(err);alert(err?.message||'No se pudo actualizar el usuario.');
      btn.disabled=false;btn.textContent='Guardar permisos';
    }
  }));

  const refs=list.filter(u=>u.roles?.includes('referee'));
  const assigned=refereeAssignments();
  $('#refereeAssignments').innerHTML=fixtures.map(f=>`<div class="referee-row"><div><strong>Jornada ${f.round}</strong><span>${teams[f.home].name} vs ${teams[f.away].name}</span></div><select data-ref-match="${f.id}"><option value="">Sin árbitro asignado</option>${refs.map(u=>`<option value="${escapeHtml(u.email)}" ${assigned[f.id]===u.email?'selected':''}>${escapeHtml(u.linkedPlayer||u.displayName||u.email)}</option>`).join('')}</select></div>`).join('');
  $$('#refereeAssignments [data-ref-match]').forEach(sel=>sel.addEventListener('change',()=>{const data=refereeAssignments();if(sel.value)data[sel.dataset.refMatch]=sel.value;else delete data[sel.dataset.refMatch];store.set('league:refereeAssignments',data);refreshPermissionViews()}));
}



$('#addFixture')?.addEventListener('click',()=>{
  if(!isAdmin())return;
  const rounds=roundNumbers(),round=rounds.length?Math.max(...rounds):1;
  const keys=Object.keys(teams),id=`mcustom-${Date.now()}`;
  fixtures.push({id,round,home:keys[0],away:keys[1]});
  refreshAfterFixtureEdit(id);
});
$('#resetFixtures')?.addEventListener('click',()=>{
  if(!isAdmin())return;
  if(!confirm('¿Restaurar el calendario original de 10 jornadas? Los datos de partidos ya registrados no se borrarán, pero los partidos personalizados dejarán de aparecer.'))return;
  fixtures=defaultFixtures.map(f=>({...f}));
  refreshAfterFixtureEdit(fixtures[0]?.id||'');
});

function refreshPermissionViews(){
  refreshAuthUI();
  renderHomeDashboard();renderTeams();renderRankings();renderRounds();renderStandings();renderLive();renderStreaming();renderAvailability();renderIdeal();
  if(activePlayerName&&document.body.dataset.view==='jugador')renderPlayerProfile(activePlayerName);
  if(activeTeamKey&&document.body.dataset.view==='equipo')renderTeamProfile(activeTeamKey);
  if(document.body.dataset.view==='cuenta')renderAccountPanel();
  if(document.body.dataset.view==='admin'&&isAdmin())renderAdmin();
}
function refreshDataViews(){renderHomeDashboard();renderTeams();renderRankings();renderRounds();renderStandings();renderStreaming();if(activeTeamKey&&document.body.dataset.view==='equipo')renderTeamProfile(activeTeamKey)}

seedAccounts();
document.body.dataset.view='inicio';
renderHomeTeams();renderStandings();renderRounds();renderTeams();renderRankings();populateMatchSelects();renderLive();renderStreaming();renderAvailability();renderIdeal();renderHomeDashboard();renderRegisterPlayerOptions();refreshAuthUI();

// Ajustes de texto del antiguo prototipo local.
const loginPassLabel=document.querySelector('label[for="loginPassword"]');
const registerPassLabel=document.querySelector('label[for="registerPassword"]');
if(loginPassLabel)loginPassLabel.textContent='Contraseña';
if(registerPassLabel)registerPassLabel.textContent='Contraseña';
const accessIntro=document.querySelector('#view-acceso .page-head p');
if(accessIntro)accessIntro.textContent='Inicia sesión o crea tu cuenta. Los jugadores quedan vinculados a su ficha al registrarse.';

supabaseClient.auth.onAuthStateChange((_event,session)=>{
  loadCurrentUserFromSupabase(session?.user||null);
});
loadCurrentUserFromSupabase();

// v6 · configuración local de recordatorios (el envío real se conectará al backend al publicar)
function reminderSettings(){return store.get('league:reminders',{availabilityEnabled:true,availabilityCadence:'24',matchEnabled:true,match24:true,match2:true})}
function renderReminderSettings(){
  const a=$('#availabilityReminderEnabled'); if(!a)return;
  const s=reminderSettings();
  a.checked=!!s.availabilityEnabled;
  $('#availabilityReminderCadence').value=String(s.availabilityCadence||'24');
  $('#matchReminderEnabled').checked=!!s.matchEnabled;
  $('#matchReminder24').checked=s.match24!==false;
  $('#matchReminder2').checked=s.match2!==false;
}
$('#saveReminderSettings')?.addEventListener('click',()=>{
  if(!isAdmin()){alert('Solo el administrador puede configurar los recordatorios.');return}
  const settings={
    availabilityEnabled:$('#availabilityReminderEnabled').checked,
    availabilityCadence:$('#availabilityReminderCadence').value,
    matchEnabled:$('#matchReminderEnabled').checked,
    match24:$('#matchReminder24').checked,
    match2:$('#matchReminder2').checked
  };
  store.set('league:reminders',settings);
  $('#reminderSaved').textContent='Configuración de recordatorios guardada para la versión online.';
});

const _renderAdminV6=renderAdmin;
renderAdmin=function(){_renderAdminV6(); if(isAdmin())renderReminderSettings()};
