-- 베이직 구독 주문 ID 저장 (기기 변경 시 구독 복원용)
-- 실행 방법: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run

alter table public.user_coins
  add column if not exists subscription_order_id text;
