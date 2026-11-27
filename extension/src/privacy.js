/**
 * Доступно — privacy gate: what may be sent off the device, and from where.
 *
 * Loaded in two places (no build step, one copy of the rules):
 *  - content scripts (manifest, right after core.js), on window.Dostupno
 *  - the background (Firefox: manifest background.scripts; Chrome: importScripts
 *    in background.js), on the worker's globalThis.Dostupno
 *
 * Anything that sends data to a server MUST call, right before sending:
 *  - mayShareFrom(location.href, settings) && !pageLooksPrivate(document) in the page,
 *  - mayShareFrom(sender.url, settings) again in the background (the browser-reported
 *    URL, which a page script can't fake),
 *  - mayShareUrl(url, settings) for every item URL.
 * settings is the full synced settings object ({ enabled, disabledSites, ai, privateSites }).
 * About the page itself, only pageHost(url) may be sent, never the full page URL
 * (it can hold reset tokens, invite codes, search terms).
 *
 * Everything fails closed: an error, an unparsable URL or a malformed setting means
 * "don't send". The functions are pure (settings are passed in) and make no DOM changes.
 */
(() => {
  // Content scripts share window.Dostupno with core.js (in Firefox, window and globalThis
  // can differ there); the background has no window.
  const G = typeof window !== 'undefined' ? window : globalThis;
  const D = (G.Dostupno = G.Dostupno || {});

  // ---------------------------------------------------------------------------
  // Built-in private sites. A host matches a domain or any of its subdomains.
  // List the narrowest domain that is private (mail.google.com, not google.com).
  // ---------------------------------------------------------------------------
  const PRIVATE_DOMAINS = Object.freeze([
    // Banks and payment services
    'privatbank.ua', 'privat24.ua', 'monobank.ua', 'oschadbank.ua', 'pumb.ua',
    'raiffeisen.ua', 'ukrsibbank.com', 'sensebank.com.ua', 'abank.com.ua', 'ukrgasbank.com',
    'otpbank.com.ua', 'izibank.com.ua', 'creditagricole.ua', 'procreditbank.com.ua',
    'liqpay.ua', 'portmone.com.ua', 'easypay.ua', 'ipay.ua', 'wayforpay.com', 'fondy.ua',
    'novapay.ua', 'paypal.com', 'wise.com', 'revolut.com',
    // Government personal cabinets (not all of gov.ua: public pages need AI help most)
    'diia.gov.ua', 'id.gov.ua', 'cabinet.tax.gov.ua', 'portal.pfu.gov.ua', 'id.court.gov.ua',
    // Mail
    'mail.google.com', 'outlook.live.com', 'outlook.office.com', 'outlook.office365.com',
    'mail.ukr.net', 'mail.i.ua', 'mail.meta.ua', 'mail.yahoo.com', 'mail.proton.me', 'app.tuta.com',
    // Messengers, work chat, calendars and contacts
    'web.telegram.org', 'web.whatsapp.com', 'messenger.com', 'app.slack.com', 'discord.com',
    'teams.microsoft.com', 'ton.twitter.com', 'chat.google.com', 'meet.google.com',
    'calendar.google.com', 'contacts.google.com', 'keep.google.com', 'calendar.proton.me',
    // AI assistants (conversations)
    'chatgpt.com', 'claude.ai', 'gemini.google.com',
    // Medical
    'helsi.me', 'doc.ua', 'ehealth.gov.ua', 'dila.ua', 'synevo.ua',
    // Accounts, documents, photos and storage
    'myaccount.google.com', 'photos.google.com', 'docs.google.com', 'drive.google.com',
    'onedrive.live.com', 'sharepoint.com', 'dropbox.com', 'icloud.com', 'notion.so',
    'drive.proton.me', 'account.proton.me',
    // Password managers
    'vault.bitwarden.com', 'my.1password.com', 'lastpass.com', 'pass.proton.me',
    // Home router admin pages
    'tplinkwifi.net', 'routerlogin.net', 'my.keenetic.net',
  ]);

  // Private sections of otherwise public sites: [domain, path prefixes].
  const PRIVATE_PATHS = Object.freeze([
    ['facebook.com', ['/messages']],
    ['instagram.com', ['/direct']],
    ['x.com', ['/messages', '/i/chat']],
    ['twitter.com', ['/messages']],
    ['linkedin.com', ['/messaging']],
  ].map(([domain, prefixes]) => Object.freeze([domain, Object.freeze(prefixes)])));

  // Hosts of embedded payment forms: a page that embeds one is private while it does.
  // Checked for iframes only, so these companies' public sites are not blocked.
  const PAYMENT_FRAME_DOMAINS = Object.freeze([
    'js.stripe.com', 'hooks.stripe.com', 'braintreegateway.com', 'braintree-api.com',
    'adyen.com', 'pay.google.com', 'checkout.com',
  ]);

  // Suffixes that are never the public web: intranets, special-use and anonymity networks,
  // and public DNS names that point back at a local address (nip.io and friends).
  const NON_PUBLIC_SUFFIXES = [
    '.local', '.internal', '.lan', '.corp', '.home', '.home.arpa', '.intranet', '.localhost',
    '.localdomain', '.test', '.example', '.invalid', '.alt', '.onion', '.i2p',
    '.nip.io', '.sslip.io', '.localtest.me',
  ];

  // Parameter names are normalized (lowercase, without "-", "_", "[]") before matching.
  const SECRET_PARAM_PARTS = [
    'token', 'secret', 'passw', 'signature', 'credential', 'session', 'hmac', 'jwt', 'auth', 'email', 'phone',
  ];
  const SECRET_PARAM_NAMES = new Set([
    'key', 'apikey', 'sig', 'sid', 'code', 'policy', 'keypairid', 'oh', 'oe', 'otp', 'pwd', 'pin', 'ticket',
  ]);
  const SECRET_PATH_PARAM = /;\s*(jsessionid|sessionid|sid|token)=/i;

  const SECRET_FIELDS = [
    '[type="password" i]', // also custom elements such as <sl-input type="password">
    '[autocomplete~="current-password" i]',
    '[autocomplete~="new-password" i]',
    '[autocomplete~="one-time-code" i]',
    '[autocomplete*="cc-" i]',
    // Card fields without autocomplete, common on checkouts
    '[name*="cardnumber" i]', '[name*="card_number" i]', '[name*="card-number" i]',
    '[id*="cardnumber" i]', '[id*="card_number" i]', '[id*="card-number" i]',
    'input[name*="cvv" i]', 'input[name*="cvc" i]', 'input[id*="cvv" i]', 'input[id*="cvc" i]',
  ].join(',');

  // Built-in elements that can host a shadow root (attachShadow); custom elements have a "-".
  const SHADOW_HOSTS = new Set([
    'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BODY', 'DIV', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'HEADER', 'MAIN', 'NAV', 'P', 'SECTION', 'SPAN',
  ]);

  const normHost = (host) => String(host).toLowerCase().replace(/\.+$/, '');

  const parse = (url) => {
    try {
      return new URL(String(url));
    } catch (_) {
      return null;
    }
  };

  /**
   * Hostname from a hostname, host:port, *.domain, .domain or full URL; unicode becomes
   * punycode. Throws when there is no usable host (wildcards left, empty labels), so
   * callers fail closed.
   */
  const hostOf = (value) => {
    const s = String(value).trim();
    const u = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? new URL(s) : new URL('http://' + s);
    const host = normHost(u.hostname).replace(/^(\*\.|\.)+/, '');
    if (!host || /\*|^\.|\.\./.test(host)) throw new Error('not a hostname: ' + s);
    return host;
  };

  const matchesDomain = (host, domain) => host === domain || host.endsWith('.' + domain);

  const isHttp = (u) => u.protocol === 'https:' || u.protocol === 'http:';

  const publicHost = (host) => {
    if (!host || host === 'localhost') return false;
    if (host.startsWith('[') || host.includes(':')) return false; // IPv6 literal
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false; // IPv4 (the URL parser normalizes shorthand)
    if (!host.includes('.')) return false; // single label (intranet)
    return !NON_PUBLIC_SUFFIXES.some((s) => host.endsWith(s) || host === s.slice(1));
  };

  const privateHost = (host) => PRIVATE_DOMAINS.some((d) => matchesDomain(host, d));

  /**
   * Private section of a public site? The path is decoded and lowercased, doubled slashes
   * collapsed; a prefix matches when followed by the end or any character that can't
   * continue a word (/messages, /messages/t/1, /messages;x, /messages.php, not
   * /messagesforyou). Undecodable paths count as private.
   */
  const privatePath = (host, rawPath) => {
    let path;
    try {
      path = decodeURIComponent(rawPath);
    } catch (_) {
      return true;
    }
    path = path.toLowerCase().replace(/\/+/g, '/');
    return PRIVATE_PATHS.some(([domain, prefixes]) => matchesDomain(host, domain) &&
      prefixes.some((p) => path.startsWith(p) && !/[a-z0-9_-]/.test(path.charAt(p.length))));
  };

  /** Settings that forbid sending from this host: off, turned off on the site, or excluded. */
  const settingsForbid = (host, settings) => {
    if (!settings || settings.ai !== true) return true;
    if (settings.enabled === false) return true;
    for (const key of ['disabledSites', 'privateSites']) {
      const list = settings[key];
      if (list === undefined) continue;
      if (!Array.isArray(list)) return true; // malformed: fail closed
      if (list.some((site) => typeof site !== 'string')) return true;
      // An entry that can't be parsed throws, and that means "don't send".
      if (list.some((site) => matchesDomain(host, hostOf(site)))) return true;
    }
    return false;
  };

  /** Public web host (accepts a hostname, host:port or URL). Errors count as not public. */
  const isPublicHost = (value) => {
    try {
      return publicHost(hostOf(value));
    } catch (_) {
      return false;
    }
  };

  /** On the built-in private list (accepts a hostname, host:port or URL). Errors count as private. */
  const isPrivateHost = (value) => {
    try {
      return privateHost(hostOf(value));
    } catch (_) {
      return true;
    }
  };

  /** May anything be sent from this page? settings: the synced settings object. */
  const mayShareFrom = (pageUrl, settings) => {
    try {
      const u = parse(pageUrl);
      if (!u || !isHttp(u)) return false;
      const host = normHost(u.hostname);
      if (!publicHost(host) || privateHost(host)) return false;
      if (privatePath(host, u.pathname)) return false;
      return !settingsForbid(host, settings);
    } catch (_) {
      return false;
    }
  };

  const normParam = (name) => name.toLowerCase().replace(/\[\]$/, '').replace(/[-_]/g, '');

  const secretParam = (rawName) => {
    let name;
    try {
      name = normParam(decodeURIComponent(rawName.replace(/\+/g, ' ')));
    } catch (_) {
      return true; // undecodable name: assume the worst
    }
    return SECRET_PARAM_NAMES.has(name) || SECRET_PARAM_PARTS.some((part) => name.includes(part));
  };

  const hasSecretParams = (u) =>
    u.search.slice(1).split(/[&;]/).some((pair) => pair && secretParam(pair.split('=')[0]));

  /**
   * May this item URL (such as an image source) be sent? Must be absolute. With settings,
   * the item's own host must also not be turned off or excluded by the user.
   */
  const mayShareUrl = (itemUrl, settings) => {
    try {
      const u = parse(itemUrl);
      if (!u || !isHttp(u)) return false; // also rules out data:, blob:, file:
      if (u.username || u.password) return false;
      const host = normHost(u.hostname);
      if (!publicHost(host) || privateHost(host)) return false;
      if (privatePath(host, u.pathname)) return false;
      if (u.hash) return false; // fetching never needs it; it can hold keys (#key, #access_token=)
      if (SECRET_PATH_PARAM.test(u.pathname)) return false; // ;jsessionid=…
      if (hasSecretParams(u)) return false;
      if (settings !== undefined && settingsForbid(host, settings)) return false;
      return true;
    } catch (_) {
      return false;
    }
  };

  /** The only thing about the page that may be sent: its hostname (null if none). */
  const pageHost = (pageUrl) => {
    try {
      const u = parse(pageUrl);
      return u && isHttp(u) ? normHost(u.hostname) || null : null;
    } catch (_) {
      return null;
    }
  };

  const shadowOf = (el) => {
    try {
      // Content scripts can reach closed roots too (Chrome: chrome.dom, Firefox: openOrClosedShadowRoot).
      if (typeof el.openOrClosedShadowRoot === 'function') return el.openOrClosedShadowRoot();
      if (globalThis.chrome?.dom?.openOrClosedShadowRoot) return globalThis.chrome.dom.openOrClosedShadowRoot(el);
    } catch (_) {}
    return el.shadowRoot;
  };

  const frameIsPrivate = (frame) => {
    const u = parse(frame.src);
    if (!u) return false;
    const host = normHost(u.hostname);
    return privateHost(host) || PAYMENT_FRAME_DOMAINS.some((d) => matchesDomain(host, d));
  };

  const rootLooksPrivate = (root, depth) => {
    if (depth > 20) return true; // absurd nesting: assume the worst
    if (root.querySelector(SECRET_FIELDS)) return true;
    for (const frame of root.querySelectorAll('iframe')) {
      if (frame.src && frameIsPrivate(frame)) return true;
      // Same-origin frames (a login form in <iframe src="/login">) are checked like the page.
      let inner = null;
      try {
        inner = frame.contentDocument;
      } catch (_) {}
      if (inner && rootLooksPrivate(inner, depth + 1)) return true;
    }
    for (const el of root.querySelectorAll('*')) {
      if (!el.tagName.includes('-') && !SHADOW_HOSTS.has(el.tagName)) continue; // can't host a shadow root
      const shadow = shadowOf(el);
      if (shadow && rootLooksPrivate(shadow, depth + 1)) return true;
    }
    return false;
  };

  /**
   * Does the page show something secret right now (password, one-time code, payment
   * card, an embedded payment or private widget), including inside Shadow DOM?
   * Walks the whole document, so run it right before sending (once per batch),
   * never while fixing. Errors count as private.
   */
  const pageLooksPrivate = (doc) => {
    try {
      return rootLooksPrivate(doc, 0);
    } catch (_) {
      return true;
    }
  };

  D.privacy = Object.freeze({
    PRIVATE_DOMAINS,
    PRIVATE_PATHS,
    PAYMENT_FRAME_DOMAINS,
    isPublicHost,
    isPrivateHost,
    mayShareFrom,
    mayShareUrl,
    pageHost,
    pageLooksPrivate,
  });
})();
