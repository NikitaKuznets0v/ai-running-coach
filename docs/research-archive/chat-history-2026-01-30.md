# История чата: 30 января 2026

## Сессия: Добавление физических данных в онбординг

### Выполненные задачи

#### 1. Добавление сбора физических данных (возраст, рост, вес)

**Обновлённые файлы:**

- `database/schema.sql` - добавлена колонка `height_cm`, обновлён enum `onboarding_stage`
- `n8n-workflows/workflow-main-chatbot.json` - обновлена логика онбординга
- `docs/coach-knowledge/core-rules.json` - добавлены правила BMI и MAF

**Изменения в workflow:**

1. **Check User node** - теперь передаёт age, height_cm, weight_kg
2. **Prepare Data node** - добавлен этап 'physical' для сбора физических данных
3. **Build Update Data node** - обработка новых полей
4. **Update User Profile (Supabase)** - сохранение age, height_cm, weight_kg

**Новый этап онбординга:**
```
started → profile → physical → running_info → goal → completed
                      ↑
              НОВЫЙ ЭТАП
```

#### 2. BMI Safety Checks (проверки безопасности по индексу массы тела)

**Формула:** `BMI = weight_kg / (height_m)^2`

**Пороги:**
- BMI >= 35: ТОЛЬКО ходьба и лёгкий бег, никаких интенсивных тренировок
- BMI 30-35: Акцент на лёгкие тренировки, минимум нагрузки на суставы
- BMI 25-30: Осторожно с интервалами, постепенное увеличение
- BMI < 25: Нет особых ограничений

**Код в Prepare Plan Prompt:**
```javascript
let bmi = null;
let walkingOnly = false;
if (heightCm && weightKg) {
  const heightM = heightCm / 100;
  bmi = weightKg / (heightM * heightM);
  if (bmi >= 35) {
    walkingOnly = true;
    // Ограничиваем типы тренировок
  }
}
```

#### 3. MAF Heart Rate Calculation

**Формула Phil Maffetone:** `MAF HR = 180 - возраст`

**Применение:** Большинство тренировок должно проходить с пульсом ниже MAF для развития аэробной базы.

**Код:**
```javascript
let mafHR = null;
if (age) {
  mafHR = 180 - age;
  hrInfo = `MAF пульс (аэробная зона): до ${mafHR} уд/мин`;
}
```

#### 4. Миграция базы данных

**SQL выполнен в Supabase SQL Editor:**
```sql
-- Добавить колонку height_cm
ALTER TABLE users ADD COLUMN IF NOT EXISTS height_cm INTEGER;
ALTER TABLE users ADD CONSTRAINT check_height_cm CHECK (height_cm > 100 AND height_cm < 250);

-- Обновить enum onboarding_stage
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_onboarding_stage_check;
ALTER TABLE users ADD CONSTRAINT users_onboarding_stage_check
  CHECK (onboarding_stage IN ('started', 'profile', 'physical', 'running_info', 'goal', 'completed'));
```

**Верификация:**
- Тестовый INSERT с physical stage и height_cm: ✅ успешно
- Тестовый пользователь удалён

### Git коммиты

1. `feat: add age/weight/height collection to onboarding with BMI safety checks`
   - Добавлен сбор физических данных
   - BMI проверки в генерации плана
   - MAF пульс расчёт
   - Обновлена база знаний

### Проблемы и решения

**Проблема:** Невозможно подключиться к Supabase через psql или pooler
- DNS не резолвится для db.lmomttmjjopsnyegbukn.supabase.co
- Pooler возвращает "Tenant or user not found" для всех регионов
- Supabase CLI не поддерживает прямое выполнение SQL

**Решение:** SQL предоставлен пользователю для выполнения в Supabase SQL Editor

### Итоговое состояние

✅ Сбор возраста, роста и веса в онбординге
✅ BMI safety checks в генерации плана
✅ MAF heart rate расчёт
✅ База данных мигрирована
✅ Код закоммичен и запушен

### Следующие шаги

Пользователь может тестировать бота командой `/start` - онбординг теперь включает этап сбора физических данных.
