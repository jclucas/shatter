import Game from "./js/Game.js"

require('./style.css');

var game = new Game();
game.loop();

// disable tooltip on first click
let tip = document.getElementById("tip");
let handler = () => {
    tip.style.display = "none";
    document.removeEventListener('mousedown', handler);
};

document.addEventListener('mousedown', handler);