/**
 * Procedural 3D Staunton Chess Piece Geometry & Material Generator
 * High-performance, self-contained Three.js models with smooth normals and bevels.
 */

class PieceModelFactory {
    constructor() {
        this.cache = {};
    }

    createPedestal(radiusBottom = 0.38, radiusTop = 0.28, height = 0.25) {
        const points = [];
        const segments = 12;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const y = t * height;
            // Elegant turned base curve
            const r = radiusBottom - (radiusBottom - radiusTop) * Math.sin(t * Math.PI * 0.5);
            points.push(new THREE.Vector2(r, y));
        }
        return new THREE.LatheGeometry(points, 24);
    }

    createPawn() {
        const group = new THREE.Group();
        
        // Base pedestal
        const baseGeom = this.createPedestal(0.35, 0.24, 0.22);
        const base = new THREE.Mesh(baseGeom);
        group.add(base);

        // Body stem (lathe)
        const stemPts = [
            new THREE.Vector2(0.24, 0.22),
            new THREE.Vector2(0.16, 0.45),
            new THREE.Vector2(0.14, 0.60),
            new THREE.Vector2(0.20, 0.65), // Collar
            new THREE.Vector2(0.12, 0.68)
        ];
        const stemGeom = new THREE.LatheGeometry(stemPts, 24);
        const stem = new THREE.Mesh(stemGeom);
        group.add(stem);

        // Spherical head
        const headGeom = new THREE.SphereGeometry(0.18, 20, 16);
        const head = new THREE.Mesh(headGeom);
        head.position.y = 0.82;
        group.add(head);

        group.name = "pawn";
        return group;
    }

    createRook() {
        const group = new THREE.Group();

        // Pedestal
        const baseGeom = this.createPedestal(0.38, 0.28, 0.25);
        const base = new THREE.Mesh(baseGeom);
        group.add(base);

        // Tower Body
        const towerPts = [
            new THREE.Vector2(0.28, 0.25),
            new THREE.Vector2(0.23, 0.70),
            new THREE.Vector2(0.30, 0.75), // Rampart base
            new THREE.Vector2(0.30, 1.00)  // Parapet
        ];
        const towerGeom = new THREE.LatheGeometry(towerPts, 24);
        const tower = new THREE.Mesh(towerGeom);
        group.add(tower);

        // Crenellations (4 battlements)
        const crenHeight = 0.14;
        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI) / 2;
            const crenGeom = new THREE.BoxGeometry(0.15, crenHeight, 0.15);
            const cren = new THREE.Mesh(crenGeom);
            cren.position.set(
                Math.cos(angle) * 0.22,
                1.00 + crenHeight / 2,
                Math.sin(angle) * 0.22
            );
            group.add(cren);
        }

        group.name = "rook";
        return group;
    }

    createKnight() {
        const group = new THREE.Group();

        // Pedestal
        const baseGeom = this.createPedestal(0.38, 0.28, 0.24);
        const base = new THREE.Mesh(baseGeom);
        group.add(base);

        // Horse Head sculpted silhouette (Extruded curved path)
        const shape = new THREE.Shape();
        shape.moveTo(-0.16, 0.24);
        shape.lineTo(0.18, 0.24);
        shape.quadraticCurveTo(0.22, 0.50, 0.28, 0.75); // Breast/neck
        shape.quadraticCurveTo(0.35, 0.85, 0.28, 0.95); // Muzzle
        shape.lineTo(0.12, 1.05);                       // Nose/forehead
        shape.lineTo(0.08, 1.20);                       // Ear tip
        shape.lineTo(0.02, 1.10);                       // Back of ear
        shape.quadraticCurveTo(-0.12, 0.90, -0.18, 0.60);// Mane arch
        shape.closePath();

        const extrudeSettings = {
            depth: 0.24,
            bevelEnabled: true,
            bevelSegments: 4,
            steps: 1,
            bevelSize: 0.05,
            bevelThickness: 0.04
        };

        const headGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        headGeom.center();
        const head = new THREE.Mesh(headGeom);
        head.position.y = 0.72;
        head.rotation.y = Math.PI / 2;
        group.add(head);

        group.name = "knight";
        return group;
    }

    createBishop() {
        const group = new THREE.Group();

        // Pedestal
        const baseGeom = this.createPedestal(0.38, 0.26, 0.24);
        const base = new THREE.Mesh(baseGeom);
        group.add(base);

        // Bishop Mitre body (lathe)
        const mitrePts = [
            new THREE.Vector2(0.26, 0.24),
            new THREE.Vector2(0.16, 0.55),
            new THREE.Vector2(0.22, 0.62), // Collar ring
            new THREE.Vector2(0.16, 0.66),
            new THREE.Vector2(0.26, 0.95), // Egg body bulge
            new THREE.Vector2(0.15, 1.20), // Taper to tip
            new THREE.Vector2(0.04, 1.30)
        ];
        const mitreGeom = new THREE.LatheGeometry(mitrePts, 24);
        const mitre = new THREE.Mesh(mitreGeom);
        group.add(mitre);

        // Small cross/finial sphere on top
        const finialGeom = new THREE.SphereGeometry(0.07, 16, 12);
        const finial = new THREE.Mesh(finialGeom);
        finial.position.y = 1.34;
        group.add(finial);

        group.name = "bishop";
        return group;
    }

    createQueen() {
        const group = new THREE.Group();

        // Pedestal
        const baseGeom = this.createPedestal(0.42, 0.29, 0.26);
        const base = new THREE.Mesh(baseGeom);
        group.add(base);

        // Flaring majestic waist & coronet
        const queenPts = [
            new THREE.Vector2(0.29, 0.26),
            new THREE.Vector2(0.18, 0.65),
            new THREE.Vector2(0.24, 0.72),
            new THREE.Vector2(0.18, 0.77),
            new THREE.Vector2(0.28, 1.15),
            new THREE.Vector2(0.36, 1.35)  // Coronet flare
        ];
        const queenGeom = new THREE.LatheGeometry(queenPts, 24);
        const queen = new THREE.Mesh(queenGeom);
        group.add(queen);

        // Coronet pearls (8 radiating jewels)
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4;
            const pearlGeom = new THREE.SphereGeometry(0.045, 12, 10);
            const pearl = new THREE.Mesh(pearlGeom);
            pearl.position.set(
                Math.cos(angle) * 0.34,
                1.38,
                Math.sin(angle) * 0.34
            );
            group.add(pearl);
        }

        // Center jewel sphere
        const centerJewel = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12));
        centerJewel.position.y = 1.42;
        group.add(centerJewel);

        group.name = "queen";
        return group;
    }

    createKing() {
        const group = new THREE.Group();

        // Base Pedestal
        const baseGeom = this.createPedestal(0.44, 0.31, 0.28);
        const base = new THREE.Mesh(baseGeom);
        group.add(base);

        // Imperial column
        const kingPts = [
            new THREE.Vector2(0.31, 0.28),
            new THREE.Vector2(0.20, 0.70),
            new THREE.Vector2(0.28, 0.78),
            new THREE.Vector2(0.20, 0.84),
            new THREE.Vector2(0.30, 1.25),
            new THREE.Vector2(0.34, 1.45)  // Crown flare
        ];
        const kingGeom = new THREE.LatheGeometry(kingPts, 24);
        const king = new THREE.Mesh(kingGeom);
        group.add(king);

        // Cross finial: Vertical bar
        const vBarGeom = new THREE.BoxGeometry(0.06, 0.24, 0.06);
        const vBar = new THREE.Mesh(vBarGeom);
        vBar.position.y = 1.62;
        group.add(vBar);

        // Cross finial: Horizontal bar
        const hBarGeom = new THREE.BoxGeometry(0.18, 0.06, 0.06);
        const hBar = new THREE.Mesh(hBarGeom);
        hBar.position.y = 1.65;
        group.add(hBar);

        group.name = "king";
        return group;
    }

    createPieceMesh(pieceType, isWhite, theme = 'wood') {
        let pieceObj;
        switch (pieceType.toLowerCase()) {
            case 'p': pieceObj = this.createPawn(); break;
            case 'r': pieceObj = this.createRook(); break;
            case 'n': pieceObj = this.createKnight(); break;
            case 'b': pieceObj = this.createBishop(); break;
            case 'q': pieceObj = this.createQueen(); break;
            case 'k': pieceObj = this.createKing(); break;
            default: pieceObj = this.createPawn();
        }

        // Apply materials across all child meshes
        const mat = this.getMaterial(isWhite, theme);
        pieceObj.traverse((child) => {
            if (child.isMesh) {
                child.material.dispose();
                child.material = mat;
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Face Black knights forward (facing White side) and White knights facing Black side
        if (pieceType.toLowerCase() === 'n') {
            pieceObj.rotation.y = isWhite ? 0 : Math.PI;
        }

        return pieceObj;
    }

    getMaterial(isWhite, theme) {
        if (theme === 'marble') {
            return new THREE.MeshStandardMaterial({
                color: isWhite ? 0xf0f2f5 : 0x1a1d24,
                roughness: 0.15,
                metalness: 0.10,
            });
        } else if (theme === 'cyberpunk') {
            return new THREE.MeshStandardMaterial({
                color: isWhite ? 0x06b6d4 : 0x8b5cf6,
                roughness: 0.25,
                metalness: 0.85,
                emissive: isWhite ? 0x04434f : 0x2e1065,
                emissiveIntensity: 0.25,
            });
        } else if (theme === 'gold') {
            return new THREE.MeshStandardMaterial({
                color: isWhite ? 0xf59e0b : 0x78716c,
                roughness: 0.20,
                metalness: 0.90,
            });
        } else {
            // Classic Wood theme
            return new THREE.MeshStandardMaterial({
                color: isWhite ? 0xded0b6 : 0x3d2b1f,
                roughness: 0.35,
                metalness: 0.05,
            });
        }
    }
}

window.pieceModelFactory = new PieceModelFactory();
