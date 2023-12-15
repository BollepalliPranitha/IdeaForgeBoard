const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const { v1: uuidv1 } = require("uuid");
const { v1: uuidv4 } = require("uuid");
let lineHist = [];

const PORT = process.env.PORT || 3000;
app.use(express.static(__dirname + "/public"));
app.get("/board/*", (req, res, next) => {
  res.sendFile(__dirname + "/public/board.html");
});

const Redis = require("ioredis");
const REDIS_PREFIX = process.env.REDIS_PREFIX || "whiteboard-";
const REDIS_TTL_SEC = process.env.REDIS_TTL_SEC || 30 * 24 * 60 * 60; // default: 30 days
const { REDIS_URL } = process.env;
let redis;
if (REDIS_URL) {
  console.log(
    `connect to ${REDIS_URL}. prefix=${REDIS_PREFIX} ttl=${REDIS_TTL_SEC}`
  );
  redis = new Redis(REDIS_URL);
}

const boards = {};
const boardPins = {};
const saveLimitter = {};

// async function saveBoard(boardId) {
//   if (!redis || saveLimitter[boardId]) return;

//   saveLimitter[boardId] = setTimeout(() => {
//     redis.set(
//       REDIS_PREFIX + "board-" + boardId,
//       JSON.stringify(boards[boardId]),
//       "ex",
//       REDIS_TTL_SEC
//     );
//     delete saveLimitter[boardId];
//     console.log("saveBoard", { boardId });
//   }, 3000);
// }
// async function load() {
//   if (redis) {
//     const prefix = REDIS_PREFIX + "board-";
//     const keys = await redis.keys(prefix + "*");
//     for (const key of keys) {
//       const boardId = key.replace(prefix, "");
//       boards[boardId] = JSON.parse(await redis.get(key));
//       console.log("load", { boardId });
//     }
//   }
// }

// load();
async function saveBoard(boardId, lines) {
  if (!boards[boardId]) {
    boards[boardId] = { version: uuidv4(), lineHist: [] };
  }

  // Update the version for the current board
  boards[boardId].version = uuidv4();

  // Add lines to the board
  boards[boardId].lineHist = boards[boardId].lineHist.concat(lines);

  // Return the updated version



  if (!redis || saveLimitter[boardId]) return;

  saveLimitter[boardId] = setTimeout(() => {
    redis.set(
      REDIS_PREFIX + "board-" + boardId,
      JSON.stringify(boards[boardId]),
      "ex",
      REDIS_TTL_SEC
    );
    delete saveLimitter[boardId];
    console.log("saveBoard", { boardId });
  }, 3000);
  return { status: "OK", version: boards[boardId].version };
}
async function load(boardId, version) {
  if (!boards[boardId]) {
    boards[boardId] = { version: uuidv4(), lineHist: [] };
  }

  if (version && version !== boards[boardId].version) {
    // Reject loading due to outdated version
    return { status: "OUTDATED_VERSION", version: boards[boardId].version };
  }

  if (redis) {
    const prefix = REDIS_PREFIX + "board-";
    const keys = await redis.keys(prefix + "*");
    for (const key of keys) {
      const boardId = key.replace(prefix, "");
      boards[boardId] = JSON.parse(await redis.get(key));
      console.log("load", { boardId });
    }
  }
  return { status: "OK", board: { version: boards[boardId].version, lineHist: boards[boardId].lineHist } };
}


function predictLine() {
  // This is a placeholder; replace it with your actual prediction algorithm

  // Get the last drawn line from history
  const lastDrawnLine = lineHist.length > 0 ? lineHist[lineHist.length - 1] : null;

  // If there is a last drawn line, predict the next line based on it
  if (lastDrawnLine) {
    return {
      startPoint: lastDrawnLine.endPoint,
      endPoint: { x: lastDrawnLine.endPoint.x + 50, y: lastDrawnLine.endPoint.y + 50 },
      color: lastDrawnLine.color,
      thickness: lastDrawnLine.thickness,
    };
  } else {
    // If no history, provide a default prediction
    return {
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 50, y: 50 },
      color: "black",
      thickness: 2,
    };
  }
}
// function for dynamic sorting
function compareValues(key, order = "desc") {
  return function (a, b) {
    if (!a.hasOwnProperty(key) || !b.hasOwnProperty(key)) {
      // property doesn't exist on either object
      return 0;
    }

    const varA = typeof a[key] === "string" ? a[key].toUpperCase() : a[key];
    const varB = typeof b[key] === "string" ? b[key].toUpperCase() : b[key];

    let comparison = 0;
    if (varA > varB) {
      comparison = 1;
    } else if (varA < varB) {
      comparison = -1;
    }
    return order == "desc" ? comparison * -1 : comparison;
  };
}

function onConnection(socket) {
  const { boardId } = socket.handshake.query;
  let lineHist = [];
  let noteList = {};
  if (boardId && boards[boardId]) {
    lineHist = boards[boardId].lineHist;
    noteList = boards[boardId].noteList;
  }
  socket.join(boardId);
  console.log("onConnection", { id: socket.id, boardId });

  socket.on("createBoard", (data, ack) => {
    const boardId = uuidv1();
    boards[boardId] = {
      lineHist: [],
      noteList: {},
      createdTimestamp: new Date().getTime(),
      boardId,
    };
    ack({ boardId });
    saveBoard(boardId);
  });

  socket.on("load", (data, ack) => {
    if (!boardId || !boards[boardId]) {
      ack({ status: "NOT_FOUND" });
    }
    ack({ status: "OK", ...boards[boardId] });
  });

  socket.on("drawLine", (data) => {
    const predictedLine = predictLine();
    lineHist.push(predictedLine);
    //lineHist.push(data);
    socket.broadcast.to(boardId).emit("drawLine", predictLine);
    //socket.broadcast.to(boardId).emit("drawLine", data);
    saveBoard(boardId);
  });

  socket.on("hideLine", (data) => {
    for (const line of lineHist) {
      if (line.id === data.id) {
        line.hidden = data.hidden;
      }
    }
    io.to(boardId).emit("redraw", boards[boardId]);
    saveBoard(boardId);
  });

  socket.on("updateNote", (data) => {
    noteList[data.id] = { ...noteList[data.id], ...data };
    socket.broadcast.to(boardId).emit("updateNote", noteList[data.id]);
    saveBoard(boardId);
  });

  socket.on("hideNote", (data) => {
    noteList[data.id].hidden = data.hidden;
    io.to(boardId).emit("hideNote", data);
    saveBoard(boardId);
  });

  socket.on("clearBoard", (data, ack) => {
    boards[boardId] = { lineHist: [], noteList: {} };
    ack({ status: "OK" });
    socket.broadcast.to(boardId).emit("clearBoard");
    saveBoard(boardId);
  });

  socket.on("recentBoards", (data, ack) => {
    const list = Object.values(boards);
    ack(
      list
        .filter((b) => b.createdTimestamp)
        .sort(compareValues("createdTimestamp", "desc"))
        .slice(0, 9)
        .map((board) => ({ ...board, pin: boardPins[board.boardId] }))
    );

  });
}
io.on("connection", onConnection);

http.listen(PORT, () => console.log("listening on port " + PORT));

