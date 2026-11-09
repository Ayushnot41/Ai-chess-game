/** Deterministic, local material textures. No downloaded artwork or runtime API. */
class ChessMaterials {
    constructor() { this.textures = new Map(); }
    wood(light = false) {
        const key = light ? 'maple' : 'walnut';
        if (this.textures.has(key)) return this.textures.get(key);
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
        const context = canvas.getContext('2d');
        const pixels = context.createImageData(512, 512);
        let seed = 719;
        for (let y = 0; y < 512; y++) {
            for (let x = 0; x < 512; x++) {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                const bend = Math.sin(y * .012) * 8 + Math.sin(y * .034 + x * .002) * 2;
                const grain = Math.sin((x + bend) * .19) * 1.1 + Math.sin((x + bend) * .67) * .6;
                const pore = seed / 4294967296 * 3;
                const wave = Math.sin(x * .025 + Math.sin(y * .006)) * 3;
                const value = grain + pore + wave;
                const rgb = light ? [191,172,137] : [89,64,43];
                const index = (y * 512 + x) * 4;
                for (let channel = 0; channel < 3; channel++) pixels.data[index+channel] = rgb[channel] + value;
                pixels.data[index+3] = 255;
            }
        }
        context.putImageData(pixels, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        texture.anisotropy = 8;
        this.textures.set(key, texture);
        return texture;
    }

    studio(renderer) {
        try {
            const room = new THREE.Scene();
            const walls = new THREE.Mesh(new THREE.BoxGeometry(30, 20, 30), new THREE.MeshBasicMaterial({color:0x555555, side:THREE.BackSide}));
            room.add(walls);
            const panels = [
                {position:[-8,8,3],size:[5,10],power:3.5},
                {position:[7,6,-5],size:[4,8],power:2},
                {position:[0,10,0],size:[8,8],power:2.5}
            ];
            panels.forEach(({position,size,power}) => {
                const panel = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({color:new THREE.Color(1, .94, .85).multiplyScalar(power), side:THREE.DoubleSide}));
                panel.position.set(...position); panel.lookAt(0,0,0); room.add(panel);
            });
            const generator = new THREE.PMREMGenerator(renderer);
            const target = generator.fromScene(room, 0.04);
            room.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
            generator.dispose();
            return target;
        } catch (err) {
            console.warn('Studio generation fallback:', err);
            return null;
        }
    }
}
window.chessMaterials = new ChessMaterials();
