-- 포트폴리오 삭제 버그 수정
--
-- 문제: 엣지 함수(/functions/v1/portfolio)의 CORS 응답에 Access-Control-Allow-Methods가
--       없어서 브라우저(토스 WebView)의 DELETE preflight가 차단됨. 삭제가 서버에 도달하지
--       못하고, 재로그인/재로드 시 삭제한 종목이 되살아남.
-- 또한 portfolio_items에 RLS가 켜져 있어 anon 역할은 REST로도 직접 삭제할 수 없음.
--
-- 해결: RLS를 우회하는 SECURITY DEFINER 삭제 함수를 만들고 anon에 실행 권한 부여.
--       클라이언트는 이 함수를 POST(/rest/v1/rpc/delete_portfolio_item)로 호출 →
--       POST는 CORS-safelisted라 preflight 문제 없음.
--
-- 실행 방법: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run

create or replace function public.delete_portfolio_item(p_anon text, p_ticker text)
returns bigint
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.portfolio_items
    where anonymous_key = p_anon and ticker = p_ticker
    returning 1
  )
  select count(*) from deleted;
$$;

grant execute on function public.delete_portfolio_item(text, text) to anon;
