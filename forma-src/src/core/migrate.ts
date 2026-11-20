/** Открытие файлов проектов: проверка схемы и миграция старых версий. */
import { Project, PROJECT_SCHEMA, PROJECT_VERSION, CONFIG_SCHEMA, CONFIG_VERSION, ProductConfig } from './schema';
import type { Project as P } from './schema';

export class ProjectError extends Error {}
export function migrateProject(raw: any): P {
  if (!raw || typeof raw !== 'object') throw new ProjectError('Файл не похож на проект «Формы».');
  if (raw.schema === CONFIG_SCHEMA) { // голая конфигурация изделия
    raw = { schema: PROJECT_SCHEMA, version: PROJECT_VERSION, id: 'p' + Date.now().toString(36), name: 'Импорт', created: new Date().toISOString(), updated: new Date().toISOString(), config: raw };
  }
  if (raw.schema !== PROJECT_SCHEMA) throw new ProjectError('Это не файл проекта «Формы» (нет отметки forma/project).');
  if (typeof raw.version !== 'number' || raw.version > PROJECT_VERSION) throw new ProjectError(`Проект создан более новой версией программы (формат ${raw.version}). Обновите приложение.`);
  if (raw.config?.version > CONFIG_VERSION) throw new ProjectError('Конфигурация изделия из более новой версии программы.');
  const r = Project.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new ProjectError(`Файл повреждён или неполон: поле «${i.path.join('.')}» — ${i.message}.`);
  }
  ProductConfig.parse(r.data.config);
  return r.data;
}
