import { appLogin } from "@apps-in-toss/web-framework";
import { useState } from "react";

const USER_KEY = "toss_user";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function loadUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function useTossLogin() {
  const [user, setUser] = useState(loadUser);
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);
    try {
      const { authorizationCode, referrer } = await appLogin();

      // Day 4: Edge Function이 생기면 여기서 토큰 교환
      // const res = await fetch(`${SUPABASE_URL}/functions/v1/token-exchange`, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ authorizationCode, referrer }),
      // });
      // const { userId } = await res.json();

      // 임시: authCode를 "로그인 완료" 증거로 저장
      const userData = {
        authCode: authorizationCode,
        referrer,
        loginAt: new Date().toISOString(),
      };
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
      setUser(userData);
      return userData;
    } catch (e) {
      console.error("Toss login failed:", e);
      alert("로그인에 실패했어요. 토스 앱 또는 샌드박스에서 실행해주세요.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }

  return { user, login, logout, loading, isLoggedIn: user != null };
}
