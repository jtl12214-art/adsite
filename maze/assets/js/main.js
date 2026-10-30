/*
Based on:
https://codepen.io/TheCodeDepository/pen/jKBaoN

Original CodePen author: TheCodeDepository
Original Repository: https://github.com/TheCodeDepository/PickleRick-MazeGame
Public CodePen source used under the MIT License.
Modified for PIX:
- Removed external Rick & Morty character/portal assets.
- Render player as PIX Amber Orange circular marker.
- Render goal as checkered flag.
- Integrated difficulty levels (쉬움 10, 보통 15, 어려움 25).
- Scoped swipe and keyboard controls inside PIX container without breaking page scroll.
- Responsive canvas sizing.
- Added mobile on-screen D-pad navigation.
- Korean victory modal with step count and replay button.
*/

(function ($) {
    'use strict';

    function rand(max) {
        return Math.floor(Math.random() * max);
    }

    function shuffle(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // Maze Generator Algorithm (Recursive Backtracking)
    function Maze(Width, Height) {
        let mazeMap;
        const width = Width;
        const height = Height;
        let startCoord, endCoord;
        const dirs = ['n', 's', 'e', 'w'];
        const modDir = {
            n: { y: -1, x: 0, o: 's' },
            s: { y: 1, x: 0, o: 'n' },
            e: { y: 0, x: 1, o: 'w' },
            w: { y: 0, x: -1, o: 'e' }
        };

        this.map = function () {
            return mazeMap;
        };
        this.startCoord = function () {
            return startCoord;
        };
        this.endCoord = function () {
            return endCoord;
        };

        function genMap() {
            mazeMap = new Array(height);
            for (let y = 0; y < height; y++) {
                mazeMap[y] = new Array(width);
                for (let x = 0; x < width; ++x) {
                    mazeMap[y][x] = {
                        n: false,
                        s: false,
                        e: false,
                        w: false,
                        visited: false,
                        priorPos: null
                    };
                }
            }
        }

        function defineMaze() {
            let isComp = false;
            let move = false;
            let cellsVisited = 1;
            let numLoops = 0;
            let maxLoops = 0;
            let pos = { x: 0, y: 0 };
            const numCells = width * height;

            while (!isComp) {
                move = false;
                mazeMap[pos.x][pos.y].visited = true;

                if (numLoops >= maxLoops) {
                    shuffle(dirs);
                    maxLoops = Math.round(rand(height / 8));
                    numLoops = 0;
                }
                numLoops++;

                for (let index = 0; index < dirs.length; index++) {
                    const direction = dirs[index];
                    const nx = pos.x + modDir[direction].x;
                    const ny = pos.y + modDir[direction].y;

                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        if (!mazeMap[nx][ny].visited) {
                            mazeMap[pos.x][pos.y][direction] = true;
                            mazeMap[nx][ny][modDir[direction].o] = true;
                            mazeMap[nx][ny].priorPos = pos;
                            pos = { x: nx, y: ny };
                            cellsVisited++;
                            move = true;
                            break;
                        }
                    }
                }

                if (!move) {
                    pos = mazeMap[pos.x][pos.y].priorPos;
                }
                if (numCells === cellsVisited) {
                    isComp = true;
                }
            }
        }

        function defineStartEnd() {
            switch (rand(4)) {
                case 0:
                    startCoord = { x: 0, y: 0 };
                    endCoord = { x: height - 1, y: width - 1 };
                    break;
                case 1:
                    startCoord = { x: 0, y: width - 1 };
                    endCoord = { x: height - 1, y: 0 };
                    break;
                case 2:
                    startCoord = { x: height - 1, y: 0 };
                    endCoord = { x: 0, y: width - 1 };
                    break;
                case 3:
                    startCoord = { x: height - 1, y: width - 1 };
                    endCoord = { x: 0, y: 0 };
                    break;
            }
        }

        genMap();
        defineStartEnd();
        defineMaze();
    }

    // Canvas Maze Renderer
    function DrawMaze(maze, ctx, cellsize) {
        const map = maze.map();
        let cellSize = cellsize;
        ctx.lineWidth = Math.max(2, cellSize / 20);
        ctx.strokeStyle = '#2D2A26';

        this.redrawMaze = function (size) {
            cellSize = size;
            ctx.lineWidth = Math.max(2, cellSize / 20);
            drawMap();
            drawEndFlag();
        };

        function drawCell(xCord, yCord, cell) {
            const x = xCord * cellSize;
            const y = yCord * cellSize;

            if (cell.n === false) {
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + cellSize, y);
                ctx.stroke();
            }
            if (cell.s === false) {
                ctx.beginPath();
                ctx.moveTo(x, y + cellSize);
                ctx.lineTo(x + cellSize, y + cellSize);
                ctx.stroke();
            }
            if (cell.e === false) {
                ctx.beginPath();
                ctx.moveTo(x + cellSize, y);
                ctx.lineTo(x + cellSize, y + cellSize);
                ctx.stroke();
            }
            if (cell.w === false) {
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + cellSize);
                ctx.stroke();
            }
        }

        function drawMap() {
            for (let x = 0; x < map.length; x++) {
                for (let y = 0; y < map[x].length; y++) {
                    drawCell(x, y, map[x][y]);
                }
            }
        }

        // Checkered Goal Flag
        function drawEndFlag() {
            const coord = maze.endCoord();
            const gridSize = 4;
            const pad = cellSize * 0.12;
            const size = cellSize - pad * 2;
            const fraction = size / gridSize;
            let colorSwap = true;

            for (let y = 0; y < gridSize; y++) {
                if (gridSize % 2 === 0) colorSwap = !colorSwap;
                for (let x = 0; x < gridSize; x++) {
                    ctx.beginPath();
                    ctx.rect(
                        coord.x * cellSize + pad + x * fraction,
                        coord.y * cellSize + pad + y * fraction,
                        fraction,
                        fraction
                    );
                    ctx.fillStyle = colorSwap ? '#2D2A26' : '#FFFFFF';
                    ctx.fill();
                    colorSwap = !colorSwap;
                }
            }
        }

        function clear() {
            const canvasWidth = ctx.canvas.width;
            const canvasHeight = ctx.canvas.height;
            ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        }

        clear();
        drawMap();
        drawEndFlag();
    }

    // Player Controller
    function Player(maze, canvas, _cellsize, onComplete) {
        const ctx = canvas.getContext('2d');
        let moves = 0;
        const player = this;
        const map = maze.map();
        let cellCoords = {
            x: maze.startCoord().x,
            y: maze.startCoord().y
        };
        let cellSize = _cellsize;
        let halfCellSize = cellSize / 2;

        this.redrawPlayer = function (_cellsize) {
            cellSize = _cellsize;
            halfCellSize = cellSize / 2;
            drawSpriteCircle(cellCoords);
        };

        function drawSpriteCircle(coord) {
            ctx.beginPath();
            ctx.fillStyle = '#FF7A0B';
            ctx.arc(
                (coord.x + 1) * cellSize - halfCellSize,
                (coord.y + 1) * cellSize - halfCellSize,
                Math.max(3, halfCellSize - 3),
                0,
                2 * Math.PI
            );
            ctx.fill();

            // Inner highlight
            ctx.beginPath();
            ctx.fillStyle = '#FFC285';
            ctx.arc(
                (coord.x + 1) * cellSize - halfCellSize - 1,
                (coord.y + 1) * cellSize - halfCellSize - 1,
                Math.max(1, (halfCellSize - 3) * 0.45),
                0,
                2 * Math.PI
            );
            ctx.fill();

            if (coord.x === maze.endCoord().x && coord.y === maze.endCoord().y) {
                player.unbindInput();
                onComplete(moves);
            }
        }

        function removeSprite(coord) {
            const pad = cellSize * 0.12;
            ctx.clearRect(
                coord.x * cellSize + pad,
                coord.y * cellSize + pad,
                cellSize - pad * 2,
                cellSize - pad * 2
            );
        }

        this.move = function (direction) {
            const cell = map[cellCoords.x][cellCoords.y];
            let moved = false;

            switch (direction) {
                case 'west':
                    if (cell.w === true) {
                        removeSprite(cellCoords);
                        cellCoords = { x: cellCoords.x - 1, y: cellCoords.y };
                        moved = true;
                    }
                    break;
                case 'north':
                    if (cell.n === true) {
                        removeSprite(cellCoords);
                        cellCoords = { x: cellCoords.x, y: cellCoords.y - 1 };
                        moved = true;
                    }
                    break;
                case 'east':
                    if (cell.e === true) {
                        removeSprite(cellCoords);
                        cellCoords = { x: cellCoords.x + 1, y: cellCoords.y };
                        moved = true;
                    }
                    break;
                case 'south':
                    if (cell.s === true) {
                        removeSprite(cellCoords);
                        cellCoords = { x: cellCoords.x, y: cellCoords.y + 1 };
                        moved = true;
                    }
                    break;
            }

            if (moved) {
                moves++;
                drawSpriteCircle(cellCoords);
            }
        };

        function onKeyDown(e) {
            const key = e.keyCode;
            let dir = null;

            if (key === 37 || key === 65) dir = 'west'; // Left / A
            else if (key === 38 || key === 87) dir = 'north'; // Up / W
            else if (key === 39 || key === 68) dir = 'east'; // Right / D
            else if (key === 40 || key === 83) dir = 'south'; // Down / S

            if (dir) {
                const activeEl = document.activeElement;
                if (!activeEl || (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA' && activeEl.tagName !== 'SELECT')) {
                    e.preventDefault();
                    player.move(dir);
                }
            }
        }

        this.bindInput = function () {
            window.addEventListener('keydown', onKeyDown, false);

            if ($.fn.swipe) {
                $('#mazeCanvas').swipe({
                    swipe: function (event, direction) {
                        switch (direction) {
                            case 'up': player.move('north'); break;
                            case 'down': player.move('south'); break;
                            case 'left': player.move('west'); break;
                            case 'right': player.move('east'); break;
                        }
                    },
                    threshold: 10,
                    preventDefaultEvents: true
                });
            }

            $('.maze-dpad-btn').off('click').on('click', function (e) {
                e.preventDefault();
                const dir = $(this).data('dir');
                if (dir) player.move(dir);
            });
        };

        this.unbindInput = function () {
            window.removeEventListener('keydown', onKeyDown, false);
            if ($.fn.swipe) {
                try {
                    $('#mazeCanvas').swipe('destroy');
                } catch (e) {}
            }
            $('.maze-dpad-btn').off('click');
        };

        drawSpriteCircle(maze.startCoord());
        this.bindInput();
    }

    // Game Controller
    let maze, draw, player;
    let cellSize, difficulty;
    const canvas = document.getElementById('mazeCanvas');
    const ctx = canvas ? canvas.getContext('2d') : null;

    function resizeCanvas() {
        if (!canvas) return;
        const container = document.getElementById('maze-canvas-container');
        if (!container) return;

        const size = container.clientWidth || 500;
        const dpr = window.devicePixelRatio || 1;

        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);

        if (difficulty) {
            cellSize = size / difficulty;
            if (draw && player) {
                draw.redrawMaze(cellSize);
                player.redrawPlayer(cellSize);
            }
        }
    }

    function displayVictory(moves) {
        const diffText = $('#diffSelect option:selected').text();
        $('#modal-moves').text(moves + '회');
        $('#modal-diff').text(diffText);
        $('#maze-victory-modal').addClass('is-visible');
        $('#modal-restart-btn').focus();
    }

    function makeMaze() {
        if (!canvas || !ctx) return;

        if (player) {
            player.unbindInput();
            player = null;
        }

        const container = document.getElementById('maze-canvas-container');
        const size = container ? (container.clientWidth || 500) : 500;
        const dpr = window.devicePixelRatio || 1;

        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        difficulty = parseInt($('#diffSelect').val(), 10) || 15;
        cellSize = size / difficulty;

        maze = new Maze(difficulty, difficulty);
        draw = new DrawMaze(maze, ctx, cellSize);
        player = new Player(maze, canvas, cellSize, displayVictory);

        $('#maze-victory-modal').removeClass('is-visible');
    }

    $(document).ready(function () {
        if (!canvas) return;

        $('#startMazeBtn').on('click', makeMaze);
        $('#diffSelect').on('change', makeMaze);
        $('#modal-restart-btn').on('click', makeMaze);

        window.addEventListener('resize', function () {
            resizeCanvas();
        });

        // Initialize first maze
        makeMaze();
    });

})(jQuery);

