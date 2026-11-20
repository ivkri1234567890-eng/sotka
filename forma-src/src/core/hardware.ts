/**
 * Каталог HardwareProfile. Статус:
 *  verified — все параметры отверстий взяты из документации производителя;
 *  partial  — часть параметров из документации, остальное — правило программы (помечено в карте присадки);
 *  unverified — данных нет: отверстия НЕ формируются, в документах — «Требует проверки».
 * Позиции крепежа на детали (отступы, шаг) — конструктивные правила программы, а не данные производителя.
 */
export type HoleSpec = { d: number; depth: number | 'through' | 'by-length'; source: 'doc' | 'rule'; note: string };
export type HardwareProfile = {
  id: string; name: string; maker: string; article: string; purpose: string;
  unit: 'шт' | 'компл' | 'пара' | 'м';
  materials: string; thickness: string;
  mounting: string;                // монтажные размеры, словами
  holes: Record<string, HoleSpec>; // схема отверстий
  limits: string;
  source: string; sourceDate: string;
  status: 'verified' | 'partial' | 'unverified';
  missing: string[];               // чего не хватает для статуса verified
  massG?: number;
};

export const HW: Record<string, HardwareProfile> = {
  confirmat: {
    id: 'confirmat', name: 'Конфирмат 7×50', maker: 'Häfele', article: '264.42.190', purpose: 'Соединение корпусных деталей «пласть в торец»', unit: 'шт',
    materials: 'ЛДСП, МДФ, фанера, щит', thickness: 'присоединяемая деталь 16–19 мм',
    mounting: 'Сквозное отверстие в пласти Ø7, глухое в торце Ø5 (ступенчатое сверло Häfele 001.22.485: Ø5 / Ø7 / зенковка Ø10).',
    holes: {
      face: { d: 7, depth: 'through', source: 'doc', note: 'Ø7 — ступень сверла 001.22.485' },
      edge: { d: 5, depth: 'by-length', source: 'rule', note: 'Ø5 — документ; глубина = 50 − толщина пласти + 3 мм — правило программы' },
    },
    limits: 'Головка видна снаружи — закрывается заглушкой. Расстояние от края детали ≥ 50 мм и шаг ≤ 300 мм — правило программы.',
    source: 'hafele.com, артикул 264.42.190 («for drill hole Ø 5 mm»); каталог Häfele 001.22.485 (Ø5/Ø7/Ø10)', sourceDate: '2026-11-20',
    status: 'partial', missing: ['глубина отверстия в торце по документации', 'минимальное расстояние от края по документации'], massG: 8,
  },
  'shelf-pin': {
    id: 'shelf-pin', name: 'Полкодержатель Ø5', maker: '—', article: 'не выбран', purpose: 'Опора съёмной полки', unit: 'шт',
    materials: 'любая плита', thickness: 'от 16 мм', mounting: 'Отверстие Ø5 в пласти боковины.',
    holes: { face: { d: 5, depth: 10, source: 'rule', note: 'Ø5 × 10 — правило программы, сверить с выбранной моделью' } },
    limits: 'Несущая способность зависит от модели — не рассчитывается.', source: 'нет', sourceDate: '—',
    status: 'partial', missing: ['модель и артикул', 'глубина отверстия по документации', 'допустимая нагрузка'], massG: 3,
  },
  'hinge-blum': {
    id: 'hinge-blum', name: 'Петля Blum CLIP top BLUMOTION 110°, INSERTA', maker: 'Blum', article: '71B3590',
    purpose: 'Распашной накладной фасад', unit: 'шт',
    materials: 'фасады МДФ, ЛДСП, шпон', thickness: 'фасад 16–22 мм',
    mounting: 'Чашка Ø35, глубина 13 мм; расстояние от края фасада до чашки K = 3…7 мм (принято 5). Крепёжные отверстия Ø8 через 45 мм со смещением 9,5 мм.',
    holes: {
      cup: { d: 35, depth: 13, source: 'doc', note: 'Ø35 × 13, K = 5 мм (допуск 3…7 по документу)' },
    },
    limits: 'Количество петель по высоте фасада — правило программы (до 900 мм — 2; до 1600 — 3; до 2000 — 4; выше — 5). Ответная планка и её присадка на боковине не определены.',
    source: 'Технические данные Blum 71B3590 (Würth Louis and Company, datasheet B71B359)', sourceDate: '2026-11-20',
    status: 'partial', missing: ['направление смещения отверстий Ø8 (45/9,5) относительно края', 'ответная планка: артикул и присадка на боковине', 'накладка фасада для выбранной планки'], massG: 95,
  },
  'hinge-plate': {
    id: 'hinge-plate', name: 'Ответная планка для петли Blum', maker: 'Blum', article: 'не выбран', purpose: 'Крепление петли к боковине', unit: 'шт',
    materials: '', thickness: '', mounting: 'Не определена.', holes: {}, limits: 'Присадка не формируется.', source: 'нет', sourceDate: '—',
    status: 'unverified', missing: ['артикул планки', 'схема отверстий', 'расстояние от переднего края'], massG: 20,
  },
  slide: {
    id: 'slide', name: 'Направляющие шариковые полного выдвижения (пара)', maker: 'не выбран', article: 'по длине', purpose: 'Выдвижной ящик', unit: 'пара',
    materials: 'короб ЛДСП/фанера', thickness: '—', mounting: 'Зазор между коробом и боковиной 12,5 мм на сторону — правило программы, сверить с выбранной моделью.',
    holes: {}, limits: 'Отверстия под саморезы не формируются: нет проверенного профиля.', source: 'нет', sourceDate: '—',
    status: 'unverified', missing: ['производитель и артикул', 'боковой зазор по документации', 'схема крепления к корпусу и коробу', 'допустимая нагрузка'], massG: 900,
  },
  'push-open': {
    id: 'push-open', name: 'Толкатель push-to-open', maker: 'не выбран', article: '—', purpose: 'Открывание фасада нажатием', unit: 'шт',
    materials: '', thickness: '', mounting: 'Не определено.', holes: {}, limits: 'Место и способ установки не определены.', source: 'нет', sourceDate: '—',
    status: 'unverified', missing: ['модель', 'совместимость с петлёй/направляющими', 'схема установки'], massG: 40,
  },
  'screw-4x16': {
    id: 'screw-4x16', name: 'Саморез 4×16', maker: '—', article: '—', purpose: 'Крепление фурнитуры', unit: 'шт', materials: '', thickness: '', mounting: 'Без предварительного сверления или Ø2,5 — по месту.',
    holes: {}, limits: '', source: '—', sourceDate: '—', status: 'unverified', missing: [], massG: 1.5,
  },
  'screw-4x30': {
    id: 'screw-4x30', name: 'Саморез 4×30', maker: '—', article: '—', purpose: 'Крепление фасада ящика, столешницы', unit: 'шт', materials: '', thickness: '', mounting: 'По месту.',
    holes: {}, limits: '', source: '—', sourceDate: '—', status: 'unverified', missing: [], massG: 2.5,
  },
  'screw-4x25': {
    id: 'screw-4x25', name: 'Саморез 4×25', maker: '—', article: '—', purpose: 'Крепление столешницы', unit: 'шт', materials: '', thickness: '', mounting: 'По месту.',
    holes: {}, limits: '', source: '—', sourceDate: '—', status: 'unverified', missing: [], massG: 2,
  },
  'back-nail': {
    id: 'back-nail', name: 'Гвоздь/скоба для задней стенки', maker: '—', article: '—', purpose: 'Крепление задней стенки внакладку', unit: 'шт', materials: '', thickness: '', mounting: 'Шаг 150 мм — правило программы.',
    holes: {}, limits: '', source: '—', sourceDate: '—', status: 'unverified', missing: [], massG: 1,
  },
  'handle-screw': {
    id: 'handle-screw', name: 'Винт М4 для ручки', maker: '—', article: 'в комплекте ручки', purpose: 'Крепление ручки', unit: 'шт', materials: '', thickness: 'фасад 16–22',
    mounting: 'Сквозное отверстие в фасаде.', holes: { face: { d: 5, depth: 'through', source: 'rule', note: 'Ø5 сквозное — правило программы; сверить с ручкой' } },
    limits: '', source: '—', sourceDate: '—', status: 'partial', missing: ['модель ручки и длина винта'], massG: 2,
  },
  knob: { id: 'knob', name: 'Ручка-кнопка', maker: 'не выбран', article: '—', purpose: 'Ручка', unit: 'шт', materials: '', thickness: '', mounting: '1 винт М4', holes: {}, limits: '', source: '—', sourceDate: '—', status: 'unverified', missing: ['модель'], massG: 40 },
  bar: { id: 'bar', name: 'Ручка-скоба', maker: 'не выбран', article: '—', purpose: 'Ручка', unit: 'шт', materials: '', thickness: '', mounting: '2 винта М4, межцентровое по выбору', holes: {}, limits: '', source: '—', sourceDate: '—', status: 'unverified', missing: ['модель'], massG: 80 },
  'edge-profile': { id: 'edge-profile', name: 'Профиль-ручка накладной', maker: 'не выбран', article: '—', purpose: 'Ручка по верхней кромке фасада', unit: 'м', materials: '', thickness: '16–19', mounting: 'Саморезы с тыльной стороны', holes: {}, limits: '', source: '—', sourceDate: '—', status: 'unverified', missing: ['модель', 'шаг крепления'], massG: 400 },
  'leg-wood': { id: 'leg-wood', name: 'Ножка деревянная с монтажной пластиной', maker: 'не выбран', article: '—', purpose: 'Опора', unit: 'шт', materials: '', thickness: 'дно от 16 мм', mounting: 'Пластина на 4 самореза 4×16', holes: {}, limits: 'Нагрузка на ножку не проверяется.', source: '—', sourceDate: '—', status: 'unverified', missing: ['модель', 'допустимая нагрузка'], massG: 250 },
  'leg-metal': { id: 'leg-metal', name: 'Опора металлическая с пластиной', maker: 'не выбран', article: '—', purpose: 'Опора', unit: 'шт', materials: '', thickness: 'дно от 16 мм', mounting: 'Пластина на 4 самореза 4×16', holes: {}, limits: 'Нагрузка на опору не проверяется.', source: '—', sourceDate: '—', status: 'unverified', missing: ['модель', 'допустимая нагрузка'], massG: 300 },
  'plinth-foot': { id: 'plinth-foot', name: 'Регулируемая опора цоколя', maker: 'не выбран', article: '—', purpose: 'Выравнивание по полу', unit: 'шт', materials: '', thickness: '', mounting: 'В углы цоколя', holes: {}, limits: '', source: '—', sourceDate: '—', status: 'unverified', missing: ['модель'], massG: 60 },
  'rod-holder': { id: 'rod-holder', name: 'Штангодержатель Ø25', maker: 'не выбран', article: '—', purpose: 'Крепление штанги', unit: 'шт', materials: '', thickness: '', mounting: '2 самореза 4×16', holes: {}, limits: 'Нагрузка на штангу не рассчитывается.', source: '—', sourceDate: '—', status: 'unverified', missing: ['модель', 'нагрузка'], massG: 30 },
  'wall-hanger': { id: 'wall-hanger', name: 'Крепление подвесной мебели к стене', maker: 'не выбрано', article: '—', purpose: 'Подвес к стене', unit: 'компл', materials: '', thickness: '',
    mounting: 'Подбирается по основанию стены и массе с нагрузкой.', holes: {}, limits: 'Универсального крепления нет: ГКЛ — только с закладной, газобетон — специальные дюбели.', source: '—', sourceDate: '—',
    status: 'unverified', missing: ['тип основания стены', 'модель навеса и анкера', 'допустимая нагрузка'], massG: 300 },
  'frame-bolt': { id: 'frame-bolt', name: 'Саморез 4×25 для крепления к металлокаркасу', maker: '—', article: '—', purpose: 'Крепление корпуса к каркасу', unit: 'шт', materials: '', thickness: '', mounting: 'Через отверстия в полке каркаса', holes: {}, limits: '', source: '—', sourceDate: '—', status: 'unverified', missing: ['схема отверстий каркаса'], massG: 2 },
  'frame-glide': { id: 'frame-glide', name: 'Подпятник для трубы 20×20', maker: '—', article: '—', purpose: 'Защита пола', unit: 'шт', materials: '', thickness: '', mounting: 'Вставка в трубу', holes: {}, limits: '', source: '—', sourceDate: '—', status: 'unverified', missing: [], massG: 5 },
  glide: { id: 'glide', name: 'Подпятник (опора-подкладка)', maker: '—', article: '—', purpose: 'Защита пола у изделия без ножек', unit: 'шт', materials: '', thickness: 'дно от 16 мм', mounting: 'Набивается или прикручивается к дну', holes: {}, limits: '', source: '—', sourceDate: '—', status: 'unverified', missing: ['модель'], massG: 5 },
  'mirror-bracket': { id: 'mirror-bracket', name: 'Кронштейн крепления зеркального щита', maker: 'не выбран', article: '—', purpose: 'Крепление щита зеркала к корпусу трюмо', unit: 'шт', materials: '', thickness: '', mounting: 'Саморезы 4×16', holes: {}, limits: 'Устойчивость зеркала не рассчитывается.', source: '—', sourceDate: '—', status: 'unverified', missing: ['модель', 'допустимая нагрузка'], massG: 60 },
  'mirror-glue': { id: 'mirror-glue', name: 'Клей для зеркал (картридж)', maker: 'не выбран', article: '—', purpose: 'Приклеивание зеркала к щиту', unit: 'шт', materials: '', thickness: '', mounting: 'По инструкции клея', holes: {}, limits: 'Только клей, безопасный для амальгамы.', source: '—', sourceDate: '—', status: 'unverified', missing: ['марка клея'], massG: 300 },
  'mirror-clip': { id: 'mirror-clip', name: 'Держатель зеркала (страховочный)', maker: 'не выбран', article: '—', purpose: 'Страховка зеркала от падения', unit: 'шт', materials: '', thickness: 'зеркало 4 мм', mounting: 'Саморез 3,5×16', holes: {}, limits: '', source: '—', sourceDate: '—', status: 'unverified', missing: ['модель'], massG: 5 },
  'bed-bolt': { id: 'bed-bolt', name: 'Стяжка кроватная (комплект)', maker: 'не выбран', article: '—', purpose: 'Соединение царги с изголовьем/изножьем', unit: 'компл', materials: 'плита 18–25 мм', thickness: '', mounting: 'По схеме производителя', holes: {}, limits: 'Отверстия не формируются: нет проверенного профиля.', source: '—', sourceDate: '—', status: 'unverified', missing: ['модель и артикул', 'схема отверстий'], massG: 120 },
  bracket: { id: 'bracket', name: 'Уголок крепления центральной балки', maker: 'не выбран', article: '—', purpose: 'Балка к изголовью и изножью', unit: 'шт', materials: '', thickness: '', mounting: 'Саморезы 4×30', holes: {}, limits: '', source: '—', sourceDate: '—', status: 'unverified', missing: ['модель', 'нагрузка'], massG: 150 },
  'lath-holder': { id: 'lath-holder', name: 'Латодержатель накладной', maker: 'не выбран', article: '—', purpose: 'Крепление ламели к царге/балке', unit: 'шт', materials: '', thickness: 'ламель 53×8', mounting: '2 самореза 4×16', holes: {}, limits: '', source: '—', sourceDate: '—', status: 'unverified', missing: ['модель'], massG: 15 },
  lamel: { id: 'lamel', name: 'Ламель гнутоклеёная 53×8', maker: 'не выбран', article: '—', purpose: 'Основание под матрас', unit: 'шт', materials: 'берёзовый шпон', thickness: '8 мм', mounting: 'В латодержатели', holes: {}, limits: 'Нагрузка на основание не рассчитывается — по паспорту ламелей.', source: '—', sourceDate: '—', status: 'unverified', missing: ['модель', 'допустимая нагрузка'], massG: 450 },
  'bar-40x30': { id: 'bar-40x30', name: 'Брусок опорный 40×30', maker: '—', article: '—', purpose: 'Опора щита основания', unit: 'м', materials: 'сосна', thickness: '', mounting: 'Саморезы 4×40 к царге, шаг 200', holes: {}, limits: '', source: '—', sourceDate: '—', status: 'unverified', missing: [], massG: 600 },
  caster: { id: 'caster', name: 'Колесо мебельное', maker: 'не выбран', article: '—', purpose: 'Выкатной ящик под кроватью', unit: 'шт', materials: '', thickness: 'дно от 16 мм', mounting: '4 самореза 4×16', holes: {}, limits: 'Нагрузка не проверяется.', source: '—', sourceDate: '—', status: 'unverified', missing: ['модель', 'высота', 'нагрузка'], massG: 60 },
  'confirmat-cap': { id: 'confirmat-cap', name: 'Заглушка конфирмата', maker: '—', article: 'в цвет корпуса', purpose: 'Закрыть головку', unit: 'шт', materials: '', thickness: '', mounting: '', holes: {}, limits: '', source: '—', sourceDate: '—', status: 'unverified', missing: [], massG: 0.5 },
};

export const HARDWARE_TOOLS: Record<string, string[]> = {
  confirmat: ['Шестигранный ключ / бита под конфирмат', 'Шуруповёрт'],
  'hinge-blum': ['Отвёртка PZ2'], slide: ['Шуруповёрт', 'Отвёртка PZ2'], 'screw-4x30': ['Шуруповёрт'], 'screw-4x16': ['Шуруповёрт'],
  'back-nail': ['Молоток или степлер'], 'handle-screw': ['Отвёртка PH2'], 'shelf-pin': [], 'leg-wood': ['Шуруповёрт'], 'leg-metal': ['Шуруповёрт'],
  'rod-holder': ['Шуруповёрт'], 'bed-bolt': ['Шестигранный ключ', 'Шуруповёрт'], 'lath-holder': ['Шуруповёрт'], bracket: ['Шуруповёрт'], caster: ['Шуруповёрт'], 'mirror-bracket': ['Шуруповёрт'], 'mirror-glue': ['Пистолет для герметика'], 'mirror-clip': ['Отвёртка PH2'], glide: ['Молоток'], 'wall-hanger': ['Перфоратор / дрель по основанию', 'Уровень'], 'frame-bolt': ['Шуруповёрт'],
};
