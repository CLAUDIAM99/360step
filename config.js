// Copia questo file e inserisci la chiave, oppure usa `npm start`: il server sovrascrive /config.js da .env
// Legacy: __360STEP_CONFIG__ viene ancora unito se presente (vecchi deploy).
(function () {
  var legacy = window.__360STEP_CONFIG__ || {};
  window.__ROAMY_CONFIG__ = Object.assign(
    { googleMapsApiKey: "" },
    legacy,
    window.__ROAMY_CONFIG__ || {}
  );
})();
