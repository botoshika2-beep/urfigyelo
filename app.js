const $ = (id) => document.getElementById(id);
const intro = $('intro'), game = $('game'), startButton = $('start-button');
const camera = $('camera'), cameraButton = $('camera-button');
const gameMessage = $('game-message'), alertOverlay = $('alert-overlay'), returnOverlay = $('return-overlay');
const gameCard = $('game-card'), systemStatus = $('system-status');
let detector, stream, cameraOn = false, faceVisible = false, gameStarted = false, paused = false;
let state = 'idle', stateUntil = 0, lastFaceSeenAt = 0, watchAbsentUntil = 0, watchFoundSince = 0, watchAbsentId, round = 0, elapsedStart = 0, pausedAt = 0, timerId, faceCheckId, clockId, rafId;
let soundOn = true, audioContext, faceScriptPromise, detectingFrame = false, activeTwist = null, doubleStage = false;

function loadFaceDetectionScript() {
  if (window.FaceDetection) return Promise.resolve();
  if (!faceScriptPromise) {
    faceScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.0/face_detection.js';
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => { faceScriptPromise = null; reject(new Error('Nem sikerült betölteni az arcfelismerőt. Ellenőrizd az internetkapcsolatot.')); };
      document.head.appendChild(script);
    });
  }
  return faceScriptPromise;
}

function status(text) { $('face-status').textContent = text; }
function difficulty() {
  const step = round - 1;
  const extra = Math.max(0, round - 4);
  return {
    hide: Math.max(1700, 3000 - step * 100 - extra * 70),
    return: Math.max(2300, 4000 - step * 90 - extra * 90),
    wait: Math.max(800, 3200 - step * 100 - extra * 150) + Math.random() * Math.max(700, 4000 - step * 100 - extra * 140)
  };
}
function showState(next) {
  if (next !== 'watch' && watchAbsentId) { clearInterval(watchAbsentId); watchAbsentId = null; watchAbsentUntil = 0; watchFoundSince = 0; }
  state = next;
  gameMessage.classList.toggle('hidden', next !== 'idle' && next !== 'watch');
  alertOverlay.classList.toggle('hidden', next !== 'hide' && next !== 'fake');
  returnOverlay.classList.toggle('hidden', next !== 'return');
  gameCard.classList.toggle('danger', next === 'hide');
  gameCard.classList.toggle('fake', next === 'fake');
  alertOverlay.classList.toggle('fake', next === 'fake');
  if (next === 'hide') {
    $('alert-label').textContent = 'VESZÉLYES ÉSZLELÉS'; $('alert-title').textContent = 'BÚJJ EL!'; $('countdown-hint').textContent = 'MÁSODPERCED MARADT';
  } else if (next === 'fake') {
    $('alert-label').textContent = 'HAMIS JELZÉS'; $('alert-title').textContent = 'NE BÚJJ EL!'; $('countdown-hint').textContent = 'MARADJ LÁTHATÓ!';
  } else if (next === 'idle') {
    $('game-title').textContent = 'Készen állsz?';
    $('game-message').querySelector('h3').innerHTML = 'AZ ŰR MÉG<br><span>NYUGODT.</span>';
    $('game-message').querySelector('p').textContent = 'Tartsd szemmel a jelzést.';
  } else if (next === 'watch') {
    $('game-message').querySelector('h3').innerHTML = 'AZ ŰR MÉG<br><span>NYUGODT.</span>';
    $('game-message').querySelector('p').textContent = 'Jól csinálod. Maradj készenlétben.';
  }
}

function beep(freq = 620, duration = .12) {
  if (!soundOn) return;
  try {
    audioContext ||= new AudioContext();
    const osc = audioContext.createOscillator(), gain = audioContext.createGain();
    osc.type = 'sine'; osc.frequency.value = freq; gain.gain.value = .055;
    osc.connect(gain); gain.connect(audioContext.destination); osc.start();
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration); osc.stop(audioContext.currentTime + duration);
  } catch {}
}

function selectTwist() {
  if (round < 3 || Math.random() > Math.min(.75, .32 + round * .04)) return null;
  if (round >= 7 && Math.random() < .1) return 'bonus';
  const twists = round >= 5 ? ['fake', 'urgent', 'double', 'echo', 'rush'] : ['fake', 'urgent', 'double'];
  return twists[Math.floor(Math.random() * twists.length)];
}
function beginRound() {
  if (!gameStarted || paused || state === 'over') return;
  round++; activeTwist = selectTwist(); doubleStage = false;
  $('round-count').textContent = String(round).padStart(2, '0');
  $('game-title').textContent = round === 1 ? 'Figyeld az űrt.' : `Következik a ${round}. szint.`;
  showState('watch');
  timerId = setTimeout(() => {
    if (!gameStarted || paused) return;
    if (activeTwist === 'fake') beginFakeAlarm();
    else if (activeTwist === 'echo') beginEchoAlarm();
    else beginHideWindow();
  }, difficulty().wait);
}
function startCountdown(which, duration, onEnd) {
  stateUntil = performance.now() + duration;
  const update = () => {
    if (paused || state !== which) return;
    const remaining = Math.max(0, Math.ceil((stateUntil - performance.now()) / 1000));
    $(which === 'return' ? 'return-number' : 'countdown').textContent = remaining;
    if (remaining <= 0) { clearInterval(timerId); onEnd(); }
  };
  update(); timerId = setInterval(update, 70);
}
function beginHideWindow() {
  if (!gameStarted) return;
  const hideDuration = activeTwist === 'rush' ? Math.max(1800, difficulty().hide * .78) : difficulty().hide;
  showState('hide');
  if (activeTwist === 'rush') {
    $('alert-label').textContent = 'VILLÁMRIASZTÁS'; $('alert-title').textContent = 'AZONNAL BÚJJ EL!';
    $('countdown-hint').textContent = 'CSAK 2 MP-ED VAN ELTŰNNI';
  }
  $('countdown').textContent = Math.ceil(hideDuration / 1000); beep(270, .18);
  startCountdown('hide', hideDuration, () => {
    if (faceVisible) { finish(false, 'Nem bújtál el időben. Az űr meglátta az arcod.'); return; }
    beginReturnWindow();
  });
}
function beginFakeAlarm() {
  showState('fake'); $('countdown').textContent = '3'; beep(540, .13);
  startCountdown('fake', 2600, () => {
    if (!faceVisible) finish(false, 'Bedőltél a hamis riasztásnak! Az őrszem csak próbára tett.');
    else nextLevel('Ügyes, nem dőltél be!');
  });
}
function beginEchoAlarm() {
  showState('fake'); $('alert-label').textContent = 'ELŐJELZÉS'; $('alert-title').textContent = 'VISSZHANGRIASZTÁS!';
  $('countdown-hint').textContent = 'MARADJ LÁTHATÓ, EZ MÉG NEM AZ!'; $('countdown').textContent = '2'; beep(540, .13);
  startCountdown('fake', 2100, () => beginHideWindow());
}
function beginReturnWindow() {
  showState('return');
  const urgent = activeTwist === 'urgent';
  const bonus = activeTwist === 'bonus';
  const duration = urgent ? Math.max(1800, difficulty().return * .72) : difficulty().return + (bonus ? 1500 : 0);
  $('return-icon').textContent = urgent ? '⌃' : '⌁';
  $('return-label').textContent = urgent ? 'AZ ŐRSZEM LEMENT!' : bonus ? 'BÓNUSZ LÉGZSILIP!' : 'A JEL ELTŰNT';
  $('return-hint').textContent = urgent ? 'MENJ FEL VAGY NEM ÉLED TÚL!' : bonus ? 'MOST 1,5 MP-CEL TÖBB IDŐD VAN' : 'TÚL SOKÁIG NE MARADJ ODA LENT';
  if (faceVisible) lastFaceSeenAt = performance.now();
  beep(450, .12);
  startCountdown('return', duration, () => finish(false, 'Vesztettél! Túl lementél az űrbe!'));
  const checkFace = () => {
    if (paused || state !== 'return') return;
    if (faceVisible) {
      clearInterval(timerId); clearInterval(faceCheckId); faceCheckId = null;
      if (activeTwist === 'double' && !doubleStage) {
        doubleStage = true; showState('watch'); $('game-title').textContent = 'Kettős riasztás! Még egyszer bújj el!';
        timerId = setTimeout(beginHideWindow, 900);
      } else nextLevel('Megmenekültél.');
    }
  };
  faceCheckId = setInterval(checkFace, 70);
}
function nextLevel(message) {
  if (!gameStarted) return;
  clearInterval(timerId); showState('watch'); $('game-title').textContent = message;
  timerId = setTimeout(beginRound, 1100);
}

async function startCamera() {
  if (cameraOn) { if (!gameStarted) startGame(); return; }
  intro.classList.add('hidden'); game.classList.remove('hidden'); cameraButton.disabled = true; startButton.disabled = true;
  $('camera-help').textContent = 'A kamera engedélyét kérjük…';
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('A kamera csak biztonságos kapcsolaton (HTTPS vagy localhost) használható.');
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    $('camera-help').textContent = 'Arcfelismerő betöltése…'; await loadFaceDetectionScript();
    detector = new window.FaceDetection({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.0/${file}` });
    detector.setOptions({ model: 'short', minDetectionConfidence: .58, selfieMode: true });
    detector.onResults((results) => {
      const found = results.detections?.length > 0; faceVisible = found;
      $('face-outline').classList.toggle('hidden', !found); if (found) lastFaceSeenAt = performance.now();
      status(found ? 'ARC LÁTHATÓ' : 'NEM LÁT AZ ŐRSZEM');
      if (gameStarted && state === 'watch') {
        if (found) {
          if (watchAbsentId) {
            if (!watchFoundSince) watchFoundSince = performance.now();
            if (performance.now() - watchFoundSince >= 600) {
              clearInterval(watchAbsentId); watchAbsentId = null; watchAbsentUntil = 0; watchFoundSince = 0;
              returnOverlay.classList.add('hidden');
            }
          }
        } else {
          watchFoundSince = 0;
          if (!watchAbsentId) {
            watchAbsentUntil = performance.now() + 4000;
            $('return-icon').textContent = '!';
            $('return-label').textContent = 'AZ ŐRSZEM NEM LÁT';
            $('return-hint').textContent = 'GYERE VISSZA 4 MP-EN BELÜL';
            $('return-number').textContent = '4';
            returnOverlay.classList.remove('hidden');
            watchAbsentId = setInterval(() => {
              if (!gameStarted || state !== 'watch' || paused || faceVisible) return;
              $('return-number').textContent = String(Math.max(0, Math.ceil((watchAbsentUntil - performance.now()) / 1000)));
              if (performance.now() >= watchAbsentUntil) {
                clearInterval(watchAbsentId); watchAbsentId = null;
                finish(false, 'Vesztettél! Négy másodperce nem lát az őrszem, pedig az űr még nyugodt volt.');
              }
            }, 70);
          }
        }
      }
      if (state === 'fake' && !found) { clearInterval(timerId); finish(false, 'Bedőltél a hamis riasztásnak! Az őrszem csak próbára tett.'); }
    });
    camera.srcObject = stream; await camera.play(); cameraOn = true; startButton.disabled = false;
    $('camera-placeholder').classList.add('hidden'); $('camera-help').textContent = 'Arcészlelés aktív ezen az eszközön.';
    cameraButton.textContent = 'Kamera bekapcsolva ✓'; cameraButton.disabled = true; status('ARCFELISMERÉS AKTÍV'); $('face-outline').classList.remove('hidden');
    if (!gameStarted) startGame(); detectLoop();
  } catch (err) {
    console.error(err); if (stream) stream.getTracks().forEach(track => track.stop()); stream = null;
    cameraButton.disabled = false; startButton.disabled = false;
    $('camera-help').textContent = err.name === 'NotAllowedError' ? 'Engedélyezd a kamerát a böngészőben.' : (err.message || 'Nem sikerült elindítani a kamerát.'); $('camera-help').style.color = '#ff8894';
  }
}
function detectLoop() {
  if (!cameraOn || !detector) return;
  if (camera.readyState >= 2 && !detectingFrame) {
    detectingFrame = true;
    detector.send({ image: camera }).catch((err) => console.warn('Arcészlelési hiba:', err)).finally(() => { detectingFrame = false; if (cameraOn) rafId = requestAnimationFrame(detectLoop); }); return;
  }
  rafId = requestAnimationFrame(detectLoop);
}
function startGame() {
  if (gameStarted) return;
  gameStarted = true; paused = false; round = 0; elapsedStart = Date.now(); activeTwist = null; doubleStage = false;
  intro.classList.add('hidden'); game.classList.remove('hidden'); $('game-controls').classList.remove('hidden');
  systemStatus.textContent = 'AZ ŐRSZEM AKTÍV'; showState('watch'); beginRound(); $('pause-button').textContent = 'Ⅱ   Szünet'; clearInterval(clockId);
  clockId = setInterval(() => { if (!gameStarted || paused) return; const s = Math.floor((Date.now() - elapsedStart) / 1000); $('elapsed').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 500);
}
function finish(won, message) {
  if (!gameStarted) return;
  gameStarted = false; state = 'over'; clearTimeout(timerId); clearInterval(timerId); clearInterval(faceCheckId); faceCheckId = null; clearInterval(watchAbsentId); watchAbsentId = null; clearInterval(clockId);
  systemStatus.textContent = won ? 'KÜLDETÉS TELJESÍTVE' : 'KÜLDETÉS MEGSZAKÍTVA';
  $('result-symbol').textContent = won ? '✦' : '✳'; $('result-title').textContent = won ? 'Megmenekültél!' : 'Vesztettél!';
  $('result-copy').textContent = message || 'Eljutottál a küldetés végéig. Az űr most elenged.';
  $('result-modal').classList.remove('hidden'); beep(won ? 820 : 170, .34);
}
function reset() {
  clearTimeout(timerId); clearInterval(timerId); clearInterval(faceCheckId); faceCheckId = null; clearInterval(watchAbsentId); watchAbsentId = null; watchAbsentUntil = 0; watchFoundSince = 0; clearInterval(clockId); gameStarted = false; paused = false; faceVisible = false; round = 0; activeTwist = null;
  $('result-modal').classList.add('hidden'); $('game-controls').classList.add('hidden'); game.classList.add('hidden'); intro.classList.remove('hidden');
  systemStatus.textContent = cameraOn ? 'ARCFELISMERÉS AKTÍV' : 'RENDSZER KÉSZENLÉTBEN'; $('round-count').textContent = '01'; $('elapsed').textContent = '00:00'; status(cameraOn ? 'NEM LÁT AZ ŐRSZEM' : 'KAMERA KIKAPCSOLVA'); showState('idle');
}
startButton.addEventListener('click', startCamera);
cameraButton.addEventListener('click', startCamera);
$('pause-button').addEventListener('click', () => {
  if (!gameStarted) return;
  paused = !paused; gameCard.classList.toggle('paused', paused); $('pause-button').textContent = paused ? '▶   Folytatás' : 'Ⅱ   Szünet';
  if (paused) pausedAt = performance.now();
  else {
    if (state === 'hide' || state === 'fake' || state === 'return') stateUntil += performance.now() - pausedAt;
    if (state === 'watch' && watchAbsentUntil) watchAbsentUntil += performance.now() - pausedAt;
    if (state === 'watch') { clearTimeout(timerId); timerId = setTimeout(beginRound, 700); }
  }
});
$('restart-button').addEventListener('click', () => { reset(); startGame(); });
$('play-again').addEventListener('click', () => { reset(); if (cameraOn) startGame(); else { intro.classList.add('hidden'); game.classList.remove('hidden'); $('game-controls').classList.remove('hidden'); } });
$('close-result').addEventListener('click', reset);
$('sound-button').addEventListener('click', () => { soundOn = !soundOn; $('sound-button').innerHTML = soundOn ? '♫ <span>HANG</span>' : '♪ <span>NÉMÍT</span>'; });
window.addEventListener('pagehide', () => { cancelAnimationFrame(rafId); stream?.getTracks().forEach(track => track.stop()); detector?.close?.(); });
