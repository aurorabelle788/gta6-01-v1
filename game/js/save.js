// Save / load: localStorage keeps money, missions completed and player position.
(function () {
  var KEY = 'solmar-vice-save-v1';

  function saveGame() {
    try {
      var p = G.player;
      var data = {
        money: G.money,
        missionsDone: G.missionsDone,
        debt: G.debt,
        pos: p ? [p.pos.x, p.pos.y, p.pos.z] : [0, 0, 0],
        yaw: p ? p.yaw : 0,
        savedAt: Date.now(),
      };
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadGame() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (typeof data.money !== 'number') return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function clearSave() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  function hasSave() {
    return loadGame() !== null;
  }

  G.save = { saveGame: saveGame, loadGame: loadGame, clearSave: clearSave, hasSave: hasSave };
})();
