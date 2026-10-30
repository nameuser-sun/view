/* scene.js — 雨夜便利店街景
   坐标系：街道沿 X 轴延伸，建筑在 +Z 侧、正面朝向 -Z。
   一层便利店（暖光内透），二层普通住宅，门前人行道、斑马线、老式轿车、公路车、电线杆路灯。
*/
(function () {
  'use strict';

  // ============================================================
  // 0. 基础
  // ============================================================
  const canvas = document.getElementById('view');
  // 低画质模式（用于离线自检渲染）：?q=low 或 window.__DSH_LOWQ
  const LOWQ = (function () {
    try {
      if (window.__DSH_LOWQ) return true;
      return /[?&]q=low/.test(window.location.search || '');
    } catch (e) { return false; }
  })();
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: !LOWQ, powerPreference: 'high-performance',
    preserveDrawingBuffer: LOWQ   // 低画质/离线截图模式下保留缓冲，否则截图会拿到清空后的黑帧
  });
  renderer.setPixelRatio(LOWQ ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;
  renderer.shadowMap.enabled = !LOWQ;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // 背景更暗、前景留亮：靠 fog 与材质，而不是靠整体曝光

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x141a26, 0.0165);

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 400);
  // 注视点：偏左，把左侧电线杆和斑马线一起纳入构图
  const TARGET = new THREE.Vector3(-2.2, 2.4, 10.0);
  // 相机在建筑前方（-Z 侧）偏左后撤，略微仰视
  camera.position.set(-13.8, 4.2, -3.6);

  // 天空 + 环境反射
  const skyTex = TEX.skyEquirect();
  scene.background = skyTex;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  // 环境反射贴图（保留给金属/玻璃用，但整体压得很低）
  const envRT = pmrem.fromEquirectangular(skyTex);
  scene.environment = envRT.texture;
  // 背景：单独用一张压暗的天空贴图，避免背景过亮
  const bgCanvas = (function () {
    const src = skyTex.image;
    const { c, x } = TEX.cv(src.width, src.height);
    x.drawImage(src, 0, 0);
    x.fillStyle = 'rgba(4,7,13,0.72)';
    x.fillRect(0, 0, src.width, src.height);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  })();
  scene.background = bgCanvas;

  // ============================================================
  // 1. 自制轨道控制（左手拖动旋转 / 滚轮缩放 / 右键平移）
  // ============================================================
  const ctl = (function () {
    const off = camera.position.clone().sub(TARGET);
    const sph = new THREE.Spherical().setFromVector3(off);
    const cur = { theta: sph.theta, phi: sph.phi, radius: sph.radius };
    const dst = { theta: sph.theta, phi: sph.phi, radius: sph.radius };
    const tgtCur = TARGET.clone();
    const tgtDst = TARGET.clone();

    let dragging = 0; // 1=旋转 2=平移
    let lx = 0, ly = 0;
    const el = renderer.domElement;

    el.addEventListener('contextmenu', (e) => e.preventDefault());

    el.addEventListener('pointerdown', (e) => {
      if (e.button === 0) dragging = e.shiftKey ? 2 : 1;
      else if (e.button === 2) dragging = 2;
      else dragging = 0;
      lx = e.clientX; ly = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointerup', (e) => {
      dragging = 0;
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (dragging === 1) {
        dst.theta -= dx * 0.0055;
        dst.phi -= dy * 0.0045;
        dst.phi = Math.max(0.10, Math.min(1.545, dst.phi));
      } else {
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
        const k = dst.radius * 0.0016;
        tgtDst.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
        tgtDst.y = Math.max(0.4, Math.min(14, tgtDst.y));
      }
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const s = Math.exp(e.deltaY * 0.0011);
      dst.radius = Math.max(3.2, Math.min(70, dst.radius * s));
    }, { passive: false });

    // 触摸缩放
    let pinch = null;
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        pinch = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && pinch) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
        dst.radius = Math.max(3.2, Math.min(70, dst.radius * (pinch / d)));
        pinch = d;
      }
    }, { passive: true });
    el.addEventListener('touchend', () => { pinch = null; }, { passive: true });

    return {
      update(dt) {
        const k = 1 - Math.pow(0.0009, dt);
        cur.theta += (dst.theta - cur.theta) * k;
        cur.phi += (dst.phi - cur.phi) * k;
        cur.radius += (dst.radius - cur.radius) * k;
        tgtCur.lerp(tgtDst, k);

        const sp = Math.sin(cur.phi), cp = Math.cos(cur.phi);
        camera.position.set(
          tgtCur.x + cur.radius * sp * Math.cos(cur.theta),
          tgtCur.y + cur.radius * cp,
          tgtCur.z + cur.radius * sp * Math.sin(cur.theta)
        );
        camera.lookAt(tgtCur);
      },
      setView(theta, phi, radius) {
        dst.theta = theta; dst.phi = phi; dst.radius = radius;
      },
      addTheta(d) { dst.theta += d; }
    };
  })();

  // ============================================================
  // 2. 通用材质工具
  // ============================================================
  const M = {
    std(o) { return new THREE.MeshStandardMaterial(o); },
    basic(o) { return new THREE.MeshBasicMaterial(o); }
  };

  function setSrgb(t) {
    if (!t) return t;
    if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function plane(w, h, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    return m;
  }

  // 椭球/胶囊用于有机形状
  function roundedBox(w, h, d, r) {
    const g = new THREE.BoxGeometry(w, h, d, 6, 6, 6);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const cx = Math.max(-hw, Math.min(hw, v.x));
      const cy = Math.max(-hh, Math.min(hh, v.y));
      const cz = Math.max(-hd, Math.min(hd, v.z));
      const dir = new THREE.Vector3(v.x - cx, v.y - cy, v.z - cz);
      if (dir.lengthSq() > 1e-8) {
        dir.normalize().multiplyScalar(r);
        p.setXYZ(i, cx + dir.x, cy + dir.y, cz + dir.z);
      }
    }
    g.computeVertexNormals();
    return g;
  }

  // ============================================================
  // 3. 地面：马路 / 人行道 / 斑马线
  // ============================================================
  const groundGroup = new THREE.Group();
  scene.add(groundGroup);

  const asphaltTex = setSrgb(TEX.asphalt());
  asphaltTex.repeat.set(14, 8);
  const roadMat = M.std({
    map: asphaltTex,
    color: 0x8d9098,
    roughness: 0.30,      // 湿
    metalness: 0.42,
    envMapIntensity: 1.25
  });

  const road = plane(140, 46, roadMat, 0, 0, -14);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  groundGroup.add(road);

  // 人行道
  const swTex = setSrgb(TEX.sidewalk());
  swTex.repeat.set(9, 1.6);
  const swMat = M.std({
    map: swTex, color: 0xa8a8a4, roughness: 0.42, metalness: 0.25, envMapIntensity: 1.1
  });
  const sidewalk = plane(140, 6.2, swMat, 0, 0.15, 9.1);
  sidewalk.rotation.x = -Math.PI / 2;
  sidewalk.receiveShadow = true;
  groundGroup.add(sidewalk);

  // 路缘石
  const curb = box(140, 0.16, 0.36, M.std({ color: 0x6b6c6a, roughness: 0.6, metalness: 0.1 }), 0, 0.075, 6.0);
  groundGroup.add(curb);
  // 路缘白线
  const curbLine = plane(140, 0.1, M.std({ color: 0xc9ccc8, roughness: 0.75 }), 0, 0.155, 6.34);
  curbLine.rotation.x = -Math.PI / 2;
  groundGroup.add(curbLine);

  // 中心虚线
  const dashMat = M.std({ color: 0xc8c6bc, roughness: 0.8, metalness: 0.05 });
  for (let x = -68; x < 68; x += 7) {
    const d = plane(3.2, 0.16, dashMat, x, 0.008, -6.0);
    d.rotation.x = -Math.PI / 2;
    d.receiveShadow = true;
    groundGroup.add(d);
  }
  // 停止线
  const stopLine = plane(0.45, 5.2, dashMat, -9.6, 0.008, 0.0);
  stopLine.rotation.x = -Math.PI / 2;
  groundGroup.add(stopLine);

  // 斑马线：横穿镜头前方的路面，条纹沿 Z 拉长、沿 X 排布
  for (let i = 0; i < 10; i++) {
    const x = -11.0 + i * 1.15;
    const st = plane(0.62, 6.2, M.std({ color: 0xc6c8c0, roughness: 0.72, metalness: 0.06 }), x, 0.009, 1.6);
    st.rotation.x = -Math.PI / 2;
    st.receiveShadow = true;
    groundGroup.add(st);
  }

  // 停止线
  const stopLine2 = plane(0.4, 6.0, dashMat, -12.4, 0.009, 1.6);
  stopLine2.rotation.x = -Math.PI / 2;
  groundGroup.add(stopLine2);

  // 地面上的积水（深色微反光片）
  const puddleMat = M.std({
    color: 0x0d1218, roughness: 0.06, metalness: 0.9,
    envMapIntensity: 1.6, transparent: true, opacity: 0.85
  });
  const puddles = [
    [-6, 0.011, 4.0, 3.2, 1.6], [3.5, 0.011, 2.6, 2.4, 1.2],
    [-1.5, 0.011, -2.2, 4.0, 1.8], [9, 0.011, 4.4, 2.6, 1.3],
    [-13, 0.011, 1.0, 3.0, 1.5], [6.5, 0.011, -4.5, 3.4, 1.6]
  ];
  for (const [x, y, z, sx, sz] of puddles) {
    const p = plane(sx, sz, puddleMat, x, y, z);
    p.rotation.x = -Math.PI / 2;
    p.scale.set(1, 1, 1);
    groundGroup.add(p);
    const p2 = plane(sx * 0.6, sz * 0.6, puddleMat, x + 0.8, y + 0.0005, z + 0.3);
    p2.rotation.x = -Math.PI / 2;
    groundGroup.add(p2);
  }

  // 地面湿反射（用加法光斑伪造倒影，比实时反射便宜且稳定）
  function lightPool(x, z, w, d, color, opacity) {
    const tex = TEX.softGlow(color);
    const mat = M.basic({
      map: tex, transparent: true, opacity, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: true
    });
    const m = plane(w, d, mat, x, 0.02, z);
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 2;
    scene.add(m);
    return m;
  }
  // 店招与店内暖光在湿地面上的倒影
  lightPool(0, 8.0, 16, 7.5, 'rgba(255,168,92,ALPHA)', 0.55);
  lightPool(0, 4.6, 11, 4.0, 'rgba(255,150,70,ALPHA)', 0.34);
  // 店招蓝白色
  lightPool(0, 7.2, 15, 2.6, 'rgba(150,205,255,ALPHA)', 0.18);
  // 路灯冷光池
  lightPool(-12.5, 2.0, 9, 6, 'rgba(150,200,255,ALPHA)', 0.30);
  lightPool(13.0, 2.5, 8, 5.5, 'rgba(150,200,255,ALPHA)', 0.16);

  // ============================================================
  // 4. 建筑外壳（二层日式）
  // ============================================================
  const BX0 = -7, BX1 = 7, BZ0 = 12, BZ1 = 22;
  const H1 = 3.05, H2 = 6.85, ROOF = 7.15;
  const BW = BX1 - BX0, BD = BZ1 - BZ0;

  const building = new THREE.Group();
  scene.add(building);

  const tileTex = setSrgb(TEX.wallTile());
  const wallMat = M.std({
    map: tileTex, color: 0x5d594f, roughness: 0.86, metalness: 0.05, envMapIntensity: 0.45
  });
  const wallMatDark = M.std({
    map: tileTex, color: 0x3e3b35, roughness: 0.9, metalness: 0.04, envMapIntensity: 0.35
  });
  const concreteMat = M.std({
    map: setSrgb(TEX.concrete()), color: 0x585a5c, roughness: 0.9, metalness: 0.04, envMapIntensity: 0.4
  });

  // 侧墙（整块）
  building.add(box(0.24, H2, BD, wallMat, BX0 - 0.12, H2 / 2, (BZ0 + BZ1) / 2));
  building.add(box(0.24, H2, BD, wallMat, BX1 + 0.12, H2 / 2, (BZ0 + BZ1) / 2));
  // 背墙
  building.add(box(BW + 0.5, H2, 0.24, wallMatDark, 0, H2 / 2, BZ1 + 0.12));
  // 楼板/屋顶
  building.add(box(BW + 0.5, 0.34, BD + 0.3, concreteMat, 0, ROOF + 0.17, (BZ0 + BZ1) / 2));
  // 二层楼板（把便利店顶起来）
  building.add(box(BW, 0.26, BD, concreteMat, 0, H1, (BZ0 + BZ1) / 2));

  // 正面：一层两端的柱 + 上沿墙
  const pierL = box(0.75, H1, 0.3, wallMat, BX0 + 0.375, H1 / 2, BZ0 + 0.15);
  const pierR = box(0.75, H1, 0.3, wallMat, BX1 - 0.375, H1 / 2, BZ0 + 0.15);
  building.add(pierL, pierR);

  // 上方招牌带（一层与二层之间）
  const SIGN_Y0 = 2.42, SIGN_H = 0.95;
  building.add(box(BW, SIGN_H, 0.22, M.std({ color: 0x2b2f36, roughness: 0.5, metalness: 0.4 }), 0, SIGN_Y0 + SIGN_H / 2, BZ0 - 0.02));

  // 招牌灯箱（自发光）——招牌带过亮会把整片墙洗白，压一点
  const signTex = setSrgb(TEX.storeSign());
  const signMat = M.std({
    map: signTex, emissive: 0xffffff, emissiveMap: signTex,
    emissiveIntensity: 1.05, roughness: 0.45, metalness: 0.0, envMapIntensity: 0.3
  });
  const signBox = box(BW - 0.9, 0.74, 0.1, signMat, 0, SIGN_Y0 + SIGN_H / 2, BZ0 - 0.14);
  building.add(signBox);
  // 招牌边框
  const signFrameMat = M.std({ color: 0x3a3f47, roughness: 0.4, metalness: 0.6 });
  building.add(box(BW - 0.8, 0.06, 0.16, signFrameMat, 0, SIGN_Y0 + 0.08, BZ0 - 0.13));
  building.add(box(BW - 0.8, 0.06, 0.16, signFrameMat, 0, SIGN_Y0 + SIGN_H - 0.06, BZ0 - 0.13));

  // 二层墙面（窗下矮墙 + 窗间）
  building.add(box(BW, 0.55, 0.24, wallMat, 0, SIGN_Y0 + SIGN_H + 0.27, BZ0 + 0.12));
  building.add(box(BW, 0.55, 0.24, wallMat, 0, H2 - 0.27, BZ0 + 0.12));
  // 窗间墙
  const winCenters = [-4.35, 0, 4.35];
  const winW = 2.35;
  for (let i = 0; i <= winCenters.length; i++) {
    let x;
    if (i === 0) x = BX0 + 0.6 + (winCenters[0] - winW / 2 - (BX0 + 0.6)) / 2;
    else if (i === winCenters.length) x = BX1 - 0.6 - ((BX1 - 0.6) - (winCenters[i - 1] + winW / 2)) / 2;
    else x = (winCenters[i - 1] + winW / 2 + winCenters[i] - winW / 2) / 2;
    building.add(box(1.0, H2 - 3.9, 0.24, wallMat, x, (3.9 + H2) / 2, BZ0 + 0.12));
  }

  // ---------- 二层窗户 ----------
  const winFrameMat = M.std({ color: 0x5b5f63, roughness: 0.55, metalness: 0.5 });
  const curtainTex = setSrgb(TEX.curtain());
  const litCurtainMat = M.std({
    map: curtainTex, emissive: 0xffc078, emissiveMap: curtainTex,
    emissiveIntensity: 0.85, roughness: 0.9, metalness: 0.0,
    transparent: true, opacity: 0.96
  });
  const darkGlassMat = M.std({
    color: 0x0d1218, roughness: 0.12, metalness: 0.85, envMapIntensity: 1.4
  });

  winCenters.forEach((cx, idx) => {
    const y0 = 3.95, y1 = 5.95;
    const w = winW, h = y1 - y0;
    const cy = (y0 + y1) / 2;
    // 窗洞外框
    building.add(box(w + 0.14, h + 0.14, 0.1, winFrameMat, cx, cy, BZ0 + 0.03));
    // 玻璃/窗帘
    const isLit = idx === 1;      // 中间那扇亮着暖黄的窗帘
    const glassMat = isLit ? litCurtainMat : darkGlassMat;
    const g = plane(w, h, glassMat, cx, cy, BZ0 - 0.01);
    building.add(g);
    // 中挺
    building.add(box(0.055, h, 0.06, winFrameMat, cx, cy, BZ0 - 0.03));
    building.add(box(w, 0.05, 0.06, winFrameMat, cx, cy - 0.05, BZ0 - 0.03));
    // 窗台
    building.add(box(w + 0.28, 0.09, 0.2, concreteMat, cx, y0 - 0.07, BZ0 - 0.02));
    // 防盗网（日式常见）
    const barMat = M.std({ color: 0x3a3d42, roughness: 0.5, metalness: 0.65 });
    for (let b = 0; b < 6; b++) {
      building.add(box(0.03, h - 0.1, 0.03, barMat, cx - w / 2 + 0.2 + b * (w - 0.4) / 5, cy, BZ0 - 0.14));
    }
    if (idx !== 1) {
      building.add(box(w - 0.1, 0.03, 0.03, barMat, cx, y0 + 0.55, BZ0 - 0.14));
      building.add(box(w - 0.1, 0.03, 0.03, barMat, cx, y1 - 0.55, BZ0 - 0.14));
    }
  });

  // ---------- 二层外墙的旧空调 ----------
  (function acUnits() {
    const shell = M.std({ color: 0xb9b6ac, roughness: 0.72, metalness: 0.28 });
    const grill = M.std({ color: 0x5e5f5c, roughness: 0.8, metalness: 0.3 });
    const mk = (x, y) => {
      const g = new THREE.Group();
      const b = box(0.82, 0.6, 0.34, shell, 0, 0, 0);
      g.add(b);
      const gr = box(0.7, 0.44, 0.03, grill, 0, 0, -0.18);
      g.add(gr);
      const fan = new THREE.Mesh(
        new THREE.CircleGeometry(0.19, 20),
        M.std({ color: 0x2e3033, roughness: 0.9 })
      );
      fan.position.set(0.08, 0, -0.2);
      g.add(fan);
      const bracket = box(0.9, 0.06, 0.4, M.std({ color: 0x4a4d52, roughness: 0.7, metalness: 0.6 }), 0, -0.34, 0.02);
      g.add(bracket);
      g.position.set(x, y, BZ0 - 0.18);
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      building.add(g);
    };
    mk(6.1, 4.55);
    mk(-6.15, 5.9);
  })();

  // ---------- 落水管 / 气表 / 电箱 ----------
  (function pipes() {
    const pmat = M.std({ color: 0x6d6f6d, roughness: 0.6, metalness: 0.4 });
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, H2 + 0.4, 10), pmat);
    pipe.position.set(BX1 + 0.3, (H2 + 0.4) / 2, BZ0 + 0.2);
    pipe.castShadow = true;
    building.add(pipe);
    for (let h = 0.6; h < H2; h += 1.1) {
      const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 8), pmat);
      clamp.position.set(BX1 + 0.3, h, BZ0 + 0.2);
      building.add(clamp);
    }
    const pipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, H2, 8), pmat);
    pipe2.position.set(BX0 - 0.3, H2 / 2, BZ0 + 0.45);
    building.add(pipe2);

    // 电表箱
    const meter = box(0.34, 0.46, 0.16, M.std({ color: 0x8d9098, roughness: 0.55, metalness: 0.5 }), BX0 - 0.16, 2.2, BZ0 + 1.2);
    building.add(meter);
    // 燃气表
    const gas = box(0.26, 0.3, 0.2, M.std({ color: 0x9a9a92, roughness: 0.7, metalness: 0.3 }), BX1 - 1.4, 1.95, BZ0 - 0.2);
    building.add(gas);
  })();

  // ---------- 屋顶：女儿墙 / 水箱 / 天线 / 空调 ----------
  (function roof() {
    const parapetMat = M.std({ color: 0x8e8a80, roughness: 0.85, metalness: 0.05 });
    building.add(box(BW + 0.5, 0.42, 0.16, parapetMat, 0, ROOF + 0.38, BZ0 + 0.05));
    building.add(box(BW + 0.5, 0.42, 0.16, parapetMat, 0, ROOF + 0.38, BZ1 - 0.05));
    building.add(box(0.16, 0.42, BD, parapetMat, BX0 - 0.05, ROOF + 0.38, (BZ0 + BZ1) / 2));
    building.add(box(0.16, 0.42, BD, parapetMat, BX1 + 0.05, ROOF + 0.38, (BZ0 + BZ1) / 2));

    // 不锈钢水箱
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.72, 1.15, 22),
      M.std({ color: 0xb6b9bb, roughness: 0.35, metalness: 0.85, envMapIntensity: 1.2 })
    );
    tank.position.set(-3.6, ROOF + 0.95, BZ1 - 2.4);
    tank.castShadow = true;
    building.add(tank);
    const tankTop = new THREE.Mesh(
      new THREE.ConeGeometry(0.76, 0.28, 22),
      M.std({ color: 0xa8abad, roughness: 0.4, metalness: 0.8 })
    );
    tankTop.position.set(-3.6, ROOF + 1.66, BZ1 - 2.4);
    building.add(tankTop);
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6),
        M.std({ color: 0x6a6d70, roughness: 0.6, metalness: 0.6 })
      );
      const a = Math.PI / 4 + i * Math.PI / 2;
      leg.position.set(-3.6 + Math.cos(a) * 0.5, ROOF + 0.25, BZ1 - 2.4 + Math.sin(a) * 0.5);
      building.add(leg);
    }

    // 屋顶空调外机
    const acShell = M.std({ color: 0xb0ada2, roughness: 0.75, metalness: 0.25 });
    const ac1 = box(1.0, 0.75, 0.42, acShell, 3.2, ROOF + 0.72, BZ1 - 3.0);
    building.add(ac1);
    const ac2 = box(0.85, 0.62, 0.38, acShell, 1.9, ROOF + 0.65, BZ1 - 3.4);
    building.add(ac2);

    // 电视天线
    const antMat = M.std({ color: 0x4a4d52, roughness: 0.5, metalness: 0.7 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 3.0, 6), antMat);
    mast.position.set(4.6, ROOF + 1.7, BZ1 - 1.6);
    building.add(mast);
    for (let i = 0; i < 5; i++) {
      const el = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9 - i * 0.11, 4), antMat);
      el.rotation.z = Math.PI / 2;
      el.position.set(4.6, ROOF + 1.1 + i * 0.36, BZ1 - 1.6);
      building.add(el);
    }
  })();

  // ---------- 墙面不规则广告 ----------
  (function posters() {
    const kinds = [0, 1, 2];
    const layout = [
      { k: 0, x: -1.95, y: 4.55, w: 1.0, h: 1.35, rz: 0.028, ry: 0.03 },
      { k: 1, x: 2.15, y: 5.05, w: 0.95, h: 1.15, rz: -0.045, ry: -0.02 },
      { k: 2, x: 5.62, y: 6.0, w: 0.86, h: 1.06, rz: 0.06, ry: 0.05 },
      { k: 0, x: -5.9, y: 5.5, w: 0.9, h: 1.2, rz: -0.03, ry: -0.04 },
      { k: 1, x: -3.2, y: 6.15, w: 0.72, h: 0.88, rz: 0.05, ry: 0.02 }
    ];
    layout.forEach((L, i) => {
      const tex = setSrgb(TEX.poster(L.k));
      const mat = M.std({
        map: tex, transparent: true, roughness: 0.92, metalness: 0.0,
        side: THREE.DoubleSide, alphaTest: 0.35
      });
      const p = plane(L.w, L.h, mat, L.x, L.y, BZ0 - 0.015);
      p.rotation.z = L.rz;
      p.rotation.y = L.ry;
      p.castShadow = false;
      building.add(p);
    });

    // 一块贴在侧墙的旧海报（让"第二面"也有内容）
    const t2 = setSrgb(TEX.poster(2));
    const m2 = M.std({ map: t2, transparent: true, roughness: 0.92, side: THREE.DoubleSide, alphaTest: 0.35 });
    const p2 = plane(1.05, 1.3, m2, BX1 + 0.14, 4.6, BZ0 + 3.2);
    p2.rotation.y = Math.PI / 2;
    building.add(p2);
  })();

  // ---------- 竖向突出招牌 ----------
  (function vertSign() {
    const t = setSrgb(TEX.verticalSign());
    const mat = M.std({
      map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.95,
      roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide
    });
    const w = 0.62, h = 2.5;
    const g = plane(w, h, mat, BX0 - 0.06, 4.55, BZ0 - 0.45);
    g.rotation.y = Math.PI / 2;
    building.add(g);
    const back = plane(w, h, mat, BX0 - 0.06, 4.55, BZ0 - 0.45);
    back.rotation.y = -Math.PI / 2;
    building.add(back);
    // 支架
    const brMat = M.std({ color: 0x3d4147, roughness: 0.6, metalness: 0.6 });
    for (const yy of [3.5, 5.6]) {
      building.add(box(0.7, 0.07, 0.07, brMat, BX0 - 0.4, yy, BZ0 - 0.45));
    }
  })();

  // ============================================================
  // 5. 便利店：橱窗、门、内景
  // ============================================================
  const storeGroup = new THREE.Group();
  scene.add(storeGroup);

  const GLASS_Y0 = 0.32, GLASS_Y1 = 2.36;
  const glassH = GLASS_Y1 - GLASS_Y0;
  const glassCY = (GLASS_Y0 + GLASS_Y1) / 2;

  // 玻璃（左侧整片橱窗）
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbfd6e6, roughness: 0.045, metalness: 0.0,
    transparent: true, opacity: 0.16,
    envMapIntensity: 1.9, clearcoat: 1.0, clearcoatRoughness: 0.03,
    side: THREE.DoubleSide, depthWrite: false
  });
  const winGlass = plane(10.4, glassH, glassMat, -1.1, glassCY, BZ0 - 0.06);
  storeGroup.add(winGlass);

  // 玻璃上反光条（雨天那种斜向高光）
  (function glassStreaks() {
    const streakMat = M.basic({
      color: 0xbcd8f0, transparent: true, opacity: 0.055,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    for (let i = 0; i < 5; i++) {
      const w = 0.6 + Math.random() * 1.4;
      const s = plane(w, glassH * 1.2, streakMat, -5.5 + i * 2.4, glassCY, BZ0 - 0.08);
      s.rotation.z = 0.16 + Math.random() * 0.1;
      storeGroup.add(s);
    }
  })();

  // 玻璃框 + 竖挺
  const frameMat = M.std({ color: 0x50555c, roughness: 0.45, metalness: 0.65 });
  storeGroup.add(box(0.12, glassH + 0.3, 0.14, frameMat, -6.32, glassCY, BZ0 - 0.05));
  storeGroup.add(box(0.12, glassH + 0.3, 0.14, frameMat, 4.2, glassCY, BZ0 - 0.05));
  storeGroup.add(box(10.6, 0.12, 0.14, frameMat, -1.06, GLASS_Y1 + 0.06, BZ0 - 0.05));
  storeGroup.add(box(10.6, 0.26, 0.16, M.std({ color: 0x6a6e73, roughness: 0.6, metalness: 0.4 }), -1.06, GLASS_Y0 - 0.13, BZ0 - 0.05));
  for (let i = 1; i < 4; i++) {
    storeGroup.add(box(0.07, glassH, 0.1, frameMat, -6.3 + i * 2.6, glassCY, BZ0 - 0.05));
  }

  // 自动门（右端）
  const doorMat = new THREE.MeshPhysicalMaterial({
    color: 0xcfe2f0, roughness: 0.03, metalness: 0.0,
    transparent: true, opacity: 0.13, envMapIntensity: 2.0,
    clearcoat: 1, side: THREE.DoubleSide, depthWrite: false
  });
  storeGroup.add(plane(2.0, 2.15, doorMat, 5.3, 1.4, BZ0 - 0.07));
  storeGroup.add(box(0.09, 2.3, 0.12, frameMat, 4.26, 1.32, BZ0 - 0.06));
  storeGroup.add(box(0.09, 2.3, 0.12, frameMat, 6.34, 1.32, BZ0 - 0.06));
  storeGroup.add(box(2.2, 0.1, 0.12, frameMat, 5.3, 2.48, BZ0 - 0.06));
  // 门上贴纸
  const decalMat = M.basic({
    map: (function () {
      const { c, x } = TEX.cv(256, 128);
      x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(0, 0, 256, 128);
      x.fillStyle = '#1e6fbf'; x.textAlign = 'center';
      x.font = 'bold 44px "Yu Gothic","Microsoft YaHei",sans-serif';
      x.fillText('自動ドア', 128, 56);
      x.font = 'bold 30px sans-serif';
      x.fillText('OPEN', 128, 100);
      const t = new THREE.CanvasTexture(c);
      return setSrgb(t);
    })(),
    transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false
  });
  storeGroup.add(plane(0.9, 0.45, decalMat, 5.3, 2.1, BZ0 - 0.085));

  // 门前台阶
  storeGroup.add(box(13.6, 0.16, 1.0, M.std({ color: 0x8b8c88, roughness: 0.8, metalness: 0.1 }), 0, 0.23, BZ0 - 0.9));
  storeGroup.add(box(13.6, 0.1, 0.5, M.std({ color: 0x7e7f7b, roughness: 0.85 }), 0, 0.1, BZ0 - 1.4));

  // ---------- 店内空间 ----------
  const INTERIOR_Z0 = BZ0 + 0.05, INTERIOR_Z1 = BZ0 + 6.5;
  const interior = new THREE.Group();
  scene.add(interior);

  // 地板（浅色亚麻油地板）
  const floorTex = (function () {
    const { c, x } = TEX.cv(512, 512);
    x.fillStyle = '#d9d2c0'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 40; i++) {
      x.fillStyle = `rgba(${180 + Math.random() * 40},${170 + Math.random() * 40},${150 + Math.random() * 40},0.3)`;
      x.fillRect(0, i * 13, 512, 12);
    }
    return setSrgb(TEX.toTex(c, 3, 3));
  })();
  const inFloor = plane(12.6, 7.0, M.std({
    map: floorTex, color: 0xfff4e2, roughness: 0.55, metalness: 0.05
  }), 0, 0.16, (INTERIOR_Z0 + INTERIOR_Z1) / 2);
  inFloor.rotation.x = -Math.PI / 2;
  inFloor.receiveShadow = true;
  interior.add(inFloor);

  // 店内墙（暖白色）
  const inWallMat = M.std({ color: 0xf2e8d6, roughness: 0.85, metalness: 0.0 });
  interior.add(box(12.8, 2.6, 0.12, inWallMat, 0, 1.4, INTERIOR_Z1));
  interior.add(box(0.12, 2.6, 7.0, inWallMat, -6.4, 1.4, (INTERIOR_Z0 + INTERIOR_Z1) / 2));
  interior.add(box(0.12, 2.6, 7.0, inWallMat, 6.4, 1.4, (INTERIOR_Z0 + INTERIOR_Z1) / 2));

  // 天花板 + 灯带（暖白）
  const ceilMat = M.std({ color: 0xeee6d8, roughness: 0.9 });
  const ceil = plane(12.8, 7.0, ceilMat, 0, 2.55, (INTERIOR_Z0 + INTERIOR_Z1) / 2);
  ceil.rotation.x = Math.PI / 2;
  interior.add(ceil);

  const stripMat = M.basic({ color: 0xfff2d8 });
  const stripEmissive = M.std({
    color: 0xfff6e6, emissive: 0xffe6b8, emissiveIntensity: 2.6, roughness: 0.4
  });
  for (let i = 0; i < 3; i++) {
    const zz = INTERIOR_Z0 + 1.6 + i * 2.2;
    interior.add(box(9.0, 0.09, 0.22, stripEmissive, -0.6, 2.48, zz));
  }

  // 货架（一排排）
  const shelfMat = M.std({ color: 0xe6e0d0, roughness: 0.7, metalness: 0.15 });
  const goodsTexes = [TEX.goodsRow(11, 20), TEX.goodsRow(23, 150), TEX.goodsRow(37, 300), TEX.goodsRow(51, 90)];
  function shelfRow(x, z, len, rotY) {
    const g = new THREE.Group();
    const h = 1.55;
    // 背板
    g.add(box(0.06, h, len, shelfMat, 0, h / 2, 0));
    // 层板 + 商品
    for (let k = 0; k < 3; k++) {
      const y = 0.42 + k * 0.46;
      g.add(box(0.46, 0.035, len, shelfMat, 0.24, y, 0));
      const idx = Math.abs(k + Math.round(x * 10)) % goodsTexes.length;
      const gt = setSrgb(goodsTexes[idx]);
      const gm = M.std({
        map: gt, emissive: 0xffffff, emissiveMap: gt, emissiveIntensity: 0.55,
        roughness: 0.85, metalness: 0.0
      });
      const gp = plane(len - 0.1, 0.42, gm, 0.24, y + 0.22, 0);
      gp.rotation.y = Math.PI / 2;
      g.add(gp);
      const gp2 = plane(len - 0.1, 0.42, gm, 0.47, y + 0.22, 0);
      gp2.rotation.y = -Math.PI / 2;
      g.add(gp2);
    }
    g.position.set(x, 0.16, z);
    g.rotation.y = rotY || 0;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    interior.add(g);
  }
  shelfRow(-4.2, 15.2, 3.2, 0);
  shelfRow(-1.4, 15.2, 3.2, 0);
  shelfRow(1.4, 15.2, 3.2, 0);
  shelfRow(-3.0, 18.2, 3.0, 0);
  shelfRow(0.4, 18.2, 3.0, 0);

  // 靠窗的冷藏柜（有冷蓝光）
  (function cooler() {
    const g = new THREE.Group();
    const shell = M.std({ color: 0xdfe4e6, roughness: 0.35, metalness: 0.45 });
    g.add(box(9.2, 2.05, 0.72, shell, 0, 1.02, 0));
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xa8ccdd, roughness: 0.04, metalness: 0.0, transparent: true,
      opacity: 0.2, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false
    });
    const front = plane(9.0, 1.8, glass, 0, 1.05, -0.38);
    g.add(front);
    // 冷柜内部冷光
    const coldMat = M.std({
      color: 0xcfeeff, emissive: 0x8fd0f5, emissiveIntensity: 1.5, roughness: 0.6
    });
    for (let i = 0; i < 4; i++) {
      g.add(box(8.9, 0.1, 0.5, coldMat, 0, 0.25 + i * 0.52, 0.05));
    }
    // 竖框
    const fm = M.std({ color: 0x9aa0a4, roughness: 0.4, metalness: 0.6 });
    for (let i = 0; i < 5; i++) {
      g.add(box(0.06, 1.85, 0.1, fm, -4.4 + i * 2.2, 1.05, -0.4));
    }
    g.position.set(-1.0, 0.16, 13.1);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    interior.add(g);
  })();

  // 收银台
  (function counter() {
    const g = new THREE.Group();
    const body = M.std({ color: 0xcdbfa4, roughness: 0.65, metalness: 0.15 });
    g.add(box(2.6, 0.95, 0.7, body, 0, 0.475, 0));
    g.add(box(2.7, 0.07, 0.8, M.std({ color: 0x8c7a5e, roughness: 0.5 }), 0, 0.99, 0));
    // 收银机
    g.add(box(0.5, 0.3, 0.4, M.std({ color: 0x3d4247, roughness: 0.5, metalness: 0.5 }), -0.7, 1.17, 0));
    const scr = plane(0.32, 0.2, M.basic({ color: 0x6fe0b0 }), -0.7, 1.3, -0.21);
    scr.rotation.x = -0.15;
    g.add(scr);
    // 后面的香烟架
    g.add(box(2.6, 1.5, 0.12, M.std({ color: 0x9c8f77, roughness: 0.75 }), 0, 1.6, 0.55));
    g.position.set(4.6, 0.16, 14.4);
    g.rotation.y = -0.22;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    interior.add(g);
  })();

  // 店内暖光
  const warm1 = new THREE.PointLight(0xffb274, 3.8, 14, 2.0);
  warm1.position.set(-1.5, 2.2, 14.2);
  scene.add(warm1);
  const warm2 = new THREE.PointLight(0xffc286, 3.0, 12, 2.0);
  warm2.position.set(3.6, 2.15, 15.4);
  scene.add(warm2);
  const warm3 = new THREE.PointLight(0xffcd9c, 2.0, 10, 2.0);
  warm3.position.set(-3.8, 1.9, 17.6);
  scene.add(warm3);
  // 门内向外溢出的光
  const doorSpill = new THREE.PointLight(0xffb874, 2.6, 9, 2.2);
  doorSpill.position.set(5.2, 1.6, 11.2);
  scene.add(doorSpill);
  // 冷柜的冷光
  const cold1 = new THREE.PointLight(0x9ad8ff, 0.75, 7, 2.0);
  cold1.position.set(-1.0, 1.7, 12.9);
  scene.add(cold1);

  // 橱窗外的溢光板（让玻璃侧也发亮）
  const spillMat = M.basic({
    color: 0xffb877, transparent: true, opacity: 0.10,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const spill = plane(10.6, glassH, spillMat, -1.06, glassCY, BZ0 - 0.12);
  storeGroup.add(spill);

  // ============================================================
  // 6. 自动售货机（暖光小细节）
  // ============================================================
  (function vending() {
    const g = new THREE.Group();
    const body = M.std({ color: 0xc0392b, roughness: 0.42, metalness: 0.25 });
    g.add(box(1.0, 1.85, 0.75, body, 0, 0.925, 0));
    // 发光展示窗
    const vt = (function () {
      const { c, x } = TEX.cv(256, 384);
      x.fillStyle = '#f7f2e2'; x.fillRect(0, 0, 256, 384);
      const cols = 4, rows = 4;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          x.fillStyle = `hsl(${(i * 47 + j * 83) % 360},62%,${48 + (i + j) % 20}%)`;
          x.fillRect(14 + i * 60, 18 + j * 88, 46, 70);
          x.fillStyle = 'rgba(255,255,255,0.5)';
          x.fillRect(14 + i * 60, 18 + j * 88, 46, 8);
        }
      }
      return setSrgb(new THREE.CanvasTexture(c));
    })();
    const vm = M.std({
      map: vt, emissive: 0xffffff, emissiveMap: vt, emissiveIntensity: 1.15,
      roughness: 0.5, metalness: 0.1
    });
    const vp = plane(0.74, 1.15, vm, 0, 1.18, -0.381);
    g.add(vp);
    // 取物口
    g.add(box(0.6, 0.22, 0.04, M.std({ color: 0x1a1c1f, roughness: 0.8 }), 0, 0.42, -0.38));
    g.position.set(7.9, 0.15, 11.0);
    g.rotation.y = -0.35;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    const vl = new THREE.PointLight(0xffd9a8, 0.9, 5.5, 2.2);
    vl.position.set(7.6, 1.3, 10.3);
    scene.add(vl);
    lightPool(7.4, 9.3, 3.4, 2.6, 'rgba(255,200,140,ALPHA)', 0.28);
  })();

  // ============================================================
  // 7. 电线杆 + 路灯 + 电线
  // ============================================================
  const poleMat = M.std({
    map: setSrgb(TEX.concrete()), color: 0x8f9092, roughness: 0.9, metalness: 0.03
  });
  const metalMat = M.std({ color: 0x4b4f54, roughness: 0.55, metalness: 0.7 });

  function utilityPole(x, z, h, withLamp) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.185, h, 14), poleMat);
    pole.position.y = h / 2;
    pole.castShadow = true; pole.receiveShadow = true;
    g.add(pole);

    // 横担
    for (const yy of [h - 0.75, h - 1.55]) {
      const arm = box(2.1, 0.09, 0.09, metalMat, 0, yy, 0);
      g.add(arm);
      // 绝缘子
      for (let i = 0; i < 3; i++) {
        const ins = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.055, 0.13, 8),
          M.std({ color: 0x9fa6a8, roughness: 0.35, metalness: 0.2 })
        );
        ins.position.set(-0.8 + i * 0.8, yy + 0.12, 0);
        g.add(ins);
      }
    }
    // 变压器
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.75, 14), metalMat);
    tr.position.set(0.42, h - 2.6, 0);
    tr.castShadow = true;
    g.add(tr);
    // 爬梯脚钉
    for (let i = 0; i < 7; i++) {
      const st = box(0.05, 0.05, 0.3, metalMat, 0, 1.4 + i * 0.55, 0.16);
      g.add(st);
    }
    // 杆号牌
    const tag = plane(0.22, 0.3, M.std({ color: 0xe8e4d8, roughness: 0.8 }), 0, 2.6, -0.16);
    g.add(tag);

    // 路灯（冷色）
    if (withLamp) {
      const armY = h - 2.05;
      const arm = box(1.25, 0.075, 0.075, metalMat, -0.62, armY, 0);
      arm.rotation.z = 0.06;
      g.add(arm);
      const headG = new THREE.Group();
      const housing = box(0.62, 0.14, 0.3, M.std({ color: 0x565b60, roughness: 0.5, metalness: 0.65 }), 0, 0, 0);
      headG.add(housing);
      const lensMat = M.std({
        color: 0xdcefff, emissive: 0xbcdcff, emissiveIntensity: 3.4, roughness: 0.3
      });
      const lens = box(0.5, 0.045, 0.22, lensMat, 0, -0.085, 0);
      headG.add(lens);
      headG.position.set(-1.25, armY - 0.04, 0);
      headG.rotation.z = 0.05;
      g.add(headG);

      // 冷色光晕
      const glowTex = TEX.softGlow('rgba(170,215,255,ALPHA)');
      const spMat = new THREE.SpriteMaterial({
        map: glowTex, color: 0xcfe6ff, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85
      });
      const sp = new THREE.Sprite(spMat);
      sp.scale.set(3.4, 3.4, 1);
      sp.position.set(-1.25, armY - 0.1, 0);
      g.add(sp);

      // 路灯照亮地面（冷）
      const spot = new THREE.SpotLight(0xbcd9ff, 6.2, 17, 0.85, 0.6, 1.6);
      spot.position.set(-1.25, armY - 0.1, 0);
      spot.target.position.set(-1.25, 0, 1.8);
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.bias = -0.0016;
      spot.shadow.camera.near = 0.5;
      spot.shadow.camera.far = 20;
      g.add(spot);
      g.add(spot.target);
    }

    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }

  const poleA = utilityPole(-12.6, 7.6, 8.6, true);
  const poleB = utilityPole(12.8, 7.9, 8.2, true);
  const poleC = utilityPole(-34.0, 7.6, 8.4, false);
  const poleD = utilityPole(34.0, 7.9, 8.4, false);

  // 电线（悬链线）
  function wire(p1, p2, sag, color) {
    const mid = p1.clone().add(p2).multiplyScalar(0.5);
    mid.y -= sag;
    const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
    const pts = curve.getPoints(24);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: color || 0x0d1014, transparent: true, opacity: 0.9
    });
    scene.add(new THREE.Line(geo, mat));
  }

  function poleTop(pole, dx, dy, dz) {
    return new THREE.Vector3(pole.position.x + dx, dy, pole.position.z + dz);
  }
  const H_A = 8.6, H_B = 8.2, H_C = 8.4, H_D = 8.4;
  const wireSets = [
    // 主线路沿街
    [-12.6, H_A - 0.75, 7.6, 12.8, H_B - 0.75, 7.9],
    [-12.6, H_A - 1.55, 7.6, 12.8, H_B - 1.55, 7.9],
    [-12.6, H_A - 2.25, 7.6, 12.8, H_B - 2.25, 7.9],
    // 左侧延伸到远处
    [-34.0, H_C - 0.75, 7.6, -12.6, H_A - 0.75, 7.6],
    [-34.0, H_C - 1.55, 7.6, -12.6, H_A - 1.55, 7.6],
    // 右侧
    [12.8, H_B - 0.75, 7.9, 34.0, H_D - 0.75, 7.9],
    [12.8, H_B - 1.55, 7.9, 34.0, H_D - 1.55, 7.9],
    // 入户线接向建筑
    [-12.6, H_A - 1.55, 7.6, -6.6, 6.4, 12.6],
    [12.8, H_B - 1.55, 7.9, 6.6, 6.4, 12.6]
  ];
  for (const w of wireSets) {
    wire(new THREE.Vector3(w[0], w[1], w[2]), new THREE.Vector3(w[3], w[4], w[5]), 0.55);
  }
  // 一根斜拉到地面的通信线
  wire(new THREE.Vector3(-12.6, H_A - 2.9, 7.6), new THREE.Vector3(-11.2, 3.2, 8.4), 0.3);

  // ============================================================
  // 8. 老式日系轿车
  // ============================================================
  function oldSedan(x, z, rotY, bodyColor) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor, roughness: 0.42, metalness: 0.55, envMapIntensity: 1.15
    });
    const glassMat2 = new THREE.MeshPhysicalMaterial({
      color: 0x0b1016, roughness: 0.08, metalness: 0.55,
      transparent: true, opacity: 0.88, envMapIntensity: 1.7
    });
    const chrome = new THREE.MeshStandardMaterial({
      color: 0xc8ccd0, roughness: 0.22, metalness: 0.95, envMapIntensity: 1.5
    });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95, metalness: 0.0 });

    // 车身（三段，做出老车的方正轮廓）
    const lower = new THREE.Mesh(roundedBox(4.42, 0.66, 1.74, 0.11), bodyMat);
    lower.position.set(0, 0.72, 0);
    g.add(lower);

    // 前后翼子板略微外扩
    const fenderF = new THREE.Mesh(roundedBox(0.95, 0.5, 1.78, 0.1), bodyMat);
    fenderF.position.set(1.72, 0.66, 0);
    g.add(fenderF);
    const fenderR = fenderF.clone();
    fenderR.position.set(-1.72, 0.66, 0);
    g.add(fenderR);

    // 引擎盖 / 后备箱
    const hood = new THREE.Mesh(roundedBox(1.32, 0.16, 1.66, 0.06), bodyMat);
    hood.position.set(1.35, 1.05, 0);
    g.add(hood);
    const trunk = new THREE.Mesh(roundedBox(0.98, 0.17, 1.64, 0.06), bodyMat);
    trunk.position.set(-1.6, 1.07, 0);
    g.add(trunk);

    // 座舱（略窄，上收）
    const cabin = new THREE.Mesh(roundedBox(2.34, 0.58, 1.6, 0.12), bodyMat);
    cabin.position.set(-0.18, 1.34, 0);
    g.add(cabin);
    // 车顶
    const roofPlate = new THREE.Mesh(roundedBox(1.9, 0.1, 1.5, 0.05), bodyMat);
    roofPlate.position.set(-0.2, 1.62, 0);
    g.add(roofPlate);

    // 玻璃：前挡风（后倾）、后挡风、侧窗
    const wsh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 1.44), glassMat2);
    wsh.position.set(0.86, 1.36, 0);
    wsh.rotation.z = 0.52;
    g.add(wsh);
    const rsh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.54, 1.4), glassMat2);
    rsh.position.set(-1.22, 1.36, 0);
    rsh.rotation.z = -0.46;
    g.add(rsh);
    for (const side of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.42, 0.04), glassMat2);
      sw.position.set(-0.2, 1.38, side * 0.79);
      g.add(sw);
    }

    // 镀铬饰条
    const trim = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.045, 1.78), chrome);
    trim.position.set(0, 1.02, 0);
    g.add(trim);

    // 保险杠
    for (const bx of [2.14, -2.16]) {
      const bump = new THREE.Mesh(roundedBox(0.24, 0.28, 1.8, 0.07), chrome);
      bump.position.set(bx, 0.6, 0);
      g.add(bump);
    }

    // 大灯（暖白）与尾灯
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff2d0, emissive: 0xfff0cc, emissiveIntensity: 0.55, roughness: 0.18, metalness: 0.2
    });
    for (const side of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.19, 0.34), headMat);
      hl.position.set(2.2, 0.82, side * 0.58);
      g.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.4), new THREE.MeshStandardMaterial({
        color: 0x8c1a14, emissive: 0x6e0f0a, emissiveIntensity: 0.5, roughness: 0.3
      }));
      tl.position.set(-2.22, 0.86, side * 0.58);
      g.add(tl);
    }
    // 后视镜
    for (const side of [-1, 1]) {
      const mir = new THREE.Mesh(roundedBox(0.12, 0.1, 0.2, 0.03), bodyMat);
      mir.position.set(0.72, 1.2, side * 0.9);
      g.add(mir);
    }
    // 车牌
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.42), new THREE.MeshStandardMaterial({
      color: 0xdcdcd4, roughness: 0.6
    }));
    plate.position.set(-2.3, 0.58, 0);
    g.add(plate);
    const plate2 = plate.clone();
    plate2.position.set(2.28, 0.58, 0);
    g.add(plate2);

    // 车轮
    const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.21, 20);
    const hubGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.225, 14);
    for (const wx of [1.42, -1.44]) {
      for (const wz of [-0.83, 0.83]) {
        const w = new THREE.Mesh(wheelGeo, rubber);
        w.rotation.x = Math.PI / 2;
        w.position.set(wx, 0.33, wz);
        w.castShadow = true;
        g.add(w);
        const hub = new THREE.Mesh(hubGeo, chrome);
        hub.rotation.x = Math.PI / 2;
        hub.position.set(wx, 0.33, wz);
        g.add(hub);
      }
    }

    // 车门缝
    const seamMat = new THREE.MeshStandardMaterial({ color: 0x121417, roughness: 0.9 });
    for (const sx of [0.95, -0.28, -1.35]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.62, 0.02), seamMat);
      s.position.set(sx, 0.78, 0.87);
      g.add(s);
      const s2 = s.clone();
      s2.position.set(sx, 0.78, -0.87);
      g.add(s2);
    }

    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    return g;
  }

  oldSedan(7.6, 2.4, -0.06, 0xb4ae9c);

  // 车底阴影贴片
  (function carShadow() {
    const t = TEX.softGlow('rgba(0,0,0,ALPHA)');
    const m = new THREE.MeshBasicMaterial({
      map: t, transparent: true, opacity: 0.55, depthWrite: false, color: 0x000000
    });
    const p = plane(5.2, 2.2, m, 7.6, 0.014, 2.4);
    p.rotation.x = -Math.PI / 2;
    scene.add(p);
  })();

  // ============================================================
  // 9. 公路车
  // ============================================================
  function roadBike(x, z, rotY, lean) {
    const g = new THREE.Group();
    const frameMat2 = new THREE.MeshStandardMaterial({
      color: 0x2f3a4a, roughness: 0.32, metalness: 0.72, envMapIntensity: 1.2
    });
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x0f1114, roughness: 0.92 });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x9aa0a6, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.4
    });
    const saddleMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.85 });

    const WB = 1.02;    // 轴距
    const RW = 0.345;   // 轮半径

    // 轮子
    function wheel(fx) {
      const wg = new THREE.Group();
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(RW, 0.024, 8, 40), tyreMat);
      wg.add(tyre);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(RW - 0.035, 0.016, 6, 36), rimMat);
      wg.add(rim);
      // 辐条
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, (RW - 0.04) * 2, 4), rimMat);
        sp.rotation.z = a;
        wg.add(sp);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.09, 8), rimMat);
      hub.rotation.x = Math.PI / 2;
      wg.add(hub);
      wg.position.set(fx, RW, 0);
      return wg;
    }
    g.add(wheel(WB / 2));
    g.add(wheel(-WB / 2));

    // 车架三角
    const P = {
      rearHub: new THREE.Vector3(-WB / 2, RW, 0),
      frontHub: new THREE.Vector3(WB / 2, RW, 0),
      bb: new THREE.Vector3(-0.06, 0.27, 0),
      seatTop: new THREE.Vector3(-0.24, 0.76, 0),
      headTop: new THREE.Vector3(0.34, 0.78, 0),
      headBot: new THREE.Vector3(0.40, 0.55, 0)
    };
    function tube(a, b, r) {
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), frameMat2);
      m.position.copy(a).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      return m;
    }
    g.add(tube(P.bb, P.seatTop, 0.021));        // 立管
    g.add(tube(P.seatTop, P.headTop, 0.021));   // 上管
    g.add(tube(P.bb, P.headBot, 0.024));        // 下管
    g.add(tube(P.headBot, P.frontHub, 0.017));  // 前叉
    g.add(tube(P.seatTop, P.rearHub, 0.014));   // 后上叉
    g.add(tube(P.bb, P.rearHub, 0.016));        // 后下叉
    g.add(tube(P.headTop, P.headBot, 0.019));   // 头管

    // 车把（弯把）
    const hb = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.011, 6, 16, Math.PI * 1.15), frameMat2);
    hb.position.set(0.40, 0.80, 0);
    hb.rotation.y = Math.PI / 2;
    hb.rotation.z = 0.4;
    g.add(hb);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6), frameMat2);
    stem.position.set(0.375, 0.80, 0);
    stem.rotation.z = Math.PI / 2 - 0.2;
    g.add(stem);

    // 座杆 + 坐垫
    const seatPost = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 6), rimMat);
    seatPost.position.set(-0.245, 0.83, 0);
    seatPost.rotation.z = 0.1;
    g.add(seatPost);
    const saddle = new THREE.Mesh(roundedBox(0.2, 0.035, 0.07, 0.015), saddleMat);
    saddle.position.set(-0.25, 0.90, 0);
    g.add(saddle);

    // 牙盘 + 曲柄
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.007, 6, 20), rimMat);
    ring.position.copy(P.bb);
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
    for (const side of [-1, 1]) {
      const crank = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.02), rimMat);
      crank.position.set(P.bb.x, P.bb.y, side * 0.045);
      crank.rotation.x = side > 0 ? 0.6 : -0.6;
      g.add(crank);
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.03), saddleMat);
      pedal.position.set(P.bb.x, P.bb.y - 0.07, side * 0.075);
      g.add(pedal);
    }

    g.position.set(x, 0.15, z);
    g.rotation.y = rotY;
    g.rotation.x = lean || 0;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    return g;
  }

  roadBike(-4.4, 9.35, 0.10, -0.16);
  roadBike(-2.6, 9.55, -0.06, 0.14);
  roadBike(2.2, 9.28, 3.05, 0.10);

  // 自行车靠着的短栏杆
  (function rail() {
    const rm = M.std({ color: 0x53575c, roughness: 0.55, metalness: 0.65 });
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.9, 8), rm);
      p.position.set(-5.6 + i * 1.1, 0.6, 9.9);
      p.castShadow = true;
      scene.add(p);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 4.6, 8), rm);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(-3.4, 1.02, 9.9);
    scene.add(bar);
    const bar2 = bar.clone();
    bar2.position.y = 0.62;
    scene.add(bar2);
  })();

  // ============================================================
  // 10. 邻栋建筑（让街道两侧都成立）
  // ============================================================
  (function neighbors() {
    const wallA = M.std({
      map: setSrgb(TEX.wallTile()), color: 0x76736a, roughness: 0.9, metalness: 0.05
    });
    // 左侧较矮的旧楼
    const b1 = box(9, 5.6, 10, wallA, -14.5, 2.8, 17);
    scene.add(b1);
    const roofA = box(9.4, 0.3, 10.4, M.std({ color: 0x5a5a58, roughness: 0.9 }), -14.5, 5.75, 17);
    scene.add(roofA);
    // 右侧楼
    const b2 = box(10, 7.4, 10, wallA, 15.5, 3.7, 17.5);
    scene.add(b2);
    const roofB = box(10.4, 0.3, 10.4, M.std({ color: 0x54544f, roughness: 0.9 }), 15.5, 7.55, 17.5);
    scene.add(roofB);

    // 邻栋的暗窗
    const darkWin = M.std({
      color: 0x0a0e14, roughness: 0.15, metalness: 0.7, envMapIntensity: 1.2
    });
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        const w = plane(1.2, 1.4, darkWin, -17.6 + i * 2.6, 2.4 + j * 2.2, 12.01);
        scene.add(w);
      }
    }
    // 一扇亮着的窗
    const litWin = M.std({
      color: 0xffe0b0, emissive: 0xffc887, emissiveIntensity: 1.05, roughness: 0.9
    });
    scene.add(plane(1.2, 1.4, litWin, -12.0, 4.6, 12.01));

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        scene.add(plane(1.3, 1.5, darkWin, 12.2 + i * 2.7, 2.2 + j * 2.0, 12.51));
      }
    }
    // 邻栋底商招牌（冷色，弱）
    const shopSign = M.std({
      color: 0x22344a, emissive: 0x3f6fa8, emissiveIntensity: 0.55, roughness: 0.6
    });
    scene.add(box(7.6, 0.7, 0.14, shopSign, -14.5, 2.95, 11.9));
    scene.add(box(8.2, 0.7, 0.14, shopSign, 15.5, 2.95, 12.4));
  })();

  // ============================================================
  // 11. 雨
  // ============================================================
  const rainGroup = new THREE.Group();
  scene.add(rainGroup);

  const RAIN_COUNT = 2600;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN_COUNT * 6);
  const rainVel = new Float32Array(RAIN_COUNT);
  const RAIN_R = 34, RAIN_H = 22;

  for (let i = 0; i < RAIN_COUNT; i++) {
    const x = (Math.random() - 0.5) * RAIN_R * 2;
    const y = Math.random() * RAIN_H;
    const z = (Math.random() - 0.5) * RAIN_R * 2 - 4;
    const len = 0.28 + Math.random() * 0.34;
    rainPos[i * 6] = x; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = z;
    rainPos[i * 6 + 3] = x + 0.045; rainPos[i * 6 + 4] = y + len; rainPos[i * 6 + 5] = z + 0.02;
    rainVel[i] = 9 + Math.random() * 7;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({
    color: 0x93abc4, transparent: true, opacity: 0.20,
    blending: THREE.NormalBlending, depthWrite: false, fog: true
  });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  rainGroup.add(rain);

  // 近处的雨丝（更大更亮）
  const rainNearGeo = new THREE.BufferGeometry();
  const RN = 380;
  const rainNearPos = new Float32Array(RN * 6);
  const rainNearVel = new Float32Array(RN);
  for (let i = 0; i < RN; i++) {
    const x = (Math.random() - 0.5) * 16;
    const y = Math.random() * 9;
    const z = (Math.random() - 0.5) * 14 + 2;
    const len = 0.35 + Math.random() * 0.5;
    rainNearPos[i * 6] = x; rainNearPos[i * 6 + 1] = y; rainNearPos[i * 6 + 2] = z;
    rainNearPos[i * 6 + 3] = x + 0.05; rainNearPos[i * 6 + 4] = y + len; rainNearPos[i * 6 + 5] = z + 0.02;
    rainNearVel[i] = 11 + Math.random() * 6;
  }
  rainNearGeo.setAttribute('position', new THREE.BufferAttribute(rainNearPos, 3));
  const rainNear = new THREE.LineSegments(rainNearGeo, new THREE.LineBasicMaterial({
    color: 0x9fb8d0, transparent: true, opacity: 0.14,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }));
  rainNear.frustumCulled = false;
  rainNear.renderOrder = 5;
  rainGroup.add(rainNear);

  // 雨溅：用 Sprite 但抬高到地面之上，避免半个贴图沉入地下
  const splashGlow = TEX.softGlow('rgba(200,225,255,ALPHA)');
  const splashes = [];
  function newSplash() {
    const m = new THREE.SpriteMaterial({
      map: splashGlow, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const s = new THREE.Sprite(m);
    s.position.set((Math.random() - 0.5) * 26, 0.13, (Math.random() - 0.5) * 20 + 2);
    s.userData.t = Math.random() * 0.7 + 0.2;
    s.userData.peak = 0.13;
    scene.add(s);
    splashes.push(s);
    return s;
  }
  for (let i = 0; i < 90; i++) newSplash();

  // 低空雾气（贴着地面的一层，中心抬高到不会穿地）
  (function mist() {
    const t = TEX.softGlow('rgba(120,145,175,ALPHA)');
    for (let i = 0; i < 7; i++) {
      const h = 3.4 + Math.random() * 2.6;
      const m = new THREE.Sprite(new THREE.SpriteMaterial({
        map: t, transparent: true, opacity: 0.05,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      const sw = 16 + Math.random() * 14;
      m.scale.set(sw, h, 1);
      m.position.set((Math.random() - 0.5) * 40, h / 2 + 0.15, -8 + Math.random() * 22);
      scene.add(m);
    }
  })();

  // ============================================================
  // 12. 灯光
  // ============================================================
  // 环境：阴雨黄昏，冷蓝为主（压低，让室内暖光成为主角）
  const hemi = new THREE.HemisphereLight(0x36455f, 0x0c0e13, 0.42);
  scene.add(hemi);

  // 天空的补充冷光（弱方向光，制造柔和阴影）
  const sky = new THREE.DirectionalLight(0x6d87ab, 0.30);
  sky.position.set(-16, 22, -14);
  sky.castShadow = true;
  sky.shadow.mapSize.set(2048, 2048);
  sky.shadow.camera.left = -26;
  sky.shadow.camera.right = 26;
  sky.shadow.camera.top = 26;
  sky.shadow.camera.bottom = -26;
  sky.shadow.camera.near = 1;
  sky.shadow.camera.far = 70;
  sky.shadow.bias = -0.0009;
  sky.shadow.normalBias = 0.02;
  scene.add(sky);

  // 店招灯箱外的一圈光（让招牌真的"亮"）
  const signGlowTex = TEX.softGlow('rgba(180,220,255,ALPHA)');
  const signGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: signGlowTex, color: 0xcfe8ff, transparent: true, opacity: 0.42,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  signGlow.scale.set(17, 5.0, 1);
  signGlow.position.set(0, SIGN_Y0 + SIGN_H / 2, BZ0 - 0.5);
  signGlow.material.opacity = 0.30;
  scene.add(signGlow);

  // 店内暖光洒到人行道（补一盏向外的暖光）
  const spillLight = new THREE.PointLight(0xffaa66, 1.5, 10, 2.2);
  spillLight.position.set(-2.0, 1.4, 10.6);
  scene.add(spillLight);

  // ============================================================
  // 13. 全局环境反射衰减（避免夜景被环境贴图洗亮）
  // ============================================================
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (typeof m.envMapIntensity === 'number') {
        m.envMapIntensity *= 0.5;
      }
      m.needsUpdate = true;
    }
  });

  // ============================================================
  // 14. 动画循环
  // ============================================================
  const clock = new THREE.Clock();
  let autoRotate = false;
  let rainOn = true;
  const baseOpacity = { rain: rainMat.opacity, near: rainNear.material.opacity };

  function updateRain(dt) {
    if (!rainOn) return;
    const p = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const d = rainVel[i] * dt;
      p[i * 6 + 1] -= d;
      p[i * 6 + 4] -= d;
      if (p[i * 6 + 4] < 0) {
        const nx = (Math.random() - 0.5) * RAIN_R * 2;
        const nz = (Math.random() - 0.5) * RAIN_R * 2 - 4;
        const len = 0.28 + Math.random() * 0.34;
        p[i * 6] = nx; p[i * 6 + 1] = RAIN_H; p[i * 6 + 2] = nz;
        p[i * 6 + 3] = nx + 0.045; p[i * 6 + 4] = RAIN_H + len; p[i * 6 + 5] = nz + 0.02;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;

    const q = rainNearGeo.attributes.position.array;
    for (let i = 0; i < RN; i++) {
      const d = rainNearVel[i] * dt;
      q[i * 6 + 1] -= d;
      q[i * 6 + 4] -= d;
      if (q[i * 6 + 4] < 0) {
        const nx = (Math.random() - 0.5) * 16;
        const nz = (Math.random() - 0.5) * 14 + 2;
        const len = 0.35 + Math.random() * 0.5;
        q[i * 6] = nx; q[i * 6 + 1] = 9; q[i * 6 + 2] = nz;
        q[i * 6 + 3] = nx + 0.05; q[i * 6 + 4] = 9 + len; q[i * 6 + 5] = nz + 0.02;
      }
    }
    rainNearGeo.attributes.position.needsUpdate = true;
  }

  function updateSplash(dt) {
    if (!rainOn) return;
    for (const s of splashes) {
      s.userData.t -= dt * 1.6;
      if (s.userData.t <= 0) {
        s.userData.t = 0.6 + Math.random() * 0.7;
        s.position.set((Math.random() - 0.5) * 26, 0.13, (Math.random() - 0.5) * 20 + 2);
        s.scale.set(0.05, 0.05, 1);
        s.material.opacity = 0.55;
      } else {
        const k = Math.min(1, 1 - s.userData.t / 1.3);
        const d = 0.06 + k * 0.22;
        s.scale.set(d, d, 1);
        s.material.opacity = Math.max(0, 0.5 * (1 - k));
      }
    }
  }

  // 招牌轻微呼吸（老灯管的闪烁）
  let flickerT = 0;
  function updateFlicker(dt) {
    flickerT += dt;
    const f = 0.93 + 0.07 * Math.sin(flickerT * 8.3) * Math.sin(flickerT * 2.1);
    signMat.emissiveIntensity = 1.05 * f;
    signGlow.material.opacity = 0.30 * f;
  }

  let running = true;
  // 静态出帧模式（供离线截图自检）：?still=<帧数>，跑完指定帧数后停掉循环
  const STILL = (function () {
    try {
      const m = /[?&]still=(\d+)/.exec(window.location.search || '');
      return m ? parseInt(m[1], 10) : 0;
    } catch (e) { return 0; }
  })();
  // 自检机位：?view=<theta>,<phi>,<radius>
  (function () {
    try {
      const m = /[?&]view=([-\d.]+),([-\d.]+),([-\d.]+)/.exec(window.location.search || '');
      if (m) ctl.setView(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    } catch (e) {}
  })();
  let frameCount = 0;

  function animate() {
    if (!running) return;
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    ctl.update(dt);
    if (autoRotate) ctl.addTheta(dt * 0.06);

    updateRain(dt);
    updateSplash(dt);
    updateFlicker(dt);

    renderer.render(scene, camera);

    frameCount++;
    if (STILL > 0 && frameCount >= STILL) {
      running = false;
      window.__rendered = true;
      const l = document.getElementById('loader');
      if (l) l.remove();
      // 把诊断结果打到 console，便于离线抓取
      try {
        const d = window.__diag();
        console.log('DIAG ' + JSON.stringify(d));
        // 把画面像素统计也打出来，确认 canvas 里真的有内容
        const gl = renderer.getContext();
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let sum = 0, red = 0;
        for (let i = 0; i < px.length; i += 4) {
          sum += (px[i] + px[i + 1] + px[i + 2]) / 3;
          if (px[i] > 90 && px[i + 1] < 10 && px[i + 2] < 12) red++;
        }
        console.log('PIXSTAT ' + JSON.stringify({
          w, h, mean: +(sum / (w * h)).toFixed(2), redPx: red
        }));

        // 自截图：把 canvas 内容转成 dataURL 落到 <img>，供 headless 截图拿到真实画面
        try {
          const url = renderer.domElement.toDataURL('image/png');
          const img = document.createElement('img');
          img.src = url;
          img.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:50;pointer-events:none';
          document.body.appendChild(img);
          console.log('SELFSHOT len=' + url.length);
        } catch (e) { console.log('SELFSHOT FAIL ' + e); }
      } catch (e) { console.log('DIAG FAIL ' + e); }
    }
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 键盘
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'r') {
      rainOn = !rainOn;
      rain.visible = rainOn;
      rainNear.visible = rainOn;
      rainMat.opacity = rainOn ? baseOpacity.rain : 0;
      rainNear.material.opacity = rainOn ? baseOpacity.near : 0;
      rainGeo.attributes.position.needsUpdate = true;
    }
    if (k === 'o') autoRotate = !autoRotate;
    if (k === '1') ctl.setView(-2.14, 1.34, 20);   // 正对店面
    if (k === '2') ctl.setView(-1.02, 1.40, 18);   // 侧 3/4
    if (k === '3') ctl.setView(-2.72, 1.30, 24);   // 街对面偏角
    if (k === '4') ctl.setView(-1.62, 1.12, 9);    // 贴近橱窗
  });

  // 隐藏载入提示
  const hud = document.getElementById('hud');
  if (hud) hud.classList.add('ready');

  animate();

  // 调试接口
  window.__scene = { scene, camera, renderer, ctl, THREE };

  // 诊断：报告相机与关键物体的屏幕位置
  window.__diag = function () {
    const info = {
      gl: window.__glInfo || null,
      cam: camera.position.toArray().map(v => +v.toFixed(2)),
      target: TARGET.toArray().map(v => +v.toFixed(2)),
      fov: camera.fov, near: camera.near, far: camera.far,
      exposure: renderer.toneMappingExposure,
      fog: scene.fog ? { color: '#' + scene.fog.color.getHexString(), density: scene.fog.density } : null,
      children: scene.children.length
    };
    // 建筑中心投影到屏幕
    const v = new THREE.Vector3(0, 3.5, BZ0);
    const p = v.clone().project(camera);
    info.buildingNDC = p.toArray().map(n => +n.toFixed(3));
    info.screenPx = [Math.round((p.x * 0.5 + 0.5) * window.innerWidth),
                     Math.round((-p.y * 0.5 + 0.5) * window.innerHeight)];

    const rc = new THREE.Raycaster();
    rc.camera = camera;
    const from = camera.position.clone();
    const dirs = {
      store: new THREE.Vector3(0, 2.0, BZ0 - 0.2),
      sign: new THREE.Vector3(0, 2.9, BZ0 - 0.2),
      groundNear: new THREE.Vector3(-2, 0.02, 2.0),
      upper: new THREE.Vector3(0, 5.0, BZ0 - 0.2),
      center: new THREE.Vector3(0, 1.2, 6.0)
    };
    info.hits = {};
    for (const k in dirs) {
      const d = dirs[k].clone().sub(from).normalize();
      rc.set(from, d);
      const inter = rc.intersectObjects(scene.children, true);
      const solid = inter.filter(h => h.object.type !== 'Sprite' && h.object.type !== 'LineSegments' && h.object.type !== 'Line');
      info.hits[k] = solid.length ? {
        type: solid[0].object.type,
        dist: +solid[0].distance.toFixed(2),
        geo: solid[0].object.geometry && solid[0].object.geometry.type,
        mat: solid[0].object.material && solid[0].object.material.type,
        col: solid[0].object.material && solid[0].object.material.color
          ? '#' + solid[0].object.material.color.getHexString() : null,
        side: solid[0].object.material ? solid[0].object.material.side : null
      } : null;
    }
    // 相机矩阵与朝向
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    info.forward = fwd.toArray().map(n => +n.toFixed(2));
    info.up = camera.up.toArray();
    // 关键元素的屏幕占比与可见性
    const items = {
      sign: [0, 2.9, BZ0 - 0.15],
      window1: [-4.35, 4.95, BZ0],
      window2: [0, 4.95, BZ0],
      window3: [4.35, 4.95, BZ0],
      car: [6.2, 0.8, 3.1],
      bike1: [-4.4, 0.6, 9.35],
      bike2: [-2.6, 0.6, 9.55],
      bike3: [2.2, 0.6, 9.28],
      poleA_lamp: [-13.85, 6.55, 7.6],
      poleB_lamp: [11.55, 6.15, 7.9],
      crosswalk: [-9.0, 0.02, 1.6],
      vending: [7.9, 1.1, 11.0]
    };
    info.vis = {};
    for (const k in items) {
      const v = new THREE.Vector3(items[k][0], items[k][1], items[k][2]);
      const p = v.clone().project(camera);
      const onScreen = Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z > -1 && p.z < 1;
      const d = v.clone().sub(camera.position).length();
      info.vis[k] = {
        on: onScreen,
        px: [Math.round((p.x * 0.5 + 0.5) * window.innerWidth),
             Math.round((-p.y * 0.5 + 0.5) * window.innerHeight)],
        dist: +d.toFixed(1)
      };
    }

    return info;
  };
})();
