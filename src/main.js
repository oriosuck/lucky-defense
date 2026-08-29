import { createGameState } from './state/gameState.js';
import { tick } from './logic/gameLoop.js';
import { HeroSelectScreen } from './ui/HeroSelectScreen.js';
import { GameScreen } from './ui/GameScreen.js';

const appEl = document.getElementById('app');

// 더블탭 확대 방지의 최종 방어선(JS 레벨) - 뷰포트 meta(user-scalable=no)와 CSS의
// `touch-action:manipulation`(main.css `*` 규칙)을 이미 걸어뒀는데도 태블릿에서
// 여전히 더블탭하면 화면이 확대된다는 재지적을 받았다(user-scalable=no는 iOS가
// 접근성 이유로 여러 버전째 무시하고 있고, touch-action도 기기/브라우저에 따라
// double-tap-to-zoom 제스처 인식 자체를 완전히 못 막는 경우가 있다). 연속된
// touchend 사이 간격이 짧으면(더블탭으로 판정, 300ms) 그 두 번째 touchend의
// 기본 동작(확대)을 직접 막는 고전적인 방식을 추가한다 - preventDefault는 그
// 제스처의 확대 판정만 막을 뿐 각 터치의 click 이벤트는 그대로 발생하므로, 버튼을
// 빠르게 두 번 눌러 두 번의 독립된 클릭으로 처리되던 기존 동작엔 영향이 없다.
// `{ passive: false }`가 필수 - 없으면 preventDefault가 무시된다.
let lastTouchEndAt = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEndAt <= 300) {
    e.preventDefault();
  }
  lastTouchEndAt = now;
}, { passive: false });

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
