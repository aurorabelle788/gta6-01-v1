// Pedestrians: ~20 people walking the sidewalks. They flee when the player hits
// them or drives close and fast; hitting one raises wanted.
(function () {
  var list = [];
  var bodyGeo = null;
  var SHIRT_COLORS = [0xe86a6a, 0x6aa8e8, 0x7bc47f, 0xe8c56a, 0xb06ad2, 0x5ec4c4, 0xe89a5e, 0x9aa5ad];

  function makePedMesh(color) {
    if (!bodyGeo) bodyGeo = new THREE.BoxGeometry(0.7, 1.0, 0.42);
    var group = new THREE.Group();
    var shirt = new THREE.MeshLambertMaterial({ color: color });
    var pants = new THREE.MeshLambertMaterial({ color: 0x2a2d38 });
    var skin = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
    var body = new THREE.Mesh(bodyGeo, shirt);
    body.position.y = 1.05;
    group.add(body);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), skin);
    head.position.y = 1.82;
    group.add(head);
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.6, 0.3), pants);
    legL.position.set(-0.16, 0.3, 0);
    group.add(legL);
    var legR = legL.clone();
    legR.position.x = 0.16;
    group.add(legR);
    return group;
  }

  function spawnOne(x, z) {
    var color = SHIRT_COLORS[Math.floor(G.rng() * SHIRT_COLORS.length)];
    var mesh = makePedMesh(color);
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    var ped = {
      mesh: mesh, pos: mesh.position,
      yaw: G.rng() * Math.PI * 2,
      speed: 1.2 + G.rng() * 1.1,
      state: 'walk', // walk | flee
      fleeTime: 0,
      target: null,
      phase: G.rng() * 6,
    };
    pickSidewalkTarget(ped);
    list.push(ped);
    return ped;
  }

  function pickSidewalkTarget(ped) {
    var roads = G.city.ROADS;
    var road = roads[Math.floor(G.rng() * roads.length)];
    var along = -95 + G.rng() * 190;
    var side = G.rng() < 0.5 ? -1 : 1;
    if (G.rng() < 0.5) ped.target = { x: along, z: road + side * 6.4 };
    else ped.target = { x: road + side * 6.4, z: along };
  }

  function init(n) {
    for (var i = 0; i < n; i++) {
      var roads = G.city.ROADS;
      var road = roads[Math.floor(G.rng() * roads.length)];
      var along = -95 + G.rng() * 190;
      var side = G.rng() < 0.5 ? -1 : 1;
      var x = road + side * 6.4, z = along;
      if (G.rng() < 0.5) { x = along; z = road + side * 6.4; }
      spawnOne(x, z);
    }
  }

  function update(dt) {
    var p = G.player;
    for (var i = 0; i < list.length; i++) {
      var ped = list[i];
      // Flee check: player car close and fast, or player on foot very close.
      var dpx = p.pos.x - ped.pos.x;
      var dpz = p.pos.z - ped.pos.z;
      var d = Math.hypot(dpx, dpz);
      var carSpeed = p.inCar ? Math.abs(p.inCar.speed) : 0;
      // Flee range grows with the car's speed: a car at 27 covers 9 units
      // in 0.33s, but a ped needs ~0.5s to clear the 2.4 hit radius — so a
      // fast car would run peds down before they could move. Give them
      // roughly a second of warning at any speed.
      var fleeRange = 9 + carSpeed * 1.0;
      if (ped.state === 'walk' && ((p.inCar && d < fleeRange && carSpeed > 6) || (!p.inCar && d < 2.2))) {
        ped.state = 'flee';
        ped.fleeTime = 2.5;
      }
      var speed = ped.speed;
      var tx, tz;
      if (ped.state === 'flee') {
        ped.fleeTime -= dt;
        // Run away from the player.
        tx = ped.pos.x - dpx / (d || 1) * 10;
        tz = ped.pos.z - dpz / (d || 1) * 10;
        speed = 5.2;
        if (ped.fleeTime <= 0) ped.state = 'walk';
      } else {
        if (!ped.target || Math.hypot(ped.target.x - ped.pos.x, ped.target.z - ped.pos.z) < 2) {
          pickSidewalkTarget(ped);
        }
        tx = ped.target.x; tz = ped.target.z;
      }
      var dx = tx - ped.pos.x;
      var dz = tz - ped.pos.z;
      var dist = Math.hypot(dx, dz);
      if (dist > 0.05) {
        var wantYaw = Math.atan2(dx, dz);
        var diff = wantYaw - ped.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ped.yaw += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
        ped.pos.x += Math.sin(ped.yaw) * speed * dt;
        ped.pos.z += Math.cos(ped.yaw) * speed * dt;
        ped.phase += dt * speed * 2.4;
        ped.mesh.rotation.y = ped.yaw;
        ped.mesh.children[2].rotation.x = Math.sin(ped.phase) * 0.55;
        ped.mesh.children[3].rotation.x = -Math.sin(ped.phase) * 0.55;
      }
      G.city.collideCircle(ped.pos, 0.6);
    }
    // Player car hitting a ped: knock them down + wanted.
    if (p.inCar) {
      var car = p.inCar;
      for (var j = 0; j < list.length; j++) {
        var pd = list[j];
        var hd = Math.hypot(pd.pos.x - car.pos.x, pd.pos.z - car.pos.z);
        if (hd < 2.4 && Math.abs(car.speed) > 3) {
          // Shove the ped aside and slow the car a little.
          var nx = (pd.pos.x - car.pos.x) / (hd || 1);
          var nz = (pd.pos.z - car.pos.z) / (hd || 1);
          pd.pos.x += nx * 3;
          pd.pos.z += nz * 3;
          pd.state = 'flee';
          pd.fleeTime = 3;
          car.speed *= 0.55;
          G.police.addWanted(1);
          G.hud.toast('You hit a pedestrian!');
          G.audio.thud();
        }
      }
    }
  }

  function knockback(pos, radius) {
    for (var i = 0; i < list.length; i++) {
      var pd = list[i];
      var d = Math.hypot(pd.pos.x - pos.x, pd.pos.z - pos.z);
      if (d < radius) {
        pd.state = 'flee';
        pd.fleeTime = 2;
        var nx = (pd.pos.x - pos.x) / (d || 1);
        var nz = (pd.pos.z - pos.z) / (d || 1);
        pd.pos.x += nx * 2.5;
        pd.pos.z += nz * 2.5;
      }
    }
  }

  G.peds = { init: init, update: update, knockback: knockback, list: list };
})();
