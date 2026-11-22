// Wird in die bikerouter-Seite injiziert. Fängt clientseitig erzeugte Downloads
// (Blob-/data:-URLs) ab und reicht sie an die App weiter, statt sie herunterzuladen.
(function () {
  if (window.__radreiseHooked) return;
  window.__radreiseHooked = true;

  var blobs = new Map();
  var origCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (obj) {
    var url = origCreate(obj);
    if (obj instanceof Blob) blobs.set(url, obj);
    return url;
  };

  function send(name, blob) {
    var reader = new FileReader();
    reader.onload = function () {
      var s = String(reader.result);
      window.RadreiseNative.onFile(name || 'export', blob.type || '', s.substring(s.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  }

  function capture(href, name) {
    var blob = blobs.get(href);
    if (blob) { send(name, blob); return true; }
    if (/^(blob|data):/.test(href)) {
      fetch(href).then(function (r) { return r.blob(); }).then(function (b) { send(name, b); });
      return true;
    }
    return false;
  }
  window.__radreiseCapture = capture;

  function isDownloadAnchor(el) {
    return el instanceof HTMLAnchorElement && el.hasAttribute('download') && /^(blob|data):/.test(el.href);
  }

  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (isDownloadAnchor(this) && capture(this.href, this.getAttribute('download'))) return;
    return origClick.apply(this, arguments);
  };

  var origDispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (ev) {
    if (ev && ev.type === 'click' && isDownloadAnchor(this) && capture(this.href, this.getAttribute('download'))) return true;
    return origDispatch.apply(this, arguments);
  };

  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[download]') : null;
    if (a && isDownloadAnchor(a) && capture(a.href, a.getAttribute('download'))) ev.preventDefault();
  }, true);
})();
