-- HILLKINGS v4 — run once in a dedicated Supabase project's SQL Editor.
-- Idempotent: existing product/contact values are NOT overwritten.
-- No passwords or API keys are embedded. All application tables are closed to browsers.
begin;
create table if not exists public.hk_settings(id integer primary key check(id=1),data jsonb not null,version integer not null default 1);
create table if not exists public.hk_products(id text primary key,slug text not null unique,data jsonb not null,version integer not null default 1,updated_at timestamptz not null default now());
create table if not exists public.hk_users(id integer primary key,username text unique not null,password_hash text not null,must_change boolean not null default true);
create table if not exists public.hk_sessions(hash text primary key,user_id integer not null references public.hk_users(id) on delete cascade,csrf text not null,expires_at bigint not null);
create table if not exists public.hk_inquiries(id uuid primary key,data jsonb not null,status text not null default 'new' check(status in ('new','read','closed')),email_status text not null default 'queued',email_id text,email_to text,email_attempt_at timestamptz,last_error text,created_at timestamptz not null default now());
create table if not exists public.hk_audit(id bigserial primary key,action text not null,detail text not null,created_at timestamptz not null default now());
create table if not exists public.hk_limits(key text primary key,count integer not null,resets_at bigint not null);
create table if not exists public.hk_meta(key text primary key,value text not null);
create table if not exists public.hk_uploads(name text primary key,ext text not null,mime text not null,size bigint not null check(size>0 and size<=62914560),status text not null check(status in ('pending','approved','rejected')),created_by integer not null references public.hk_users(id),created_at timestamptz not null default now());
create index if not exists hk_sessions_expiry on public.hk_sessions(expires_at);
create index if not exists hk_inquiries_created on public.hk_inquiries(created_at desc);
create index if not exists hk_products_updated on public.hk_products(updated_at desc);
insert into public.hk_meta(key,value) values('contact-secret',replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','')) on conflict(key) do nothing;

create or replace function public.hk_try_limit(p_key text,p_max integer,p_window_ms bigint)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare t bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint; n integer;
begin
 if p_max<1 or p_max>1000 or p_window_ms<1 or p_window_ms>86400000 then raise exception 'Invalid limit'; end if;
 insert into public.hk_limits(key,count,resets_at) values(p_key,1,t+p_window_ms)
 on conflict(key) do update set count=case when hk_limits.resets_at<=t then 1 else least(hk_limits.count+1,p_max+1) end,
 resets_at=case when hk_limits.resets_at<=t then t+p_window_ms else hk_limits.resets_at end returning count into n;
 return n<=p_max;
end; $$;

create or replace function public.hk_change_account(p_id integer,p_expected_hash text,p_username text,p_password_hash text,p_session_hash text,p_csrf text,p_expires_at bigint)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.hk_users set username=p_username,password_hash=p_password_hash,must_change=false where id=p_id and password_hash=p_expected_hash;
 if not found then return false; end if;
 delete from public.hk_sessions where user_id=p_id;
 insert into public.hk_sessions(hash,user_id,csrf,expires_at) values(p_session_hash,p_id,p_csrf,p_expires_at);
 return true;
end; $$;

create or replace function public.hk_cleanup()
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare t bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint; days integer;
begin
 delete from public.hk_sessions where expires_at<t;
 delete from public.hk_limits where resets_at<t;
 select greatest(7,least(730,coalesce((data->>'inquiryRetentionDays')::integer,180))) into days from public.hk_settings where id=1;
 delete from public.hk_inquiries where created_at<now()-make_interval(days=>coalesce(days,180));
 delete from public.hk_audit where id not in(select id from public.hk_audit order by id desc limit 10000);
end; $$;

-- Browser roles cannot read even one row, nor invoke administrative RPCs.
alter table public.hk_settings enable row level security;
alter table public.hk_products enable row level security;
alter table public.hk_users enable row level security;
alter table public.hk_sessions enable row level security;
alter table public.hk_inquiries enable row level security;
alter table public.hk_audit enable row level security;
alter table public.hk_limits enable row level security;
alter table public.hk_meta enable row level security;
alter table public.hk_uploads enable row level security;
revoke all on public.hk_settings,public.hk_products,public.hk_users,public.hk_sessions,public.hk_inquiries,public.hk_audit,public.hk_limits,public.hk_meta,public.hk_uploads from public,anon,authenticated;
grant select,insert,update,delete on public.hk_settings,public.hk_products,public.hk_users,public.hk_sessions,public.hk_inquiries,public.hk_audit,public.hk_limits,public.hk_meta,public.hk_uploads to service_role;
revoke all on sequence public.hk_audit_id_seq from public,anon,authenticated;
grant usage,select on sequence public.hk_audit_id_seq to service_role;
revoke all on function public.hk_try_limit(text,integer,bigint),public.hk_change_account(integer,text,text,text,text,text,bigint),public.hk_cleanup() from public,anon,authenticated;
grant execute on function public.hk_try_limit(text,integer,bigint),public.hk_change_account(integer,text,text,text,text,text,bigint),public.hk_cleanup() to service_role;

-- Private media; upload and download URLs are signed by the server.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('hillkings-media','hillkings-media',false,62914560,array['image/jpeg','image/png','image/webp','application/pdf','video/mp4','model/gltf-binary','application/octet-stream'])
on conflict(id) do nothing;

-- Initial collection and contacts (prices are the owner-supplied offer prices).
insert into public.hk_settings(id,data) values(1,'{"brand":"Hillkings","tagline":"Fine Gemstones","whatsapp":"5511910815777","contactEmail":"anderson@mediscope.com.br","headline":"O extraordinário não se repete.","headlineEn":"The extraordinary is never ordinary.","intro":"Gemas singulares, joias para atravessar gerações. Uma curadoria pessoal — da coleção à busca sob encomenda, com atendimento para destinos em todo o mundo.","introEn":"Singular gemstones, jewels for generations. Personal selection — from the collection to sourcing requests, with concierge service for destinations worldwide.","conciergeText":"Concierge de joias e gemas sob encomenda. Atendimento individual, condições para atacado e entregas internacionais.","legalName":"","taxId":"","address":"","instagram":"","showPrices":true,"showSold":true,"inquiryRetentionDays":180,"featuredProductId":"HK-J001","siteTitle":"Hillkings — Fine Gemstones","description":"Hillkings Fine Gemstones: gemas e joias de luxo, concierge sob encomenda, condições para atacado e entregas internacionais. Conheça a coleção e fale com o concierge."}'::jsonb) on conflict(id) do nothing;
insert into public.hk_products(id,slug,data) values('HK-J001','anel-rubi-9-01','{"id":"HK-J001","slug":"anel-rubi-9-01","name":"The Ruby Ring","namePt":"Anel de rubi","category":"jewellery","status":"available","published":true,"featured":true,"sortOrder":1,"priceCents":50000000,"currency":"USD","priceOnRequest":false,"stone":"Rubi","carats":"9,01","secondary":"Diamantes · 1,40 ct · VVS","metal":"Ouro branco","cut":"Navete (marquise)","origin":"Não informada","dimensions":"Não informadas","treatment":"A confirmar no relatório gemológico","description":"Uma silhueta alongada, uma cor intensa e o encontro preciso entre o rubi central e os diamantes laterais. Uma peça para ser descoberta de perto.","descriptionEn":"An elongated silhouette, a deep colour and the meeting of a central ruby with tapered side diamonds. A piece to discover up close.","reportLab":"GIA","reportNumber":"","reportDate":"","reportUrl":"","reportState":"owner-reported","reportNotes":"Existência de relatório GIA informada pelo proprietário. Cópia e escopo ainda não anexados; os 1,40 ct e a classificação VVS dos diamantes foram informados pelo proprietário.","media":[{"url":"/media/ruby-detail.webp","type":"image","alt":"Fotografia real do anel de rubi com diamantes laterais","kind":"original"},{"url":"/media/ruby-on-hand.webp","type":"image","alt":"Anel de rubi na mão, para referência de escala","kind":"original"},{"url":"/media/ruby.mp4","type":"video","alt":"Vídeo real do anel de rubi","poster":"/media/ruby-video-frame.webp","kind":"original"}],"heroImage":"/media/ruby-cutout.webp","modelUrl":"/models/ruby-ring.glb","modelKind":"approximation","modelNotes":"Reconstrução visual aproximada do anel a partir das fotografias, com estudo óptico de refração e reflexos. Não é um CAD medido: lapidação, inclusões, proporções e resposta da cor não foram reproduzidas gemologicamente. Consulte as fotos, o vídeo e o relatório da peça real.","internalNotes":"Quilatagem 9,01 ct; diamantes 1,40 ct VVS; preço informado pelo proprietário. Anexar laudo GIA do rubi, confirmar metal/teor, tratamentos, origem e classificação dos diamantes. Não associar o GIA 5141608096 a este anel."}'::jsonb) on conflict(id) do nothing;
insert into public.hk_products(id,slug,data) values('HK-G001','paraiba-2-09','{"id":"HK-G001","slug":"paraiba-2-09","name":"The Brazilian Paraíba","namePt":"Turmalina Paraíba","category":"gemstones","status":"available","published":true,"featured":true,"sortOrder":2,"priceCents":20000000,"currency":"USD","priceOnRequest":false,"stone":"Turmalina Paraíba","carats":"2,09","secondary":"","metal":"Gema solta","cut":"Pera · coroa brilhante · pavilhão brilhante modificado","origin":"Brasil — conforme relatório","dimensions":"10,47 × 6,59 × 4,45 mm","treatment":"Indícios de melhoria de pureza (clarity enhancement).","description":"Uma turmalina verde-azulada de origem brasileira, apresentada em formato pera. A cor, o movimento e as particularidades da gema podem ser observados no vídeo original.","descriptionEn":"A green-blue tourmaline of Brazilian origin, presented in a pear shape. Explore its colour, movement and individual characteristics in the original footage.","reportLab":"GIA","reportNumber":"5141608096","reportDate":"2012-04-26","reportUrl":"/media/gia-5141608096.jpg","reportState":"document-provided","reportNotes":"O relatório de 26/04/2012 identifica turmalina contendo cobre e manganês, que pode ser denominada “paraíba tourmaline” no comércio. Registra indícios de melhoria de pureza. O comentário informa que essa cor de turmalina é comumente aquecida e que a origem da cor desta pedra não pôde ser determinada. Cópia fornecida; confirmação online e correspondência com a gema física não verificadas aqui.","media":[{"url":"/media/paraiba-editorial.webp","type":"image","kind":"editorial","alt":"Apresentação editorial gerada por IA da Paraíba solta, isolada sobre fundo claro; consulte o vídeo da gema real."},{"url":"/media/paraiba-video-frame.webp","type":"image","alt":"Quadro extraído do vídeo real da turmalina Paraíba solta","kind":"original"},{"url":"/media/paraiba.mp4","type":"video","alt":"Vídeo real da turmalina Paraíba solta","poster":"/media/paraiba-video-frame.webp","kind":"original"}],"heroImage":"/media/paraiba-editorial.webp","modelUrl":"/models/paraiba-loose.glb","modelKind":"approximation","modelNotes":"Reconstrução 3D ilustrativa. O envelope parte das medidas 10,47 × 6,59 × 4,45 mm informadas no relatório; lapidação, inclusões, cor e comportamento óptico não são medições desta gema. Consulte o vídeo real e o relatório.","internalNotes":"Dados transcritos da imagem do relatório. Conferir no GIA Report Check e verificar se a pedra física corresponde ao relatório antes da venda. O relatório não é avaliação de preço. O tratamento foi lido diretamente na imagem, que diz INDICATIONS (não NO INDICATIONS)."}'::jsonb) on conflict(id) do nothing;
insert into public.hk_products(id,slug,data) values('HK-J002','colar-paraiba-2-61','{"id":"HK-J002","slug":"colar-paraiba-2-61","name":"The Paraíba Necklace","namePt":"Colar Paraíba","category":"jewellery","status":"available","published":true,"featured":true,"sortOrder":3,"priceCents":21000000,"currency":"USD","priceOnRequest":false,"stone":"Turmalina Paraíba","carats":"2,61","secondary":"Diamantes · peso a confirmar","metal":"Ouro branco","cut":"Pera","origin":"Não informada","dimensions":"Não informadas","treatment":"A confirmar no relatório gemológico","description":"A turmalina Paraíba ocupa o centro de uma composição delicada, contornada por diamantes. Uma joia de cor e presença, apresentada individualmente pelo atendimento Hillkings.","descriptionEn":"A Paraíba tourmaline at the centre of a delicate composition, framed by diamonds. A jewel of colour and presence, presented individually by Hillkings.","reportLab":"GIA","reportNumber":"","reportDate":"","reportUrl":"","reportState":"owner-reported","reportNotes":"Existência de relatório GIA informada pelo proprietário. Cópia, número e escopo do relatório ainda não anexados. Origem, tratamentos e detalhes dos diamantes devem ser confirmados.","media":[{"url":"/media/necklace-editorial.webp","type":"image","kind":"editorial","alt":"Apresentação editorial gerada por IA do colar Paraíba isolado sobre fundo claro; montagem e detalhes não substituem o vídeo da joia real."},{"url":"/media/necklace-video-frame.webp","type":"image","alt":"Quadro extraído do vídeo real do colar Paraíba","kind":"original"},{"url":"/media/necklace.mp4","type":"video","alt":"Vídeo real do colar Paraíba","poster":"/media/necklace-video-frame.webp","kind":"original"}],"heroImage":"/media/necklace-editorial.webp","modelUrl":"/models/paraiba-necklace.glb","modelKind":"approximation","modelNotes":"Reconstrução 3D ilustrativa do pingente com Paraíba e diamantes. Corrente, halo, garras, verso e proporções são aproximados, não CAD medido. Materiais e iluminação não reproduzem características gemológicas da peça real.","internalNotes":"Preço corrigido pelo proprietário para US$ 210.000. Gema central 2,61 ct informada. Anexar GIA e completar diamantes, metal/teor, origem e tratamentos."}'::jsonb) on conflict(id) do nothing;

notify pgrst, 'reload schema';
commit;
