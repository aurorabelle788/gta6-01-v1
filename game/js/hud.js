// HUD: minimap (canvas), wanted stars, health, money, objective, speed, toasts,
// banners, interact prompt, and the start / pause / ending screens.
(function () {
  var els = {};
  var toastTimer = null;
  var bannerTimer = null;
  var minimapCtx = null;
  var lastMinimap = 0;

  function el(id) { return document.getElementById(id); }

  function init() {
    ['hud', 'objective-title', 'objective-text', 'minimap', 'stars', 'health-bar',
     'health-text', 'money-value', 'speed', 'speed-value', 'hint', 'interact',
     'interact-text', 'toast', 'mission-banner', 'start-screen', 'pause-screen',
     'end-screen', 'start-btn', 'continue-btn', 'resume-btn', 'restart-btn',
     'again-btn', 'end-missions', 'end-money', 'health-wrap'].forEach(function (id) {
      els[id] = el(id);
    });
    minimapCtx = els['minimap'].getContext('2d');
    els['start-btn'].addEventListener('click', function () { G.main.startGame(false); });
    els['continue-btn'].addEventListener('click', function () { G.main.startGame(true); });
    els['resume-btn'].addEventListener('click', function () { G.main.resumeGame(); });
    els['restart-btn'].addEventListener('click', function () { G.main.restartGame(); });
    els['again-btn'].addEventListener('click', function () { G.main.restartGame(); });
    if (G.save.hasSave()) els['continue-btn'].classList.remove('hidden');
  }

  function showStart() {
    els['start-screen'].classList.remove('hidden');
    els['hud'].classList.add('hidden');
    els['pause-screen'].classList.add('hidden');
    els['end-screen'].classList.add('hidden');
  }

  function showHud() {
    els['start-screen'].classList.add('hidden');
    els['pause-screen'].classList.add('hidden');
    els['end-screen'].classList.add('hidden');
    els['hud'].classList.remove('hidden');
  }

  function showPause() {
    els['pause-screen'].classList.remove('hidden');
  }

  function hidePause() {
    els['pause-screen'].classList.add('hidden');
  }

  function showEnding() {
    els['end-missions'].textContent = G.missionsDone;
    els['end-money'].textContent = G.money.toLocaleString('en-US');
    els['end-screen'].classList.remove('hidden');
    els['hud'].classList.add('hidden');
  }

  function setObjective(text) {
    els['objective-text'].textContent = text;
  }

  function toast(text, ms) {
    if (G.shotMode) return; // clean screenshots
    els['toast'].textContent = text;
    els['toast'].classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els['toast'].classList.add('hidden'); }, ms || 3200);
  }

  function banner(text) {
    if (G.shotMode) return;
    els['mission-banner'].textContent = text;
    els['mission-banner'].classList.remove('hidden');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { els['mission-banner'].classList.add('hidden'); }, 1700);
  }

  function setInteract(text) {
    if (text) {
      els['interact-text'].textContent = text;
      els['interact'].classList.remove('hidden');
    } else {
      els['interact'].classList.add('hidden');
    }
  }

  function drawMinimap() {
    var c = minimapCtx;
    var S = 180;
    var W = 260; // world span mapped: -130..130
    function mx(x) { return (x + 130) / W * S; }
    function mz(z) { return (z + 130) / W * S; }
    c.clearRect(0, 0, S, S);
    c.fillStyle = 'rgba(24, 18, 40, 0.9)';
    c.fillRect(0, 0, S, S);
    // Beach + water (south edge).
    c.fillStyle = '#c9a86a';
    c.fillRect(0, mz(100), S, S - mz(100));
    c.fillStyle = '#2e7f9e';
    c.fillRect(0, mz(122), S, S - mz(122));
    // Roads.
    c.strokeStyle = '#5a5568';
    c.lineWidth = 5;
    G.city.ROADS.forEach(function (r) {
      c.beginPath(); c.moveTo(mx(-110), mz(r)); c.lineTo(mx(110), mz(r)); c.stroke();
      c.beginPath(); c.moveTo(mx(r), mz(-110)); c.lineTo(mx(r), mz(110)); c.stroke();
    });
    // Buildings.
    c.fillStyle = '#8f86a8';
    G.city.buildings.forEach(function (b) {
      c.fillRect(mx(b.minX), mz(b.minZ), (b.maxX - b.minX) / W * S, (b.maxZ - b.minZ) / W * S);
    });
    // Mission marker.
    if (G.mission && G.mission.target) {
      var t = G.mission.target;
      c.fillStyle = '#ffc861';
      c.beginPath();
      c.moveTo(mx(t.x), mz(t.z) - 7);
      c.lineTo(mx(t.x) + 7, mz(t.z));
      c.lineTo(mx(t.x), mz(t.z) + 7);
      c.lineTo(mx(t.x) - 7, mz(t.z));
      c.closePath();
      c.fill();
    }
    // Cars.
    G.cars.forEach(function (car) {
      c.fillStyle = car.kind === 'police' ? '#ff4444' : (car.kind === 'player' ? '#7be495' : '#d8d2e8');
      c.beginPath();
      c.arc(mx(car.pos.x), mz(car.pos.z), car.kind === 'police' ? 4 : 3, 0, Math.PI * 2);
      c.fill();
    });
    // Player.
    var p = G.player;
    if (p) {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(mx(p.pos.x), mz(p.pos.z), 4.5, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(mx(p.pos.x), mz(p.pos.z));
      c.lineTo(mx(p.pos.x) + Math.sin(p.yaw) * 10, mz(p.pos.z) + Math.cos(p.yaw) * 10);
      c.stroke();
    }
  }

  function update(dt) {
    var p = G.player;
    if (!p) return;
    // Stars.
    var stars = '';
    for (var i = 0; i < 5; i++) stars += i < G.wanted ? '★' : '☆';
    els['stars'].textContent = stars;
    els['stars'].style.opacity = G.wanted > 0 ? '1' : '0.35';
    // Health.
    var hp = Math.max(0, Math.round(p.health));
    els['health-bar'].style.width = hp + '%';
    els['health-text'].textContent = hp;
    els['health-bar'].style.background = hp > 50
      ? 'linear-gradient(90deg,#37d67a,#7be495)'
      : (hp > 25 ? 'linear-gradient(90deg,#e8a33a,#f5c65e)' : 'linear-gradient(90deg,#d23b2e,#f0705e)');
    // Money.
    els['money-value'].textContent = G.money.toLocaleString('en-US');
    // Speed.
    if (p.inCar) {
      els['speed'].classList.remove('hidden');
      els['speed-value'].textContent = Math.round(Math.abs(p.inCar.speed) * 2.2);
    } else {
      els['speed'].classList.add('hidden');
    }
    // Interact prompt (nearest enterable car).
    if (!p.inCar) {
      var car = G.vehicles.nearestCar(p.pos, 3.6, ['parked', 'player']);
      if (car) {
        setInteract(car.wasParked ? 'steal the car' : 'get in the car');
        G._nearCar = car;
      } else {
        setInteract(null);
        G._nearCar = null;
      }
    } else {
      setInteract(null);
      G._nearCar = null;
    }
    // Minimap at ~10 Hz.
    lastMinimap += dt;
    if (lastMinimap > 0.1) {
      lastMinimap = 0;
      drawMinimap();
    }
  }

  G.hud = {
    init: init, update: update, showStart: showStart, showHud: showHud,
    showPause: showPause, hidePause: hidePause, showEnding: showEnding,
    setObjective: setObjective, toast: toast, banner: banner, setInteract: setInteract,
  };
})();
