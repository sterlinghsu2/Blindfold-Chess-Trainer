$("#new_game").on("click", resetGame);

$("#choose_color").on("click", function () {
  userColor = userColor === "w" ? "b" : "w";
  $("#color-label").text(userColor === "w" ? "Play as Black" : "Play as White");
  resetGame();
});

function undoMove() {
  game.undo();
  game.undo();

  board.position(game.fen());

  evaluationStack.pop();
  let previousEvaluation = evaluationStack.pop();

  if (previousEvaluation !== undefined) {
    updateEvaluationBarFromStack(previousEvaluation);
  } else {
    resetEvaluationBar();
  }

  updateStatus();
}

$("#take_back").on("click", undoMove);

$("#flip_board").on("click", function () {
  board.flip();
});

// Display toggles

$("#toggle-eval").on("change", function () {
  const show = this.checked;
  $("#eval-col").toggleClass("d-none", !show);
  $(".eval-value").toggleClass("d-none", !show);
});

$("#toggle-pieces").on("change", function () {
  $("#chess_board").toggleClass("pieces-hidden", this.checked);
});

$("#toggle-pgn-only").on("change", function () {
  const pgnOnly = this.checked;
  $("#board-wrapper").toggleClass("d-none", pgnOnly);
  $("#pgn-only-wrapper").toggleClass("d-none", !pgnOnly);
  updateStatus();
});

$("#toggle-voice-btn").on("change", function () {
  $("#voice_move_main").toggleClass("d-none", !this.checked);
});

// Difficulty slider

$("#difficulty").on("input", function () {
  $("#difficulty-value").text($(this).val());
});

// Typed move input

$("#user-move").on("keyup", function (e) {
  if (e.key === "Enter" || e.keyCode === 13) {
    let move = $(this).val();
    if (handleUserMove(move)) {
      $(this).val("");
    } else {
      alert("Invalid move. Please try again.");
    }
  }
});
