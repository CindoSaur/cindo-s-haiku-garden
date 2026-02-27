/* ════════════════════════════════════════
     STATE
  ════════════════════════════════════════ */
  const seasonKanji  = { Spring:'花', Summer:'夏', Autumn:'秋', Winter:'冬' };
  const seasonColors = { Spring:'#5a6e52', Summer:'#2d6a4f', Autumn:'#9a7b3a', Winter:'#4a6fa5' };

  let allHaikus    = [];
  let filteredList = [];
  let activeSeason = 'All';
  let activeLang   = 'ja';
  let readingIdx   = 0;

  /* ════════════════════════════════════════
     HELPERS
  ════════════════════════════════════════ */
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }

  function getFields(haiku) {
    return {
      title: activeLang === 'ja' ? haiku.title_ja : haiku.title_en,
      lines: activeLang === 'ja' ? haiku.lines_ja  : haiku.lines_en
    };
  }

  function copyHaiku(haiku) {
    const { title, lines } = getFields(haiku);
    const text = (title ? title + '\n\n' : '') + lines.join('\n');
    navigator.clipboard.writeText(text)
      .then(() => showToast(activeLang === 'ja' ? 'コピーしました' : 'Copied to clipboard'))
      .catch(() => showToast('Could not copy'));
  }

  /* ════════════════════════════════════════
     DARK MODE
  ════════════════════════════════════════ */
  const darkToggle = document.getElementById('darkToggle');
  let isDark = false;

  darkToggle.addEventListener('click', () => {
    isDark = !isDark;
    document.body.classList.toggle('dark', isDark);
    document.getElementById('darkIcon').textContent = isDark ? 'light_mode' : 'dark_mode';
    darkToggle.title = isDark ? 'Light mode' : 'Dark mode';
  });

  /* ════════════════════════════════════════
     AMBIENT SOUND
     ─────────────────────────────────────
     HOW TO USE MP3:
       Put your mp3 files in a folder called "sounds/" next to index.html:
         sounds/rain.mp3
         sounds/wind.mp3
         sounds/birds.mp3
         sounds/stream.mp3

     If a file is not found, it automatically falls back
     to the generated Web Audio API sound instead.
  ════════════════════════════════════════ */
  const soundToggle = document.getElementById('soundToggle');
  const soundPicker = document.getElementById('soundPicker');

  // ── Volume (0.0 – 1.0) for each MP3 ──
  const MP3_VOLUME = {
    rain:   0.5,
    wind:   0.5,
    birds:  0.5,
    stream: 0.5,
  };

  // ── Fade duration in ms ──
  const FADE_MS = 1500;

  // Current playing state
  let activeSound   = null;   // 'rain' | 'wind' | 'birds' | 'stream' | null
  let currentAudio  = null;   // HTMLAudioElement (MP3 mode)
  let fadeInterval  = null;   // setInterval handle for fade
  let audioCtx      = null;   // Web Audio context (fallback mode)
  let soundNodes    = null;   // Web Audio nodes (fallback mode)

  soundToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    soundPicker.classList.toggle('open');
  });

  document.addEventListener('click', () => soundPicker.classList.remove('open'));

  // ── Fade helper for HTMLAudioElement ──
  function fadeIn(audio, targetVol) {
    clearInterval(fadeInterval);
    audio.volume = 0;
    const steps = 30;
    const stepTime = FADE_MS / steps;
    const stepVol  = targetVol / steps;
    let current = 0;
    fadeInterval = setInterval(() => {
      current += stepVol;
      audio.volume = Math.min(current, targetVol);
      if (audio.volume >= targetVol) clearInterval(fadeInterval);
    }, stepTime);
  }

  function fadeOut(audio, onDone) {
    clearInterval(fadeInterval);
    const steps = 30;
    const stepTime = FADE_MS / steps;
    const stepVol  = audio.volume / steps;
    fadeInterval = setInterval(() => {
      audio.volume = Math.max(0, audio.volume - stepVol);
      if (audio.volume <= 0) {
        clearInterval(fadeInterval);
        audio.pause();
        audio.currentTime = 0;
        if (onDone) onDone();
      }
    }, stepTime);
  }

  // ── Stop everything ──
  function stopSound() {
    // Stop MP3
    if (currentAudio) {
      fadeOut(currentAudio);
      currentAudio = null;
    }
    // Stop Web Audio fallback
    if (soundNodes) {
      try { soundNodes.forEach(n => { try { n.stop(); } catch(e){} }); } catch(e){}
      soundNodes = null;
    }
    activeSound = null;
    soundToggle.classList.remove('playing');
    document.getElementById('soundIcon').textContent = 'music_note';
    document.querySelectorAll('.sound-opt').forEach(b => b.classList.remove('active'));
  }

  // ── Try MP3 first, fallback to Web Audio ──
  function playSound(type) {
    stopSound();

    const mp3Path = `sounds/${type}.mp3`;
    const audio = new Audio();

    audio.addEventListener('canplaythrough', () => {
      // MP3 loaded successfully → play it
      audio.loop = true;
      fadeIn(audio, MP3_VOLUME[type] ?? 0.5);
      audio.play();
      currentAudio = audio;
      activeSound  = type;
      soundToggle.classList.add('playing');
      document.getElementById('soundIcon').textContent = 'volume_up';
    }, { once: true });

    audio.addEventListener('error', () => {
      // MP3 not found or failed → fallback to Web Audio generated sound
      console.warn(`sounds/${type}.mp3 not found — using generated sound`);
      playGeneratedSound(type);
    }, { once: true });

    audio.src = mp3Path;
    audio.load();
  }

  // ── Web Audio API fallback (generated sounds) ──
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function makeNoise() {
    const ctx = getAudioCtx();
    const bufferSize = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  function playGeneratedSound(type) {
    const ctx = getAudioCtx();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 1.5);

    let nodes = [master];

    if (type === 'rain') {
      const noise = makeNoise();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      filter.Q.value = 0.4;
      const filter2 = ctx.createBiquadFilter();
      filter2.type = 'highpass';
      filter2.frequency.value = 400;
      noise.connect(filter);
      filter.connect(filter2);
      filter2.connect(master);
      noise.start();
      nodes.push(noise);

    } else if (type === 'wind') {
      const noise = makeNoise();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 300;
      filter.Q.value = 0.1;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.08;
      lfoGain.gain.value = 120;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      noise.connect(filter);
      filter.connect(master);
      noise.start(); lfo.start();
      nodes.push(noise, lfo);

    } else if (type === 'birds') {
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 1200 + i * 350 + Math.random() * 200;
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        const chirpInterval = (1.8 + i * 0.7 + Math.random()) * 1000;
        let t = ctx.currentTime + Math.random() * 2;
        function scheduleChirp() {
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.06, t + 0.04);
          gain.gain.setValueAtTime(0.06, t + 0.04);
          osc.frequency.setValueAtTime(osc.frequency.value, t);
          osc.frequency.linearRampToValueAtTime(osc.frequency.value * 1.12, t + 0.08);
          gain.gain.linearRampToValueAtTime(0, t + 0.18);
          t += chirpInterval / 1000 + Math.random() * 0.8;
          setTimeout(scheduleChirp, chirpInterval);
        }
        scheduleChirp();
        nodes.push(osc);
      }

    } else if (type === 'stream') {
      const noise = makeNoise();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 900;
      filter.Q.value = 0.8;
      const filter2 = ctx.createBiquadFilter();
      filter2.type = 'peaking';
      filter2.frequency.value = 600;
      filter2.gain.value = 8;
      noise.connect(filter);
      filter.connect(filter2);
      filter2.connect(master);
      master.gain.value = 0;
      master.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 1.5);
      noise.start();
      nodes.push(noise);
    }

    soundNodes = nodes;
    activeSound = type;
    soundToggle.classList.add('playing');
    document.getElementById('soundIcon').textContent = 'volume_up';
  }

  document.querySelectorAll('.sound-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sound = btn.dataset.sound;
      if (activeSound === sound) {
        stopSound();
      } else {
        document.querySelectorAll('.sound-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        playSound(sound);
      }
      soundPicker.classList.remove('open');
    });
  });

  /* ════════════════════════════════════════
     LANGUAGE SWITCH
  ════════════════════════════════════════ */
  function switchLanguage(lang) {
    if (lang === activeLang) return;
    activeLang = lang;
    document.body.classList.toggle('lang-ja', lang === 'ja');
    document.getElementById('btnJa').classList.toggle('active', lang === 'ja');
    document.getElementById('btnEn').classList.toggle('active', lang === 'en');

    document.querySelectorAll('.haiku-card').forEach(card => {
      const id    = parseInt(card.dataset.id);
      const haiku = allHaikus.find(h => h.id === id);
      if (!haiku) return;

      // update front face
      const titleEl = card.querySelector('.card-title');
      const lineEls = card.querySelectorAll('.card-line');
      const targets = [...(titleEl ? [titleEl] : []), ...lineEls];
      targets.forEach(el => el.classList.add('fade-out'));
      setTimeout(() => {
        const { title, lines } = getFields(haiku);
        if (titleEl) titleEl.textContent = title || '';
        lineEls.forEach((el, i) => { el.textContent = lines[i] || ''; });
        targets.forEach(el => el.classList.remove('fade-out'));
      }, 260);

      // update back face
      const backLines = card.querySelectorAll('.back-line');
      const backTitle = card.querySelector('.back-title');
      const otherLang  = lang === 'ja' ? 'en' : 'ja';
      const otherTitle = otherLang === 'ja' ? haiku.title_ja : haiku.title_en;
      const otherLines = otherLang === 'ja' ? haiku.lines_ja : haiku.lines_en;
      if (backTitle) backTitle.textContent = otherTitle || '';
      backLines.forEach((el, i) => { el.textContent = otherLines[i] || ''; });
    });

    if (document.getElementById('readingOverlay').classList.contains('open')) {
      renderReading(filteredList[readingIdx]);
    }
  }

  document.getElementById('btnJa').addEventListener('click', () => switchLanguage('ja'));
  document.getElementById('btnEn').addEventListener('click', () => switchLanguage('en'));

  /* ════════════════════════════════════════
     CARD BUILD
  ════════════════════════════════════════ */
  function buildCard(haiku, delay) {
    const wrapper = document.createElement('div');
    wrapper.className = 'card-wrapper';

    const card = document.createElement('div');
    card.className = 'haiku-card';
    card.dataset.id     = haiku.id;
    card.dataset.season = haiku.season || '';

    const kanji = seasonKanji[haiku.season] || '詩';
    const { title, lines } = getFields(haiku);
    const otherTitle = activeLang === 'ja' ? haiku.title_en : haiku.title_ja;
    const otherLines = activeLang === 'ja' ? haiku.lines_en : haiku.lines_ja;

    // FRONT FACE
    const front = document.createElement('div');
    front.className = 'card-face card-face-front';
    front.innerHTML = `
      <div class="card-bg-kanji">${kanji}</div>
      <div class="card-meta">
        ${title ? `<div class="card-title">${esc(title)}</div>` : '<div></div>'}
        ${haiku.year ? `<div class="card-year">${esc(haiku.year)}</div>` : ''}
      </div>
      <div class="card-lines">
        ${lines.map((line, i) =>
          `<div class="card-line">${esc(line)}</div>` +
          (i < lines.length - 1 ? '<span class="line-sep"></span>' : '')
        ).join('')}
      </div>
      ${haiku.season ? `<div class="season-tag">${esc(haiku.season)}</div>` : ''}
      <div class="flip-hint"><span class="material-icons-round" style="font-size:13px;vertical-align:middle">flip</span> flip</div>
    `;

    // BACK FACE (opposite language)
    const back = document.createElement('div');
    back.className = 'card-face card-face-back';
    back.innerHTML = `
      <div class="back-kanji">${kanji}</div>
      ${otherTitle ? `<div class="back-title">${esc(otherTitle)}</div>` : ''}
      <div class="back-lines">
        ${otherLines.map((line, i) =>
          `<div class="back-line">${esc(line)}</div>` +
          (i < otherLines.length - 1 ? '<span class="back-line-sep"></span>' : '')
        ).join('')}
      </div>
      ${haiku.year ? `<div class="back-year">${esc(haiku.year)}</div>` : ''}
      <div class="back-flip-hint"><span class="material-icons-round" style="font-size:13px;vertical-align:middle">flip</span> flip back</div>
    `;

    card.appendChild(front);
    card.appendChild(back);
    wrapper.appendChild(card);

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.title = 'Copy poem';
    copyBtn.setAttribute('aria-label', 'Copy poem');
    copyBtn.innerHTML = '<span class="material-icons-round" style="font-size:15px">content_copy</span>';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyHaiku(haiku);
    });
    wrapper.appendChild(copyBtn);

    // FLIP on click
    wrapper.addEventListener('click', (e) => {
      if (e.target.closest('.copy-btn')) return;
      card.classList.toggle('flipped');
    });

    // READING MODE on double-click
    wrapper.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      card.classList.remove('flipped');
      const idx = filteredList.findIndex(h => h.id === haiku.id);
      openReading(idx >= 0 ? idx : 0);
    });

    wrapper.style.animationDelay = delay + 'ms';
    requestAnimationFrame(() => requestAnimationFrame(() => wrapper.classList.add('visible')));
    return wrapper;
  }

  /* ════════════════════════════════════════
     READING MODE
  ════════════════════════════════════════ */
  const overlay  = document.getElementById('readingOverlay');
  const closeBtn = document.getElementById('readingClose');
  const prevBtn  = document.getElementById('readingPrev');
  const nextBtn  = document.getElementById('readingNext');
  const copyRBtn = document.getElementById('readingCopy');

  function renderReading(haiku) {
    if (!haiku) return;
    const { title, lines } = getFields(haiku);
    const kanji = seasonKanji[haiku.season] || '詩';
    const color = seasonColors[haiku.season] || '#9a7b3a';

    document.getElementById('readingSeasonBar').style.background = color;
    document.getElementById('readingKanji').textContent = kanji;
    document.getElementById('readingTitle').textContent = title || '';
    document.getElementById('readingYear').textContent  = haiku.year ? haiku.year : '';

    const linesEl = document.getElementById('readingLines');
    linesEl.innerHTML = lines.map((line, i) =>
      `<div class="reading-line">${esc(line)}</div>` +
      (i < lines.length - 1 ? '<span class="reading-sep"></span>' : '')
    ).join('');
  }

  function openReading(idx) {
    readingIdx = idx;
    renderReading(filteredList[readingIdx]);
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeReading() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  closeBtn.addEventListener('click', closeReading);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeReading(); });

  prevBtn.addEventListener('click', () => {
    readingIdx = (readingIdx - 1 + filteredList.length) % filteredList.length;
    renderReading(filteredList[readingIdx]);
  });

  nextBtn.addEventListener('click', () => {
    readingIdx = (readingIdx + 1) % filteredList.length;
    renderReading(filteredList[readingIdx]);
  });

  copyRBtn.addEventListener('click', () => copyHaiku(filteredList[readingIdx]));

  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape')      closeReading();
    if (e.key === 'ArrowLeft')   prevBtn.click();
    if (e.key === 'ArrowRight')  nextBtn.click();
  });

  /* ════════════════════════════════════════
     GALLERY RENDER
  ════════════════════════════════════════ */
  function renderGallery(haikus) {
    filteredList = haikus;
    const gallery      = document.getElementById('gallery');
    const statsBar     = document.getElementById('statsBar');
    const visibleCount = document.getElementById('visibleCount');
    const seasonLabel  = document.getElementById('activeSeasonLabel');

    if (!haikus.length) {
      gallery.innerHTML = `
        <div class="empty-state">
          <div style="font-family:'Noto Serif JP',serif;font-size:2.5rem;opacity:0.15;margin-bottom:1rem;">無</div>
          ${activeLang === 'ja' ? 'この季節の詩はありません。' : 'No poems found for this season.'}
        </div>`;
      statsBar.style.display = 'none';
      return;
    }

    statsBar.style.display = 'flex';
    visibleCount.textContent = haikus.length;
    seasonLabel.textContent = activeSeason === 'All'
      ? '— All seasons —'
      : `— ${activeSeason} ${seasonKanji[activeSeason] ? '(' + seasonKanji[activeSeason] + ')' : ''} —`;

    const grid = document.createElement('div');
    grid.className = 'haiku-grid';
    haikus.forEach((h, i) => grid.appendChild(buildCard(h, i * 80)));

    gallery.innerHTML = '';
    gallery.appendChild(grid);
    document.body.classList.toggle('lang-ja', activeLang === 'ja');
  }

  /* ════════════════════════════════════════
     SEASON FILTER
  ════════════════════════════════════════ */
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSeason = btn.dataset.season;
      const filtered = activeSeason === 'All'
        ? allHaikus
        : allHaikus.filter(h => h.season === activeSeason);
      renderGallery(filtered);
    });
  });

  /* ════════════════════════════════════════
     LOAD JSON
  ════════════════════════════════════════ */
  async function loadHaikus() {
    const gallery = document.getElementById('gallery');
    try {
      const res = await fetch('./haiku.json');
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('haiku.json must contain a JSON array [ … ]');
      allHaikus = data;
      renderGallery(allHaikus);
    } catch (err) {
      console.error(err);
      gallery.innerHTML = `
        <div class="error-state">
          <div class="error-code">詠</div>
          <strong>Could not load poems</strong><br/>
          <span style="font-size:0.85rem;display:block;margin-top:0.6rem;">${esc(err.message)}</span>
          <span style="font-size:0.8rem;color:var(--muted);display:block;margin-top:0.8rem;">
            Make sure <code style="font-style:normal">haiku.json</code> sits next to
            <code style="font-style:normal">index.html</code> and you're serving via
            GitHub Pages or a local server (<code style="font-style:normal">npx serve .</code>).
          </span>
        </div>`;
    }
  }

  loadHaikus();
