const SYNC_RELOAD_ROUTE_KEY = "syncReloadRoute.v1";
const supportedRoutes = new Set(["/", "/add", "/graphs"]);

export const preserveRouteForSyncReload = () => {
  const route = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  sessionStorage.setItem(SYNC_RELOAD_ROUTE_KEY, route);
};

export const consumeSyncReloadRoute = () => {
  const route = sessionStorage.getItem(SYNC_RELOAD_ROUTE_KEY);
  sessionStorage.removeItem(SYNC_RELOAD_ROUTE_KEY);
  if (!route) return null;
  const pathname = route.split(/[?#]/, 1)[0];
  return supportedRoutes.has(pathname) ? route : null;
};
