import { el } from './dom.js';
import {
  TAR_STAGE_IMAGES,
  DRAGON_DRAIN_IMAGE,
  ACE_BATMAN_TRANSFORM_IMAGES,
  IRON_MEYAONG_TRANSFORM_IMAGES,
  UI_IMAGES,
} from '../../data/assets.js';

// 필드에 배치된 개체(instance)의 상태에 따라 이미지가 달라지는 영웅 전용 처리.
// 그 외에는 heroDef.image(고정 초상화)를 그대로 사용한다.
export function resolveHeroImage(heroDef, instance) {
  if (heroDef.id === 'x_imp') return UI_IMAGES.impIcon; // 마마 임프 - heroes.js에는 image:null로만 등록됨
  if (instance) {
    if (heroDef.id === 'm_tar') return TAR_STAGE_IMAGES[instance.tarStage ?? 1];
    if (heroDef.id === 'm_dragon' && instance.immortalEligible) return DRAGON_DRAIN_IMAGE;
    // 에이스 배트맨(불멸) 전용 "모드 선택" - actions.js의 chooseBatmanMode()로 결정(한 번 정하면 고정).
    if (heroDef.id === 'i_ace_batman' && instance.batmanMode) return ACE_BATMAN_TRANSFORM_IMAGES[instance.batmanMode];
    // 아이언미야옹 1차/2차 변신 - actions.js의 advanceIronMeyaong()이 stage를 올린다
    // (stage 1 → transform1 이미지, stage 2 → transform2 이미지, 0은 기본 초상화).
    if (heroDef.id === 'm_iron_meyaong' && instance.meyaongTransformStage) {
      return IRON_MEYAONG_TRANSFORM_IMAGES[instance.meyaongTransformStage - 1];
    }
  }
  return heroDef.image;
}

export function heroImage(heroDef, { className = '', instance = null, src = null, style = null } = {}) {
  const img = el('img', {
    class: `hero-image ${className}`.trim(),
    src: src ?? resolveHeroImage(heroDef, instance),
    alt: heroDef.name,
    ...(style ? { style } : {}),
  });
  // <img>는 기본적으로 브라우저 네이티브 드래그(HTML5 Drag and Drop)가 켜져 있어서,
  // 필드 칸 드래그 이동 제스처(GameScreen.js의 pointermove 핸들러)를 마우스다운 직후
  // 가로채 버린다 - 네이티브 드래그가 시작되면 이후 pointermove가 더 이상 안 들어와서
  // 칸을 아무리 옮겨도 첫 좌표에서 멈춘 것처럼 보이는 버그의 원인이었다.
  img.draggable = false;
  return img;
}
