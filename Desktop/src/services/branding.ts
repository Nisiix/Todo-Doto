/** Indirizzi pubblici del progetto. */

/** Versione di questa build (da package.json). */
export const APP_VERSION = __APP_VERSION__

/** Repository pubblico: Release, segnalazioni e discussioni. */
export const REPO = 'Nisiix/Todo-Doto'
export const REPO_URL = `https://github.com/${REPO}`
export const RELEASES_URL = `${REPO_URL}/releases`
/** Ultima Release pubblicata (API di GitHub, senza autenticazione). */
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`

/** Sito, con la sezione download (propone l'installer nella lingua scelta). */
export const SITE_URL = 'https://nisiix.github.io/Todo-Doto/'
export const DOWNLOAD_URL = `${SITE_URL}#download`

/** Email dell'autore: feedback e donazioni con PayPal. */
export const AUTHOR_EMAIL = 'nisos@live.it'

/** Donazioni con PayPal (l'app è gratuita). */
export const DONATE_URL = 'https://www.paypal.com/donate/?business=nisos%40live.it&item_name=Todo+Doto&currency_code=EUR'
