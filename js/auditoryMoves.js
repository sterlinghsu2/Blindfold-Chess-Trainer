let recognition;
let synth;
let selectedVoice;

const letterToPiece = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

const fileNames = {
  a: "A",
  b: "B",
  c: "C",
  d: "D",
  e: "E",
  f: "F",
  g: "G",
  h: "H",
};

const rankNames = {
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
};

// Maps spoken words to chess notation tokens.
// Covers common WebSpeech misinterpretations for each category.
const WORD_MAP = {
  // Pieces
  knight: "N", night: "N", nights: "N", nite: "N", "night's": "N",
  bishop: "B", fish: "B",
  rook: "R", rock: "R", brook: "R", ruck: "R", "work": "R",
  queen: "Q", clean: "Q", green: "Q", cream: "Q",
  king: "K", keen: "K", thing: "K",
  pawn: "",

  // Files
  alpha: "a", hey: "a", ay: "a",
  bravo: "b", be: "b", bee: "b", beat: "b",
  charlie: "c", see: "c", sea: "c", si: "c",
  delta: "d", dee: "d", the: "d", "do": "d",
  echo: "e", he: "e",
  foxtrot: "f", of: "f", ef: "f", eff: "f", "if": "f",
  golf: "g", gee: "g", ji: "g", she: "g",
  hotel: "h", age: "h", aitch: "h", ach: "h", each: "h",

  // Ranks
  one: "1", won: "1", want: "1",
  two: "2", to: "2", too: "2", tu: "2",
  three: "3", free: "3", tree: "3", through: "3", "for you": "3",
  four: "4", for: "4", fore: "4", forth: "4",
  five: "5", fife: "5", hive: "5",
  six: "6", sex: "6", sax: "6", sticks: "6",
  seven: "7",
  eight: "8", ate: "8",

  // Actions
  takes: "x", captures: "x", capture: "x", tax: "x",
  check: "", checkmate: "", mate: "",
  promotes: "=", promotion: "=", promote: "=",
};

// Special phrase handling
const CASTLING_PHRASES = {
  "castle kingside": "O-O",
  "kingside castle": "O-O",
  "short castle": "O-O",
  "castles kingside": "O-O",
  "castle queenside": "O-O-O",
  "queenside castle": "O-O-O",
  "long castle": "O-O-O",
  "castles queenside": "O-O-O",
};

const COMMAND_PHRASES = ["take back", "takeback", "undo"];

// ── Voice selection ────────────────────────────────

const VOICE_PREFERENCES = [
  (v) => v.name.includes("Google UK English Male"),
  (v) => v.name.includes("Google UK English Female"),
  (v) => v.name.includes("Google US English"),
  (v) => v.name === "Samantha",
  (v) => v.name.includes("Neural") && v.lang.startsWith("en"),
  (v) => v.name.includes("Google") && v.lang.startsWith("en"),
  (v) => v.lang.startsWith("en") && v.localService,
  (v) => v.lang.startsWith("en"),
];

function selectBestVoice() {
  const voices = synth.getVoices();
  if (!voices.length) return;

  for (const pref of VOICE_PREFERENCES) {
    const match = voices.find(pref);
    if (match) {
      selectedVoice = match;
      return;
    }
  }
}

// ── Initialization ─────────────────────────────────

function initSpeech() {
  synth = window.speechSynthesis;
  selectBestVoice();
  synth.addEventListener("voiceschanged", selectBestVoice);

  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    console.warn("Speech recognition not supported in this browser.");
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 5;

  recognition.onresult = function (event) {
    const results = event.results[event.results.length - 1];
    handleRecognitionResults(results);
  };

  recognition.onerror = function (event) {
    console.error("Speech recognition error:", event.error);
  };
}

// ── Recognition processing ─────────────────────────

function handleRecognitionResults(results) {
  const transcripts = [];
  for (let i = 0; i < results.length; i++) {
    transcripts.push(results[i].transcript.trim().toLowerCase());
  }

  console.log("Voice heard:", transcripts);

  // Check for commands first (any alternative)
  for (const t of transcripts) {
    if (COMMAND_PHRASES.some((cmd) => t.includes(cmd))) {
      undoMove();
      speak("Taking back.");
      return;
    }
  }

  // Try each transcript alternative
  for (const transcript of transcripts) {
    const move = tryParseMove(transcript);
    if (move) {
      let result = game.move(move, { sloppy: true });
      if (result) {
        board.position(game.fen());
        speak("You moved " + convertEngineMoveToNaturalLanguage(result));
        updateStatus();
        make_move();
        return;
      }
    }
  }

  // Fallback: fuzzy match against legal moves
  for (const transcript of transcripts) {
    const match = fuzzyMatchLegalMove(transcript);
    if (match) {
      let result = game.move(match, { sloppy: true });
      if (result) {
        board.position(game.fen());
        speak("You moved " + convertEngineMoveToNaturalLanguage(result));
        updateStatus();
        make_move();
        return;
      }
    }
  }

  speak("I didn't catch that. Try again.");
  console.log("No valid move found from:", transcripts);
}

function tryParseMove(transcript) {
  // Check for castling
  for (const [phrase, notation] of Object.entries(CASTLING_PHRASES)) {
    if (transcript.includes(phrase) || transcript.replace(/\s+/g, "") === phrase.replace(/\s+/g, "")) {
      return notation;
    }
  }

  // Tokenize and map through WORD_MAP
  const words = transcript.split(/\s+/);
  let notation = "";

  for (const word of words) {
    if (WORD_MAP[word] !== undefined) {
      notation += WORD_MAP[word];
    } else if (/^[a-h]$/.test(word)) {
      notation += word;
    } else if (/^[1-8]$/.test(word)) {
      notation += word;
    } else if (/^[a-h][1-8]$/.test(word)) {
      notation += word;
    }
  }

  return notation || null;
}

// ── Fuzzy matching against legal moves ─────────────

function moveToSpokenForm(move) {
  let spoken = "";
  if (move.piece !== "p") spoken += letterToPiece[move.piece] + " ";
  if (move.flags.includes("k")) return "castle kingside";
  if (move.flags.includes("q")) return "castle queenside";
  if (move.captured) spoken += "takes ";
  spoken += move.to[0] + " " + rankNames[move.to[1]];
  return spoken;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function fuzzyMatchLegalMove(transcript) {
  const legalMoves = game.moves({ verbose: true });
  const normalized = transcript.replace(/\s+/g, "").toLowerCase();

  let bestMove = null;
  let bestScore = Infinity;

  for (const move of legalMoves) {
    const spokenForm = moveToSpokenForm(move).replace(/\s+/g, "").toLowerCase();
    const dist = levenshtein(normalized, spokenForm);

    // Also try against the SAN notation
    const sanDist = levenshtein(normalized, move.san.toLowerCase());

    const minDist = Math.min(dist, sanDist);

    if (minDist < bestScore) {
      bestScore = minDist;
      bestMove = move.san;
    }
  }

  // Accept if edit distance is within ~40% of the spoken form length
  const maxDist = Math.max(3, Math.floor(transcript.length * 0.4));
  return bestScore <= maxDist ? bestMove : null;
}

// ── Speech output ──────────────────────────────────

function convertEngineMoveToNaturalLanguage(move) {
  let text = "";

  if (move.flags.includes("k")) return "kingside castle";
  if (move.flags.includes("q")) return "queenside castle";

  if (move.piece !== "p") {
    text += letterToPiece[move.piece] + " ";
  }

  if (move.flags.includes("c") && move.piece === "p") {
    text += fileNames[move.from[0]] + " captures ";
  } else if (move.flags.includes("c")) {
    text += "captures ";
  }

  text += fileNames[move.to[0]] + " " + rankNames[move.to[1]];

  if (move.flags.includes("e")) {
    text += " en passant";
  } else if (move.flags.includes("p")) {
    text += " promoting to " + letterToPiece[move.promotion];
  } else if (move.san.includes("#")) {
    text += " checkmate";
  } else if (move.san.includes("+")) {
    text += " check";
  }

  return text;
}

function speak(text, interrupt) {
  if (!synth) return;
  if (interrupt) synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  if (selectedVoice) utterance.voice = selectedVoice;
  utterance.rate = 0.95;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  synth.speak(utterance);
}

// ── Button binding ─────────────────────────────────

function startVoiceRecognition() {
  if (!recognition) {
    alert("Speech recognition is not supported in this browser. Try Chrome.");
    return;
  }
  recognition.start();
  $(".voice-btn-main").addClass("listening");
  speak("Listening.", true);
}

$("#voice_move, #voice_move_main").on("click", startVoiceRecognition);

$(document).ready(function () {
  initSpeech();

  if (recognition) {
    recognition.addEventListener("end", function () {
      $(".voice-btn-main").removeClass("listening");
    });
    recognition.addEventListener("error", function () {
      $(".voice-btn-main").removeClass("listening");
    });
  }
});
