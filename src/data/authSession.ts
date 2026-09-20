const AUTH_MARKER_KEY = "householdAuthenticated";

export const hasLocalAuthMarker = () => localStorage.getItem(AUTH_MARKER_KEY) === "true";
export const markLocalAuth = () => localStorage.setItem(AUTH_MARKER_KEY, "true");
export const clearLocalAuth = () => localStorage.removeItem(AUTH_MARKER_KEY);
export const handleUnauthorized = () => {
  clearLocalAuth();
  window.location.reload();
};
