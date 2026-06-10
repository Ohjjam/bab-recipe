// HTML 이스케이프 공용 유틸.
// 텍스트 노드뿐 아니라 value="..." / data-*="..." 같은 속성 컨텍스트에서도 안전하도록
// 따옴표까지 치환한다. (기존 div.textContent 방식은 따옴표를 통과시켜
// 재료 이름에 "가 들어가면 속성이 조기 종료되어 글자가 잘려 보이고,
// 그 상태로 저장하면 데이터가 영구 훼손되는 버그가 있었음)
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
