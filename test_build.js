/* 无浏览器自检：用真实 three.js 跑一遍贴图生成与场景构建，捕捉运行时错误 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = 'D:\\gongzuoqu\\scene';

// ---------- 伪造 DOM ----------
function makeCtx(canvas) {
  const grad = { addColorStop() {} };
  const handler = {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'canvas') return canvas;
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createPattern') return () => ({});
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  };
  return new Proxy({}, handler);
}

function makeCanvas() {
  const c = {
    width: 2, height: 2, style: {},
    getContext: (type) => makeCtx(c),
    addEventListener() {}, removeEventListener() {},
    toDataURL: () => 'data:,'
  };
  return c;
}

const els = {};
function makeEl(id) {
  return {
    id, style: {}, classList: { add() {}, remove() {} },
    addEventListener() {}, removeEventListener() {},
    setPointerCapture() {}, releasePointerCapture() {},
    appendChild() {}, remove() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }),
    setAttribute() {}, querySelector: () => null, textContent: ''
  };
}

const documentStub = {
  createElement(tag) {
    if (tag === 'canvas') return makeCanvas();
    return makeEl(tag);
  },
  getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
  querySelector() { return null; },
  addEventListener() {},
  body: makeEl('body'),
  documentElement: makeEl('html')
};

const listeners = {};
const windowStub = {
  innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1,
  addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
  removeEventListener() {},
  requestAnimationFrame(f) { return 1; },
  cancelAnimationFrame() {},
  setTimeout() {}, clearTimeout() {},
  performance: { now: () => Date.now() },
  location: { href: 'file:///D:/gongzuoqu/scene/index.html' }
};

// 让沙箱全局对象本身就是 window，这样裸标识符 TEX / THREE 能正确解析
Object.assign(windowStub, {
  document: documentStub,
  navigator: { userAgent: 'node' },
  console,
  performance: windowStub.performance,
  requestAnimationFrame: windowStub.requestAnimationFrame,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  URL, Math, Date, JSON, Object, Array, String, Number, Boolean, Error, RegExp,
  Float32Array, Uint8Array, Uint8ClampedArray, Uint16Array, Int32Array, ArrayBuffer,
  HTMLElement: function () {}
});
windowStub.self = windowStub;
windowStub.window = windowStub;
windowStub.global = windowStub;

const sandbox = vm.createContext(windowStub);

// ---------- 载入 three ----------
const threeSrc = fs.readFileSync(path.join(ROOT, 'lib', 'three.min.js'), 'utf8');
vm.runInContext(threeSrc, sandbox, { filename: 'three.min.js' });

// ---------- 替换 WebGLRenderer / PMREM ----------
const patch = `
(function(){
  const T = window.THREE || THREE;
  const canvas = document.getElementById('view');
  class FakeRenderer {
    constructor(){ this.domElement = canvas; this.shadowMap = {enabled:false,type:0};
      this.outputEncoding = 0; this.toneMapping = 0; this.toneMappingExposure = 1; }
    setPixelRatio(){} setSize(){} render(){} dispose(){}
    compile(){} getContext(){ return {}; }
  }
  class FakePMREM {
    constructor(){}
    compileEquirectangularShader(){}
    fromEquirectangular(t){ return { texture: t }; }
    dispose(){}
  }
  Object.defineProperty(T, 'WebGLRenderer', { value: FakeRenderer, writable:true, configurable:true });
  Object.defineProperty(T, 'PMREMGenerator', { value: FakePMREM, writable:true, configurable:true });
})();
`;
vm.runInContext(patch, sandbox, { filename: 'patch.js' });

// 让 canvas.getContext('webgl2') 也能返回东西
const view = sandbox.document.getElementById('view');
view.getContext = () => ({});

// ---------- 统计 ----------
const stats = { meshes: 0, lights: 0, sprites: 0, lines: 0, materials: 0, textures: 0 };

// ---------- 载入自己的脚本 ----------
function run(file) {
  const src = fs.readFileSync(path.join(ROOT, 'js', file), 'utf8');
  vm.runInContext(src, sandbox, { filename: file });
}

let ok = true;
try {
  run('textures.js');
  run('scene.js');
} catch (e) {
  ok = false;
  console.error('RUNTIME ERROR:', e && e.stack ? e.stack.split('\n').slice(0, 8).join('\n') : e);
}

if (ok) {
  const THREE = sandbox.THREE || sandbox.window.THREE;
  const s = sandbox.window.__scene;
  if (!s) {
    console.log('!! window.__scene 未导出（可能中途 return）');
  } else {
    s.scene.traverse((o) => {
      if (o.isMesh) stats.meshes++;
      else if (o.isLight) stats.lights++;
      else if (o.isSprite) stats.sprites++;
      else if (o.isLine) stats.lines++;
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        stats.materials += ms.length;
        for (const m of ms) if (m && m.map) stats.textures++;
      }
    });
    console.log('BUILD OK');
    console.log('  meshes   :', stats.meshes);
    console.log('  lights   :', stats.lights);
    console.log('  sprites  :', stats.sprites);
    console.log('  lines    :', stats.lines);
    console.log('  materials:', stats.materials);
    console.log('  mapped   :', stats.textures);

    // 关键物体是否存在于正确位置
    const cam = s.camera;
    console.log('  camera   :', cam.position.toArray().map(v => +v.toFixed(2)).join(', '));

    // 包围盒，检查尺度是否合理（防止模型飞出画面）
    const bbox = new THREE.Box3().setFromObject(s.scene);
    const size = new THREE.Vector3(); bbox.getSize(size);
    const ctr = new THREE.Vector3(); bbox.getCenter(ctr);
    console.log('  bbox size:', size.toArray().map(v => +v.toFixed(1)).join(' x '));
    console.log('  bbox ctr :', ctr.toArray().map(v => +v.toFixed(1)).join(', '));
    console.log('  y range  :', bbox.min.y.toFixed(2), '→', bbox.max.y.toFixed(2));

    // 检查 NaN 顶点（最容易出的几何错误）
    let nanMeshes = 0;
    s.scene.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
        const a = o.geometry.attributes.position.array;
        for (let i = 0; i < a.length; i++) {
          if (!Number.isFinite(a[i])) { nanMeshes++; break; }
        }
      }
    });
    console.log('  NaN geo  :', nanMeshes);
  }
}

process.exit(ok ? 0 : 1);
