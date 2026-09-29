/* Orbit Child — the phone's own screens (2026-09-29).
 *
 * Deliberately small and honest: pair with a code from the parent, walk through
 * the phone's own permissions one at a time, then a status screen that always
 * says sharing is on. There is no hidden mode and no "stop" button: removal is
 * done by the parent (or by uninstalling, which the parent sees).
 *
 * All networking, credentials, the queue and the location service live in the
 * native plugin `ChildTracker` (Android: Kotlin, iOS: Swift). This file only
 * calls it. The contract is in records/plans/device-tracking-plan.md and in
 * mobile/README.md.
 */
(function () {
  "use strict";

  var cap = window.Capacitor;
  var Tracker = cap && (cap.registerPlugin ? cap.registerPlugin("ChildTracker") : cap.Plugins && cap.Plugins.ChildTracker);
  var app = document.getElementById("app");
  var state = null;
  var busy = false;
  var lastError = "";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ago(iso) {
    if (!iso) return "never";
    var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return "just now";
    var m = Math.round(s / 60);
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    if (h < 24) return h + " hr ago";
    return Math.round(h / 24) + " days ago";
  }
  function platform() {
    return (state && state.platform) || (cap && cap.getPlatform ? cap.getPlatform() : "web");
  }

  async function refresh() {
    if (!Tracker) {
      app.innerHTML = '<h1>Orbit Child</h1><div class="banner bad">This screen only works inside the Orbit Child app on a phone.</div>';
      return;
    }
    try {
      state = await Tracker.getState();
    } catch (e) {
      lastError = (e && e.message) || String(e);
    }
    render();
  }

  async function run(fn) {
    if (busy) return;
    busy = true;
    lastError = "";
    render();
    try {
      var next = await fn();
      if (next && typeof next === "object" && "paired" in next) state = next;
      else state = await Tracker.getState();
    } catch (e) {
      lastError = (e && e.message) || String(e);
    }
    busy = false;
    // Sharing starts by itself as soon as everything it needs is allowed.
    if (state && state.paired && !state.revoked && state.permission === "ALWAYS" && state.trackingState !== "RUNNING") {
      try { state = await Tracker.startTracking(); } catch (e) { lastError = (e && e.message) || String(e); }
    }
    render();
  }

  function pairScreen() {
    var cfg = window.ORBIT_CONFIG || {};
    var server = (state && state.serverUrl) || cfg.serverUrl || "";
    var removed = state && state.revoked
      ? '<div class="banner bad">This phone was removed from your family\'s Orbit. Ask your parent for a new code.</div>'
      : "";
    return (
      "<h1>Orbit Child</h1>" +
      '<p class="muted">This app shares where this phone is with your family, all the time, after you connect it with a code from your parent\'s Orbit.</p>' +
      removed +
      '<div class="card">' +
      '<label for="server">Your family\'s Orbit address</label>' +
      '<input id="server" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…" value="' + esc(server) + '" />' +
      '<label for="code">Code from your parent\'s screen</label>' +
      '<input id="code" class="code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="9" placeholder="ABCD-EFGH" />' +
      '<button id="pair" class="full"' + (busy ? " disabled" : "") + ">" + (busy ? "Connecting…" : "Connect this phone") + "</button>" +
      (lastError ? '<p class="error">' + esc(lastError) + "</p>" : "") +
      "</div>"
    );
  }

  function step(done, title, body, button) {
    return (
      "<li>" +
      '<span class="dot ' + (done ? "ok" : "todo") + '">' + (done ? "✓" : "!") + "</span>" +
      '<div class="step-body"><strong>' + esc(title) + "</strong>" +
      '<p class="muted">' + body + "</p>" +
      (!done && button ? button : "") +
      "</div></li>"
    );
  }

  function statusScreen() {
    var s = state;
    var android = platform() === "android";
    var whileInUse = s.permission === "ALWAYS" || s.permission === "WHILE_IN_USE";
    var always = s.permission === "ALWAYS";
    var ready = always && s.locationEnabled && s.trackingState === "RUNNING";
    var banner = ready
      ? '<div class="banner on">Sharing is on. Your family can see where this phone is.</div>'
      : '<div class="banner off">Sharing needs one more step below.</div>';
    var dis = busy ? " disabled" : "";

    var steps =
      step(whileInUse, "Location", "So the phone can tell where it is.", '<button data-act="fg"' + dis + ">Allow location</button>") +
      step(always, android ? "Allow all the time" : "Always allow",
        android
          ? "Needed so sharing keeps working when the app is closed. On the next screen tap <b>Permissions → Location → Allow all the time</b>."
          : "Needed so sharing keeps working when the app is closed. Choose <b>Change to Always Allow</b>, or in Settings: <b>Location → Always</b>.",
        '<button data-act="bg"' + dis + ">" + (android ? "Open settings" : "Allow always") + "</button>") +
      step(s.preciseLocation !== false, "Precise location", "Without it the position can be off by several kilometres.", '<button class="secondary" data-act="settings"' + dis + ">Open settings</button>") +
      step(s.locationEnabled, "Location switched on", "The phone's location setting is off.", '<button class="secondary" data-act="location-settings"' + dis + ">Open settings</button>") +
      step(s.notificationsAllowed !== false, "Notifications", android ? "Shows the \"sharing location\" notice, and lets your parent ask for a fresh position." : "Lets your parent ask for a fresh position.", '<button class="secondary" data-act="notify"' + dis + ">Allow notifications</button>") +
      (android
        ? step(s.batteryOptimized === false, "Battery", "Some phones stop apps to save battery. Allow Orbit Child to run in the background.", '<button class="secondary" data-act="battery"' + dis + ">Don't restrict</button>")
        : "");

    return (
      "<h1>Hi" + (s.personName ? " " + esc(s.personName) : "") + "</h1>" +
      banner +
      '<div class="card"><h2>Set-up</h2><ul class="steps">' + steps + "</ul></div>" +
      '<div class="card"><h2>Status</h2>' +
      '<div class="row"><span>Sharing</span><span>' + (s.trackingState === "RUNNING" ? "On" : "Not running") + "</span></div>" +
      '<div class="row"><span>Last position</span><span>' + esc(ago(s.lastFixAt)) + "</span></div>" +
      '<div class="row"><span>Last sent</span><span>' + esc(ago(s.lastUploadAt)) + "</span></div>" +
      '<div class="row"><span>Waiting to send</span><span>' + esc(s.queueSize || 0) + "</span></div>" +
      (s.lastUploadError ? '<p class="error">Last problem: ' + esc(s.lastUploadError) + "</p>" : "") +
      '<button class="full" data-act="now"' + dis + ">" + (busy ? "Sending…" : "Send my location now") + "</button>" +
      (lastError ? '<p class="error">' + esc(lastError) + "</p>" : "") +
      "</div>" +
      '<p class="muted">Connected to ' + esc(s.serverUrl || "") + ". Only your parent can remove this phone.</p>"
    );
  }

  function render() {
    if (!state) return;
    app.innerHTML = !state.paired || state.revoked ? pairScreen() : statusScreen();
    var pair = document.getElementById("pair");
    if (pair) {
      pair.onclick = function () {
        var serverUrl = document.getElementById("server").value.trim().replace(/\/+$/, "");
        var code = document.getElementById("code").value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        if (!serverUrl || code.length !== 8) { lastError = "Enter the address and the 8-letter code."; render(); return; }
        run(function () { return Tracker.pair({ serverUrl: serverUrl, code: code }); });
      };
    }
    var acts = {
      fg: function () { return Tracker.requestForegroundPermission(); },
      bg: function () { return Tracker.requestBackgroundPermission(); },
      notify: function () { return Tracker.requestNotificationPermission(); },
      battery: function () { return Tracker.requestBatteryExemption(); },
      settings: function () { return Tracker.openAppSettings(); },
      "location-settings": function () { return Tracker.openLocationSettings(); },
      now: function () { return Tracker.sendNow(); },
    };
    Array.prototype.forEach.call(document.querySelectorAll("[data-act]"), function (b) {
      b.onclick = function () { run(acts[b.getAttribute("data-act")]); };
    });
  }

  if (Tracker && Tracker.addListener) {
    Tracker.addListener("stateChange", function (s) { state = s; render(); });
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
  // Coming back from Settings: read the permissions again.
  if (cap && cap.Plugins && cap.Plugins.App && cap.Plugins.App.addListener) {
    cap.Plugins.App.addListener("resume", refresh);
  }
  setInterval(function () { if (!document.hidden && !busy) refresh(); }, 10000);
  refresh();
})();
