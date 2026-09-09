import React from "react";

const TOKEN_KEY = "googleIdToken";

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

export const getGoogleIdToken = () => sessionStorage.getItem(TOKEN_KEY);
export const clearGoogleIdToken = () => sessionStorage.removeItem(TOKEN_KEY);

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const developmentBypass = import.meta.env.DEV && !clientId;
  const [token, setToken] = React.useState(() => getGoogleIdToken());
  const [error, setError] = React.useState("");
  const buttonRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (developmentBypass || token || !clientId) return;
    const setup = () => {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: async ({ credential }) => {
        const response = await fetch("/api/auth/me", { headers: { authorization: `Bearer ${credential}` } });
        if (!response.ok) { setError("このGoogleアカウントは許可されていません。"); return; }
        sessionStorage.setItem(TOKEN_KEY, credential); setToken(credential);
      } });
      window.google.accounts.id.renderButton(buttonRef.current, { theme: "outline", size: "large", text: "signin_with" });
    };
    if (window.google) { setup(); return; }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.onload = setup;
    document.head.appendChild(script);
    return () => script.remove();
  }, [clientId, developmentBypass, token]);

  if (developmentBypass || token) return <>{children}</>;
  if (!clientId) return <main className="auth-screen"><h1>Household</h1><p>Google OAuthのクライアントIDが未設定です。</p></main>;
  return <main className="auth-screen"><h1>Household</h1><p>本人用Googleアカウントでログインしてください。</p><div ref={buttonRef} />{error && <p>{error}</p>}</main>;
};
