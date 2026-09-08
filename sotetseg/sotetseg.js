/* This code is pretty sloppy right now. Sorry for the mess. */

function showAbout() {
	document.getElementById("dialog-about").showModal();
}

function showInstructions() {
	document.getElementById("dialog-instructions").showModal();
}

const tick_length  = 600;

const maze_width   = 14;
const maze_height  = 15;
const max_x_change = 5;
const path_turns   = 8;
const tornado_row  = 4;

const SEGMENT_ROWS = 14;
const CAMERA_ANIM_MS = 280;
const BEST_KEY = "sote-infinite-best:";
const DURATIONS = {
	"10": 10000,
	"30": 30000,
	"60": 60000,
	"150": 150000,
	"300": 300000,
	"600": 600000,
	"inf": 0,
};

var viewport_height = window.innerHeight;
var viewport_width = window.innerWidth;
var view_ratio = viewport_width / viewport_height;

var tile_size      = 40;
var tile_stroke  = tile_size/25;
var solv_fontsize  = 15*(tile_size/40);
var offset_optimal = solv_fontsize/2;
var offset_user    = -offset_optimal;

const color_mazeback = "#323232";
const color_tilepath = "#961919";
const color_tilenogo = "#C8C8C8";
const color_tileplay = "#77DD77";
const color_tilenext = "#C8C8C8";
const color_tilesolv = "#6495ED";
const color_tilestal = "#FFFF00";
const color_linesolv = "#FF4500";
const color_lineplay = "#6495ED";
const color_circmove = "#FFFFFF";
const color_circpass = "#008000";
const color_circfail = "#DC143C";
const solv_font      = "Arial";

var canvas = document.getElementById("sotetseg-maze");
var ctx = canvas.getContext("2d");
canvas.width = tile_size * maze_width;
canvas.height = tile_size * (maze_height); // need +1 for the extra row at the top to run off the maze, if desired.

var imgTornado = new Image();
imgTornado.src = "tornado.png";

class Point {
	constructor(x, y) {
		this.x = x;
		this.y = y;
	}
}

function isInfinite() {
	return playMode === "infinite";
}

function durationMs() {
	return DURATIONS[durationId] || 0;
}

function tileScreenX(x) {
	return tile_size * x;
}

function tileScreenY(y) {
	return (y - cameraY) * tile_size;
}

function isOnScreen(y) {
	return y >= cameraY - 1 && y <= cameraY + maze_height + 1;
}

function isPath(x, y) {
	if (x < 0 || x >= maze_width) {
		return false;
	}
	if (isInfinite()) {
		return Boolean(mazeWorld[x] && mazeWorld[x][y]);
	}
	if (y < 0 || y >= maze_height) {
		return false;
	}
	return maze[x][y];
}

function readUrlState() {
	const q = new URLSearchParams(location.search);
	playMode = q.get("mode") === "infinite" ? "infinite" : "tob";
	const time = q.get("time");
	durationId = Object.prototype.hasOwnProperty.call(DURATIONS, time) ? time : "30";
}

function syncUrl() {
	const url = new URL(location.href);
	if (isInfinite()) {
		url.searchParams.set("mode", "infinite");
		url.searchParams.set("time", durationId);
	} else {
		url.searchParams.delete("mode");
		url.searchParams.delete("time");
	}
	history.replaceState(null, "", url);
}

function applyModeUi() {
	const infinite = isInfinite();
	const page = document.querySelector(".sote");
	if (page) {
		page.classList.toggle("sote--infinite", infinite);
	}
	const modeSelect = document.getElementById("mode-select");
	if (modeSelect) {
		modeSelect.value = playMode;
		const modeFace = document.getElementById("mode-face");
		const selected = modeSelect.options[modeSelect.selectedIndex];
		if (modeFace && selected) {
			modeFace.textContent = selected.text;
		}
	}
	document.getElementById("btn-solution").hidden = infinite;
	document.getElementById("instructions-tob").hidden = infinite;
	document.getElementById("instructions-infinite").hidden = !infinite;
	document.getElementById("stat-third-kicker").textContent = infinite ? "Time" : "Seed";
	document.getElementById("seed").hidden = infinite;
	const durationSelect = document.getElementById("duration-select");
	const timeRemaining = document.getElementById("time-remaining");
	durationSelect.value = durationId;
	if (infinite) {
		const showClock = session_active || infiniteFinished;
		durationSelect.hidden = showClock;
		timeRemaining.hidden = !showClock;
	} else {
		durationSelect.hidden = true;
		timeRemaining.hidden = true;
	}
	document.title = infinite ? "Infinite maze trainer" : "Sotetseg maze trainer";
}

function resize() {
	const page = document.querySelector(".sote");
	const mazeHost = document.getElementById("sote-maze-host");
	const actions = document.querySelector(".sote__actions");
	const stats = document.querySelector(".sote__stats");
	const pageStyle = page ? getComputedStyle(page) : null;
	const padX = pageStyle
		? parseFloat(pageStyle.paddingLeft) + parseFloat(pageStyle.paddingRight)
		: 32;
	const availableW = (page ? page.clientWidth : window.innerWidth) - padX - 24;
	const mazeTop = mazeHost ? mazeHost.getBoundingClientRect().top : 180;
	const actionsH = actions ? actions.getBoundingClientRect().height : 72;
	const statsH = stats ? stats.getBoundingClientRect().height : 80;
	const availableH = window.innerHeight - mazeTop - actionsH - statsH - 48;
	const next = Math.floor(Math.min(
		40,
		availableW / maze_width,
		Math.max(availableH, 280) / maze_height
	));
	tile_size = Math.max(22, next);

	tile_stroke  = tile_size/25;
	solv_fontsize  = 15*(tile_size/40);
	offset_optimal = solv_fontsize/2;
	offset_user    = -offset_optimal;

	canvas.width = tile_size * maze_width;
	canvas.height = tile_size * maze_height;

	drawState();
}

function getTileClicked(event) {
	let rect = canvas.getBoundingClientRect();
	let pixel_x = event.clientX - rect.left;
	let pixel_y = event.clientY - rect.top;
	let tile_x = Math.floor(pixel_x / tile_size);
	let tile_y = Math.floor(pixel_y / tile_size + cameraY);
	return { x: tile_x, y: tile_y };
}

function randRange(a, b) {
	return Math.floor(Math.random() * (b - a + 1)) + a;
}

function drawPathTile(x, y) {
	let pos_x = tileScreenX(x);
	let pos_y = tileScreenY(y);
	if (isPath(x, y)) {
		ctx.fillStyle = color_circpass;
	} else {
		ctx.fillStyle = color_circfail;
		team_damaged = true;
	}
	ctx.beginPath(pos_x, pos_y, pos_x+tile_size, pos_y+tile_size);
	ctx.arc(pos_x+tile_size/2, pos_y+tile_size/2, tile_size/4, 0, 2*Math.PI);
	ctx.fill();
}

function drawMoveTile(x, y) {
	let pos_x = tileScreenX(x);
	let pos_y = tileScreenY(y);
	ctx.strokeStyle = color_circmove;
	ctx.beginPath(pos_x, pos_y, pos_x+tile_size, pos_y+tile_size);
	ctx.arc(pos_x+tile_size/2, pos_y+tile_size/2, tile_size/3.4, 0, 2*Math.PI);
	ctx.stroke();
}

function drawTargetTile() {
	let pos_x = tileScreenX(targeted_tile.x);
	let pos_y = tileScreenY(targeted_tile.y);
	ctx.fillStyle = color_tilesolv;
	ctx.fillRect(pos_x, pos_y, tile_size, tile_size);
	ctx.fillStyle = color_mazeback;
	ctx.fillRect(
		pos_x + tile_stroke,
		pos_y + tile_stroke,
		tile_size - tile_stroke * 2,
		tile_size - tile_stroke * 2
	);
	ctx.beginPath(pos_x, pos_y, pos_x+tile_size, pos_y+tile_size);
	ctx.arc(pos_x+tile_size/2, pos_y+tile_size/2, tile_size/3.4, 0, 2*Math.PI);
	ctx.lineWidth = tile_stroke*1.2;
	ctx.strokeStyle = color_tilesolv;
	ctx.stroke();
}

function drawMazeTile(x, y, color_tile) {
	let pos_x = tileScreenX(x);
	let pos_y = tileScreenY(y);
	ctx.fillStyle = color_tile;
	ctx.fillRect(pos_x, pos_y, tile_size, tile_size);
	ctx.fillStyle = color_mazeback;
	ctx.fillRect(
		pos_x + tile_stroke,
		pos_y + tile_stroke,
		tile_size - tile_stroke * 2,
		tile_size - tile_stroke * 2
	);
	ctx.beginPath(pos_x, pos_y, pos_x+tile_size, pos_y+tile_size);
	ctx.arc(pos_x+tile_size/2, pos_y+tile_size/2, tile_size/3.4, 0, 2*Math.PI);
	ctx.lineWidth = tile_stroke*1.2;
	ctx.strokeStyle = color_tile;
	ctx.stroke();
}

function drawMaze() {
	if (isInfinite()) {
		const yStart = Math.floor(cameraY) - 1;
		const yEnd = Math.ceil(cameraY) + maze_height;
		for (let x = 0; x < maze_width; x++) {
			for (let y = yStart; y <= yEnd; y++) {
				drawMazeTile(x, y, isPath(x, y) ? color_tilepath : color_tilenogo);
			}
		}
		return;
	}
	for (let x = 0; x < maze.length; x++) {
		for (let y = 0; y < maze[x].length; y++) {
			drawMazeTile(x, y, maze[x][y] ? color_tilepath : color_tilenogo);
		}
	}
}

function pathWeighting() {
	weighted_maze = Array(maze_width);
	for (let x = 0; x < maze_width; x++) {
		weighted_maze[x] = Array(maze_height);
		for (let y = 0; y < maze_height; y++) {
			weighted_maze[x][y] = 0;
		}
	}
	let t_pos = new Point(-1, -1);
	let p_pos = new Point(-1, -1);
	let c_pos = new Point(seed[0], maze_height - 1)
	counter = 1;
	while (c_pos) {
		path_coordinates.push(new Point(c_pos.x, c_pos.y));
		weighted_maze[c_pos.x][c_pos.y] = counter;
		counter += 1
		t_pos.x = p_pos.x;
		t_pos.y = p_pos.y;
		p_pos.x = c_pos.x;
		p_pos.y = c_pos.y;
		c_pos = getNextPathTile(c_pos, t_pos);
	}
}

function makeSeededMaze(seed) {
	let maze = new Array(maze_width);
	for (let x = 0; x < maze.length; x++) {
		maze[x] = new Array(maze_height);
	}
	for (let x = 0; x < maze.length; x++) {
		for (let y = 0; y < maze[x].length; y++) {
			maze[x][y] = false;
		}
	}
	let next_x = -1;
	let s = 0;
	let x = seed[s];
	let y = maze[0].length - 1;
	while (y >= 0) {
		if (y % 2) {
			next_x = seed[++s];
			for (let i = Math.min(x, next_x); i <= Math.max(x, next_x); i++) {
				maze[i][y] = true;
			}
			x = next_x;
		} else {
			maze[x][y] = true;
		}
		y--;
	}
	start_pos = new Point(seed[0], maze_height - 1);
	end_pos = new Point(seed[seed.length - 1], 0);
	return maze;
}

function makeSeed() {
	seed = new Array(path_turns);
	seed[0] = randRange(1, maze_width - 1); // 1 lower bound because maze cannot start on far west tile
	for (let i = 1; i < seed.length; i++) {
		seed[i] = randRange(Math.max(seed[i-1] - max_x_change, 0), Math.min(seed[i-1] + max_x_change, maze_width - 1));
	}
}

function makeMaze() {
	makeSeed();
	return makeSeededMaze(seed);
}

function paintWorldCorridor(x0, x1, y) {
	const a = Math.min(x0, x1);
	const b = Math.max(x0, x1);
	for (let i = a; i <= b; i++) {
		mazeWorld[i][y] = true;
	}
}

function generateSegment(fromY, toY, startX) {
	let x = startX;
	let y = fromY;
	while (y >= toY) {
		if (y % 2) {
			const nextX = randRange(
				Math.max(x - max_x_change, 0),
				Math.min(x + max_x_change, maze_width - 1)
			);
			paintWorldCorridor(x, nextX, y);
			x = nextX;
		} else {
			mazeWorld[x][y] = true;
		}
		y--;
	}
	worldNorthY = toY;
	worldSouthY = Math.max(worldSouthY, fromY);
	infinitePathX = x;
	return x;
}

function startInfiniteWorld() {
	mazeWorld = Array.from({ length: maze_width }, () => ({}));
	const startX = randRange(1, maze_width - 1);
	start_pos = new Point(startX, maze_height - 1);
	end_pos = new Point(startX, 0);
	worldSouthY = maze_height - 1;
	worldNorthY = maze_height - 1;
	infinitePathX = generateSegment(maze_height - 1, 0, startX);
	cameraY = 0;
	cameraTargetY = 0;
}

function loadNextSegment() {
	if (worldNorthY <= cameraTargetY - SEGMENT_ROWS) {
		return;
	}
	const nextTo = worldNorthY - SEGMENT_ROWS;
	infinitePathX = generateSegment(worldNorthY - 1, nextTo, infinitePathX);
}

function pruneSouth() {
	if (!isInfinite()) {
		return;
	}
	const keepSouth = Math.ceil(cameraY) + maze_height + 4;
	if (worldSouthY <= keepSouth) {
		return;
	}
	for (let y = worldSouthY; y > keepSouth; y--) {
		for (let x = 0; x < maze_width; x++) {
			delete mazeWorld[x][y];
		}
	}
	worldSouthY = keepSouth;
}

function startCameraAnim() {
	if (cameraAnim) {
		cancelAnimationFrame(cameraAnim);
	}
	const from = cameraY;
	const to = cameraTargetY;
	if (from === to) {
		return;
	}
	const t0 = performance.now();
	function step(now) {
		const t = Math.min(1, (now - t0) / CAMERA_ANIM_MS);
		const eased = 1 - (1 - t) * (1 - t);
		cameraY = from + (to - from) * eased;
		drawState();
		if (t < 1) {
			cameraAnim = requestAnimationFrame(step);
			return;
		}
		cameraY = to;
		cameraAnim = null;
		pruneSouth();
		drawState();
	}
	cameraAnim = requestAnimationFrame(step);
}

function maybeAdvanceMaze() {
	if (!isInfinite() || !session_active || !Number.isInteger(player_position.y)) {
		return;
	}
	if (player_position.y > cameraTargetY) {
		return;
	}
	loadNextSegment();
	cameraTargetY -= SEGMENT_ROWS;
	startCameraAnim();
}

function connectPoints(points, color, pathwidth) {
	ctx.beginPath();
	for (let i = 0; i < points.length - 1; i++) {
		ctx.moveTo(tileScreenX(points[i].x) + tile_size / 2, tileScreenY(points[i].y) + tile_size / 2);
		ctx.lineTo(tileScreenX(points[i + 1].x) + tile_size / 2, tileScreenY(points[i + 1].y) + tile_size / 2);
	}
	ctx.lineWidth = Math.round(tile_stroke * 1.5 * pathwidth);
	ctx.strokeStyle = color;
	ctx.stroke();
}

function drawstalledTiles() {
	for (let i = 0; i < stalled_tiles.length; i++) {
		if (!isOnScreen(stalled_tiles[i].y)) {
			continue;
		}
		drawMazeTile(stalled_tiles[i].x, stalled_tiles[i].y, color_tilestal);
	}
}

function drawPassedTiles() {
	for (let i = 0; i < path_taken.length; i++) {
		if (!isOnScreen(path_taken[i].y)) {
			continue;
		}
		drawPathTile(path_taken[i].x, path_taken[i].y);
	}
}

function drawText() {
	ctx.textAlign = "center";
	ctx.fillStyle = "#FFFFFF";
	for (let x = 0; x < maze_width; x++) {
		for (let y = 0; y < maze_height; y++) {
			if (maze[x][y]) {
				ctx.fillText(`(${weighted_maze[x][y]})`, x*tile_size + tile_size*0.5, y*tile_size + tile_size*0.5);
			}
		}
	}
}

function drawCoords() {
	ctx.textAlign = "center";
	ctx.fillStyle = "#FFFFFF";
	for (let x = 0; x < maze_width; x++) {
		for (let y = 0; y < maze_height; y++) {
			if (maze[x][y]) {
				ctx.fillText(`(${x}, ${y})`, x*tile_size + tile_size*0.5, y*tile_size + tile_size*0.5);
			}
		}
	}
}

function isValidMove(current_tile, target_tile) {
	if (target_tile.x < 0 || target_tile.x > maze_width - 1) { // x overflow
		return false;
	}
	if (target_tile.y < 0 || target_tile.y > maze_height - 1) { // y overflow
		return false;
	}
	if (!maze[target_tile.x][target_tile.y]) { // tile clicked is not safe
		return false;
	}
	let move_passed_tiles = getPassedTiles(current_tile, target_tile);
	for (let i = 0; i < move_passed_tiles.length; i++) {
		if (!maze[move_passed_tiles[i].x][move_passed_tiles[i].y]) {
			return false;
		}
	}
	return true;
}

function solveMaze() {
	optimal_tickpos = new Array();
	optimal_halftickpos = new Array();
	optimal_tickpos.push(new Point(start_pos.x, start_pos.y));
	while (optimal_tickpos[optimal_tickpos.length - 1].y > 0) {
		let c = new Point(optimal_tickpos[optimal_tickpos.length - 1].x, optimal_tickpos[optimal_tickpos.length - 1].y);
		let possible_moves = [             // we only care about tiles ahead of us (i.e. not south)
			new Point(c.x - 2, c.y - 2),   // row of 5 tiles, 2 rows north of current position
			new Point(c.x - 1, c.y - 2),
			new Point(c.x, c.y - 2),
			new Point(c.x + 1, c.y - 2),
			new Point(c.x + 2, c.y - 2),
			new Point(c.x - 2, c.y - 1),   // row of 5 tiles, 1 row north of current position
			new Point(c.x - 1, c.y - 1),
			new Point(c.x, c.y - 1),
			new Point(c.x + 1, c.y - 1),
			new Point(c.x + 2, c.y - 1),
			new Point(c.x - 2, c.y),       // row of 4 tiles (not including our current position) in the current row
			new Point(c.x - 1, c.y),
			new Point(c.x + 1, c.y),
			new Point(c.x + 2, c.y)
		];
		for (let i = 0; i < possible_moves.length; i++) {
			if (!isValidMove(c, possible_moves[i])) {
				possible_moves.splice(i, 1); // remove invalid moves from array
				i--;
			}
		}
		let best_move = new Point(-1, -1);
		let best_move_score = -1;
		for (let i = 0; i < possible_moves.length; i++) {
			if (weighted_maze[possible_moves[i].x][possible_moves[i].y] > best_move_score) {
				best_move = new Point(possible_moves[i].x, possible_moves[i].y);
				best_move_score = weighted_maze[possible_moves[i].x][possible_moves[i].y];
			}
		}
		optimal_tickpos.push(new Point(best_move.x, best_move.y));
		let move_halftick = getPassedTiles(optimal_tickpos[optimal_tickpos.length - 2], optimal_tickpos[optimal_tickpos.length - 1]);
		for (let i = 0; i < move_halftick.length; i++) {
			optimal_halftickpos.push(move_halftick[i]);
		}
		optimal_halftickpos.unshift(start_pos);
	}
}

function drawScore() {
	let buffer = tile_size * 0.5;
	let text_x = 0 + buffer;
	if (seed[path_turns - 1] < maze_width / 2) {
		text_x = maze_width * tile_size - buffer;
		ctx.textAlign = "end";
	} else {
		ctx.textAlign = "start";
	}

	let strYourPath = `Your path: ${moves.length}`;
	if (stalled_tiles.length > 0) {
		strYourPath += `+${stalled_tiles.length} stalled`
	}
	let strComputerPath = `Optimal path: ${optimal_tickpos.length}`;
	ctx.strokeStyle = "black";
	ctx.fillStyle = color_lineplay;
	ctx.strokeText(strYourPath, text_x, solv_fontsize * 1.5);
	ctx.fillText(strYourPath, text_x, solv_fontsize * 1.5);
	ctx.fillStyle = color_linesolv;
	ctx.strokeText(strComputerPath, text_x, solv_fontsize * 3);
	ctx.fillText(strComputerPath, text_x, solv_fontsize * 3);
}

function drawEndGame() {
	connectPoints(optimal_halftickpos, color_linesolv, 1);
	connectPoints(path_taken, color_lineplay, 1);
	drawPassedTiles();
	drawSolutionMoves();
	drawUserMoves();
	drawScore();
}

function drawSolutionMoves() {
	ctx.lineWidth = solv_fontsize/3;
	ctx.textAlign = "center";
	ctx.fillStyle = color_linesolv;
	ctx.strokeStyle = "black";
	ctx.font = `bold ${solv_fontsize}px ${solv_font}`;
	for (let i = 0; i < optimal_tickpos.length; i++) {
		ctx.strokeText(`${i+1}`, tileScreenX(optimal_tickpos[i].x) + tile_size*0.5, tileScreenY(optimal_tickpos[i].y) + offset_optimal + tile_size*0.5 + solv_fontsize*0.3);
		ctx.fillText(`${i+1}`, tileScreenX(optimal_tickpos[i].x) + tile_size*0.5, tileScreenY(optimal_tickpos[i].y) + offset_optimal + tile_size*0.5 + solv_fontsize*0.3);
	}
}

function drawUserMoves() {
	ctx.lineWidth = solv_fontsize/3;
	ctx.textAlign = "center";
	ctx.fillStyle = color_lineplay;
	ctx.strokeStyle = "black";
	ctx.font = `bold ${solv_fontsize}px ${solv_font}`;
	for (let i = 0; i < moves.length; i++) {
		ctx.strokeText(`${i+1}`, tileScreenX(moves[i].x) + tile_size*0.5, tileScreenY(moves[i].y) + offset_user + tile_size*0.5 + solv_fontsize*0.3);
		ctx.fillText(`${i+1}`, tileScreenX(moves[i].x) + tile_size*0.5, tileScreenY(moves[i].y) + offset_user + tile_size*0.5 + solv_fontsize*0.3);
	}
}

function getNextPathTile(c_pos, o_pos) {
	let neighbors = Array(4);
	neighbors[0] = new Point(c_pos.x, c_pos.y + 1);
	neighbors[1] = new Point(c_pos.x + 1, c_pos.y);
	neighbors[2] = new Point(c_pos.x, c_pos.y - 1);
	neighbors[3] = new Point(c_pos.x - 1, c_pos.y);
	for (let i = 0; i < neighbors.length; i++) {
		if (neighbors[i].x < 0 || neighbors[i].x >= maze_width) {
			continue;
		}
		if (neighbors[i].y < 0 || neighbors[i].y >= maze_height){
			continue;
		}
		if (maze[neighbors[i].x][neighbors[i].y] == false) {
			continue;
		}
		if (o_pos.x == neighbors[i].x && o_pos.y == neighbors[i].y) {
			continue;
		}
		return neighbors[i];
	}
	return null;
}

function formatSeed(values) {
	return values.map((n) => String(n).padStart(2, "0")).join("");
}

function parseSeed(raw) {
	const compact = raw.replace(/\D/g, "");
	if (compact.length === path_turns * 2) {
		const values = [];
		for (let i = 0; i < compact.length; i += 2) {
			values.push(Number(compact.slice(i, i + 2)));
		}
		if (values.every((n) => Number.isInteger(n) && n >= 0 && n < maze_width)) {
			return values;
		}
		return null;
	}
	if (compact.length === path_turns) {
		return compact.split("").map(Number);
	}
	return null;
}

function sameSeed(a, b) {
	return a.length === b.length && a.every((n, i) => n === b[i]);
}

function applySeedInput() {
	const input = document.getElementById("seed");
	const parsed = parseSeed(input.value);
	if (!parsed) {
		input.classList.add("is-invalid");
		input.value = formatSeed(seed);
		return;
	}
	input.classList.remove("is-invalid");
	if (sameSeed(parsed, seed)) {
		input.value = formatSeed(seed);
		return;
	}
	seed = parsed;
	reset();
}

function getPassedTiles(previous, target) {
	let current = new Point(previous.x, previous.y);
	let result = new Array();
	while (result.length < 2 && !(current.x == target.x && current.y == target.y)) {
		let movement_vector = new Point(target.x - current.x, target.y - current.y);
		if (Math.abs(movement_vector.x) == Math.abs(movement_vector.y)) { // diagonal
			current.x += (current.x < target.x ? 1 : -1);
			current.y += (current.y < target.y ? 1 : -1);
		} else if (Math.abs(movement_vector.x) > Math.abs(movement_vector.y)) {
			current.x += (current.x < target.x ? 1 : -1);
		} else {
			current.y += (current.y < target.y ? 1 : -1);
		}
		result.push(new Point(current.x, current.y));
	}
	return result;
}

canvas.addEventListener('mousedown', function (event) {
	if (infiniteFinished) {
		return;
	}
	if (moves.length == 0 && !session_active) {
		session_active = true;
		player_position = new Point(start_pos.x, start_pos.y + 1); // start off-screen, 1 tile below first maze tile
		timerTick = setInterval(gameTick, tick_length);
		applyModeUi();
	}
	if (!isInfinite()) {
		if (player_position.y <= 0 || (player_position.x == tornado_position.x && player_position.y == tornado_position.y)) {
			return;
		}
	}
	let clickedTile = getTileClicked(event);
	targeted_tile = new Point(clickedTile.x, clickedTile.y);
	drawState();
});

function drawMoves() {
	for (let i = 0; i < moves.length; i++) {
		if (!isOnScreen(moves[i].y)) {
			continue;
		}
		drawMoveTile(moves[i].x, moves[i].y);
	}
}

function drawTornado() {
	if (!Number.isInteger(tornado_position.x) || !Number.isInteger(tornado_position.y)) {
		return;
	}
	if (!isOnScreen(tornado_position.y)) {
		return;
	}
	ctx.drawImage(imgTornado, tileScreenX(tornado_position.x)+tile_size*0.1, tileScreenY(tornado_position.y)+tile_size*0.1, tile_size*0.8, tile_size*0.8);
}

function drawState() {
	if (!maze && !mazeWorld) {
		return;
	}
	drawMaze();
	drawstalledTiles();
	drawPassedTiles();
	drawMoves();
	const atTarget = player_position.x == targeted_tile.x && player_position.y == targeted_tile.y;
	const tobDone = !isInfinite() && player_position.y <= 0;
	if (!atTarget && !tobDone && Number.isInteger(targeted_tile.x)) {
		drawTargetTile();
	}
	if (!isInfinite()) {
		drawTornado();
	}
	if (!isInfinite() && player_position.y <= 0) {
		drawEndGame();
	}
}

function showSolution() {
	if (isInfinite()) {
		return;
	}
	drawMaze();
	drawstalledTiles();
	drawPassedTiles();
	drawMoves();
	drawEndGame();
}

function readBest() {
	try {
		const raw = localStorage.getItem(BEST_KEY + durationId);
		return raw ? JSON.parse(raw) : null;
	} catch (err) {
		return null;
	}
}

function saveBestIfBetter() {
	if (!isInfinite() || ticks < 1) {
		return;
	}
	if (durationId === "inf" && ticks * tick_length < 10000) {
		return;
	}
	const stats = infiniteStats();
	const previous = readBest();
	if (previous && previous.tilesPerMin >= stats.tilesPerMin) {
		return;
	}
	try {
		localStorage.setItem(BEST_KEY + durationId, JSON.stringify({
			tiles: stats.tiles,
			tilesPerMin: stats.tilesPerMin,
			accuracy: stats.accuracy,
			stallsPerMin: stats.stallsPerMin,
			at: Date.now(),
		}));
	} catch (err) {
		return;
	}
}

function infiniteStats() {
	const minutes = Math.max((ticks * tick_length) / 60000, 1 / 60000);
	const tiles = path_taken.length;
	const accuracy = tiles ? (tiles_on_path / tiles) * 100 : 100;
	return {
		tiles,
		tilesPerMin: tiles / minutes,
		accuracy,
		stallsPerMin: ticks_stalled / minutes,
	};
}

function writePar() {
	if (isInfinite()) {
		const best = readBest();
		document.getElementById("par").textContent = best
			? `${best.tilesPerMin.toFixed(1)} t/m · ${best.accuracy.toFixed(0)}%`
			: "—";
		return;
	}
	document.getElementById("par").textContent =
		`${(optimal_tickpos.length * tick_length/1000).toFixed(1)}s · ${optimal_tickpos.length} ticks`;
}

function setMeter(id, text, grade) {
	const el = document.getElementById(id);
	el.textContent = text;
	el.className = grade ? `sote__meter sote__meter--${grade}` : "sote__meter";
}

function writeInfiniteTime() {
	const started = ticks > 0 || moves.length > 0;
	const stats = infiniteStats();
	let accGrade = "";
	let stall = "";
	if (started) {
		if (stats.accuracy >= 100) {
			accGrade = "good";
		} else if (stats.accuracy >= 90) {
			accGrade = "ok";
		} else {
			accGrade = "bad";
		}
		if (ticks_stalled === 0) {
			stall = "good";
		} else if (ticks_stalled <= 2) {
			stall = "ok";
		} else {
			stall = "bad";
		}
	}

	setMeter("timer-seconds", `${stats.tilesPerMin.toFixed(1)} t/m`, "");
	setMeter("timer-ticks", `${stats.accuracy.toFixed(0)}%`, accGrade);
	setMeter("timer-stalled", `${stats.stallsPerMin.toFixed(1)} stall/m`, stall);

	const limit = durationMs();
	const elapsed = ticks * tick_length;
	const remainingEl = document.getElementById("time-remaining");
	if (limit) {
		const left = Math.max(0, limit - elapsed);
		remainingEl.textContent = `${(left / 1000).toFixed(1)}s`;
	} else {
		remainingEl.textContent = `${(elapsed / 1000).toFixed(1)}s`;
	}

	const note = document.getElementById("timer-note");
	const parts = [];
	if (infiniteFinished && limit) {
		parts.push("Time");
	}
	if (team_damaged) {
		parts.push("Damaged your team");
	}
	if (parts.length) {
		note.hidden = false;
		note.textContent = parts.join(" · ") + "!";
	} else {
		note.hidden = true;
		note.textContent = "";
	}
}

function writeTime() {
	if (isInfinite()) {
		writeInfiniteTime();
		return;
	}
	const started = ticks > 0 || moves.length > 0;
	const finished = player_position && player_position.y <= 0;
	const caught = Boolean(
		started &&
		tornado_position &&
		Number.isInteger(tornado_position.x) &&
		Number.isInteger(player_position.x) &&
		player_position.x == tornado_position.x &&
		player_position.y == tornado_position.y
	);
	const done = finished || caught;
	const skippedStart = moves.length > 0 && moves[0].y != maze_height - 1;
	const failed = team_damaged || skippedStart || caught;
	const over = ticks - optimal_tickpos.length;

	let pace = "";
	if (started && done) {
		if (!failed && over <= 0) {
			pace = "good";
		} else if (!failed && over <= 2) {
			pace = "ok";
		} else {
			pace = "bad";
		}
	} else if (started && over > 0) {
		pace = "bad";
	}

	let stall = "";
	if (started && done) {
		if (ticks_stalled === 0 && !failed) {
			stall = "good";
		} else if (ticks_stalled <= 2 && !failed) {
			stall = "ok";
		} else if (ticks_stalled === 0) {
			stall = "ok";
		} else {
			stall = "bad";
		}
	} else if (started) {
		if (ticks_stalled >= 3) {
			stall = "bad";
		} else if (ticks_stalled >= 1) {
			stall = "ok";
		}
	}

	setMeter("timer-seconds", `${(ticks * tick_length/1000).toFixed(1)}s`, pace);
	setMeter("timer-ticks", `${ticks} ticks`, pace);
	setMeter("timer-stalled", `${ticks_stalled} stalled`, stall);

	const note = document.getElementById("timer-note");
	const parts = [];
	if (skippedStart) {
		parts.push("Skipped the first tile");
	}
	if (team_damaged) {
		parts.push("Damaged your team");
	}
	if (caught) {
		parts.push("Caught by the tornado");
	}
	if (parts.length) {
		note.hidden = false;
		note.textContent = parts.join(" · ") + "!";
	} else {
		note.hidden = true;
		note.textContent = "";
	}
}

function writeSeed() {
	const input = document.getElementById("seed");
	if (document.activeElement === input) {
		return;
	}
	input.classList.remove("is-invalid");
	if (!seed) {
		return;
	}
	input.value = formatSeed(seed);
}

function endInfiniteRun() {
	session_active = false;
	infiniteFinished = true;
	clearInterval(timerTick);
	saveBestIfBetter();
	writePar();
	applyModeUi();
	writeTime();
	drawState();
}

function gameTick() {
	if (!isInfinite()) {
		if (tornado_active || player_position.y <= maze_height - tornado_row) {
			tornado_active = true;
			tornado_position = path_coordinates.shift();
		}
	}
	if ((player_position.x == targeted_tile.x && player_position.y == targeted_tile.y)) {
		ticks_stalled += 1;
		stalled_tiles.push(new Point(player_position.x, player_position.y));
	}
	ticks += 1;
	let new_tiles = getPassedTiles(player_position, targeted_tile);
	for (let i = 0; i < new_tiles.length; i++) {
		path_taken.push(new_tiles[i]);
		if (isPath(new_tiles[i].x, new_tiles[i].y)) {
			tiles_on_path += 1;
		}
	}
	if (new_tiles.length > 0) {
		moves.push(new_tiles[new_tiles.length - 1]);
		player_position = new Point(path_taken[path_taken.length - 1].x, path_taken[path_taken.length - 1].y);
	}
	if (isInfinite()) {
		maybeAdvanceMaze();
	}
	drawState();
	if (!isInfinite()) {
		if (player_position.y <= 0 || (player_position.x == tornado_position.x && player_position.y == tornado_position.y)) {
			session_active = false;
			clearInterval(timerTick);
		}
	} else {
		const limit = durationMs();
		if (limit && ticks * tick_length >= limit) {
			endInfiniteRun();
			return;
		}
	}
	writeTime();
	
	// Testing time between ticks (on my PC varies from 590-610 ms, which is actually better than OSRS servers)
	// if (time_a) {
	// 	time_b = performance.now();
	// 	console.log(time_b - time_a);
	// 	time_a = performance.now();
	// } else {
	// 	time_a = performance.now();
	// }
}

function runStats(amount) {
	let ticksStats = {};
	let start = performance.now();
	for (let i = 0; i < amount; i++) {
		newSession();
		if (ticksStats[optimal_tickpos.length]) {
			ticksStats[optimal_tickpos.length] += 1;
		} else {
			ticksStats[optimal_tickpos.length] = 1;
		}
	}
	let end = performance.now();
	let strStats = `Results from ${amount} mazes (${end - start} ms):`;
	for (let result in ticksStats) {
		strStats += `\n${result} ticks: ${ticksStats[result]}`;
	}
	alert(strStats);
}

function resetvars() {
	tornado_active = false;
	team_damaged = false;
	ticks = 0;
	ticks_stalled = 0;
	tiles_on_path = 0;
	stalled_tiles = new Array();
	session_active = false;
	infiniteFinished = false;
	clearInterval(timerTick);
	if (cameraAnim) {
		cancelAnimationFrame(cameraAnim);
		cameraAnim = null;
	}
	cameraY = 0;
	cameraTargetY = 0;
	moves = new Array();
	tornado_position = new Point();
	player_position = new Point();
	targeted_tile = new Point();
	path_taken = new Array();
	path_coordinates = new Array();
}

function newSession() {
	resetvars();
	if (isInfinite()) {
		startInfiniteWorld();
		applyModeUi();
		writePar();
		writeTime();
		drawState();
		return;
	}
	mazeWorld = null;
	maze = makeMaze();
	pathWeighting();
	solveMaze();
	drawMaze(maze);
	applyModeUi();
	writePar();
	writeTime();
	writeSeed();
}

function reset() {
	resetvars();
	if (isInfinite()) {
		startInfiniteWorld();
		applyModeUi();
		writePar();
		writeTime();
		drawState();
		return;
	}
	mazeWorld = null;
	maze = makeSeededMaze(seed);
	pathWeighting();
	solveMaze();
	drawMaze(maze);
	applyModeUi();
	writePar();
	writeTime();
	writeSeed();
}

function setPlayMode(next) {
	playMode = next === "infinite" ? "infinite" : "tob";
	syncUrl();
	newSession();
	resize();
}

function setDuration(next) {
	if (!Object.prototype.hasOwnProperty.call(DURATIONS, next)) {
		return;
	}
	durationId = next;
	syncUrl();
	if (isInfinite()) {
		newSession();
	}
}

function bindUi() {
	document.getElementById("btn-reset").addEventListener("click", reset);
	document.getElementById("btn-new").addEventListener("click", newSession);
	document.getElementById("btn-solution").addEventListener("click", showSolution);
	document.getElementById("btn-instructions").addEventListener("click", showInstructions);
	document.getElementById("btn-about").addEventListener("click", showAbout);
	document.getElementById("mode-select").addEventListener("change", (event) => {
		setPlayMode(event.target.value);
	});
	document.getElementById("duration-select").addEventListener("change", (event) => {
		setDuration(event.target.value);
	});
	const seedInput = document.getElementById("seed");
	seedInput.addEventListener("input", () => {
		seedInput.classList.remove("is-invalid");
		seedInput.value = seedInput.value.replace(/\D/g, "").slice(0, 16);
	});
	seedInput.addEventListener("blur", applySeedInput);
	seedInput.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			seedInput.blur();
		}
	});
	window.addEventListener("resize", resize);
}

var tornado_position;
var tornado_active;
var team_damaged;
var start_pos;
var end_pos;
var path_coordinates;
var ticks;
var ticks_stalled;
var tiles_on_path;
var stalled_tiles;
var timerTick;
var session_active;
var infiniteFinished;
var seed;
var maze;
var mazeWorld;
var weighted_maze;
var moves;
var optimal_tickpos;
var optimal_halftickpos;
var player_position;
var targeted_tile;
var path_taken;
var playMode;
var durationId;
var cameraY;
var cameraTargetY;
var cameraAnim;
var worldNorthY;
var worldSouthY;
var infinitePathX;

// var time_a;
// var time_b;

readUrlState();
bindUi();
newSession();
resize();
