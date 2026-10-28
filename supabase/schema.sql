-- =====================================================================
-- FOYER+ — Base de données Supabase
-- À coller en entier dans Supabase > SQL Editor > New query > Run
-- (peut être relancé sans risque)
-- =====================================================================

-- ---------- Profils ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- ---------- Foyers (espace commun) ----------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'membre',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- ---------- Toutes les données de l'application ----------
-- module = depense, revenu, budget, categorie, portefeuille, objectif, epargne,
--          tontine, abonnement, om_vente, locataire, loyer, patrimoine, dette, ...
-- household_id NULL = donnée privée ; sinon = donnée du foyer (partagée)
create table if not exists public.records (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  household_id uuid references public.households on delete cascade,
  module text not null,
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);
create index if not exists records_sync_idx on public.records (server_updated_at);
create index if not exists records_owner_idx on public.records (owner_id);
create index if not exists records_household_idx on public.records (household_id);

-- ---------- Fonctions utilitaires ----------
create or replace function public.is_member(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members
                 where household_id = hid and user_id = auth.uid());
$$;

create or replace function public.shares_household(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members a
                 join public.household_members b on a.household_id = b.household_id
                 where a.user_id = auth.uid() and b.user_id = other);
$$;

-- horodatage serveur + propriétaire non modifiable
create or replace function public.records_before_write()
returns trigger language plpgsql as $$
begin
  new.server_updated_at := clock_timestamp();
  if tg_op = 'INSERT' then
    new.owner_id := coalesce(auth.uid(), new.owner_id);
  else
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists records_before_write on public.records;
create trigger records_before_write before insert or update on public.records
  for each row execute function public.records_before_write();

-- profil créé automatiquement à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Créer / rejoindre / quitter un foyer ----------
create or replace function public.create_household(p_name text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households; code text;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  loop
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.households where invite_code = code);
  end loop;
  insert into public.households (name, invite_code, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'Mon foyer'), code, auth.uid()) returning * into h;
  insert into public.household_members (household_id, user_id, role) values (h.id, auth.uid(), 'admin');
  return h;
end $$;

create or replace function public.join_household(p_code text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households; n int;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into h from public.households where invite_code = upper(trim(p_code));
  if h.id is null then raise exception 'Code invalide'; end if;
  select count(*) into n from public.household_members where household_id = h.id;
  if n >= 6 then raise exception 'Foyer complet'; end if;
  insert into public.household_members (household_id, user_id) values (h.id, auth.uid())
  on conflict do nothing;
  return h;
end $$;

create or replace function public.leave_household(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.household_members where household_id = p_id and user_id = auth.uid();
  delete from public.households h where h.id = p_id
    and not exists (select 1 from public.household_members m where m.household_id = p_id);
end $$;

create or replace function public.renew_invite_code(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not public.is_member(p_id) then raise exception 'Accès refusé'; end if;
  code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  update public.households set invite_code = code where id = p_id;
  return code;
end $$;

revoke all on function public.create_household(text) from anon;
revoke all on function public.join_household(text) from anon;
revoke all on function public.leave_household(uuid) from anon;
revoke all on function public.renew_invite_code(uuid) from anon;

-- ---------- Sécurité : Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.records enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_household(id));
drop policy if exists profiles_upsert on public.profiles;
create policy profiles_upsert on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists households_select on public.households;
create policy households_select on public.households for select to authenticated
  using (public.is_member(id));
drop policy if exists households_update on public.households;
create policy households_update on public.households for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists members_select on public.household_members;
create policy members_select on public.household_members for select to authenticated
  using (public.is_member(household_id));

drop policy if exists records_select on public.records;
create policy records_select on public.records for select to authenticated
  using (owner_id = auth.uid() or (household_id is not null and public.is_member(household_id)));

drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated
  with check (owner_id = auth.uid() and (household_id is null or public.is_member(household_id)));

drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated
  using (owner_id = auth.uid() or (household_id is not null and public.is_member(household_id)))
  with check ((household_id is null and owner_id = auth.uid())
           or (household_id is not null and public.is_member(household_id)));

drop policy if exists records_delete on public.records;
create policy records_delete on public.records for delete to authenticated
  using (owner_id = auth.uid());

-- ---------- Temps réel (mise à jour instantanée entre les 2 téléphones) ----------
do $$ begin
  alter publication supabase_realtime add table public.records;
exception when others then null; end $$;

-- ---------- Photos des reçus (stockage privé) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recus', 'recus', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- dossier = id de l'utilisateur (privé) ou id du foyer (partagé)
drop policy if exists recus_select on storage.objects;
create policy recus_select on storage.objects for select to authenticated
  using (bucket_id = 'recus' and ((storage.foldername(name))[1] = auth.uid()::text
         or public.is_member(((storage.foldername(name))[1])::uuid)));
drop policy if exists recus_insert on storage.objects;
create policy recus_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'recus' and ((storage.foldername(name))[1] = auth.uid()::text
         or public.is_member(((storage.foldername(name))[1])::uuid)));
drop policy if exists recus_delete on storage.objects;
create policy recus_delete on storage.objects for delete to authenticated
  using (bucket_id = 'recus' and ((storage.foldername(name))[1] = auth.uid()::text
         or public.is_member(((storage.foldername(name))[1])::uuid)));
