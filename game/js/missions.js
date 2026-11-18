// Missions: three story jobs that pay off Rico's $2,800 debt.
// M1 The Pickup ($500) — drive to the docks, grab the package, return to the garage.
// M2 Lose the Heat ($800) — survive a 3-star wanted level until it clears.
// M3 The Last Run ($1,500) — timed delivery to the NW corner with police chasing.
// Finishing all three shows the "Debt Paid" ending.
(function () {
  var MISSIONS = [
    {
      title: 'M1 — THE PICKUP',
      brief: 'Pick up the package at the docks, then bring it back to the garage.',
      reward: 500,
    },
    {
      title: 'M2 — LOSE THE HEAT',
      brief: 'Three stars on you. Break line of sight and stay hidden until the heat clears.',
      reward: 800,
    },
    {
      title: 'M3 — THE LAST RUN',
      brief: 'One last delivery, across the city, with the cops on your tail. 150 seconds.',
      reward: 1500,
    },
  ];

  var markerGroup = null;
  var beacon = null;
  var diamond = null;
  var ring = null;

  function createMarker(scene) {
    markerGroup = new THREE.Group();
    var beamMat = new THREE.MeshBasicMaterial({
      color: 0xffc861, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 42, 12, 1, true), beamMat);
    beacon.position.y = 21;
    markerGroup.add(beacon);
    diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.5),
      new THREE.MeshLambertMaterial({ color: 0xffc861, emissive: 0xff9a1e, emissiveIntensity: 0.9 })
    );
    diamond.position.y = 9;
    markerGroup.add(diamond);
    ring = new THREE.Mesh(
      new THREE.RingGeometry(6.5, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    markerGroup.add(ring);
    markerGroup.visible = false;
    scene.add(markerGroup);
  }

  function setTarget(x, z) {
    G.mission.target = { x: x, z: z };
    markerGroup.position.set(x, 0, z);
    markerGroup.visible = true;
  }

  function startMission(i) {
    var m = MISSIONS[i];
    G.mission.index = i;
    G.mission.phase = 0;
    G.mission.timer = 0;
    G.mission.active = true;
    if (i === 0) {
      setTarget(G.city.docks.x, G.city.docks.z);
      G.mission.label = m.title + ': ' + m.brief;
    } else if (i === 1) {
      G.police.setWanted(3);
      markerGroup.visible = false;
      G.mission.target = null;
      G.mission.label = m.title + ': ' + m.brief;
    } else if (i === 2) {
      G.police.setWanted(2);
      setTarget(G.city.nwCorner.x, G.city.nwCorner.z);
      G.mission.timer = 150;
      G.mission.label = m.title + ': ' + m.brief;
    }
    G.hud.setObjective(G.mission.label);
    G.hud.banner(m.title);
    G.hud.toast(m.brief);
  }

  function completeMission() {
    var m = MISSIONS[G.mission.index];
    G.money += m.reward;
    G.missionsDone += 1;
    G.audio.jingle();
    G.hud.toast('JOB DONE! +$' + m.reward);
    G.hud.banner('+$' + m.reward);
    G.save.saveGame();
    markerGroup.visible = false;
    G.mission.active = false;
    if (G.missionsDone >= 3) {
      G.mission.index = 3;
      G.main.showEnding();
      return;
    }
    setTimeout(function () { startMission(G.mission.index + 1); }, 1800);
  }

  function failMission(reason) {
    G.hud.toast(reason);
    G.audio.thud();
    var i = G.mission.index;
    setTimeout(function () { startMission(i); }, 1500);
  }

  function update(dt) {
    if (!G.mission.active || G.mode !== 'playing') return;
    // Spin the marker diamond + pulse the ring.
    if (markerGroup.visible) {
      diamond.rotation.y += dt * 1.6;
      diamond.position.y = 9 + Math.sin(G.time * 2) * 0.8;
      var s = 1 + Math.sin(G.time * 3) * 0.06;
      ring.scale.set(s, s, 1);
    }
    var p = G.player.pos;
    var i = G.mission.index;
    if (i === 0) {
      var t = G.mission.target;
      var d = Math.hypot(p.x - t.x, p.z - t.z);
      if (G.mission.phase === 0) {
        if (d < 8) {
          G.mission.phase = 1;
          G.audio.blip(990, 0.15, 'sine', 0.3);
          G.hud.toast('Package secured. Get it back to the garage!');
          setTarget(G.city.garage.x, G.city.garage.z);
          G.mission.label = 'M1 — THE PICKUP: bring the package home to the garage.';
          G.hud.setObjective(G.mission.label);
        }
      } else if (d < 8) {
        completeMission();
      }
    } else if (i === 1) {
      // Completes when the wanted level fully clears.
      if (G.wanted === 0) completeMission();
    } else if (i === 2) {
      G.mission.timer -= dt;
      if (G.mission.timer <= 0) {
        failMission("Too slow — the buyer walked. Run it again.");
        return;
      }
      var t2 = G.mission.target;
      var d2 = Math.hypot(p.x - t2.x, p.z - t2.z);
      if (d2 < 8) completeMission();
    }
  }

  function init(scene) {
    createMarker(scene);
    G.mission = { index: 0, phase: 0, target: null, timer: 0, label: '', active: false };
    startMission(0);
  }

  G.missions = {
    init: init, update: update, startMission: startMission,
    completeMission: completeMission, setTarget: setTarget,
    MISSIONS: MISSIONS,
  };
})();
