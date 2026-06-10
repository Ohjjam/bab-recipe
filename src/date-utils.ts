// 'YYYY-MM-DD' 문자열을 로컬 타임존 기준으로 계산.
// new Date('YYYY-MM-DD')는 UTC 자정으로 파싱되어 KST에서는 D-day가 하루 밀리는 버그가 있어
// 반드시 연/월/일을 분해해 로컬 Date로 만들어야 한다.
export function daysUntilLocal(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, (m || 1) - 1, d || 1).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / (1000 * 60 * 60 * 24));
}
