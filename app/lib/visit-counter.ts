/**
 * Visit counting with GoatCounter, which sets no cookies and stores no personal data.
 *
 * The inline script sets GoatCounter's path callback before count.js loads, so a screen is
 * recorded as its address plus only the parameters that pick a screen. A selected mandal, a
 * quality filter and the theme therefore do not split one screen into hundreds of dashboard
 * rows. Route changes in the App Router go through history.pushState, which count.js does not
 * see on its own, so the script also counts a change of that path while the page is visible.
 *
 * The path keeps the GitHub Pages project prefix (/ap-groundwater-fusion/...). That prefix is
 * what separates this project's rows from the other projects reporting into the same
 * GoatCounter site, so it is deliberately not stripped.
 *
 * count.js checks neither Global Privacy Control nor Do Not Track, so this script honours GPC
 * itself and never fetches count.js for a reader who sends it. Readers can also switch counting
 * off permanently with count.js's own #toggle-goatcounter.
 */
export const GOATCOUNTER_ENDPOINT = "https://prucodes.goatcounter.com/count";

/** One GoatCounter site holds several projects, so events carry the project's own prefix. */
export const EVENT_PREFIX = "ap-gw/";

/**
 * Query parameters that choose what a page shows, and so deserve their own row. Everything
 * else the app puts in the address — mandal, quality, surface, theme — is a selection or a
 * cosmetic, and is left out so one screen stays one row.
 */
export const SCREEN_PARAMS = ["view", "granularity"] as const;

export const VISIT_COUNTER_SCRIPT = `(function () {
  var screenParams = ${JSON.stringify(SCREEN_PARAMS)};
  var prefix = ${JSON.stringify(EVENT_PREFIX)};

  // Defined before any bail-out so callers never have to test for it.
  function noop() {}
  window.apgwCount = noop;

  // Global Privacy Control is a deliberate opt-out; honour it before anything is requested.
  if (navigator.globalPrivacyControl) return;

  // The same hosts count.js itself declines to count, so the loader is never fetched where
  // it could do nothing: dev builds, LAN testing and the layout tests make no outside request.
  var local = location.protocol === 'file:' || /(localhost$|^127\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^192\.168\.|^0\.0\.0\.0$|^\[?::1\]?$)/.test(location.hostname);

  function countedPath() {
    var params = new URLSearchParams(location.search);
    var kept = new URLSearchParams();
    screenParams.forEach(function (key) {
      var value = params.get(key);
      if (value) kept.set(key, value);
    });
    var query = kept.toString();
    return location.pathname + (query ? '?' + query : '');
  }

  window.goatcounter = { path: countedPath };
  var last = countedPath();
  function screenChanged() {
    var next = countedPath();
    if (next === last) return;
    last = next;
    if (document.visibilityState === 'visible' && window.goatcounter.count) window.goatcounter.count({ path: next });
  }
  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    history[name] = function () {
      var result = original.apply(this, arguments);
      screenChanged();
      return result;
    };
  });
  window.addEventListener('popstate', screenChanged);

  // An interaction is counted once per page load. A figure then reads as the number of visits
  // that used a control, not the number of clicks one reader made dragging a slider.
  var counted = {};
  var pending = [];
  function send(event) {
    window.goatcounter.count({ path: prefix + event.name, title: event.title, event: true });
  }
  window.apgwCount = function (name, title) {
    if (counted[name]) return;
    counted[name] = true;
    var event = { name: name, title: title };
    // A click can land before count.js arrives, so hold it rather than drop it.
    if (window.goatcounter.count) send(event);
    else pending.push(event);
  };
  window.apgwCount.pending = pending;

  // On a local host count.js declines to count anyway, so it is not fetched: dev builds and
  // the layout tests stay free of a request to an outside service.
  if (local) return;
  var loader = document.createElement('script');
  loader.async = true;
  loader.src = 'https://gc.zgo.at/count.js';
  loader.setAttribute('data-goatcounter', ${JSON.stringify(GOATCOUNTER_ENDPOINT)});
  loader.addEventListener('load', function () { pending.splice(0).forEach(send); });
  document.head.appendChild(loader);
})();`;

declare global {
  interface Window {
    /** Set by the inline script; count.js adds `count` to it when it loads. */
    goatcounter: {
      path: () => string;
      count?: (vars: { path: string; title?: string; event?: boolean }) => void;
    };
    apgwCount?: ((name: string, title: string) => void) & {
      pending?: Array<{ name: string; title: string }>;
    };
  }
}

/**
 * Record that a visit used one of the page's controls. Safe before count.js loads, safe when
 * the reader has opted out, and safe during server rendering.
 */
export function countEvent(name: string, title: string): void {
  if (typeof window !== "undefined") window.apgwCount?.(name, title);
}
