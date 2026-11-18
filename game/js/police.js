// Wanted system: 1-5 stars. Police cars chase on the road grid (Manhattan pursuit),
// foot cops close in on foot. Wanted decays only when the player is out of police
// line-of-sight: 8s unseen, then 1 star per 4s. Nothing resets the unseen timer
// based on speed — that bug made M2 incompletable in the first build.
(function () {
  var MAX_POLICE_CARS = 6;
  var retargetTimer = 0;
  // Last spot any police unit actually SAW the player. Police chase this,
  // not the player's live position: when the player breaks line of sight
  // the pursuit goes to the last known spot and searches there, so a clean
  // break genuinely loses the heat instead of the cops tracking perfectly.
  var lastSeen = null;

  function addWanted(n) {
    var before = G.wanted;
    G.wanted = Math.max(0, Math.min(5, G.wanted + n));
    if (G.wanted > before) {
      G.unseenTime = 0;
      G.decayAccum = 0;
      syncPolice();
      if (G.wanted >= 3) G.hud.toast('WANTED: ' + G.wanted + ' stars!');
    }
  }

  function setWanted(n) {
    G.wanted = Math.max(0, Math.min(5, n));
    G.unseenTime = 0;
    G.decayAccum = 0;
    syncPolice();
  }

  function policeCarCount() {
    var n = 0;
    for (var i = 0; i < G.cars.length; i++) if (G.cars[i].kind === 'police') n++;
    return n;
  }

  function spawnPoliceCar() {
    var roads = G.city.ROADS;
    var p = G.player.pos;
    // Pick a road point 45-70 units from the player.
    for (var tries = 0; tries < 30; tries++) {
      var road = roads[Math.floor(G.rng() * roads.length)];
      var along = -95 + G.rng() * 190;
      var x = road, z = along;
      if (G.rng() < 0.5) { x = along; z = road; }
      if (Math.hypot(x - p.x, z - p.z) > 45) {
        var car = G.vehicles.addCar(x, z, Math.atan2(p.x - x, p.z - z), 'police');
        car.speed = 10;
        return car;
      }
    }
    return null;
  }

  function spawnFootCop() {
    var p = G.player.pos;
    var ang = G.rng() * Math.PI * 2;
    var x = p.x + Math.cos(ang) * 18;
    var z = p.z + Math.sin(ang) * 18;
    x = Math.max(-100, Math.min(100, x));
    z = Math.max(-100, Math.min(100, z));
    var group = new THREE.Group();
    var dark = new THREE.MeshLambertMaterial({ color: 0x1a2436 });
    var skin = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.5), dark);
    body.position.y = 1.15;
    group.add(body);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.5), skin);
    head.position.y = 1.95;
    group.add(head);
    var hat = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.56),
      new THREE.MeshLambertMaterial({ color: 0x0e1520 }));
    hat.position.y = 2.2;
    group.add(hat);
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.65, 0.36), dark);
    legL.position.set(-0.2, 0.32, 0);
    group.add(legL);
    var legR = legL.clone();
    legR.position.x = 0.2;
    group.add(legR);
    group.position.set(x, 0, z);
    G.scene.add(group);
    var cop = { mesh: group, pos: group.position, yaw: 0, speed: 4.6, phase: 0 };
    G.cops.push(cop);
    return cop;
  }

  function syncPolice() {
    var wantCars = G.wanted === 0 ? 0 : Math.min(MAX_POLICE_CARS, 1 + G.wanted);
    var have = policeCarCount();
    while (have < wantCars) { if (!spawnPoliceCar()) break; have++; }
    // Remove extra police cars when wanted drops.
    if (have > wantCars) {
      var removed = 0;
      for (var i = G.cars.length - 1; i >= 0 && removed < have - wantCars; i--) {
        if (G.cars[i].kind === 'police') {
          G.scene.remove(G.cars[i].mesh);
          G.cars.splice(i, 1);
          removed++;
        }
      }
    }
    // Foot cops: one per 2 wanted stars.
    var wantCops = Math.floor(G.wanted / 2);
    while (G.cops.length < wantCops) spawnFootCop();
    while (G.cops.length > wantCops) {
      var c = G.cops.pop();
      G.scene.remove(c.mesh);
    }
  }

  // Manhattan waypoint for a police car: stay on the road grid.
  // Target the last SEEN spot (updated whenever any unit has line of
  // sight), not the player's live position — otherwise the pursuit can
  // never be shaken and M2 is incompletable.
  function policeWaypoint(car) {
    var p = lastSeen || G.player.pos;
    var dist = Math.hypot(p.x - car.pos.x, p.z - car.pos.z);
    if (dist < 14) return { x: p.x, z: p.z };
    var carRoadX = G.city.nearestRoadCoord(car.pos.x);
    var carRoadZ = G.city.nearestRoadCoord(car.pos.z);
    var onXRoad = Math.abs(car.pos.z - carRoadZ) <= Math.abs(car.pos.x - carRoadX);
    var tRoadX = G.city.nearestRoadCoord(p.x);
    var tRoadZ = G.city.nearestRoadCoord(p.z);
    if (onXRoad) {
      if (Math.abs(car.pos.x - tRoadX) < 8) return { x: tRoadX, z: tRoadZ };
      return { x: tRoadX, z: carRoadZ };
    }
    if (Math.abs(car.pos.z - tRoadZ) < 8) return { x: tRoadX, z: tRoadZ };
    return { x: carRoadX, z: tRoadZ };
  }

  function anyPoliceSeesPlayer() {
    var p = G.player.pos;
    for (var i = 0; i < G.cars.length; i++) {
      var c = G.cars[i];
      if (c.kind !== 'police') continue;
      var d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      if (d < 50 && !G.city.losBlocked(c.pos.x, c.pos.z, p.x, p.z)) return true;
    }
    for (var j = 0; j < G.cops.length; j++) {
      var cp = G.cops[j];
      var d2 = Math.hypot(cp.pos.x - p.x, cp.pos.z - p.z);
      if (d2 < 45 && !G.city.losBlocked(cp.pos.x, cp.pos.z, p.x, p.z)) return true;
    }
    return false;
  }

  function update(dt) {
    if (G.mode !== 'playing') return;
    var p = G.player;
    // Remember the last spot the player was actually seen: the pursuit
    // targets this, so breaking line of sight genuinely shakes the cops.
    if (anyPoliceSeesPlayer()) lastSeen = { x: p.pos.x, z: p.pos.z };
    // Retarget police cars on the road grid every 1.2s.
    retargetTimer -= dt;
    if (retargetTimer <= 0) {
      retargetTimer = 1.2;
      for (var i = 0; i < G.cars.length; i++) {
        var c = G.cars[i];
        if (c.kind === 'police') c.ai.wp = policeWaypoint(c);
      }
    }
    // Foot cops walk at the player; contact damages health.
    for (var j = 0; j < G.cops.length; j++) {
      var cp = G.cops[j];
      var dx = p.pos.x - cp.pos.x;
      var dz = p.pos.z - cp.pos.z;
      var d = Math.hypot(dx, dz);
      if (d > 0.1) {
        var wantYaw = Math.atan2(dx, dz);
        cp.yaw = wantYaw;
        cp.pos.x += Math.sin(wantYaw) * cp.speed * dt;
        cp.pos.z += Math.cos(wantYaw) * cp.speed * dt;
        cp.phase += dt * cp.speed * 2.4;
        cp.mesh.rotation.y = wantYaw;
        cp.mesh.children[2].rotation.x = Math.sin(cp.phase) * 0.5;
        cp.mesh.children[3].rotation.x = -Math.sin(cp.phase) * 0.5;
        G.city.collideCircle(cp.pos, 0.6);
      }
      if (d < 2.2 && !p.inCar) {
        G.playerApi.damage(6 * dt);
        G.hud.toast('The cops are on you!');
      }
    }
    // Wanted decay: only when NO police has line-of-sight.
    if (G.wanted > 0) {
      if (anyPoliceSeesPlayer()) {
        G.unseenTime = 0;
        G.decayAccum = 0;
      } else {
        G.unseenTime += dt;
        if (G.unseenTime > 8) {
          G.decayAccum += dt;
          if (G.decayAccum >= 4) {
            G.decayAccum = 0;
            G.wanted -= 1;
            if (G.wanted === 0) {
              G.hud.toast('You lost them. Clean.');
              G.audio.blip(880, 0.2, 'sine', 0.25);
            }
            syncPolice();
          }
        }
      }
    }
    // Despawn far police cars once the heat is off.
    if (G.wanted === 0) {
      for (var k = G.cars.length - 1; k >= 0; k--) {
        var pc = G.cars[k];
        if (pc.kind === 'police' && Math.hypot(pc.pos.x - p.pos.x, pc.pos.z - p.pos.z) > 90) {
          G.scene.remove(pc.mesh);
          G.cars.splice(k, 1);
        }
      }
    }
  }

  function punchHit(pos, radius) {
    for (var i = 0; i < G.cops.length; i++) {
      var cp = G.cops[i];
      var d = Math.hypot(cp.pos.x - pos.x, cp.pos.z - pos.z);
      if (d < radius) {
        var nx = (cp.pos.x - pos.x) / (d || 1);
        var nz = (cp.pos.z - pos.z) / (d || 1);
        cp.pos.x += nx * 3;
        cp.pos.z += nz * 3;
        addWanted(1);
      }
    }
  }

  G.police = {
    update: update, addWanted: addWanted, setWanted: setWanted,
    punchHit: punchHit, spawnPoliceCar: spawnPoliceCar, syncPolice: syncPolice,
    policeCarCount: policeCarCount,
  };
})();
