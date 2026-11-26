export const CREATOR_NAME = "Pruthvi Yannam";
export const CREATOR_CREDIT = `Created by ${CREATOR_NAME}`;

/** A local welcome preference, never authentication or a visitor identifier. */
export const WELCOME_STORAGE_KEY = "ap-gw-welcome-v1";
export const WELCOME_STORAGE_VALUE = "entered";

/** The water opening plays once per device, before the first welcome; remembered on its own. */
export const OPENING_STORAGE_KEY = "ap-gw-opening-v1";
export const OPENING_STORAGE_VALUE = "seen";

// Hide the entrance before hydration for returning readers, avoiding an intro flash. A first
// visit that will open with the water marks itself, so the welcome waits behind the dark water
// instead of flashing for a moment before the opening mounts.
export const WELCOME_BOOTSTRAP_SCRIPT = `(function(){try{var d=document.documentElement;if(localStorage.getItem(${JSON.stringify(WELCOME_STORAGE_KEY)})===${JSON.stringify(WELCOME_STORAGE_VALUE)})d.dataset.apWelcome='remembered';else if(localStorage.getItem(${JSON.stringify(OPENING_STORAGE_KEY)})!==${JSON.stringify(OPENING_STORAGE_VALUE)}&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!/[?&]welcome=blend/.test(location.search))d.dataset.apOpening='pending';}catch(e){}})();`;
