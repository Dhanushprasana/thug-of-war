(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const screens = {
    home: $("#home-screen"),
    monitor: $("#monitor-screen"),
    player: $("#player-screen"),
  };
  const connectionIndicator = $("#connection-indicator");
  const connectionLabel = $("#connection-label");
  const homeError = $("#home-error");
  const answers = { blue: "", red: "" };
  const targetPulls = 5;

  let peer = null;
  let hostPeer = null;
  let playerConnection = null;
  let selectedTeam = "blue";
  let currentRole = null;
  let roomCode = "";
  let localTeam = null;
  let hostState = null;
  let latestState = null;
  let answerInput = "";

  function showScreen(name) {
    Object.entries(screens).forEach(([key, screen]) => {
      screen.hidden = key !== name;
    });
    connectionIndicator.hidden = name === "home";
    if (name !== "home") homeError.hidden = true;
  }

  function setConnection(text, connected) {
    connectionLabel.textContent = text;
    connectionIndicator.classList.toggle("is-connected", Boolean(connected));
  }

  function showError(message) {
    homeError.textContent = message;
    homeError.hidden = false;
  }

  function makeQuestion() {
    const operation = Math.random() < 0.5 ? "+" : "−";
    let first = Math.floor(Math.random() * 9) + 1;
    let second = Math.floor(Math.random() * 9) + 1;
    if (operation === "−" && second > first) [first, second] = [second, first];
    return {
      text: `${first} ${operation} ${second} = ?`,
      answer: operation === "+" ? first + second : first - second,
    };
  }

  function createInitialState(code) {
    return {
      room: code,
      status: "waiting",
      position: 0,
      target: targetPulls,
      players: { blue: null, red: null },
      questions: { blue: null, red: null },
      message: "Share the room code with both players.",
    };
  }

  function broadcastState() {
    if (!hostPeer || !hostState) return;
    Object.values(hostState.players).forEach((player) => {
      if (player && player.connection.open) {
        player.connection.send({ type: "state", state: publicState(player.team) });
      }
    });
    renderMonitor(hostState);
  }

  function publicState(team) {
    return {
      room: hostState.room,
      status: hostState.status,
      position: hostState.position,
      target: hostState.target,
      players: {
        blue: hostState.players.blue ? { name: hostState.players.blue.name } : null,
        red: hostState.players.red ? { name: hostState.players.red.name } : null,
      },
      question: hostState.questions[team] ? hostState.questions[team].text : null,
      questionVersion: hostState.questions[team] ? hostState.questions[team].version : 0,
      message: hostState.message,
      winner: hostState.winner || null,
    };
  }

  function setQuestion(team) {
    const question = makeQuestion();
    const previousVersion = hostState.questions[team] ? hostState.questions[team].version : 0;
    hostState.questions[team] = { ...question, version: previousVersion + 1, locked: false };
    answers[team] = "";
  }

  function renderMonitor(state) {
    const blue = state.players.blue;
    const red = state.players.red;
    const bluePulls = Math.max(0, state.position);
    const redPulls = Math.max(0, -state.position);
    $("#monitor-room-code").textContent = state.room;
    $("#blue-score").textContent = bluePulls;
    $("#red-score").textContent = redPulls;
    $("#blue-player-name").textContent = blue ? blue.name : "Waiting for player";
    $("#red-player-name").textContent = red ? red.name : "Waiting for player";
    $("#blue-question").textContent = state.questions.blue ? state.questions.blue.text : "Ready?";
    $("#red-question").textContent = state.questions.red ? state.questions.red.text : "Ready?";
    $("#monitor-message").textContent = state.message;
    $("#player-count").textContent = `${Number(Boolean(blue)) + Number(Boolean(red))} of 2 players connected`;
    $("#start-game").disabled = !(blue && red) || state.status === "playing";
    $("#start-game").textContent = state.status === "finished" ? "Play again" : "Start game";

    const status = $("#game-status");
    if (state.status === "playing") status.textContent = "Game on!";
    else if (state.status === "finished") status.textContent = `${state.winner === "blue" ? "Blue" : "Red"} team wins!`;
    else status.textContent = blue && red ? "Ready to play" : "Waiting for players";

    const percent = 50 + (state.position / state.target) * 40;
    $("#rope-marker").style.setProperty("--rope-position", `${Math.max(10, Math.min(90, percent))}%`);
  }

  function renderPlayer(state) {
    latestState = state;
    $("#player-room-code").textContent = state.room;
    $("#player-welcome").textContent = `${localTeam === "blue" ? "Blue" : "Red"} team, let's go!`;
    $("#player-team-label").textContent = `${localTeam.toUpperCase()} TEAM`;
    $("#player-team-label").style.color = localTeam === "blue" ? "var(--blue)" : "var(--red)";
    $("#player-score").textContent = Math.max(0, localTeam === "blue" ? state.position : -state.position);

    const playing = state.status === "playing";
    const finished = state.status === "finished";
    $("#player-waiting").hidden = playing || finished;
    $("#player-play-area").hidden = !playing;
    $("#player-finished").hidden = !finished;
    if (finished) {
      $("#winner-message").textContent = `${state.winner === localTeam ? "Your team wins!" : `${state.winner === "blue" ? "Blue" : "Red"} team wins!`}`;
    }

    if (playing) {
      const questionChanged = $("#player-question").dataset.version !== String(state.questionVersion);
      $("#player-question").textContent = state.question || "—";
      $("#player-question").dataset.version = String(state.questionVersion);
      if (questionChanged) {
        answerInput = "";
        updateAnswerDisplay();
        const feedback = $("#player-feedback");
        feedback.textContent = "Get it right to pull the rope!";
        feedback.className = "player-feedback";
      }
    }
    $("#player-waiting h2").textContent = state.players.blue && state.players.red ? "Get ready!" : "Waiting for the other player";
    $("#player-waiting p").textContent = state.players.blue && state.players.red
      ? "The host is about to start the game."
      : "The host will start the game when both teams are ready.";
  }

  function handlePlayerMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "state") {
      setConnection("Connected", true);
      renderPlayer(message.state);
    } else if (message.type === "feedback") {
      const feedback = $("#player-feedback");
      feedback.textContent = message.text;
      feedback.className = `player-feedback ${message.correct ? "is-correct" : "is-wrong"}`;
      const display = $("#answer-display");
      display.classList.toggle("is-correct", Boolean(message.correct));
      display.classList.toggle("is-wrong", !message.correct);
    } else if (message.type === "reject") {
      showError(message.text || "That team is already taken. Choose the other team.");
      playerConnection.close();
      currentRole = null;
      showScreen("home");
    }
  }

  function handleHostAnswer(connection, message) {
    const side = connection.team;
    if (!side || hostState.status !== "playing") return;
    const question = hostState.questions[side];
    if (!question || question.locked) return;
    if (typeof message.answer !== "string" || !/^\d{1,2}$/.test(message.answer)) return;

    if (message.answer !== String(question.answer)) {
      connection.send({ type: "feedback", correct: false, text: "Not quite — try another answer." });
      return;
    }

    question.locked = true;
    hostState.position += side === "blue" ? 1 : -1;
    const winner = hostState.position >= hostState.target ? "blue"
      : hostState.position <= -hostState.target ? "red" : null;
    if (winner) {
      hostState.status = "finished";
      hostState.winner = winner;
      hostState.message = `${winner === "blue" ? "Blue" : "Red"} team wins!`;
    } else {
      hostState.message = `${hostState.players[side].name} pulled for ${side} team!`;
      setQuestion(side);
    }
    const feedback = {
      type: "feedback",
      correct: true,
      text: winner ? "Great answer! The game is over." : "Correct! You pulled the rope!",
    };
    broadcastState();
    connection.send(feedback);
  }

  function acceptPlayer(connection, message) {
    if (!message || message.type !== "join" || !["blue", "red"].includes(message.team)) return;
    const side = message.team;
    if (hostState.players[side]) {
      connection.send({ type: "reject", text: "That team already has a player. Please choose the other team." });
      return;
    }

    const name = String(message.name || "Player").trim().slice(0, 18) || "Player";
    connection.team = side;
    hostState.players[side] = { name, connection, team: side };
    connection.send({ type: "state", state: publicState(side) });
    if (hostState.players.blue && hostState.players.red && hostState.status === "waiting") {
      hostState.message = "Both teams are here! Start when ready.";
    }
    broadcastState();
  }

  function hostRoom(code) {
    if (!window.Peer) {
      showError("Could not load the room connection library. Check your internet connection and reload.");
      return;
    }
    currentRole = "monitor";
    roomCode = code;
    hostState = createInitialState(code);
    hostPeer = new Peer(`tow-${code.toLowerCase()}-monitor`);
    setConnection("Opening room…", false);
    showScreen("monitor");
    renderMonitor(hostState);

    hostPeer.on("open", () => {
      setConnection("Room is open", true);
    });
    hostPeer.on("connection", (connection) => {
      connection.on("data", (message) => {
        if (message && message.type === "join") acceptPlayer(connection, message);
        else if (message && message.type === "answer") handleHostAnswer(connection, message);
      });
      connection.on("close", () => {
        const side = connection.team;
        if (side && hostState.players[side] && hostState.players[side].connection === connection) {
          hostState.players[side] = null;
          if (hostState.status !== "finished") hostState.status = "waiting";
          hostState.message = `${side === "blue" ? "Blue" : "Red"} player disconnected.`;
          broadcastState();
        }
      });
      connection.on("error", (error) => console.error("Player connection error:", error));
    });
    hostPeer.on("error", (error) => {
      console.error("Room connection error:", error);
      if (error.type === "unavailable-id") {
        setConnection("Room code already in use", false);
        hostState.message = "That room code is already active. End that room or try again.";
        renderMonitor(hostState);
      } else {
        setConnection("Connection problem", false);
        hostState.message = `Connection problem: ${error.message || error.type}`;
        renderMonitor(hostState);
      }
    });
  }

  function joinRoom(code, name, team) {
    if (!window.Peer) {
      showError("Could not load the room connection library. Check your internet connection and reload.");
      return;
    }
    currentRole = "player";
    roomCode = code;
    localTeam = team;
    peer = new Peer();
    setConnection("Connecting…", false);
    showScreen("player");
    $("#player-room-code").textContent = code;
    $("#player-welcome").textContent = `${team === "blue" ? "Blue" : "Red"} team, let's go!`;

    peer.on("open", () => {
      const connection = peer.connect(`tow-${code.toLowerCase()}-monitor`, { reliable: true });
      playerConnection = connection;
      connection.on("open", () => {
        setConnection("Connected", true);
        connection.send({ type: "join", name, team });
      });
      connection.on("data", handlePlayerMessage);
      connection.on("close", () => {
        setConnection("Disconnected", false);
        $("#player-waiting h2").textContent = "Connection lost";
        $("#player-waiting p").textContent = "The room host may have ended the game. Please return home and try again.";
        $("#player-waiting").hidden = false;
        $("#player-play-area").hidden = true;
      });
      connection.on("error", (error) => {
        console.error("Game connection error:", error);
        showError("Could not connect to that room. Check the code and try again.");
        showScreen("home");
        currentRole = null;
      });
    });
    peer.on("error", (error) => {
      console.error("Peer connection error:", error);
      if (error.type === "peer-unavailable") {
        showError("Room not found. Make sure the monitor is open and the code is correct.");
      } else {
        showError(`Could not connect: ${error.message || error.type}`);
      }
      showScreen("home");
      currentRole = null;
    });
  }

  function updateAnswerDisplay() {
    const display = $("#answer-display");
    display.textContent = answerInput || "Enter your answer";
    display.classList.toggle("has-value", Boolean(answerInput));
    if (!display.classList.contains("is-correct")) display.classList.remove("is-wrong");
  }

  function submitAnswer() {
    if (!answerInput || !playerConnection || !playerConnection.open || !latestState || latestState.status !== "playing") return;
    playerConnection.send({ type: "answer", answer: answerInput });
  }

  function leaveRoom() {
    if (playerConnection) playerConnection.close();
    if (peer) peer.destroy();
    peer = null;
    playerConnection = null;
    currentRole = null;
    latestState = null;
    answerInput = "";
    setConnection("", false);
    showScreen("home");
  }

  function endRoom() {
    if (hostPeer) hostPeer.destroy();
    hostPeer = null;
    hostState = null;
    currentRole = null;
    setConnection("", false);
    showScreen("home");
  }

  $("#create-room").addEventListener("click", () => {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "0");
    hostRoom(code);
  });

  document.querySelectorAll(".team-choice").forEach((button) => {
    button.addEventListener("click", () => {
      selectedTeam = button.dataset.team;
      document.querySelectorAll(".team-choice").forEach((choice) => {
        const selected = choice === button;
        choice.classList.toggle("selected", selected);
        choice.setAttribute("aria-pressed", String(selected));
      });
    });
  });

  $("#join-room").addEventListener("click", () => {
    const code = $("#room-code").value.trim().toUpperCase();
    const name = $("#player-name").value.trim() || "Player";
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      showError("Enter the 6-character room code shown on the monitor.");
      return;
    }
    joinRoom(code, name, selectedTeam);
  });

  $("#room-code").addEventListener("input", (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  });
  $("#room-code").addEventListener("keydown", (event) => {
    if (event.key === "Enter") $("#join-room").click();
  });
  $("#player-name").addEventListener("keydown", (event) => {
    if (event.key === "Enter") $("#join-room").click();
  });

  $("#start-game").addEventListener("click", () => {
    if (!hostState || !hostState.players.blue || !hostState.players.red) return;
    hostState.status = "playing";
    hostState.position = 0;
    hostState.winner = null;
    hostState.message = "Solve your question to pull your team!";
    setQuestion("blue");
    setQuestion("red");
    broadcastState();
  });

  $("#end-room").addEventListener("click", endRoom);
  $("#leave-room").addEventListener("click", leaveRoom);
  document.querySelectorAll(".key").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.key;
      if (key === "clear") answerInput = answerInput.slice(0, -1);
      else if (key === "submit") {
        submitAnswer();
        return;
      } else if (answerInput.length < 2) answerInput += key;
      updateAnswerDisplay();
    });
  });

  window.addEventListener("keydown", (event) => {
    if (currentRole !== "player" || latestState?.status !== "playing") return;
    if (/^\d$/.test(event.key) && answerInput.length < 2) answerInput += event.key;
    else if (event.key === "Backspace") answerInput = answerInput.slice(0, -1);
    else if (event.key === "Enter") submitAnswer();
    else return;
    updateAnswerDisplay();
  });
})();
