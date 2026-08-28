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
  screen.update(gameState); // root가 문서에 붙은 뒤에 첫 렌더링 - 스테이지 크기 실측이 정확히 되도록

  let lastTime = performance.now();
  let renderAccumulator = 0;
  let rafId = requestAnimationFrame(loop);

  function loop(now) {
    const realDeltaSec = (now - lastTime) / 1000;
    lastTime = now;

    // tick()은 내부적으로 structuredClone(state)를 9번 연쇄 호출하는데(각 로직 단계별 불변
    // 업데이트), 예전엔 이걸 매 rAF 프레임(초당 최대 60회, 클론 540회/초)마다 돌리고 있었다 -
    // 화면은 RENDER_INTERVAL_SEC(0.2초)마다만 갱신되니 그 사이의 tick 결과는 어차피 안 보이는데
    // 불필요하게 자주 클론하고 있었던 것. 클릭 반응이 느리다는 피드백의 원인으로 보여, 렌더링과
    // 같은 주기로 묶어서 클론 횟수를 45회/초로 줄였다(값 누적으로 시뮬레이션 결과 자체는 동일).
    if (!gameState.paused && !gameState.result) {
      renderAccumulator += realDeltaSec;
      if (renderAccumulator >= RENDER_INTERVAL_SEC) {
        const elapsedSec = renderAccumulator;
        renderAccumulator = 0;
        gameState = tick(gameState, elapsedSec * gameState.speed);
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
