const supabaseClient = window.supabase.createClient(
  window.LIGA_SUPABASE.url,
  window.LIGA_SUPABASE.anonKey,
  {
    auth:{
      persistSession:true,
      autoRefreshToken:true,
      detectSessionInUrl:true,
      storage:window.localStorage
    }
  }
);

let authStateUser = null;
let authReady = false;
let authLoadPromise = null;
function withTimeout(promise, ms=10000, label='La operación'){
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} está tardando demasiado. Comprueba la conexión y vuelve a intentarlo.`)),ms)})
  ]).finally(()=>clearTimeout(timer));
}

const LEAGUE_EMAIL = 'ligainterna2026@gmail.com';

const teams = {
  aston:{name:'Aston Birra F.C.',logo:'assets/aston-birra.jpeg',players:[['Nico',true],['Joaquin',false],['José',false],['Ambrosio',false],['Álvaro',false],['Diego',false],['Dibu',false],['Mateo Lopez',false]]},
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
function migrateDoubleGoalRuleToLastTwoMinutes(){
  fixtures.forEach(f=>{
    const key=`match:${f.id}`,s=store.get(key,null);
    if(!s||!Array.isArray(s.events)||s.doubleGoalRuleVersion===3)return;
    let home=0,away=0;
    s.events.forEach(e=>{
      const realValue=Number(e.realValue ?? 1);
      const isSecondHalf=Number(e.half)===2;
      const isLastTwoMinutes=isSecondHalf&&Number(e.minute)>=19;
      const competitionValue=isLastTwoMinutes?2:1;
      e.realValue=realValue;
      e.competitionValue=competitionValue;
      e.value=competitionValue;
      e.doubleGoal=competitionValue===2;
      if(e.side==='home')home+=competitionValue;else if(e.side==='away')away+=competitionValue;
      e.homeScoreAfter=home;e.awayScoreAfter=away;e.scoreAfter=`${home}-${away}`;
    });
    s.homeScore=home;s.awayScore=away;
    s.doubleGoalRuleVersion=3;
    store.set(key,s);
  });
}
migrateDoubleGoalRuleToLastTwoMinutes();
function roundNumbers(){return [...new Set(fixtures.map(f=>Number(f.round)).filter(Number.isFinite))].sort((a,b)=>a-b)}
function restingTeamsForRound(round){const playing=new Set(fixtures.filter(f=>Number(f.round)===Number(round)).flatMap(f=>[f.home,f.away]));return Object.keys(teams).filter(k=>!playing.has(k))}
function roundRestText(round){const rest=restingTeamsForRound(round);if(rest.length===1)return `Descansa: ${teams[rest[0]].name}`;if(rest.length===0)return 'Descansa: ninguno';return `Sin jugar: ${rest.map(k=>teams[k].name).join(', ')}`}
function roundRestHtml(round){const rest=restingTeamsForRound(round);if(rest.length===1)return `Descansa: ${teamProfileInline(rest[0])}`;if(rest.length===0)return 'Descansa: ninguno';return `Sin jugar: ${rest.map(k=>teamProfileInline(k)).join(', ')}`}

const allPlayers = Object.entries(teams).flatMap(([key,t])=>t.players.map(([name,captain])=>({name,team:t.name,key,captain})));
const IDEAL_POSITIONS=[{key:'goalkeeper',label:'Portero',short:'POR',className:'goalkeeper'},{key:'cierre',label:'Cierre',short:'CIE',className:'cierre'},{key:'alaLeft',label:'Ala izquierda',short:'ALA',className:'ala-left'},{key:'alaRight',label:'Ala derecha',short:'ALA',className:'ala-right'},{key:'pivot',label:'Pivot',short:'PIV',className:'pivot'}];
let idealRemoteLoaded=false;
const NEWS_MATCHES=[{
  id:'j1-ordago-fener',round:1,fixtureId:'m2',home:'fener',away:'ordago',displayHome:'Fenerbahçupito',displayAway:'Ordago FC',score:'13–7',
  headline:'Victoria contundente de Fenerbahçupito',
  summary:'El primer periódico de la liga repasa el estreno entre Ordago FC y Fenerbahçupito: resultado, MVP, declaraciones, previa y curiosidades.',
  pages:[
    {image:'assets/noticias/j1-ordago-fener-01-resultado.png',tag:'FULL TIME',title:'Fenerbahçupito 13–7 Ordago FC',text:'El resumen gráfico del primer partido de la jornada.'},
    {image:'assets/noticias/j1-ordago-fener-02-mvp.png',tag:'MVP',title:'Mito, MVP del partido',text:'Seis goles y protagonismo total en el estreno.'},
    {image:'assets/noticias/j1-ordago-fener-03-previa.png',tag:'LA PREVIA',title:'Arnau antes del partido',text:'Las palabras del capitán de Fenerbahçupito antes del encuentro.'},
    {image:'assets/noticias/j1-ordago-fener-04-miguel.png',tag:'POST GAME',title:'Miguel analiza la derrota',text:'El capitán de Ordago FC deja sus sensaciones después del partido.'},
    {image:'assets/noticias/j1-ordago-fener-05-victor.png',tag:'POST GAME',title:'Victor, clave en la victoria',text:'Sensaciones tras el triunfo y valoración del encuentro.'},
    {image:'assets/noticias/j1-ordago-fener-06-mas.png',tag:'MÁS',title:'Voces antes del partido',text:'Entrevistas y declaraciones previas desde Pedralbes.'},
    {image:'assets/noticias/j1-ordago-fener-07-curiosidades-victor.png',tag:'CURIOSIDADES',title:'Lo que dejó el partido',text:'La cara más informal y humorística de la jornada.'},
    {image:'assets/noticias/j1-ordago-fener-08-curiosidades-pau.png',tag:'CURIOSIDADES',title:'La opinión de Pau Puig',text:'Pronósticos y comentarios sobre la liga, en tono humorístico.'}
  ]
},{
  id:'j1-celta-borrachia',round:1,fixtureId:'m1',home:'celta',away:'borrachia',displayHome:'Celta de Vino',displayAway:'Borrachia Dortmund',score:'10–3',
  headline:'Celta de Vino atropella a Borrachia Dortmund',
  summary:'El periódico del segundo partido de la Jornada 1: goleada del Celta, MVP de Guillem, declaraciones post partido, previa y las curiosidades que dejó el encuentro.',
  pages:[
    {image:'assets/noticias/j1-celta-borrachia-01-full-time.png',tag:'FULL TIME',title:'Celta de Vino 10–3 Borrachia Dortmund',text:'Resultado final, goleadores y resumen del encuentro.'},
    {image:'assets/noticias/j1-celta-borrachia-02-mvp.png',tag:'MVP',title:'Guillem, MVP del partido',text:'Goles, creación de juego y una actuación decisiva.'},
    {image:'assets/noticias/j1-celta-borrachia-03-joan-postgame.png',tag:'POST GAME',title:'Joan habla después de su gran partido',text:'El jugador del Celta destaca el esfuerzo colectivo.'},
    {image:'assets/noticias/j1-celta-borrachia-04-juan-previa.png',tag:'MÁS',title:'Juan, antes del encuentro',text:'La previa y su pronóstico antes de comenzar el partido.'},
    {image:'assets/noticias/j1-celta-borrachia-05-curiosidades-hugo.png',tag:'CURIOSIDADES',title:'Una entrevista con sorpresa',text:'Uno de los momentos más inesperados y humorísticos de la jornada.'},
    {image:'assets/noticias/j1-celta-borrachia-06-curiosidades-tension.png',tag:'CURIOSIDADES',title:'Tensión durante el encuentro',text:'La rivalidad entre Dani Piqué y Juan dejó uno de los momentos del partido.'},
    {image:'assets/noticias/j1-celta-borrachia-07-postgame-resumen.png',tag:'POST GAME',title:'El Celta de Vino se impone con claridad',text:'La goleada y las primeras reacciones después del encuentro.'},
    {image:'assets/noticias/j1-celta-borrachia-08-hugo.png',tag:'POST GAME',title:'Hugo analiza el partido',text:'El jugador de Borrachia reconoce que el equipo puede mejorar.'},
    {image:'assets/noticias/j1-celta-borrachia-09-miguel.png',tag:'POST GAME',title:'Miguel Cruz deja sus sensaciones',text:'Autocrítica tras el partido y mensaje para el equipo.'}
  ]
}];

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
  if(authLoadPromise)return authLoadPromise;
  authLoadPromise=(async()=>{
    try{
      let user=authUser;
      if(!user){
        const sessionResult=await withTimeout(supabaseClient.auth.getSession(),5000,'La recuperación de la sesión');
        user=sessionResult?.data?.session?.user||null;
      }
      if(!user){
        authStateUser=null;remoteRefereeMatchIds=new Set();authReady=true;refreshPermissionViews();
        try{await withTimeout(hydrateMatchDataFromSupabase(),7000,'La sincronización de partidos')}catch(err){console.warn(err)}
        restoreLastViewAfterAuth();return null;
      }
      let profileRes={data:null},rolesRes={data:[]},playerRes={data:null};
      try{
        [profileRes,rolesRes,playerRes] = await withTimeout(Promise.all([
          supabaseClient.from('profiles').select('display_name').eq('id',user.id).maybeSingle(),
          supabaseClient.from('user_roles').select('role').eq('user_id',user.id),
          supabaseClient.from('players').select('id,name,team_id,captain,photo_url').eq('user_id',user.id).maybeSingle()
        ]),8000,'La carga de la cuenta');
      }catch(accountLoadError){
        console.warn('La sesión está activa pero los datos de cuenta tardan en cargar.',accountLoadError);
      }
      const profile=profileRes?.data,roles=rolesRes?.data||[],player=playerRes?.data;
      authStateUser={
        id:user.id,
        email:user.email||'',
        displayName:profile?.display_name || user.user_metadata?.display_name || (user.email||'').split('@')[0],
        linkedPlayer:player?.name || null,
        linkedPlayerId:player?.id || null,
        linkedPlayerPhoto:player?.photo_url || null,
        roles:(roles||[]).map(r=>r.role)
      };
      authReady=true;
      try{await withTimeout(hydrateRefereePermissions(),5000,'Los permisos de árbitro')}catch(err){console.warn(err)}
      refreshPermissionViews();
      try{await withTimeout(hydrateMatchDataFromSupabase(),7000,'La sincronización de partidos')}catch(err){console.warn(err)}
      try{await withTimeout(migrateLinkedLocalPhoto(),5000,'La sincronización de la foto')}catch(err){console.warn(err)}
      if(document.body.dataset.view==='cuenta')renderAccountPanel();
      restoreLastViewAfterAuth();
      return authStateUser;
    }catch(err){
      console.error('Error cargando sesión',err);
      authReady=true;
      refreshPermissionViews();
      restoreLastViewAfterAuth();
      throw err;
    }finally{
      authLoadPromise=null;
    }
  })();
  return authLoadPromise;
}
async function setSession(email){
  if(!email){await supabaseClient.auth.signOut();authStateUser=null;refreshPermissionViews();return}
}
function hasRole(role,user=currentUser()){return !!user?.roles?.includes(role)}
function isAdmin(){return hasRole('admin')}
function isRegisteredGuest(){const u=currentUser();return !!u&&!u.linkedPlayer&&!hasRole('admin',u)&&!hasRole('referee',u)}
function isPlayer(){return hasRole('player')||isRegisteredGuest()}
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
  const guestMode=$('#registerTypeGuest')?.checked;
  select.disabled=guestMode||!available.length;
  select.required=!guestMode;
  const submit=$('#registerForm button[type="submit"]'); if(submit)submit.disabled=!guestMode&&!available.length;
  const msg=$('#registerMsg'); if(msg&&!available.length&&!guestMode)msg.textContent='Todos los jugadores ya tienen una cuenta vinculada. También puedes registrarte como invitado.';
}
function refereeAssignments(){return store.get('league:refereeAssignments',{})}
function assignedRefEmail(matchId){return refereeAssignments()[matchId]||''}
let remoteRefereeMatchIds=new Set();
async function hydrateRefereePermissions(){
  const u=currentUser();remoteRefereeMatchIds=new Set();if(!u)return;
  if(hasRole('admin',u)){remoteRefereeMatchIds=new Set(fixtures.map(f=>f.id));return}
  if(!hasRole('referee',u))return;
  const checks=await Promise.all(fixtures.map(async f=>{const {data,error}=await supabaseClient.rpc('can_referee',{fixture:f.id});return !error&&data?f.id:null}));
  remoteRefereeMatchIds=new Set(checks.filter(Boolean));
}
function canManageMatch(matchId){const u=currentUser();if(!u)return false;if(hasRole('admin',u))return true;return hasRole('referee',u)&&(remoteRefereeMatchIds.has(matchId)||assignedRefEmail(matchId).toLowerCase()===u.email.toLowerCase())}
function canEditPlayerPhoto(name){return isAdmin() || (isPlayer() && linkedPlayer()===name)}
function canVoteFor(name,matchId){return isAdmin()}

let viewHistory=[];
const RESTORABLE_VIEWS=new Set(['inicio','jornadas','clasificacion','equipos','goleadores','asistencias','mvps','jugadores','streaming','premios','directo','cuenta','acceso','admin']);
let pendingRestoredView=sessionStorage.getItem('league:lastView')||'inicio';
let restoredViewOnce=false;
function rememberView(view){if(RESTORABLE_VIEWS.has(view))sessionStorage.setItem('league:lastView',view)}
function restoreLastViewAfterAuth(){
  if(restoredViewOnce)return;restoredViewOnce=true;
  const wanted=RESTORABLE_VIEWS.has(pendingRestoredView)?pendingRestoredView:'inicio';
  navigate(wanted,{fromPop:true,fromBack:true,replaceHistory:true});
  history.replaceState({leagueInternal:true,leagueView:document.body.dataset.view||wanted,leagueDepth:0},'',location.href);
}
function navigate(view,{fromBack=false,fromPop=false,replaceHistory=false}={}){
  if(view==='disponibilidad')view=isAdmin()?'admin':'inicio';
  if(view==='admin'&&!isAdmin())view=currentUser()?'cuenta':'acceso';
  rememberView(view);
  const current=document.body.dataset.view;
  if(!fromBack&&!fromPop&&current&&current!==view){
    viewHistory.push(current);
    const currentDepth=Number(history.state?.leagueDepth||0);
    const nextState={leagueInternal:true,leagueView:view,leagueDepth:currentDepth+1};
    if(replaceHistory)history.replaceState(nextState,'',location.href);else history.pushState(nextState,'',location.href);
  }
  document.body.dataset.view=view;
  $$('.view').forEach(v=>v.classList.remove('active'));
  $$('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const target=$(`#view-${view}`); if(!target)return;
  target.classList.add('active');
  setMobileMenu(false);
  window.scrollTo({top:0,behavior:'smooth'});
  if(view==='inicio')renderHomeDashboard();
  if(view==='jornadas')renderRounds();
  if(view==='noticias')renderNews();
  if(view==='clasificacion')renderStandings();
  if(view==='equipos')renderTeams();
  if(view==='equipo'&&activeTeamKey)renderTeamProfile(activeTeamKey);
  if(view==='jugador'&&activePlayerName)renderPlayerProfile(activePlayerName);
  if(view==='goleadores'||view==='asistencias'||view==='mvps'||view==='jugadores')renderRankings();
  if(view==='streaming')renderStreaming();
  if(view==='premios'){renderIdeal();hydrateIdealFiveFromSupabase(true).then(()=>renderIdeal()).catch(err=>console.warn('No se pudo actualizar el 5 ideal',err));}
  if(view==='directo')renderLive();
  if(view==='cuenta')renderAccountPanel();
  if(view==='acceso')renderRegisterPlayerOptions();
  if(view==='admin')renderAdmin();
}
function goBack(fallback='inicio'){
  if(history.state?.leagueInternal&&Number(history.state?.leagueDepth||0)>0){history.back();return}
  const target=viewHistory.pop()||fallback;
  history.replaceState({leagueInternal:true,leagueView:target,leagueDepth:0},'',location.href);
  navigate(target,{fromBack:true,fromPop:true});
}
window.addEventListener('popstate',event=>{
  const dialog=$('#newsDialog');
  if((dialog?.open || newsDialogHistoryOpen) && !event.state?.newsModal){
    closeNewsImage({fromHistory:true});
    return;
  }
  const target=event.state?.leagueInternal?event.state.leagueView:'inicio';
  navigate(target||'inicio',{fromPop:true,fromBack:true});
});
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
$('#mobileNavBack')?.addEventListener('click',()=>{setMobileMenu(false);goBack('inicio')});
document.addEventListener('keydown',e=>{if(e.key==='Escape')setMobileMenu(false)});
$('#accountBtn').addEventListener('click',()=>navigate(currentUser()?'cuenta':'acceso'));

function refreshAuthUI(){
  const u=currentUser();
  $('#accountLabel').textContent=u?(u.linkedPlayer||u.displayName||u.email.split('@')[0]):'Entrar';
  $('#accountRole').textContent=u?(u.roles?.length?u.roles.map(roleLabel).join(' · '):(u.linkedPlayer?'Jugador':'Invitado')):'Visitante';
  const avatar=$('#accountAvatar');
  if(avatar){
    if(!u){
      avatar.innerHTML='👤';
      $('#accountBtn')?.setAttribute('aria-label','Entrar o registrarse');
    }else{
      const photo=u.linkedPlayer?(u.linkedPlayerPhoto||playerPhoto(u.linkedPlayer)):null;
      const label=u.linkedPlayer||u.displayName||u.email.split('@')[0]||'Cuenta';
      const initials=label.split(' ').map(x=>x[0]).filter(Boolean).slice(0,2).join('').toUpperCase()||'👤';
      avatar.innerHTML=photo?`<img src="${escapeHtml(photo)}" alt="Foto de ${escapeHtml(label)}">`:escapeHtml(initials);
      $('#accountBtn')?.setAttribute('aria-label',`Abrir cuenta de ${label}`);
    }
  }
  $$('.admin-only').forEach(el=>el.hidden=!isAdmin());
  $$('.admin-only-block').forEach(el=>el.hidden=!isAdmin());
}
function roleLabel(r){return r==='admin'?'Admin':r==='referee'?'Árbitro':r==='player'?'Jugador':r==='guest'?'Invitado':r}
function roleBadges(u){
  if(!u?.roles?.length)return '<span class="role guest">INVITADO</span>';
  return u.roles.map(r=>`<span class="role ${r==='referee'?'ref':r}">${roleLabel(r).toUpperCase()}</span>`).join(' ');
}
function renderAccountPanel(){
  const u=currentUser();
  if(!u){$('#accountPanel').innerHTML='<div class="panel"><h2>Estás navegando como visitante</h2><p class="muted">Puedes ver toda la competición, pero no editar datos.</p><button class="primary" type="button" data-open-access>Entrar o registrarse</button></div>';return}
  const playerMeta=u.linkedPlayer?allPlayers.find(p=>p.name===u.linkedPlayer):null;
  const team=playerMeta?teams[playerMeta.key]:null;
  const photo=u.linkedPlayer?playerPhoto(u.linkedPlayer):null;
  const initials=u.linkedPlayer?u.linkedPlayer.split(' ').map(x=>x[0]).slice(0,2).join(''):'👤';
  const avatar=photo?`<img src="${escapeHtml(photo)}" alt="Foto de ${escapeHtml(u.linkedPlayer)}">`:escapeHtml(initials);
  const linkedBlock=u.linkedPlayer?`<div class="account-player-link"><div class="account-linked-avatar">${avatar}</div><div><span class="eyebrow">JUGADOR VINCULADO</span><strong>${escapeHtml(u.linkedPlayer)}</strong><small>${team?teamProfileInline(playerMeta.key,team.name):''}</small></div></div>`:'';
  const photoControls=u.linkedPlayer?`<div class="account-photo-tools"><label class="photo-upload-btn" for="accountPhotoInput">📷 Cambiar foto</label><input id="accountPhotoInput" type="file" accept="image/*" hidden><button id="accountRemovePhoto" class="ghost" type="button" ${photo?'':'disabled'}>Quitar foto</button><span id="accountPhotoStatus" class="muted">La foto queda guardada en tu jugador y se verá en todos los dispositivos.</span></div>`:'';
  $('#accountPanel').innerHTML=`<section class="panel account-summary"><div class="account-summary-main"><span class="account-big-avatar">${avatar}</span><div><span class="eyebrow">SESIÓN ACTIVA</span><h2>${escapeHtml(u.linkedPlayer||u.displayName||'Usuario')}</h2><p class="muted">${escapeHtml(u.email)}</p><div class="role-row">${roleBadges(u)}</div></div></div><div class="account-actions">${u.linkedPlayer?`<button class="secondary" type="button" data-player-profile="${escapeHtml(u.linkedPlayer)}">Abrir mi ficha</button>`:''}${isAdmin()?'<button class="ghost" type="button" data-open-admin>Panel de administración</button>':''}<button id="logoutBtn" class="ghost" type="button">Cerrar sesión</button></div></section>${u.linkedPlayer?`<section class="panel account-linked-player">${linkedBlock}${photoControls}</section>`:''}<div class="notice">${u.linkedPlayer?'Esta cuenta está vinculada a '+escapeHtml(u.linkedPlayer)+'. La foto se administra aquí y queda asociada a su ficha de jugador.':'Estás registrado como invitado. Tienes los mismos permisos generales que un jugador, pero sin ficha de jugador vinculada.'}</div>`;
  $('#logoutBtn')?.addEventListener('click',async()=>{await setSession(null);navigate('inicio')});
  $('[data-open-admin]')?.addEventListener('click',()=>navigate('admin'));
  bindAccountPhotoControls();
}
document.addEventListener('click',e=>{const a=e.target.closest('[data-open-access]');if(a)navigate('acceso')});

$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=$('#loginEmail').value.trim().toLowerCase(), password=$('#loginPassword').value;
  const msg=$('#loginMsg'), submit=e.currentTarget.querySelector('button[type="submit"]');
  if(submit)submit.disabled=true;
  msg.textContent='Entrando...';
  try{
    const {data,error}=await withTimeout(supabaseClient.auth.signInWithPassword({email,password}),10000,'El inicio de sesión');
    if(error){
      msg.textContent='No se ha podido iniciar sesión. Revisa el correo y la contraseña.';
      return;
    }

    // La autenticación ya ha sido aceptada. No bloqueamos la entrada por cargas secundarias.
    authStateUser={
      id:data.user.id,
      email:data.user.email||email,
      displayName:data.user.user_metadata?.display_name || (data.user.email||email).split('@')[0],
      linkedPlayer:null,
      linkedPlayerId:null,
      linkedPlayerPhoto:null,
      roles:[]
    };
    authReady=true;
    refreshAuthUI();
    msg.textContent='Sesión iniciada.';
    navigate('cuenta');

    // Perfil, roles, fotos y partidos se completan en segundo plano.
    loadCurrentUserFromSupabase(data.user).catch(err=>{
      console.warn('La sesión está iniciada, pero alguna información secundaria tardó en cargar.',err);
      refreshAuthUI();
      if(document.body.dataset.view==='cuenta')renderAccountPanel();
    });
  }catch(err){
    console.error('Error de acceso',err);
    msg.textContent=err?.message?.includes('tardando demasiado')
      ?'La conexión está tardando demasiado. Vuelve a pulsar Entrar.'
      :'No se pudo conectar con el servidor. Inténtalo de nuevo.';
  }finally{
    if(submit)submit.disabled=false;
  }
});
$('#registerForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=$('#registerEmail').value.trim().toLowerCase(),password=$('#registerPassword').value;
  const guestMode=$('#registerTypeGuest')?.checked;
  const playerId=guestMode?'':$('#registerPlayer').value;
  const guestName=$('#registerGuestName')?.value.trim()||'';
  const msg=$('#registerMsg');
  if(!/^\S+@\S+\.\S+$/.test(email)){ msg.textContent='Introduce un correo válido.'; return; }
  if(password.length<6){msg.textContent='La contraseña debe tener al menos 6 caracteres.';return}
  if(guestMode&&!guestName){msg.textContent='Escribe tu nombre para registrarte como invitado.';return}
  if(!guestMode&&!playerId){msg.textContent='Selecciona qué jugador eres.';return}
  const selected=$('#registerPlayer').selectedOptions[0];
  const displayName=guestMode?guestName:(selected?.textContent?.replace(' · Capitán','').trim() || email.split('@')[0]);
  msg.textContent=guestMode?'Creando cuenta de invitado...':'Creando cuenta...';
  const metadata={display_name:displayName};
  if(playerId)metadata.player_id=playerId;
  const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:metadata}});
  if(error){
    const text=String(error.message||'').toLowerCase();
    msg.textContent=text.includes('already')?'Ese correo ya tiene una cuenta.':text.includes('jugador')?'Ese jugador ya está vinculado a otra cuenta.':'No se pudo crear la cuenta. Prueba de nuevo.';
    await renderRegisterPlayerOptions();
    return;
  }
  await renderRegisterPlayerOptions();
  if(data.session){
    await loadCurrentUserFromSupabase(data.user);
    msg.textContent=guestMode?'Cuenta de invitado creada.':'Cuenta creada y jugador vinculado.';
    navigate('cuenta');
  }else{
    msg.textContent='Cuenta creada. Revisa tu correo para confirmar la cuenta y después inicia sesión.';
  }
});
function updateRegistrationMode(){
  const guest=$('#registerTypeGuest')?.checked;
  const playerWrap=$('#registerPlayerFields'),guestWrap=$('#registerGuestFields'),select=$('#registerPlayer'),guestName=$('#registerGuestName'),submit=$('#registerForm button[type="submit"]'),note=$('#registerTypeNote');
  if(playerWrap)playerWrap.hidden=!!guest;if(guestWrap)guestWrap.hidden=!guest;
  if(select){select.required=!guest;select.disabled=!!guest||!select.options.length;}
  if(guestName)guestName.required=!!guest;
  if(submit)submit.textContent=guest?'Crear cuenta de invitado':'Crear cuenta y vincular jugador';
  if(note)note.innerHTML=guest?'Tendrás los <strong>mismos permisos generales que un jugador registrado</strong>, pero sin una ficha de jugador vinculada.':'Tu cuenta quedará vinculada al jugador elegido y tendrás el rol <strong>Jugador</strong>.';
  renderRegisterPlayerOptions();
}
$('#registerTypePlayer')?.addEventListener('change',updateRegistrationMode);
$('#registerTypeGuest')?.addEventListener('change',updateRegistrationMode);
$('#demoAdminLogin')?.closest('.demo-login-panel')?.setAttribute('hidden','');

function defaultMatchState(){return {homeScore:0,awayScore:0,events:[],shootoutEvents:[],shootoutActive:false,mvp:null,participants:[],finished:false,started:false}}
function getStateFor(id){return store.get(`match:${id}`,defaultMatchState())}
function playersOf(teamKey){return teams[teamKey].players.map(p=>p[0])}
function findFixture(id){return fixtures.find(f=>f.id===id)}
function fixtureLabel(f){return `J${f.round} · ${teams[f.home].name} vs ${teams[f.away].name}`}
function playerPhoto(name){return remotePlayerByName.get(name)?.photo_url || (authStateUser?.linkedPlayer===name?authStateUser.linkedPlayerPhoto:null) || store.get(`playerPhoto:${name}`,null)}
function playerAvatarHtml(name,extraClass=''){const photo=playerPhoto(name);return photo?`<span class="avatar ${extraClass}"><img src="${photo}" alt="Foto de ${escapeHtml(name)}"></span>`:`<span class="avatar ${extraClass}">${escapeHtml(name.split(' ').map(x=>x[0]).slice(0,2).join(''))}</span>`}
function repairBrokenImages(root=document){
  root.querySelectorAll('img').forEach(img=>{
    if(img.dataset.imageRepairBound)return;
    img.dataset.imageRepairBound='1';
    img.addEventListener('error',()=>{
      img.classList.add('image-load-failed');
      const teamKey=img.dataset.teamProfile;
      if(teamKey&&teams[teamKey]){
        img.alt=teams[teamKey].name;
        img.parentElement?.classList.add('image-fallback-parent');
      }
    });
  });
}
const playerProfileButton=name=>`<button type="button" class="player-name-button" data-player-profile="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
const teamProfileInline=(key,label=teams[key]?.name||key,extraClass='')=>`<span class="team-profile-inline ${extraClass}" data-team-profile="${escapeHtml(key)}" role="button" tabindex="0">${escapeHtml(label)}</span>`;
function markTeamProfileTarget(el,key){if(!el||!key||!teams[key])return;el.dataset.teamProfile=key;el.classList.add('team-profile-target');el.setAttribute('role','button');el.setAttribute('tabindex','0');el.setAttribute('aria-label',`Abrir ficha de ${teams[key].name}`)}

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
function availabilityStatus(matchId){return 'Fecha por decidir'}
function statusForFixture(f){const s=getStateFor(f.id);if(s.finished)return matchResultText(f,s);if(s.started)return `● EN JUEGO · ${s.homeScore}–${s.awayScore}`;return availabilityStatus(f.id)}
function fixtureQuickActions(f,context='round'){
  const s=getStateFor(f.id),editable=canManageMatch(f.id),prefix=context==='home'?'home-':'';
  if(s.finished)return `<button class="ghost compact-btn" type="button" data-${prefix}acta="${f.id}">📋 Ver acta</button>`;
  if(s.started)return `<button class="${editable?'primary':'ghost'} compact-btn" type="button" data-${prefix}live="${f.id}">${editable?'🎛️ Gestionar partido':'🔴 Ver directo'}</button>`;
  return editable?`<button class="primary compact-btn" type="button" data-${prefix}start="${f.id}">⚽ Iniciar partido</button>`:'';
}
function bindFixtureQuickActions(root=document){
  root.querySelectorAll('[data-acta],[data-live],[data-start]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();openLiveMatch(btn.dataset.acta||btn.dataset.live||btn.dataset.start)}));
  root.querySelectorAll('[data-home-acta],[data-home-live],[data-home-start]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();openLiveMatch(btn.dataset.homeActa||btn.dataset.homeLive||btn.dataset.homeStart)}));
}
function renderRounds(){
  const rounds=roundNumbers();
  if(!rounds.length){$('#rounds').innerHTML='<div class="empty-state">No hay jornadas configuradas.</div>';return}
  $('#rounds').innerHTML=rounds.map(r=>{
    const fs=fixtures.filter(f=>Number(f.round)===Number(r));
    return `<article class="round-card"><div class="round-head"><h3>Jornada ${r}</h3><span>${roundRestHtml(r)}</span></div>${fs.map(f=>{
      const s=getStateFor(f.id),playing=s.started&&!s.finished,finished=s.finished,center=finished?matchResultText(f,s):(playing?`${s.homeScore}–${s.awayScore}`:'VS');
      return `<div class="fixture-row-wrap ${playing?'fixture-live':''}"><button class="fixture-button ${playing?'fixture-live':''}" type="button" data-match-primary="${f.id}" aria-label="Abrir partido de ${teams[f.home].name} contra ${teams[f.away].name}"><div class="fixture-team"><img src="${teams[f.home].logo}" alt="" data-team-profile="${f.home}" class="team-profile-target"><span class="team-profile-inline" data-team-profile="${f.home}" role="button" tabindex="0">${teams[f.home].name}</span></div><b class="fixture-score">${center}</b><div class="fixture-team right"><span class="team-profile-inline" data-team-profile="${f.away}" role="button" tabindex="0">${teams[f.away].name}</span><img src="${teams[f.away].logo}" alt="" data-team-profile="${f.away}" class="team-profile-target"></div><span class="fixture-status">${statusForFixture(f)}</span></button><div class="fixture-inline-actions">${fixtureQuickActions(f,'round')}</div></div>`;
    }).join('')}</article>`;
  }).join('');
  $$('#rounds [data-match-primary]').forEach(b=>b.addEventListener('click',()=>{const f=findFixture(b.dataset.matchPrimary),state=f?getStateFor(f.id):null;if(!f)return;(state?.finished||state?.started)?openLiveMatch(f.id):openAvailability(f.id)}));
  bindFixtureQuickActions($('#rounds'));
}
function openAvailability(matchId){if(!isAdmin())return;navigate('admin')}

function playerStats(){
  const stats={}; allPlayers.forEach(p=>stats[p.name]={name:p.name,team:p.team,key:p.key,goals:0,realGoals:0,assists:0,mvps:0});
  fixtures.forEach(f=>{const s=getStateFor(f.id);(s.events||[]).forEach(e=>{if(stats[e.scorer]){stats[e.scorer].goals+=Number(e.competitionValue ?? e.value ?? 1);stats[e.scorer].realGoals+=Number(e.realValue ?? 1)}if(e.assist&&stats[e.assist])stats[e.assist].assists+=1});if(s.mvp&&stats[s.mvp])stats[s.mvp].mvps+=1});
  return stats;
}
const PLAYER_POINTS={goal:4,assist:2,mvp:3,win:2,draw:0,loss:0};
function automaticParticipantNames(state){
  const names=new Set();
  (state?.events||[]).forEach(e=>{if(e.scorer)names.add(e.scorer);if(e.assist)names.add(e.assist)});
  (state?.shootoutEvents||[]).forEach(e=>{if(e.player)names.add(e.player)});
  if(state?.mvp)names.add(state.mvp);
  return names;
}
function participantNames(state){return new Set([...(state?.participants||[]),...automaticParticipantNames(state)])}
function shootoutScore(state){
  const rows=state?.shootoutEvents||[];
  return {home:rows.filter(e=>e.side==='home'&&e.scored).length,away:rows.filter(e=>e.side==='away'&&e.scored).length,homeAttempts:rows.filter(e=>e.side==='home').length,awayAttempts:rows.filter(e=>e.side==='away').length};
}
function shootoutWinnerSide(state){
  if(Number(state?.homeScore)!==Number(state?.awayScore))return null;
  const sc=shootoutScore(state),min=Math.min(sc.homeAttempts,sc.awayAttempts);
  if(sc.homeAttempts>=3&&sc.awayAttempts>=3&&sc.homeAttempts===sc.awayAttempts&&sc.home!==sc.away)return sc.home>sc.away?'home':'away';
  return null;
}
function matchWinnerSide(state){
  if(Number(state?.homeScore)>Number(state?.awayScore))return 'home';
  if(Number(state?.awayScore)>Number(state?.homeScore))return 'away';
  return shootoutWinnerSide(state);
}
function shootoutComplete(state){return !!shootoutWinnerSide(state)}
function shootoutSummary(state,f){
  if(Number(state?.homeScore)!==Number(state?.awayScore)||(state?.shootoutEvents||[]).length===0)return '';
  const sc=shootoutScore(state),winner=shootoutWinnerSide(state),winnerName=winner&&f?teams[f[winner]].name:'';
  return `Shootouts ${sc.home}–${sc.away}${winnerName?` · Gana ${winnerName}`:''}`;
}
function matchResultText(f,state){
  const base=`${state.homeScore}–${state.awayScore}`,extra=shootoutSummary(state,f);
  return extra?`${base} · ${extra}`:base;
}
function nextShootoutSide(state){
  const sc=shootoutScore(state);
  if(sc.homeAttempts<3||sc.awayAttempts<3)return sc.homeAttempts===sc.awayAttempts?'home':'away';
  if(sc.homeAttempts===sc.awayAttempts)return 'home';
  return 'away';
}
function playerRankingStats(){
  const base=playerStats(),rows={};
  allPlayers.forEach(p=>{const st=base[p.name];rows[p.name]={...st,played:0,wins:0,draws:0,losses:0,resultPoints:0,total:0}});
  fixtures.forEach(f=>{
    const state=getStateFor(f.id);if(!state.finished)return;
    const participants=participantNames(state),winner=matchWinnerSide(state),homeWon=winner==='home',awayWon=winner==='away',draw=!winner;
    participants.forEach(name=>{
      const row=rows[name],meta=allPlayers.find(p=>p.name===name);if(!row||!meta||(meta.key!==f.home&&meta.key!==f.away))return;
      row.played+=1;
      if(draw){row.draws+=1;row.resultPoints+=PLAYER_POINTS.draw}
      else if((meta.key===f.home&&homeWon)||(meta.key===f.away&&awayWon)){row.wins+=1;row.resultPoints+=PLAYER_POINTS.win}
      else row.losses+=1;
    });
  });
  Object.values(rows).forEach(row=>{row.total=row.realGoals*PLAYER_POINTS.goal+row.assists*PLAYER_POINTS.assist+row.mvps*PLAYER_POINTS.mvp+row.resultPoints});
  return rows;
}
function playerRoundStats(name,round){
  let goals=0,assists=0,mvps=0;
  fixtures.filter(f=>Number(f.round)===Number(round)).forEach(f=>{
    const state=getStateFor(f.id);
    (state.events||[]).forEach(e=>{if(e.scorer===name)goals+=1;if(e.assist===name)assists+=1});
    if(state.mvp===name)mvps+=1;
  });
  return {goals,assists,mvps};
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
  return rows.slice(-5).map(f=>{const s=getStateFor(f.id),winner=matchWinnerSide(s);if(!winner)return 'E';return (winner==='home'&&f.home===key)||(winner==='away'&&f.away===key)?'G':'P'});
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
    {const winner=matchWinnerSide(m.state);if(winner==='home')h.pts+=3;else if(winner==='away')a.pts+=3}
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
    {const winner=matchWinnerSide(s);if(winner==='home'){h.pg++;a.pp++;h.pts+=3}else if(winner==='away'){a.pg++;h.pp++;a.pts+=3}}
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
  $('#standingsBody').innerHTML=table.map((r,i)=>{const liveClass=r.live?` live-row live-${r.live.side}`:'',liveCell=r.live?`<button class="live-score-pill" type="button" data-live-match="${r.live.matchId}"><span>EN JUEGO</span><strong>${r.live.score}</strong></button>`:'<span class="muted">—</span>';return `<tr class="${liveClass.trim()}"><td class="pos">${i+1}</td><td><button class="standings-team standings-team-button" type="button" data-team-profile="${r.key}"><img src="${teams[r.key].logo}" alt=""><strong>${r.name}</strong>${r.live?'<em>● EN JUEGO</em>':''}</button></td><td>${r.pj}</td><td>${r.pg}</td><td>${r.pp}</td><td>${r.gf}</td><td>${r.gc}</td><td>${r.dg>0?'+':''}${r.dg}</td><td class="points">${r.pts}${r.live?'<small class="provisional-pts">PROV.</small>':''}</td><td><div class="form-dashes">${[...Array(5)].map((_,j)=>{const v=r.form[r.form.length-5+j];return `<span class="${v?`form-${v.toLowerCase()}`:''}">${v||'–'}</span>`}).join('')}</div></td><td>${liveCell}</td></tr>`}).join('');
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
  $('#scorersBody').innerHTML=scorers.map((p,i)=>`<tr><td class="pos">${i+1}</td><td>${rankingPlayerCell(p)}</td><td>${teamProfileInline(p.key,p.team)}</td><td class="points emoji-stat">⚽ ${p.goals}</td><td class="emoji-stat">🥅 ${p.realGoals}</td></tr>`).join('');
  $('#assistsBody').innerHTML=assists.map((p,i)=>`<tr><td class="pos">${i+1}</td><td>${rankingPlayerCell(p)}</td><td>${teamProfileInline(p.key,p.team)}</td><td class="points emoji-stat">🅰️ ${p.assists}</td></tr>`).join('');
  if($('#mvpsBody'))$('#mvpsBody').innerHTML=mvps.map((p,i)=>`<tr><td class="pos">${i+1}</td><td>${rankingPlayerCell(p)}</td><td>${teamProfileInline(p.key,p.team)}</td><td class="points emoji-stat">⭐ ${p.mvps}</td></tr>`).join('');
  const combined=Object.values(playerRankingStats()).sort((a,b)=>b.total-a.total||b.realGoals-a.realGoals||b.assists-a.assists||b.mvps-a.mvps||a.name.localeCompare(b.name,'es'));
  $('#playersRankingBody').innerHTML=combined.map((p,i)=>`<tr><td class="pos">${i+1}</td><td>${rankingPlayerCell(p)}</td><td>${teamProfileInline(p.key,p.team)}</td><td class="emoji-stat">⚽ ${p.realGoals}</td><td class="emoji-stat">🅰️ ${p.assists}</td><td class="emoji-stat">⭐ ${p.mvps}</td><td class="points"><strong>${p.total}</strong></td></tr>`).join('');
}
function renderTeamProfile(key){
  const t=teams[key];if(!t)return;activeTeamKey=key;const stats=playerStats(),table=standingsData(),row=table.find(r=>r.key===key),position=table.findIndex(r=>r.key===key)+1;
  $('#teamProfileLogo').src=t.logo;markTeamProfileTarget($('#teamProfileLogo'),key);$('#teamProfileName').textContent=t.name;markTeamProfileTarget($('#teamProfileName'),key);$('#teamProfileMeta').textContent=`${t.players.length} jugadores · ${position}º · ${row?.pts||0} puntos · DG ${row?.dg>0?'+':''}${row?.dg||0}`;
  const played=fixtures.filter(f=>(f.home===key||f.away===key)&&getStateFor(f.id).finished).sort((a,b)=>Number(b.round)-Number(a.round)).slice(0,5),upcoming=fixtures.filter(f=>(f.home===key||f.away===key)&&!getStateFor(f.id).finished).sort((a,b)=>Number(a.round)-Number(b.round)).slice(0,5);
  $('#teamRecentMatches').innerHTML=played.length?played.map(f=>teamMatchHtml(f,key,true)).join(''):'<div class="empty-state">Todavía no ha jugado partidos.</div>';
  $('#teamUpcomingMatches').innerHTML=upcoming.length?upcoming.map(f=>teamMatchHtml(f,key,false)).join(''):'<div class="empty-state">No quedan partidos pendientes.</div>';
  $('#teamProfileRoster').innerHTML=t.players.map(([p,c])=>`<div class="player-row">${playerAvatarHtml(p)}<span>${playerProfileButton(p)}</span>${c?'<span class="captain" title="Capitán">C</span>':'<span></span>'}<span class="player-stat">⚽ ${stats[p]?.goals||0}</span><span class="player-stat">🅰️ ${stats[p]?.assists||0}</span><span class="player-stat">⭐ ${stats[p]?.mvps||0}</span></div>`).join('');
  $$('#teamRecentMatches [data-team-live]').forEach(b=>b.addEventListener('click',()=>openLiveMatch(b.dataset.teamLive)));
}
function teamMatchHtml(f,key,finished){
  const s=getStateFor(f.id),opponent=f.home===key?f.away:f.home,isHome=f.home===key,score=finished?(Number(s.homeScore)===Number(s.awayScore)&&s.shootoutEvents?.length?`${isHome?s.homeScore:s.awayScore}–${isHome?s.awayScore:s.homeScore}<small>${shootoutSummary(s,f)}</small>`:(isHome?`${s.homeScore}–${s.awayScore}`:`${s.awayScore}–${s.homeScore}`)):'VS';
  const action=finished?`<button class="ghost compact-btn" type="button" data-team-live="${f.id}">Ver acta</button>`:'';
  return `<article class="team-match-row"><img src="${teams[opponent].logo}" alt="" data-team-profile="${opponent}" class="team-profile-target"><div><strong>${teamProfileInline(opponent)}</strong><small>Jornada ${f.round} · ${finished?'Finalizado':'Fecha por decidir'}</small></div><b>${score}</b>${action}</article>`
}

function homeRoundPlayerStats(round){
  const stats={};
  allPlayers.forEach(p=>{
    stats[p.name]={
      name:p.name,
      team:p.team,
      key:p.key,
      goals:0,
      realGoals:0,
      assists:0,
      mvps:0
    };
  });
  fixtures
    .filter(f=>Number(f.round)===Number(round))
    .forEach(f=>{
      const state=getStateFor(f.id);
      (state.events||[]).forEach(e=>{
        if(e.scorer&&stats[e.scorer]){
          stats[e.scorer].goals+=Number(e.competitionValue??e.value??1);
          stats[e.scorer].realGoals+=Number(e.realValue??1);
        }
        if(e.assist&&stats[e.assist])stats[e.assist].assists+=1;
      });
      if(state.mvp&&stats[state.mvp])stats[state.mvp].mvps+=1;
    });
  return Object.values(stats);
}

function defaultHomeHighlightsRound(){
  const rounds=roundNumbers();
  const withData=rounds.filter(r=>fixtures.some(f=>Number(f.round)===Number(r)&&(()=>{const s=getStateFor(f.id);return !!(s.finished||s.events?.length||s.mvp)})()));
  return withData.length?Math.max(...withData):rounds[0]||1;
}
function renderHomeRoundHighlights(){
  const select=$('#homeHighlightsRound');if(!select)return;
  const rounds=roundNumbers(),previous=Number(select.value),selected=rounds.includes(previous)?previous:defaultHomeHighlightsRound();
  select.innerHTML=rounds.map(r=>`<option value="${r}" ${Number(r)===Number(selected)?'selected':''}>Jornada ${r}</option>`).join('');
  select.onchange=()=>renderHomeRoundHighlights();
  const round=Number(select.value||selected),rows=homeRoundPlayerStats(round);
  $('#homeHighlightsTitle').textContent=`Jugadores destacados · Jornada ${round}`;
  const best=(field)=>rows.slice().sort((a,b)=>b[field]-a[field]||b.realGoals-a.realGoals||a.name.localeCompare(b.name,'es'))[0];
  const topG=best('goals'),topA=best('assists');
  const roundMvps=fixtures
    .filter(f=>Number(f.round)===round)
    .map(f=>({fixture:f,state:getStateFor(f.id)}))
    .filter(x=>x.state?.mvp)
    .map(x=>({name:x.state.mvp,match:`${teams[x.fixture.home].name} vs ${teams[x.fixture.away].name}`}));
  const topItems=[['#homeTopScorer','#homeTopScorerMeta',topG,'goals','⚽','goles'],['#homeTopAssist','#homeTopAssistMeta',topA,'assists','🅰️','asistencias']];
  topItems.forEach(([btnSel,metaSel,p,field,icon,label])=>{const n=p?.[field]||0,btn=$(btnSel);btn.innerHTML=n&&p?`${playerAvatarHtml(p.name,'home-stat-avatar')}<span>${escapeHtml(p.name)}</span>`:'<span class="home-stat-empty">—</span>';btn.disabled=!n;if(n)btn.dataset.playerProfile=p.name;else delete btn.dataset.playerProfile;$(metaSel).textContent=field==='goals'&&p?`${icon} ${n} competición · 🥅 ${p.realGoals} reales`:`${icon} ${n} ${label}`});
  [['#homeMvp1','#homeMvp1Meta',roundMvps[0]],['#homeMvp2','#homeMvp2Meta',roundMvps[1]]].forEach(([btnSel,metaSel,mvp],idx)=>{
    const btn=$(btnSel),meta=$(metaSel);if(!btn||!meta)return;
    if(mvp){btn.innerHTML=`${playerAvatarHtml(mvp.name,'home-stat-avatar')}<span>${escapeHtml(mvp.name)}</span>`;btn.disabled=false;btn.dataset.playerProfile=mvp.name;meta.textContent=`⭐ MVP · Partido ${idx+1}`;}
    else{btn.innerHTML='<span class="home-stat-empty">—</span>';btn.disabled=true;delete btn.dataset.playerProfile;meta.textContent=`⭐ MVP · Partido ${idx+1}`;}
  });
}
function renderHomeDashboard(){
  const finished=fixtures.filter(f=>getStateFor(f.id).finished).slice().reverse().slice(0,3),pending=fixtures.filter(f=>!getStateFor(f.id).finished).slice(0,3);
  const allStandings=standingsData(),homeTable=$('#homeStandingsTop');
  if(homeTable)homeTable.innerHTML=allStandings.map((r,i)=>`<button type="button" class="home-standing-row" data-team-profile="${r.key}"><span class="home-standing-pos">${i+1}</span><img src="${teams[r.key].logo}" alt="Escudo de ${escapeHtml(r.name)}"><strong>${escapeHtml(r.name)}</strong><span class="home-standing-points">${r.pts} <small>PTS</small></span></button>`).join('');
  if($('#recentResults'))$('#recentResults').innerHTML=finished.length?finished.map(f=>homeMatchHtml(f,true)).join(''):'<div class="empty-state">Todavía no se ha finalizado ningún partido.</div>';
  if($('#upcomingMatches'))$('#upcomingMatches').innerHTML=pending.length?pending.map(f=>homeMatchHtml(f,false)).join(''):'<div class="empty-state">No quedan partidos pendientes.</div>';
  if($('#recentResults'))bindFixtureQuickActions($('#recentResults'));
  if($('#upcomingMatches'))bindFixtureQuickActions($('#upcomingMatches'));
  try{renderHomeRoundHighlights()}catch(err){console.warn('No se pudieron pintar todavía los destacados',err)}
  try{renderNextMatchCard()}catch(err){console.warn('No se pudo pintar todavía el próximo partido',err)}
  repairBrokenImages($('#view-inicio')||document);
}
function homeMatchHtml(f,finished){
  const s=getStateFor(f.id),playing=s.started&&!s.finished;
  return `<div class="home-match home-match-with-actions"><div class="home-match-main"><div class="club"><img src="${teams[f.home].logo}" alt="" data-team-profile="${f.home}" class="team-profile-target"><div><strong>${teamProfileInline(f.home)}</strong><small>Jornada ${f.round}</small></div></div><strong>${finished?matchResultText(f,s):(playing?`${s.homeScore}–${s.awayScore}`:'VS')}</strong><div class="club"><div><strong>${teamProfileInline(f.away)}</strong><small>${finished?'Finalizado':playing?'En juego':'Fecha por decidir'}</small></div><img src="${teams[f.away].logo}" alt="" data-team-profile="${f.away}" class="team-profile-target"></div></div><div class="home-match-actions">${fixtureQuickActions(f,'home')}</div></div>`;
}
function nextPendingFixture(){return fixtures.find(f=>!getStateFor(f.id).finished)||null}
function ensureNextMatchRefereeButton(){
  let btn=$('#nextMatchReferee');if(btn)return btn;
  btn=document.createElement('button');btn.id='nextMatchReferee';btn.className='secondary full';btn.type='button';btn.hidden=true;$('#startNextMatch')?.insertAdjacentElement('afterend',btn);
  btn.addEventListener('click',()=>{const id=btn.dataset.match;if(id)openLiveMatch(id)});return btn;
}
function renderNextMatchCard(){
  const f=nextPendingFixture(),btn=$('#startNextMatch'),refBtn=ensureNextMatchRefereeButton();
  if(!f){$('#nextRoundBadge').textContent='Temporada completada';$('#nextHomeName').textContent='—';$('#nextAwayName').textContent='—';[$('#nextHomeName'),$('#nextAwayName'),$('#nextHomeLogo'),$('#nextAwayLogo')].forEach(el=>{if(!el)return;delete el.dataset.teamProfile;el.classList.remove('team-profile-target');el.removeAttribute('role');el.removeAttribute('tabindex');el.removeAttribute('aria-label')});$('#nextHomeLogo').removeAttribute('src');$('#nextAwayLogo').removeAttribute('src');$('#nextMatchStatus').textContent='No quedan partidos pendientes';btn.disabled=true;refBtn.hidden=true;return}
  const state=getStateFor(f.id);
  $('#nextRoundBadge').textContent=`Jornada ${f.round}`;$('#nextHomeLogo').src=teams[f.home].logo;markTeamProfileTarget($('#nextHomeLogo'),f.home);$('#nextAwayLogo').src=teams[f.away].logo;markTeamProfileTarget($('#nextAwayLogo'),f.away);$('#nextHomeName').textContent=teams[f.home].name;markTeamProfileTarget($('#nextHomeName'),f.home);$('#nextAwayName').textContent=teams[f.away].name;markTeamProfileTarget($('#nextAwayName'),f.away);$('#nextMatchStatus').textContent=state.started?`● EN JUEGO · ${state.homeScore}–${state.awayScore}`:'Fecha por decidir';btn.hidden=true;btn.disabled=true;
  refBtn.hidden=!canManageMatch(f.id);refBtn.dataset.match=f.id;refBtn.textContent=state.started?'🎛️ Gestionar partido':'⚽ Iniciar partido';
}

function populateMatchSelects(){
  const opts=fixtures.map(f=>`<option value="${f.id}">${fixtureLabel(f)}</option>`).join('');
  $('#matchSelect').innerHTML=opts;$('#streamMatchSelect').innerHTML=opts;
  const rounds=roundNumbers();
  $('#idealRound').innerHTML=rounds.map(r=>`<option value="${r}">Jornada ${r}</option>`).join('');
}

function restoreLiveClockFromState(matchId){
  const s=getStateFor(matchId);
  live.half=Number(s.liveHalf||1);
  live.remaining=Math.max(0,Math.min(1200,Number.isFinite(Number(s.clockSeconds))?Number(s.clockSeconds):1200));
  live.running=false;
}
function openLiveMatch(matchId){if(!findFixture(matchId))return;stopTimer();live.matchId=matchId;restoreLiveClockFromState(matchId);if($('#matchSelect'))$('#matchSelect').value=matchId;renderLive();navigate('directo')}

let live={matchId:'m1',half:1,remaining:1200,running:false,interval:null};
function matchStateKey(){return `match:${live.matchId}`}
function getMatchState(){return store.get(matchStateKey(),defaultMatchState())}
function saveMatchState(s){
  s={...defaultMatchState(),...s,participants:Array.isArray(s?.participants)?s.participants:[]};
  s.liveHalf=live.half;s.clockSeconds=live.remaining;s.clockRunning=!!live.running;
  store.set(matchStateKey(),s);
  queueMatchStateSync(live.matchId,s);
}


// v29 · Supabase como fuente compartida de los datos de partido.
let remotePlayerByName=new Map(),remotePlayerById=new Map(),matchHydratePromise=null;
const matchSyncChains=new Map();
function matchStateHasData(s){return !!(s&&(s.finished||s.started||Number(s.homeScore)>0||Number(s.awayScore)>0||(s.events||[]).length||(s.shootoutEvents||[]).length||s.mvp||(s.participants||[]).length))}
async function loadRemotePlayerIndex(force=false){
  if(remotePlayerByName.size&&!force)return;
  const {data,error}=await supabaseClient.from('players').select('id,name,team_id,photo_url');
  if(error)throw error;
  remotePlayerByName=new Map((data||[]).map(p=>[p.name,p]));remotePlayerById=new Map((data||[]).map(p=>[p.id,p]));
}
function remoteClockSeconds(row){
  let seconds=Number(row?.clock_seconds??1200);
  if(row?.running&&row?.clock_started_at){const elapsed=Math.max(0,Math.floor((Date.now()-Date.parse(row.clock_started_at))/1000));seconds=Math.max(0,seconds-elapsed)}
  return Math.max(0,Math.min(1200,seconds));
}
async function fetchRemoteMatchBundle(){
  const [fixtureRes,liveRes,eventRes,participantRes,shootoutRes]=await Promise.all([
    supabaseClient.from('fixtures').select('id,status,home_score,away_score,mvp_player_id'),
    supabaseClient.from('match_live_state').select('fixture_id,half,clock_seconds,running,clock_started_at,updated_at'),
    supabaseClient.from('match_events').select('id,seq,fixture_id,team_id,scorer_player_id,assist_player_id,goal_value,half,minute,home_score_after,away_score_after').order('seq',{ascending:true}),
    supabaseClient.from('match_participants').select('fixture_id,player_id'),
    supabaseClient.from('match_shootout_events').select('id,seq,fixture_id,team_id,player_id,scored,sudden_death').order('seq',{ascending:true})
  ]);
  if(fixtureRes.error)throw fixtureRes.error;if(liveRes.error)throw liveRes.error;if(eventRes.error)throw eventRes.error;
  if(participantRes.error)console.warn('Participantes aún no disponibles en Supabase',participantRes.error);
  if(shootoutRes.error)console.warn('Shootouts aún no disponibles en Supabase',shootoutRes.error);
  return {fixtures:fixtureRes.data||[],live:liveRes.data||[],events:eventRes.data||[],participants:participantRes.error?[]:(participantRes.data||[]),shootouts:shootoutRes.error?[]:(shootoutRes.data||[])};
}
function remoteFixtureHasData(row,events,participants,shootouts=[]){return !!(row&&(row.status==='live'||row.status==='finished'||Number(row.home_score)>0||Number(row.away_score)>0||row.mvp_player_id||events.length||participants.length||shootouts.length))}
async function syncMatchStateToSupabase(matchId,state){
  if(!currentUser()||!canManageMatch(matchId))return;
  const f=findFixture(matchId);if(!f)return;await loadRemotePlayerIndex();
  const events=state.events||[],hasActivity=state.started||events.length||Number(state.homeScore)>0||Number(state.awayScore)>0||state.mvp;
  const status=state.finished?'finished':hasActivity?'live':'pending',mvpId=state.mvp?remotePlayerByName.get(state.mvp)?.id||null:null;
  const {error:summaryError}=await supabaseClient.rpc('save_match_summary',{p_fixture_id:matchId,p_status:status,p_home_score:Number(state.homeScore)||0,p_away_score:Number(state.awayScore)||0,p_mvp_player_id:mvpId});
  if(summaryError)throw summaryError;
  const {error:deleteEventsError}=await supabaseClient.from('match_events').delete().eq('fixture_id',matchId);if(deleteEventsError)throw deleteEventsError;
  if(events.length){
    const rows=events.map(e=>{const scorer=remotePlayerByName.get(e.scorer),assist=e.assist?remotePlayerByName.get(e.assist):null,teamId=e.teamKey||f[e.side]||scorer?.team_id;return {fixture_id:matchId,team_id:teamId,scorer_player_id:scorer?.id,assist_player_id:assist?.id||null,goal_value:Number(e.competitionValue??e.value??1)===2?2:1,half:Number(e.half)||1,minute:Math.max(0,Math.min(20,Number(e.minute)||0)),home_score_after:Number(e.homeScoreAfter)||0,away_score_after:Number(e.awayScoreAfter)||0,created_by:currentUser().id}}).filter(r=>r.scorer_player_id&&r.team_id);
    if(rows.length){const {error}=await supabaseClient.from('match_events').insert(rows);if(error)throw error}
  }
  const {error:deleteShootoutError}=await supabaseClient.from('match_shootout_events').delete().eq('fixture_id',matchId);if(deleteShootoutError)throw deleteShootoutError;
  const shootouts=state.shootoutEvents||[];
  if(shootouts.length){
    const rows=shootouts.map((e,i)=>({fixture_id:matchId,seq:i+1,team_id:f[e.side],player_id:remotePlayerByName.get(e.player)?.id||null,scored:!!e.scored,sudden_death:!!e.suddenDeath,created_by:currentUser().id})).filter(r=>r.player_id);
    if(rows.length){const {error}=await supabaseClient.from('match_shootout_events').insert(rows);if(error)throw error}
  }
  if(isAdmin()){
    const {error:delPart}=await supabaseClient.from('match_participants').delete().eq('fixture_id',matchId);if(delPart)throw delPart;
    const manual=[...new Set(state.participants||[])].map(name=>remotePlayerByName.get(name)?.id).filter(Boolean);
    if(manual.length){const {error}=await supabaseClient.from('match_participants').insert(manual.map(player_id=>({fixture_id:matchId,player_id,created_by:currentUser().id})));if(error)throw error}
  }
  const isCurrent=live.matchId===matchId,clockSeconds=isCurrent?live.remaining:Number(state.clockSeconds??1200),half=isCurrent?live.half:Number(state.liveHalf||1),running=isCurrent?!!live.running:!!state.clockRunning;
  const {error:liveError}=await supabaseClient.from('match_live_state').upsert({fixture_id:matchId,half,clock_seconds:Math.max(0,Math.min(1200,clockSeconds)),running,clock_started_at:running?new Date().toISOString():null,updated_by:currentUser().id,updated_at:new Date().toISOString()},{onConflict:'fixture_id'});if(liveError)throw liveError;
}
async function forceSyncAllLocalMatches(){
  if(!isAdmin())throw new Error('Solo un administrador puede sincronizar los datos locales.');
  await loadRemotePlayerIndex(true);
  let synced=0;
  for(const f of fixtures){
    const local=store.get(`match:${f.id}`,defaultMatchState());
    if(!matchStateHasData(local))continue;
    const state={...defaultMatchState(),...local,events:Array.isArray(local.events)?local.events:[],shootoutEvents:Array.isArray(local.shootoutEvents)?local.shootoutEvents:[],participants:Array.isArray(local.participants)?local.participants:[]};
    recalculateMatchStateFromEvents(state);
    const mvpId=state.mvp?remotePlayerByName.get(state.mvp)?.id||null:null;
    const hasActivity=state.started||state.events.length||Number(state.homeScore)>0||Number(state.awayScore)>0||state.mvp;
    const status=state.finished?'finished':hasActivity?'live':'pending';
    const {error:fixtureError}=await supabaseClient.from('fixtures').update({status,home_score:Number(state.homeScore)||0,away_score:Number(state.awayScore)||0,mvp_player_id:mvpId,updated_at:new Date().toISOString()}).eq('id',f.id);
    if(fixtureError)throw new Error(`Partido ${f.id}: ${fixtureError.message}`);

    const {error:deleteEventsError}=await supabaseClient.from('match_events').delete().eq('fixture_id',f.id);
    if(deleteEventsError)throw new Error(`Partido ${f.id}: ${deleteEventsError.message}`);
    if(state.events.length){
      const rows=state.events.map(e=>{
        const scorer=remotePlayerByName.get(e.scorer),assist=e.assist?remotePlayerByName.get(e.assist):null;
        const teamId=e.teamKey||f[e.side]||scorer?.team_id;
        return {fixture_id:f.id,team_id:teamId,scorer_player_id:scorer?.id,assist_player_id:assist?.id||null,goal_value:Number(e.competitionValue??e.value??1)===2?2:1,half:Number(e.half)||1,minute:Math.max(0,Math.min(20,Number(e.minute)||0)),home_score_after:Number(e.homeScoreAfter)||0,away_score_after:Number(e.awayScoreAfter)||0,created_by:currentUser().id};
      }).filter(r=>r.scorer_player_id&&r.team_id);
      if(rows.length){const {error}=await supabaseClient.from('match_events').insert(rows);if(error)throw new Error(`Partido ${f.id}: ${error.message}`)}
    }

    const {error:delShoot}=await supabaseClient.from('match_shootout_events').delete().eq('fixture_id',f.id);if(delShoot)throw new Error(`Partido ${f.id}: ${delShoot.message}`);
    if(state.shootoutEvents.length){const rows=state.shootoutEvents.map((e,i)=>({fixture_id:f.id,seq:i+1,team_id:f[e.side],player_id:remotePlayerByName.get(e.player)?.id||null,scored:!!e.scored,sudden_death:!!e.suddenDeath,created_by:currentUser().id})).filter(r=>r.player_id);if(rows.length){const {error}=await supabaseClient.from('match_shootout_events').insert(rows);if(error)throw new Error(`Partido ${f.id}: ${error.message}`)}}

    const {error:delPart}=await supabaseClient.from('match_participants').delete().eq('fixture_id',f.id);
    if(delPart)throw new Error(`Partido ${f.id}: ${delPart.message}`);
    const ids=[...new Set(state.participants||[])].map(name=>remotePlayerByName.get(name)?.id).filter(Boolean);
    if(ids.length){const {error}=await supabaseClient.from('match_participants').insert(ids.map(player_id=>({fixture_id:f.id,player_id,created_by:currentUser().id})));if(error)throw new Error(`Partido ${f.id}: ${error.message}`)}

    const clockSeconds=Math.max(0,Math.min(1200,Number(state.clockSeconds??1200))),half=Math.max(1,Math.min(2,Number(state.liveHalf||1))),running=!!state.clockRunning;
    const {error:liveError}=await supabaseClient.from('match_live_state').upsert({fixture_id:f.id,half,clock_seconds:clockSeconds,running,clock_started_at:running?new Date().toISOString():null,updated_by:currentUser().id,updated_at:new Date().toISOString()},{onConflict:'fixture_id'});
    if(liveError)throw new Error(`Partido ${f.id}: ${liveError.message}`);
    synced++;
  }
  await hydrateMatchDataFromSupabase();
  return synced;
}

function queueMatchStateSync(matchId,state){
  if(!currentUser()||!canManageMatch(matchId))return;
  const snapshot=JSON.parse(JSON.stringify(state)),previous=matchSyncChains.get(matchId)||Promise.resolve();
  const next=previous.catch(()=>{}).then(()=>syncMatchStateToSupabase(matchId,snapshot)).catch(err=>console.error('No se pudo sincronizar el partido',err));
  matchSyncChains.set(matchId,next);next.finally(()=>{if(matchSyncChains.get(matchId)===next)matchSyncChains.delete(matchId)});
}
async function hydrateMatchDataFromSupabase(){
  if(matchHydratePromise)return matchHydratePromise;
  matchHydratePromise=(async()=>{
    try{
      await loadRemotePlayerIndex();let bundle=await fetchRemoteMatchBundle(),migrated=false;
      const byFixtureEvents=id=>bundle.events.filter(e=>e.fixture_id===id),byFixtureParticipants=id=>bundle.participants.filter(p=>p.fixture_id===id);
      if(isAdmin()){
        for(const f of fixtures){
          const remote=bundle.fixtures.find(x=>x.id===f.id),re=byFixtureEvents(f.id),rp=byFixtureParticipants(f.id),rs=(bundle.shootouts||[]).filter(x=>x.fixture_id===f.id),local=store.get(`match:${f.id}`,defaultMatchState());
          if(matchStateHasData(local)&&!remoteFixtureHasData(remote,re,rp,rs)){await syncMatchStateToSupabase(f.id,local);migrated=true}
        }
        if(migrated)bundle=await fetchRemoteMatchBundle();
      }
      for(const f of fixtures){
        const row=bundle.fixtures.find(x=>x.id===f.id);if(!row)continue;
        const eventRows=bundle.events.filter(e=>e.fixture_id===f.id),partRows=bundle.participants.filter(p=>p.fixture_id===f.id),liveRow=bundle.live.find(x=>x.fixture_id===f.id),local=store.get(`match:${f.id}`,defaultMatchState());
        const shootoutRows=(bundle.shootouts||[]).filter(e=>e.fixture_id===f.id);
        if(!remoteFixtureHasData(row,eventRows,partRows,shootoutRows)&&matchStateHasData(local))continue;
        const state={...defaultMatchState(),homeScore:Number(row.home_score)||0,awayScore:Number(row.away_score)||0,finished:row.status==='finished',started:row.status==='live',shootoutActive:false,mvp:row.mvp_player_id?remotePlayerById.get(row.mvp_player_id)?.name||null:null,participants:partRows.map(p=>remotePlayerById.get(p.player_id)?.name).filter(Boolean),liveHalf:Number(liveRow?.half||1),clockSeconds:remoteClockSeconds(liveRow),clockRunning:!!liveRow?.running};
        state.events=eventRows.map(e=>{const scorer=remotePlayerById.get(e.scorer_player_id),assist=e.assist_player_id?remotePlayerById.get(e.assist_player_id):null,side=e.team_id===f.home?'home':'away';return {id:e.id,team:teams[e.team_id]?.name||e.team_id,teamKey:e.team_id,side,scorer:scorer?.name||e.scorer_player_id,assist:assist?.name||'',value:Number(e.goal_value)||1,realValue:1,competitionValue:Number(e.goal_value)||1,doubleGoal:Number(e.goal_value)===2,half:Number(e.half)||1,minute:Number(e.minute)||0,homeScoreAfter:Number(e.home_score_after)||0,awayScoreAfter:Number(e.away_score_after)||0,scoreAfter:`${Number(e.home_score_after)||0}-${Number(e.away_score_after)||0}`}});
        state.shootoutEvents=shootoutRows.map(e=>({id:e.id,side:e.team_id===f.home?'home':'away',teamKey:e.team_id,player:remotePlayerById.get(e.player_id)?.name||e.player_id,scored:!!e.scored,suddenDeath:!!e.sudden_death}));
        store.set(`match:${f.id}`,state);
      }
      if(!live.running&&findFixture(live.matchId))restoreLiveClockFromState(live.matchId);
      refreshDataViews();renderHomeDashboard();renderLive();
      if(activePlayerName&&document.body.dataset.view==='jugador')renderPlayerProfile(activePlayerName);
      if(document.body.dataset.view==='cuenta')renderAccountPanel();
    }catch(err){console.error('No se pudieron cargar los partidos compartidos desde Supabase',err)}
  })().finally(()=>{matchHydratePromise=null});
  return matchHydratePromise;
}
function allMatchPlayers(f){return [...playersOf(f.home),...playersOf(f.away)]}
function timeText(sec){const m=Math.floor(sec/60),s=sec%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function elapsedMinute(){return Math.min(20,Math.floor((1200-live.remaining)/60)+1)}
function isDiceActive(){return live.half===1&&live.remaining<=120&&live.remaining>=0}
function isDoubleGoalActive(){return live.half===2&&live.remaining<=120&&live.remaining>=0}
function competitionValueForEvent(half,minute){return Number(half)===2&&Number(minute)>=19?2:1}
function recalculateMatchStateFromEvents(s){
  s.events=(s.events||[]).slice().sort((a,b)=>(Number(a.half||1)-Number(b.half||1))||(Number(a.minute||1)-Number(b.minute||1))||(Number(a.id||0)-Number(b.id||0)));
  let home=0,away=0;
  s.events.forEach(e=>{
    const competitionValue=competitionValueForEvent(e.half,e.minute);
    e.realValue=1;e.competitionValue=competitionValue;e.value=competitionValue;e.doubleGoal=competitionValue===2;
    if(e.side==='home')home+=competitionValue;else if(e.side==='away')away+=competitionValue;
    e.homeScoreAfter=home;e.awayScoreAfter=away;e.scoreAfter=`${home}-${away}`;
  });
  s.homeScore=home;s.awayScore=away;s.doubleGoalRuleVersion=4;
  return s;
}
function renderMatchParticipants(f,state){
  const panel=$('#matchParticipantsPanel'),container=$('#matchParticipants');if(!panel||!container)return;
  const auto=automaticParticipantNames(state),selected=participantNames(state),admin=isAdmin();
  panel.hidden=!admin&&!state.finished;
  if(panel.hidden)return;
  const totalSelected=selected.size;
  container.innerHTML=[f.home,f.away].map(teamKey=>`<section class="availability-team-votes match-participants-team"><div class="availability-team-head"><img src="${teams[teamKey].logo}" alt="" data-team-profile="${teamKey}" class="team-profile-target"><h3>${teamProfileInline(teamKey)}</h3></div><div class="match-participants-list">${playersOf(teamKey).map(name=>{const checked=selected.has(name),automatic=auto.has(name);return `<label class="match-participant-row ${checked?'selected':''} ${automatic?'automatic':''}">${playerAvatarHtml(name,'match-participant-avatar')}<span class="match-participant-copy"><strong>${escapeHtml(name)}</strong>${automatic?'<small class="muted">Marcado automáticamente por gol, asistencia o MVP</small>':''}</span><span class="match-participant-check"><input type="checkbox" data-participant="${escapeHtml(name)}" ${checked?'checked':''} ${automatic||!admin?'disabled':''}><span aria-hidden="true">✓</span></span></label>`}).join('')}</div></section>`).join('');
  const summary=$('#matchParticipantsSummary');if(summary)summary.textContent=totalSelected?`${totalSelected} jugadores marcados como participantes.`:'Todavía no hay participantes confirmados.';
  $$('#matchParticipants [data-participant]').forEach(input=>input.addEventListener('change',()=>{
    if(!isAdmin())return;const current=getMatchState(),manual=new Set(current.participants||[]),name=input.dataset.participant;
    if(input.checked)manual.add(name);else manual.delete(name);current.participants=[...manual];saveMatchState(current);renderLive();refreshDataViews();
  }));
}
function specialRuleLabel(){if(isDiceActive())return '🎲 Dado Kings League activo';if(isDoubleGoalActive())return '⚡ GOL DOBLE · últimos 2 minutos';return 'Tiempo normal'}
function updateSpecialRule(){
  const label=specialRuleLabel(),el=$('#specialRule');
  if(el){el.className='special-rule';if(isDiceActive())el.classList.add('dice');if(isDoubleGoalActive())el.classList.add('double');el.textContent=label}
  const mobile=$('#mobileSpecialRule');if(mobile){mobile.className='mobile-rule-badge';if(isDiceActive())mobile.classList.add('dice');if(isDoubleGoalActive())mobile.classList.add('double');mobile.textContent=label}
}
function isMobileRefereeViewport(){return window.matchMedia?.('(max-width: 760px)').matches}
function mobilePlayerChoiceHtml(name,attr){
  const photo=playerPhoto(name),initials=name.split(' ').map(x=>x[0]).slice(0,2).join(''),meta=allPlayers.find(p=>p.name===name),team=meta?teams[meta.key]:null;
  return `<button class="mobile-player-choice" type="button" ${attr}="${escapeHtml(name)}"><span class="mobile-choice-avatar">${photo?`<img src="${photo}" alt="Foto de ${escapeHtml(name)}">`:escapeHtml(initials)}</span><span class="mobile-choice-copy"><strong>${escapeHtml(name)}</strong><small>${team?teamProfileInline(meta.key,team.name):''}</small></span></button>`
}
function goalPickerPlayers(teamKey,state){
  const roster=playersOf(teamKey),manual=new Set(state?.participants||[]),auto=automaticParticipantNames(state),manualForTeam=roster.filter(name=>manual.has(name));
  if(!manualForTeam.length)return roster;
  return roster.filter(name=>manual.has(name)||auto.has(name));
}
function renderMobileReferee(f,s,editable){
  const wrap=$('#mobileRefereeMode'),view=$('#view-directo');if(!wrap||!view)return;
  const active=isMobileRefereeViewport();wrap.hidden=!active;view.classList.toggle('referee-mobile-active',active);
  if(!active){view.classList.remove('mobile-acta-open');return}
  $('#mobileLiveHalf').textContent=s.finished?'FINAL':`${live.half}ª PARTE`;$('#mobileTimer').textContent=s.finished?'FINAL':timeText(live.remaining);
  $('#mobileHomeLogo').src=teams[f.home].logo;markTeamProfileTarget($('#mobileHomeLogo'),f.home);$('#mobileAwayLogo').src=teams[f.away].logo;markTeamProfileTarget($('#mobileAwayLogo'),f.away);$('#mobileHomeName').textContent=teams[f.home].name;markTeamProfileTarget($('#mobileHomeName'),f.home);$('#mobileAwayName').textContent=teams[f.away].name;markTeamProfileTarget($('#mobileAwayName'),f.away);$('#mobileHomeScore').textContent=s.homeScore;$('#mobileAwayScore').textContent=s.awayScore;const ms=$('#mobileShootoutSummary');if(ms){const t=shootoutSummary(s,f);ms.hidden=!t;ms.textContent=t}
  const homeGoal=$('#mobileHomeGoal'),awayGoal=$('#mobileAwayGoal'),manageActions=$('#mobileManageActions'),morePanel=$('#mobileMorePanel');
  if(homeGoal)homeGoal.hidden=!editable;if(awayGoal)awayGoal.hidden=!editable;if(manageActions)manageActions.hidden=!editable;
  if(!editable&&morePanel)morePanel.hidden=true;
  $('#mobileStartPause').textContent=live.running?'⏸ Pausar':'▶ Iniciar';$('#mobileHalfSwitch').textContent=live.half===1?'Ir a 2ª parte':'Ir a 1ª parte';
  $('#mobileHomeGoal').textContent=isDoubleGoalActive()?'⚡ GOL x2':'⚽ GOL';$('#mobileAwayGoal').textContent=isDoubleGoalActive()?'⚡ GOL x2':'⚽ GOL';
  const adminJump=$('#mobileAdminTimeJump');if(adminJump)adminJump.hidden=!isAdmin();
  if(isAdmin()&&document.activeElement!==$('#mobileJumpMinute')&&document.activeElement!==$('#mobileJumpSecond')){const elapsed=Math.max(0,Math.min(1200,1200-live.remaining));$('#mobileJumpMinute').value=Math.floor(elapsed/60);$('#mobileJumpSecond').value=elapsed%60}
  const canCorrectFinished=s.finished&&isAdmin();$('#mobileHomeGoal').disabled=s.finished&&!canCorrectFinished;$('#mobileAwayGoal').disabled=s.finished&&!canCorrectFinished;$('#mobileUndoGoal').disabled=!s.events?.length||(s.finished&&!canCorrectFinished);$('#mobileFinishMatch').disabled=!!s.finished;
  const mobileShootoutBtn=$('#mobileShootoutBtn');if(mobileShootoutBtn){const tied=Number(s.homeScore)===Number(s.awayScore),winner=shootoutWinnerSide(s);mobileShootoutBtn.hidden=!(editable&&tied&&!winner&&(s.shootoutActive||s.finished||(s.shootoutEvents||[]).length));mobileShootoutBtn.disabled=!editable||!!winner;}
  const mobileResetWhole=$('#mobileResetWholeMatch');if(mobileResetWhole)mobileResetWhole.hidden=!isAdmin();
  $('#mobileMvpBtn').textContent=s.mvp?`⭐ MVP · ${s.mvp}`:'⭐ Elegir MVP';
  const actaOpen=view.classList.contains('mobile-acta-open');
  if($('#mobileQuickActaBtn'))$('#mobileQuickActaBtn').textContent=actaOpen?'✕ Cerrar acta':'📋 Ver acta';
  if($('#mobileActaBtn'))$('#mobileActaBtn').textContent=actaOpen?'✕ Cerrar acta':'📋 Ver acta';
  updateSpecialRule();
}
let mobileToastTimer=null;
function showMobileLiveToast(text){const box=$('#mobileLiveToast');if(!box||!isMobileRefereeViewport())return;$('#mobileLiveToastText').textContent=text;box.hidden=false;clearTimeout(mobileToastTimer);mobileToastTimer=setTimeout(()=>{box.hidden=true},6500)}
function renderShootoutPanel(f,s,editable){
  const panel=$('#shootoutPanel'),list=$('#shootoutList'),summary=$('#shootoutSummary'),addBtn=$('#addShootoutAttempt');if(!panel||!list||!summary||!addBtn)return;
  const tied=Number(s.homeScore)===Number(s.awayScore),has=(s.shootoutEvents||[]).length>0;
  panel.hidden=!(tied&&(s.shootoutActive||has||s.finished));if(panel.hidden)return;
  const sc=shootoutScore(s),winner=shootoutWinnerSide(s),next=nextShootoutSide(s),nextTeam=teams[f[next]]?.name;
  summary.innerHTML=`<strong>${sc.home}–${sc.away}</strong><span>${winner?`🏆 ${teamProfileInline(f[winner])} gana los shootouts`:`${sc.homeAttempts<3||sc.awayAttempts<3?'Serie inicial: 3 lanzamientos por equipo':`Muerte súbita · siguiente: ${escapeHtml(nextTeam)}`}`}</span>`;
  list.innerHTML=(s.shootoutEvents||[]).length?(s.shootoutEvents||[]).map((e,i)=>`<div class="shootout-event ${e.scored?'scored':'missed'}"><span>${i+1}. ${e.suddenDeath?'🔥 Muerte súbita · ':''}${teamProfileInline(f[e.side])}</span><strong>${e.scored?'✅':'❌'} ${playerProfileButton(e.player)}</strong>${editable&&!s.finished?`<button class="ghost compact-btn" type="button" data-delete-shootout="${e.id}">Eliminar</button>`:''}</div>`).join(''):'<div class="muted">Todavía no se ha lanzado ningún shootout.</div>';
  const canManageShootout=editable&&!winner;addBtn.hidden=!canManageShootout;addBtn.disabled=!canManageShootout;addBtn.style.display=canManageShootout?'':'none';addBtn.textContent=`🥅 Añadir lanzamiento · ${nextTeam}`;
  $$('#shootoutList [data-delete-shootout]').forEach(b=>b.addEventListener('click',()=>{const cur=getMatchState();cur.shootoutEvents=(cur.shootoutEvents||[]).filter(x=>String(x.id)!==String(b.dataset.deleteShootout));saveMatchState(cur);renderLive();refreshDataViews()}));
}
function openShootoutAttempt(){
  if(!requireMatchEdit())return;const f=findFixture(live.matchId),s=getMatchState();if(!f||Number(s.homeScore)!==Number(s.awayScore)||shootoutWinnerSide(s))return;
  // Si es un empate antiguo que ya estaba marcado como finalizado, al gestionar
  // el primer shootout lo reabrimos hasta resolver el desempate.
  if(s.finished){s.finished=false;s.started=false;s.shootoutActive=true;saveMatchState(s);}
  const side=nextShootoutSide(s),teamKey=f[side];$('#shootoutSide').value=side;$('#shootoutAttemptTitle').textContent=`Shootout · ${teams[teamKey].name}`;$('#shootoutPlayer').innerHTML=playersOf(teamKey).map(p=>`<option>${escapeHtml(p)}</option>`).join('');$('#shootoutAttemptDialog').showModal();
}
function commitShootoutAttempt(player,scored){
  const f=findFixture(live.matchId),s=getMatchState();if(!f||!player||!requireMatchEdit())return;const side=$('#shootoutSide').value,sc=shootoutScore(s),suddenDeath=sc.homeAttempts>=3&&sc.awayAttempts>=3;
  s.finished=false;s.started=false;s.shootoutActive=true;s.shootoutEvents=s.shootoutEvents||[];s.shootoutEvents.push({id:Date.now(),side,teamKey:f[side],player,scored:!!scored,suddenDeath});saveMatchState(s);$('#shootoutAttemptDialog').close();renderLive();refreshDataViews();
}
function renderLive(){
  const f=findFixture(live.matchId),s=getMatchState(),editable=canManageMatch(live.matchId);if(!f)return;
  $('#liveEyebrow').textContent=s.finished?'ACTA DEL PARTIDO':(editable?'MODO ÁRBITRO':'EN DIRECTO');$('#liveDescription').textContent=s.finished?'Consulta el resultado, los goles, las asistencias y el MVP. El administrador puede corregir el acta incluso después de finalizar el partido.':(editable?'Tienes permisos para gestionar este partido.':'Sigue el marcador, el tiempo y los eventos. Solo el árbitro asignado puede editar.');
  $('#liveHalfControls').hidden=!editable;$('#liveTimerActions').hidden=!editable;$('#liveEventActions').hidden=!editable;$('#liveMvpPanel').hidden=false;$('#mvpSelect').hidden=!editable;$('#saveMvp').hidden=!editable;$$('.live-editor-control').forEach(el=>el.hidden=!editable);
  const adminTimeJump=$('#adminTimeJump');if(adminTimeJump)adminTimeJump.hidden=!isAdmin();const resetWhole=$('#resetWholeMatch');if(resetWhole)resetWhole.hidden=!isAdmin();
  if(isAdmin()&&document.activeElement!==$('#jumpMinute')&&document.activeElement!==$('#jumpSecond')){const elapsed=Math.max(0,Math.min(1200,1200-live.remaining));$('#jumpMinute').value=Math.floor(elapsed/60);$('#jumpSecond').value=elapsed%60;}
  $('#timer').textContent=timeText(live.remaining);$('#homeName').textContent=teams[f.home].name;markTeamProfileTarget($('#homeName'),f.home);$('#awayName').textContent=teams[f.away].name;markTeamProfileTarget($('#awayName'),f.away);$('#homeLogo').src=teams[f.home].logo;markTeamProfileTarget($('#homeLogo'),f.home);$('#awayLogo').src=teams[f.away].logo;markTeamProfileTarget($('#awayLogo'),f.away);$('#homeScore').textContent=s.homeScore;$('#awayScore').textContent=s.awayScore;
  $('#half1Btn').classList.toggle('active',live.half===1);$('#half2Btn').classList.toggle('active',live.half===2);const liveStatus=s.finished?'Partido finalizado':(s.started?`● EN JUEGO · ${live.half}ª parte`:availabilityStatus(live.matchId));const shotText=shootoutSummary(s,f);$('#liveMatchLabel').textContent=liveStatus+(shotText?` · ${shotText}`:'')+(editable?' · Edición habilitada':' · Solo lectura');updateSpecialRule();renderMobileReferee(f,s,editable);renderShootoutPanel(f,s,editable);
  const canEditEvents=editable&&(!s.finished||isAdmin());
  const goalSideHtml=(side,teamKey)=>{const events=(s.events||[]).filter(e=>e.side===side).slice().reverse();return `<section class="acta-goal-side ${side}"><div class="acta-goal-team"><img src="${teams[teamKey].logo}" alt=""><strong>${teamProfileInline(teamKey)}</strong><span>${events.length} ${events.length===1?'gol':'goles'} reales</span></div><div class="acta-goal-list">${events.length?events.map(e=>`<article class="acta-goal-card">${playerAvatarHtml(e.scorer,'acta-goal-avatar')}<div class="acta-goal-copy"><b>⚽ ${playerProfileButton(e.scorer)}</b><small>${e.assist?`🅰️ ${playerProfileButton(e.assist)}<br>`:''}${e.half}ª parte · ${e.minute}'${Number(e.competitionValue ?? e.value ?? 1)===2?' · ⚡ Gol doble':''}${e.scoreAfter?`<br>Marcador ${e.scoreAfter}`:''}</small></div>${canEditEvents?`<button class="ghost compact-btn" type="button" data-edit-goal="${e.id}">Editar</button>`:''}</article>`).join(''):'<div class="acta-no-goals">Sin goles</div>'}</div></section>`};
  $('#eventsList').innerHTML=`<div class="acta-goals-split">${goalSideHtml('home',f.home)}${goalSideHtml('away',f.away)}</div>`;
  $$('#eventsList [data-edit-goal]').forEach(btn=>btn.addEventListener('click',()=>openEditGoal(btn.dataset.editGoal)));
  $('#mvpSelect').innerHTML='<option value="">Selecciona MVP</option>'+allMatchPlayers(f).map(p=>`<option ${s.mvp===p?'selected':''}>${p}</option>`).join('');$('#mvpSaved').innerHTML=s.mvp?`⭐ MVP guardado: ${playerProfileButton(s.mvp)}`:'';
  renderMatchParticipants(f,s);
  ['#startTimer','#pauseTimer','#resetTimer','#half1Btn','#half2Btn','#homeGoal','#awayGoal','#undoGoal','#finishMatch','#mvpSelect','#saveMvp'].forEach(sel=>{const el=$(sel);if(!el)return;const adminCanCorrectFinished=s.finished&&isAdmin()&&(sel==='#homeGoal'||sel==='#awayGoal'||sel==='#undoGoal');el.disabled=!editable||((sel==='#finishMatch')&&s.finished)||((sel==='#homeGoal'||sel==='#awayGoal'||sel==='#undoGoal')&&s.finished&&!adminCanCorrectFinished)});
}
function stopTimer(){live.running=false;if(live.interval)clearInterval(live.interval);live.interval=null}
async function resetWholeMatch(){
  if(!isAdmin())return;
  const f=findFixture(live.matchId);if(!f)return;
  if(!confirm(`¿Reiniciar completamente ${teams[f.home].name} vs ${teams[f.away].name}? Se borrarán marcador, goles, asistencias, MVP, participantes y shootouts. La fecha y el árbitro asignado se mantienen.`))return;
  stopTimer();
  live.half=1;live.remaining=1200;live.running=false;
  const clean=defaultMatchState();clean.liveHalf=1;clean.clockSeconds=1200;clean.clockRunning=false;
  saveMatchState(clean);
  restoreLiveClockFromState(live.matchId);
  renderLive();refreshDataViews();
  if(document.body.dataset.view==='admin')renderAdmin();
  alert('Partido reiniciado. Ya está listo para empezar de nuevo.');
}
function requireMatchEdit(){if(!canManageMatch(live.matchId)){alert('Este partido está en modo solo lectura. Solo el administrador o el árbitro asignado puede editarlo.');return false}return true}
$('#startTimer').addEventListener('click',()=>{if(!requireMatchEdit()||live.running||live.remaining<=0)return;const s=getMatchState();s.started=true;live.running=true;saveMatchState(s);renderStandings();live.interval=setInterval(()=>{live.remaining--;renderLive();if(live.remaining<=0){stopTimer();const current=getMatchState();saveMatchState(current)}},1000)});
$('#pauseTimer').addEventListener('click',()=>{if(!requireMatchEdit())return;stopTimer();const s=getMatchState();saveMatchState(s);renderLive()});
$('#resetTimer').addEventListener('click',()=>{if(!requireMatchEdit())return;stopTimer();live.remaining=1200;const s=getMatchState();saveMatchState(s);renderLive()});
$('#half1Btn').addEventListener('click',()=>{if(!requireMatchEdit())return;stopTimer();live.half=1;live.remaining=1200;const s=getMatchState();saveMatchState(s);renderLive()});
$('#half2Btn').addEventListener('click',()=>{if(!requireMatchEdit())return;stopTimer();live.half=2;live.remaining=1200;const s=getMatchState();saveMatchState(s);renderLive()});
$('#applyMatchTime')?.addEventListener('click',()=>{if(!isAdmin())return;stopTimer();let min=Math.floor(Number($('#jumpMinute').value||0)),sec=Math.floor(Number($('#jumpSecond').value||0));min=Math.max(0,Math.min(20,min));sec=Math.max(0,Math.min(59,sec));if(min===20)sec=0;const elapsed=Math.min(1200,min*60+sec);live.remaining=1200-elapsed;const s=getMatchState();saveMatchState(s);renderLive()});
$('#matchSelect').addEventListener('change',e=>{stopTimer();live.matchId=e.target.value;restoreLiveClockFromState(live.matchId);renderLive()});
$('#viewerStreamBtn').addEventListener('click',()=>{if($('#streamMatchSelect'))$('#streamMatchSelect').value=live.matchId;renderStreaming();navigate('streaming')});
let goalSide='home',mobileGoalScorer='';
function renderMobileGoalScorers(teamKey){
  mobileGoalScorer='';$('#mobileGoalStepTitle').textContent='¿Quién ha marcado?';$('#mobileGoalStepHelp').textContent='Toca al goleador';$('#mobileGoalBackStep').hidden=true;
  const players=goalPickerPlayers(teamKey,getMatchState());$('#mobileGoalPlayers').innerHTML=players.map(name=>mobilePlayerChoiceHtml(name,'data-mobile-scorer')).join('');
}
function renderMobileGoalAssists(teamKey,scorer){
  mobileGoalScorer=scorer;$('#mobileGoalStepTitle').textContent=`Gol de ${scorer}`;$('#mobileGoalStepHelp').textContent='¿Quién ha dado la asistencia?';$('#mobileGoalBackStep').hidden=false;
  const players=goalPickerPlayers(teamKey,getMatchState()).filter(name=>name!==scorer);$('#mobileGoalPlayers').innerHTML=`<button class="mobile-player-choice no-assist" type="button" data-mobile-assist=""><span class="mobile-choice-avatar">—</span><span class="mobile-choice-copy"><strong>Sin asistencia</strong><small>Gol sin asistente</small></span></button>`+players.map(name=>mobilePlayerChoiceHtml(name,'data-mobile-assist')).join('');
}
function openGoal(side){
  if(!requireMatchEdit())return;const f=findFixture(live.matchId),teamKey=f[side];goalSide=side;$('#goalTeamSide').value=side;$('#goalTitle').textContent=`Gol · ${teams[teamKey].name}`;const ps=playersOf(teamKey);$('#scorerSelect').innerHTML=ps.map(p=>`<option>${p}</option>`).join('');$('#assistSelect').innerHTML='<option value="">Sin asistencia</option>'+ps.map(p=>`<option>${p}</option>`).join('');$('#goalValueNotice').textContent=isDoubleGoalActive()?'⚡ Últimos 2 minutos: 1 gol real sumará 2 goles al marcador y a la competición.':isDiceActive()?'Dado Kings League activo. El gol contará normal hasta definir su mecánica.':'Gol normal: 1 gol real = 1 gol de competición.';
  const dialog=$('#goalDialog');dialog.classList.toggle('mobile-wizard-active',isMobileRefereeViewport());if(isMobileRefereeViewport())renderMobileGoalScorers(teamKey);dialog.showModal()
}
function commitGoal(scorer,assist=''){
  if(!requireMatchEdit())return false;const f=findFixture(live.matchId),s=getMatchState(),teamKey=f[goalSide];if(!scorer)return false;if(assist===scorer&&assist){alert('El goleador y el asistente no pueden ser la misma persona.');return false}const realValue=1,competitionValue=isDoubleGoalActive()?2:1,value=competitionValue;if(!s.finished)s.started=true;s.events.push({id:Date.now(),team:teams[teamKey].name,teamKey,side:goalSide,scorer,assist,value,realValue,competitionValue,doubleGoal:competitionValue===2,half:live.half,minute:elapsedMinute()});recalculateMatchStateFromEvents(s);saveMatchState(s);$('#goalDialog').close();renderLive();refreshDataViews();showMobileLiveToast(`${competitionValue===2?'⚡ ':''}Gol de ${scorer}${assist?` · asistencia de ${assist}`:' · sin asistencia'}`);return true
}
$('#homeGoal').addEventListener('click',()=>openGoal('home'));$('#awayGoal').addEventListener('click',()=>openGoal('away'));
$('#goalForm').addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();commitGoal($('#scorerSelect').value,$('#assistSelect').value)});
$('#mobileGoalPlayers')?.addEventListener('click',e=>{const scorer=e.target.closest('[data-mobile-scorer]');if(scorer){const f=findFixture(live.matchId),teamKey=f[goalSide];$('#scorerSelect').value=scorer.dataset.mobileScorer;renderMobileGoalAssists(teamKey,scorer.dataset.mobileScorer);return}const assist=e.target.closest('[data-mobile-assist]');if(assist){$('#assistSelect').value=assist.dataset.mobileAssist||'';commitGoal(mobileGoalScorer,assist.dataset.mobileAssist||'')}});
$('#mobileGoalBackStep')?.addEventListener('click',()=>{const f=findFixture(live.matchId);if(f)renderMobileGoalScorers(f[goalSide])});
$('#undoGoal').addEventListener('click',()=>{if(!requireMatchEdit())return;const s=getMatchState();if(s.finished&&!isAdmin()){alert('Una vez finalizado el partido, solo un administrador puede corregir el acta.');return}const e=s.events.pop();if(!e)return;recalculateMatchStateFromEvents(s);saveMatchState(s);renderLive();refreshDataViews()});
function populateEditGoalPlayers(side,selectedScorer='',selectedAssist=''){
  const f=findFixture(live.matchId),teamKey=f?.[side];if(!teamKey)return;
  const ps=playersOf(teamKey);
  $('#editScorerSelect').innerHTML=ps.map(p=>`<option ${p===selectedScorer?'selected':''}>${p}</option>`).join('');
  $('#editAssistSelect').innerHTML='<option value="">Sin asistencia</option>'+ps.map(p=>`<option ${p===selectedAssist?'selected':''}>${p}</option>`).join('');
}
function updateEditGoalNotice(){const half=Number($('#editGoalHalf').value),minute=Number($('#editGoalMinute').value),value=competitionValueForEvent(half,minute);$('#editGoalValueNotice').textContent=value===2?'⚡ Este gol contará como 1 gol real y 2 goles de competición.':'Gol normal: 1 gol real y 1 gol de competición.'}
function openEditGoal(eventId){
  const s=getMatchState();if(s.finished&&!isAdmin()){alert('Una vez finalizado el partido, solo un administrador puede corregir el acta.');return}if(!requireMatchEdit())return;
  const e=(s.events||[]).find(x=>String(x.id)===String(eventId));if(!e)return;
  const f=findFixture(live.matchId);$('#editGoalId').value=e.id;$('#editGoalSide').innerHTML=`<option value="home">${escapeHtml(teams[f.home].name)}</option><option value="away">${escapeHtml(teams[f.away].name)}</option>`;$('#editGoalSide').value=e.side||'home';populateEditGoalPlayers(e.side||'home',e.scorer,e.assist||'');$('#editGoalHalf').value=String(e.half||1);$('#editGoalMinute').value=String(e.minute||1);updateEditGoalNotice();$('#editGoalDialog').showModal();
}
$('#editGoalSide')?.addEventListener('change',()=>{populateEditGoalPlayers($('#editGoalSide').value);updateEditGoalNotice()});
$('#editGoalHalf')?.addEventListener('change',updateEditGoalNotice);$('#editGoalMinute')?.addEventListener('input',updateEditGoalNotice);
$('#editGoalForm')?.addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();const s=getMatchState();if(s.finished&&!isAdmin())return;if(!requireMatchEdit())return;const event=(s.events||[]).find(x=>String(x.id)===String($('#editGoalId').value));if(!event)return;const side=$('#editGoalSide').value,f=findFixture(live.matchId),teamKey=f[side],scorer=$('#editScorerSelect').value,assist=$('#editAssistSelect').value,half=Math.max(1,Math.min(2,Number($('#editGoalHalf').value))),minute=Math.max(1,Math.min(20,Math.floor(Number($('#editGoalMinute').value||1))));if(assist&&assist===scorer){alert('El goleador y el asistente no pueden ser la misma persona.');return}Object.assign(event,{side,teamKey,team:teams[teamKey].name,scorer,assist,half,minute});recalculateMatchStateFromEvents(s);saveMatchState(s);$('#editGoalDialog').close();renderLive();refreshDataViews()});
$('#deleteGoal')?.addEventListener('click',()=>{const s=getMatchState();if(s.finished&&!isAdmin())return;if(!requireMatchEdit())return;const id=$('#editGoalId').value;if(!confirm('¿Eliminar este gol del acta?'))return;s.events=(s.events||[]).filter(x=>String(x.id)!==String(id));recalculateMatchStateFromEvents(s);saveMatchState(s);$('#editGoalDialog').close();renderLive();refreshDataViews()});

$('#finishMatch').addEventListener('click',()=>{if(!requireMatchEdit())return;const s=getMatchState();stopTimer();if(Number(s.homeScore)===Number(s.awayScore)){
  if(!shootoutWinnerSide(s)){s.shootoutActive=true;s.started=false;saveMatchState(s);if(isMobileRefereeViewport())$('#view-directo')?.classList.add('mobile-acta-open');renderLive();refreshDataViews();alert('El partido está empatado. Se abre la tanda de shootouts: 3 por equipo y, si siguen empatados, muerte súbita.');return}
  if(!confirm(`¿Finalizar el partido? ${shootoutSummary(s,findFixture(live.matchId))}`))return;
}else if(!confirm('¿Finalizar el partido? El acta quedará marcada como finalizada.'))return;
  s.finished=true;s.started=false;s.shootoutActive=false;saveMatchState(s);renderLive();refreshDataViews()});
$('#saveMvp').addEventListener('click',()=>{if(!requireMatchEdit())return;const v=$('#mvpSelect').value;if(!v)return;const s=getMatchState();s.mvp=v;saveMatchState(s);renderLive();refreshDataViews()});
$('#addShootoutAttempt')?.addEventListener('click',openShootoutAttempt);
$('#mobileShootoutBtn')?.addEventListener('click',()=>{openShootoutAttempt()});
$('#resetWholeMatch')?.addEventListener('click',resetWholeMatch);
$('#mobileResetWholeMatch')?.addEventListener('click',resetWholeMatch);
$('#shootoutAttemptForm')?.addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();commitShootoutAttempt($('#shootoutPlayer').value,e.submitter?.value==='goal')});

function openMobileMvp(){
  if(!requireMatchEdit())return;const f=findFixture(live.matchId),s=getMatchState();if(!f)return;const all=allMatchPlayers(f),participants=participantNames(s),hasManual=(s.participants||[]).length>0,players=hasManual?all.filter(name=>participants.has(name)):all;$('#mobileMvpPlayers').innerHTML=players.map(name=>mobilePlayerChoiceHtml(name,'data-mobile-mvp')).join('');$('#mobileMvpDialog').showModal()
}
$('#mobileMvpPlayers')?.addEventListener('click',e=>{const b=e.target.closest('[data-mobile-mvp]');if(!b)return;const s=getMatchState();s.mvp=b.dataset.mobileMvp;saveMatchState(s);$('#mobileMvpDialog').close();renderLive();refreshDataViews();showMobileLiveToast(`⭐ MVP: ${s.mvp}`)});
$('#mobileMvpBtn')?.addEventListener('click',openMobileMvp);
$('#mobileHomeGoal')?.addEventListener('click',()=>openGoal('home'));$('#mobileAwayGoal')?.addEventListener('click',()=>openGoal('away'));
function toggleMobileActa(){const view=$('#view-directo');if(!view)return;const open=!view.classList.contains('mobile-acta-open');view.classList.toggle('mobile-acta-open',open);if($('#mobileQuickActaBtn'))$('#mobileQuickActaBtn').textContent=open?'✕ Cerrar acta':'📋 Ver acta';if($('#mobileActaBtn'))$('#mobileActaBtn').textContent=open?'✕ Cerrar acta':'📋 Ver acta'}
$('#mobileMoreBtn')?.addEventListener('click',()=>{const panel=$('#mobileMorePanel'),btn=$('#mobileMoreBtn'),open=panel.hidden;panel.hidden=!open;btn.setAttribute('aria-expanded',String(open));btn.textContent=open?'✕ Cerrar':'⋯ Gestionar'});
$('#mobileStartPause')?.addEventListener('click',()=>{(live.running?$('#pauseTimer'):$('#startTimer')).click()});
$('#mobileHalfSwitch')?.addEventListener('click',()=>{(live.half===1?$('#half2Btn'):$('#half1Btn')).click()});
$('#mobileUndoGoal')?.addEventListener('click',()=>$('#undoGoal').click());
$('#mobileFinishMatch')?.addEventListener('click',()=>$('#finishMatch').click());
$('#mobileStreamBtn')?.addEventListener('click',()=>$('#viewerStreamBtn').click());
$('#mobileQuickStreamBtn')?.addEventListener('click',()=>$('#viewerStreamBtn').click());
$('#mobileActaBtn')?.addEventListener('click',toggleMobileActa);
$('#mobileQuickActaBtn')?.addEventListener('click',toggleMobileActa);
$('#mobileApplyMatchTime')?.addEventListener('click',()=>{if(!isAdmin())return;stopTimer();let min=Math.floor(Number($('#mobileJumpMinute').value||0)),sec=Math.floor(Number($('#mobileJumpSecond').value||0));min=Math.max(0,Math.min(20,min));sec=Math.max(0,Math.min(59,sec));if(min===20)sec=0;const elapsed=Math.min(1200,min*60+sec);live.remaining=1200-elapsed;const s=getMatchState();saveMatchState(s);renderLive()});
$('#mobileToastUndo')?.addEventListener('click',()=>{clearTimeout(mobileToastTimer);$('#mobileLiveToast').hidden=true;$('#undoGoal').click()});
window.addEventListener('resize',()=>{if(document.body.dataset.view==='directo')renderLive()});

function youtubeId(url){
  if(!url)return null;
  try{const u=new URL(url);if(u.hostname.includes('youtu.be'))return u.pathname.split('/').filter(Boolean)[0]||null;if(u.searchParams.get('v'))return u.searchParams.get('v');const parts=u.pathname.split('/').filter(Boolean);const idx=parts.findIndex(x=>['embed','live','shorts'].includes(x));if(idx>=0&&parts[idx+1])return parts[idx+1]}catch{}
  return null;
}
function streamData(id){return store.get(`stream:${id}`,{liveUrl:'',recordingUrl:''})}
function renderStreaming(){
  const id=$('#streamMatchSelect').value||fixtures[0].id,f=findFixture(id);if(!f)return;
  $('#streamHomeLogo').src=teams[f.home].logo;markTeamProfileTarget($('#streamHomeLogo'),f.home);$('#streamAwayLogo').src=teams[f.away].logo;markTeamProfileTarget($('#streamAwayLogo'),f.away);$('#streamHomeName').textContent=teams[f.home].name;markTeamProfileTarget($('#streamHomeName'),f.home);$('#streamAwayName').textContent=teams[f.away].name;markTeamProfileTarget($('#streamAwayName'),f.away);
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
  $('#streamArchive').innerHTML=items.length?items.map(({f,data})=>`<article class="stream-recording"><div><strong>Jornada ${f.round} · ${teamProfileInline(f.home)} vs ${teamProfileInline(f.away)}</strong><span class="muted">Grabación de YouTube</span></div><a class="secondary link-button" href="${escapeHtml(data.recordingUrl)}" target="_blank" rel="noopener">▶ Ver partido</a></article>`).join(''):'Todavía no hay partidos grabados.';
}
$('#streamMatchSelect').addEventListener('change',renderStreaming);
$('#saveYoutubeLinks').addEventListener('click',()=>{if(!isAdmin()){alert('Solo el administrador puede configurar los enlaces de YouTube.');return}const id=$('#streamMatchSelect').value,liveUrl=$('#youtubeLiveUrl').value.trim(),recordingUrl=$('#youtubeRecordingUrl').value.trim();if(liveUrl&&!youtubeId(liveUrl)){alert('El enlace de YouTube Live no parece válido.');return}if(recordingUrl&&!youtubeId(recordingUrl)){alert('El enlace de grabación de YouTube no parece válido.');return}store.set(`stream:${id}`,{liveUrl,recordingUrl});renderStreaming()});

function availabilityKey(){return `availability:${$('#availabilityMatch').value}`}
function currentAvailability(){return availabilityData($('#availabilityMatch').value)}
function selectOptions(values,selected,placeholder){return `<option value="">${placeholder}</option>`+values.map(v=>`<option value="${String(v.value)}" ${String(selected)===String(v.value)?'selected':''}>${v.label}</option>`).join('')}
function weekdayFromDate(value){if(!value)return '';const d=new Date(`${value}T12:00:00`);return Number.isNaN(d.getTime())?'':String(d.getDay())}
function localYmd(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function todayYmd(){const d=new Date();return localYmd(d)}
function availabilityDatePreview(dateValue,hour){
  if(!dateValue||hour==='')return 'Elige una fecha y una hora';
  const date=new Date(`${dateValue}T12:00:00`);if(Number.isNaN(date.getTime()))return 'Fecha no válida';
  const month=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][date.getMonth()];
  const dayName=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][date.getDay()];
  return `${dayName} ${date.getDate()} de ${month} · ${hour}:00`;
}
function dateEditorValue(opt={}){return {date:opt.date||'',hour:opt.time?opt.time.split(':')[0]:''}}
function availabilityEditorHtml(opt,index){
  const v=dateEditorValue(opt),hours=Array.from({length:24},(_,i)=>({value:String(i).padStart(2,'0'),label:`${String(i).padStart(2,'0')}:00`}));
  const preview=availabilityDatePreview(v.date,v.hour);
  return `<article class="availability-editor-card" data-option-editor="${index}"><div class="availability-editor-title"><span>OPCIÓN ${index+1}${index===0?' · MÍNIMO 1':' · OPCIONAL'}</span><strong data-auto-date-preview>${preview}</strong></div><div class="weekday-time-grid"><label>Fecha<input type="date" data-field="date" min="${todayYmd()}" value="${escapeHtml(v.date)}"></label><label>Hora<select data-field="hour">${selectOptions(hours,v.hour,'Hora')}</select></label></div><div class="auto-date-note">📅 Puedes elegir una fecha concreta, aunque sea dentro de varias semanas.</div></article>`;
}
function updateAvailabilityEditorPreviews(){
  $$('#availabilityOptionEditors [data-option-editor]').forEach(card=>{const get=f=>card.querySelector(`[data-field="${f}"]`)?.value||'',date=get('date'),hour=get('hour'),preview=card.querySelector('[data-auto-date-preview]');if(preview)preview.textContent=availabilityDatePreview(date,hour)});
}
function readAvailabilityEditors(){
  const result=[];
  $$('#availabilityOptionEditors [data-option-editor]').forEach((card,index)=>{const get=f=>card.querySelector(`[data-field="${f}"]`)?.value||'',date=get('date'),hour=get('hour');if(date===''&&hour===''){result.push(null);return}if(date===''||hour===''){result.push({invalid:true,index});return}const chosen=new Date(`${date}T${hour}:00:00`);if(Number.isNaN(chosen.getTime())||chosen<new Date()){result.push({invalid:true,index});return}result.push({id:`opt-${index+1}`,weekday:Number(weekdayFromDate(date)),date,time:`${hour}:00`})});
  return result;
}
function availabilityVoteCounts(f,data,optId){
  const countTeam=key=>playersOf(key).reduce((n,p)=>n+(data.votes?.[p]?.[optId]?1:0),0);
  return {home:countTeam(f.home),away:countTeam(f.away)};
}
function renderAvailability(){
  const matchSelect=$('#availabilityMatch');
  if(!matchSelect)return;
  const matchId=matchSelect.value,f=findFixture(matchId),data=availabilityData(matchId);if(!f)return;
  const adminEditor=$('#availabilityAdminEditor');
  const adminMode=isAdmin();
  adminEditor.hidden=!adminMode;
  adminEditor.style.display=adminMode?'block':'none';
  if(adminMode){ $('#availabilityOptionEditors').innerHTML=[0,1,2].map(i=>availabilityEditorHtml(data.options[i]||{},i)).join(''); $$('#availabilityOptionEditors select, #availabilityOptionEditors input').forEach(el=>el.addEventListener('change',updateAvailabilityEditorPreviews)); updateAvailabilityEditorPreviews(); }

  if(!data.options.length){
    $('#availabilityOptions').innerHTML='<div class="empty-state">El administrador todavía no ha publicado ninguna fecha para votar.</div>';
    $('#availabilityGrid').innerHTML='';
    $('#availabilitySummary').innerHTML='<b>Estado</b><br>Esperando los días y horas propuestos.';
    return;
  }

  const totals=data.options.map(opt=>{const c=availabilityVoteCounts(f,data,opt.id);return {...c,total:c.home+c.away}}),best=Math.max(...totals.map(x=>x.total));
  $('#availabilityOptions').innerHTML=data.options.map((opt,i)=>{const c=totals[i],confirmed=data.confirmedOptionId===opt.id;return `<article class="availability-option-card ${confirmed?'confirmed':''}"><div><span class="availability-option-number">${availabilityVoteLabel(opt)}</span><h3>${availabilityOptionLabel(opt)}</h3><div class="availability-big-count"><strong>${c.total}</strong><span>personas pueden</span></div><p>${teamProfileInline(f.home)}: <b>${c.home}</b> · ${teamProfileInline(f.away)}: <b>${c.away}</b></p></div><div class="availability-option-actions">${c.total===best&&best>0?'<span class="best-option">⭐ Más gente disponible</span>':''}${confirmed?'<span class="confirmed-option">✓ Horario confirmado</span>':isAdmin()?`<button class="ghost compact-btn" type="button" data-confirm-option="${opt.id}">Confirmar horario</button>`:''}</div></article>`}).join('');
  $$('#availabilityOptions [data-confirm-option]').forEach(btn=>btn.addEventListener('click',()=>{if(!isAdmin())return;const d=availabilityData(matchId);d.confirmedOptionId=btn.dataset.confirmOption;saveAvailabilityData(matchId,d);renderAvailability();renderRounds();renderHomeDashboard();renderLive()}));

  $('#availabilityGrid').innerHTML=[f.home,f.away].map(teamKey=>`<section class="availability-team-votes"><div class="availability-team-head"><img src="${teams[teamKey].logo}" alt="" data-team-profile="${teamKey}" class="team-profile-target"><h3>${teamProfileInline(teamKey)}</h3></div>${playersOf(teamKey).map(player=>{const editable=canVoteFor(player,matchId),responded=!!data.responded?.[player];return `<div class="availability-player-row"><div class="availability-player-name">${playerProfileButton(player)}${responded?'<span class="responded-dot" title="Ha votado">✓</span>':''}</div><div class="availability-player-options">${data.options.map((opt,i)=>`<button class="availability-vote-chip ${data.votes?.[player]?.[opt.id]?'selected':''}" type="button" data-player="${escapeHtml(player)}" data-option="${opt.id}" ${editable?'':'disabled'}>${data.votes?.[player]?.[opt.id]?'✓ ':''}${availabilityVoteLabel(opt)}</button>`).join('')}<button class="availability-none-chip ${responded&&!Object.values(data.votes?.[player]||{}).some(Boolean)?'selected':''}" type="button" data-player="${escapeHtml(player)}" data-none="true" ${editable?'':'disabled'}>Ninguna</button></div></div>`}).join('')}</section>`).join('');

  $$('#availabilityGrid [data-option]').forEach(btn=>btn.addEventListener('click',()=>{const player=btn.dataset.player;if(!canVoteFor(player,matchId))return;const d=availabilityData(matchId);d.votes[player]=d.votes[player]||{};d.votes[player][btn.dataset.option]=!d.votes[player][btn.dataset.option];d.responded[player]=true;saveAvailabilityData(matchId,d);renderAvailability()}));
  $$('#availabilityGrid [data-none]').forEach(btn=>btn.addEventListener('click',()=>{const player=btn.dataset.player;if(!canVoteFor(player,matchId))return;const d=availabilityData(matchId);d.votes[player]={};d.responded[player]=true;saveAvailabilityData(matchId,d);renderAvailability()}));

  const responded=[...playersOf(f.home),...playersOf(f.away)].filter(p=>data.responded?.[p]).length,totalPlayers=playersOf(f.home).length+playersOf(f.away).length;
  const hint='Solo el administrador puede gestionar y marcar la disponibilidad de los jugadores.';
  $('#availabilitySummary').innerHTML=`<b>Participación</b><br>${responded} de ${totalPlayers} jugadores tienen disponibilidad registrada.<br><small>${escapeHtml(hint)}</small>`;
}
$('#availabilityMatch')?.addEventListener('change',renderAvailability);
$('#saveAvailabilityOptions')?.addEventListener('click',()=>{if(!isAdmin())return;const matchId=$('#availabilityMatch').value,current=availabilityData(matchId),items=readAvailabilityEditors(),valid=items.filter(Boolean);if(items.some(x=>x?.invalid)||valid.length<1){$('#availabilityAdminMsg').textContent='Elige al menos una fecha y una hora válidas.';return}const labels=valid.map(x=>`${x.date} ${x.time}`);if(new Set(labels).size!==labels.length){$('#availabilityAdminMsg').textContent='Las fechas y horas propuestas deben ser diferentes.';return}current.options=valid;current.confirmedOptionId='';current.votes={};current.responded={};saveAvailabilityData(matchId,current);$('#availabilityAdminMsg').textContent=`${valid.length===1?'Fecha guardada':`${valid.length} fechas guardadas`}. Gestión disponible solo para administración.`;renderAvailability();renderRounds();renderHomeDashboard();renderLive()});
$('#clearAvailabilityOptions')?.addEventListener('click',()=>{if(!isAdmin())return;if(!confirm('¿Borrar los días propuestos y todos los votos de este partido?'))return;saveAvailabilityData($('#availabilityMatch').value,defaultAvailability());$('#availabilityAdminMsg').textContent='Días borrados.';renderAvailability();renderRounds();renderHomeDashboard();renderLive()});


function newsMatchLabel(item){
  const f=findFixture(item.fixtureId);
  const left=item.displayHome||teams[f?.away]?.name||'Fenerbahçupito';
  const right=item.displayAway||teams[f?.home]?.name||'Ordago FC';
  return `${left} vs ${right}`;
}
function renderNews(){
  const roundSelect=$('#newsRound'),matchSelect=$('#newsMatch'),content=$('#newsContent');
  if(!roundSelect||!matchSelect||!content)return;
  const rounds=[...new Set(NEWS_MATCHES.map(n=>n.round))].sort((a,b)=>a-b);
  const currentRound=Number(roundSelect.value)||rounds[0]||1;
  roundSelect.innerHTML=rounds.map(r=>`<option value="${r}" ${r===currentRound?'selected':''}>Jornada ${r}</option>`).join('');
  const matches=NEWS_MATCHES.filter(n=>n.round===currentRound),selected=matches.find(n=>n.id===matchSelect.value)||matches[0];
  matchSelect.innerHTML=matches.map(n=>`<option value="${n.id}" ${selected?.id===n.id?'selected':''}>${escapeHtml(newsMatchLabel(n))}</option>`).join('');
  if(!selected){content.innerHTML='<div class="empty-state">Todavía no hay periódico publicado para esta jornada.</div>';return}
  const main=selected.pages[0],secondary=selected.pages[1];
  content.innerHTML=`
    <section class="news-score-strip">
      <div class="news-team"><img src="${teams[selected.home]?.logo||''}" alt=""><strong>${escapeHtml(selected.displayHome||teams[selected.home]?.name||'')}</strong></div>
      <div class="news-score"><span>JORNADA ${selected.round}</span><strong>${selected.score}</strong><small>FINAL</small></div>
      <div class="news-team"><img src="${teams[selected.away]?.logo||''}" alt=""><strong>${escapeHtml(selected.displayAway||teams[selected.away]?.name||'')}</strong></div>
    </section>
    <section class="news-feature-grid">
      <button class="news-feature-main" type="button" data-news-index="0">
        <img src="${main.image}" alt="${escapeHtml(main.title)}" loading="lazy"><span class="news-overlay"></span>
        <div class="news-feature-copy"><span class="news-tag">CRÓNICA DEL PARTIDO</span><h2>${escapeHtml(selected.headline)}</h2><p>${escapeHtml(selected.summary)}</p><b>Ver página completa →</b></div>
      </button>
      <button class="news-feature-side" type="button" data-news-index="1">
        <img src="${secondary.image}" alt="${escapeHtml(secondary.title)}" loading="lazy"><span class="news-overlay"></span>
        <div class="news-feature-copy"><span class="news-tag gold">MVP</span><h3>${escapeHtml(secondary.title)}</h3><p>${escapeHtml(secondary.text)}</p><b>Leer →</b></div>
      </button>
    </section>
    <section class="news-grid">
      ${selected.pages.slice(2).map((page,index)=>`<button class="news-card" type="button" data-news-index="${index+2}"><img src="${page.image}" alt="${escapeHtml(page.title)}" loading="lazy"><div class="news-card-copy"><span class="news-tag">${escapeHtml(page.tag)}</span><h3>${escapeHtml(page.title)}</h3><p>${escapeHtml(page.text)}</p><b>Abrir página →</b></div></button>`).join('')}
    </section>`;
  activeNewsPages=selected.pages.slice();
  content.querySelectorAll('[data-news-index]').forEach(btn=>btn.addEventListener('click',()=>openNewsImageByIndex(Number(btn.dataset.newsIndex))));
}
let activeNewsPages=[];
let activeNewsPageIndex=-1;
let newsTouchStartX=null;
function updateNewsDialogImage(){
  const page=activeNewsPages[activeNewsPageIndex],img=$('#newsDialogImage'),counter=$('#newsDialogCounter');
  if(!page||!img)return;
  img.alt=page.title||'Página del periódico de la liga';
  img.onerror=()=>{img.alt='No se ha podido cargar esta página del periódico.'};
  img.src=page.image;
  if(counter)counter.textContent=`${activeNewsPageIndex+1} / ${activeNewsPages.length}`;
  const prev=$('#newsPrev'),next=$('#newsNext');
  if(prev)prev.disabled=activeNewsPages.length<2;
  if(next)next.disabled=activeNewsPages.length<2;
}
function openNewsImageByIndex(index){
  activeNewsPageIndex=Math.max(0,Math.min(activeNewsPages.length-1,Number(index)||0));
  openNewsImage(activeNewsPages[activeNewsPageIndex]?.image||'');
  updateNewsDialogImage();
}
function moveNewsImage(direction){
  if(activeNewsPages.length<2)return;
  activeNewsPageIndex=(activeNewsPageIndex+direction+activeNewsPages.length)%activeNewsPages.length;
  updateNewsDialogImage();
}
let newsDialogHistoryOpen=false;
let newsDialogClosing=false;
function closeNewsImage({fromHistory=false}={}){
  const d=$('#newsDialog'),img=$('#newsDialogImage');
  if(!d)return;

  // Cerramos visualmente SIEMPRE primero. Así la X no depende del historial.
  newsDialogClosing=true;
  try{if(typeof d.close==='function'&&d.open)d.close()}catch{}
  d.classList.remove('fallback-open');
  d.removeAttribute('open');
  if(img){img.removeAttribute('src');img.alt='Página del periódico de la liga';}

  const shouldPopHistory=!fromHistory && newsDialogHistoryOpen && history.state?.newsModal;
  newsDialogHistoryOpen=false;
  newsDialogClosing=false;

  // Quitamos el estado ficticio que añadimos al abrir la foto, pero ya está cerrada.
  if(shouldPopHistory){
    setTimeout(()=>{
      if(history.state?.newsModal)history.back();
    },0);
  }
}
function openNewsImage(src){
  const d=$('#newsDialog'),img=$('#newsDialogImage');
  if(!d||!img)return;
  img.alt='Página del periódico de la liga';
  img.onerror=()=>{img.alt='No se ha podido cargar esta página del periódico.'};
  img.src=src;
  try{
    if(typeof d.showModal==='function'&&!d.open)d.showModal();
    else if(!d.open){d.setAttribute('open','open');d.classList.add('fallback-open');}
  }catch(_err){
    d.setAttribute('open','open');
    d.classList.add('fallback-open');
  }
  if(!history.state?.newsModal){
    const currentView=document.body.dataset.view||'noticias';
    history.pushState({...history.state,leagueInternal:true,leagueView:currentView,newsModal:true},'',location.href);
  }
  newsDialogHistoryOpen=true;
}
$('#newsRound')?.addEventListener('change',()=>{$('#newsMatch').value='';renderNews()});
$('#newsMatch')?.addEventListener('change',renderNews);
// Delegado: funciona aunque el diálogo esté definido después de app.js en el HTML.
document.addEventListener('click',e=>{
  const close=e.target.closest?.('#closeNewsDialog');
  if(close){e.preventDefault();e.stopPropagation();closeNewsImage();return;}
  const d=$('#newsDialog');
  if(d?.open && e.target===d)closeNewsImage();
});
document.addEventListener('pointerup',e=>{
  if(e.target.closest?.('#closeNewsDialog')){e.preventDefault();e.stopPropagation();closeNewsImage();}
},{passive:false});
document.addEventListener('click',e=>{
  if(e.target.closest?.('#newsPrev')){e.preventDefault();e.stopPropagation();moveNewsImage(-1);}
  if(e.target.closest?.('#newsNext')){e.preventDefault();e.stopPropagation();moveNewsImage(1);}
});
document.addEventListener('keydown',e=>{
  if(!$('#newsDialog')?.open)return;
  if(e.key==='Escape'){e.preventDefault();closeNewsImage();}
  if(e.key==='ArrowLeft'){e.preventDefault();moveNewsImage(-1);}
  if(e.key==='ArrowRight'){e.preventDefault();moveNewsImage(1);}
});
document.addEventListener('touchstart',e=>{
  if(!$('#newsDialog')?.open)return;
  newsTouchStartX=e.touches?.[0]?.clientX??null;
},{passive:true});
document.addEventListener('touchend',e=>{
  if(!$('#newsDialog')?.open||newsTouchStartX===null)return;
  const end=e.changedTouches?.[0]?.clientX??newsTouchStartX,delta=end-newsTouchStartX;newsTouchStartX=null;
  if(Math.abs(delta)>45)moveNewsImage(delta>0?-1:1);
},{passive:true});

async function hydrateIdealFiveFromSupabase(force=false){
  if(idealRemoteLoaded&&!force)return;
  try{
    await loadRemotePlayerIndex();
    const {data,error}=await supabaseClient.from('ideal_five').select('round,position,player_id');
    if(error)throw error;
    const grouped={};
    (data||[]).forEach(row=>{const player=remotePlayerById.get(row.player_id);if(!player)return;grouped[row.round]=grouped[row.round]||{};grouped[row.round][row.position]=player.name});
    Object.entries(grouped).forEach(([round,selection])=>store.set(`ideal:${round}`,normalizeIdealSelection(selection)));
    idealRemoteLoaded=true;
    if(document.body.dataset.view==='premios'){renderIdeal();const msg=$('#idealSaved');if(msg&&Object.keys(grouped).length)msg.textContent='5 ideal sincronizado con la liga.';}
  }catch(err){console.warn('No se pudo cargar el 5 ideal compartido',err)}
}
async function saveIdealFiveToSupabase(round,selection){
  await loadRemotePlayerIndex();
  const rows=IDEAL_POSITIONS.map(pos=>({round:Number(round),position:pos.key,player_id:remotePlayerByName.get(selection[pos.key])?.id}));
  if(rows.some(r=>!r.player_id))throw new Error('No se pudo identificar a uno de los jugadores en Supabase.');
  const {error:delError}=await supabaseClient.from('ideal_five').delete().eq('round',Number(round));
  if(delError)throw delError;
  const {error}=await supabaseClient.from('ideal_five').insert(rows);
  if(error)throw error;
  idealRemoteLoaded=true;
}

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
  const meta=playerName?allPlayers.find(p=>p.name===playerName):null;
  const team=meta?teams[meta.key]:null;
  const round=Number($('#idealRound')?.value||0);
  const roundStats=playerName?playerRoundStats(playerName,round):{goals:0,assists:0,mvps:0};
  const selectHtml=editable?`<div class="ideal-picker"><select aria-label="Elegir ${pos.label}" id="ideal-${pos.key}" data-position="${pos.key}"><option value="">Selecciona jugador</option>${allPlayers.map(p=>`<option value="${escapeHtml(p.name)}" ${playerName===p.name?'selected':''}>${escapeHtml(p.name)} · ${p.team}</option>`).join('')}</select></div>`:'';
  if(playerName){
    const mvpHtml=roundStats.mvps?`<span class="toty-stat mvp">⭐ ${roundStats.mvps}</span>`:'';
    return `<article class="ideal-player-card toty-card filled ${pos.className}"><div class="toty-shell"><div class="toty-crown">♛</div><span class="ideal-role-tag">${pos.label}</span>${team?`<img class="ideal-team-logo team-profile-target" src="${team.logo}" alt="${escapeHtml(team.name)}" data-team-profile="${meta.key}">`:''}<div class="toty-photo-wrap">${playerAvatarHtml(playerName,'ideal-avatar')}</div><div class="ideal-player-copy"><strong>${playerProfileButton(playerName)}</strong><small>${escapeHtml(meta?.team||'')}</small><div class="toty-round-stats"><span class="toty-stat">⚽ ${roundStats.goals}</span><span class="toty-stat">🅰️ ${roundStats.assists}</span>${mvpHtml}</div></div></div>${selectHtml}</article>`;
  }
  return `<article class="ideal-player-card toty-card empty ${pos.className}"><div class="toty-shell"><div class="toty-crown">♛</div><span class="ideal-role-tag">${pos.label}</span><span class="ideal-empty-avatar">${pos.short}</span><div class="ideal-player-copy"><strong>Sin asignar</strong><small>Elige un jugador</small></div></div>${selectHtml}</article>`;
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
$('#idealRound').addEventListener('change',()=>{renderIdeal();hydrateIdealFiveFromSupabase(true).then(()=>renderIdeal()).catch(()=>{});});
$('#saveIdeal').addEventListener('click',async()=>{
  if(!isAdmin()){alert('Solo el administrador puede elegir el 5 ideal.');return}
  const round=$('#idealRound').value,vals=idealSelectionFromForm(),chosen=Object.values(vals).filter(Boolean),btn=$('#saveIdeal');
  if(chosen.length!==5){alert('Selecciona los 5 jugadores de la formación.');return}
  if(new Set(chosen).size!==5){alert('No puedes repetir jugadores en el 5 ideal.');return}
  btn.disabled=true;$('#idealSaved').textContent='Guardando para todos los dispositivos…';
  try{await saveIdealFiveToSupabase(round,vals);store.set(`ideal:${round}`,vals);renderIdeal();$('#idealSaved').textContent='✓ 5 ideal guardado y sincronizado para todos los dispositivos.'}
  catch(err){console.error(err);$('#idealSaved').textContent='No se pudo sincronizar el 5 ideal. Inténtalo de nuevo.'}
  finally{btn.disabled=!isAdmin()}
});

function fillRoundRect(ctx,x,y,w,h,r,fill){
  ctx.beginPath();
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
  ctx.fillStyle=fill;ctx.fill();
}
function strokeRoundRect(ctx,x,y,w,h,r,stroke,lineWidth=2){
  ctx.beginPath();
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
  ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();
}
function clipCircle(ctx,x,y,r){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.closePath();ctx.clip();}
function drawCircleAvatar(ctx,player,x,y,size){
  const photo=playerPhoto(player.name);
  const initials=player.name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase();
  ctx.save();
  ctx.beginPath();ctx.arc(x,y,size/2,0,Math.PI*2);ctx.closePath();
  ctx.fillStyle='rgba(255,255,255,.12)';ctx.fill();
  if(photo&&imageCache.has(photo)){
    ctx.save();clipCircle(ctx,x,y,size/2);ctx.drawImage(imageCache.get(photo),x-size/2,y-size/2,size,size);ctx.restore();
  }else{
    ctx.fillStyle='#8a5c16';ctx.beginPath();ctx.arc(x,y,size/2,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 30px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(initials,x,y+2);
  }
  ctx.lineWidth=4;ctx.strokeStyle='rgba(255,255,255,.88)';ctx.stroke();
  ctx.restore();
}
async function loadGraphicImage(src){
  return new Promise(resolve=>{
    if(!src)return resolve(null);
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>resolve(img);
    img.onerror=()=>resolve(null);
    img.src=src;
  });
}
let imageCache=new Map();
async function buildIdealShareCanvas(){
  const round=Number($('#idealRound')?.value||0);
  const selection=idealSelectionFromForm();
  const chosen=IDEAL_POSITIONS.map(pos=>selection[pos.key]).filter(Boolean);
  if(chosen.length!==5)throw new Error('Completa el 5 ideal antes de exportarlo.');
  const players=IDEAL_POSITIONS.map(pos=>{
    const name=selection[pos.key]||'';
    const meta=allPlayers.find(p=>p.name===name);
    const team=meta?teams[meta.key]:null;
    const stats=name?playerRoundStats(name,round):{goals:0,assists:0};
    return {pos,name,meta,team,stats};
  });
  imageCache=new Map();
  const sources=[...new Set(players.flatMap(p=>[p.team?.logo,playerPhoto(p.name)]).filter(Boolean))];
  await Promise.all(sources.map(async src=>{const img=await loadGraphicImage(src);if(img)imageCache.set(src,img);}));

  const canvas=document.createElement('canvas');
  canvas.width=1080;canvas.height=1350;
  const ctx=canvas.getContext('2d');
  const grad=ctx.createLinearGradient(0,0,0,1350);grad.addColorStop(0,'#190d10');grad.addColorStop(.45,'#132517');grad.addColorStop(1,'#08110c');
  ctx.fillStyle=grad;ctx.fillRect(0,0,canvas.width,canvas.height);

  // Header
  ctx.fillStyle='rgba(255,255,255,.08)';ctx.fillRect(0,0,1080,150);
  ctx.fillStyle='#f5c76f';ctx.font='700 28px Arial';ctx.textAlign='left';ctx.fillText('PEDRALBES LEAGUE',70,58);
  ctx.fillStyle='#fff';ctx.font='900 74px Arial';ctx.fillText('5 IDEAL',70,118);
  ctx.textAlign='right';ctx.fillStyle='#f5c76f';ctx.font='700 34px Arial';ctx.fillText(`JORNADA ${round}`,1000,74);
  ctx.fillStyle='rgba(255,255,255,.82)';ctx.font='500 24px Arial';ctx.fillText('Formación oficial para compartir',1000,112);

  // Pitch area
  const pitch={x:70,y:180,w:940,h:1090};
  fillRoundRect(ctx,pitch.x,pitch.y,pitch.w,pitch.h,34,'rgba(12,40,20,.62)');
  strokeRoundRect(ctx,pitch.x,pitch.y,pitch.w,pitch.h,34,'rgba(255,255,255,.28)',3);
  strokeRoundRect(ctx,pitch.x+24,pitch.y+24,pitch.w-48,pitch.h-48,18,'rgba(255,255,255,.72)',4);
  ctx.beginPath();ctx.moveTo(540,pitch.y+24);ctx.lineTo(540,pitch.y+pitch.h-24);ctx.strokeStyle='rgba(255,255,255,.72)';ctx.lineWidth=4;ctx.stroke();
  ctx.beginPath();ctx.arc(540,725,95,0,Math.PI*2);ctx.stroke();
  strokeRoundRect(ctx,390,205,300,110,0,'rgba(255,255,255,.72)',4);
  strokeRoundRect(ctx,390,1135,300,110,0,'rgba(255,255,255,.72)',4);
  ctx.clearRect(394,209,292,102); ctx.clearRect(394,1139,292,102);
  // redraw penalty arcs nicer
  ctx.beginPath();ctx.moveTo(390,315);ctx.quadraticCurveTo(540,415,690,315);ctx.stroke();
  ctx.beginPath();ctx.moveTo(390,1135);ctx.quadraticCurveTo(540,1035,690,1135);ctx.stroke();
  // goals
  ctx.strokeRect(500,180,80,18);ctx.strokeRect(500,1252,80,18);

  const positions={
    pivot:{x:540,y:345},
    alaLeft:{x:245,y:690},
    alaRight:{x:835,y:690},
    cierre:{x:540,y:935},
    goalkeeper:{x:540,y:1145}
  };
  players.forEach(player=>{
    const c=positions[player.pos.key]; if(!c)return;
    const cardW=250, cardH=186, cardX=c.x-cardW/2, cardY=c.y-cardH/2;
    fillRoundRect(ctx,cardX,cardY,cardW,cardH,26,'#071f63');
    strokeRoundRect(ctx,cardX,cardY,cardW,cardH,26,'#f2c766',5);
    ctx.fillStyle='rgba(245,199,111,.16)';fillRoundRect(ctx,cardX+16,cardY+16,90,26,13,'rgba(245,199,111,.16)');
    ctx.fillStyle='#f5c76f';ctx.font='700 15px Arial';ctx.textAlign='left';ctx.fillText(player.pos.label.toUpperCase(),cardX+24,cardY+34);
    if(player.team?.logo&&imageCache.has(player.team.logo))ctx.drawImage(imageCache.get(player.team.logo),cardX+cardW-54,cardY+14,34,34);
    drawCircleAvatar(ctx,player,c.x,cardY+86,82);
    ctx.fillStyle='#fff';ctx.font='700 23px Arial';ctx.textAlign='center';ctx.fillText(player.name||'Sin asignar',c.x,cardY+144);
    ctx.fillStyle='rgba(255,255,255,.8)';ctx.font='500 16px Arial';ctx.fillText(player.meta?.team||'',c.x,cardY+166);
    fillRoundRect(ctx,c.x-76,cardY+176,64,28,14,'rgba(255,255,255,.08)');
    fillRoundRect(ctx,c.x+12,cardY+176,64,28,14,'rgba(255,255,255,.08)');
    ctx.fillStyle='#fff';ctx.font='700 15px Arial';ctx.fillText(`G ${player.stats.goals}`,c.x-44,cardY+195);
    ctx.fillText(`A ${player.stats.assists}`,c.x+44,cardY+195);
  });

  ctx.textAlign='center';ctx.fillStyle='rgba(255,255,255,.75)';ctx.font='500 20px Arial';ctx.fillText('Exportado desde la web oficial de la Pedralbes League',540,1315);
  return canvas;
}
function canvasToBlob(canvas){return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));}
async function shareIdealAsImage(){
  const btn=$('#shareIdeal'),msg=$('#idealSaved');
  if(btn)btn.disabled=true;
  if(msg)msg.textContent='Preparando imagen del 5 ideal…';
  try{
    const round=Number($('#idealRound')?.value||0);
    const canvas=await buildIdealShareCanvas();
    const blob=await canvasToBlob(canvas);
    if(!blob)throw new Error('No se pudo generar la imagen.');
    const file=new File([blob],`5-ideal-jornada-${round}.png`,{type:'image/png'});
    const canNativeShare=!!(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]}));
    if(canNativeShare){
      await navigator.share({files:[file],title:`5 ideal · Jornada ${round}`,text:`5 ideal de la Jornada ${round} · Pedralbes League`});
      if(msg)msg.textContent='✓ Imagen lista y compartida.';
      return;
    }
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`5-ideal-jornada-${round}.png`;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    if(msg)msg.textContent='✓ Imagen descargada.';
  }catch(err){
    console.error(err);
    if(msg)msg.textContent=err?.message||'No se pudo exportar la imagen del 5 ideal.';
  }finally{if(btn)btn.disabled=false;}
}
$('#shareIdeal')?.addEventListener('click',shareIdealAsImage);

function renderPlayerProfile(name){
  activePlayerName=name;const meta=allPlayers.find(p=>p.name===name);if(!meta)return;const st=playerStats()[name],team=teams[meta.key],photo=playerPhoto(name);
  $('#playerProfileName').textContent=name;$('#playerProfileAvatar').innerHTML=photo?`<img src="${photo}" alt="Foto de ${escapeHtml(name)}">`:escapeHtml(name.split(' ').map(x=>x[0]).slice(0,2).join(''));$('#playerProfileTeam').textContent=team.name;markTeamProfileTarget($('#playerProfileTeam'),meta.key);$('#playerProfileTeamLogo').src=team.logo;markTeamProfileTarget($('#playerProfileTeamLogo'),meta.key);$('#playerProfileCaptain').hidden=!meta.captain;
  $('#playerProfileGoals').textContent=st.goals;$('#playerProfileAssists').textContent=st.assists;$('#playerProfileMvps').textContent=st.mvps;
  $('#playerPhotoControls').hidden=!isAdmin();$('#removePlayerPhoto').disabled=!photo;const photoHelp=$('#playerPhotoHelp');if(photoHelp)photoHelp.textContent='La foto del propio jugador se cambia desde Cuenta. El administrador puede corregir cualquier foto aquí.';
  const pending=fixtures.filter(f=>(f.home===meta.key||f.away===meta.key)&&!getStateFor(f.id).finished).sort((a,b)=>Number(a.round)-Number(b.round))[0];
  if(pending){    const opp=pending.home===meta.key?pending.away:pending.home;
    $('#playerPendingMatch').innerHTML=`<article class="player-pending-card"><div class="pending-opponent"><img src="${teams[opp].logo}" alt="" data-team-profile="${opp}" class="team-profile-target"><div><strong>${teamProfileInline(meta.key)} vs ${teamProfileInline(opp)}</strong><span>Jornada ${pending.round}</span></div></div><div class="pending-status"><strong>Fecha por decidir</strong><small>La asistencia se confirma desde el acta del partido.</small></div></article>`;
  }else{$('#playerPendingMatch').innerHTML='<div class="empty-state">No quedan partidos pendientes para este jugador.</div>'}
  const activity=[];
  fixtures.forEach(f=>{const state=getStateFor(f.id),relevant=(state.events||[]).filter(e=>e.scorer===name||e.assist===name),isMvp=state.mvp===name;if(!relevant.length&&!isMvp)return;const details=[];relevant.forEach(e=>{const score=e.scoreAfter?` · ${e.scoreAfter}`:'';if(e.scorer===name)details.push(`<span>⚽ Gol${score} · ${e.half}ª parte · ${e.minute}'${Number(e.competitionValue ?? e.value ?? 1)===2?' · ⚡ +2 goles de competición':''}</span>`);if(e.assist===name)details.push(`<span>🅰️ Asistencia a ${playerProfileButton(e.scorer)}${score} · ${e.half}ª parte · ${e.minute}'</span>`)});if(isMvp)details.push('<span>⭐ MVP del partido</span>');activity.push(`<article class="player-history-item"><div class="history-match-head"><div><strong>Jornada ${f.round}</strong><span>${teamProfileInline(f.home)} ${state.finished?state.homeScore:'–'} ${state.finished?state.awayScore:'–'} ${teamProfileInline(f.away)}</span></div><span class="history-status">${state.finished?'Finalizado':statusForFixture(f)}</span></div><div class="history-events">${details.join('')}</div></article>`)});
  $('#playerMatchHistory').innerHTML=activity.length?activity.join(''):'<div class="empty-state">Este jugador todavía no tiene goles, asistencias ni MVP registrados.</div>';
}
function openPlayer(name){playerReturnView=document.body.dataset.view==='jugador'?playerReturnView:(document.body.dataset.view||'equipos');renderPlayerProfile(name);navigate('jugador')}
document.addEventListener('click',e=>{const b=e.target.closest('[data-player-profile]');if(!b)return;e.preventDefault();openPlayer(b.dataset.playerProfile)});
$('#playerBack').addEventListener('click',()=>goBack(playerReturnView||'equipos'));
$('#teamBack').addEventListener('click',()=>goBack(teamReturnView||'equipos'));
$('#liveBack')?.addEventListener('click',()=>goBack('inicio'));
$('#availabilityBack')?.addEventListener('click',()=>goBack('inicio'));
$('#streamingBack')?.addEventListener('click',()=>goBack('directo'));
document.addEventListener('click',e=>{const b=e.target.closest('[data-team-profile]');if(!b)return;e.preventDefault();e.stopPropagation();openTeam(b.dataset.teamProfile)},true);
document.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const b=e.target.closest?.('[data-team-profile]');if(!b)return;e.preventDefault();e.stopPropagation();openTeam(b.dataset.teamProfile)});

async function resizeImageFile(file){
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{const size=512,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d'),side=Math.min(img.width,img.height),sx=(img.width-side)/2,sy=(img.height-side)/2;ctx.drawImage(img,sx,sy,side,side,0,0,size,size);resolve(canvas.toDataURL('image/jpeg',.82))};img.src=reader.result};reader.readAsDataURL(file)})
}
function dataUrlToBlob(dataUrl){const parts=dataUrl.split(','),mime=(parts[0].match(/data:([^;]+)/)||[])[1]||'image/jpeg',raw=atob(parts[1]||''),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type:mime})}
async function persistPlayerPhoto(name,fileOrDataUrl){
  if(!canEditPlayerPhoto(name))throw new Error('No tienes permiso para cambiar esta foto.');
  await loadRemotePlayerIndex(true);const player=remotePlayerByName.get(name);if(!player)throw new Error('No se encontró el jugador en Supabase.');
  const dataUrl=typeof fileOrDataUrl==='string'?fileOrDataUrl:await resizeImageFile(fileOrDataUrl),blob=dataUrlToBlob(dataUrl),path=`${player.id}/profile.jpg`;
  const {error:uploadError}=await supabaseClient.storage.from('player-photos').upload(path,blob,{contentType:'image/jpeg',upsert:true,cacheControl:'3600'});if(uploadError)throw uploadError;
  const {data:publicData}=supabaseClient.storage.from('player-photos').getPublicUrl(path);const baseUrl=publicData?.publicUrl;if(!baseUrl)throw new Error('No se pudo obtener la URL de la foto.');
  const url=`${baseUrl}?v=${Date.now()}`;
  const {error:updateError}=await supabaseClient.from('players').update({photo_url:url}).eq('id',player.id);if(updateError)throw updateError;
  remotePlayerByName.set(name,{...player,photo_url:url});remotePlayerById.set(player.id,{...player,photo_url:url});store.remove(`playerPhoto:${name}`);
  if(authStateUser?.linkedPlayer===name)authStateUser.linkedPlayerPhoto=url;
  refreshAuthUI();refreshDataViews();if(activePlayerName===name&&document.body.dataset.view==='jugador')renderPlayerProfile(name);if(document.body.dataset.view==='cuenta')renderAccountPanel();
  return url;
}
async function removePersistentPlayerPhoto(name){
  if(!canEditPlayerPhoto(name))throw new Error('No tienes permiso para quitar esta foto.');
  await loadRemotePlayerIndex(true);const player=remotePlayerByName.get(name);if(!player)throw new Error('No se encontró el jugador en Supabase.');
  const path=`${player.id}/profile.jpg`;const {error:storageError}=await supabaseClient.storage.from('player-photos').remove([path]);if(storageError)console.warn('No se pudo borrar el archivo anterior',storageError);
  const {error:updateError}=await supabaseClient.from('players').update({photo_url:null}).eq('id',player.id);if(updateError)throw updateError;
  remotePlayerByName.set(name,{...player,photo_url:null});remotePlayerById.set(player.id,{...player,photo_url:null});store.remove(`playerPhoto:${name}`);if(authStateUser?.linkedPlayer===name)authStateUser.linkedPlayerPhoto=null;
  refreshAuthUI();refreshDataViews();if(activePlayerName===name&&document.body.dataset.view==='jugador')renderPlayerProfile(name);if(document.body.dataset.view==='cuenta')renderAccountPanel();
}
function bindAccountPhotoControls(){
  const input=$('#accountPhotoInput'),remove=$('#accountRemovePhoto'),status=$('#accountPhotoStatus'),name=currentUser()?.linkedPlayer;if(!name)return;
  input?.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')){if(status)status.textContent='Selecciona una imagen válida.';return}try{if(status)status.textContent='Guardando foto...';await persistPlayerPhoto(name,file);const st=$('#accountPhotoStatus');if(st)st.textContent='✓ Foto guardada y sincronizada en todos los dispositivos.'}catch(err){console.error(err);const st=$('#accountPhotoStatus');if(st)st.textContent=err?.message||'No se pudo guardar la foto.'}finally{e.target.value=''}});
  remove?.addEventListener('click',async()=>{try{if(status)status.textContent='Quitando foto...';await removePersistentPlayerPhoto(name)}catch(err){console.error(err);const st=$('#accountPhotoStatus');if(st)st.textContent=err?.message||'No se pudo quitar la foto.'}});
}
async function migrateLinkedLocalPhoto(){
  const name=currentUser()?.linkedPlayer;if(!name||!canEditPlayerPhoto(name))return;await loadRemotePlayerIndex();const player=remotePlayerByName.get(name),local=store.get(`playerPhoto:${name}`,null);if(local&&!player?.photo_url){try{await persistPlayerPhoto(name,local)}catch(err){console.warn('No se pudo migrar la foto local antigua',err)}}
}
$('#playerPhotoInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file||!activePlayerName)return;if(!isAdmin()){alert('La foto del propio jugador se cambia desde Cuenta.');return}if(!file.type.startsWith('image/')){alert('Selecciona una imagen.');return}try{await persistPlayerPhoto(activePlayerName,file)}catch(err){console.error(err);alert(err?.message||'No se pudo guardar la foto.')}finally{e.target.value=''}});
$('#removePlayerPhoto').addEventListener('click',async()=>{if(!activePlayerName||!isAdmin())return;try{await removePersistentPlayerPhoto(activePlayerName)}catch(err){console.error(err);alert(err?.message||'No se pudo quitar la foto.')}});

$$('[data-classification-tab]').forEach(btn=>btn.addEventListener('click',()=>{const tab=btn.dataset.classificationTab;$$('[data-classification-tab]').forEach(b=>b.classList.toggle('active',b===btn));$('#classificationGroupPanel').hidden=tab!=='group';$('#classificationKnockoutPanel').hidden=tab!=='knockout'}));
$('#startNextMatch')?.addEventListener('click',()=>{});

function teamOptions(selected){return Object.entries(teams).map(([key,t])=>`<option value="${key}" ${selected===key?'selected':''}>${escapeHtml(t.name)}</option>`).join('')}
function fixtureHasData(id){const s=getStateFor(id),stream=streamData(id);return !!(s.finished||s.events?.length||s.mvp||stream.liveUrl||stream.recordingUrl)}
function clearFixtureLinkedData(id){store.remove(`match:${id}`);store.remove(`stream:${id}`);const refs=refereeAssignments();if(refs[id]){delete refs[id];store.set('league:refereeAssignments',refs)}}
function refreshAfterFixtureEdit(preferredId=''){
  saveFixtures();
  populateMatchSelects();
  if(!fixtures.length){renderRounds();renderHomeDashboard();renderAdmin();return}
  const id=fixtures.some(f=>f.id===preferredId)?preferredId:fixtures[0].id;
  live.matchId=id;live.half=1;live.remaining=1200;stopTimer();
  if($('#matchSelect'))$('#matchSelect').value=id;
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
      const ok=confirm('Este partido ya tiene datos asociados (resultado, eventos o vídeo). Si cambias los equipos, esos datos se borrarán para evitar mezclar estadísticas. ¿Continuar?');
      if(!ok)return;clearFixtureLinkedData(id);
    }
    f.round=round;f.home=home;f.away=away;delete f.rest;
    refreshAfterFixtureEdit(id);
  }));
  $$('#fixtureEditor [data-delete-fixture]').forEach(btn=>btn.addEventListener('click',()=>{
    const row=btn.closest('[data-fixture-id]'),id=row.dataset.fixtureId,f=fixtures.find(x=>x.id===id);if(!f)return;
    const warning=fixtureHasData(id)?' También se borrarán sus datos asociados (resultado y vídeo).':'';
    if(!confirm(`¿Eliminar ${teams[f.home].name} vs ${teams[f.away].name} de la Jornada ${f.round}?${warning}`))return;
    if(fixtureHasData(id))clearFixtureLinkedData(id);
    fixtures=fixtures.filter(x=>x.id!==id);refreshAfterFixtureEdit();
  }));
}
async function renderAdmin(){
  if(!isAdmin())return;
  renderFixtureEditor();
  const fixtureWrap=$('#fixtureEditor');
  if(fixtureWrap){
    fixtureWrap.insertAdjacentHTML('afterbegin',`<div class="notice" style="margin-bottom:14px"><strong>Sincronización de partidos</strong><br><span class="muted">Si este ordenador contiene resultados antiguos, súbelos a Supabase para verlos también en el móvil.</span><div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button id="forceSyncMatches" class="primary" type="button">Sincronizar datos de este navegador</button><span id="forceSyncMatchesStatus" class="muted"></span></div></div>`);
    $('#forceSyncMatches')?.addEventListener('click',async()=>{
      const btn=$('#forceSyncMatches'),status=$('#forceSyncMatchesStatus');btn.disabled=true;status.textContent='Sincronizando...';
      try{const count=await forceSyncAllLocalMatches();status.textContent=`✓ ${count} partido${count===1?'':'s'} sincronizado${count===1?'':'s'}. Ya puedes abrir el móvil.`;refreshDataViews();renderLive()}
      catch(err){console.error(err);status.textContent=`No se pudo sincronizar: ${err.message||err}`}
      finally{btn.disabled=false}
    });
  }
  const usersWrap=$('#adminUsers');
  if(usersWrap)usersWrap.innerHTML='<div class="empty-state">Cargando usuarios de Supabase...</div>';

  const [{data:profiles,error:profilesError},{data:roles,error:rolesError},{data:dbPlayers,error:playersError},{data:dbAssignments,error:assignmentsError}] = await Promise.all([
    supabaseClient.from('profiles').select('id,email,display_name,created_at').order('created_at',{ascending:true}),
    supabaseClient.from('user_roles').select('user_id,role'),
    supabaseClient.from('players').select('id,name,team_id,user_id,captain,photo_url').order('team_id').order('name'),
    supabaseClient.from('referee_assignments').select('fixture_id,user_id')
  ]);

  if(profilesError||rolesError||playersError||assignmentsError){
    console.error('Error cargando usuarios',profilesError||rolesError||playersError||assignmentsError);
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
      linkedTeamKey:player?.team_id||'',
      photoUrl:player?.photo_url||'',
      roles:(roles||[]).filter(r=>r.user_id===p.id).map(r=>r.role)
    };
  }).sort((a,b)=>String(a.linkedPlayer||a.displayName||a.email).localeCompare(String(b.linkedPlayer||b.displayName||b.email),'es',{sensitivity:'base'}));

  if(usersWrap){
    usersWrap.innerHTML=list.length?list.map(u=>{
      const self=u.email.toLowerCase()===LEAGUE_EMAIL;
      const teamName=u.linkedTeamKey?(teams[u.linkedTeamKey]?.name||u.linkedTeamKey):'';
      const searchText=[u.email,u.displayName,u.linkedPlayer,teamName,...(u.roles||[])].filter(Boolean).join(' ');
      const initials=(u.linkedPlayer||u.displayName||u.email||'?').split(' ').map(x=>x[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
      const avatar=u.photoUrl?`<span class="admin-user-avatar"><img src="${escapeHtml(u.photoUrl)}" alt="Foto de ${escapeHtml(u.linkedPlayer||u.displayName||'usuario')}"></span>`:`<span class="admin-user-avatar">${escapeHtml(initials)}</span>`;
      return `<article class="admin-user-card" data-user-id="${escapeHtml(u.id)}" data-user-search="${escapeHtml(searchText)}" data-user-team="${escapeHtml(u.linkedTeamKey||'none')}" data-user-roles="${escapeHtml((u.roles||[]).join(','))}">
        <div class="admin-user-head"><div class="admin-user-identity">${avatar}<div><strong>${escapeHtml(u.linkedPlayer||u.displayName||u.email)}</strong><span class="muted">${escapeHtml(u.email)}</span><span class="muted">${u.linkedPlayer?`${escapeHtml(teamName)}`:'Cuenta administrativa sin jugador'}</span></div></div><div class="role-row">${roleBadges(u)}</div></div>
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

  const teamFilter=$('#adminUserTeamFilter'),roleFilter=$('#adminUserRoleFilter'),searchInput=$('#adminUserSearch'),countEl=$('#adminUserCount'),emptyFilter=$('#adminUsersEmptyFilter');
  if(teamFilter){
    const current=teamFilter.value;
    teamFilter.innerHTML='<option value="">Todos los equipos</option>'+Object.entries(teams).map(([key,t])=>`<option value="${escapeHtml(key)}">${escapeHtml(t.name)}</option>`).join('')+'<option value="none">Sin jugador vinculado</option>';
    teamFilter.value=current;
  }
  const normalizeAdminSearch=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  let showAllAdminUsers=false;
  const showAllBtn=$('#showAllAdminUsers');
  const applyAdminUserFilters=()=>{
    const q=normalizeAdminSearch(searchInput?.value),team=teamFilter?.value||'',role=roleFilter?.value||'';
    const hasFilters=!!(q||team||role);
    let visible=0;
    $$('#adminUsers .admin-user-card').forEach(card=>{
      const haystack=normalizeAdminSearch(card.dataset.userSearch),teamOk=!team||card.dataset.userTeam===team;
      const roleList=(card.dataset.userRoles||'').split(',').filter(Boolean);
      const roleOk=!role||(role==='none'?roleList.length===0:roleList.includes(role));
      const matches=(!q||haystack.includes(q))&&teamOk&&roleOk;
      const show=(hasFilters||showAllAdminUsers)&&matches;
      card.hidden=!show;if(show)visible++;
    });
    if(countEl)countEl.textContent=hasFilters||showAllAdminUsers?`${visible} de ${list.length} usuario${list.length===1?'':'s'}`:`${list.length} usuarios registrados · busca o filtra para mostrarlos`;
    if(emptyFilter){emptyFilter.textContent=hasFilters?'No hay usuarios que coincidan con la búsqueda.':'Usa el buscador o pulsa “Mostrar todos”.';emptyFilter.hidden=(visible!==0)||(showAllAdminUsers&&!hasFilters)}
    if(showAllBtn)showAllBtn.textContent=showAllAdminUsers?'Ocultar todos':'Mostrar todos';
  };
  searchInput?.addEventListener('input',applyAdminUserFilters);
  teamFilter?.addEventListener('change',applyAdminUserFilters);
  roleFilter?.addEventListener('change',applyAdminUserFilters);
  showAllBtn?.addEventListener('click',()=>{showAllAdminUsers=!showAllAdminUsers;applyAdminUserFilters()});
  $('#clearAdminUserFilters')?.addEventListener('click',()=>{if(searchInput)searchInput.value='';if(teamFilter)teamFilter.value='';if(roleFilter)roleFilter.value='';showAllAdminUsers=false;applyAdminUserFilters();searchInput?.focus()});
  applyAdminUserFilters();

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
  const assignedByFixture=new Map((dbAssignments||[]).map(a=>[a.fixture_id,a.user_id]));
  $('#refereeAssignments').innerHTML=fixtures.map(f=>`<div class="referee-row"><div><strong>Jornada ${f.round}</strong><span>${teamProfileInline(f.home)} vs ${teamProfileInline(f.away)}</span></div><select data-ref-match="${f.id}"><option value="">Sin árbitro asignado</option>${refs.map(u=>`<option value="${escapeHtml(u.id)}" ${assignedByFixture.get(f.id)===u.id?'selected':''}>${escapeHtml(u.linkedPlayer||u.displayName||u.email)}</option>`).join('')}</select></div>`).join('');
  $$('#refereeAssignments [data-ref-match]').forEach(sel=>sel.addEventListener('change',async()=>{
    const fixtureId=sel.dataset.refMatch,userId=sel.value;sel.disabled=true;
    try{
      if(userId){const {error}=await supabaseClient.from('referee_assignments').upsert({fixture_id:fixtureId,user_id:userId},{onConflict:'fixture_id'});if(error)throw error}else{const {error}=await supabaseClient.from('referee_assignments').delete().eq('fixture_id',fixtureId);if(error)throw error}
      const local=refereeAssignments(),chosen=refs.find(x=>x.id===userId);if(chosen)local[fixtureId]=chosen.email;else delete local[fixtureId];store.set('league:refereeAssignments',local);
      await hydrateRefereePermissions();refreshPermissionViews();
    }catch(err){console.error(err);alert(err?.message||'No se pudo guardar el árbitro asignado.');await renderAdmin()}finally{sel.disabled=false}
  }));
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
history.replaceState({leagueInternal:true,leagueView:'inicio',leagueDepth:0},'',location.href);
renderHomeTeams();renderStandings();renderRounds();renderTeams();renderRankings();populateMatchSelects();renderLive();renderStreaming();renderAvailability();renderIdeal();renderHomeDashboard();renderRegisterPlayerOptions();refreshAuthUI();

// Ajustes de texto del antiguo prototipo local.
const loginPassLabel=document.querySelector('label[for="loginPassword"]');
const registerPassLabel=document.querySelector('label[for="registerPassword"]');
if(loginPassLabel)loginPassLabel.textContent='Contraseña';
if(registerPassLabel)registerPassLabel.textContent='Contraseña';
const accessIntro=document.querySelector('#view-acceso .page-head p');
if(accessIntro)accessIntro.textContent='Inicia sesión o crea tu cuenta. Los jugadores quedan vinculados a su ficha al registrarse.';
$$('[data-toggle-password]').forEach(btn=>btn.addEventListener('click',()=>{
  const input=$(`#${btn.dataset.togglePassword}`);if(!input)return;const show=input.type==='password';input.type=show?'text':'password';btn.textContent=show?'🙈 Ocultar':'👁 Mostrar';btn.setAttribute('aria-pressed',String(show));
}));

supabaseClient.auth.onAuthStateChange((_event,session)=>{
  const next=session?.user||null;
  if(authReady && next?.id && authStateUser?.id===next.id)return;
  loadCurrentUserFromSupabase(next).catch(err=>console.warn('No se pudo refrescar la sesión',err));
});
loadCurrentUserFromSupabase().catch(err=>console.warn('No se pudo cargar la sesión inicial',err));
loadRemotePlayerIndex().then(()=>{renderHomeDashboard();renderRankings();if(activePlayerName&&document.body.dataset.view==='jugador')renderPlayerProfile(activePlayerName)}).catch(err=>console.warn('No se pudieron cargar todavía las fotos de jugadores',err));
hydrateIdealFiveFromSupabase().catch(()=>{});
renderNews();

// v6 · configuración local de recordatorios (el envío real se conectará al backend al publicar)
function reminderSettings(){return store.get('league:reminders',{availabilityEnabled:true,availabilityCadence:'24',matchEnabled:true,match24:true,match2:true})}
function renderReminderSettings(){
  const s=reminderSettings();
  const m=$('#matchReminderEnabled'); if(!m)return;
  m.checked=!!s.matchEnabled;
  $('#matchReminder24').checked=!!s.match24;
  $('#matchReminder2').checked=!!s.match2;
}
$('#saveReminderSettings')?.addEventListener('click',()=>{
  if(!isAdmin()){alert('Solo el administrador puede configurar los recordatorios.');return}
  const settings={
    matchEnabled:$('#matchReminderEnabled')?.checked||false,
    match24:$('#matchReminder24')?.checked||false,
    match2:$('#matchReminder2')?.checked||false
  };
  store.set('league:reminders',settings);
  $('#reminderSaved').textContent='Configuración de recordatorios guardada para la versión online.';
});

const _renderAdminV6=renderAdmin;
renderAdmin=function(){_renderAdminV6(); if(isAdmin())renderReminderSettings()};

document.addEventListener('click',e=>{const b=e.target.closest?.('[data-admin-jump]');if(!b)return;document.getElementById(b.dataset.adminJump)?.scrollIntoView({behavior:'smooth',block:'start'})});
