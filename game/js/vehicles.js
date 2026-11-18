// Vehicles: arcade car physics, traffic AI on the road grid, parked stealable cars,
// police cars, enter/exit. Cars are circle-collided (r=1.7) against buildings.
(function () {
  var MAX_SPEED = 28;
  var MAX_REVERSE = 10;
  var ACCEL = 15;
  var BRAKE = 30;
  var CAR_R = 1.7;

  var bodyGeo = null;
  var cabinGeo = null;
  var wheelGeo = null;
  var COLORS = [0xd23b2e, 0x2e6fd2, 0xe8c33a, 0x3aa655, 0x8a5fd2, 0xe07b39, 0x9aa5ad, 0x222630];

  function rng() { return G.rng(); }

  function makeCarMesh(color, isPolice) {
    if (!bodyGeo) {
      bodyGeo = new THREE.BoxGeometry(2.0, 0.62, 4.2);
      cabinGeo = new THREE.BoxGeometry(1.7, 0.55, 2.1);
      wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
      wheelGeo.rotateZ(Math.PI / 2);
    }
    var group = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0xf2f2f2 : color });
    var body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.55;
    group.add(body);
    var cabinMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a2028 : 0x1c2733 });
    var cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.1, -0.2);
    group.add(cabin);
    if (isPolice) {
      var doorMat = new THREE.MeshLambertMaterial({ color: 0x1a2028 });
      var door = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.4, 1.6), doorMat);
      door.position.set(0, 0.62, 0.2);
      group.add(door);
      var barBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.5),
        new THREE.MeshLambertMaterial({ color: 0x222222 }));
      barBase.position.set(0, 1.45, -0.2);
      group.add(barBase);
      var red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.42),
        new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1 }));
      red.position.set(-0.32, 1.55, -0.2);
      red.name = 'lightRed';
      group.add(red);
      var blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.42),
        new THREE.MeshLambertMaterial({ color: 0x2266ff, emissive: 0x2266ff, emissiveIntensity: 0.2 }));
      blue.position.set(0.32, 1.55, -0.2);
      blue.name = 'lightBlue';
      group.add(blue);
    }
    // Headlights + taillights.
    var headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffedb0, emissiveIntensity: 0.7 });
    [-0.65, 0.65].forEach(function (x) {
      var h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.08), headMat);
      h.position.set(x, 0.55, 2.12);
      group.add(h);
      var t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08),
        new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0xaa1111, emissiveIntensity: 0.6 }));
      t.position.set(x, 0.55, -2.12);
      group.add(t);
    });
    var wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
    [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]].forEach(function (p) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(p[0], 0.36, p[1]);
      group.add(w);
    });
    return group;
  }

  function addCar(x, z, yaw, kind, color) {
    var isPolice = kind === 'police';
    var mesh = makeCarMesh(color === undefined ? COLORS[Math.floor(rng() * COLORS.length)] : color, isPolice);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = yaw;
    G.scene.add(mesh);
    var car = {
      mesh: mesh, pos: mesh.position, yaw: yaw, speed: 0,
      kind: kind, isPlayerCar: false, occupied: kind === 'police',
      ai: kind === 'traffic' ? { mode: 'traffic', wp: null, wait: 0 } :
          kind === 'police' ? { mode: 'police', wp: null } : null,
      steerVis: 0,
    };
    G.cars.push(car);
    return car;
  }

  function spawnTraffic(n) {
    var roads = G.city.ROADS;
    for (var i = 0; i < n; i++) {
      var horizontal = rng() < 0.5;
      var road = roads[Math.floor(rng() * roads.length)];
      var along = -95 + rng() * 190;
      var lane = (rng() < 0.5 ? -2.2 : 2.2);
      var x = horizontal ? along : road + lane;
      var z = horizontal ? road + lane : along;
      var yaw = horizontal ? (lane > 0 ? Math.PI / 2 : -Math.PI / 2) : (lane > 0 ? Math.PI : 0);
      var car = addCar(x, z, yaw, 'traffic');
      car.speed = 7 + rng() * 4;
      pickTrafficWaypoint(car);
    }
  }

  function spawnParked(n) {
    var roads = G.city.ROADS;
    // A guaranteed car right beside the spawn, ON the road (north lane of
    // the z=-30 road, facing east) — so the player always starts driving
    // from open tarmac, never wedged in the strip beside a building.
    addCar(30, -27.8, Math.PI / 2, 'parked');
    var placed = 1;
    var guard = 0;
    while (placed < n && guard++ < 200) {
      var road = roads[Math.floor(rng() * roads.length)];
      var along = -90 + rng() * 180;
      var side = rng() < 0.5 ? -1 : 1;
      var x = road + side * 5.6;
      var z = along;
      if (rng() < 0.5) { var t = x; x = along; z = road + side * 5.6; }
      // Keep clear of the garage front and mission markers.
      if (Math.hypot(x - 45, z + 33) < 10) continue;
      // Keep clear of the guaranteed spawn car.
      if (Math.hypot(x - 30, z + 27.8) < 14) continue;
      var yaw = rng() < 0.5 ? 0 : Math.PI / 2;
      addCar(x, z, yaw, 'parked');
      placed++;
    }
  }

  function pickTrafficWaypoint(car) {
    var roads = G.city.ROADS;
    var p = car.pos;
    // Snap to the road we are on, then pick the next intersection along our heading.
    var fwd = { x: Math.sin(car.yaw), z: Math.cos(car.yaw) };
    var curRoadX = G.city.nearestRoadCoord(p.x);
    var curRoadZ = G.city.nearestRoadCoord(p.z);
    var onXRoad = Math.abs(p.z - curRoadZ) < Math.abs(p.x - curRoadX);
    var next;
    if (onXRoad) {
      // Travelling along x on road z=curRoadZ.
      var dir = fwd.x >= 0 ? 1 : -1;
      var nx = curRoadX + dir * 30;
      if (nx > 90 || nx < -90) { dir = -dir; nx = curRoadX + dir * 30; }
      // At the intersection, sometimes turn onto the crossing road.
      if (rng() < 0.35) {
        var nz = curRoadZ + (rng() < 0.5 ? 30 : -30);
        nz = Math.max(-90, Math.min(90, nz));
        next = { x: nx, z: nz };
      } else {
        next = { x: nx, z: curRoadZ };
      }
    } else {
      var dirZ = fwd.z >= 0 ? 1 : -1;
      var nz2 = curRoadZ + dirZ * 30;
      if (nz2 > 90 || nz2 < -90) { dirZ = -dirZ; nz2 = curRoadZ + dirZ * 30; }
      if (rng() < 0.35) {
        var nx2 = curRoadX + (rng() < 0.5 ? 30 : -30);
        nx2 = Math.max(-90, Math.min(90, nx2));
        next = { x: nx2, z: nz2 };
      } else {
        next = { x: curRoadX, z: nz2 };
      }
    }
    car.ai.wp = next;
  }

  function angleDiff(a, b) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function driveCar(car, dt, throttle, steer) {
    // throttle: -1..1 (1 = accelerate), steer: -1..1 (1 = right).
    // Police top out below the player's car: a clean getaway at full
    // throttle genuinely opens a gap, so losing the heat is possible.
    var maxF = car.kind === 'police' ? 24 : MAX_SPEED;
    if (throttle > 0) car.speed += ACCEL * throttle * dt;
    else if (throttle < 0) {
      if (car.speed > 0.5) car.speed -= BRAKE * dt; // braking
      else car.speed -= ACCEL * 0.6 * dt; // reverse
    } else {
      car.speed -= Math.sign(car.speed) * 6 * dt;
      if (Math.abs(car.speed) < 0.4) car.speed = 0;
    }
    car.speed = Math.max(-MAX_REVERSE, Math.min(maxF, car.speed));
    var spd = Math.abs(car.speed);
    var steerAuthority = Math.min(1, spd / 7);
    car.yaw += steer * 2.1 * steerAuthority * dt * Math.sign(car.speed || 1);
    var f = { x: Math.sin(car.yaw), z: Math.cos(car.yaw) };
    car.pos.x += f.x * car.speed * dt;
    car.pos.z += f.z * car.speed * dt;
    car.mesh.rotation.y = car.yaw;
    // Body roll / pitch for feel.
    car.mesh.rotation.z = -steer * Math.min(0.06, spd * 0.002);
    car.mesh.rotation.x = throttle > 0 ? -0.02 : 0;
    // Building collision: stop and slide.
    var before = { x: car.pos.x, z: car.pos.z };
    if (G.city.collideCircle(car.pos, CAR_R)) {
      var hitSpeed = Math.abs(car.speed);
      car.speed *= 0.35;
      if (hitSpeed > 12 && car.kind === 'player') G.audio.thud();
      car.pos.x = before.x; car.pos.z = before.z;
      // Re-run collision push-out from the pre-move spot to avoid sticking.
      G.city.collideCircle(car.pos, CAR_R);
    }
  }

  function carAheadBlocked(car, dist) {
    var f = { x: Math.sin(car.yaw), z: Math.cos(car.yaw) };
    for (var i = 0; i < G.cars.length; i++) {
      var o = G.cars[i];
      if (o === car) continue;
      var dx = o.pos.x - car.pos.x;
      var dz = o.pos.z - car.pos.z;
      var along = dx * f.x + dz * f.z;
      if (along > 0 && along < dist) {
        var side = Math.abs(dx * f.z - dz * f.x);
        if (side < 3.2) return true;
      }
    }
    // Pedestrian right ahead.
    for (var j = 0; j < G.peds.list.length; j++) {
      var pd = G.peds.list[j];
      var pdx = pd.pos.x - car.pos.x;
      var pdz = pd.pos.z - car.pos.z;
      var pa = pdx * f.x + pdz * f.z;
      if (pa > 0 && pa < dist * 0.7 && Math.abs(pdx * f.z - pdz * f.x) < 2.4) return true;
    }
    return false;
  }

  function updateTraffic(car, dt) {
    var ai = car.ai;
    if (!ai.wp) pickTrafficWaypoint(car);
    var dx = ai.wp.x - car.pos.x;
    var dz = ai.wp.z - car.pos.z;
    var dist = Math.hypot(dx, dz);
    if (dist < 4) {
      if (ai.wait > 0) {
        ai.wait -= dt;
        driveCar(car, dt, 0, 0);
        return;
      }
      if (Math.random() < 0.18) ai.wait = 0.8 + Math.random() * 1.6;
      pickTrafficWaypoint(car);
      return;
    }
    var desired = Math.atan2(dx, dz);
    var diff = angleDiff(car.yaw, desired);
    var steer = Math.max(-1, Math.min(1, diff * 1.6));
    var throttle = 0.55;
    if (carAheadBlocked(car, 10)) throttle = -0.6;
    if (Math.abs(diff) > 0.9) throttle = 0.25;
    driveCar(car, dt, throttle, steer);
  }

  function updatePoliceCar(car, dt) {
    var ai = car.ai;
    var target = ai.wp || G.player.pos;
    var dx = target.x - car.pos.x;
    var dz = target.z - car.pos.z;
    var dist = Math.hypot(dx, dz);
    if (dist < 3) { driveCar(car, dt, 0, 0); return; }
    var desired = Math.atan2(dx, dz);
    var diff = angleDiff(car.yaw, desired);
    var steer = Math.max(-1, Math.min(1, diff * 1.8));
    var throttle = 0.9;
    if (carAheadBlocked(car, 8)) throttle = 0.2;
    driveCar(car, dt, throttle, steer);
    // Flash the light bar.
    var t = G.time * 6;
    var red = car.mesh.getObjectByName('lightRed');
    var blue = car.mesh.getObjectByName('lightBlue');
    if (red) red.material.emissiveIntensity = (Math.sin(t) > 0) ? 1.6 : 0.15;
    if (blue) blue.material.emissiveIntensity = (Math.sin(t) > 0) ? 0.15 : 1.6;
  }

  function updatePlayerCar(car, dt) {
    var k = G.keys;
    var throttle = 0;
    if (k['KeyW'] || k['ArrowUp']) throttle = 1;
    if (k['KeyS'] || k['ArrowDown']) throttle = -1;
    var steer = 0;
    if (k['KeyA'] || k['ArrowLeft']) steer = -1;
    if (k['KeyD'] || k['ArrowRight']) steer = 1;
    if (k['Space']) { // handbrake
      car.speed -= Math.sign(car.speed) * 22 * dt;
      if (Math.abs(car.speed) < 0.5) car.speed = 0;
    }
    driveCar(car, dt, throttle, steer);
    // Keep the camera target on the car.
    G.player.pos.copy(car.pos);
    G.player.speed = Math.abs(car.speed);
  }

  function update(dt) {
    for (var i = 0; i < G.cars.length; i++) {
      var car = G.cars[i];
      if (car.kind === 'player' && G.player.inCar === car) updatePlayerCar(car, dt);
      else if (car.kind === 'traffic') updateTraffic(car, dt);
      else if (car.kind === 'police') updatePoliceCar(car, dt);
    }
    // Car-car separation (cheap circle push-apart).
    for (var a = 0; a < G.cars.length; a++) {
      for (var b = a + 1; b < G.cars.length; b++) {
        var ca = G.cars[a], cb = G.cars[b];
        var dx = cb.pos.x - ca.pos.x;
        var dz = cb.pos.z - ca.pos.z;
        var d = Math.hypot(dx, dz);
        if (d > 0.01 && d < CAR_R * 2) {
          var push = (CAR_R * 2 - d) / 2;
          var nx = dx / d, nz = dz / d;
          ca.pos.x -= nx * push; ca.pos.z -= nz * push;
          cb.pos.x += nx * push; cb.pos.z += nz * push;
          if (ca.kind === 'player' || cb.kind === 'player') {
            ca.speed *= 0.6; cb.speed *= 0.6;
          }
        }
      }
    }
  }

  function nearestCar(pos, maxDist, kinds) {
    var best = null, bd = maxDist;
    for (var i = 0; i < G.cars.length; i++) {
      var c = G.cars[i];
      if (kinds && kinds.indexOf(c.kind) === -1) continue;
      if (c.kind === 'player' && G.player.inCar === c) continue;
      var d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function enterCar(car) {
    var p = G.player;
    p.inCar = car;
    car.kind = 'player';
    car.isPlayerCar = true;
    car.occupied = true;
    if (car.wasParked) {
      // Stealing: wanted +1 if anyone is close enough to see it.
      var seen = false;
      for (var i = 0; i < G.cops.length; i++) {
        var cp = G.cops[i];
        if (Math.hypot(cp.pos.x - p.pos.x, cp.pos.z - p.pos.z) < 40) { seen = true; break; }
      }
      if (!seen) {
        for (var j = 0; j < G.peds.list.length; j++) {
          var pd = G.peds.list[j];
          if (Math.hypot(pd.pos.x - p.pos.x, pd.pos.z - p.pos.z) < 25) { seen = true; break; }
        }
      }
      if (seen) {
        G.police.addWanted(1);
        G.hud.toast('STOLEN! Someone saw you take that car.');
      }
      car.wasParked = false;
    }
    G.audio.blip(520, 0.1, 'square', 0.2);
  }

  function exitCar() {
    var p = G.player;
    var car = p.inCar;
    if (!car) return;
    car.speed = 0;
    car.occupied = false;
    p.inCar = null;
    var f = { x: Math.sin(car.yaw), z: Math.cos(car.yaw) };
    // Step out to the left side of the car.
    p.pos.set(car.pos.x - f.z * 2.4, 0, car.pos.z + f.x * 2.4);
    G.city.collideCircle(p.pos, 0.9);
    p.yaw = car.yaw;
    p.mesh.rotation.y = car.yaw;
  }

  function init(scene) {
    G.rng = G.rng || (function () { return Math.random; })();
    spawnTraffic(12);
    spawnParked(10);
    // Mark parked cars as stealable.
    G.cars.forEach(function (c) { if (c.kind === 'parked') c.wasParked = true; });
  }

  G.vehicles = {
    init: init, update: update, addCar: addCar, nearestCar: nearestCar,
    enterCar: enterCar, exitCar: exitCar, angleDiff: angleDiff,
    spawnTraffic: spawnTraffic, spawnParked: spawnParked,
  };
})();
