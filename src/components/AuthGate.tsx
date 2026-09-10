import React from "react";

const AUTH_MARKER_KEY = "householdAuthenticated";

declare global {
  interface Window {
    google?: {
      accounts: { id: {
        initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
        renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        disableAutoSelect: () => void;
      } };
    };
  }
}

export const clearLocalAuth = () => localStorage.removeItem(AUTH_MARKER_KEY);
export const handleUnauthorized = () => {
  clearLocalAuth();
  window.location.reload();
};

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const developmentBypass = import.meta.env.DEV && !clientId;
  const [authState, setAuthState] = React.useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [error, setError] = React.useState("");
  const buttonRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (developmentBypass) { setAuthState("authenticated"); return; }
    let cancelled = false;
    void fetch("/api/auth/me").then((response) => {
      if (cancelled) return;
      if (response.ok) {
        localStorage.setItem(AUTH_MARKER_KEY, "true");
        setAuthState("authenticated");
      } else {
        clearLocalAuth();
        setAuthState("unauthenticated");
      }
    }).catch(() => {
      if (cancelled) return;
      setAuthState(localStorage.getItem(AUTH_MARKER_KEY) === "true" ? "authenticated" : "unauthenticated");
    });
    return () => { cancelled = true; };
  }, [developmentBypass]);

  React.useEffect(() => {
    if (developmentBypass || authState !== "unauthenticated" || !clientId) return;
    const setup = () => {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: async ({ credential }) => {
        const response = await fetch("/api/auth/session", { method: "POST", headers: { authorization: `Bearer ${credential}` } });
        if (!response.ok) { setError("このGoogleアカウントは許可されていません。"); return; }
        localStorage.setItem(AUTH_MARKER_KEY, "true");
        setAuthState("authenticated");
      } });
      window.google.accounts.id.renderButton(buttonRef.current, { theme: "outline", size: "large", text: "signin_with" });
    };
    if (window.google) { setup(); return; }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.onload = setup;
    document.head.appendChild(script);
    return () => script.remove();
  }, [authState, clientId, developmentBypass]);

  if (developmentBypass || authState === "authenticated") return <>{children}</>;
  if (authState === "checking") return <main className="auth-screen"><p>ログイン状態を確認しています…</p></main>;
  if (!clientId) return <main className="auth-screen"><h1>Household</h1><p>Google OAuthのクライアントIDが未設定です。</p></main>;
  return <main className="auth-screen"><h1>Household</h1><p>本人用Googleアカウントでログインしてください。</p><div ref={buttonRef} />{error && <p>{error}</p>}</main>;
};
