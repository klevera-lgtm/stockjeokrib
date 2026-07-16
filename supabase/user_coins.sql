-- 구매 코인 잔액 테이블 (기기 변경 시 복원용)
-- 실행 방법: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run

create table if not exists public.user_coins (
  anonymous_key text primary key,
  paid_balance integer not null default 0 check (paid_balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.user_coins enable row level security;

-- 익명 키를 아는 클라이언트만 자기 행에 접근 (portfolio와 동일한 신뢰 모델)
create policy "anon select user_coins" on public.user_coins
  for select to anon using (true);

create policy "anon insert user_coins" on public.user_coins
  for insert to anon with check (true);

create policy "anon update user_coins" on public.user_coins
  for update to anon using (true);
