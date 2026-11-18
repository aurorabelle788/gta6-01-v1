// Player on foot: third-person WASD + mouse-look, run, jump, punch, enter/exit cars.
(function () {
  var WALK_SPEED = 6;
  var RUN_SPEED = 10.5;
  var JUMP_V = 8.5;
  var GRAVITY = 24;
  var RADIUS = 0.9;

  var mesh = null;
  var bodyMat = null;
  var punchTimer = 0;
  var punchCooldown = 0;

  function createPlayer(scene, x, z, yaw) {
    bodyMat = new THREE.MeshLambertMaterial({ color: 0x2e86ff });
    var pantsMat = new THREE.MeshLambertMaterial({ color: 0x22242e });
    var skinMat = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
    var group = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.05, 0.5), bodyMat);
    body.position.y = 1.15;
    group.add(body);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
    head.position.y = 1.95;
    group.add(head);
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.65, 0.4), pantsMat);
    legL.position.set(-0.22, 0.32, 0);
    group.add(legL);
    var legR = legL.clone();
    legR.position.x = 0.22;
    group.add(legR);
    // Simple arms (used for the punch swing).
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.85, 0.3), bodyMat);
    armL.position.set(-0.6, 1.15, 0);
    armL.name = 'armL';
    group.add(armL);
    var armR = armL.clone();
    armR.name = 'armR';
    armR.position.x = 0.6;
    group.add(armR);
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    scene.add(group);
    mesh = group;

    G.player = {
      pos: group.position,
      yaw: yaw,
      vy: 0,
      onGround: true,
      health: 100,
      inCar: null,
      speed: 0,
      mesh: group,
      walkPhase: 0,
    };
    return G.player;
  }

  function forwardVector(yaw) {
    return { x: Math.sin(yaw), z: Math.cos(yaw) };
  }

  function update(dt) {
    var p = G.player;
    if (!p || G.mode !== 'playing') return;
    if (p.inCar) {
      // Hidden while driving; position follows the car.
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    punchCooldown = Math.max(0, punchCooldown - dt);
    var camYaw = G.camera.yaw;
    var f = forwardVector(camYaw);
    var r = { x: f.z, z: -f.x };
    var mx = 0, mz = 0;
    var k = G.keys;
    if (k['KeyW'] || k['ArrowUp']) { mx += f.x; mz += f.z; }
    if (k['KeyS'] || k['ArrowDown']) { mx -= f.x; mz -= f.z; }
    if (k['KeyA'] || k['ArrowLeft']) { mx -= r.x; mz -= r.z; }
    if (k['KeyD'] || k['ArrowRight']) { mx += r.x; mz += r.z; }
    var len = Math.hypot(mx, mz);
    var run = k['ShiftLeft'] || k['ShiftRight'];
    var speed = run ? RUN_SPEED : WALK_SPEED;
    if (len > 0) {
      mx /= len; mz /= len;
      p.pos.x += mx * speed * dt;
      p.pos.z += mz * speed * dt;
      p.yaw = Math.atan2(mx, mz);
      p.speed = speed;
      p.walkPhase += dt * speed * 1.6;
      mesh.rotation.y = p.yaw;
      // Simple leg swing.
      mesh.children[2].rotation.x = Math.sin(p.walkPhase) * 0.5;
      mesh.children[3].rotation.x = -Math.sin(p.walkPhase) * 0.5;
    } else {
      p.speed = 0;
      mesh.children[2].rotation.x = 0;
      mesh.children[3].rotation.x = 0;
    }
    // Jump + gravity.
    if ((k['Space']) && p.onGround) {
      p.vy = JUMP_V;
      p.onGround = false;
    }
    if (!p.onGround) {
      p.vy -= GRAVITY * dt;
      p.pos.y += p.vy * dt;
      if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.onGround = true; }
    }
    // Building collision (circle push-out).
    G.city.collideCircle(p.pos, RADIUS);
    // Punch swing animation.
    if (punchTimer > 0) {
      punchTimer -= dt;
      var armR = mesh.getObjectByName('armR');
      if (armR) armR.rotation.x = -1.4 * Math.max(0, punchTimer / 0.25);
    }
    // Health regen out of combat.
    if (p.health < 100 && G.wanted === 0) p.health = Math.min(100, p.health + 2.5 * dt);
  }

  function tryPunch() {
    var p = G.player;
    if (!p || p.inCar || punchCooldown > 0 || G.mode !== 'playing') return;
    punchCooldown = 0.45;
    punchTimer = 0.25;
    G.audio.thud();
    // Hit a nearby ped or cop: knock them back, small wanted bump if a cop sees it.
    var f = forwardVector(p.yaw);
    var hitPos = { x: p.pos.x + f.x * 1.8, z: p.pos.z + f.z * 1.8 };
    G.peds.knockback(hitPos, 2.2);
    G.police.punchHit(hitPos, 2.2);
  }

  function damage(amount) {
    var p = G.player;
    if (!p || G.mode !== 'playing') return;
    p.health -= amount;
    if (p.health <= 0) {
      p.health = 0;
      G.main.busted();
    }
  }

  function setPosition(x, z, yaw) {
    var p = G.player;
    if (!p) return;
    p.pos.set(x, 0, z);
    if (yaw !== undefined) { p.yaw = yaw; mesh.rotation.y = yaw; }
    p.vy = 0;
    p.onGround = true;
  }

  G.playerApi = {
    create: createPlayer,
    update: update,
    tryPunch: tryPunch,
    damage: damage,
    setPosition: setPosition,
    forwardVector: forwardVector,
  };
})();
