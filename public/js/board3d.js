/**
 * Three.js 3D Chessboard & Animation Controller
 * Handles WebGL rendering, lighting, piece physics/arcs, particle bursts, and AI overlays.
 */

class Board3D {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.theme = options.theme || 'wood';
        this.playerColor = options.playerColor || 'white';
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.tiles = [];        // 64 tile meshes indexed 0 (a1) to 63 (h8)
        this.pieceMeshes = {};  // squareName -> { mesh, type, color }
        this.indicators = [];   // Valid move indicator meshes
        this.particles = [];    // Active capture particles
        this.arrowMesh = null;  // 3D AI Prediction Arrow
        this.heatmapMeshes = [];// 64 heatmap overlay pads
        this.kingCheckMesh = null;

        this.selectedSquare = null;
        this.positionVersion = 0;
        this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.onSquareClick = options.onSquareClick || null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.init();
    }

    init() {
        const width = (this.container && this.container.clientWidth > 0) ? this.container.clientWidth : (window.innerWidth || 800);
        const height = (this.container && this.container.clientHeight > 0) ? this.container.clientHeight : (Math.max(300, window.innerHeight - 120));

        // 1. Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x171e1a);
        this.scene.fog = new THREE.Fog(0x171e1a, 20, 52);

        // 2. Camera
        const aspect = width / height;
        this.camera = new THREE.PerspectiveCamera(45, isFinite(aspect) && aspect > 0 ? aspect : 1.6, 0.1, 100);

        // 3. Renderer
        try {
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        } catch (e) {
            console.warn("WebGL creation fallback:", e);
            this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
        }
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.9;
        this.renderer.outputEncoding = THREE.sRGBEncoding;

        if (window.chessMaterials && typeof window.chessMaterials.studio === 'function') {
            try {
                this.studioTarget = window.chessMaterials.studio(this.renderer);
                if (this.studioTarget && this.studioTarget.texture) {
                    this.scene.environment = this.studioTarget.texture;
                }
            } catch (err) {
                console.warn('Environment map initialization bypassed:', err);
            }
        }
        this.container.appendChild(this.renderer.domElement);

        // 4. Orbit Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent camera going below board
        this.controls.minDistance = 6;
        this.controls.maxDistance = 24;

        this.resetCameraView('perspective');

        // WebGL Context recovery handlers
        this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            console.warn('WebGL context lost, pausing render loop');
        }, false);
        this.renderer.domElement.addEventListener('webglcontextrestored', () => {
            console.info('WebGL context restored, reloading position');
            if (this.currentFen) this.loadFEN(this.currentFen);
        }, false);

        // 5. Lighting
        this.setupLights();

        // 6. Build Board
        this.buildBoard();
        const table = new THREE.Mesh(new THREE.PlaneGeometry(120,120), new THREE.MeshStandardMaterial({
            color:new THREE.Color(0x25382c).convertSRGBToLinear(), roughness:0.98, metalness:0, envMapIntensity:0.25
        }));
        table.rotation.x=-Math.PI/2; table.position.y=-0.60; table.receiveShadow=true;
        this.scene.add(table);

        // 7. Event Listeners
        window.addEventListener('resize', () => this.onWindowResize());
        this.resizeObserver = new ResizeObserver(() => this.onWindowResize());
        this.resizeObserver.observe(this.container);
        this.renderer.domElement.addEventListener('pointerdown', event => {
            window.soundEngine?.initContext();
            this.pointerStart = {x:event.clientX, y:event.clientY, id:event.pointerId};
        });
        this.renderer.domElement.addEventListener('pointerup', event => {
            if (this.pointerStart && Math.hypot(event.clientX-this.pointerStart.x, event.clientY-this.pointerStart.y) < 16) {
                this.onPointerDown(event);
            }
            this.pointerStart = null;
        });
        this.renderer.domElement.addEventListener('pointercancel', () => { this.pointerStart = null; });

        // 8. Render Loop
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    setupLights() {
        // Soft Ambient Light
        const ambientLight = new THREE.HemisphereLight(0xe8efff, 0x36231a, 0.3);
        this.scene.add(ambientLight);

        // Key Directional Light with soft shadows
        const dirLight = new THREE.DirectionalLight(0xffefd7, 1.05);
        dirLight.position.set(-5, 12, 7);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 2;
        dirLight.shadow.camera.far = 35;
        const d = 7;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        dirLight.shadow.bias = -0.0005;
        dirLight.shadow.normalBias = 0.025;
        dirLight.shadow.radius = 3;
        this.scene.add(dirLight);

        // Cool Rim / Fill Light
        const fillLight = new THREE.DirectionalLight(0xc8daff, 0.6);
        fillLight.position.set(5, 8, -7);
        this.scene.add(fillLight);

        // Center Board Spotlight for focus
        const spotLight = new THREE.SpotLight(0xffffff, 0.18, 20, Math.PI / 4, 0.4, 1);
        spotLight.position.set(0, 12, 0);
        spotLight.target.position.set(0, 0, 0);
        this.scene.add(spotLight);
        this.scene.add(spotLight.target);
    }

    buildBoard() {
        const boardGroup = new THREE.Group();

        // Tile Materials
        const tileMaterials = this.getTileMaterials();

        // Board Base Pedestal Frame
        const frameGeom = this.beveledBoard(9.1, 0.38, 0.09);
        const frameMat = new THREE.MeshStandardMaterial({
            color: 0xa88b78,
            map: window.chessMaterials.wood(false),
            roughness: 0.36,
            metalness: 0,
            envMapIntensity: 0.45
        });
        const frame = new THREE.Mesh(frameGeom, frameMat);
        frame.position.y = -0.50;
        frame.receiveShadow = true;
        boardGroup.add(frame);

        // Gold / Metallic Edge Inlay
        const inlayGeom = this.beveledBoard(8.85, 0.09, 0.025);
        const inlayMat = new THREE.MeshStandardMaterial({
            color: this.theme === 'cyberpunk' ? 0x06b6d4 : 0xb3975d,
            metalness: 0.8,
            roughness: 0.2
        });
        const inlay = new THREE.Mesh(inlayGeom, inlayMat);
        inlay.position.y = -0.065;
        boardGroup.add(inlay);
        const rim = new THREE.Mesh(this.beveledBoard(8.78, .075, .025), new THREE.MeshStandardMaterial({color:0xdbc1a7, map:window.chessMaterials.wood(false), roughness:.33, envMapIntensity:.45}));
        rim.position.y = -.04; rim.receiveShadow = true; boardGroup.add(rim);

        // 64 Tiles
        const tileGeom = new THREE.BoxGeometry(1.0, 0.12, 1.0);
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const sqIndex = rank * 8 + file;
                const isLight = (rank + file) % 2 !== 0;
                const mat = isLight ? tileMaterials.light.clone() : tileMaterials.dark.clone();

                const tileMesh = new THREE.Mesh(tileGeom, mat);
                const x = file - 3.5;
                const z = 3.5 - rank;
                tileMesh.position.set(x, 0.06, z);
                tileMesh.receiveShadow = true;

                tileMesh.userData = {
                    file,
                    rank,
                    square: this.coordsToSquare(file, rank),
                    isLight,
                    defaultMaterial: mat
                };

                this.tiles[sqIndex] = tileMesh;
                boardGroup.add(tileMesh);
            }
        }

        this.scene.add(boardGroup);
        tileMaterials.light.dispose(); tileMaterials.dark.dispose();
        this.addCoordinates(boardGroup);
    }

    getTileMaterials() {
        if (this.theme === 'marble') {
            return {
                light: new THREE.MeshStandardMaterial({ color: 0xf5f5f7, roughness: 0.15, metalness: 0.05 }),
                dark: new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.20, metalness: 0.10 })
            };
        } else if (this.theme === 'cyberpunk') {
            return {
                light: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.5 }),
                dark: new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.4, metalness: 0.6 })
            };
        } else if (this.theme === 'gold') {
            return {
                light: new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.2, metalness: 0.4 }),
                dark: new THREE.MeshStandardMaterial({ color: 0x713f12, roughness: 0.3, metalness: 0.3 })
            };
        } else {
            // Classic Wood
            return {
                light: new THREE.MeshStandardMaterial({ color: 0xffffff, map:window.chessMaterials.wood(true), roughness:0.44, metalness:0, envMapIntensity:0.35 }),
                dark: new THREE.MeshStandardMaterial({ color: 0xffffff, map:window.chessMaterials.wood(false), roughness:0.38, metalness:0, envMapIntensity:0.35 })
            };
        }
    }

    coordsToSquare(file, rank) {
        return String.fromCharCode(97 + file) + (rank + 1);
    }

    squareToCoords(square) {
        const file = square.charCodeAt(0) - 97;
        const rank = parseInt(square[1], 10) - 1;
        return { file, rank, x: file - 3.5, z: 3.5 - rank };
    }

    resetCameraView(preset = 'perspective') {
        const isBlack = this.playerColor === 'black';
        const sign = isBlack ? -1 : 1;

        let targetY = 0.2;
        if (preset === 'tactical' || preset === '2d') {
            // Slight safe Z offset avoids Gimbal lock degenerate cross-product on pure vertical axis
            this.camera.position.set(0, 14, 0.8 * sign);
            targetY = 0;
        } else if (preset === 'white') {
            this.camera.position.set(0, 7.5, 9);
            targetY = 0.4;
        } else if (preset === 'black') {
            this.camera.position.set(0, 7.5, -9);
            targetY = 0.4;
        } else {
            // Standard dynamic 3D perspective
            this.camera.position.set(0.5, 9, 8.5 * sign);
            targetY = 0.2;
        }
        if (this.controls) {
            this.controls.target.set(0, targetY, 0);
            this.controls.update();
        } else {
            this.camera.lookAt(0, targetY, 0);
        }
    }

    setTheme(newTheme) {
        this.theme = newTheme;
        this.highlightMaterial?.dispose();
        this.highlightMaterial = null;
        const tileMats = this.getTileMaterials();
        this.tiles.forEach(tile => {
            tile.userData.defaultMaterial.dispose();
            const mat = tile.userData.isLight ? tileMats.light.clone() : tileMats.dark.clone();
            tile.material = mat;
            tile.userData.defaultMaterial = mat;
        });
        // Re-materialize existing pieces
        Object.keys(this.pieceMeshes).forEach(sq => {
            const p = this.pieceMeshes[sq];
            const newMat = window.pieceModelFactory.getMaterial(p.color === 'white', newTheme);
            const oldMaterials = new Set();
            p.mesh.traverse(child => {
                if (child.isMesh && !child.userData.detailMaterial) { oldMaterials.add(child.material); child.material = newMat; }
            });
            oldMaterials.forEach(material => material.dispose());
        });
        tileMats.light.dispose(); tileMats.dark.dispose();
    }

    loadFEN(fen) {
        if (!fen || typeof fen !== 'string') return;
        this.currentFen = fen;
        this.positionVersion++;
        // Clear all current piece meshes
        this.removeObjects(Object.values(this.pieceMeshes).map(piece => piece.mesh));
        this.pieceMeshes = {};
        this.removeObjects(this.particles.map(particle => particle.mesh));
        this.particles = [];
        this.tiles.forEach(tile => { tile.material = tile.userData.defaultMaterial; });
        this.highlightMaterial?.dispose(); this.highlightMaterial = null;
        this.clearHeatmap();
        this.clearIndicators();
        this.clearPredictedArrow();
        this.clearKingCheck();

        const [placement] = fen.split(' ');
        const ranks = placement.split('/');

        for (let r = 0; r < 8; r++) {
            const rankStr = ranks[r];
            const boardRank = 7 - r;
            let file = 0;

            for (let char of rankStr) {
                if (/\d/.test(char)) {
                    file += parseInt(char, 10);
                } else {
                    const isWhite = char === char.toUpperCase();
                    const pieceType = char.toLowerCase();
                    const sqName = this.coordsToSquare(file, boardRank);
                    this.spawnPiece(sqName, pieceType, isWhite);
                    file++;
                }
            }
        }
    }

    spawnPiece(square, pieceType, isWhite) {
        const mesh = window.pieceModelFactory.createPieceMesh(pieceType, isWhite, this.theme);
        const coords = this.squareToCoords(square);
        mesh.position.set(coords.x, 0.12, coords.z);
        mesh.userData.square = square;
        this.scene.add(mesh);

        this.pieceMeshes[square] = {
            mesh,
            type: pieceType,
            color: isWhite ? 'white' : 'black',
            square
        };
        return mesh;
    }

    animateMove(fromSq, toSq, promotion = null, onComplete = null) {
        const version = this.positionVersion;
        const pieceData = this.pieceMeshes[fromSq];
        if (!pieceData) {
            if (onComplete) onComplete();
            return;
        }

        const fromCoords = this.squareToCoords(fromSq);
        const toCoords = this.squareToCoords(toSq);
        const targetPieceData = this.pieceMeshes[toSq];

        // Handle Capture & Move Classification
        const isEnPassant = pieceData.type === 'p' && fromSq[0] !== toSq[0] && !targetPieceData;
        const isCapture = !!targetPieceData || isEnPassant;
        const isCastle = pieceData.type === 'k' && Math.abs(fromCoords.x - toCoords.x) > 1.5;

        if (targetPieceData) {
            this.spawnCaptureParticles(toCoords.x, 0.6, toCoords.z, targetPieceData.color === 'white' ? 0xffffff : 0x333333);
            this.removeObjects([targetPieceData.mesh]);
            delete this.pieceMeshes[toSq];
        }

        // Parabolic Move Animation
        const startPos = new THREE.Vector3(fromCoords.x, 0.12, fromCoords.z);
        const endPos = new THREE.Vector3(toCoords.x, 0.12, toCoords.z);
        const peakHeight = pieceData.type === 'n' ? 1.4 : 0.8; // Knights jump higher!

        const duration = this.reducedMotion ? 1 : 280;
        const startTime = performance.now();

        const moveLoop = (now) => {
            if (version !== this.positionVersion) return;
            const elapsed = now - startTime;
            const t = Math.min(1.0, elapsed / duration);

            // EaseInOutQuad
            const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

            const currX = startPos.x + (endPos.x - startPos.x) * ease;
            const currZ = startPos.z + (endPos.z - startPos.z) * ease;
            // Parabola: 4 * h * t * (1 - t)
            const currY = startPos.y + 4 * peakHeight * t * (1 - t);

            pieceData.mesh.position.set(currX, currY, currZ);

            if (t < 1.0) {
                requestAnimationFrame(moveLoop);
            } else {
                pieceData.mesh.position.copy(endPos);
                delete this.pieceMeshes[fromSq];

                // Play authentic tactile sound on touchdown
                if (isCapture) {
                    window.soundEngine?.playCapture();
                } else if (isCastle) {
                    window.soundEngine?.playCastle();
                } else {
                    window.soundEngine?.playMove();
                }

                // Handle Pawn Promotion mesh replacement
                if (promotion) {
                    this.removeObjects([pieceData.mesh]);
                    this.spawnPiece(toSq, promotion.toLowerCase(), pieceData.color === 'white');
                } else {
                    pieceData.square = toSq;
                    pieceData.mesh.userData.square = toSq;
                    this.pieceMeshes[toSq] = pieceData;
                }

                this.highlightMove(fromSq, toSq);
                if (onComplete) onComplete();
            }
        };

        requestAnimationFrame(moveLoop);
    }

    spawnCaptureParticles(x, y, z, colorHex) {
        if (this.reducedMotion) return;
        const count = 28;
        const particleGeom = new THREE.DodecahedronGeometry(0.06);

        for (let i = 0; i < count; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: colorHex,
                transparent: true,
                opacity: 0.95
            });
            const mesh = new THREE.Mesh(particleGeom, mat);
            mesh.position.set(x, y, z);

            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 4.5,
                Math.random() * 4.0 + 1.5,
                (Math.random() - 0.5) * 4.5
            );

            this.scene.add(mesh);
            this.particles.push({ mesh, velocity, life: 1.0 });
        }
    }

    showMoveIndicators(squares) {
        this.clearIndicators();
        // High-visibility friendly indicators: Ring for captures, solid soft disc for free moves
        const freeGeom = new THREE.CircleGeometry(0.22, 32);
        freeGeom.rotateX(-Math.PI / 2);

        const captureGeom = new THREE.RingGeometry(0.25, 0.44, 32);
        captureGeom.rotateX(-Math.PI / 2);

        squares.forEach(sq => {
            const coords = this.squareToCoords(sq);
            const isTargetEnemy = !!this.pieceMeshes[sq];

            const mat = new THREE.MeshBasicMaterial({
                color: isTargetEnemy ? 0xef4444 : 0x10b981,
                transparent: true,
                opacity: isTargetEnemy ? 0.85 : 0.70,
                side: THREE.DoubleSide
            });

            const mesh = new THREE.Mesh(isTargetEnemy ? captureGeom : freeGeom, mat);
            mesh.position.set(coords.x, 0.13, coords.z);
            mesh.userData.square = sq;
            this.scene.add(mesh);
            this.indicators.push(mesh);
        });
    }

    clearIndicators() {
        this.removeObjects(this.indicators);
        this.indicators = [];
    }

    highlightMove(fromSq, toSq) {
        // Reset previous highlights
        this.tiles.forEach(t => {
            t.material = t.userData.defaultMaterial;
        });
        this.highlightMaterial?.dispose();

        const highlightMat = new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            emissive: 0x78350f,
            emissiveIntensity: 0.5,
            roughness: 0.3
        });
        this.highlightMaterial = highlightMat;

        [fromSq, toSq].forEach(sq => {
            const coords = this.squareToCoords(sq);
            const idx = coords.rank * 8 + coords.file;
            if (this.tiles[idx]) {
                this.tiles[idx].material = highlightMat;
            }
        });
    }

    setKingCheckHighlight(kingSquare, isCheck) {
        this.clearKingCheck();
        if (!isCheck || !kingSquare) return;

        const coords = this.squareToCoords(kingSquare);
        const ringGeom = new THREE.RingGeometry(0.35, 0.52, 32);
        ringGeom.rotateX(-Math.PI / 2);

        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xef4444,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        });

        this.kingCheckMesh = new THREE.Mesh(ringGeom, ringMat);
        this.kingCheckMesh.position.set(coords.x, 0.135, coords.z);
        this.scene.add(this.kingCheckMesh);
    }

    clearKingCheck() {
        if (this.kingCheckMesh) {
            this.removeObjects([this.kingCheckMesh]);
            this.kingCheckMesh = null;
        }
    }

    showPredictedMoveArrow(fromSq, toSq) {
        this.clearPredictedArrow();
        if (!fromSq || !toSq) return;

        const from = this.squareToCoords(fromSq);
        const to = this.squareToCoords(toSq);

        const vFrom = new THREE.Vector3(from.x, 0.35, from.z);
        const vTo = new THREE.Vector3(to.x, 0.35, to.z);

        // Build curved parabolic tube arrow
        const midPoint = new THREE.Vector3()
            .addVectors(vFrom, vTo)
            .multiplyScalar(0.5)
            .add(new THREE.Vector3(0, 0.9, 0));

        const curve = new THREE.QuadraticBezierCurve3(vFrom, midPoint, vTo);
        const tubeGeom = new THREE.TubeGeometry(curve, 24, 0.07, 12, false);
        const tubeMat = new THREE.MeshStandardMaterial({
            color: 0x10b981,
            emissive: 0x059669,
            emissiveIntensity: 0.8,
            roughness: 0.2
        });

        const arrowGroup = new THREE.Group();
        const tube = new THREE.Mesh(tubeGeom, tubeMat);
        arrowGroup.add(tube);

        // Arrow head cone
        const coneGeom = new THREE.ConeGeometry(0.18, 0.45, 16);
        const coneMat = new THREE.MeshStandardMaterial({
            color: 0x10b981,
            emissive: 0x059669,
            emissiveIntensity: 0.9
        });
        const cone = new THREE.Mesh(coneGeom, coneMat);
        cone.position.copy(vTo);
        
        // Orient cone pointing towards target
        const dir = new THREE.Vector3().subVectors(vTo, midPoint).normalize();
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        arrowGroup.add(cone);

        this.scene.add(arrowGroup);
        this.arrowMesh = arrowGroup;
    }

    clearPredictedArrow() {
        if (this.arrowMesh) {
            this.removeObjects([this.arrowMesh]);
            this.arrowMesh = null;
        }
    }

    renderHeatmap(heatmapData) {
        this.clearHeatmap();
        if (!heatmapData || heatmapData.length !== 64) return;

        const padGeom = new THREE.PlaneGeometry(0.92, 0.92);
        padGeom.rotateX(-Math.PI / 2);

        for (let i = 0; i < 64; i++) {
            const val = heatmapData[i];
            if (val === 0) continue;

            const rank = Math.floor(i / 8);
            const file = i % 8;
            const x = file - 3.5;
            const z = 3.5 - rank;

            const isWhite = val > 0;
            const intensity = Math.min(1.0, Math.abs(val) / 4.0);
            const color = isWhite ? 0x10b981 : 0xef4444;

            const mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.25 + intensity * 0.35,
                side: THREE.DoubleSide
            });

            const pad = new THREE.Mesh(padGeom, mat);
            pad.position.set(x, 0.125, z);
            this.scene.add(pad);
            this.heatmapMeshes.push(pad);
        }
    }

    clearHeatmap() {
        this.removeObjects(this.heatmapMeshes);
        this.heatmapMeshes = [];
    }

    onPointerDown(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // 1. Check if the ray hits an active Move Indicator directly
        if (this.indicators.length > 0) {
            const indicatorHits = this.raycaster.intersectObjects(this.indicators, false);
            if (indicatorHits.length > 0 && indicatorHits[0].object.userData?.square) {
                if (this.onSquareClick) this.onSquareClick(indicatorHits[0].object.userData.square);
                return;
            }
        }

        // 2. Exact chessboard surface plane intersection (y = 0.06)
        const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.06);
        const planePt = new THREE.Vector3();
        let planeSq = null;
        if (this.raycaster.ray.intersectPlane(boardPlane, planePt)) {
            const file = Math.floor(planePt.x + 4.0);
            const rank = Math.floor(4.0 - planePt.z);
            if (file >= 0 && file <= 7 && rank >= 0 && rank <= 7) {
                planeSq = this.coordsToSquare(file, rank);
            }
        }

        // 3. Raycast piece meshes & tiles
        const pieces = Object.values(this.pieceMeshes).map(p => p.mesh);
        const meshHits = this.raycaster.intersectObjects([...this.tiles, ...pieces], true);

        let clickedSq = null;
        if (meshHits.length > 0) {
            for (const hit of meshHits) {
                let obj = hit.object;
                while (obj && !obj.userData?.square) obj = obj.parent;
                if (obj && obj.userData?.square) {
                    clickedSq = obj.userData.square;
                    break;
                }
            }
        }

        // 4. Resolve final square
        let finalSq = planeSq || clickedSq;
        if (clickedSq && this.pieceMeshes[clickedSq]) {
            if (clickedSq === planeSq) {
                finalSq = clickedSq;
            } else if (!this.selectedSquare) {
                finalSq = (planeSq && this.pieceMeshes[planeSq]) ? planeSq : clickedSq;
            } else {
                finalSq = planeSq || clickedSq;
            }
        }

        if (finalSq && this.onSquareClick) {
            this.onSquareClick(finalSq);
        }
    }

    onWindowResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth || window.innerWidth || 800;
        const height = this.container.clientHeight || Math.max(300, window.innerHeight - 120);
        if (width <= 0 || height <= 0) return;

        const aspect = width / height;
        if (!isFinite(aspect) || aspect <= 0) return;

        this.camera.aspect = aspect;
        const zoomFactor = Math.min(1.0, aspect / 1.1) * (aspect < 1.1 ? 0.78 : 0.88);
        this.camera.zoom = isFinite(zoomFactor) && zoomFactor > 0.1 ? zoomFactor : 0.85;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    animate(now) {
        requestAnimationFrame(this.animate);
        if (document.hidden) return;

        try {
            // Update OrbitControls
            if (this.controls) this.controls.update();

            // Update Capture Particles
            const delta = 0.016;
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.mesh.position.addScaledVector(p.velocity, delta);
                p.velocity.y -= 9.8 * delta; // Gravity
                p.life -= delta * 1.5;
                if (p.mesh.material) p.mesh.material.opacity = Math.max(0, p.life);

                if (p.life <= 0) {
                    this.removeObjects([p.mesh]);
                    this.particles.splice(i, 1);
                }
            }

            // Pulse king check aura
            if (this.kingCheckMesh && !this.reducedMotion) {
                const scale = 1.0 + Math.sin(now * 0.008) * 0.12;
                this.kingCheckMesh.scale.set(scale, 1, scale);
            }

            // Gentle float for predicted arrow
            if (this.arrowMesh && !this.reducedMotion) {
                this.arrowMesh.position.y = Math.sin(now * 0.005) * 0.06;
            }

            this.renderer.render(this.scene, this.camera);
        } catch (err) {
            console.warn('Render loop frame caught:', err);
        }
    }

    removeObjects(objects) {
        const geometries = new Set(), materials = new Set();
        objects.forEach(object => {
            this.scene.remove(object);
            object.traverse(child => {
                if (child.geometry) geometries.add(child.geometry);
                if (child.material) (Array.isArray(child.material) ? child.material : [child.material]).forEach(material => materials.add(material));
            });
        });
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(material => material.dispose());
    }

    beveledBoard(size, depth, bevel) {
        const half = size / 2 - bevel;
        const shape = new THREE.Shape();
        shape.moveTo(-half,-half); shape.lineTo(half,-half);
        shape.lineTo(half,half); shape.lineTo(-half,half); shape.closePath();
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth, bevelEnabled:true, bevelThickness:bevel, bevelSize:bevel, bevelSegments:3, steps:1
        });
        geometry.rotateX(-Math.PI / 2);
        return geometry;
    }

    addCoordinates(group) {
        const label = (text, x, z, flipped) => {
            const canvas = document.createElement('canvas'); canvas.width=128; canvas.height=128;
            const context = canvas.getContext('2d');
            context.fillStyle='#e6d2b4'; context.font='500 78px Georgia'; context.textAlign='center'; context.textBaseline='middle';
            context.fillText(text,64,67);
            const texture = new THREE.CanvasTexture(canvas); texture.encoding=THREE.sRGBEncoding;
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.22,.22), new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));
            mesh.rotation.x=-Math.PI/2; if (flipped) mesh.rotateZ(Math.PI);
            mesh.position.set(x,.085,z); group.add(mesh);
        };
        for (let index=0; index<8; index++) {
            label(String.fromCharCode(97+index),index-3.5,4.22,false);
            label(String.fromCharCode(97+index),index-3.5,-4.22,true);
            label(String(index+1),-4.22,3.5-index,false);
            label(String(index+1),4.22,3.5-index,true);
        }
    }
}

window.Board3D = Board3D;
