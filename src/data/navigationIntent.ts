const NAVIGATION_INTENT_KEY = "navigationIntent.v1";
const NAVIGATION_INTENT_MAX_AGE_MS = 10_000;
const supportedRoutes = new Set(["/", "/add", "/graphs"]);

const isSupportedRoute = (route: string) => {
  const [pathname] = route.split(/[?#]/, 1);
  return Boolean(pathname && supportedRoutes.has(pathname));
};

export const markNavigationIntent = (route: string) => {
  if (!isSupportedRoute(route)) return;
  sessionStorage.setItem(NAVIGATION_INTENT_KEY, JSON.stringify({ route, createdAt: Date.now() }));
};

export const clearNavigationIntent = () => sessionStorage.removeItem(NAVIGATION_INTENT_KEY);

export const consumeNavigationIntent = () => {
  const raw = sessionStorage.getItem(NAVIGATION_INTENT_KEY);
  clearNavigationIntent();
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { route?: unknown; createdAt?: unknown };
    if (typeof value.route !== "string" || typeof value.createdAt !== "number") return null;
    if (Date.now() - value.createdAt > NAVIGATION_INTENT_MAX_AGE_MS || !isSupportedRoute(value.route)) return null;
    return value.route;
  } catch {
    return null;
  }
};
