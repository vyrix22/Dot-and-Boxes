document.addEventListener('DOMContentLoaded', () => {
    // ============================
    //  PLAYER COLOR CONSTANTS
    // ============================
    const PLAYER_COLORS = {
        1: {
            main: '#ff4d6d',
            light: '#ff758f',
            glow: 'rgba(255, 77, 109, 0.45)',
            fill: 'rgba(255, 77, 109, 0.20)',
            shadow: '0 0 14px rgba(255, 77, 109, 0.45)'
        },
        2: {
            main: '#4cc9f0',
            light: '#72d5f5',
            glow: 'rgba(76, 201, 240, 0.45)',
            fill: 'rgba(76, 201, 240, 0.20)',
            shadow: '0 0 14px rgba(76, 201, 240, 0.45)'
        }
    };

    // ============================
    //  DOM REFERENCES
    // ============================
    const homeScreen = document.getElementById('home-screen');
    const gameScreen = document.getElementById('game-screen');
    const playVsPlayerButton = document.getElementById('play-vs-player-button');
    const playVsBotButton = document.getElementById('play-vs-bot-button');
    const exitButton = document.getElementById('exit-button');
    const menuButton = document.getElementById('menu-button');
    const settingsButton = document.getElementById('settings-button');
    const gameBoard = document.querySelector('.game-board');

    // ============================
    //  GAME STATE
    // ============================
    let currentPlayer = 1; // 1 = coral/red, 2 = cyan/blue
    let playerScores = [0, 0];
    const boardSize = { rows: 5, cols: 6 };
    let isDragging = false;
    let startDot = null;
    let currentLine = null;
    let playingVsBot = false;
    let soundEnabled = true;

    // ============================
    //  WEB AUDIO API SOUND ENGINE
    // ============================
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;

    function getAudioCtx() {
        if (!audioCtx) {
            audioCtx = new AudioCtx();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    // Factory: wraps a synthesis function as a duck-typed Audio object
    function synthSound(fn) {
        return {
            currentTime: 0,
            play() { fn(); return Promise.resolve(); }
        };
    }

    // --- Button Click: crisp short tap ---
    const buttonClickSound = synthSound(() => {
        const ctx = getAudioCtx();
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(800, t + 0.06);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.08);
    });

    // --- Line Draw: satisfying upward swoosh ---
    const lineDrawSound = synthSound(() => {
        const ctx = getAudioCtx();
        const t = ctx.currentTime;
        // Sine sweep
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(900, t + 0.12);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.linearRampToValueAtTime(0.12, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.18);
        // Soft noise layer
        const bufSize = ctx.sampleRate * 0.12;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.03;
        const noise = ctx.createBufferSource();
        const nGain = ctx.createGain();
        noise.buffer = buf;
        nGain.gain.setValueAtTime(0.08, t);
        nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        noise.connect(nGain).connect(ctx.destination);
        noise.start(t);
        noise.stop(t + 0.12);
    });

    // --- Box Complete: cheerful two-note chime ---
    const boxCompleteSound = synthSound(() => {
        const ctx = getAudioCtx();
        const t = ctx.currentTime;
        [660, 880].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t + i * 0.1);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.2, t + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.25);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t + i * 0.1);
            osc.stop(t + i * 0.1 + 0.25);
        });
    });

    // --- Win: ascending 4-note fanfare ---
    const winSound = synthSound(() => {
        const ctx = getAudioCtx();
        const t = ctx.currentTime;
        const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t + i * 0.15);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.22, t + i * 0.15 + 0.02);
            gain.gain.setValueAtTime(0.22, t + i * 0.15 + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + (i === 3 ? 0.6 : 0.3));
            osc.connect(gain).connect(ctx.destination);
            osc.start(t + i * 0.15);
            osc.stop(t + i * 0.15 + (i === 3 ? 0.6 : 0.3));
        });
    });

    // --- Lose: descending minor tone ---
    const loseSound = synthSound(() => {
        const ctx = getAudioCtx();
        const t = ctx.currentTime;
        const notes = [440, 370, 311]; // A4 F#4 Eb4
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t + i * 0.2);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.18, t + i * 0.2 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.2 + 0.35);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t + i * 0.2);
            osc.stop(t + i * 0.2 + 0.35);
        });
    });

    function playSound(sound) {
        if (soundEnabled && sound) {
            try {
                sound.currentTime = 0;
                sound.play().catch(() => { });
            } catch (e) {
                // Silently ignore audio errors
            }
        }
    }

    // ============================
    //  GAME INITIALIZATION
    // ============================
    function initGame() {
        createGameBoard();
        setupEventListeners();
        updatePlayerTurn();
        updateScores();
    }

    // Create game board with dots, lines, and boxes
    function createGameBoard() {
        gameBoard.innerHTML = '';

        const gridContainer = document.createElement('div');
        gridContainer.className = 'grid-container';
        gameBoard.appendChild(gridContainer);

        // Create dots
        for (let row = 0; row < boardSize.rows + 1; row++) {
            for (let col = 0; col < boardSize.cols + 1; col++) {
                const dot = document.createElement('div');
                dot.className = 'dot';
                const adjustedCol = col * (100 / boardSize.cols);
                const adjustedRow = row * (100 / boardSize.rows);
                dot.style.left = `${adjustedCol}%`;
                dot.style.top = `${adjustedRow}%`;
                dot.dataset.row = row;
                dot.dataset.col = col;

                dot.addEventListener('mousedown', (e) => startDrag(e, dot));
                dot.addEventListener('mouseup', (e) => endDrag(e, dot));
                dot.addEventListener('touchstart', (e) => startDrag(e, dot), { passive: false });
                dot.addEventListener('touchend', (e) => endDrag(e, dot));

                gridContainer.appendChild(dot);

                if (col < boardSize.cols) {
                    createLine('horizontal', row, col);
                }

                if (row < boardSize.rows) {
                    createLine('vertical', row, col);
                }
            }
        }
    }

    // Create a line (horizontal or vertical)
    function createLine(orientation, row, col) {
        const gridContainer = document.querySelector('.grid-container');
        const line = document.createElement('div');
        line.className = `${orientation}-line`;
        line.dataset.row = row;
        line.dataset.col = col;
        line.dataset.orientation = orientation;

        if (orientation === 'horizontal') {
            line.style.width = `${100 / boardSize.cols}%`;
            line.style.left = `${col * (100 / boardSize.cols)}%`;
            line.style.top = `${row * (100 / boardSize.rows)}%`;
            line.style.opacity = '0.5';
        } else {
            line.style.height = `${100 / boardSize.rows}%`;
            line.style.left = `${col * (100 / boardSize.cols)}%`;
            line.style.top = `${row * (100 / boardSize.rows)}%`;
            line.style.opacity = '0.5';
        }

        gridContainer.appendChild(line);
    }

    // ============================
    //  DRAG MECHANICS
    // ============================
    function startDrag(e, dot) {
        e.preventDefault();

        if (playingVsBot && currentPlayer === 2) return;

        isDragging = true;
        startDot = {
            row: parseInt(dot.dataset.row),
            col: parseInt(dot.dataset.col),
            element: dot
        };

        if (e.type === 'touchstart') {
            e.target.style.touchAction = 'none';
        }

        dot.classList.add('active');
        highlightPotentialConnections(startDot.row, startDot.col);

        currentLine = document.createElement('div');
        currentLine.className = 'temp-line';
        const gridContainer = document.querySelector('.grid-container');
        gridContainer.appendChild(currentLine);

        gridContainer.addEventListener('mousemove', updateDragLine);
        gridContainer.addEventListener('touchmove', updateDragLine, { passive: false });
    }

    function highlightPotentialConnections(row, col) {
        const adjacentPositions = [
            { row: row - 1, col: col },
            { row: row + 1, col: col },
            { row: row, col: col - 1 },
            { row: row, col: col + 1 }
        ];

        gameBoard.classList.add('active-selection');

        adjacentPositions.forEach(pos => {
            if (pos.row >= 0 && pos.row <= boardSize.rows &&
                pos.col >= 0 && pos.col <= boardSize.cols) {

                const adjacentDot = document.querySelector(`.dot[data-row="${pos.row}"][data-col="${pos.col}"]`);

                if (adjacentDot) {
                    let lineExists = false;

                    if (row === pos.row) {
                        const minCol = Math.min(col, pos.col);
                        const line = document.querySelector(`.horizontal-line[data-row="${row}"][data-col="${minCol}"]`);
                        lineExists = line && line.classList.contains('selected');
                    } else if (col === pos.col) {
                        const minRow = Math.min(row, pos.row);
                        const line = document.querySelector(`.vertical-line[data-row="${minRow}"][data-col="${col}"]`);
                        lineExists = line && line.classList.contains('selected');
                    }

                    if (!lineExists) {
                        adjacentDot.classList.add('potential-connection');
                    }
                }
            }
        });
    }

    function updateDragLine(e) {
        if (!isDragging || !startDot || !currentLine) return;

        if (e.type === 'touchmove') {
            e.preventDefault();
        }

        const gridContainer = document.querySelector('.grid-container');
        const rect = gridContainer.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;

        const startX = startDot.col * (100 / boardSize.cols) * rect.width / 100;
        const startY = startDot.row * (100 / boardSize.rows) * rect.height / 100;

        const dx = mouseX - startX;
        const dy = mouseY - startY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        const pColor = PLAYER_COLORS[currentPlayer];
        currentLine.style.width = `${length}px`;
        currentLine.style.height = '7px';
        currentLine.style.left = `${startX}px`;
        currentLine.style.top = `${startY}px`;
        currentLine.style.transformOrigin = 'left center';
        currentLine.style.transform = `rotate(${angle}deg)`;
        currentLine.style.backgroundColor = pColor.main;
        currentLine.style.boxShadow = pColor.shadow;
    }

        function endDrag(e, dot) {
        if (!isDragging || !startDot) return;

        let endRow = -1;
        let endCol = -1;

        if (e.type === 'touchend' && e.changedTouches) {
            const touch = e.changedTouches[0];
            const elementAtTouch = document.elementFromPoint(touch.clientX, touch.clientY);
            if (elementAtTouch && elementAtTouch.classList.contains('dot')) {
                dot = elementAtTouch;
                dot = elementAtTouch;
            } else {
                dot = null;
            }
        }

        if (dot === startDot.element) {
            dot = null;
        }

        if (dot && dot.classList && dot.classList.contains('dot')) {
            endRow = parseInt(dot.dataset.row);
            endCol = parseInt(dot.dataset.col);
        } else {
            // Smart Snap: calculate direction and length if they let go off a dot
            const clientX = (e.clientX !== undefined) ? e.clientX : (e.changedTouches ? e.changedTouches[0].clientX : undefined);
            const clientY = (e.clientY !== undefined) ? e.clientY : (e.changedTouches ? e.changedTouches[0].clientY : undefined);
            
            if (clientX !== undefined && clientY !== undefined) {
                const gridContainer = document.querySelector('.grid-container');
                const rect = gridContainer.getBoundingClientRect();
                const mouseX = clientX - rect.left;
                const mouseY = clientY - rect.top;

                const startX = startDot.col * (100 / boardSize.cols) * rect.width / 100;
                const startY = startDot.row * (100 / boardSize.rows) * rect.height / 100;

                const dx = mouseX - startX;
                const dy = mouseY - startY;
                const length = Math.sqrt(dx * dx + dy * dy);
                
                const cellWidth = rect.width / boardSize.cols;
                const cellHeight = rect.height / boardSize.rows;
                const minThreshold = Math.min(cellWidth, cellHeight) * 0.4; // 40% of cell distance

                if (length > minThreshold) {
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    endRow = startDot.row;
                    endCol = startDot.col;
                    
                    if (angle > -45 && angle <= 45) {
                        endCol += 1; // right
                    } else if (angle > 45 && angle <= 135) {
                        endRow += 1; // down
                    } else if (angle > 135 || angle <= -135) {
                        endCol -= 1; // left
                    } else if (angle > -135 && angle <= -45) {
                        endRow -= 1; // up
                    }
                }
            }
        }

        // Validate and draw if bounds are correct
        if (endRow >= 0 && endRow <= boardSize.rows && endCol >= 0 && endCol <= boardSize.cols) {
            if (startDot.row !== endRow || startDot.col !== endCol) {
                const rowDiff = Math.abs(startDot.row - endRow);
                const colDiff = Math.abs(startDot.col - endCol);

                if ((rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1)) {
                    let orientation, lineRow, lineCol;

                    if (rowDiff === 0) {
                        orientation = 'horizontal';
                        lineRow = endRow;
                        lineCol = Math.min(startDot.col, endCol);
                    } else {
                        orientation = 'vertical';
                        lineRow = Math.min(startDot.row, endRow);
                        lineCol = endCol;
                    }

                    const line = document.querySelector('.' + orientation + '-line[data-row="' + lineRow + '"][data-col="' + lineCol + '"]');

                    if (line && !line.classList.contains('selected')) {
                        drawLine(line);
                    }
                }
            }
        }

        cleanupDrag();
    }

    // ============================
    //  DRAW LINE & GAME LOGIC
    // ============================
    function drawLine(line) {
        const pColor = PLAYER_COLORS[currentPlayer];
        line.classList.add('selected');
        line.style.backgroundColor = pColor.main;
        line.style.boxShadow = pColor.shadow;

        playSound(lineDrawSound);

        const boxesCompleted = checkBoxCompletion(line);

        if (!boxesCompleted) {
            switchPlayer();

            if (playingVsBot && currentPlayer === 2) {
                setTimeout(makeBotMove, 750);
            }
        } else {
            if (playingVsBot && currentPlayer === 2) {
                setTimeout(makeBotMove, 750);
            }
        }

        updatePlayerTurn();
        updateScores();

        if (isGameOver()) {
            handleGameOver();
        }
    }

    function cleanupDrag() {
        if (currentLine) {
            currentLine.remove();
            currentLine = null;
        }

        if (startDot && startDot.element) {
            startDot.element.classList.remove('active');
        }

        const potentialDots = document.querySelectorAll('.dot.potential-connection');
        potentialDots.forEach(dot => {
            dot.classList.remove('potential-connection');
            dot.style.touchAction = '';
        });

        isDragging = false;
        startDot = null;

        gameBoard.classList.remove('active-selection');

        const gridContainer = document.querySelector('.grid-container');
        if (gridContainer) {
            gridContainer.removeEventListener('mousemove', updateDragLine);
            gridContainer.removeEventListener('touchmove', updateDragLine);
        }
    }

    // ============================
    //  BOX COMPLETION
    // ============================
    function checkBoxCompletion(line) {
        const row = parseInt(line.dataset.row);
        const col = parseInt(line.dataset.col);
        const orientation = line.dataset.orientation;
        let boxesCompleted = 0;

        if (orientation === 'horizontal') {
            if (row > 0) {
                if (isBoxComplete(row - 1, col)) {
                    completeBox(row - 1, col);
                    boxesCompleted++;
                }
            }

            if (row < boardSize.rows) {
                if (isBoxComplete(row, col)) {
                    completeBox(row, col);
                    boxesCompleted++;
                }
            }
        } else {
            if (col > 0) {
                if (isBoxComplete(row, col - 1)) {
                    completeBox(row, col - 1);
                    boxesCompleted++;
                }
            }

            if (col < boardSize.cols) {
                if (isBoxComplete(row, col)) {
                    completeBox(row, col);
                    boxesCompleted++;
                }
            }
        }

        return boxesCompleted > 0;
    }

    function isBoxComplete(row, col) {
        const topLine = document.querySelector(`.horizontal-line[data-row="${row}"][data-col="${col}"]`);
        const bottomLine = document.querySelector(`.horizontal-line[data-row="${row + 1}"][data-col="${col}"]`);
        const leftLine = document.querySelector(`.vertical-line[data-row="${row}"][data-col="${col}"]`);
        const rightLine = document.querySelector(`.vertical-line[data-row="${row}"][data-col="${col + 1}"]`);

        return (
            topLine && topLine.classList.contains('selected') &&
            bottomLine && bottomLine.classList.contains('selected') &&
            leftLine && leftLine.classList.contains('selected') &&
            rightLine && rightLine.classList.contains('selected')
        );
    }

    function completeBox(row, col) {
        const pColor = PLAYER_COLORS[currentPlayer];
        const gridContainer = document.querySelector('.grid-container');
        const box = document.createElement('div');
        box.className = 'completed-box';
        box.style.left = `${col * (100 / boardSize.cols)}%`;
        box.style.top = `${row * (100 / boardSize.rows)}%`;
        box.style.width = `${100 / boardSize.cols}%`;
        box.style.height = `${100 / boardSize.rows}%`;
        box.style.backgroundColor = pColor.fill;
        box.style.boxShadow = `inset 0 0 20px ${pColor.glow}`;

        gridContainer.appendChild(box);

        playSound(boxCompleteSound);

        playerScores[currentPlayer - 1]++;
    }

    // ============================
    //  PLAYER & UI
    // ============================
    function switchPlayer() {
        currentPlayer = currentPlayer === 1 ? 2 : 1;
    }

    function updatePlayerTurn() {
        const playerIcon = document.querySelector('.turn-indicator .player-icon');
        const turnIndicator = document.querySelector('.turn-indicator');
        const pColor = PLAYER_COLORS[currentPlayer];

        playerIcon.style.backgroundColor = pColor.main;
        playerIcon.style.boxShadow = pColor.shadow;

        // Update turn indicator border glow
        turnIndicator.style.borderColor = `${pColor.main}33`; // 20% opacity
        turnIndicator.style.boxShadow = `0 4px 16px rgba(0,0,0,0.25), 0 0 20px ${pColor.glow}`;
    }

    function updateScores() {
        const scoreElements = document.querySelectorAll('.player-score .score');
        scoreElements[0].textContent = playerScores[0];
        scoreElements[1].textContent = playerScores[1];
    }

    function isGameOver() {
        const totalBoxes = boardSize.rows * boardSize.cols;
        return (playerScores[0] + playerScores[1] >= totalBoxes);
    }

    function handleGameOver() {
        const popup = document.getElementById('game-over-popup');
        const resultMessage = document.getElementById('result-message');
        const player1FinalScore = document.getElementById('player1-final-score');
        const player2FinalScore = document.getElementById('player2-final-score');

        player1FinalScore.textContent = playerScores[0];
        player2FinalScore.textContent = playerScores[1];

        let winnerMessage;

        if (playerScores[0] > playerScores[1]) {
            winnerMessage = playingVsBot ? "🎉 You win!" : "🔥 Player 1 wins!";
            playSound(winSound);
        } else if (playerScores[1] > playerScores[0]) {
            winnerMessage = playingVsBot ? "🤖 Bot wins!" : "⚡ Player 2 wins!";
            if (playingVsBot) {
                playSound(loseSound);
            } else {
                playSound(winSound);
            }
        } else {
            winnerMessage = "🤝 It's a tie!";
            playSound(winSound);
        }

        resultMessage.textContent = winnerMessage;

        setTimeout(() => {
            popup.classList.add('active');
            createConfetti();
        }, 500);
    }

    // ============================
    //  BOT AI
    // ============================
    function makeBotMove() {
        const availableLines = [];

        document.querySelectorAll('.horizontal-line').forEach(line => {
            if (!line.classList.contains('selected')) {
                availableLines.push(line);
            }
        });

        document.querySelectorAll('.vertical-line').forEach(line => {
            if (!line.classList.contains('selected')) {
                availableLines.push(line);
            }
        });

        if (availableLines.length === 0) return;

        const completingMoves = findCompletingMoves(availableLines);

        if (completingMoves.length > 0) {
            const randomIndex = Math.floor(Math.random() * completingMoves.length);
            drawLine(completingMoves[randomIndex]);
            return;
        }

        const safeMoves = findSafeMoves(availableLines);

        if (safeMoves.length > 0) {
            const randomIndex = Math.floor(Math.random() * safeMoves.length);
            drawLine(safeMoves[randomIndex]);
            return;
        }

        const randomIndex = Math.floor(Math.random() * availableLines.length);
        drawLine(availableLines[randomIndex]);
    }

    function findCompletingMoves(availableLines) {
        const completingMoves = [];

        for (const line of availableLines) {
            const row = parseInt(line.dataset.row);
            const col = parseInt(line.dataset.col);
            const orientation = line.dataset.orientation;

            if (orientation === 'horizontal') {
                if (row > 0 && isAlmostComplete(row - 1, col, line)) {
                    completingMoves.push(line);
                    continue;
                }

                if (row < boardSize.rows && isAlmostComplete(row, col, line)) {
                    completingMoves.push(line);
                    continue;
                }
            } else {
                if (col > 0 && isAlmostComplete(row, col - 1, line)) {
                    completingMoves.push(line);
                    continue;
                }

                if (col < boardSize.cols && isAlmostComplete(row, col, line)) {
                    completingMoves.push(line);
                    continue;
                }
            }
        }

        return completingMoves;
    }

    function isAlmostComplete(row, col, excludeLine) {
        const topLine = document.querySelector(`.horizontal-line[data-row="${row}"][data-col="${col}"]`);
        const bottomLine = document.querySelector(`.horizontal-line[data-row="${row + 1}"][data-col="${col}"]`);
        const leftLine = document.querySelector(`.vertical-line[data-row="${row}"][data-col="${col}"]`);
        const rightLine = document.querySelector(`.vertical-line[data-row="${row}"][data-col="${col + 1}"]`);

        let selectedCount = 0;

        if (topLine && topLine !== excludeLine && topLine.classList.contains('selected')) selectedCount++;
        if (bottomLine && bottomLine !== excludeLine && bottomLine.classList.contains('selected')) selectedCount++;
        if (leftLine && leftLine !== excludeLine && leftLine.classList.contains('selected')) selectedCount++;
        if (rightLine && rightLine !== excludeLine && rightLine.classList.contains('selected')) selectedCount++;

        return selectedCount === 3;
    }

    function findSafeMoves(availableLines) {
        return availableLines.filter(line => {
            const row = parseInt(line.dataset.row);
            const col = parseInt(line.dataset.col);
            const orientation = line.dataset.orientation;

            line.classList.add('selected');

            let isSafe = true;

            if (orientation === 'horizontal') {
                if (row > 0 && isAlmostComplete(row - 1, col, null)) {
                    isSafe = false;
                }

                if (isSafe && row < boardSize.rows && isAlmostComplete(row, col, null)) {
                    isSafe = false;
                }
            } else {
                if (col > 0 && isAlmostComplete(row, col - 1, null)) {
                    isSafe = false;
                }

                if (isSafe && col < boardSize.cols && isAlmostComplete(row, col, null)) {
                    isSafe = false;
                }
            }

            line.classList.remove('selected');

            return isSafe;
        });
    }

    // ============================
    //  EVENT LISTENERS
    // ============================
    function setupEventListeners() {
        playVsPlayerButton.addEventListener('click', () => {
            playSound(buttonClickSound);
            playingVsBot = false;
            // Update Player 2 label
            const labels = document.querySelectorAll('.player-label');
            if (labels[1]) labels[1].textContent = 'Player 2';
            showGameScreen();
        });

        playVsBotButton.addEventListener('click', () => {
            playSound(buttonClickSound);
            playingVsBot = true;
            // Update Player 2 label to "Bot"
            const labels = document.querySelectorAll('.player-label');
            if (labels[1]) labels[1].textContent = 'Bot';
            showGameScreen();
        });

        exitButton.addEventListener('click', () => {
            playSound(buttonClickSound);
            alert('Thanks for playing!');
        });

        menuButton.addEventListener('click', () => {
            playSound(buttonClickSound);
            showHomeScreen();
        });

        settingsButton.addEventListener('click', () => {
            playSound(buttonClickSound);
            showSettingsPopup();
        });

        const playAgainButton = document.getElementById('play-again-button');
        const mainMenuButton = document.getElementById('main-menu-button');

        playAgainButton.addEventListener('click', () => {
            playSound(buttonClickSound);
            const popup = document.getElementById('game-over-popup');
            popup.classList.remove('active');
            clearConfetti();
            showGameScreen();
        });

        mainMenuButton.addEventListener('click', () => {
            playSound(buttonClickSound);
            const popup = document.getElementById('game-over-popup');
            popup.classList.remove('active');
            clearConfetti();
            showHomeScreen();
        });

        const settingsPopup = document.getElementById('settings-popup');
        const soundToggle = document.getElementById('sound-toggle');
        const closeSettingsButton = document.getElementById('close-settings-button');
        const restartGameButton = document.getElementById('restart-game-button');
        const exitGameButton = document.getElementById('exit-game-button');

        soundToggle.checked = soundEnabled;

        soundToggle.addEventListener('change', () => {
            soundEnabled = soundToggle.checked;
            if (soundEnabled) {
                playSound(buttonClickSound);
            }
        });

        closeSettingsButton.addEventListener('click', () => {
            playSound(buttonClickSound);
            settingsPopup.classList.remove('active');
        });

        restartGameButton.addEventListener('click', () => {
            playSound(buttonClickSound);
            settingsPopup.classList.remove('active');
            showGameScreen();
        });

        exitGameButton.addEventListener('click', () => {
            playSound(buttonClickSound);
            settingsPopup.classList.remove('active');
            showHomeScreen();
        });

        document.addEventListener('mouseup', (e) => {
            if (isDragging) {
                endDrag(e, null);
            }
        });
        document.addEventListener('touchend', (e) => {
            if (isDragging) {
                endDrag(e, null);
            }
        });
    }

    // ============================
    //  SCREEN NAVIGATION
    // ============================
    function showHomeScreen() {
        homeScreen.classList.add('active');
        gameScreen.classList.remove('active');

        const popup = document.getElementById('game-over-popup');
        popup.classList.remove('active');

        const settingsPopup = document.getElementById('settings-popup');
        settingsPopup.classList.remove('active');

        clearConfetti();
    }

    function showGameScreen() {
        homeScreen.classList.remove('active');
        gameScreen.classList.add('active');

        currentPlayer = 1;
        playerScores = [0, 0];

        createGameBoard();
        updatePlayerTurn();
        updateScores();
    }

    function showSettingsPopup() {
        const settingsPopup = document.getElementById('settings-popup');
        settingsPopup.classList.add('active');
    }

    // ============================
    //  CONFETTI SYSTEM
    // ============================
    function createConfetti() {
        const container = document.getElementById('confetti-container');
        if (!container) return;

        const colors = ['#ff4d6d', '#4cc9f0', '#ffd60a', '#a855f7', '#34d399', '#ff758f', '#72d5f5'];
        const shapes = ['square', 'circle', 'strip'];

        for (let i = 0; i < 80; i++) {
            const confetti = document.createElement('div');
            const color = colors[Math.floor(Math.random() * colors.length)];
            const shape = shapes[Math.floor(Math.random() * shapes.length)];
            const size = Math.random() * 10 + 5;
            const delay = Math.random() * 2;
            const duration = Math.random() * 2 + 2.5;
            const startX = Math.random() * 100;
            const wobble = (Math.random() - 0.5) * 200;

            let borderRadius = '2px';
            let width = `${size}px`;
            let height = `${size}px`;

            if (shape === 'circle') {
                borderRadius = '50%';
            } else if (shape === 'strip') {
                width = `${size * 0.4}px`;
                height = `${size * 1.8}px`;
            }

            confetti.style.cssText = `
                position: fixed;
                width: ${width};
                height: ${height};
                background: ${color};
                left: ${startX}%;
                top: -20px;
                z-index: 201;
                border-radius: ${borderRadius};
                pointer-events: none;
                opacity: 0.9;
                animation: confetti-fall ${duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}s forwards;
                transform-origin: center;
            `;

            // Custom wobble via CSS custom property
            confetti.style.setProperty('--wobble', `${wobble}px`);

            container.appendChild(confetti);
        }

        // Clean up after animations finish
        setTimeout(() => {
            clearConfetti();
        }, 6000);
    }

    function clearConfetti() {
        const container = document.getElementById('confetti-container');
        if (container) {
            container.innerHTML = '';
        }
    }

    // ============================
    //  PARTICLE BACKGROUND
    // ============================
    (function initParticles() {
        const canvas = document.getElementById('particles-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        const particles = [];
        const particleCount = 70;

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.25,
                vy: (Math.random() - 0.5) * 0.25,
                size: Math.random() * 2 + 0.5,
                opacity: Math.random() * 0.4 + 0.05,
                pulse: Math.random() * Math.PI * 2 // phase offset for twinkling
            });
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const time = Date.now() * 0.001;

            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;

                // Wrap around edges
                if (p.x < -10) p.x = canvas.width + 10;
                if (p.x > canvas.width + 10) p.x = -10;
                if (p.y < -10) p.y = canvas.height + 10;
                if (p.y > canvas.height + 10) p.y = -10;

                // Twinkle effect
                const twinkle = Math.sin(time * 0.8 + p.pulse) * 0.3 + 0.7;
                const alpha = p.opacity * twinkle;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(200, 210, 255, ${alpha})`;
                ctx.fill();
            });

            // Draw faint connections between nearby particles
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 100) {
                        const lineAlpha = 0.04 * (1 - dist / 100);
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = `rgba(180, 190, 255, ${lineAlpha})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }

            requestAnimationFrame(animate);
        }

        animate();
    })();

    // ============================
    //  START THE GAME
    // ============================
    initGame();
});
