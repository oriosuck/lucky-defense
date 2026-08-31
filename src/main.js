import { createGameState } from './state/gameState.js';
import { tick } from './logic/gameLoop.js';
import { HeroSelectScreen } from './ui/HeroSelectScreen.js';
import { GameScreen } from './ui/GameScreen.js';

const appEl = document.getElementById('app');

// 더블탭 확대 방지 - CSS touch-action:manipulation(main.css `*` 규칙, 사실상
// html/body/#app을 포함한 모든 요소에 이미 걸려 있다 - "html,body에만" 또는
// "#game 컨테이너에만"처럼 더 좁은 범위로 다시 걸어도 이미 걸려있는 `*` 규칙보다
// 넓어질 수 없어서 아무 효과가 없다)만으로는 여러 기기/브라우저 조합에서 여전히
// 재현된다는 사용자 리포트를 반복해서 받았다(CLAUDE.md에 이 문제로만 여러 라운드가
// 기록돼 있음 - viewport meta, touch-action 확장, touchend 기반 JS 방어선까지
// 전부 시도했었다). 예전에 모든 touchend에 preventDefault를 걸었다가 버튼 연타가
// 통째로 막히는 회귀가 났었는데(PR #43), 그건 preventDefault가 브라우저의 click
// 합성까지 취소시켜서였다 - 이 프로젝트의 필드 칸 선택/드래그는 click이 아니라
// pointerdown/pointerup을 직접 쓰므로(Pointer Events는 스펙상 touch의
// preventDefault 여부와 무관하게 항상 발생 - 아래 touchstart 전환의 근거) 버튼만
// onclick(click 이벤트)에 의존한다. 그래서 버튼과 팝업 배경 클릭(.popup-overlay,
// 미션 팝업 닫기용)만 제외하고, 그 외 모든 영역(필드 배경, 빈 칸, 보스, 하늘 등)
// 에서는 같은 지점(터치 좌표, ±24px 오차 허용 - DOM 노드가 0.2초마다 재생성되는
// 이 프로젝트 구조상 노드 동일성 비교는 무력화된다는 걸 이전 라운드에 확인함)을
// 짧은 간격(DOUBLE_TAP_WINDOW_MS) 안에 두 번 건드리면 더블탭으로 보고 그 확대만
// 막는다. **300ms는 너무 짧았다** - 사용자가 "빠르게 클릭할 때는 확대 안되는데
// 톡 톡 이렇게 좀 천천히 할 때 확장돼"라고 재지적했다 - 우리 판정 기준은 통과(더블탭
// 아님)했는데 브라우저 자체의 네이티브 더블탭-확대 인식 창은 그보다 더 넓어서, 그
// 사이 간격의 탭은 우리 코드는 막지 않고 브라우저는 확대로 처리하는 공백이 있었던
// 것 - 브라우저 쪽 실제 임계값을 확실히 알 수 없으니(기기/엔진마다 다름) 여유
// 있게 500ms로 늘렸다.
//
// **touchend에서 touchstart로 전환**: 좌표 기반으로 고친 뒤에도 "여전히 안 고쳐진다"는
// 재지적을 받았다 - touchend는 "손을 뗄 때" 발생하는데, 일부 브라우저는 그보다
// 이른 시점(두 번째 터치가 시작되는 순간, touchstart)에 이미 더블탭-확대 제스처를
// 확정 짓고 넘어가버려서 touchend에서 뒤늦게 preventDefault를 불러도 취소가 안 될
// 수 있다. 최대한 이른 시점에 막기 위해 touchstart로 옮겼다 - Pointer Events는
// touch의 preventDefault와 무관하게 독립적으로 발생하므로(스펙 - 앞 문단 참고),
// 이 프로젝트의 드래그/선택 로직(pointerdown/pointerup 기반)은 전혀 영향받지
// 않는다. 필드 위 요소는 여전히 대상이라 같은 칸을 빠르게 두 번 탭하면 두 번째
// 탭의 pointerdown 자체는 정상 발생하되(선택/드래그 시작은 그대로 동작) 브라우저의
// 확대 제스처만 취소된다.
// **미션 팝업 안에서 더블탭이 여전히 확대되던 버그**: `.popup-overlay`는 미션
// 팝업의 배경 클릭 시 닫히는 로직(onclick, `e.target===e.currentTarget`으로
// "배경 자체"만 판정)을 이미 갖고 있어서 그 배경 요소 자체는 우리 preventDefault가
// 그 클릭 합성을 취소하지 않게 예외로 둬야 했다. 그런데 예외 판정을 `e.target.
// closest('.popup-overlay')`로 했더니, `.closest()`는 조상까지 전부 훑으므로
// 미션 목록/텍스트 등 그 배경 **안에 든 모든 내용물**까지 통째로 "배경 클릭"과
// 똑같이 취급돼 더블탭 방지 대상에서 빠져버렸다 - 사용자 리포트("미션 팝업이
// 뜰 때... 더블클릭하면 또 커져")의 원인. 배경 요소 자체인지는 `.closest()`가
// 아니라 `classList.contains()`로 정확히 그 노드인지만 확인하도록 좁혀서, 팝업
// 배경을 직접 눌렀을 때만 예외로 남고 팝업 안의 콘텐츠는 다시 보호 대상이 되게
// 했다(버튼은 자식 아이콘 등을 눌러도 버튼으로 쳐야 하므로 `closest()` 그대로 유지).
const DOUBLE_TAP_POS_TOLERANCE_PX = 24;
const DOUBLE_TAP_WINDOW_MS = 500;

// 좌표+시간 기반 더블탭 판정을 touchstart/pointerdown 양쪽에서 공유하는 헬퍼 -
// `lastState`는 호출부가 각자 독립적으로 들고 있는 { time, x, y } 객체(터치와
// 펜을 같은 상태로 섞어 추적하면 안 됨 - 아래 pointerdown 블록 참고). 더블탭으로
// 판정되면 true를 반환할 뿐 preventDefault는 호출부 책임으로 남긴다(이벤트
// 종류마다 e가 다르므로).
function isDoubleTap(lastState, x, y) {
  const now = Date.now();
  const withinTime = now - lastState.time <= DOUBLE_TAP_WINDOW_MS;
  const withinPos = Math.abs(x - lastState.x) <= DOUBLE_TAP_POS_TOLERANCE_PX
    && Math.abs(y - lastState.y) <= DOUBLE_TAP_POS_TOLERANCE_PX;
  const result = withinTime && withinPos;
  lastState.time = now;
  lastState.x = x;
  lastState.y = y;
  return result;
}

// **버그: "판매버튼 연속으로 누르다 배경같은 다른곳 눌리면 확대돼"** - 예전엔 버튼을
// 탭하면 추적 상태(lastBgTouchStart)를 {time:0,x:0,y:0}으로 완전히 초기화했다.
// 그런데 브라우저의 네이티브 더블탭-확대 인식은 "이전 탭이 버튼이었는지 배경이었는지"를
// 전혀 구분하지 않고 순수하게 화면 좌표/시간만 본다 - 버튼을 눌렀다가 바로 다음
// 탭이 그 근처 배경(칸이 재배치되거나 손가락이 살짝 빗나간 경우 등)에 떨어지면,
// 브라우저 입장에선 명백한 더블탭인데도 우리 추적 상태는 직전 버튼 탭 때 이미
// 리셋돼 있어서(시간이 0이라 항상 "허용 창을 벗어남"으로 판정) 이 배경 탭에
// preventDefault를 걸지 못했다 - 지금까지 리포트받은 "더블탭 확대"의 상당수가
// 사실 이 경로였을 가능성이 높다. 수정: 탭이 버튼/팝업배경 위였든 아니든 추적
// 상태는 항상 갱신한다(isDoubleTap을 무조건 호출) - "이 탭에서 preventDefault를
// 실제로 부를지"만 대상 요소로 갈라서, 지금 이 탭이 버튼/팝업배경이면 여전히
// 건너뛴다(버튼 클릭 반응성 보존, PR #43과 동일한 이유). 이러면 버튼→배경/
// 배경→버튼/버튼→버튼/배경→배경 네 조합 전부 정확한 이전 탭 위치와 비교되고,
// 실제로 막아야 하는 건 "지금 탭이 버튼이 아닌 경우"뿐이라 회귀 없이 해결된다.
let lastBgTouchStart = { time: 0, x: 0, y: 0 };
document.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  if (!touch) return;
  const wasDoubleTap = isDoubleTap(lastBgTouchStart, touch.clientX, touch.clientY);
  const isExcluded = e.target.closest('button') || e.target.classList?.contains('popup-overlay');
  if (wasDoubleTap && !isExcluded) {
    e.preventDefault();
  }
}, { passive: false });

// 사용자가 찾아준 예시 코드 중 "손가락 2개 이상이 닿으면 무조건 preventDefault"
// (touchstart의 `event.touches.length > 1`) 부분 - 핀치줌은 지금까지 이 프로젝트가
// 한 번도 막은 적이 없던 별개의 제스처다(위 로직은 한 손가락 더블탭만 본다).
// 이 게임은 한 손가락 탭/드래그만으로 조작하도록 설계돼 있어서(두 손가락 이상이
// 동시에 닿는 정상적인 조작 자체가 없음) 무조건 막아도 부작용이 없다 - 같은
// 예시 코드의 나머지 절반(touchend 기반 300ms 더블탭 판정)은 넣지 않았다,
// 아래 참고.
document.addEventListener('touchstart', (e) => {
  if (e.touches.length > 1) {
    e.preventDefault();
  }
}, { passive: false });

// 같은 예시 코드에 같이 있던 touchend 기반 더블탭 판정("이전 touchend로부터
// 300ms 이내면 preventDefault")은 **의도적으로 넣지 않았다** - 이 프로젝트가
// 예전에 정확히 이 방식(touchend + 고정 시간창 + 무조건 preventDefault)을 썼다가
// 실제로 겪은 회귀였다(PR #43 - 이 파일 아래 다른 주석 참고): touchend에서
// preventDefault를 부르면 그 터치가 합성하는 click 이벤트 자체가 취소되는데,
// 이 게임은 소환 버튼처럼 빠르게 연속으로 두 번 이상 누르는 게 정상 조작인
// 곳이 많아서 "300ms 안의 두 번째 탭"이 전부 걸려 두 번째 클릭이 씹혔다 -
// 사용자가 "빠르게 연타하는게 안돼"라고 리포트해서 되돌렸다. touchend는 손을
// 뗄 때 발생해서 일부 브라우저가 그보다 이른 touchstart 시점에 이미 확대
// 여부를 결정해버리는 문제도 있어 지금은 touchstart 기반으로 이미 옮겨져
// 있다(위 lastBgTouchStart 블록). 같은 실패를 반복하지 않기 위해 이 절반은
// 빼고 손가락 2개 이상 감지 부분만 반영했다.

// 애플펜슬로만 재현되고 손가락으로는 재현이 안 된다는 사용자 리포트를 받았다 -
// 이건 지금까지의 "iOS가 전반적으로 예방을 무시한다"는 가설보다 훨씬 구체적인
// 단서다. iPadOS Safari에서 애플펜슬 입력은 Touch 객체의 `touchType`이
// `'stylus'`(손가락은 `'direct'')로 구분되는데, WebKit이 정밀한 드로잉 앱 호환을
// 위해 펜 입력에는 손가락과 다른 제스처 인식 경로를 타는 경우가 실제로 보고돼
// 있다 - `touch-action` CSS나 `touchstart`의 `preventDefault()`가 손가락에는
// 먹히면서 펜에는 그 효과가 약하거나 아예 안 먹힐 수 있다는 뜻이다(이 프로젝트
// 안에서는 검증할 방법이 없다 - 실기기 애플펜슬이 필요). 순수 Touch Events
// 경로가 펜에는 안 먹힐 가능성에 대비해, 별도의 이벤트 모델인 Pointer Events로
// 같은 더블탭 판정을 한 번 더 건다 - `pointerdown`의 `pointerType==='pen'`만
// 골라서 처리하므로 손가락(터치)이나 마우스는 위 touchstart 경로와 전혀
// 겹치지 않는다(별도의 lastState로 추적 - 펜과 손가락을 같은 타이머로 섞으면
// "펜으로 한 번, 손가락으로 한 번"처럼 서로 다른 입력 수단의 탭이 더블탭으로
// 잘못 묶일 수 있다).
// 위 touchstart 블록과 같은 이유로(버튼 탭이 추적 상태를 지우면 그 다음 배경 탭을
// 놓친다) 여기도 추적은 항상 하고 preventDefault만 대상으로 가른다.
let lastPenPointerDown = { time: 0, x: 0, y: 0 };
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'pen') return;
  const wasDoubleTap = isDoubleTap(lastPenPointerDown, e.clientX, e.clientY);
  const isExcluded = e.target.closest('button') || e.target.classList?.contains('popup-overlay');
  if (wasDoubleTap && !isExcluded) {
    e.preventDefault();
  }
});

// 사용자가 `gesturestart`에 `preventDefault()`를 걸어보라고 제안해서 추가했다.
// **주의**: `gesturestart`/`gesturechange`/`gestureend`는 Safari 전용 이벤트로,
// 두 손가락으로 하는 핀치 확대/축소·회전 제스처가 시작될 때만 발생한다 - 한
// 손가락으로 같은 자리를 빠르게 두 번 두드리는 더블탭-확대 제스처에는 애초에
// 발생하지 않는 별개의 이벤트다(MDN/WebKit 문서 기준). 즉 이걸 막아도 지금
// 리포트받고 있는 더블탭 확대 자체는 못 잡을 가능성이 높다 - 그래도 핀치
// 확대까지 막아두면 사용자가 "더블탭"이라고 부르는 것 중 일부가 실은 두 손가락
// 제스처였을 가능성까지 커버할 수 있고, 부작용 없이 추가할 수 있는 안전한
// 방어선이라 요청대로 넣었다.
document.addEventListener('gesturestart', (e) => {
  e.preventDefault();
});

// 위 touchstart 기반 "예방"은 헤드리스 Chromium 테스트로는 항상 정상 동작하는
// 것까지 확인했는데(등록된 리스너가 실제로 두 번째 탭에서 preventDefault를
// 거는 것까지 재현) 사용자가 "언제 어디서나, 기능 자체가 안 된다"고 재차
// 리포트했다 - 이 정도로 전면적이면 특정 요소/타이밍의 버그가 아니라 iOS
// 자체의 한계일 가능성이 높다: `user-scalable=no`는 iOS가 접근성 이유로 여러
// 버전째 무시하는 게 잘 알려진 사실이고, 더블탭-확대 제스처 인식 자체가 WebKit
// 네이티브 레벨(JS 이벤트 흐름보다 앞/밖)에서 이뤄지는 경우가 있어 touchstart의
// preventDefault만으로는 근본적으로 막지 못할 수 있다 - 지금까지 이 프로젝트가
// 시도한 모든 방법(viewport meta, touch-action, touchend→touchstart 전환, 좌표
// 기반 판정)이 전부 "예방"이었는데, 그 예방 계층 자체가 iOS에서 뚫릴 수 있다면
// 아무리 다듬어도 한계가 있다. 그래서 예방과는 다른 계층의 안전망을 추가한다 -
// "확대가 이미 일어났다면 그 즉시 원래 배율로 되돌리는" 사후 교정. `visualViewport.
// scale`이 1을 넘는 순간(더블탭이든 핀치든 원인 무관하게) viewport meta의
// user-scalable 값을 yes→no로 한 프레임 안에 토글해서 WebKit이 뷰포트 제약을
// 강제로 다시 계산하게 만든다(널리 알려진 트릭 - 단순히 같은 문자열로
// setAttribute만 다시 불러서는 재적용이 안 되는 경우가 있어 실제로 값을
// 바꿨다가 되돌리는 방식을 쓴다). 이러면 확대 자체를 막지는 못해도 사용자가
// 체감하기엔 아주 짧게 튀었다가 즉시 원래 크기로 돌아오는 정도로 완화된다 -
// "확대된 채로 고정돼서 게임을 계속 못 하는" 최악의 경우를 막는 최후의 방어선.
if (window.visualViewport) {
  const viewportMeta = document.querySelector('meta[name="viewport"]');
  let resetting = false;
  window.visualViewport.addEventListener('resize', () => {
    if (!viewportMeta || resetting || window.visualViewport.scale <= 1.01) return;
    resetting = true;
    viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes');
    requestAnimationFrame(() => {
      viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
      resetting = false;
    });
  });
}

// "게임 시작 후(필드 화면)에서 크롬 창 자체에 세로 스크롤바가 생긴다"는 리포트를
// 받고 스크린샷을 확인했다 - 화면 위쪽(WAVE 배지/몬스터 카운트 바)이 통째로 잘려서
// 안 보이고 라운드 종료 카운트다운 배지가 화면 맨 위 가장자리에 살짝 걸쳐 잘린
// 채로만 보였다. `html,body`에 이미 `overflow:hidden + position:fixed`를 걸어뒀는데도
// (위 "모바일 페이지 스크롤/바운스 고정" 섹션 참고 - 그동안 잘 막아왔다) 이번엔
// 페이지 자체가 스크롤된 것처럼 보인다 - 브라우저 주소창이 늘어나 있는(스크린샷
// 상단에 URL 입력창이 전체 펼쳐진 상태) 순간의 스크린샷이라, 모바일 브라우저의
// 주소창 펼침/접힘이 `position:fixed + inset:0`인 body를 "레이아웃 뷰포트"(주소창이
// 접혔을 때 기준의 더 큰 뷰포트) 기준으로 고정시키는 유명한 함정과 맞아떨어진다 -
// 주소창이 펼쳐져 실제 보이는 영역(비주얼 뷰포트)이 줄어들면 `position:fixed`
// 요소가 그 차이만큼 아래로 밀려나 위쪽이 화면 밖으로 나가고, 그 상태에서
// 브라우저가 페이지를 실제로 살짝 스크롤시켜버리는 조합이 이 문제를 만드는
// 것으로 보인다. `overflow:hidden`만으로는(이 프로젝트에서 계속 그래왔듯) 특정
// 모바일 브라우저에서 완전히 막히지 않을 수 있으니, 예방과 별개로 "혹시 스크롤이
// 됐다면 즉시 (0,0)으로 되돌리는" 사후 교정을 하나 더 건다(위 visualViewport
// 확대 되돌림과 같은 계열의 안전망) - 주소창 펼침/접힘으로 뷰포트가 바뀔 때마다
// 발생하는 `visualViewport.resize`, 그리고 만에 하나 실제로 스크롤이 발생하면
// 곧바로 잡아내는 `window.scroll` 이벤트 둘 다에 건다. 이 페이지엔 의도된 window/
// document 스크롤이 전혀 없으므로(있는 스크롤은 전부 `.hero-select-screen`/
// `.mission-list`처럼 특정 자식 요소 내부 스크롤) 조건 없이 무조건 (0,0)으로
// 되돌려도 정상 조작을 방해하지 않는다.
function resetPageScroll() {
  if (window.scrollX !== 0 || window.scrollY !== 0) {
    window.scrollTo(0, 0);
  }
}
window.addEventListener('load', resetPageScroll);
window.addEventListener('scroll', resetPageScroll, { passive: true });
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resetPageScroll);
}

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
