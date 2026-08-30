import { createGameState } from './state/gameState.js';
import { tick } from './logic/gameLoop.js';
import { HeroSelectScreen } from './ui/HeroSelectScreen.js';
import { GameScreen } from './ui/GameScreen.js';

const appEl = document.getElementById('app');

// 더블탭 확대 방지 - CSS touch-action:manipulation(main.css `*` 규칙)만으로는
// 배경(보스 위/빈 전장 칸/하늘 부분처럼 클릭 핸들러가 없는 영역)에서 여전히
// 더블탭 확대가 재현된다는 사용자 리포트를 받았다. 예전에 모든 touchend에
// preventDefault를 걸었다가 버튼 연타가 통째로 막히는 회귀가 났었는데(PR #43),
// 그건 preventDefault가 브라우저의 click 합성까지 취소시켜서였다 - 이 프로젝트의
// 필드 칸 선택/드래그는 click이 아니라 pointerdown/pointerup을 직접 쓰고
// (pointerup은 touchend보다 먼저 끝나므로 나중에 touchend를 막아도 영향 없음),
// 버튼만 onclick(click 이벤트)에 의존한다. 그래서 버튼과 팝업 배경
// 클릭(.popup-overlay, 미션 팝업 닫기용)만 제외하고, 그 외 모든 영역(필드 배경,
// 빈 칸, 보스, 하늘 등)에서는 같은 지점을 짧은 간격(300ms) 안에 두 번 건드리면
// 더블탭으로 보고 그 확대만 막는다.
//
// **재발 원인(사용자가 "진짜 어떻게 못해?"라고 재차 지적)**: "같은 지점"을 처음엔
// `e.target`(DOM 노드 그 자체) 동일성으로 판정했는데, 이 게임은 0.2초마다
// `root.innerHTML=''`로 전체 DOM을 다시 그리는 구조라(CLAUDE.md에 반복 등장하는
// 함정 - 몬스터 이동/공격 모션/궁 게이지 등 전부 같은 원인으로 깨졌었다) 필드 위의
// 캐릭터/칸/보스 같은 요소는 화면상 같은 위치라도 두 번째 탭 시점엔 이미 완전히
// 새로운 노드로 교체돼 있는 경우가 흔하다 - 그러면 `lastBgTouchEnd.target ===
// e.target`이 항상 false가 되어 더블탭 판정 자체가 무력화된다("배경(비클릭 영역)"
// 항목처럼 클릭 핸들러가 없어 재렌더가 드문 영역에서만 우연히 잘 통과됐을 뿐, 필드
// 위에서는 사실상 거의 항상 실패하고 있었다). DOM 노드가 아니라 **터치 좌표**로
// "같은 지점"을 판정하도록 바꿨다 - 좌표는 노드가 재생성돼도 그대로라 이 재렌더
// 구조와 완전히 무관해진다(래핑 컨테이너를 새로 만드는 것보다 이 편이 더 근본적인
// 해결책 - 컨테이너를 만들어도 그 안의 노드 정체성 문제 자체는 그대로 남는다).
const DOUBLE_TAP_POS_TOLERANCE_PX = 24;
let lastBgTouchEnd = { time: 0, x: 0, y: 0 };
document.addEventListener('touchend', (e) => {
  if (e.target.closest('button, .popup-overlay')) {
    lastBgTouchEnd = { time: 0, x: 0, y: 0 };
    return;
  }
  const touch = e.changedTouches[0];
  const now = Date.now();
  const withinTime = now - lastBgTouchEnd.time <= 300;
  const withinPos = touch
    && Math.abs(touch.clientX - lastBgTouchEnd.x) <= DOUBLE_TAP_POS_TOLERANCE_PX
    && Math.abs(touch.clientY - lastBgTouchEnd.y) <= DOUBLE_TAP_POS_TOLERANCE_PX;
  if (withinTime && withinPos) {
    e.preventDefault();
  }
  lastBgTouchEnd = { time: now, x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
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
