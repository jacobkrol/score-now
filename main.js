let players = [];
let history = [];
let isDragging = false;
let selectedPlayerIndex = null;
let pendingScore = 0;
let priorAngle = null;
let canv, ctx;
let scorePerRotation = 10;
const diskWidth = () => canv.width / 5;

let prevAngle = 0;                     // last raw angle in [-π, π]
let totalRadians = 0;                  // unwrapped signed angle accumulator

const startingPositions = [
  [], // 0 players
  [270], // 1 player
  [270, 90], // 2 players
  [240, 90, 300], // ...
  [240, 120, 300, 60], // 4
  [230, 120, 270, 60, 310], 
  [230, 130, 270, 90, 310, 50], // 6
  [216, 130, 252, 90, 288, 50, 324],
  [216, 144, 252, 108, 288, 72, 324, 36], // 8
  [202, 144, 236, 108, 270, 72, 304, 36, 338], 
  [202, 158, 236, 124, 270, 90, 304, 56, 338, 22] // 10
];
const playerColors = ["#f96363", "#7a95f1", "#f1d833", "#1cd233", "#ff38f5", "#ff9449", "#46f0f0", "#b0fd1a", "#d2d2d2", "#ca70e5"];
const rainbowsFor = ["Alyssa"];

const vibratePatterns = {
  scoreTick: 1,
  regButtonPress: 10,
  longPress: 20,
  longPressDanger: 120
};

window.onload = function() {
  // remove stray hash (to avoid rendering kroljs.com homepage)
  if (window.location.hash.length) {
    window.location.replace(window.location.href.replace(window.location.hash, ""));
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js');
  }

  document.getElementById("copyyear").innerText = new Date().getFullYear();

  canv = document.getElementsByTagName("canvas")[0];
  ctx = canv.getContext("2d");

  function resize() {
    const size = Math.min(window.innerWidth - 40, window.innerHeight - 50);
    canv.width = size;
    canv.height = size;
    if (window.innerHeight < 830) {
      document.body.style.paddingTop = "0px";
    } else {
      document.body.style.paddingTop = "";
    }
    requestAnimationFrame(resetCanvas);
  }
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(resetCanvas);

  canv.addEventListener('pointerdown', onPointerDown);
  canv.addEventListener('pointermove', onPointerMove);
  canv.addEventListener('pointerup', onPointerUp);
  
  registerHandlers();
  createGhostPlayers();

  loadActiveGame();
}

function loadActiveGame() {
  const savedPlayers = JSON.parse(localStorage.getItem("players") || "[]");
  const savedHistory = JSON.parse(localStorage.getItem("history") || "[]");
  if (savedPlayers.length > 0) {
    players = savedPlayers;
    history = savedHistory;
    updateScoreboards();
  }
}

function saveActiveGame() {
  localStorage.setItem("players", JSON.stringify(players));
  localStorage.setItem("history", JSON.stringify(history));
}

function registerHandlers() {
  // add player
  document.getElementById("add-player-btn").onclick = function() {
    navigator.vibrate(vibratePatterns.regButtonPress);
    const addPlayerModal = document.getElementById("add-player-modal");
    addPlayerModal.showModal();
  }
  document.getElementById("create-player-btn").onclick = () => {
    navigator.vibrate(vibratePatterns.regButtonPress);
    const playerName = document.getElementById("new-player-name-input").value.trim();
    document.getElementById("new-player-name-input").value = "";
    const color = playerColors.find(color => !players.some(p => p.color === color));
    const startingPosition = startingPositions[players.length + 1][players.length];
    const maxId = players.reduce((max, p) => p.id > max ? p.id : max, -1);
    players.push({id: maxId + 1, score: 0, name: playerName, color: color, startingPosition});
    players.forEach((player, index) => {
      player.startingPosition = startingPositions[players.length][index];
    });
    if (players.length == 10) {
      document.getElementById("add-player-btn").disabled = true;
      document.getElementById("add-player-btn").style.opacity = "0.6";
      document.getElementById("add-player-btn-text").innerText = "Max Players";
      document.getElementById("add-player-btn-icon").classList.remove("fa-user-plus");
      document.getElementById("add-player-btn-icon").classList.add("fa-user-xmark");
    }
    history.push({type: "add-player", data: {name: playerName, color}, timestamp: Date.now()});
    saveActiveGame();
    requestAnimationFrame(resetCanvas);
    updateScoreboards();
    const addPlayerModal = document.getElementById("add-player-modal");
    addPlayerModal.close();
  }
  document.getElementById("close-add-modal-btn").onclick = () => {
    const addPlayerModal = document.getElementById("add-player-modal");
    addPlayerModal.close();
  }

  // history
  document.getElementById("open-history-btn").onclick = function() {
    navigator.vibrate(vibratePatterns.regButtonPress);

    const historyEntriesList = document.getElementById("history-entries-list");
    historyEntriesList.innerHTML = "";

    const historyEntryTemplate = document.getElementById("history-entry-template");
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i];
      const entryElement = historyEntryTemplate.cloneNode(true);
      entryElement.querySelector(".history-timestamp").innerHTML = getHistoryTimestamp(entry);
      entryElement.querySelector(".history-description").innerHTML = getHistoryDescription(entry);
      historyEntriesList.appendChild(entryElement);
    }
    if (history.length === 0) {
      const noHistoryElem = document.createElement("div");
      noHistoryElem.className = "history-entry";
      noHistoryElem.innerHTML = `<span class="history-description">No history yet</span>`;
      historyEntriesList.appendChild(noHistoryElem);
    }

    const historyModal = document.getElementById("history-modal");
    historyModal.showModal();
  }
  document.getElementById("close-history-modal-btn").onclick = function() {
    const historyModal = document.getElementById("history-modal");
    historyModal.close();
  }
  document.getElementById("open-past-games-btn").onclick = function() {
    navigator.vibrate(vibratePatterns.regButtonPress);

    const pastGamesEntriesList = document.getElementById("past-game-entries-list");
    pastGamesEntriesList.innerHTML = "";

    const pastGamesEntryTemplate = document.getElementById("past-game-entry-template");
    const gameScores = JSON.parse(localStorage.getItem("gameScores") || "[]");
    
    if (gameScores.length === 0) {
      const noGamesElem = document.createElement("div");
      noGamesElem.className = "past-game-entry no-games";
      noGamesElem.innerHTML = `<span class="past-game-summary">No past games recorded</span>`;
      pastGamesEntriesList.appendChild(noGamesElem);
    } else {
      gameScores.sort((a, b) => a.timestamp - b.timestamp);
      for (let i = gameScores.length - 1; i >= 0; i--) {
        const game = gameScores[i];
        const entryElement = pastGamesEntryTemplate.cloneNode(true);

        entryElement.querySelector(".past-game-summary").innerText = `${game.players.length} Player${game.players.length !== 1 ? "s" : ""}`;
        const formattedTimestamp = new Date(game.timestamp).toLocaleString(undefined, {
          year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
        });
        entryElement.querySelector(".past-game-timestamp").innerText = formattedTimestamp
        entryElement.querySelector(".delete-past-game-btn").onclick = (e) => {
          navigator.vibrate(vibratePatterns.regButtonPress);
          const confirmDeleteModal = document.getElementById("confirm-past-game-delete-modal");
          const messageElem = confirmDeleteModal.querySelector(".message");
          messageElem.innerText = `Are you sure you want to delete this past game from your history?`;
          const gameDetailsElem = confirmDeleteModal.querySelector(".game-details");
          gameDetailsElem.innerText = `${game.players.length} Player${game.players.length !== 1 ? "s" : ""} - ${formattedTimestamp}`;
          confirmDeleteModal.showModal();
          document.getElementById("confirm-past-game-delete-btn").onclick = () => {
            navigator.vibrate(vibratePatterns.regButtonPress);
            gameScores.splice(i, 1);
            localStorage.setItem("gameScores", JSON.stringify(gameScores));
            entryElement.remove();
            if (gameScores.length === 0) {
              const noGamesElem = document.createElement("div");
              noGamesElem.className = "past-game-entry no-games";
              noGamesElem.innerHTML = `<span class="past-game-summary">No past games recorded</span>`;
              pastGamesEntriesList.appendChild(noGamesElem);
            }
            confirmDeleteModal.close();
          };
        };

        const scoresListElem = entryElement.querySelector(".past-game-scores-list");
        game.players.sort((a, b) => b.score - a.score);
        for (let j = 0; j < game.players.length; j++) {
          const player = game.players[j];
          const nameElem = document.createElement("span");
          nameElem.className = "past-game-score-name";
          nameElem.style.color = player.color;
          nameElem.innerHTML = player.name || "<i class='fa fa-user'></i>";
          const scoreElem = document.createElement("span");
          scoreElem.className = "past-game-score-value";
          scoreElem.innerText = player.score;
          
          scoresListElem.appendChild(nameElem);
          scoresListElem.appendChild(scoreElem);
        }
        pastGamesEntriesList.appendChild(entryElement);
      }
    }

    const historyModal = document.getElementById("history-modal");
    const pastGamesModal = document.getElementById("past-games-modal");
    historyModal.close();
    pastGamesModal.showModal();
  }

  // past game scores
  document.getElementById("close-past-games-modal-btn").onclick = function() {
    const pastGamesModal = document.getElementById("past-games-modal");
    pastGamesModal.close();
  }
  document.getElementById("close-confirm-past-game-delete-modal-btn").onclick = () => {
    const confirmDeleteModal = document.getElementById("confirm-past-game-delete-modal");
    confirmDeleteModal.close();
    const gameDetailsElem = confirmDeleteModal.querySelector(".game-details");
    gameDetailsElem.innerText = "";
    gameDetailsElem.classList.remove("empty");
  }
  document.getElementById("cancel-past-game-delete-btn").onclick = () => {
    const confirmDeleteModal = document.getElementById("confirm-past-game-delete-modal");
    confirmDeleteModal.close();
    const gameDetailsElem = confirmDeleteModal.querySelector(".game-details");
    gameDetailsElem.innerText = "";
    gameDetailsElem.classList.remove("empty");
  }
  document.getElementById("clear-past-games-btn").onclick = () => {
    navigator.vibrate(vibratePatterns.regButtonPress);
    const confirmDeleteModal = document.getElementById("confirm-past-game-delete-modal");
    const messageElem = confirmDeleteModal.querySelector(".message");
    messageElem.innerText = `Are you sure you want to delete all past games from your history?`;
    const gameDetailsElem = confirmDeleteModal.querySelector(".game-details");
    gameDetailsElem.classList.add("empty");
    confirmDeleteModal.showModal();
    document.getElementById("confirm-past-game-delete-btn").onclick = () => {
      navigator.vibrate(vibratePatterns.regButtonPress);
      localStorage.removeItem("gameScores");
      const pastGamesEntriesList = document.getElementById("past-game-entries-list");
      pastGamesEntriesList.innerHTML = "";
      const noGamesElem = document.createElement("div");
      noGamesElem.className = "past-game-entry no-games";
      noGamesElem.innerHTML = `<span class="past-game-summary">No past games recorded</span>`;
      pastGamesEntriesList.appendChild(noGamesElem);
      const dialogButtons = document.querySelector("#past-games-modal .dialog-buttons");
      dialogButtons.style.display = "none";
      confirmDeleteModal.close();
      gameDetailsElem.innerText = "";
      gameDetailsElem.classList.remove("empty");
    };
  }

  // leaderboard
  document.getElementById("open-leaderboard-btn").onclick = function() {
    navigator.vibrate(vibratePatterns.regButtonPress);

    const leaderboardEntriesList = document.getElementById("leaderboard-entries-list");
    leaderboardEntriesList.innerHTML = "";

    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    const leaderboardEntryTemplate = document.getElementById("leaderboard-entry-template");
    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];
      const rank = sortedPlayers.findIndex(p => p.score === player.score) + 1;
      const entryElement = leaderboardEntryTemplate.cloneNode(true);
      entryElement.querySelector(".leaderboard-rank").innerText = `#${rank}`;
      entryElement.querySelector(".leaderboard-name").innerHTML = player.name ? player.name : "<i class='fa fa-user'></i>";
      entryElement.querySelector(".leaderboard-name").style.color = player.color;
      entryElement.querySelector(".leaderboard-score").innerText = player.score;
      leaderboardEntriesList.appendChild(entryElement);
    }
    if (players.length === 0) {
      const noPlayersElem = document.createElement("div");
      noPlayersElem.className = "leaderboard-entry";
      noPlayersElem.innerHTML = `<span class="leaderboard-name" style="font-weight: normal">No current players</span>`;
      leaderboardEntriesList.appendChild(noPlayersElem);
    }

    const leaderboardModal = document.getElementById("leaderboard-modal");
    leaderboardModal.showModal();
  }
  document.getElementById("close-leaderboard-modal-btn").onclick = function() {
    const leaderboardModal = document.getElementById("leaderboard-modal");
    leaderboardModal.close();
  }

  // reset
  document.getElementById("reset-game-btn").onclick = function() {
    navigator.vibrate(vibratePatterns.regButtonPress);
    const resetGameModal = document.getElementById("reset-game-modal");
    resetGameModal.showModal();
  };
  const resetGameButton = document.getElementById("full-reset-btn");
  resetGameButton.addEventListener('pointerdown', startButtonLongPress);
  resetGameButton.addEventListener('pointerup', endButtonLongPress);
  resetGameButton.addEventListener('pointercancel', endButtonLongPress);

  const resetScoresButton = document.getElementById("reset-scores-btn");;
  resetScoresButton.addEventListener('pointerdown', startButtonLongPress);
  resetScoresButton.addEventListener('pointerup', endButtonLongPress);
  resetScoresButton.addEventListener('pointercancel', endButtonLongPress);

  document.getElementById("cancel-reset-btn").onclick = () => {
    const resetGameModal = document.getElementById("reset-game-modal");
    resetGameModal.close();
  };
  document.getElementById("close-reset-modal-btn").onclick = () => {
    const resetGameModal = document.getElementById("reset-game-modal");
    resetGameModal.close();
  };
}

function getHistoryDescription(entry) {
  switch (entry.type) {
    case "add-player":
      return `Added <strong><span style="color: ${entry.data.color}">${entry.data.name || "<i class='fa fa-user'></i>"}</span></strong>`;
    case "delete-player":
      return `Removed <strong><span style="color: ${entry.data.color}">${entry.data.name || "<i class='fa fa-user'></i>"}</span></strong> <span class="weak">(${entry.data.oldScore})</span>`;
    case "rename-player":
      return `Renamed <strong><span style="color: ${entry.data.color}">${entry.data.oldName || "<i class='fa fa-user'></i>"}</span></strong> to <strong><span style="color: ${entry.data.color}">${entry.data.newName || "<i class='fa fa-user'></i>"}</span></strong>`;
    case "score-update":
      return `<strong><span style="color: ${entry.data.color}">${entry.data.playerName || "<i class='fa fa-user'></i>"}</span></strong> <span class="weak">(${entry.data.oldScore})</span> <strong><span style="color: ${entry.data.color}">${entry.data.pendingScore >= 0 ? "+" : "-"}${Math.abs(entry.data.pendingScore)}</span></strong>`;
    default:
      return "Unknown action";
  }
}

function getHistoryTimestamp(entry) {
  // return "xs ago" format
  const now = Date.now();
  const deltaSeconds = Math.floor((now - entry.timestamp) / 1000);
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  } else if (deltaSeconds < 3600) {
    const minutes = Math.floor(deltaSeconds / 60);
    return `${minutes}m ago`;
  } else if (deltaSeconds < 86400) {
    const hours = Math.floor(deltaSeconds / 3600);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(deltaSeconds / 86400);
    return `${days}d ago`;
  }
}

function createGhostPlayers() {
  const topBoard = document.getElementById("top-scoreboard");
  const bottomBoard = document.getElementById("bottom-scoreboard");
  const ghost1 = getGhostPlayer();
  const ghost2 = getGhostPlayer();
  topBoard.appendChild(ghost1);
  bottomBoard.appendChild(ghost2);
}

function getGhostPlayer() {
  const playerTemplate = document.getElementById("player-template");
  const ghostElem = playerTemplate.cloneNode(true);
  ghostElem.id = `player-ghost`;
  ghostElem.querySelector(".player-name").innerText = "Ghost";
  ghostElem.querySelector(".player-score").innerText = "0";
  ghostElem.style.visibility = "hidden";
  ghostElem.style.pointerEvents = "none";
  return ghostElem;
}

function updateScoreboards() {
  const topBoard = document.getElementById("top-scoreboard");
  const bottomBoard = document.getElementById("bottom-scoreboard");
  topBoard.innerHTML = "";
  bottomBoard.innerHTML = "";

  if (players.length === 0) {
    topBoard.appendChild(getGhostPlayer());
    bottomBoard.appendChild(getGhostPlayer());
    return;
  } else if (players.length === 1) {
    bottomBoard.appendChild(getGhostPlayer());
  }

  const playerTemplate = document.getElementById("player-template");
  players.forEach((player, index) => {
    const playerElem = playerTemplate.cloneNode(true);
    playerElem.id = `player-${player.id}`;
    playerElem.querySelector(".player-name").innerText = player.name;
    playerElem.querySelector(".player-score").innerText = player.score;
    playerElem.style.color = player.color;
    playerElem.addEventListener('pointerdown', startPlayerLongPress);
    playerElem.addEventListener('pointerup', endPlayerLongPress);
    playerElem.addEventListener('pointercancel', endPlayerLongPress);
    if (index % 2 === 0) {
      topBoard.appendChild(playerElem);
    } else {
      bottomBoard.appendChild(playerElem);
    }
  });
}

function resetCanvas() {
  clearCanvas();
  drawBlankDisk();
  for (let i = 0; i < players.length; i++) {
    drawPlayerDot(i);
  }
}

function clearCanvas() {
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, canv.width, canv.height);
}

function drawBlankDisk() {
  ctx.strokeStyle = "#666";
  ctx.lineWidth = diskWidth();
  ctx.beginPath();
  ctx.arc(canv.width / 2, canv.height / 2, canv.width / 2 - diskWidth() / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.closePath();
}

function drawPlayerDot(playerIndex, mousePosition = null, currentAnimatingAngle = null) {
  const startingPosAngle = players[playerIndex].startingPosition * Math.PI / 180;
  const diskRadius = canv.width / 2 - diskWidth() / 2;
  const defaultPosition = {
    x: canv.width / 2 + Math.cos(startingPosAngle) * diskRadius,
    y: canv.height / 2 + Math.sin(startingPosAngle) * diskRadius
  };

  // if mouse position, draw trail with gradient along the disk arc from start position to mouse position
  if (mousePosition) {
    const currentPosAngle = Math.atan2(mousePosition.y - canv.height / 2, mousePosition.x - canv.width / 2);
    const angleDelta = shortestAngleDelta(startingPosAngle, currentPosAngle);

    const gradient = ctx.createConicGradient(currentPosAngle, canv.width / 2, canv.height / 2);
    
    if (rainbowsFor.includes(players[playerIndex].name)) {
      gradient.addColorStop(0.100, "#8b00ff");
      gradient.addColorStop(0.166, "#4b0082");
      gradient.addColorStop(0.333, "#00ffff");
      gradient.addColorStop(0.5, "#00ff00");
      gradient.addColorStop(0.666, "#ffff00");
      gradient.addColorStop(0.833, "#ff7f00");
      gradient.addColorStop(0.900, "#ff0000");
      if (totalRadians > 0) {
        gradient.addColorStop(0.001, "#8b00ff");
      } else {
        gradient.addColorStop(1, "#ff0000");
      }
    }
    if (totalRadians > 0) {
      gradient.addColorStop(0, players[playerIndex].color + "22");
      gradient.addColorStop(1, players[playerIndex].color + "ff");
    } else {
      gradient.addColorStop(0, players[playerIndex].color + "ff");
      gradient.addColorStop(1, players[playerIndex].color + "22");
    }

    

    ctx.strokeStyle = gradient;
    ctx.beginPath();
    ctx.lineWidth = diskWidth();
    ctx.lineCap = "round";
    const isFullRotation = (isDragging && Math.abs(totalRadians) >= Math.PI * 2) || (currentAnimatingAngle !== null && Math.abs(currentAnimatingAngle) >= Math.PI * 2);
    ctx.arc(canv.width / 2, canv.height / 2, diskRadius, startingPosAngle + (isFullRotation ? angleDelta + (totalRadians > 0 ? 0.001 : -0.001) : 0), startingPosAngle + angleDelta, totalRadians < 0);
    ctx.stroke();
    ctx.closePath();
  }

  // draw dot
  ctx.fillStyle = players[playerIndex].color;
  ctx.beginPath();
  ctx.arc(mousePosition?.x ?? defaultPosition.x, mousePosition?.y ?? defaultPosition.y, diskWidth() / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.closePath();
}

// Returns signed smallest angular delta from a->b, in (-π, π]
function shortestAngleDelta(prev, next) {
  let d = next - prev;
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

function updatePlayerName(playerId, newName) {
  const player = players.find(p => `player-${p.id}` === playerId);
  if (player) {
    const oldName = player.name;
    player.name = newName;
    document.getElementById(playerId).querySelector(".player-name").innerText = newName;
    history.push({type: "rename-player", data: {oldName, newName, color: player.color}, timestamp: Date.now()});
  }
}

function startPlayerLongPress(event) {
  // capture values for closure
  const id = event.currentTarget.id;
  const initialName = players.find(p => `player-${p.id}` === id).name;
  const longPressDuration = 600; // ms
  
  // start ring indicator
  const playerElement = event.currentTarget;
  const ring = document.getElementById("ring-template").cloneNode(true);
  ring.id = `player-${id}-ring`;
  ring.style.setProperty('--duration', `${longPressDuration}ms`);
  ring.style.setProperty('--path-length', ring.querySelector("path").getTotalLength());
  ring.style.width = playerElement.offsetHeight - 5;
  playerElement.appendChild(ring);

  // start timer
  navigator.vibrate(vibratePatterns.longPress);
  event.currentTarget.longPressTimer = setTimeout(() => {
    const editPlayerModal = document.getElementById("edit-player-modal");
    editPlayerModal.showModal();
    document.getElementById("player-name-input").value = initialName;

    // edit player handlers
    document.getElementById("save-player-btn").onclick = () => {
      navigator.vibrate(vibratePatterns.regButtonPress);
      const newName = document.getElementById("player-name-input").value.trim();
      updatePlayerName(id, newName);
      saveActiveGame();
      editPlayerModal.close();
    };
    document.getElementById("close-edit-modal-btn").onclick = () => {
      editPlayerModal.close();
    };
    document.getElementById("delete-player-btn").onclick = () => {
      navigator.vibrate(vibratePatterns.regButtonPress);
      const confirmModal = document.getElementById("confirm-delete-modal");
      editPlayerModal.close();
      confirmModal.showModal();
      document.getElementById("confirm-delete-player-name").innerText = initialName || "this player";

      // confirm delete handlers
      document.getElementById("confirm-delete-btn").onclick = () => {
        navigator.vibrate(vibratePatterns.regButtonPress);
        const initialPlayer = players.find(p => `player-${p.id}` === id);
        players = players.filter(p => `player-${p.id}` !== id);
        players.forEach((player, index) => {
          player.startingPosition = startingPositions[players.length][index];
        });
        if (players.length < 10) {
          document.getElementById("add-player-btn").disabled = false;
          document.getElementById("add-player-btn").style.opacity = "1.0";
          document.getElementById("add-player-btn-text").innerText = "Player";
          document.getElementById("add-player-btn-icon").classList.remove("fa-user-xmark");
          document.getElementById("add-player-btn-icon").classList.add("fa-user-plus");
        }
        history.push({type: "delete-player", data: {name: initialPlayer.name, color: initialPlayer.color, oldScore: initialPlayer.score}, timestamp: Date.now()});
        saveActiveGame();
        updateScoreboards();
        requestAnimationFrame(resetCanvas);
        confirmModal.close();
        editPlayerModal.close();
      };
      document.getElementById("cancel-delete-btn").onclick = () => {
        confirmModal.close();
        editPlayerModal.showModal();
      };
      document.getElementById("close-delete-modal-btn").onclick = () => {
        confirmModal.close();
        editPlayerModal.showModal();
      };
    }
  }, longPressDuration);
}

function endPlayerLongPress(event) {
  clearTimeout(event.currentTarget.longPressTimer);
  const ring = document.getElementById(`player-${event.currentTarget.id}-ring`);
  if (ring) {
    ring.remove();
  }
}

function startButtonLongPress(event) {
  const longPressDuration = 1200; // ms
  // fill background left to right over duration
  const buttonElement = event.currentTarget;
  const fillElement = buttonElement.querySelector(".btn-fill");
  fillElement.style.setProperty('--duration', `${longPressDuration - 200}ms`);
  fillElement.classList.add("fill");

  // start timer
  navigator.vibrate(vibratePatterns.longPressDanger);
  event.currentTarget.longPressTimer = setTimeout(() => {
    if (buttonElement.id === "full-reset-btn") {
      const pastGames = JSON.parse(localStorage.getItem("gameScores") || "[]");
      pastGames.push({players: players.map(p => ({name: p.name, color: p.color, score: p.score})), timestamp: Date.now()});
      localStorage.setItem("gameScores", JSON.stringify(pastGames));
      players = [];
      history = [];
      saveActiveGame(); // after game reset
      updateScoreboards();
      requestAnimationFrame(resetCanvas);
    } else if (buttonElement.id === "reset-scores-btn") {
      const pastGames = JSON.parse(localStorage.getItem("gameScores") || "[]");
      pastGames.push({players: players.map(p => ({name: p.name, color: p.color, score: p.score})), timestamp: Date.now()});
      localStorage.setItem("gameScores", JSON.stringify(pastGames));
      players.forEach(p => p.score = 0);
      history = [];
      saveActiveGame(); // after score reset
      updateScoreboards();
      requestAnimationFrame(resetCanvas);
    }
    const resetGameModal = document.getElementById("reset-game-modal");
    resetGameModal.close();
  }, longPressDuration);
}

function endButtonLongPress(event) {
  clearTimeout(event.currentTarget.longPressTimer);
  const buttonElement = event.currentTarget;
  if (buttonElement) {
    const fillElement = buttonElement.querySelector(".btn-fill");
    if (fillElement) {
      fillElement.classList.remove("fill");
      fillElement.style.width = "0%";
    }
  }
}

function onPointerDown(event) {
  event.preventDefault();

  canv.setPointerCapture(event.pointerId); // keep receiving moves even if pointer leaves
  const rect = canv.getBoundingClientRect();
  const posX = event.clientX - rect.left;
  const posY = event.clientY - rect.top;

  for (let i = 0; i < players.length; i++) {
    const angle = players[i].startingPosition * Math.PI / 180;
    const x = canv.width / 2 + Math.cos(angle) * (canv.width / 2 - diskWidth() / 2);
    const y = canv.height / 2 + Math.sin(angle) * (canv.height / 2 - diskWidth() / 2);
    const dx = posX - x;
    const dy = posY - y;
    if (Math.sqrt(dx * dx + dy * dy) > diskWidth() / 2) continue;
  
    // select this player and initialize drag state
    selectedPlayerIndex = i;
    prevAngle = 0;
    totalRadians = 0;
    pendingScore = 0;
    isDragging = true;
    document.getElementById("pending-score").style.color = players[i].color;
    document.querySelectorAll(".player:not(#player-" + players[i].id + ")").forEach(elem => {
      elem.style.opacity = "0.4";
    });
    break;
  }
}

function onPointerMove(event) {
  if (selectedPlayerIndex === null || !isDragging) return;

  // get angle of pointer
  const rect = canv.getBoundingClientRect();
  const posX = event.clientX - rect.left;
  const posY = event.clientY - rect.top;
  const playerStartingAngle = players[selectedPlayerIndex].startingPosition * Math.PI / 180;
  const angle = Math.atan2(posY - canv.height / 2, posX - canv.width / 2) - playerStartingAngle;

  // recalculate pending score
  const d = shortestAngleDelta(prevAngle, angle);
  totalRadians += d;
  prevAngle = angle;
  const rotations = totalRadians / (Math.PI * 2);
  const newScore = Math.floor(rotations * scorePerRotation);
  if (newScore !== pendingScore) {
    navigator.vibrate(vibratePatterns.scoreTick);
  }
  pendingScore = newScore;

  // update pending score display
  document.getElementById("pending-score").innerText = `${pendingScore < 0 ? "-" : "+"} ${Math.abs(pendingScore)}`;

  // paint canvas
  const diskRadius = canv.width / 2 - diskWidth() / 2;
  const dotPos = {
    x: canv.width / 2 + Math.cos(angle + playerStartingAngle) * diskRadius,
    y: canv.height / 2 + Math.sin(angle + playerStartingAngle) * diskRadius
  };
  drawBlankDisk();
  drawPlayerDot(selectedPlayerIndex, dotPos);
}

function onPointerUp(event) {
  if (selectedPlayerIndex === null) return;
  isDragging = false;
  animateScoreCapture();
}

function animateScoreCapture() {
  // ease player dot back to original position
  const startAngle = totalRadians;
  const direction = totalRadians >= 0 ? 1 : -1;
  const planckRadians = 21 * Math.PI / 180; // < 21 degrees breaks the animation calculation
  if (Math.abs(totalRadians) < planckRadians) {
    totalRadians = direction * planckRadians;
  }
  const endAngle = 0;
  const duration = Math.log(direction * totalRadians) * 300 + 400; // ms
  const startTime = performance.now();
  function animate(time) {
    const elapsed = time - startTime;
    const t = Math.min(elapsed / duration, 1);
    const easedT = t * (2 - t);
    const currentAngle = startAngle + direction * (endAngle - direction * startAngle) * easedT;
    const playerStartingAngle = players[selectedPlayerIndex].startingPosition * Math.PI / 180;
    const diskRadius = canv.width / 2 - diskWidth() / 2;
    const dotPos = {
      x: canv.width / 2 + Math.cos(currentAngle + playerStartingAngle) * diskRadius,
      y: canv.height / 2 + Math.sin(currentAngle + playerStartingAngle) * diskRadius
    };
    drawBlankDisk();
    drawPlayerDot(selectedPlayerIndex, dotPos, currentAngle);
    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      finalizeScoreCapture();
    }
  }
  requestAnimationFrame(animate);
}

function finalizeScoreCapture() {
  // update history and player score
  history.push({type: "score-update", data: {playerName: players[selectedPlayerIndex].name, color: players[selectedPlayerIndex].color, pendingScore, oldScore: players[selectedPlayerIndex].score}, timestamp: Date.now()});
  players[selectedPlayerIndex].score += pendingScore;
  saveActiveGame();

  // update player score display
  document.getElementById(`player-${players[selectedPlayerIndex].id}`).querySelector(".player-score").innerText = players[selectedPlayerIndex].score;
  document.querySelectorAll(".player").forEach(elem => {
    elem.style.opacity = "1.0";
  });

  // reset state
  selectedPlayerIndex = null;
  isDragging = false;
  pendingScore = 0;
  prevAngle = 0;
  document.getElementById("pending-score").innerText = "";
  resetCanvas();
}
