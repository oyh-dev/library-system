/**
 * 日期与逾期相关工具函数。
 * 这一层被单测覆盖得最密 —— 因为日期计算最容易出错。
 */

/** 把 ISO 时间串格式化成 YYYY-MM-DD，非法输入返回 '--' */
export function formatDate(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 两个时间相差的天数（向下取整，可为负） */
export function daysBetween(fromIso, toIso) {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86400000);
}

/**
 * 计算借阅状态。
 * @returns {{ code: 'returned'|'overdue'|'due-soon'|'normal', label: string, days: number }}
 */
export function lendStatus(lend, nowIso = new Date().toISOString()) {
  if (lend.returnedAt) {
    return { code: 'returned', label: '已归还', days: 0 };
  }
  const left = daysBetween(nowIso, lend.dueAt);
  if (left < 0) return { code: 'overdue', label: `已逾期 ${-left} 天`, days: left };
  if (left <= 3) return { code: 'due-soon', label: `还有 ${left} 天到期`, days: left };
  return { code: 'normal', label: `还有 ${left} 天`, days: left };
}

/** 借阅上限的展示文案 */
export function quotaText(active, max) {
  const used = Math.max(0, Number(active) || 0);
  const cap = Number(max) || 0;
  return `${used} / ${cap}`;
}

/** 可借副本的展示文案与状态 */
export function availabilityText(available, total) {
  const a = Number(available) || 0;
  const t = Number(total) || 0;
  if (a <= 0) return { text: '暂无可借', tone: 'danger' };
  if (a <= 1) return { text: `仅剩 ${a} 本`, tone: 'warn' };
  return { text: `可借 ${a} / ${t}`, tone: 'ok' };
}

/** 关键词高亮：把匹配部分包成 <mark>，返回片段数组 */
export function highlightParts(text, keyword) {
  const src = String(text ?? '');
  const kw = String(keyword ?? '').trim();
  if (!kw) return [{ text: src, hit: false }];
  const parts = [];
  let rest = src;
  let idx = rest.toLowerCase().indexOf(kw.toLowerCase());
  while (idx !== -1) {
    if (idx > 0) parts.push({ text: rest.slice(0, idx), hit: false });
    parts.push({ text: rest.slice(idx, idx + kw.length), hit: true });
    rest = rest.slice(idx + kw.length);
    idx = rest.toLowerCase().indexOf(kw.toLowerCase());
  }
  if (rest) parts.push({ text: rest, hit: false });
  return parts;
}
