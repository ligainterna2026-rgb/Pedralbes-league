-- Liga Interna 2026 · esquema base para Supabase
-- Ejecutar en el SQL Editor de un proyecto de Supabase NUEVO.
-- El frontend local NO usa todavía estas tablas; este archivo deja preparada la migración online.

create extension if not exists pgcrypto;

create table if not exists public.teams (
  id text primary key,
  name text not null unique,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id text primary key,
  name text not null,
  team_id text not null references public.teams(id) on delete cascade,
  captain boolean not null default false,
  photo_url text,
  user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','player','referee')),
  primary key (user_id, role)
);

-- Registro automático de jugadores.
-- El frontend enviará player_id dentro de raw_user_meta_data al crear la cuenta.
-- Si ese jugador ya está vinculado, el registro falla y no se pisa ninguna cuenta existente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_player text;
  affected integer;
begin
  selected_player := nullif(new.raw_user_meta_data ->> 'player_id', '');

  insert into public.profiles (id,email,display_name)
  values (
    new.id,
    coalesce(new.email,''),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name',''), split_part(coalesce(new.email,''),'@',1))
  )
  on conflict (id) do update set email=excluded.email, display_name=excluded.display_name;

  if selected_player is not null then
    update public.players
      set user_id = new.id
      where id = selected_player and user_id is null;
    get diagnostics affected = row_count;

    if affected <> 1 then
      raise exception 'El jugador seleccionado ya está vinculado o no existe';
    end if;

    insert into public.user_roles (user_id,role)
    values (new.id,'player')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();


-- Vista sencilla para rellenar el desplegable de registro sin exponer correos.
create or replace view public.signup_players
with (security_invoker = true)
as
select id, name, team_id, captain, (user_id is null) as available
from public.players;

grant select on public.signup_players to anon, authenticated;

create table if not exists public.fixtures (
  id text primary key,
  round integer not null check (round between 1 and 10),
  home_team_id text not null references public.teams(id),
  away_team_id text not null references public.teams(id),
  rest_team_id text references public.teams(id),
  scheduled_at timestamptz,
  status text not null default 'pending' check (status in ('pending','scheduled','live','finished')),
  home_score integer not null default 0,
  away_score integer not null default 0,
  mvp_player_id text references public.players(id),
  created_at timestamptz not null default now()
);

create table if not exists public.referee_assignments (
  fixture_id text primary key references public.fixtures(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade
);

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null references public.fixtures(id) on delete cascade,
  event_type text not null default 'goal' check (event_type in ('goal')),
  team_id text not null references public.teams(id),
  scorer_player_id text not null references public.players(id),
  assist_player_id text references public.players(id),
  goal_value integer not null default 1 check (goal_value in (1,2)),
  half integer not null check (half in (1,2)),
  minute integer not null check (minute between 1 and 20),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.availability_votes (
  fixture_id text not null references public.fixtures(id) on delete cascade,
  player_id text not null references public.players(id) on delete cascade,
  vote text not null check (vote in ('yes','maybe','no')),
  updated_at timestamptz not null default now(),
  primary key (fixture_id, player_id)
);

create table if not exists public.ideal_five (
  round integer not null check (round between 1 and 10),
  slot integer not null check (slot between 1 and 5),
  player_id text not null references public.players(id),
  primary key (round, slot),
  unique (round, player_id)
);

create table if not exists public.stream_links (
  fixture_id text primary key references public.fixtures(id) on delete cascade,
  youtube_live_url text,
  youtube_recording_url text,
  updated_at timestamptz not null default now()
);

-- Funciones de permisos
create or replace function public.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = required_role
  );
$$;

create or replace function public.can_referee(fixture text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('admin') or exists (
    select 1 from public.referee_assignments ra
    where ra.fixture_id = fixture
      and ra.user_id = auth.uid()
      and public.has_role('referee')
  );
$$;

-- RLS
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.fixtures enable row level security;
alter table public.referee_assignments enable row level security;
alter table public.match_events enable row level security;
alter table public.availability_votes enable row level security;
alter table public.ideal_five enable row level security;
alter table public.stream_links enable row level security;

-- Lectura pública de la competición (sin exponer correos ni roles internos)
create policy "public read teams" on public.teams for select using (true);
create policy "public read players" on public.players for select using (true);
create policy "public read fixtures" on public.fixtures for select using (true);
create policy "public read match events" on public.match_events for select using (true);
create policy "public read availability" on public.availability_votes for select using (true);
create policy "public read ideal five" on public.ideal_five for select using (true);
create policy "public read stream links" on public.stream_links for select using (true);

-- Perfiles y roles: cada usuario ve lo suyo; el admin ve todo.
create policy "read own profile or admin" on public.profiles for select
using (id = auth.uid() or public.has_role('admin'));
create policy "update own profile or admin" on public.profiles for update
using (id = auth.uid() or public.has_role('admin'))
with check (id = auth.uid() or public.has_role('admin'));
create policy "read own roles or admin" on public.user_roles for select
using (user_id = auth.uid() or public.has_role('admin'));
create policy "admin manages roles" on public.user_roles for all
using (public.has_role('admin')) with check (public.has_role('admin'));

-- Admin configura equipos, jugadores, calendario, 5 ideal, streaming y árbitros.
create policy "admin manages teams" on public.teams for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "admin manages players" on public.players for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "player updates own player profile" on public.players for update
using (user_id = auth.uid() or public.has_role('admin'))
with check (user_id = auth.uid() or public.has_role('admin'));
create policy "admin manages fixtures" on public.fixtures for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "admin manages referee assignments" on public.referee_assignments for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "admin manages ideal five" on public.ideal_five for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "admin manages stream links" on public.stream_links for all using (public.has_role('admin')) with check (public.has_role('admin'));

-- Árbitro asignado o admin puede registrar los eventos del partido.
create policy "referee inserts events" on public.match_events for insert
with check (public.can_referee(fixture_id));
create policy "referee updates events" on public.match_events for update
using (public.can_referee(fixture_id)) with check (public.can_referee(fixture_id));
create policy "referee deletes events" on public.match_events for delete
using (public.can_referee(fixture_id));

-- Jugador solo puede votar por su propia ficha; admin puede corregir cualquier voto.
create policy "player inserts own availability" on public.availability_votes for insert
with check (
  public.has_role('admin') or exists (
    select 1 from public.players p
    where p.id = player_id and p.user_id = auth.uid() and public.has_role('player')
  )
);
create policy "player updates own availability" on public.availability_votes for update
using (
  public.has_role('admin') or exists (
    select 1 from public.players p
    where p.id = player_id and p.user_id = auth.uid() and public.has_role('player')
  )
)
with check (
  public.has_role('admin') or exists (
    select 1 from public.players p
    where p.id = player_id and p.user_id = auth.uid() and public.has_role('player')
  )
);

-- Datos iniciales
insert into public.teams (id,name) values
('aston','Aston Birra F.C.'),
('borrachia','Borrachia Dortmund'),
('celta','Celta de Vino'),
('fener','Fenerbahçupito'),
('ordago','Ordago FC')
on conflict (id) do update set name=excluded.name;

insert into public.players (id,name,team_id,captain) values
('aston-nico','Nico','aston',true),('aston-joaquin','Joaquin','aston',false),('aston-jose','José','aston',false),('aston-ambrosio','Ambrosio','aston',false),('aston-alvaro','Álvaro','aston',false),('aston-diego','Diego','aston',false),('aston-dibu','Dibu','aston',false),
('borrachia-dani-pique','Dani Piqué','borrachia',true),('borrachia-cruz','Cruz','borrachia',false),('borrachia-carlos-martinez','Carlos Martínez','borrachia',false),('borrachia-jaume-serra','Jaume Serra','borrachia',false),('borrachia-joan-nafria','Joan Nafria','borrachia',false),('borrachia-tomas-colomina','Tomas Colomina','borrachia',false),('borrachia-hugo','Hugo','borrachia',false),
('celta-guillem','Guillem','celta',true),('celta-paupu','Paupu','celta',false),('celta-joan-bosch','Joan Bosch','celta',false),('celta-pol-cons','Pol Cons','celta',false),('celta-marc-escofet','Marc Escofet','celta',false),('celta-juan','Juan','celta',false),('celta-samuel','Samuel','celta',false),
('fener-arnau-portavella','Arnau Portavella','fener',true),('fener-victor','Victor','fener',false),('fener-rafa','Rafa','fener',false),('fener-mito','Mito','fener',false),('fener-machuca','Machuca','fener',false),('fener-linguini','Linguini','fener',false),('fener-xavier-bautista','Xavier Bautista','fener',false),('fener-joan-tortosa','Joan Tortosa','fener',false),
('ordago-migue','Migue','ordago',true),('ordago-antonio','Antonio','ordago',false),('ordago-pou','Pou','ordago',false),('ordago-tomas','Tomas','ordago',false),('ordago-jordi','Jordi','ordago',false),('ordago-etienne','Etienne','ordago',false),('ordago-albero','Albero','ordago',false),('ordago-carlos-monge','Carlos Monge','ordago',false)
on conflict (id) do update set name=excluded.name, team_id=excluded.team_id, captain=excluded.captain;

insert into public.fixtures (id,round,home_team_id,away_team_id,rest_team_id) values
('m1',1,'celta','borrachia','aston'),('m2',1,'ordago','fener','aston'),
('m3',2,'aston','fener','borrachia'),('m4',2,'celta','ordago','borrachia'),
('m5',3,'aston','celta','fener'),('m6',3,'borrachia','ordago','fener'),
('m7',4,'fener','celta','ordago'),('m8',4,'borrachia','aston','ordago'),
('m9',5,'ordago','aston','celta'),('m10',5,'fener','borrachia','celta'),
('m11',6,'borrachia','celta','aston'),('m12',6,'fener','ordago','aston'),
('m13',7,'fener','aston','borrachia'),('m14',7,'ordago','celta','borrachia'),
('m15',8,'celta','aston','fener'),('m16',8,'ordago','borrachia','fener'),
('m17',9,'celta','fener','ordago'),('m18',9,'aston','borrachia','ordago'),
('m19',10,'aston','ordago','celta'),('m20',10,'borrachia','fener','celta')
on conflict (id) do nothing;

-- El registro normal enviará options.data.player_id y asignará automáticamente el rol Jugador.
-- Los roles Árbitro y Admin nunca se aceptan desde el formulario de registro; solo los asigna un Admin.

-- IMPORTANTE: después de crear en Supabase Auth al usuario ligainterna2026@gmail.com,
-- sustituye ADMIN_USER_UUID por su UUID y ejecuta estas dos líneas:
-- insert into public.profiles (id,email,display_name) values ('ADMIN_USER_UUID','ligainterna2026@gmail.com','Liga Interna') on conflict (id) do nothing;
-- insert into public.user_roles (user_id,role) values ('ADMIN_USER_UUID','admin') on conflict do nothing;
