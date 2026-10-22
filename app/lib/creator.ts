export const CREATOR_NAME = "Pruthvi Yannam";
export const CREATOR_CREDIT = `Designed and built by ${CREATOR_NAME}`;

/** A local welcome preference, never authentication or a visitor identifier. */
export const WELCOME_STORAGE_KEY = "ap-gw-welcome-v1";
export const WELCOME_STORAGE_VALUE = "entered";

// Hide the entrance before hydration for returning readers, avoiding an intro flash.
export const WELCOME_BOOTSTRAP_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(WELCOME_STORAGE_KEY)})===${JSON.stringify(WELCOME_STORAGE_VALUE)})document.documentElement.dataset.apWelcome='remembered';}catch(e){}})();`;
