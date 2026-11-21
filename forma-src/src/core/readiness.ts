/**
 * Две разные оценки:
 *  1) проверка геометрии — размеры, пересечения, движение, отверстия в пределах деталей (ядро программы);
 *  2) готовность к изготовлению — хватает ли данных фурнитуры, чтобы сформировать всю присадку, и подтвердил ли технолог.
 * «Готово к изготовлению» ставится только при отсутствии блокирующих замечаний И подтверждении технолога
 * для конфигурации с тем же кодом (configHash).
 */
import type { ManufacturingModel, Project, Check } from './schema';
import { HW } from './hardware';

export type Issue = {
  level: 'block' | 'warn';
  title: string;
  part?: string;        // детали (ID через запятую)
  joint?: string;       // соединение
  missing: string[];    // каких данных не хватает
  ops: string[];        // какие операции присадки не сформированы / требуют подтверждения
};
export type Readiness = {
  geometryOk: boolean; geometryErrors: Check[];
  issues: Issue[]; blockers: number;
  approved: boolean; approvalStale: boolean;
  status: 'geometry-errors' | 'needs-data' | 'awaiting-approval' | 'ready';
  label: string;
};

/** Что не формируется в присадке для соединения данного вида. */
const OPS: Record<string, (parts: string[]) => string[]> = {
  slide: p => [`Отверстия крепления направляющих на ${p.slice(2).join(', ')} (корпус)`, `Отверстия крепления направляющих на ${p.slice(0, 2).join(', ')} (короб ящика)`],
  hinge: p => [`Отверстия ответных планок петель на ${p[1]}`],
  leg: p => [`Отверстия крепления опор на ${p[0]}`],
  push: p => [`Отверстие/посадка толкателя на ${p[0]}`],
  handle: p => [`Отверстия ручки: длина винта и резьба ручки — по паспорту выбранной ручки (${p[0]})`],
  rod: p => [`Отверстия штангодержателей на ${p.slice(1).join(', ')}`],
  wall: () => ['Крепление к стене — подбор анкеров по основанию стены'],
  foot: p => [`Посадка регулируемых опор цоколя (${p.join(', ')})`],
  glide: p => [`Подпятники на ${p[0]}`],
  weld: () => ['Чертёж металлокаркаса у металлиста'],
  screw: p => [`Крепёж ${p.join(', ')}`],
  glue: () => ['Клей и держатели зеркала — по инструкции производителя клея'],
  'bed-bolt': p => [`Отверстия кроватных стяжек (${p.join(', ')})`],
};

export function readiness(m: ManufacturingModel, approval?: Project['approval']): Readiness {
  const geometryErrors = m.checks.filter(c => c.level === 'error');
  const issues: Issue[] = [];
  for (const e of geometryErrors) issues.push({ level: 'block', title: `${e.area}: ${e.msg}`, part: e.part, joint: e.joint, missing: e.fix ? [e.fix] : [], ops: [] });
  for (const j of m.joints) {
    const prof = j.hardware.map(h => HW[h.id]).filter(Boolean);
    const miss = [...new Set(prof.filter(p => p.status !== 'verified').flatMap(p => p.missing))];
    if (j.status === 'unverified') issues.push({ level: 'block', title: j.title, part: j.parts.join(', '), joint: j.id, missing: miss.length ? miss : ['модель и схема крепления фурнитуры'], ops: (OPS[j.kind] || (() => ['Присадка этого соединения не сформирована']))(j.parts) });
    else if (j.status === 'partial') issues.push({ level: 'warn', title: j.title, part: j.parts.join(', '), joint: j.id, missing: miss, ops: j.kind === 'confirmat' ? ['Глубина отверстия в торце — правило программы, подтвердить по документации'] : (OPS[j.kind]?.(j.parts) || []) });
  }
  const st = m.stability;
  if (st && st.need && !st.antiTip) issues.push({ level: st.okEmpty === false ? 'block' : 'warn', title: 'Устойчивость: крепление от опрокидывания не предусмотрено', part: 'BK, T1', missing: ['тип крепления к стене (уголок/ремень) и основание стены'], ops: ['Отверстия крепления от опрокидывания в задней стенке/крыше — не сформированы'] });
  const blockers = issues.filter(i => i.level === 'block').length;
  const approvalStale = !!approval && approval.hash !== m.configHash;
  const approved = !!approval && !approvalStale && !blockers;
  const status: Readiness['status'] = geometryErrors.length ? 'geometry-errors' : blockers ? 'needs-data' : approved ? 'ready' : 'awaiting-approval';
  const label = {
    'geometry-errors': 'ЭСКИЗ · ЕСТЬ ОШИБКИ ГЕОМЕТРИИ — НЕ ДЛЯ ИЗГОТОВЛЕНИЯ',
    'needs-data': `ЭСКИЗ · НЕ ХВАТАЕТ ДАННЫХ ФУРНИТУРЫ (${blockers}) — НЕ ДЛЯ ИЗГОТОВЛЕНИЯ`,
    'awaiting-approval': 'ЭСКИЗ · ЖДЁТ ПОДТВЕРЖДЕНИЯ ТЕХНОЛОГА',
    ready: `ГОТОВО К ИЗГОТОВЛЕНИЮ · подтвердил ${approval?.by || ''}`,
  }[status];
  return { geometryOk: !geometryErrors.length, geometryErrors, issues, blockers, approved, approvalStale, status, label };
}
