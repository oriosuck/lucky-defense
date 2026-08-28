# 인수인계 메모 (Claude용)

새 세션에서 이 프로젝트를 이어받았다면 이 문서부터 읽을 것. 실제 사양은
`길드레이드_연습게임_기획서_v4.md`/`길드레이드_연습게임_기술설계서_v2.md`가 최신 원본이다
(파일명에 버전이 없는 것/v2·v3는 이전 버전이니 내용이 충돌하면 번호가 가장 큰 쪽을 따를 것).
여기는 "코드만 봐서는 안 보이는 것들" — 삽질 이력, 자산 매핑, 이 저장소 특유의
워크플로우 함정 — 을 정리한 것이다.

## 프로젝트 개요

서버/DB/로그인 없는 정적 SPA (Vite + Vanilla JS). 배포는 Vercel, `main` 브랜치를
추적해서 merge될 때마다 자동 재배포된다. 사용자는 개발자가 아니고, UI를
실제 게임 스크린샷/직접 만든 에셋과 비교하며 매우 꼼꼼하게 피드백을 준다.

## 이미지 없이 진행한 구조 리팩토링 (기획서_v4/기술설계서_v2 반영)

이 리팩토링에서 이미지 렌더링을 전부 걷어내고 등급별 단색 블록 + 이름 텍스트로
임시 표시하도록 바꿨다(`src/ui/components/heroPlaceholder.js`의 `heroPlaceholder()`/
`placeholderBlock()`). **`src/data/heroes.js`의 `image` 필드, `src/data/assets.js`의
모든 매핑(STAGE_LAYOUT 포함)은 삭제하지 않고 그대로 남겨뒀다** — 나중에 이미지를 다시
붙일 때는 `heroPlaceholder`/`placeholderBlock` 호출부만 `<img>`로 교체하면 된다.
`GameScreen.js`의 `sizeStageToFit()`(688:1508 비율 유지)은 배경 이미지가 없어도 구조를
그대로 살려뒀으니 이것도 되돌리지 말 것.

같은 리팩토링에서 신/구 기획서 차이를 반영해 로직도 같이 정리했다:
- **유물 시스템 제거**: 모든 유물이 항상 맥스(11레벨) 고정이라는 확정 사항에 따라
  `src/data/relics.js`(레벨별 가변 함수)를 삭제하고 `src/data/constants.js`(고정 상수)로
  대체했다. 영웅 선택 화면의 유물 레벨 select UI도 제거.
- **영웅 "보유" 개념 제거**: 모든 영웅이 기본 보유 상태라는 확정 사항에 따라
  `HeroSelectScreen`의 자물쇠/보유 토글을 없앴다. `ownedHeroes` → `heroSettings`로
  이름을 바꿨고(신화 등급의 즐겨찾기/불멸 체크만 저장), `GameState.heroSettings`도 동일하게
  개명했다.
- **이동불능 이벤트 재작성**: 예전 코드는 2/4/5/7/9라운드에 고정으로 발동했는데, 확정된
  기획서는 "게임당 정확히 2회(1~9라운드 중 1회 + 11~19라운드 중 1회), 즉시형/게이지형 랜덤"이다.
  `createGameState()`가 게임 시작 시 두 라운드를 미리 뽑아 `eventLog.immobilizeRounds`에
  저장해두고, `waveEvents.js`의 `handleImmobilizeEvent`가 이를 소비한다.
- **삭제 공격 버그 수정**: 예전 코드는 `gameType`과 무관하게 13/20라운드마다 무조건
  삭제 이벤트를 발동시켰다(삭제 없는 버전에서도 발동하던 버그). `onWaveStart()`에서
  `gameType === 'delete'`일 때만 이벤트를 생성하도록 고쳤다.
- **보스 레이드 창 신규 구현**: 10/20라운드에서 몬스터가 0마리가 된 시점부터 지연시간
  (기본 4초 + 마마/베인/로카 중 필드에 없는 영웅 1명당 +5초)을 세는
  `tickBossRaidWindow()`를 추가했다. 보스 자리 아래에 "레이드 창 열림!"/"몬스터 소탕 대기 중"
  배지로 표시.
- **몬스터 등장 방식 변경**: 초당 트리클 증가 방식에서 "매 라운드 시작 시 40마리 일괄 등장"
  (`MONSTER_PER_ROUND`)으로 바꿨다. 처치(초당 2마리, 필드에 영웅 1마리 이상일 때)는
  여전히 확정 수치가 없는 플레이스홀더라 그대로 유지.
- **라운드 종료 보상 공식 정리**: `applyRoundEndReward()`(기술설계서 4장 의사코드 그대로)로
  0→1라운드는 `FIRST_WAVE_SUBSIDY`(2284) 고정, 그 외에는 `보유골드×10% + 6010` +
  행운석 고정 +5.
- **신화 버튼 배지 버그 수정**: "현재 소환 가능한 영웅 개수"라는 기획 문구와 달리 예전
  코드는 `ownedHeroes`에 등록된 신화 개수를 표시했다. `synthesis.js`의
  `craftableMythicCount()`(재료가 필드에 다 모인 신화 수를 실시간 계산)로 교체했다.

이 다섯 가지 로직 변경은 이미지와 무관하게 신/구 기획서 차이 자체를 반영한 것이니,
이미지를 다시 붙이는 작업과 섞어서 되돌리지 않도록 주의할 것.

## ⚠️ 가장 중요한 워크플로우 함정: PR이 생각보다 빨리 merge된다

이 세션 동안 **세 번**, 커밋을 브랜치(`claude/game-system-architecture-kawhq6`)에
푸시한 뒤 다음 응답을 준비하는 사이에 사용자가 이미 그 PR을 merge해버린 상태를
발견했다. 이 브랜치에 그대로 새 커밋을 얹어 푸시하면 **어떤 열린 PR에도 속하지
않는 유령 커밋**이 되어 사용자 화면에 절대 반영되지 않는다("반영이 안 되어있어"
라는 피드백의 원인이었음).

**작업을 시작하기 전에 항상:**
```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD && echo ok || echo "브랜치 새로 파야 함"
```
`ok`가 아니면:
```bash
git stash push -u   # 진행 중이던 변경사항이 있으면
git checkout -B claude/game-system-architecture-kawhq6 origin/main
git stash pop
```
그 다음 새로 커밋 → 푸시 → **새 PR**을 연다(머지된 PR은 후속 커밋을 추적하지
않으므로 PR 번호가 계속 올라간다 — 현재 #6까지 merge됨). 브랜치 이름 자체는
계속 재사용한다(작업 지시서에 고정된 이름).

## 이미지 자산 매핑 (실측/육안 확인 완료분)

### 영웅 초상화 (`public/heroes/*.webp`, `src/data/heroes.js`의 `imagePath()`)

사용자가 준 zip의 파일명은 영문 코드명이라 한글 영웅명과 1:1로 안 맞는 경우가
있었다. 아래는 헷갈렸다가 사용자가 직접 정정해준 것들 (전부 반영 완료):

| 한글 영웅명 | 신화 파일 | 불멸 파일 | 비고 |
|---|---|---|---|
| 지지 | `zap.webp` | `geniewiz.png`(i_archmage_gigi) | 처음엔 `birdraw`로 착각 |
| 골라조 | `birdraw.webp` | `immobirdraw.webp` | 지지 때문에 한 번 잘못 뺏겼다가 원위치 |
| 우치 | `lazytaoist.webp` | `azuralazytaoist.webp` | 초나와 서로 뒤바뀌어 있었음 |
| 초나 | `verdee.webp` | `evergreenverdee.webp` | 우치와 서로 뒤바뀌어 있었음 |

**변신 모습이 따로 있는 영웅** (선택 패널에 보조 썸네일로 같이 표시):
- 드래곤(`m_dragon`): 승급 준비되면(`immortalEligible`) 필드 토큰이
  `m_dragon_drain.webp`(드레인 형태)로 바뀜.
- 개구리왕자/사신개구리: `FROG_TRANSFORM_IMAGES`에 `m_frog_prince_transform.webp`
  (kingdian 유래), `i_death_frog_transform.webp`(immoreaperdian 유래) 등록됨.
  둘 다 선택 패널에서 원본 이미지 옆에 "변신 모습"으로 같이 보여줌.
- 군체 타르(`m_tar`): 1~3단계 그래픽 별도 존재(`TAR_STAGE_IMAGES`). "동족포식"
  버튼(`cannibalizeTar`)으로 다른 타르를 흡수하면 `instance.tarStage`가 오르고
  이미지가 바뀜. 3단계 도달이 불멸 승급 조건.

**안 쓰인 여분 파일** (`public/heroes/extra/`): `herobomba.webp`,
`immobatmanhitter.webp`, `immobatmanpitcher.webp`, `ironmeowv2.webp`,
`ironmeowv3.webp`, `overclockedrocketchu.webp`. 용도 확인 안 된 상태로 보관만
해둠 — 사용자가 언급하면 그때 연결.

### UI 버튼/바 (`public/ui/*.webp`, `src/data/assets.js`의 `UI_IMAGES`)

`신화 보는 버튼.png`, `룰렛 팝업 여는 버튼.png`, `소환 버튼.png`,
`강화 버튼.png`, `룰렛 배경.png`, `희귀/영웅/전설 룰렛.png`(원형 배지, 가격
표시 칸까지 그림에 포함됨), `재화 바.png`, `몬스터 카운트 바.png`,
`라운드 카운트 배경.png`, `2배 켰을/안켰을 때.png`, `해골 이미지.png` 전부
매핑 완료.

**함정**: `몬스터 카운트 바`와 `2배 안켰을 때` 두 장만 배경이 완전 불투명
흰색으로 채워져 있었다(나머지는 정상 투명). 단순 알파 스레숄드로는 안 지워져서
**모서리부터 flood-fill로 흰 배경만 제거**했다(스켈레톤 얼굴의 크림색처럼
그림 안쪽에 있는 흰색은 안 건드림). 새로 받는 이미지가 이상하게 나오면
먼저 모서리 픽셀 alpha를 찍어봐서 진짜 투명인지 확인할 것.

### 배경 (`public/bg/background.jpg`, 688×1508)

`src/data/assets.js`의 `STAGE_LAYOUT`이 실측 좌표(%). 핵심 교훈: 원본에
검은 테두리로 그려져 있던 사각형은 **보스 자리가 아니라 전장(4x6칸) 자리**였다
(6x4 칸 비율과 정확히 일치해서 뒤늦게 알아챔). 보스는 그 위 빈 하늘 공간에
배치. 좌우 굴(몬스터 스폰 위치)은 전장 박스 바로 위 모서리에 있어서, 몬스터
이동 애니메이션은 전장 박스 아래로 돌아나가는 ㄷ자 경로로 되어 있음
(`@keyframes monster-travel`, `main.css`).

## CSS/레이아웃에서 배운 것

1. **배경 이미지 비율 유지는 JS로 실측해서 픽셀로 박아라.** `.game-stage`를
   `aspect-ratio + width:auto + max-width`(또는 `height:100%`) 조합만으로
   맞추려 했더니, 뷰포트 가로세로 비율에 따라 한쪽만 클램프되고 반대쪽은
   그대로 남아 배경이 눌려 보이는 경우가 있었다. 지금은
   `GameScreen.js`의 `sizeStageToFit()`이 `game-stage-wrap`의 실제 크기를
   재서 688:1508 비율을 유지하는 width/height를 인라인 px로 직접 지정하고,
   `window resize`에도 재계산한다. **이 방식을 다시 순수 CSS로 되돌리지 말 것**
   — 같은 버그가 재발한다.
2. **flex row에서 `height:100%; aspect-ratio:X`로 고정폭 형제가 여럿 있으면
   `flex:1` 형제가 폭 0으로 찌그러질 수 있다** (고정폭들의 높이 기준 폭 합이
   행의 실제 너비를 넘으면). 신화/룰렛 버튼을 `width:%` 기준으로 바꿔서 해결함
   (`.mythic-btn-img`, `.roulette-btn-img`).
3. 게임 화면 전체(`#app`의 padding 포함)는 `100dvh`에 맞춰 스크롤 없이 한
   화면에 들어오게 되어 있다 (`.game-screen { height: calc(100dvh - 24px); }`).
4. 재화 바/신화·소환·룰렛·강화 버튼/즐겨찾기 즉시소환 아이콘은 전부 별도
   패널이 아니라 **`.game-stage` 안의 절대좌표 오버레이**로 배경 art 위에
   직접 얹혀 있다. 선택된 영웅 패널(`selected-panel`)도 마찬가지로, 영웅을
   선택했을 때만 보스 위에 카드로 떠서 보이는 오버레이다(상시 노출 아님,
   의도된 설계).

## 기획서를 다시 읽고서야 발견한 버그

**즐겨찾기 "즉시소환" 아이콘**: 처음엔 사전 선택한 즐겨찾기 영웅을 전부
보여주고, 클릭하면 필드에 있는 개체를 (0,0)으로 옮기는 걸로 구현했었다.
기획서 원문("카드 내 별표 클릭 → 즐겨찾기로 표시... **조합 완료 시** 좌측
최상단에 소환 버튼 노출")을 다시 읽고서야, 이게 "즐겨찾기 등록 + 이번 판에서
**실제로 조합을 완료한 적 있는** 신화 영웅에만 나타나는, 새로 무료로
즉시소환하는 전용 버튼"이라는 걸 알았다. `state.unlockedInstantSummons`
(craftMythic 성공 시에만 등록) + `instantSummonFavorite()`로 고침. **UI
동작을 짤 때 기획서 문장을 표면적으로만 읽지 말고, 괄호 안 부연설명까지
정확히 볼 것.**

## 아직 안 끝난 것 / 다음에 손볼 만한 것

- `public/heroes/extra/`의 여분 이미지들 — 용도 확인 필요.
- `src/logic/immortal.js`: 27개 불멸 승급 조건 중 고유 소모/미니게임 로직이
  실제로 구현된 건 `m_frog_prince`, `m_mama`, `m_ninja`, `m_chona`, `m_gigi`,
  `m_tar`, `m_lancelot` 정도고, 나머지는 "진행도만 목표 도달하면 승급"하는
  제네릭 폴백이다. `IMMORTAL_CONDITIONS`(`heroes.js`)에 데이터는 다 있으니
  필요하면 `promotionHandlers`에 채워 넣으면 됨.
- 판매 보상 골드/보석 수치, 몬스터 누적 곡선, 강화 비용은 정식 밸런스 수치가
  없어서 플레이스홀더 값 그대로다 (코드 내 주석에 표시돼 있음).
- `public/heroes/extra`의 batman hitter/pitcher, ironmeow v2/v3,
  overclockedrocketchu 등은 강화 단계별 스킨이나 액션 프레임일 가능성이
  있는데 아직 안 물어봄.

## 빌드/확인 방법

```bash
npm install
npm run build
npx vite preview --port <아무포트> --strictPort
```
레이아웃 변경할 때마다 Playwright로 최소 2~3개 뷰포트 비율(좁은 폰/넓은
화면/정사각형에 가까운 화면)에서 스크린샷 찍어 직접 눈으로 확인할 것 —
이 프로젝트에서 실제로 뷰포트별로 다르게 깨진 버그가 있었다.
