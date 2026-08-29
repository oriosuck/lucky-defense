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
    // GameScreen이 등록하는 window 리스너(resize/pointermove/pointerup/pointercancel)는
    // 게임을 나간다고 저절로 사라지지 않는다 - destroy()로 명시적으로 떼어내지 않으면
    // 재시작할 때마다 계속 쌓여서 체감 랙의 원인이 된다(GameScreen.js의 destroy 주석
    // 참고). rAF 루프도 다음 프레임까지 기다리지 않고 여기서 바로 끊는다.
    onExit: () => {
      cancelAnimationFrame(rafId);
      screen.destroy();
      mountSelect();
    },
  });
  swapRoot(screen.root);
  screen.update(gameState); // root가 문서에 붙은 뒤에 첫 렌더링 - 스테이지 크기 실측이 정확히 되도록

  let lastTime = performance.now();
  let renderAccumulator = 0;
  let rafId = requestAnimationFrame(loop);

  // 탭이 백그라운드로 가면(다른 앱 전환, 화면 잠금 등) 브라우저가 requestAnimationFrame
  // 콜백 자체를 멈춰뒀다가, 탭이 다시 보이는 순간 재개한다 - 그 사이 실제로 몇 분/몇
  // 시간이 지났든 그대로 `now - lastTime`에 반영되므로, 복귀 직후 첫 프레임의
  // deltaSec가 그만큼 거대해진다. 이걸 그대로 tick()에 넘기면 웨이브 타이머가 한
  // 번에 몇 라운드씩 건너뛰거나 몬스터 수가 순간적으로 급변하는 등 상태가 한꺼번에
  // 왕창 튀어서, 마치 게임이 "멈췄다가 버벅거리며 몰아치는" 것처럼 보인다(사용자
  // 리포트 "버벅거리고 멈추고" 원인 후보 중 하나로 판단) - 프레임당 반영할 수 있는
  // 실제 경과시간에 상한을 둬서, 오래 자리를 비웠다 와도 그 시간만큼 게임이 밀린
  // 진행을 몰아서 처리하지 않고 그냥 잠깐 멈춰있던 것처럼 자연스럽게 이어지게 한다.
  const MAX_FRAME_DELTA_SEC = 1;

  function loop(now) {
    const realDeltaSec = Math.min((now - lastTime) / 1000, MAX_FRAME_DELTA_SEC);
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
