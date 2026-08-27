import { createGameState } from './state/gameState.js';
import { tick } from './logic/gameLoop.js';
import { HeroSelectScreen } from './ui/HeroSelectScreen.js';
import { GameScreen } from './ui/GameScreen.js';

const appEl = document.getElementById('app');

function swapRoot(node) {
  appEl.innerHTML = '';
  appEl.appendChild(node);
}

function mountSelect() {
  swapRoot(HeroSelectScreen({ onStart: mountGame }));
}

const RENDER_INTERVAL_SEC = 0.2; // 매 tick마다 렌더링하지 않고 일정 간격으로만 갱신(재렌더링 최소화)

function mountGame(config) {
  let gameState = createGameState(config);
  const screen = GameScreen({
    getState: () => gameState,
    dispatch(next) {
      gameState = next;
      screen.update(gameState);
    },
    onExit: mountSelect,
  });
  swapRoot(screen.root);

  let lastTime = performance.now();
  let renderAccumulator = 0;
  let rafId = requestAnimationFrame(loop);

  function loop(now) {
    const realDeltaSec = (now - lastTime) / 1000;
    lastTime = now;

    if (!gameState.paused && !gameState.result) {
      gameState = tick(gameState, realDeltaSec * gameState.speed);
      renderAccumulator += realDeltaSec;
      if (renderAccumulator >= RENDER_INTERVAL_SEC) {
        renderAccumulator = 0;
        screen.update(gameState);
      }
    }

    if (appEl.contains(screen.root)) {
      rafId = requestAnimationFrame(loop);
    } else {
      cancelAnimationFrame(rafId); // 화면 전환 시 루프 정리
    }
  }
}

mountSelect();
