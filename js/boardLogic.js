// Stockfish WASM engine (runs locally in a Web Worker)
const stockfish = new Worker("js/stockfish-18-lite-single.js");
let engineReady = false;
let pendingEval = "0";

const ENGINE_MOVE_DELAY_MS = 400;

stockfish.onmessage = function (event) {
  const line = typeof event === "string" ? event : event.data;
  if (typeof line !== "string") return;

  if (line === "uciok") {
    stockfish.postMessage("isready");
  }

  if (line === "readyok") {
    engineReady = true;
  }

  // Capture evaluation from info lines, normalized to white's perspective
  if (line.startsWith("info") && line.includes(" score ")) {
    const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
    if (scoreMatch) {
      if (scoreMatch[1] === "cp") {
        let cp = parseInt(scoreMatch[2]);
        if (game.turn() === "b") cp = -cp;
        pendingEval = String(cp);
      } else {
        let mateIn = parseInt(scoreMatch[2]);
        if (game.turn() === "b") mateIn = -mateIn;
        pendingEval = (mateIn < 0 ? "-" : "") + "M" + Math.abs(mateIn);
      }
    }
  }

  if (line.startsWith("bestmove")) {
    const bestMove = line.split(" ")[1];
    if (bestMove && bestMove !== "(none)") {
      setTimeout(function () {
        const move = game.move(bestMove, { sloppy: true });
        board.position(game.fen());
        updateEvaluationBar(pendingEval);
        updateStatus();
        const naturalLanguageMove = convertEngineMoveToNaturalLanguage(move);
        $(".loading").removeClass("active");
        speak("I move " + naturalLanguageMove);
      }, ENGINE_MOVE_DELAY_MS);
    } else {
      $(".loading").removeClass("active");
    }
  }
};

stockfish.postMessage("uci");

// GUI board & game state variables
let board = null;
let game = new Chess();
let userColor = "w";
let $pgn = $("#pgn");
let evaluationStack = [];
let isDragging = false;

function make_move() {
  if (game.turn() === userColor) return;

  if (!engineReady) {
    setTimeout(make_move, 100);
    return;
  }

  const difficulty = parseInt($("#difficulty").val());
  $(".loading").addClass("active");

  pendingEval = "0";
  stockfish.postMessage("setoption name Skill Level value " + difficulty);
  stockfish.postMessage("position fen " + game.fen());
  stockfish.postMessage("go depth 12");
}

function updateEvaluationBar(evaluation) {
  const $fill = $("#eval-bar-fill");
  const $value = $("#eval-value");

  if (evaluation.includes("M")) {
    evaluation.includes("-")
      ? $fill.css("height", "0%")
      : $fill.css("height", "100%");
    $value.text("M" + evaluation.replace(/[-M]/g, ""));
  } else {
    let numericEvaluation = parseInt(evaluation) / 100;

    evaluationStack.push(numericEvaluation);

    let heightPercentage = 50 + (numericEvaluation / 10) * 50;
    heightPercentage = Math.min(100, Math.max(0, heightPercentage));

    $fill.css("height", heightPercentage + "%");
    $value.text(
      (numericEvaluation > 0 ? "+" : "") + numericEvaluation.toFixed(2)
    );
  }
}

function updateEvaluationBarFromStack(evaluation) {
  const $fill = $("#eval-bar-fill");
  const $value = $("#eval-value");

  let heightPercentage = 50 + (evaluation / 10) * 50;
  heightPercentage = Math.min(100, Math.max(0, heightPercentage));

  $fill.css("height", heightPercentage + "%");
  $value.text((evaluation > 0 ? "+" : "") + evaluation.toFixed(2));
}

function resetEvaluationBar() {
  $("#eval-bar-fill").css("height", "50%");
  $("#eval-value").text("0.00");
}

function resetGame() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  stockfish.postMessage("ucinewgame");
  game.reset();
  board.position("start");
  board.orientation(userColor === "w" ? "white" : "black");
  if (userColor === "b") {
    make_move();
  }
  updateStatus();
  evaluationStack = [];
  resetEvaluationBar();
}

function enableMobileDragging(allow) {
  if (allow) {
    isDragging = false;
    document.body.style.touchAction = "";
  } else {
    isDragging = true;
    document.body.style.touchAction = "none";
  }
}

function onDragStart(source, piece, position, orientation) {
  if (game.game_over()) return false;

  if (
    (game.turn() === "w" && piece.search(/^b/) !== -1) ||
    (game.turn() === "b" && piece.search(/^w/) !== -1) ||
    game.turn() !== userColor
  ) {
    return false;
  }

  enableMobileDragging(false);
  return true;
}

function onDrop(source, target) {
  let move = game.move({
    from: source,
    to: target,
    promotion: "q",
  });

  if (move === null) {
    enableMobileDragging(true);
    return "snapback";
  }

  enableMobileDragging(true);

  speak("You moved " + convertEngineMoveToNaturalLanguage(move));

  if (!game.game_over()) {
    make_move();
  }

  updateStatus();
}

function onSnapEnd() {
  board.position(game.fen());
  enableMobileDragging(true);
}

function handleUserMove(move) {
  if (game.turn() !== userColor) return false;

  let result_of_move = game.move(move, { sloppy: true });

  if (result_of_move == null) return false;

  speak("You moved " + convertEngineMoveToNaturalLanguage(result_of_move));

  board.position(game.fen());
  make_move();
  updateStatus();

  return true;
}

function updateStatus() {
  let status = "";
  let moveColor = game.turn() === "b" ? "Black" : "White";

  if (game.in_checkmate()) {
    status = "Game over, " + moveColor + " is in checkmate.";
  } else if (game.in_draw()) {
    status = "Game over, drawn position";
  } else {
    status = moveColor + " to move";
    if (game.in_check()) {
      status += ", " + moveColor + " is in check";
    }
  }

  const pgnText = game.pgn();
  $pgn.html(pgnText);
  $("#pgn-only-content").html(pgnText || "<span class='text-muted'>No moves yet</span>");
}

document.addEventListener(
  "touchmove",
  function (e) {
    if (isDragging) {
      e.preventDefault();
    }
  },
  { passive: false }
);

let config = {
  draggable: true,
  position: "start",
  pieceTheme: "img/cburnett/{piece}.svg",
  onDragStart: onDragStart,
  onDrop: onDrop,
  onSnapEnd: onSnapEnd,
};

board = Chessboard("chess_board", config);

updateStatus();
