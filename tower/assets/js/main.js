/*
Based on:
https://codepen.io/ste-vg/pen/ppLQNW

Original CodePen author: Steve Gardner (ste-vg)
Public CodePen source used under the MIT License.
Modified for PIX:
- Scoped rendering to container element rather than window.
- Responsive container-based sizing with aspect ratio.
- Korean UI integration.
- Repeatable restart mechanism without page reload.
- Focused keyboard and touch event handling.
*/

(function () {
    'use strict';

    if (typeof THREE === 'undefined' || typeof TweenLite === 'undefined') {
        const errorEl = document.getElementById('tower-error');
        if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.textContent = '게임을 불러오지 못했습니다. 페이지를 새로고침해주세요.';
        }
        console.error('Three.js or GSAP library failed to load for Tower Blocks.');
        return;
    }

    class Stage {
        constructor(containerEl) {
            this.container = containerEl;
            this.render = () => {
                this.renderer.render(this.scene, this.camera);
            };
            this.add = (elem) => {
                this.scene.add(elem);
            };
            this.remove = (elem) => {
                this.scene.remove(elem);
            };

            const width = this.container.clientWidth || 800;
            const height = this.container.clientHeight || 560;

            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: false
            });
            this.renderer.setSize(width, height);
            this.renderer.setClearColor('#D0CBC7', 1);
            this.container.appendChild(this.renderer.domElement);

            this.scene = new THREE.Scene();

            const aspect = width / height;
            const d = 20;
            this.camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, -100, 1000);
            this.camera.position.set(2, 2, 2);
            this.camera.lookAt(new THREE.Vector3(0, 0, 0));

            this.light = new THREE.DirectionalLight(0xffffff, 0.5);
            this.light.position.set(0, 499, 0);
            this.scene.add(this.light);

            this.softLight = new THREE.AmbientLight(0xffffff, 0.4);
            this.scene.add(this.softLight);

            window.addEventListener('resize', () => this.onResize());
            this.onResize();
        }

        setCamera(y, speed = 0.3) {
            TweenLite.to(this.camera.position, speed, { y: y + 4, ease: Power1.easeInOut });
            TweenLite.to(this.camera.lookAt, speed, { y: y, ease: Power1.easeInOut });
        }

        resetCamera() {
            this.camera.position.set(2, 2, 2);
            this.camera.lookAt(new THREE.Vector3(0, 0, 0));
        }

        onResize() {
            const width = this.container.clientWidth || 800;
            const height = this.container.clientHeight || 560;
            const viewSize = 30;

            this.renderer.setSize(width, height);
            this.camera.left = width / -viewSize;
            this.camera.right = width / viewSize;
            this.camera.top = height / viewSize;
            this.camera.bottom = height / -viewSize;
            this.camera.updateProjectionMatrix();
        }
    }

    class Block {
        constructor(block) {
            this.STATES = { ACTIVE: 'active', STOPPED: 'stopped', MISSED: 'missed' };
            this.MOVE_AMOUNT = 12;
            this.dimension = { width: 0, height: 0, depth: 0 };
            this.position = { x: 0, y: 0, z: 0 };
            this.targetBlock = block;
            this.index = (this.targetBlock ? this.targetBlock.index : 0) + 1;
            this.workingPlane = this.index % 2 ? 'x' : 'z';
            this.workingDimension = this.index % 2 ? 'width' : 'depth';

            this.dimension.width = this.targetBlock ? this.targetBlock.dimension.width : 10;
            this.dimension.height = this.targetBlock ? this.targetBlock.dimension.height : 2;
            this.dimension.depth = this.targetBlock ? this.targetBlock.dimension.depth : 10;
            this.position.x = this.targetBlock ? this.targetBlock.position.x : 0;
            this.position.y = this.dimension.height * this.index;
            this.position.z = this.targetBlock ? this.targetBlock.position.z : 0;
            this.colorOffset = this.targetBlock ? this.targetBlock.colorOffset : Math.round(Math.random() * 100);

            if (!this.targetBlock) {
                this.color = 0x333344;
            } else {
                const offset = this.index + this.colorOffset;
                const r = Math.sin(0.3 * offset) * 55 + 200;
                const g = Math.sin(0.3 * offset + 2) * 55 + 200;
                const b = Math.sin(0.3 * offset + 4) * 55 + 200;
                this.color = new THREE.Color(r / 255, g / 255, b / 255);
            }

            this.state = this.index > 1 ? this.STATES.ACTIVE : this.STATES.STOPPED;

            this.speed = -0.1 - (this.index * 0.005);
            if (this.speed < -4) this.speed = -4;
            this.direction = this.speed;

            const geometry = new THREE.BoxGeometry(this.dimension.width, this.dimension.height, this.dimension.depth);
            geometry.applyMatrix(new THREE.Matrix4().makeTranslation(this.dimension.width / 2, this.dimension.height / 2, this.dimension.depth / 2));
            this.material = new THREE.MeshToonMaterial({ color: this.color, shading: THREE.FlatShading });
            this.mesh = new THREE.Mesh(geometry, this.material);
            this.mesh.position.set(this.position.x, this.position.y, this.position.z);

            if (this.state === this.STATES.ACTIVE) {
                this.position[this.workingPlane] = Math.random() > 0.5 ? -this.MOVE_AMOUNT : this.MOVE_AMOUNT;
            }
        }

        reverseDirection() {
            this.direction = this.direction > 0 ? this.speed : Math.abs(this.speed);
        }

        place() {
            this.state = this.STATES.STOPPED;
            let overlap = this.targetBlock.dimension[this.workingDimension] - Math.abs(this.position[this.workingPlane] - this.targetBlock.position[this.workingPlane]);
            const blocksToReturn = {
                plane: this.workingPlane,
                direction: this.direction
            };

            if (this.dimension[this.workingDimension] - overlap < 0.3) {
                overlap = this.dimension[this.workingDimension];
                blocksToReturn.bonus = true;
                this.position.x = this.targetBlock.position.x;
                this.position.z = this.targetBlock.position.z;
                this.dimension.width = this.targetBlock.dimension.width;
                this.dimension.depth = this.targetBlock.dimension.depth;
            }

            if (overlap > 0) {
                const choppedDimensions = { width: this.dimension.width, height: this.dimension.height, depth: this.dimension.depth };
                choppedDimensions[this.workingDimension] -= overlap;
                this.dimension[this.workingDimension] = overlap;

                const placedGeometry = new THREE.BoxGeometry(this.dimension.width, this.dimension.height, this.dimension.depth);
                placedGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(this.dimension.width / 2, this.dimension.height / 2, this.dimension.depth / 2));
                const placedMesh = new THREE.Mesh(placedGeometry, this.material);

                const choppedGeometry = new THREE.BoxGeometry(choppedDimensions.width, choppedDimensions.height, choppedDimensions.depth);
                choppedGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(choppedDimensions.width / 2, choppedDimensions.height / 2, choppedDimensions.depth / 2));
                const choppedMesh = new THREE.Mesh(choppedGeometry, this.material);

                const choppedPosition = {
                    x: this.position.x,
                    y: this.position.y,
                    z: this.position.z
                };

                if (this.position[this.workingPlane] < this.targetBlock.position[this.workingPlane]) {
                    this.position[this.workingPlane] = this.targetBlock.position[this.workingPlane];
                } else {
                    choppedPosition[this.workingPlane] += overlap;
                }

                placedMesh.position.set(this.position.x, this.position.y, this.position.z);
                choppedMesh.position.set(choppedPosition.x, choppedPosition.y, choppedPosition.z);

                blocksToReturn.placed = placedMesh;
                if (!blocksToReturn.bonus) blocksToReturn.chopped = choppedMesh;
            } else {
                this.state = this.STATES.MISSED;
            }

            this.dimension[this.workingDimension] = overlap;
            return blocksToReturn;
        }

        tick() {
            if (this.state === this.STATES.ACTIVE) {
                const value = this.position[this.workingPlane];
                if (value > this.MOVE_AMOUNT || value < -this.MOVE_AMOUNT) {
                    this.reverseDirection();
                }
                this.position[this.workingPlane] += this.direction;
                this.mesh.position[this.workingPlane] = this.position[this.workingPlane];
            }
        }
    }

    class Game {
        constructor() {
            this.STATES = {
                'LOADING': 'loading',
                'PLAYING': 'playing',
                'READY': 'ready',
                'ENDED': 'ended'
            };

            this.mainStage = document.getElementById('tower-stage');
            this.canvasContainer = document.getElementById('game-canvas-container');
            this.scoreContainer = document.getElementById('tower-score');
            this.startButton = document.getElementById('tower-start-btn');
            this.restartButton = document.getElementById('tower-restart-btn');
            this.instructions = document.getElementById('tower-instructions');

            this.blocks = [];
            this.state = this.STATES.LOADING;
            this.stage = new Stage(this.canvasContainer);

            this.scoreContainer.textContent = '0';
            this.newBlocks = new THREE.Group();
            this.placedBlocks = new THREE.Group();
            this.choppedBlocks = new THREE.Group();

            this.stage.add(this.newBlocks);
            this.stage.add(this.placedBlocks);
            this.stage.add(this.choppedBlocks);

            this.initBase();
            this.tick();
            this.updateState(this.STATES.READY);
            this.bindEvents();
        }

        initBase() {
            this.addBlock();
        }

        bindEvents() {
            if (this.startButton) {
                this.startButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.startGame();
                });
            }

            if (this.restartButton) {
                this.restartButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.restartGame();
                });
            }

            this.mainStage.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                this.onAction();
            });

            this.mainStage.addEventListener('touchend', (e) => {
                if (e.target.closest('button')) return;
                e.preventDefault();
                this.onAction();
            }, { passive: false });

            window.addEventListener('keydown', (e) => {
                if (e.code === 'Space' || e.keyCode === 32) {
                    const activeEl = document.activeElement;
                    const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
                    if (isInput) return;

                    // If game is in focus or playing, prevent page scroll and act
                    if (this.state === this.STATES.PLAYING || this.state === this.STATES.READY) {
                        e.preventDefault();
                        this.onAction();
                    }
                }
            });
        }

        updateState(newState) {
            for (const key in this.STATES) {
                this.mainStage.classList.remove(this.STATES[key]);
            }
            this.mainStage.classList.add(newState);
            this.state = newState;
        }

        onAction() {
            switch (this.state) {
                case this.STATES.READY:
                    this.startGame();
                    break;
                case this.STATES.PLAYING:
                    this.placeBlock();
                    break;
            }
        }

        startGame() {
            if (this.state !== this.STATES.PLAYING) {
                this.scoreContainer.textContent = '0';
                this.updateState(this.STATES.PLAYING);
                this.addBlock();
            }
        }

        restartGame() {
            // Remove existing meshes from groups
            while (this.newBlocks.children.length > 0) {
                this.newBlocks.remove(this.newBlocks.children[0]);
            }
            while (this.placedBlocks.children.length > 0) {
                this.placedBlocks.remove(this.placedBlocks.children[0]);
            }
            while (this.choppedBlocks.children.length > 0) {
                this.choppedBlocks.remove(this.choppedBlocks.children[0]);
            }

            this.blocks = [];
            this.stage.resetCamera();
            this.instructions.classList.remove('hide');
            this.scoreContainer.textContent = '0';

            this.initBase();
            this.startGame();
        }

        placeBlock() {
            const currentBlock = this.blocks[this.blocks.length - 1];
            if (!currentBlock) return;

            const newBlocks = currentBlock.place();
            this.newBlocks.remove(currentBlock.mesh);

            if (newBlocks.placed) {
                this.placedBlocks.add(newBlocks.placed);
            }

            if (newBlocks.chopped) {
                this.choppedBlocks.add(newBlocks.chopped);
                const positionParams = {
                    y: '-=30',
                    ease: Power1.easeIn,
                    onComplete: () => this.choppedBlocks.remove(newBlocks.chopped)
                };
                const rotateRandomness = 10;
                const rotationParams = {
                    delay: 0.05,
                    x: newBlocks.plane === 'z' ? ((Math.random() * rotateRandomness) - (rotateRandomness / 2)) : 0.1,
                    z: newBlocks.plane === 'x' ? ((Math.random() * rotateRandomness) - (rotateRandomness / 2)) : 0.1,
                    y: Math.random() * 0.1
                };

                if (newBlocks.chopped.position[newBlocks.plane] > newBlocks.placed.position[newBlocks.plane]) {
                    positionParams[newBlocks.plane] = '+=' + (40 * Math.abs(newBlocks.direction));
                } else {
                    positionParams[newBlocks.plane] = '-=' + (40 * Math.abs(newBlocks.direction));
                }

                TweenLite.to(newBlocks.chopped.position, 1, positionParams);
                TweenLite.to(newBlocks.chopped.rotation, 1, rotationParams);
            }

            this.addBlock();
        }

        addBlock() {
            const lastBlock = this.blocks[this.blocks.length - 1];
            if (lastBlock && lastBlock.state === lastBlock.STATES.MISSED) {
                return this.endGame();
            }

            this.scoreContainer.textContent = String(Math.max(0, this.blocks.length - 1));
            const newKidOnTheBlock = new Block(lastBlock);
            this.newBlocks.add(newKidOnTheBlock.mesh);
            this.blocks.push(newKidOnTheBlock);
            this.stage.setCamera(this.blocks.length * 2);

            if (this.blocks.length >= 5) {
                this.instructions.classList.add('hide');
            }
        }

        endGame() {
            this.updateState(this.STATES.ENDED);
        }

        tick() {
            if (this.blocks.length > 0) {
                this.blocks[this.blocks.length - 1].tick();
            }
            this.stage.render();
            requestAnimationFrame(() => this.tick());
        }
    }

    // Initialize game
    window.addEventListener('DOMContentLoaded', () => {
        new Game();
    });
})();

