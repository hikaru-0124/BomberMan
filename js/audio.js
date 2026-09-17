/**
 * Web Audio API を用いた効果音・BGMシンセサイザー
 * 外部音声ファイル不要で100%確実に動作します
 */
class SoundManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.bgmPlaying = false;
    this.bgmTimer = null;
    this.bgmStep = 0;
  }

  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopBgm();
    } else {
      this.startBgm();
    }
    return this.isMuted;
  }

  // 爆弾設置音（小気味よいポン音）
  playBombSet() {
    if (this.isMuted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(360, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.12);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.12);
  }

  // 迫力ある爆発音（ノイズ＋低周波サブベース）
  playExplosion() {
    if (this.isMuted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const duration = 0.55;

    // ノイズバッファ作成
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    // ローパスフィルタでこもらせて爆発感を出す
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + duration);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + duration);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    // ドンという低音オシレータ
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + duration);

    oscGain.gain.setValueAtTime(0.5, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + duration);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);

    whiteNoise.start(t);
    whiteNoise.stop(t + duration);
    osc.start(t);
    osc.stop(t + duration);
  }

  // アイテム取得音（キラキラ上昇音）
  playPowerup() {
    if (this.isMuted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
    notes.forEach((freq, idx) => {
      const startTime = t + idx * 0.05;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.12, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.08);
    });
  }

  // キャラクター被弾音
  playHit() {
    if (this.isMuted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(60, t + 0.35);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.35);
  }

  // キャラクター吹っ飛び音（コミカルなピューーーーン！）
  playBlowAway() {
    if (this.isMuted || !this.ctx) return;
    const t = this.ctx.currentTime;

    // スライドホイッスル風の上昇・下降音
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(950, t + 0.25);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.7);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.setValueAtTime(0.35, t + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.7);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.7);

    // 打撃音
    const hitOsc = this.ctx.createOscillator();
    const hitGain = this.ctx.createGain();
    hitOsc.type = 'triangle';
    hitOsc.frequency.setValueAtTime(200, t);
    hitOsc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    hitGain.gain.setValueAtTime(0.4, t);
    hitGain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    hitOsc.connect(hitGain);
    hitGain.connect(this.ctx.destination);
    hitOsc.start(t);
    hitOsc.stop(t + 0.15);
  }

  // 勝利ジングル
  playWin() {
    if (this.isMuted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const melody = [
      { f: 523.25, d: 0.12 }, // C5
      { f: 659.25, d: 0.12 }, // E5
      { f: 783.99, d: 0.12 }, // G5
      { f: 1046.50, d: 0.35 } // C6
    ];
    let cur = t;
    melody.forEach(n => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, cur);
      gain.gain.setValueAtTime(0.25, cur);
      gain.gain.exponentialRampToValueAtTime(0.01, cur + n.d);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(cur);
      osc.stop(cur + n.d);
      cur += n.d * 1.1;
    });
  }

  // 敗北ジングル
  playLose() {
    if (this.isMuted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const melody = [
      { f: 440, d: 0.16 },    // A4
      { f: 415.30, d: 0.16 }, // G#4
      { f: 392.00, d: 0.16 }, // G4
      { f: 349.23, d: 0.45 }  // F4
    ];
    let cur = t;
    melody.forEach(n => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.f, cur);
      gain.gain.setValueAtTime(0.2, cur);
      gain.gain.exponentialRampToValueAtTime(0.01, cur + n.d);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(cur);
      osc.stop(cur + n.d);
      cur += n.d * 1.05;
    });
  }

  // レトロ風8bit BGMループ
  startBgm() {
    if (this.isMuted || !this.ctx || this.bgmPlaying) return;
    this.bgmPlaying = true;
    this.bgmStep = 0;

    // 軽快なベース・コード進行シーケンス
    const bassline = [
      130.81, 130.81, 164.81, 196.00, // C3, C3, E3, G3
      174.61, 174.61, 220.00, 261.63, // F3, F3, A3, C4
      196.00, 196.00, 246.94, 293.66, // G3, G3, B3, D4
      130.81, 196.00, 164.81, 130.81  // C3, G3, E3, C3
    ];

    const stepInterval = 160; // ms per 16th note

    this.bgmTimer = setInterval(() => {
      if (!this.bgmPlaying || this.isMuted || !this.ctx) return;
      const t = this.ctx.currentTime;
      const freq = bassline[this.bgmStep % bassline.length];

      // ベース音
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.005, t + 0.14);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.14);

      // 4拍ごとにパーカッション（ハイハット/スネア風）
      if (this.bgmStep % 2 === 1) {
        const hOsc = this.ctx.createOscillator();
        const hGain = this.ctx.createGain();
        hOsc.type = 'square';
        hOsc.frequency.setValueAtTime(1200 + (this.bgmStep % 4 === 3 ? 400 : 0), t);
        hGain.gain.setValueAtTime(0.02, t);
        hGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        hOsc.connect(hGain);
        hGain.connect(this.ctx.destination);
        hOsc.start(t);
        hOsc.stop(t + 0.04);
      }

      this.bgmStep++;
    }, stepInterval);
  }

  stopBgm() {
    this.bgmPlaying = false;
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

// グローバルサウンドインスタンス
const soundManager = new SoundManager();
