// Sound: WebAudio synthesized only (no audio files). Engine hum follows speed,
// police siren is two-tone, plus pickup blip, punch thud and mission jingle.
(function () {
  var ctx = null;
  var engineOsc = null;
  var engineGain = null;
  var sirenOsc = null;
  var sirenGain = null;
  var sirenHi = false;
  var sirenTimer = 0;
  var master = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = G.muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine hum: low sawtooth through a lowpass, gain by speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      var filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filt);
      filt.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: square wave, frequency toggled two-tone.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 660;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function blip(freq, dur, type, vol) {
    if (!ensure() || G.muted) return;
    try {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq || 660;
      g.gain.setValueAtTime(vol || 0.25, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (dur || 0.12));
      o.connect(g);
      g.connect(master);
      o.start();
      o.stop(ctx.currentTime + (dur || 0.12) + 0.02);
    } catch (e) {}
  }

  function thud() {
    if (!ensure() || G.muted) return;
    try {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.14);
      g.gain.setValueAtTime(0.5, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      o.connect(g);
      g.connect(master);
      o.start();
      o.stop(ctx.currentTime + 0.2);
    } catch (e) {}
  }

  function jingle() {
    if (!ensure()) return;
    var notes = [523, 659, 784, 1047];
    notes.forEach(function (f, i) {
      setTimeout(function () { blip(f, 0.22, 'triangle', 0.3); }, i * 110);
    });
  }

  function setMuted(m) {
    G.muted = m;
    if (master && ctx) master.gain.value = m ? 0 : 0.5;
  }

  function update(dt) {
    if (!ctx) return;
    var p = G.player;
    if (!p) return;
    // Engine hum follows the player's car speed (or 0 on foot).
    var speed = p.inCar ? Math.abs(p.inCar.speed) : 0;
    if (engineOsc && engineGain) {
      engineOsc.frequency.value = 50 + speed * 5.5;
      engineGain.gain.value = G.mode === 'playing' ? Math.min(0.09, 0.02 + speed * 0.003) : 0;
    }
    // Siren while wanted >= 1 and police are near.
    if (sirenOsc && sirenGain) {
      var want = G.wanted > 0 && G.mode === 'playing';
      sirenGain.gain.value = want ? 0.045 : 0;
      if (want) {
        sirenTimer += dt;
        if (sirenTimer > 0.45) {
          sirenTimer = 0;
          sirenHi = !sirenHi;
          sirenOsc.frequency.value = sirenHi ? 880 : 660;
        }
      }
    }
  }

  G.audio = {
    resume: resume, blip: blip, thud: thud, jingle: jingle,
    setMuted: setMuted, update: update,
  };
})();
