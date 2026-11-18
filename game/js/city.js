// City: procedural 8x8-block coastal city. Roads on a 30-unit grid, buildings inside
// blocks, a downtown tower cluster, and a beach + water on the south edge.
// Seeded RNG so every load with the same seed builds the same city.
(function () {
  var ROADS = [-90, -60, -30, 0, 30, 60, 90];
  var ROAD_HALF = 4.5;
  var CITY_MIN = -105;
  var CITY_MAX = 105;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var PALETTE = [0xe8a87c, 0xf2d5a0, 0xc98a7d, 0x9fc5c9, 0xd9b8e6, 0xf0e6d2, 0xb5d3a7, 0xe6b8a2];
  var ROOF_COLORS = [0x8a5a44, 0x6b7c8a, 0x5a4a6b, 0x7a6a55];

  function buildCity(scene, seed) {
    var rng = mulberry32(seed || 1);
    var buildings = []; // {minX,maxX,minZ,maxZ,h}
    var group = new THREE.Group();
    group.name = 'city';

    var unitBox = new THREE.BoxGeometry(1, 1, 1);
    var mats = PALETTE.map(function (c) { return new THREE.MeshLambertMaterial({ color: c }); });
    var roofMats = ROOF_COLORS.map(function (c) { return new THREE.MeshLambertMaterial({ color: c }); });
    var roadMat = new THREE.MeshLambertMaterial({ color: 0x2e2a33 });
    var walkMat = new THREE.MeshLambertMaterial({ color: 0x8f8a96 });
    var groundMat = new THREE.MeshLambertMaterial({ color: 0x5d6b52 });
    var sandMat = new THREE.MeshLambertMaterial({ color: 0xe0c188 });
    var waterMat = new THREE.MeshLambertMaterial({ color: 0x2e7f9e, transparent: true, opacity: 0.92 });
    var lineMat = new THREE.MeshLambertMaterial({ color: 0xd8d2a0 });
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    var leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
    var poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
    var lampMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc861, emissiveIntensity: 0.9 });

    // Ground + sand + water.
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, 0);
    group.add(ground);
    var sand = new THREE.Mesh(new THREE.PlaneGeometry(260, 22), sandMat);
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.02, 112);
    group.add(sand);
    var water = new THREE.Mesh(new THREE.PlaneGeometry(560, 120), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.05, 182);
    group.add(water);

    // Road planes + sidewalks + lane markings.
    var roadGeo = new THREE.PlaneGeometry(220, ROAD_HALF * 2);
    ROADS.forEach(function (c) {
      var r1 = new THREE.Mesh(roadGeo, roadMat);
      r1.rotation.x = -Math.PI / 2;
      r1.position.set(0, 0.06, c);
      group.add(r1);
      var r2 = new THREE.Mesh(roadGeo, roadMat);
      r2.rotation.x = -Math.PI / 2;
      r2.rotation.z = Math.PI / 2;
      r2.position.set(c, 0.06, 0);
      group.add(r2);
      // Sidewalk strips along each road.
      var walkGeo = new THREE.PlaneGeometry(220, 2.2);
      var w1 = new THREE.Mesh(walkGeo, walkMat);
      w1.rotation.x = -Math.PI / 2;
      w1.position.set(0, 0.08, c - ROAD_HALF - 1.1);
      group.add(w1);
      var w2 = new THREE.Mesh(walkGeo, walkMat);
      w2.rotation.x = -Math.PI / 2;
      w2.position.set(0, 0.08, c + ROAD_HALF + 1.1);
      group.add(w2);
      // Dashed centre line.
      for (var d = -100; d <= 100; d += 10) {
        var dash = new THREE.Mesh(new THREE.BoxGeometry(4, 0.06, 0.35), lineMat);
        dash.position.set(d, 0.1, c);
        group.add(dash);
        var dash2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 4), lineMat);
        dash2.position.set(c, 0.1, d);
        group.add(dash2);
      }
    });

    // Buildings: one or two per block cell. Downtown = tall towers near centre.
    var blockCenters = [-75, -45, -15, 15, 45, 75];
    blockCenters.forEach(function (bx) {
      blockCenters.forEach(function (bz) {
        var downtown = Math.abs(bx) <= 45 && Math.abs(bz) <= 45;
        var count = downtown ? 1 : (rng() < 0.55 ? 2 : 1);
        for (var i = 0; i < count; i++) {
          // Buildings must fit inside the block: block half-width is 8.3 from
          // its centre (road 4.5 + sidewalk 2.2 each side of the 30 pitch).
          // Keep |offset| + size/2 <= 6.0, so a 4.5-wide strip stays clear
          // between the road edge and the nearest wall — a car (3.4 across)
          // can turn around in it instead of getting wedged.
          var w, d, ox, oz;
          if (downtown) {
            w = 9 + rng() * 3;
            d = 9 + rng() * 3;
            ox = 0; oz = 0;
          } else {
            w = 5 + rng() * 2;
            d = 5 + rng() * 2;
            ox = count === 1 ? 0 : (i === 0 ? -2.5 : 2.5);
            oz = count === 1 ? 0 : (i === 0 ? 2.5 : -2.5);
          }
          var h = downtown ? 26 + rng() * 42 : 6 + rng() * 11;
          var cx = bx + ox;
          var cz = bz + oz;
          var mat = mats[Math.floor(rng() * mats.length)];
          var b = new THREE.Mesh(unitBox, mat);
          b.scale.set(w, h, d);
          b.position.set(cx, h / 2, cz);
          group.add(b);
          // Rooftop slab + a small prop box.
          var roof = new THREE.Mesh(unitBox, roofMats[Math.floor(rng() * roofMats.length)]);
          roof.scale.set(w * 0.92, 0.5, d * 0.92);
          roof.position.set(cx, h + 0.25, cz);
          group.add(roof);
          if (rng() < 0.7) {
            var prop = new THREE.Mesh(unitBox, roofMats[Math.floor(rng() * roofMats.length)]);
            prop.scale.set(1.6, 1.2, 1.6);
            prop.position.set(cx + (rng() - 0.5) * w * 0.5, h + 1.1, cz + (rng() - 0.5) * d * 0.5);
            group.add(prop);
          }
          buildings.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h: h });
        }
      });
    });

    // Garage (player home): low wide building with an orange roof at (45, -45) block.
    var garage = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0xf2e3c9 }));
    garage.scale.set(16, 6, 10);
    garage.position.set(45, 3, -45);
    group.add(garage);
    var garageRoof = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0xe07840 }));
    garageRoof.scale.set(16.6, 0.6, 10.6);
    garageRoof.position.set(45, 6.3, -45);
    group.add(garageRoof);
    var door = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0x4a4a55 }));
    door.scale.set(8, 4, 0.4);
    door.position.set(45, 2, -39.8);
    group.add(door);
    buildings.push({ minX: 37, maxX: 53, minZ: -50, maxZ: -40, h: 6 });

    // Docks: wooden pier + crates at the south-west beach.
    var pierMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
    var pier = new THREE.Mesh(unitBox, pierMat);
    pier.scale.set(10, 0.8, 26);
    pier.position.set(-90, 0.6, 118);
    group.add(pier);
    for (var ci = 0; ci < 6; ci++) {
      var crate = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0xa8763e }));
      var cs = 2 + rng() * 1.4;
      crate.scale.set(cs, cs, cs);
      crate.position.set(-94 + (ci % 3) * 4, cs / 2 + 0.8, 108 + Math.floor(ci / 3) * 5);
      crate.rotation.y = rng() * 0.6;
      group.add(crate);
    }

    // Streetlights at intersections.
    var poleGeo = new THREE.CylinderGeometry(0.14, 0.18, 6, 6);
    var lampGeo = new THREE.SphereGeometry(0.45, 8, 6);
    ROADS.forEach(function (rx) {
      ROADS.forEach(function (rz) {
        if ((rx + rz) % 60 !== 0) return;
        var pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(rx + 5.4, 3, rz + 5.4);
        group.add(pole);
        var lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(rx + 5.4, 6.2, rz + 5.4);
        group.add(lamp);
      });
    });

    // Palm trees along the beach and a few on roads.
    var palmTrunk = new THREE.CylinderGeometry(0.22, 0.34, 7, 6);
    var palmTop = new THREE.IcosahedronGeometry(2.1, 0);
    for (var px = -100; px <= 100; px += 12) {
      if (rng() < 0.25) continue;
      var trunk = new THREE.Mesh(palmTrunk, trunkMat);
      trunk.position.set(px, 3.5, 104);
      trunk.rotation.z = (rng() - 0.5) * 0.16;
      group.add(trunk);
      var top = new THREE.Mesh(palmTop, leafMat);
      top.position.set(px, 7.6, 104);
      top.scale.y = 0.62;
      group.add(top);
    }

    // Benches + hydrants as small props near sidewalks.
    var benchMat = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
    var hydMat = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
    for (var bi = 0; bi < 26; bi++) {
      var bx2 = ROADS[Math.floor(rng() * ROADS.length)] + (rng() < 0.5 ? -6.4 : 6.4);
      var bz2 = -95 + rng() * 190;
      var bench = new THREE.Mesh(unitBox, benchMat);
      bench.scale.set(2.4, 0.5, 0.9);
      bench.position.set(bx2, 0.5, bz2);
      group.add(bench);
      if (rng() < 0.5) {
        var hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.9, 8), hydMat);
        hyd.position.set(bx2 + 2, 0.45, bz2 + 1.5);
        group.add(hyd);
      }
    }

    // Sunset: warm directional sun low from the west, hemisphere sky, fog.
    var hemi = new THREE.HemisphereLight(0xffd9b0, 0x4a3a5e, 0.75);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xffb36b, 1.15);
    sun.position.set(-120, 55, -40);
    scene.add(sun);
    var amb = new THREE.AmbientLight(0x8a6a9e, 0.35);
    scene.add(amb);
    scene.fog = new THREE.Fog(0xe8937c, 120, 420);
    scene.background = new THREE.Color(0xf2a06b);
    // Visible sun disc low on the western horizon.
    var sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(16, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false })
    );
    sunDisc.position.set(-260, 42, -60);
    sunDisc.lookAt(0, 20, 0);
    scene.add(sunDisc);

    scene.add(group);
    return {
      group: group,
      buildings: buildings,
      roads: ROADS.slice(),
      roadHalf: ROAD_HALF,
      garage: { x: 45, z: -33 },
      docks: { x: -90, z: 106 },
      nwCorner: { x: -90, z: -90 },
      spawn: { x: 30, z: -30, yaw: Math.PI * 0.75 },
    };
  }

  function nearestRoadCoord(v) {
    var best = ROADS[0];
    var bd = Infinity;
    ROADS.forEach(function (r) {
      var d = Math.abs(v - r);
      if (d < bd) { bd = d; best = r; }
    });
    return best;
  }

  function isOnRoad(x, z) {
    return Math.abs(x - nearestRoadCoord(x)) <= ROAD_HALF ||
           Math.abs(z - nearestRoadCoord(z)) <= ROAD_HALF;
  }

  // Push a circle (x,z,r) out of building AABBs. Returns true if it hit something.
  function collideCircle(pos, r) {
    var hit = false;
    var list = G.city.buildings;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (pos.x > b.minX - r && pos.x < b.maxX + r && pos.z > b.minZ - r && pos.z < b.maxZ + r) {
        var dxl = pos.x - (b.minX - r);
        var dxr = (b.maxX + r) - pos.x;
        var dzl = pos.z - (b.minZ - r);
        var dzr = (b.maxZ + r) - pos.z;
        var m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) pos.x = b.minX - r;
        else if (m === dxr) pos.x = b.maxX + r;
        else if (m === dzl) pos.z = b.minZ - r;
        else pos.z = b.maxZ + r;
        hit = true;
      }
    }
    // Keep inside the playable bounds (city + beach).
    pos.x = Math.max(-118, Math.min(118, pos.x));
    pos.z = Math.max(-118, Math.min(126, pos.z));
    return hit;
  }

  // 2D line-of-sight: blocked if the segment crosses any building AABB.
  function losBlocked(x1, z1, x2, z2) {
    var list = G.city.buildings;
    var steps = 24;
    for (var s = 1; s < steps; s++) {
      var t = s / steps;
      var x = x1 + (x2 - x1) * t;
      var z = z1 + (z2 - z1) * t;
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
      }
    }
    return false;
  }

  G.city = {
    build: buildCity,
    nearestRoadCoord: nearestRoadCoord,
    isOnRoad: isOnRoad,
    collideCircle: collideCircle,
    losBlocked: losBlocked,
    ROADS: ROADS,
  };
})();
