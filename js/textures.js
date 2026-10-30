/* textures.js — 全部贴图用 canvas 程序化生成，无任何外部资源 */
(function (global) {
  'use strict';

  function cv(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return { c, x: c.getContext('2d') };
  }

  function rnd(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function noise(x, w, h, amt, alpha) {
    const img = x.getImageData(0, 0, w, h);
    const d = img.data;
    const r = rnd(90210);
    for (let i = 0; i < d.length; i += 4) {
      const n = (r() - 0.5) * amt;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
      if (alpha !== undefined) d[i + 3] = alpha;
    }
    x.putImageData(img, 0, 0);
  }

  function toTex(c, rx, ry) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (rx || ry) t.repeat.set(rx || 1, ry || 1);
    return t;
  }

  /* ---------------- 沥青路面 ---------------- */
  function asphalt() {
    const { c, x } = cv(512, 512);
    x.fillStyle = '#1a1c20'; x.fillRect(0, 0, 512, 512);
    const r = rnd(7);
    // 石子
    for (let i = 0; i < 9000; i++) {
      const g = 22 + r() * 46;
      x.fillStyle = `rgba(${g},${g + 2},${g + 5},${0.25 + r() * 0.5})`;
      const s = 0.6 + r() * 2.2;
      x.fillRect(r() * 512, r() * 512, s, s);
    }
    // 大块补丁与裂纹
    for (let i = 0; i < 14; i++) {
      x.fillStyle = `rgba(10,11,13,${0.15 + r() * 0.25})`;
      x.beginPath();
      x.ellipse(r() * 512, r() * 512, 30 + r() * 90, 20 + r() * 60, r() * 6.28, 0, 6.28);
      x.fill();
    }
    x.strokeStyle = 'rgba(8,9,11,0.55)'; x.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) {
      x.beginPath();
      let px = r() * 512, py = r() * 512;
      x.moveTo(px, py);
      for (let k = 0; k < 5; k++) {
        px += (r() - 0.5) * 60; py += (r() - 0.5) * 60;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    noise(x, 512, 512, 26);
    return toTex(c, 6, 6);
  }

  /* ---------------- 水泥人行道 ---------------- */
  function sidewalk() {
    const { c, x } = cv(512, 512);
    x.fillStyle = '#3a3b3d'; x.fillRect(0, 0, 512, 512);
    const r = rnd(31);
    for (let i = 0; i < 5000; i++) {
      const g = 40 + r() * 40;
      x.fillStyle = `rgba(${g},${g},${g + 2},${0.15 + r() * 0.35})`;
      x.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2);
    }
    // 铺砖缝
    x.strokeStyle = 'rgba(18,19,21,0.75)'; x.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      x.beginPath(); x.moveTo(0, i * 128); x.lineTo(512, i * 128); x.stroke();
      x.beginPath(); x.moveTo(i * 128, 0); x.lineTo(i * 128, 512); x.stroke();
    }
    // 潮湿的深色斑
    for (let i = 0; i < 9; i++) {
      x.fillStyle = `rgba(14,15,18,${0.1 + r() * 0.22})`;
      x.beginPath();
      x.ellipse(r() * 512, r() * 512, 40 + r() * 80, 25 + r() * 50, r() * 6.28, 0, 6.28);
      x.fill();
    }
    noise(x, 512, 512, 18);
    return toTex(c, 5, 5);
  }

  /* ---------------- 二层楼体瓷砖 ---------------- */
  function wallTile() {
    const { c, x } = cv(512, 512);
    x.fillStyle = '#8d8677'; x.fillRect(0, 0, 512, 512);
    const r = rnd(77);
    const cols = 16, rows = 26;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const v = 0.78 + r() * 0.3;
        const base = [143, 134, 117];
        x.fillStyle = `rgb(${base[0] * v | 0},${base[1] * v | 0},${base[2] * v | 0})`;
        x.fillRect(i * (512 / cols) + 1, j * (512 / rows) + 1,
          512 / cols - 2, 512 / rows - 2);
      }
    }
    // 水渍/雨痕
    for (let i = 0; i < 90; i++) {
      const px = r() * 512;
      const h = 30 + r() * 300;
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(48,45,40,0.30)');
      g.addColorStop(1, 'rgba(48,45,40,0)');
      x.fillStyle = g;
      x.save(); x.translate(px, r() * 512); x.fillRect(0, 0, 2 + r() * 5, h); x.restore();
    }
    noise(x, 512, 512, 14);
    return toTex(c, 2, 1);
  }

  /* ---------------- 混凝土（电线杆/墙基） ---------------- */
  function concrete() {
    const { c, x } = cv(256, 256);
    x.fillStyle = '#54565a'; x.fillRect(0, 0, 256, 256);
    const r = rnd(5);
    for (let i = 0; i < 2600; i++) {
      const g = 60 + r() * 45;
      x.fillStyle = `rgba(${g},${g + 1},${g + 3},${0.2 + r() * 0.4})`;
      x.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
    }
    for (let i = 0; i < 6; i++) {
      x.fillStyle = `rgba(30,31,34,${0.1 + r() * 0.18})`;
      x.beginPath(); x.ellipse(r() * 256, r() * 256, 20 + r() * 50, 15 + r() * 40, 0, 0, 6.28); x.fill();
    }
    noise(x, 256, 256, 20);
    return toTex(c, 1, 3);
  }

  /* ---------------- 便利店招牌（横向灯箱） ---------------- */
  function storeSign() {
    const { c, x } = cv(2048, 256);
    // 白底 + 双色条纹，便利店感
    x.fillStyle = '#f2f5f8'; x.fillRect(0, 0, 2048, 256);
    x.fillStyle = '#1e6fbf'; x.fillRect(0, 0, 2048, 26);
    x.fillStyle = '#59a8dd'; x.fillRect(0, 26, 2048, 10);
    x.fillStyle = '#1e6fbf'; x.fillRect(0, 230, 2048, 26);

    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#123c66';
    x.font = 'bold 118px "Segoe UI", "Microsoft YaHei", sans-serif';
    x.fillText('MINATO MART', 1024, 108);
    x.fillStyle = '#2b7fc4';
    x.font = 'bold 56px "Yu Gothic", "Microsoft YaHei", sans-serif';
    x.fillText('ミナトマート ・ 24 HOURS ・ 年中無休', 1024, 186);
    noise(x, 2048, 256, 8);
    return toTex(c, 1, 1);
  }

  /* ---------------- 竖招牌（日式突出招牌） ---------------- */
  function verticalSign() {
    const { c, x } = cv(256, 1024);
    x.fillStyle = '#f4f1e6'; x.fillRect(0, 0, 256, 1024);
    x.fillStyle = '#c8352f'; x.fillRect(0, 0, 256, 120);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 66px "Yu Gothic", "Microsoft YaHei", sans-serif';
    x.fillText('営業中', 128, 62);
    x.fillStyle = '#1d2a44';
    x.font = 'bold 132px "Yu Gothic", "Microsoft YaHei", sans-serif';
    const chars = ['ラ', 'ー', 'メ', 'ン'];
    chars.forEach((ch, i) => x.fillText(ch, 128, 250 + i * 190));
    x.fillStyle = '#c8352f';
    x.font = 'bold 52px sans-serif';
    x.fillText('¥780〜', 128, 1010);
    noise(x, 256, 1024, 10);
    return toTex(c, 1, 1);
  }

  /* ---------------- 墙面不规则海报 ---------------- */
  function poster(kind) {
    const { c, x } = cv(512, 700);
    x.clearRect(0, 0, 512, 700);
    if (kind === 0) {
      x.fillStyle = '#e9e3d2'; x.fillRect(8, 8, 496, 600);
      x.fillStyle = '#b8322c'; x.fillRect(8, 8, 496, 150);
      x.fillStyle = '#fff'; x.textAlign = 'center';
      x.font = 'bold 86px "Yu Gothic", "Microsoft YaHei", sans-serif';
      x.fillText('本日 特価', 256, 108);
      x.fillStyle = '#22303f';
      x.font = 'bold 54px sans-serif';
      x.fillText('COFFEE  100円', 256, 240);
      x.fillText('おにぎり  110円', 256, 320);
      x.fillText('からあげ  180円', 256, 400);
      x.font = 'bold 40px sans-serif';
      x.fillStyle = '#8b8b7a';
      x.fillText('7:00 — 23:00', 256, 500);
      x.fillStyle = '#c0392b';
      x.font = 'bold 64px sans-serif';
      x.fillText('SALE', 256, 570);
    } else if (kind === 1) {
      x.fillStyle = '#2a3a55'; x.fillRect(6, 6, 500, 620);
      x.fillStyle = '#e8eef7'; x.textAlign = 'center';
      x.font = 'bold 74px "Yu Gothic", "Microsoft YaHei", sans-serif';
      x.fillText('求人募集', 256, 120);
      x.fillStyle = '#f0c674';
      x.font = 'bold 44px sans-serif';
      x.fillText('アルバイト 時給1200円', 256, 210);
      x.fillStyle = '#c9d6e8';
      x.font = '36px sans-serif';
      x.fillText('深夜シフト歓迎', 256, 280);
      x.fillText('学生・主婦 OK', 256, 334);
      x.strokeStyle = '#f0c674'; x.lineWidth = 4;
      x.strokeRect(60, 380, 392, 180);
      x.fillStyle = '#f0c674';
      x.font = 'bold 40px sans-serif';
      x.fillText('TEL 03-0000-0000', 256, 480);
    } else {
      x.fillStyle = '#f0e6d2'; x.fillRect(6, 6, 500, 640);
      x.fillStyle = '#3a5a8c'; x.fillRect(6, 6, 500, 96);
      x.fillStyle = '#fff'; x.textAlign = 'center';
      x.font = 'bold 56px "Yu Gothic", "Microsoft YaHei", sans-serif';
      x.fillText('クリーニング', 256, 72);
      x.fillStyle = '#444';
      x.font = 'bold 46px sans-serif';
      x.fillText('スーツ ¥600', 256, 190);
      x.fillText('コート ¥900', 256, 260);
      x.fillText('毛布 ¥800', 256, 330);
      x.fillStyle = '#8a8272';
      x.font = '34px sans-serif';
      x.fillText('当日仕上げ', 256, 420);
      x.fillStyle = '#b03a2e';
      x.font = 'bold 52px sans-serif';
      x.fillText('営業中', 256, 520);
    }
    // 撕裂：底部不规则透明
    const r = rnd(kind * 17 + 3);
    x.globalCompositeOperation = 'destination-out';
    x.beginPath();
    x.moveTo(0, 700);
    let px = 0;
    const tearY = 590 + r() * 50;
    x.lineTo(0, tearY);
    while (px < 512) {
      px += 20 + r() * 40;
      x.lineTo(px, tearY + (r() - 0.5) * 70);
    }
    x.lineTo(512, 700);
    x.closePath(); x.fill();
    x.globalCompositeOperation = 'source-over';
    // 折旧
    x.fillStyle = 'rgba(60,50,35,0.10)';
    for (let i = 0; i < 12; i++) x.fillRect(r() * 500, r() * 600, 20 + r() * 80, 6 + r() * 40);
    const t = toTex(c, 1, 1);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  /* ---------------- 窗帘（透光） ---------------- */
  function curtain() {
    const { c, x } = cv(256, 256);
    x.fillStyle = '#f6e3c4'; x.fillRect(0, 0, 256, 256);
    const r = rnd(12);
    for (let i = 0; i < 26; i++) {
      const px = i * 10;
      const g = x.createLinearGradient(px, 0, px + 10, 0);
      const a = 0.06 + r() * 0.12;
      g.addColorStop(0, `rgba(150,110,60,${a})`);
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, `rgba(150,110,60,${a})`);
      x.fillStyle = g; x.fillRect(px, 0, 10, 256);
    }
    return toTex(c, 1, 1);
  }

  /* ---------------- 店内货架商品纹理 ---------------- */
  function goodsRow(seed, hue) {
    const { c, x } = cv(512, 128);
    x.fillStyle = '#efe9dc'; x.fillRect(0, 0, 512, 128);
    const r = rnd(seed);
    let px = 4;
    while (px < 508) {
      const w = 8 + r() * 18;
      const h = 40 + r() * 60;
      const hh = (hue + r() * 60) % 360;
      x.fillStyle = `hsl(${hh},${45 + r() * 40}%,${45 + r() * 25}%)`;
      x.fillRect(px, 128 - h - 10, w, h);
      x.fillStyle = 'rgba(255,255,255,0.35)';
      x.fillRect(px, 128 - h - 10, w, 8);
      px += w + 2 + r() * 6;
    }
    x.fillStyle = 'rgba(120,110,95,0.55)';
    x.fillRect(0, 118, 512, 10);
    return toTex(c, 1, 1);
  }

  /* ---------------- 湿地面反射用的柔和光斑 ---------------- */
  function softGlow(color) {
    const { c, x } = cv(256, 256);
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, color.replace('ALPHA', '1'));
    g.addColorStop(0.35, color.replace('ALPHA', '0.42'));
    g.addColorStop(1, color.replace('ALPHA', '0'));
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }

  /* ---------------- 天空（等距柱状，用于环境反射） ---------------- */
  function skyEquirect() {
    const W = 1024, H = 512;
    const { c, x } = cv(W, H);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0.00, '#0a1220');
    g.addColorStop(0.35, '#16223a');
    g.addColorStop(0.52, '#2b3752');
    g.addColorStop(0.62, '#46506a');
    g.addColorStop(0.70, '#5f5a52');
    g.addColorStop(0.80, '#3a3730');
    g.addColorStop(1.00, '#101319');
    x.fillStyle = g; x.fillRect(0, 0, W, H);

    // 云层的暗块
    const r = rnd(404);
    for (let i = 0; i < 90; i++) {
      const yy = r() * H * 0.55;
      const w = 60 + r() * 260, h = 10 + r() * 46;
      x.fillStyle = `rgba(${20 + r() * 30},${24 + r() * 30},${34 + r() * 34},${0.10 + r() * 0.2})`;
      x.beginPath();
      x.ellipse(r() * W, yy, w, h, 0, 0, 6.28);
      x.fill();
    }
    // 地平线暖光（黄昏残余）
    const wg = x.createRadialGradient(W * 0.28, H * 0.62, 0, W * 0.28, H * 0.62, W * 0.4);
    wg.addColorStop(0, 'rgba(190,140,90,0.30)');
    wg.addColorStop(1, 'rgba(190,140,90,0)');
    x.fillStyle = wg; x.fillRect(0, 0, W, H);

    // 远处街灯的冷色小点
    for (let i = 0; i < 26; i++) {
      const px = r() * W, py = H * 0.60 + r() * H * 0.04;
      const gg = x.createRadialGradient(px, py, 0, px, py, 16);
      gg.addColorStop(0, 'rgba(170,215,255,0.55)');
      gg.addColorStop(1, 'rgba(170,215,255,0)');
      x.fillStyle = gg; x.beginPath(); x.arc(px, py, 16, 0, 6.28); x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace !== undefined ? THREE.SRGBColorSpace : undefined;
    return t;
  }

  global.TEX = {
    asphalt, sidewalk, wallTile, concrete, storeSign, verticalSign,
    poster, curtain, goodsRow, softGlow, skyEquirect, toTex, cv
  };
})(window);
