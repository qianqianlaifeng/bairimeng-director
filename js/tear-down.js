/* ============================================================
 * 拉片引擎：本地视频 → 镜头切分 → 每镜缩略图
 *   全在本机浏览器里跑，视频不上传；只把分析结果和缩略图存下来。
 *   切分用的是最稳的那套：低分辨率抽帧 → 相邻帧平均绝对差 →
 *   中位数 + MAD 自适应阈值（比固定阈值抗整体亮度变化）/ 最小镜头长度去抖。
 * ============================================================ */
(function () {
  'use strict';
  const SAMPLE_W = 160, SAMPLE_H = 90;
  const THUMB_W = 400;

  function seek(video, t) {
    return new Promise((resolve, reject) => {
      const done = () => { cleanup(); resolve(); };
      const bad = () => { cleanup(); reject(new Error('视频跳转失败')); };
      const cleanup = () => {
        video.removeEventListener('seeked', done);
        video.removeEventListener('error', bad);
      };
      video.addEventListener('seeked', done);
      video.addEventListener('error', bad);
      try { video.currentTime = Math.max(0, Math.min((video.duration || 0) - 0.02, t)); }
      catch (e) { cleanup(); reject(new Error('视频还没准备好')); }
    });
  }

  function meanAbsDiff(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s / a.length;
  }
  function median(arr) {
    if (!arr.length) return 0;
    const a = arr.slice().sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /* 逐个时间点抽帧，返回灰度数组（供差分） */
  async function sampleFrames(video, fps, maxFrames, onProgress) {
    const cv = document.createElement('canvas');
    cv.width = SAMPLE_W; cv.height = SAMPLE_H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const dur = video.duration;
    const want = Math.round(dur * fps);
    const n = Math.max(2, Math.min(maxFrames, want));
    const frames = [];
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * Math.max(0, dur - 0.05);
      await seek(video, t);
      cx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
      const d = cx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
      const g = new Float32Array(SAMPLE_W * SAMPLE_H);
      for (let k = 0, j = 0; k < d.length; k += 4, j++) g[j] = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
      frames.push({ t, g });
      if (onProgress) onProgress((i + 1) / n, '抽帧 ' + (i + 1) + '/' + n);
    }
    return frames;
  }

  function grabThumb(video, t) {
    const cv = document.createElement('canvas');
    const h = Math.max(2, Math.round(THUMB_W * (video.videoHeight || 9) / (video.videoWidth || 16)));
    cv.width = THUMB_W; cv.height = h;
    cv.getContext('2d').drawImage(video, 0, 0, THUMB_W, h);
    try { return cv.toDataURL('image/jpeg', 0.72); } catch (e) { return null; }
  }

  /* 主流程 */
  async function analyze(video, opts = {}) {
    if (!video || !(video.duration > 0)) throw new Error('视频还没加载好（先点一下播放再拆）');
    const fps = Math.max(1, Math.min(12, opts.fps || 4));
    const maxFrames = Math.max(20, Math.min(3000, opts.maxFrames || 1200));
    const minShot = Math.max(0.2, opts.minShot || 0.5);
    const k = opts.k == null ? 1.6 : opts.k;
    const dur = video.duration;

    const frames = await sampleFrames(video, fps, maxFrames, opts.onProgress);
    const diffs = [0];
    for (let i = 1; i < frames.length; i++) diffs.push(meanAbsDiff(frames[i - 1].g, frames[i].g));

    /* 自适应阈值：镜头内的运动也会产生差分，所以用「中位数 + k×MAD」，
       再兜一个下限，免得一条极静的视频被切成一堆碎镜。 */
    const body = diffs.slice(1);
    const med = median(body);
    const mad = median(body.map(d => Math.abs(d - med)));
    const thr = Math.max(opts.floor == null ? 5 : opts.floor, med + Math.max(k * mad, 0.9 * med));

    /* 找切点：超过阈值、且离上一个切点至少 minShot 秒（窗口内取最强的那一帧） */
    const cuts = [];
    let i = 1;
    while (i < diffs.length) {
      if (diffs[i] <= thr) { i++; continue; }
      let bestI = i, bestV = diffs[i], j = i;
      while (j < diffs.length && frames[j].t - frames[i].t < 0.35) {
        if (diffs[j] > bestV) { bestV = diffs[j]; bestI = j; }
        j++;
      }
      const t = frames[bestI].t;
      if (!cuts.length || t - cuts[cuts.length - 1] >= minShot) cuts.push(t);
      i = j;
    }

    const bounds = [0].concat(cuts.filter(t => t > 0.12 && t < dur - 0.12), [dur]);
    const shots = [];
    for (let b = 0; b < bounds.length - 1; b++) {
      const t0 = bounds[b], t1 = bounds[b + 1];
      if (t1 - t0 < 0.2) continue;
      shots.push({ i: shots.length + 1, t0: +t0.toFixed(3), t1: +t1.toFixed(3), dur: +(t1 - t0).toFixed(3) });
    }
    if (!shots.length) shots.push({ i: 1, t0: 0, t1: dur, dur });

    /* 每镜中点抓一张缩略图 */
    for (let s = 0; s < shots.length; s++) {
      await seek(video, (shots[s].t0 + shots[s].t1) / 2);
      shots[s].thumb = grabThumb(video, (shots[s].t0 + shots[s].t1) / 2);
      if (opts.onProgress) opts.onProgress((s + 1) / shots.length, '缩略图 ' + (s + 1) + '/' + shots.length);
    }
    return { dur, shots, thr: +thr.toFixed(2), med: +med.toFixed(2), sampled: frames.length };
  }

  function fmt(t) {
    t = Math.max(0, +t || 0);
    const m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t % 1) * 10);
    return (m ? m + ':' : '') + String(s).padStart(2, '0') + '.' + f;
  }

  window.TEAR_DOWN = { analyze, seek, sampleFrames, grabThumb, fmt, meanAbsDiff, median };
})();
