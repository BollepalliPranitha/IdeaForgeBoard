"use strict";

const RATE = 4;
function calc(position, y) {
  return (position - 30 - (y ? 40 : 0)) / RATE;
}
function drawLine(context, data) {
  if (data.hidden) return;
  const x0 = calc(data.x0);
  const x1 = calc(data.x1);
  const y0 = calc(data.y0, true);
  const y1 = calc(data.y1, true);
  if (["box", "line", "circle"].includes(data.mode)) {
    context.beginPath();
    if (data.mode === "line") {
      context.moveTo(x0, y0);
      context.lineTo(x1, y1);
    } else if (data.mode === "box") {
      context.rect(x0, y0, x1 - x0, y1 - y0);
    } else if (data.mode === "circle") {
      const harfW = (x1 - x0) / 2;
      const harfH = (y1 - y0) / 2;
      context.arc(
        x0 + harfW,
        y0 + harfH,
        Math.max(Math.abs(harfW), Math.abs(harfH)),
        0,
        2 * Math.PI
      );
    }
    context.strokeStyle = data.color;
    context.lineWidth = data.width / RATE;
    context.stroke();
    context.closePath();
  } else {
    context.beginPath();
    context.moveTo(x0, y0);
    context.lineTo(x1, y1);
    context.strokeStyle = data.color;
    context.lineWidth = data.width / RATE;
    context.stroke();
    context.closePath();
  }
}

function predictLine() {
  // Implement prediction logic here
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

const iconColor = {
  lightyellow: "gold",
  pink: "hotpink",
};

function drawNote(context, data) {
  if (data.hidden) return;
  console.log("Drawing note at:", data.x, data.y, "Color:", data.color);
  const x = calc(data.x) + 15;
  const y = calc(data.y) + 15;
  context.font = `900 12px "Font Awesome 5 Free"`;
  context.fillStyle = iconColor[data.color] || "gold";
  context.fillText("\uf249", x, y);
}

function updateRecentBoards(boards) {
  for (const board of boards) {
    console.log(board);
    const boardDiv = $("#board-origin").clone();
    boardDiv.attr("id", board.boardId);
    boardDiv
      .find(".created")
      .text(new Date(board.createdTimestamp).toLocaleString("ja"));
    boardDiv.find(".link").attr("href", "/board/" + board.boardId);

    const whiteboard = boardDiv.find(".whiteboard")[0];
    const context = whiteboard.getContext("2d");
    context.lineJoin = "round";
    context.lineCap = "round";
    for (const line of board.lineHist) {
      drawLine(context, line);
    }
    for (const key of Object.keys(board.noteList)) {
      drawNote(context, board.noteList[key]);
    }

    boardDiv.removeClass("hidden");
    $("#boards").append(boardDiv);
  }
}

// config
(function () {
  const socket = io();
  const btn = $("#create-board-button");
  btn.click(() => {
    const correctPin = "1234"; // Set the correct PIN for your application
    const enteredPin = prompt("Enter the PIN for this board:");
    if (enteredPin === correctPin) {
      socket.emit("createBoard", null, (data) => {
        window.location.href = "/board/" + data.boardId;
      });
    }
    else {
      alert("Incorrect PIN. Please try again.");
    }
  });


  WebFont.load({
    custom: {
      families: ["Font Awesome 5 Free"],
    },
    active: function () {
      const correctPin = "1234";
      // Set the correct PIN for your application
      // Add a click event listener to the recent boards element
      //document.getElementById("recent-boards").addEventListener("click", () => {
      const enteredPin = prompt("Enter the PIN to access recent boards:");

      if (enteredPin === correctPin) {
        socket.emit("recentBoards", null, (boards) => {
          updateRecentBoards(boards);
        });
      } else {
        alert("Incorrect PIN. Access denied.");
      };
    },
  });
})();
