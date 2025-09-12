/* =========================
   Neon Tetris — Cyber Mod
   ========================= */
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const V_COLS = 10, V_ROWS = 20;
const CELL = Math.floor(canvas.height / V_ROWS);
const OFF_X = Math.floor((canvas.width - V_COLS * CELL) / 2);
const OFF_Y = 0;

const nextCanvas = document.getElementById('next');
const nctx = nextCanvas.getContext('2d');

const startBtn = document.getElementById('start');
const pauseBtn = document.getElementById('pause');
const modeClockBtn = document.getElementById('modeClock');
const uiScore = document.getElementById('uiScore');
const uiLevel = document.getElementById('uiLevel');
const uiCombo = document.getElementById('uiCombo');
const pu1c = document.getElementById('pu1c');
const pu2c = document.getElementById('pu2c');
const pu3c = document.getElementById('pu3c');
const floatingLayer = document.getElementById('floatingLayer');
const gameOverScreen = document.getElementById('gameOverScreen');
const pauseScreen = document.getElementById('pauseScreen');
const finalScore = document.getElementById('finalScore');
const restartBtn = document.getElementById('restartBtn');
const closeBtn = document.getElementById('closeBtn');

/* ------------------- Templates & Colors ------------------- */
const TEMPLATES = {
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    O: [[1, 1], [1, 1]],
    L: [[0, 2, 0], [0, 2, 0], [0, 2, 2]],
    J: [[0, 3, 0], [0, 3, 0], [3, 3, 0]],
    I: [[4, 4, 4, 4]],
    S: [[0, 5, 5], [5, 5, 0], [0, 0, 0]],
    Z: [[6, 6, 0], [0, 6, 6], [0, 0, 0]]
};
const COLORS = [null, '#00ffd5', '#ff2d95', '#7a5cff', '#ffd54d', '#6aff9c', '#4dd0ff', '#ff7ab6', '#fff', '#ff0000', '#0000ff'];

/* ------------------- Game State ------------------- */
let arena, player, nextPiece = randomPiece();
let gravityTimer = 0,
    gravityInterval = 600;
let running = false,
    modeClock = false,
    clockRemaining = 60;
let combo = 0,
    portalTimer = 0;
let floatingScores = [],
    particles = [];
let pu = {
    bomb: 0,
    laser: 0,
    slow: 0
};
let lastTime = performance.now();
let nextAngle = 0;
let animationFrame;
let specialBlocks = [];

/* ------------------- Utilities ------------------- */
function createMatrix(w, h) {
    const m = [];
    for (let y = 0; y < h; y++) m[y] = new Array(w).fill(0);
    return m;
}

function copyMatrix(m) {
    return m.map(r => r.slice());
}

function randomPiece() {
    const keys = Object.keys(TEMPLATES);
    const k = keys[Math.floor(Math.random() * keys.length)];
    const newPiece = {
        type: k,
        shape: copyMatrix(TEMPLATES[k]),
        color: 1 + keys.indexOf(k) % 7,
        special: null
    };

    if (Math.random() < 0.05) {
        const specialTypes = ['bomb', 'laser', 'slow'];
        const specialType = specialTypes[Math.floor(Math.random() * specialTypes.length)];
        newPiece.special = specialType;
        switch (specialType) {
            case 'bomb':
                newPiece.color = 9;
                break;
            case 'laser':
                newPiece.color = 10;
                break;
            case 'slow':
                newPiece.color = 8;
                break;
        }
    }
    return newPiece;
}

function createPlayer() {
    return {
        pos: {
            x: Math.floor(V_COLS / 2) - 1,
            y: 0
        },
        shape: null,
        color: 1,
        special: null,
        stuckTimer: 0,
        score: 0,
        level: 1,
        inventory: {
            bomb: 0,
            laser: 0,
            slow: 0
        }
    };
}

function collideAt(shape, x0, y0) {
    for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c]) {
                const gx = x0 + c,
                    gy = y0 + r;
                if (gx < 0 || gx >= V_COLS || gy >= V_ROWS) return true;
                if (gy >= 0 && arena[gy][gx]) return true;
            }
        }
    }
    return false;
}

function rotateShape(shape) {
    const H = shape.length,
        W = shape[0].length;
    const out = Array.from({
        length: W
    }, () => new Array(H).fill(0));
    for (let r = 0; r < H; r++)
        for (let c = 0; c < W; c++) out[c][H - 1 - r] = shape[r][c];
    return out;
}

function projectY(pl) {
    if (!pl.shape) return 0;
    let y = pl.pos.y;
    while (!collideAt(pl.shape, pl.pos.x, y + 1)) y++;
    return y;
}

/* ------------------- Drawing ------------------- */
function drawCell(x, y, size, color, glow) {
    if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
    } else ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.fillRect(x + 4, y + 4, size - 8, size - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 6, y + 6, (size - 12) / 2, (size - 12) / 2);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeRect(x + 4, y + 4, size - 8, size - 8);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#02060b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const boardW = V_COLS * CELL,
        boardH = V_ROWS * CELL;
    const bx = OFF_X,
        by = OFF_Y;
    ctx.fillStyle = 'rgba(10,10,18,0.8)';
    ctx.fillRect(bx - 6, by - 6, boardW + 12, boardH + 12);
    ctx.fillStyle = '#070813';
    ctx.fillRect(bx, by, boardW, boardH);

    if (arena) {
        for (let y = 0; y < V_ROWS; y++) {
            for (let x = 0; x < V_COLS; x++) {
                const v = arena[y][x];
                if (v !== 0) {
                    const isPowerBlock = v >= 8;
                    drawCell(bx + x * CELL, by + y * CELL, CELL, COLORS[v] || COLORS[7], isPowerBlock);
                }
            }
        }
    }

    if (player && player.shape) {
        const projYVal = projectY(player);
        for (let r = 0; r < player.shape.length; r++) {
            for (let c = 0; c < player.shape[r].length; c++) {
                if (player.shape[r][c]) {
                    const px = bx + (player.pos.x + c) * CELL,
                        py = by + (projYVal + r) * CELL;
                    ctx.fillStyle = 'rgba(0,0,0,0.25)';
                    ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8);
                }
            }
        }
    }

    if (player && player.shape) {
        for (let r = 0; r < player.shape.length; r++) {
            for (let c = 0; c < player.shape[r].length; c++) {
                if (player.shape[r][c]) {
                    const px = bx + (player.pos.x + c) * CELL,
                        py = by + (player.pos.y + r) * CELL;
                    drawCell(px, py, CELL, COLORS[player.color] || '#fff', true);
                }
            }
        }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= V_COLS; i++) {
        ctx.beginPath();
        ctx.moveTo(bx + i * CELL, by);
        ctx.lineTo(bx + i * CELL, by + boardH);
        ctx.stroke();
    }
    for (let j = 0; j <= V_ROWS; j++) {
        ctx.beginPath();
        ctx.moveTo(bx, by + j * CELL);
        ctx.lineTo(bx + boardW, by + j * CELL);
        ctx.stroke();
    }

    drawParticles();
    drawFloating();
    drawNext();

    if (modeClock) {
        ctx.fillStyle = '#ff2d95';
        ctx.fillRect(OFF_X, canvas.height - 6, (V_COLS * CELL) * (clockRemaining / 60), 4);
    }
}

/* ------------------- Particles / Floating ------------------- */
function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, CELL * 0.04), 0, Math.PI * 2);
        ctx.fill();
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12;
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }
    if (portalTimer > 0) {
        portalTimer--;
        const cx = OFF_X + V_COLS * CELL / 2,
            cy = OFF_Y + V_ROWS * CELL / 2,
            r = 60 + (180 - portalTimer) * 0.6;
        ctx.strokeStyle = 'rgba(122,92,255,0.12)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawFloating() {
    for (let i = floatingScores.length - 1; i >= 0; i--) {
        const s = floatingScores[i];
        s.y += s.vy;
        s.vy *= 0.995;
        s.life--;
        if (!s.el) {
            s.el = document.createElement('div');
            s.el.className = 'floatingScore';
            s.el.style.left = s.x + 'px';
            s.el.style.top = s.y + 'px';
            s.el.style.fontSize = '18px';
            s.el.style.opacity = '1';
            s.el.style.color = s.color;
            s.el.style.textShadow = `0 0 8px ${s.color},0 0 16px ${s.color}`;
            floatingLayer.appendChild(s.el);
        }
        s.el.textContent = s.text;
        s.el.style.left = s.x + 'px';
        s.el.style.top = s.y + 'px';
        s.el.style.opacity = Math.max(0, s.life / 120);
        if (s.life <= 0) {
            floatingLayer.removeChild(s.el);
            floatingScores.splice(i, 1);
        }
    }
}

/* ------------------- Gameplay ------------------- */
function placePiece() {
    if (!player.shape) return;
    const currentSpecial = player.special;

    for (let r = 0; r < player.shape.length; r++) {
        for (let c = 0; c < player.shape[r].length; c++) {
            if (player.shape[r][c]) {
                const gx = player.pos.x + c,
                    gy = player.pos.y + r;
                if (gy >= 0 && gy < V_ROWS && gx >= 0 && gx < V_COLS) {
                    arena[gy][gx] = player.color || 7;
                    if (currentSpecial) {
                        specialBlocks.push({
                            x: gx,
                            y: gy,
                            type: currentSpecial
                        });
                    }
                }
            }
        }
    }
    spawnLandSparks(OFF_X + player.pos.x * CELL, OFF_Y + player.pos.y * CELL, COLORS[player.color]);
    clearLines();
    checkGameOver();
    player.shape = null;
}

function clearLines() {
    let linesCleared = 0;
    let rowsToDelete = [];
    let powersGained = [];

    for (let y = V_ROWS - 1; y >= 0; y--) {
        if (arena[y].every(v => v !== 0)) {
            rowsToDelete.push(y);
        }
    }

    if (rowsToDelete.length === 0) {
        combo = 0;
        uiCombo.textContent = 'x' + Math.max(1, combo + 1);
        return 0;
    }

    for (const row of rowsToDelete) {
        spawnLineParticles(row);
        specialBlocks = specialBlocks.filter(block => {
            if (block.y === row) {
                powersGained.push(block.type);
                return false;
            }
            return true;
        });
    }

    const newArena = createMatrix(V_COLS, V_ROWS);
    let newY = V_ROWS - 1;
    for (let y = V_ROWS - 1; y >= 0; y--) {
        if (!rowsToDelete.includes(y)) {
            newArena[newY] = arena[y];
            newY--;
        }
    }
    arena = newArena;
    linesCleared = rowsToDelete.length;

    powersGained.forEach(power => {
        if (pu.hasOwnProperty(power)) {
            pu[power]++;
        }
    });

    const scoreGain = linesCleared * 100 * Math.max(1, combo + 1);
    player.score += scoreGain;
    combo = (linesCleared > 1) ? combo + 1 : 0;
    uiCombo.textContent = 'x' + Math.max(1, combo + 1);
    floatingScores.push({
        x: OFF_X + CELL * 4,
        y: OFF_Y + CELL * 10,
        text: '+' + scoreGain,
        life: 120,
        vy: -0.6,
        color: '#ff2d95'
    });
    updateLevel();
    return linesCleared;
}

function spawnLineParticles(row) {
    for (let x = 0; x < V_COLS; x++) {
        for (let i = 0; i < 6; i++) {
            particles.push({
                x: OFF_X + x * CELL + CELL / 2 + (Math.random() - 0.5) * CELL * 0.6,
                y: OFF_Y + row * CELL + CELL / 2,
                vx: (Math.random() - 0.5) * 3,
                vy: -(Math.random() * 3 + 1),
                life: 60 + Math.random() * 30,
                col: COLORS[Math.floor(1 + Math.random() * 6)]
            });
        }
    }
}

function spawnLandSparks(px, py, color) {
    for (let i = 0; i < 10; i++) {
        particles.push({
            x: px + Math.random() * CELL,
            y: py + Math.random() * CELL,
            vx: (Math.random() - 0.5) * 4,
            vy: -Math.random() * 4,
            life: 40 + Math.random() * 30,
            col: color
        });
    }
}

/* ------------------- Level Update ------------------- */
function updateLevel() {
    player.level = Math.floor(player.score / 1000) + 1;
    gravityInterval = Math.max(100, 600 - (player.level - 1) * 50);
}

/* ------------------- Spawn / Drop ------------------- */
function spawnFromNext() {
    if (!nextPiece) return;
    player.shape = copyMatrix(nextPiece.shape);
    player.color = nextPiece.color || 7;
    player.special = nextPiece.special;
    player.pos.x = Math.floor((V_COLS - player.shape[0].length) / 2);
    player.pos.y = -1;
    nextPiece = randomPiece();
}

function hardDrop() {
    if (!player.shape) return;
    while (!collideAt(player.shape, player.pos.x, player.pos.y + 1)) player.pos.y++;
    placePiece();
}

/* ------------------- Game Over ------------------- */
function checkGameOver() {
    if (arena[0].some(v => v !== 0)) {
        running = false;
        endGame();
    }
}

function endGame() {
    finalScore.textContent = player.score;
    gameOverScreen.classList.add('visible');
    cancelAnimationFrame(animationFrame);
}

/* ------------------- Input ------------------- */
document.addEventListener('keydown', e => {
    // Apenas a tecla Escape pausa/despausa o jogo
    if (e.key === 'Escape') {
      if (running) {
        togglePause();
      } else if (pauseScreen.classList.contains('visible')) {
        togglePause();
      }
      return;
    }
    
    // As outras teclas de controle só funcionam se o jogo estiver rodando
    if (!running) return;

    if (!player.shape) return;

    if (e.key === 'ArrowLeft' && !collideAt(player.shape, player.pos.x - 1, player.pos.y)) player.pos.x--;
    else if (e.key === 'ArrowRight' && !collideAt(player.shape, player.pos.x + 1, player.pos.y)) player.pos.x++;
    else if (e.key === 'ArrowDown' && !collideAt(player.shape, player.pos.x, player.pos.y + 1)) player.pos.y++;
    else if (e.key === 'ArrowUp') {
        const r = rotateShape(player.shape);
        if (!collideAt(r, player.pos.x, player.pos.y)) player.shape = r;
    } else if (e.code === 'Space') hardDrop();
    else if (e.key === '1' && pu.bomb > 0) usePowerUp('bomb');
    else if (e.key === '2' && pu.laser > 0) usePowerUp('laser');
    else if (e.key === '3' && pu.slow > 0) usePowerUp('slow');
});

/* ------------------- Start / Restart ------------------- */
startBtn.addEventListener('click', () => {
    startGame();
});

pauseBtn.addEventListener('click', togglePause);

restartBtn.addEventListener('click', () => {
    startGame();
});

closeBtn.addEventListener('click', () => {
    gameOverScreen.classList.remove('visible');
});

modeClockBtn.addEventListener('click', () => {
    if (!running) {
        modeClock = true;
        startGame();
        clockRemaining = 60;
        modeClockBtn.textContent = 'Modo: Ataque';
    } else {
        modeClock = false;
        modeClockBtn.textContent = 'Modo Normal';
    }
});

function startGame() {
    gameOverScreen.classList.remove('visible');
    pauseScreen.classList.remove('visible');
    resetGame();
    running = true;
    lastTime = performance.now();
    loop();
    pauseBtn.textContent = 'Pause';
}

function togglePause() {
    running = !running;
    if (running) {
        pauseBtn.textContent = 'Pause';
        pauseScreen.classList.remove('visible');
        lastTime = performance.now();
        loop();
    } else {
        pauseBtn.textContent = 'Continuar';
        pauseScreen.classList.add('visible');
        cancelAnimationFrame(animationFrame);
    }
}

function resetGame() {
    arena = createMatrix(V_COLS, V_ROWS);
    player = createPlayer();
    nextPiece = randomPiece();
    player.score = 0;
    player.level = 1;
    combo = 0;
    portalTimer = 0;
    particles = [];
    floatingScores = [];
    specialBlocks = [];
    pu = {
        bomb: 0,
        laser: 0,
        slow: 0
    };
    gravityInterval = 600;
    running = false;
    clockRemaining = 60;
    refreshUI();
    clearFloatingLayer();
    gameOverScreen.classList.remove('visible');
}

/* ------------------- UI ------------------- */
function refreshUI() {
    uiScore.textContent = player.score || 0;
    uiLevel.textContent = player.level || 1;
    uiCombo.textContent = 'x' + Math.max(1, combo || 0);
    pu1c.textContent = pu.bomb + 'x';
    pu2c.textContent = pu.laser + 'x';
    pu3c.textContent = pu.slow + 'x';
}

function clearFloatingLayer() {
    while (floatingLayer.firstChild) floatingLayer.removeChild(floatingLayer.firstChild);
}

/* ------------------- Next Piece ------------------- */
function drawNext() {
    nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!nextPiece) return;

    nextAngle += 0.02;

    nctx.save();
    nctx.translate(nextCanvas.width / 2, nextCanvas.height / 2);
    nctx.rotate(Math.sin(nextAngle) * 0.5);

    const s = nextPiece.shape || [
        [1]
    ];
    const shapeWidth = s[0].length;
    const shapeHeight = s.length;

    const paddingFactor = 0.8;
    const u = Math.min(
        nextCanvas.width / (shapeWidth + paddingFactor),
        nextCanvas.height / (shapeHeight + paddingFactor)
    );

    const offsetX = -(shapeWidth * u) / 2;
    const offsetY = -(shapeHeight * u) / 2;

    for (let r = 0; r < s.length; r++) {
        for (let c = 0; c < s[r].length; c++) {
            if (s[r][c]) {
                nctx.fillStyle = COLORS[nextPiece.color || 7];
                const px = offsetX + c * u;
                const py = offsetY + r * u;
                nctx.fillRect(px + 1, py + 1, u - 2, u - 2);
                nctx.strokeStyle = 'rgba(0,0,0,0.5)';
                nctx.strokeRect(px + 1, py + 1, u - 2, u - 2);
            }
        }
    }
    nctx.restore();
}

/* ------------------- Power-ups ------------------- */
function usePowerUp(type) {
    if (!running) return;
    if (type === 'bomb' && pu.bomb > 0) {
        pu.bomb--;
        const bombX = Math.floor(V_COLS / 2);
        const bombY = Math.floor(V_ROWS / 2);
        for (let y = bombY - 1; y <= bombY + 1; y++) {
            for (let x = bombX - 1; x <= bombX + 1; x++) {
                if (y >= 0 && y < V_ROWS && x >= 0 && x < V_COLS) {
                    arena[y][x] = 0;
                }
            }
        }
        checkGameOver();

    } else if (type === 'laser' && pu.laser > 0) {
        pu.laser--;
        const linesToClear = [];
        while (linesToClear.length < 2 && linesToClear.length < V_ROWS) {
            const randomRow = Math.floor(Math.random() * V_ROWS);
            if (!linesToClear.includes(randomRow)) {
                linesToClear.push(randomRow);
            }
        }
        linesToClear.sort((a, b) => b - a);
        for (const row of linesToClear) {
            spawnLineParticles(row);
            arena.splice(row, 1);
            arena.unshift(new Array(V_COLS).fill(0));
        }

    } else if (type === 'slow' && pu.slow > 0) {
        pu.slow--;
        gravityInterval = 1000;
        setTimeout(() => {
            gravityInterval = Math.max(100, 600 - (player.level - 1) * 50);
        }, 5000);
    }
    refreshUI();
}

/* ------------------- Loop ------------------- */
let prev = performance.now();

function loop(now = performance.now()) {
    const dt = now - prev;
    prev = now;
    if (running) {
        gravityTimer += dt;
        if (modeClock) {
            clockRemaining -= dt / 1000;
            if (clockRemaining <= 0) {
                clockRemaining = 0;
                running = false;
                modeClock = false;
                endGame();
            }
        }
        if (!player.shape) spawnFromNext();
        else if (gravityTimer > gravityInterval) {
            if (!collideAt(player.shape, player.pos.x, player.pos.y + 1)) player.pos.y++;
            else placePiece();
            gravityTimer = 0;
        }
        draw();
        refreshUI();
        animationFrame = requestAnimationFrame(loop);
    }
}
