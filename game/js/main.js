// Main: boot, game loop, input, third-person camera, state machine, shot modes
// (?shot=cover|onfoot|chase|mission) and the debug API the play-tests use.
(function () {
  var renderer = null;
  var scene = null;
  var camera = null;
  var canvas = null;
  var clock = null;
  var menuOrbit = 0;
  var shotTimer = 0;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function init() {
    var params = new URLSearchParams(location.search);
    G.seed = parseInt(params.get('seed') || '1', 10) || 1;
    G.shotMode = params.get('shot') || null;
    G.rng = mulberry32(G.seed);

    canvas = document.getElementById('game');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    G.scene = scene;
    G.camera3 = camera;
    clock = { last: performance.now() };

    // Build the world.
    G.city = G.city || {};
    var cityData = G.city.build(scene, G.seed);
    G.city.buildings = cityData.buildings;
    G.city.garage = cityData.garage;
    G.city.docks = cityData.docks;
    G.city.nwCorner = cityData.nwCorner;
    G.city.spawn = cityData.spawn;

    G.playerApi.create(scene, cityData.spawn.x, cityData.spawn.z, cityData.spawn.yaw);
    G.camera.yaw = cityData.spawn.yaw;
    G.vehicles.init(scene);
    G.peds.init(20);
    G.hud.init();
    G.missions.init(scene);
    G.hud.setObjective(G.mission.label);

    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    canvas.addEventListener('click', function () {
      if (G.mode === 'playing' && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      }
    });

    if (G.shotMode) {
      // Auto-start for screenshots: skip the menu, set up the scene.
      startGame(false);
      applyShotMode();
    } else {
      G.hud.showStart();
    }
    requestAnimationFrame(loop);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function onKeyDown(e) {
    if (e.repeat) return;
    G.keys[e.code] = true;
    if (G.mode !== 'playing') return;
    if (e.code === 'KeyF') G.playerApi.tryPunch();
    if (e.code === 'KeyE') {
      var p = G.player;
      if (p.inCar) G.vehicles.exitCar();
      else if (G._nearCar) G.vehicles.enterCar(G._nearCar);
    }
    if (e.code === 'KeyM') {
      G.audio.setMuted(!G.muted);
      G.hud.toast(G.muted ? 'Sound muted' : 'Sound on');
    }
    if (e.code === 'KeyP') pauseGame();
  }

  function onKeyUp(e) {
    G.keys[e.code] = false;
  }

  function onMouseMove(e) {
    if (document.pointerLockElement !== canvas) return;
    G.camera.yaw -= e.movementX * 0.0026;
    G.camera.pitch = Math.max(0.06, Math.min(0.9, G.camera.pitch + e.movementY * 0.0022));
  }

  function onLockChange() {
    if (document.pointerLockElement !== canvas && G.mode === 'playing' && !G.shotMode) {
      pauseGame();
    }
  }

  function startGame(continueSave) {
    var save = continueSave ? G.save.loadGame() : null;
    if (save) {
      G.money = save.money || 0;
      G.missionsDone = save.missionsDone || 0;
      G.playerApi.setPosition(save.pos[0], save.pos[2], save.yaw);
      // Resume at the next uncompleted mission.
      if (G.missionsDone >= 1 && G.mission.index === 0) {
        G.missions.startMission(Math.min(2, G.missionsDone));
      }
    } else {
      G.money = 0;
      G.missionsDone = 0;
    }
    G.mode = 'playing';
    G.hud.showHud();
    G.audio.resume();
    if (!G.shotMode) {
      try { canvas.requestPointerLock(); } catch (e) {}
    }
    G.save.saveGame();
  }

  function pauseGame() {
    if (G.mode !== 'playing') return;
    G.mode = 'paused';
    G.hud.showPause();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }

  function resumeGame() {
    if (G.mode !== 'paused') return;
    G.mode = 'playing';
    G.hud.hidePause();
    G.audio.resume();
    if (!G.shotMode) {
      try { canvas.requestPointerLock(); } catch (e) {}
    }
  }

  function restartGame() {
    G.save.clearSave();
    location.reload();
  }

  function busted() {
    // Caught / beaten: lose $100, respawn at the garage, heat cleared.
    G.money = Math.max(0, G.money - 100);
    G.wanted = 0;
    G.police.syncPolice();
    G.player.health = 100;
    if (G.player.inCar) G.vehicles.exitCar();
    G.playerApi.setPosition(G.city.garage.x, G.city.garage.z - 6, Math.PI);
    G.hud.toast('BUSTED! You lost $100 and woke up at the garage.');
    G.audio.thud();
    G.save.saveGame();
  }

  function showEnding() {
    G.mode = 'ended';
    G.hud.showEnding();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }

  function applyShotMode() {
    var p = G.player;
    var mode = G.shotMode;
    if (mode === 'cover') {
      var car = G.vehicles.addCar(0, 20, 0, 'player');
      car.isPlayerCar = true;
      car.occupied = true;
      p.inCar = car;
      car.speed = 14;
      G.police.setWanted(1);
      var cop = G.vehicles.addCar(2, 44, 0, 'police');
      cop.speed = 12;
      cop.ai.wp = { x: 0, z: 20 };
      G.camera.yaw = 0;
      G.camera.pitch = 0.3;
    } else if (mode === 'onfoot') {
      // Player close enough (2.8 units) that the "steal the car" prompt shows.
      G.playerApi.setPosition(28, -28, Math.PI * 0.85);
      var parked = G.vehicles.addCar(30, -30, Math.PI / 2, 'parked');
      parked.wasParked = true;
      G.camera.yaw = Math.PI * 0.85;
      G.camera.pitch = 0.3;
    } else if (mode === 'chase') {
      var car2 = G.vehicles.addCar(0, 0, 0, 'player');
      car2.isPlayerCar = true;
      car2.occupied = true;
      p.inCar = car2;
      car2.speed = 18;
      G.missions.startMission(1); // Lose the Heat: wanted 3
      var c1 = G.vehicles.addCar(-3, 20, 0, 'police');
      c1.speed = 16;
      c1.ai.wp = { x: 0, z: 0 };
      var c2 = G.vehicles.addCar(4, 26, 0, 'police');
      c2.speed = 16;
      c2.ai.wp = { x: 0, z: 0 };
      G.camera.yaw = 0;
      G.camera.pitch = 0.32;
    } else if (mode === 'mission') {
      // On the x=-90 road, facing straight at the docks so the beacon and
      // the objective diamond are visible dead ahead.
      var car3 = G.vehicles.addCar(-90, 82, 0, 'player');
      car3.isPlayerCar = true;
      car3.occupied = true;
      p.inCar = car3;
      car3.speed = 8;
      G.camera.yaw = 0;
      G.camera.pitch = 0.3;
      // M1 is already active with the docks beacon.
    }
  }

  function angleLerp(a, b, t) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function updateCamera(dt) {
    var p = G.player;
    var target = p.pos;
    var dist = p.inCar ? 13 : 9;
    // While driving, the camera eases behind the car; on foot it is free.
    if (p.inCar) {
      G.camera.yaw = angleLerp(G.camera.yaw, p.inCar.yaw, Math.min(1, dt * 2.2));
    }
    var f = { x: Math.sin(G.camera.yaw), z: Math.cos(G.camera.yaw) };
    var pitch = G.camera.pitch;
    var cx = target.x - f.x * Math.cos(pitch) * dist;
    var cz = target.z - f.z * Math.cos(pitch) * dist;
    var cy = (p.inCar ? 1.2 : 1.8) + Math.sin(pitch) * dist;
    camera.position.set(cx, cy, cz);
    camera.lookAt(target.x + f.x * 6, (p.inCar ? 1.4 : 1.6), target.z + f.z * 6);
  }

  function updateMenuCamera(dt) {
    menuOrbit += dt * 0.045;
    var r = 150;
    camera.position.set(Math.sin(menuOrbit) * r, 62, Math.cos(menuOrbit) * r);
    camera.lookAt(0, 6, 0);
  }

  function loop() {
    requestAnimationFrame(loop);
    var now = performance.now();
    var dt = Math.min(0.05, (now - clock.last) / 1000);
    clock.last = now;
    if (G.mode === 'playing') {
      G.time += dt;
      G.playerApi.update(dt);
      G.vehicles.update(dt);
      G.peds.update(dt);
      G.police.update(dt);
      G.missions.update(dt);
      G.audio.update(dt);
      G.hud.update(dt);
      updateCamera(dt);
      shotTimer += dt;
    } else if (G.mode === 'menu') {
      updateMenuCamera(dt);
      G.time += dt;
    } else if (G.mode === 'ended') {
      updateCamera(dt);
    }
    renderer.render(scene, camera);
  }

  G.main = {
    startGame: startGame, resumeGame: resumeGame, restartGame: restartGame,
    pauseGame: pauseGame, showEnding: showEnding, busted: busted,
  };

  // Debug API for the headless play-tests (read state, teleport, set mission).
  G.debug = {
    state: function () {
      var p = G.player;
      return {
        mode: G.mode, money: G.money, wanted: G.wanted,
        missionsDone: G.missionsDone, missionIndex: G.mission ? G.mission.index : -1,
        missionPhase: G.mission ? G.mission.phase : -1,
        missionTimer: G.mission ? Math.round(G.mission.timer || 0) : 0,
        missionTarget: G.mission ? G.mission.target : null,
        health: Math.round(p.health),
        x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2),
        yaw: +(p.inCar ? p.inCar.yaw : p.yaw).toFixed(3),
        inCar: !!p.inCar, speed: p.inCar ? +p.inCar.speed.toFixed(2) : +p.speed.toFixed(2),
        unseenTime: +G.unseenTime.toFixed(1),
        policeCars: G.cars.filter(function (c) { return c.kind === 'police'; }).length,
      };
    },
    teleport: function (x, z, yaw) {
      if (G.player.inCar) G.vehicles.exitCar();
      G.playerApi.setPosition(x, z, yaw === undefined ? G.player.yaw : yaw);
    },
    setMoney: function (n) { G.money = n; },
    startMission: function (i) { G.missions.startMission(i); },
    setWanted: function (n) { G.police.setWanted(n); },
    cameraYaw: function (y) { G.camera.yaw = y; },
  };

  init();
})();
