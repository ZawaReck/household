export const INTERNAL_NAVIGATION_PARAM = "_appnav";

export const internalNavigationHref = (pathname: string) => {
  const url = new URL(pathname, window.location.origin);
  url.searchParams.set(INTERNAL_NAVIGATION_PARAM, "1");
  return `${url.pathname}${url.search}${url.hash}`;
};

export const markCurrentRouteAsInternal = () => {
  window.history.replaceState(null, "", internalNavigationHref(`${window.location.pathname}${window.location.search}${window.location.hash}`));
};

export const consumeInternalNavigation = () => {
  const url = new URL(window.location.href);
  if (url.searchParams.get(INTERNAL_NAVIGATION_PARAM) !== "1") return false;
  url.searchParams.delete(INTERNAL_NAVIGATION_PARAM);
  const search = url.searchParams.toString();
  window.history.replaceState(null, "", `${url.pathname}${search ? `?${search}` : ""}${url.hash}`);
  return true;
};
