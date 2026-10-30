/* 找出掉到地面以下 / 尺度异常的物体 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = 'D:\\gongzuoqu\\scene';

function makeCtx(canvas) {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'canvas') return canvas;
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (k === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
function makeCanvas() {
  const c = { width: 2, height: 2, style: {}, getContext: () => makeCtx(c), addEventListener() {}, toDataURL: () => 'data:,' };
  return c;
}
const els = {};
function makeEl(id) {
  return { id, style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, removeEventListener() {},
    setPointerCapture() {}, releasePointerCapture() {}, appendChild() {}, remove() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }), setAttribute() {}, querySelector: () => null };
}
const documentStub = {
  createElement: (t) => t === 'canvas' ? makeCanvas() : makeEl(t),
  getElementById: (id) => els[id] || (els[id] = makeEl(id)),
  querySelector: () => null, addEventListener() {}, body: makeEl('body'), documentElement: makeEl('html')
};
const windowStub = {
  innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  setTimeout() {}, clearTimeout() {},
  performance: { now: () => Date.now() },
  location: { href: 'file:///' }
};
Object.assign(windowStub, {
  document: documentStub, navigator: { userAgent: 'node' }, console,
  performance: windowStub.performance,
  requestAnimationFrame: windowStub.requestAnimationFrame,
  setTimeout, clearTimeout,
  URL, Math, Date, JSON, Object, Array, String, Number, Boolean, Error, RegExp,
  Float32Array, Uint8Array, Uint8ClampedArray, Uint16Array, Int32Array, ArrayBuffer,
  HTMLElement: function () {}
});
windowStub.self = windowStub; windowStub.window = windowStub; windowStub.global = windowStub;
const sandbox = vm.createContext(windowStub);

vm.runInContext(fs.readFileSync(path.join(ROOT, 'lib', 'three.min.js'), 'utf8'), sandbox, { filename: 'three.min.js' });
vm.runInContext(`
(function(){
  const T = window.THREE;
  class FR { constructor(){ this.domElement = document.getElementById('view');
    this.shadowMap={enabled:false,type:0}; this.outputEncoding=0; this.toneMapping=0; this.toneMappingExposure=1; }
    setPixelRatio(){} setSize(){} render(){} compile(){} dispose(){} }
  class FP { compileEquirectangularShader(){} fromEquirectangular(t){ return { texture: t }; } dispose(){} }
  Object.defineProperty(T,'WebGLRenderer',{value:FR,writable:true,configurable:true});
  Object.defineProperty(T,'PMREMGenerator',{value:FP,writable:true,configurable:true});
})();`, sandbox, { filename: 'patch.js' });
sandbox.document.getElementById('view').getContext = () => ({});

vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'textures.js'), 'utf8'), sandbox, { filename: 'textures.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'scene.js'), 'utf8'), sandbox, { filename: 'scene.js' });

const THREE = sandbox.THREE;
const s = sandbox.window.__scene;
s.scene.updateMatrixWorld(true);
console.log('scene children:', s.scene.children.length);

// 按顶层子节点分组统计真实世界包围盒
console.log('\n--- top-level groups bounds (world) ---');
s.scene.children.forEach((child, i) => {
  const b = new THREE.Box3().setFromObject(child);
  if (b.isEmpty()) return;
  const sz = new THREE.Vector3(); b.getSize(sz);
  if (sz.length() > 40 || b.min.y < -0.06) {
    console.log(`#${i} ${child.type} y=[${b.min.y.toFixed(2)}, ${b.max.y.toFixed(2)}] size=${sz.toArray().map(v=>+v.toFixed(1)).join('x')}`);
  }
});

const bad = [];
s.scene.traverse((o) => {
  if (!o.isMesh && !o.isSprite && !o.isLine) return;
  const b = new THREE.Box3().setFromObject(o);
  if (b.isEmpty()) return;
  if (b.min.y < -0.05) {
    const size = new THREE.Vector3(); b.getSize(size);
    bad.push({ type: o.type, name: o.name || '(unnamed)', geo: o.geometry && o.geometry.type,
      minY: +b.min.y.toFixed(2), maxY: +b.max.y.toFixed(2),
      size: size.toArray().map(v => +v.toFixed(1)).join('x'),
      pos: o.position.toArray().map(v => +v.toFixed(1)).join(',') });
  }
});
console.log('objects below ground:', bad.length);
bad.slice(0, 25).forEach((b) => console.log(' ', JSON.stringify(b)));

// 顶部漂浮物
const high = [];
s.scene.traverse((o) => {
  if (!o.isMesh && !o.isSprite) return;
  const b = new THREE.Box3().setFromObject(o);
  if (b.isEmpty()) return;
  if (b.max.y > 23) high.push({ type: o.type, maxY: +b.max.y.toFixed(1), geo: o.geometry && o.geometry.type });
});
console.log('objects above 23:', high.length, JSON.stringify(high.slice(0, 6)));

process.exit(0);
