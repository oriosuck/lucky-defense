import { el } from './dom.js';
import { TAR_STAGE_IMAGES, DRAGON_DRAIN_IMAGE, UI_IMAGES } from '../../data/assets.js';

// 필드에 배치된 개체(instance)의 상태에 따라 이미지가 달라지는 영웅 전용 처리.
// 그 외에는 heroDef.image(고정 초상화)를 그대로 사용한다.
export function resolveHeroImage(heroDef, instance) {
  if (heroDef.id === 'x_imp') return UI_IMAGES.impIcon; // 마마 임프 - heroes.js에는 image:null로만 등록됨
  if (instance) {
    if (heroDef.id === 'm_tar') return TAR_STAGE_IMAGES[instance.tarStage ?? 1];
    if (heroDef.id === 'm_dragon' && instance.immortalEligible) return DRAGON_DRAIN_IMAGE;
  }
  return heroDef.image;
}

export function heroImage(heroDef, { className = '', instance = null, src = null } = {}) {
  const img = el('img', {
    class: `hero-image ${className}`.trim(),
    src: src ?? resolveHeroImage(heroDef, instance),
    alt: heroDef.name,
  });
  // <img>는 기본적으로 브라우저 네이티브 드래그(HTML5 Drag and Drop)가 켜져 있어서,
  // 필드 칸 드래그 이동 제스처(GameScreen.js의 pointermove 핸들러)를 마우스다운 직후
  // 가로채 버린다 - 네이티브 드래그가 시작되면 이후 pointermove가 더 이상 안 들어와서
  // 칸을 아무리 옮겨도 첫 좌표에서 멈춘 것처럼 보이는 버그의 원인이었다.
  img.draggable = false;
  return img;
}
