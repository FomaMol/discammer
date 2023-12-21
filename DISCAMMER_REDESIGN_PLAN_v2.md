# Discammer — Полный план редизайна и реализации

> **Этот документ — пошаговая инструкция для Claude Code.**
> Сначала — дизайн в Figma (через MCP Figma-плагин), затем — реализация на FastAPI + React.
> Весь контент мигрируется с текущего сайта на Tilda (без видео).

---

## 0. Контекст проекта

### Что есть сейчас

Сайт на Tilda: `https://anti-scam.tilda.ws` — образовательная платформа по антифроду (DiScammer).

**Текущая структура главной страницы (сверху вниз по скриншотам):**

1. **Navbar** — логотип «DISCAMMER» (белый, жирный, скретч-стиль) + меню: Course, Journal, Play Game
2. **Hero** — красный фон, крупная надпись «DiScammer» белым скретч-шрифтом, внизу бегущая строка «WHERE THE SCAM IS FOUND:» с ротацией категорий (Interview, Newsletter, Article). Вокруг заголовка — декоративные белые «царапины»
3. **Interview** (карусель из 4+ карточек) — интервью с гостями:
   - Interview with Guest Kelvin Mou — «The Impact of Cutting Edge Technologies on Traditional Management Strategies» (11.02.2025)
   - Interview with Guest Mike Gibson — «The Impact of Technology on the Role of Creativity in Business and Communication» (11.02.2025)
   - Interview with Guest Michael Wakelin — «Cybersecurity, Ethical Hacking and Quantum Computing» (11.02.2025)
   - Interview with Guest Guy Eames — «The Importance of Digital Twins» (21.01.2025)
4. **Newsletter** (карусель из 4+ карточек):
   - The Verification Swindle — «Why That 'Security' Text Isn't Safe» (16.01.2026)
   - The Urgency Trap — «How Scammers Use Pressure to Steal» (16.01.2026)
   - 5G and Beyond — «The Future of Wireless Technology» (26.04.2025)
   - AI Creativity (11.02.2025)
5. **Article** (карусель из 4+ карточек):
   - The ICO Dilemma (14.02.2025)
   - The Impact of Technology (14.02.2025)
   - Breaking the Code (14.02.2025)
   - AR and VR (07.02.2025)
6. **About Us** — текст: «We are a platform dedicated to empowering people via digital literacy in order to mitigate fraudulent behavior and scams via AI and various other emerging technologies»
7. **3 Pillars** (3 карточки с иконками):
   - Protect Against Financial Scams — «Learning the basics of scam prevention: We help people recognize and combat various types of fraud to safeguard their money and personal information.»
   - Awareness Modern Scams — «To raise awareness of modern deception methods such as phishing, fake investments, false online stores and others»
   - Interactive Games and Tests — «Provide interactive games and tests to put your skills into practice and help you identify scammers.»
8. **Navigation Articles** (горизонтальная карусель, 10 карточек — каждая с иконкой и кнопкой «ARTICLE»):
   - Phishing, Nigerian Letters, Get-Rich-Quick Schemes, Investment Pyramids, False Charities, Fake Online Stores, Abuse on Dating Sites, SMS and Phone Scams, Fraud with Lotteries or Contests, Scam Sites for Working at Home
9. **Footer** — логотип, ссылки на статьи, навигация

**Отдельные страницы:**
- `/course` — заглушка «Soon...»
- `/discammer_times` — журнал (те же Navigation Articles)
- `/game` — заглушка «Soon...»
- 10 страниц-статей по типам мошенничества (`/phishing`, `/nigerian_letters` и т.д.)
- Отдельные посты для Interview, Newsletter, Article (формат tpost)

**Проблемы текущего сайта:**
- Красный фон + тёмно-серые карточки — визуально тяжело, нет единого стиля
- Типичная Tilda-блочность, карусели выглядят шаблонно
- Не связан с игрой «Antifraud Hero» визуально
- Footer частично сломан (404 ошибка видна на скриншоте)
- Нет интерактивности кроме каруселей

### Что хотим получить

Полностью кастомный сайт с уникальным визуальным стилем, вдохновлённым игрой **«Antifraud Hero»** — пиксельная эстетика, тёмные тона, неоновые акценты, атмосфера кибербезопасности. Весь контент с текущей Tilda мигрируется (без видео). Сайт должен ощущаться как часть игрового мира: словно ты работаешь за терминалом аналитика.

### Стек
- **Backend:** Python, FastAPI, Jinja2 (серверный рендеринг для SEO), SQLite (для контента)
- **Frontend:** React 18 + TypeScript + Vite, TailwindCSS v4
- **Подход:** Гибрид — основные страницы на сервере (FastAPI + Jinja2), интерактивные виджеты (игра, квизы, карусели) — React-компоненты через islands architecture
- **Деплой:** Docker, любой VPS

---

## 1. Дизайн-система (Design Tokens)

### 1.1 Цветовая палитра

Извлечено из скриншотов игры «Antifraud Hero»:

| Токен | Hex | Где используется |
|---|---|---|
| `--bg-primary` | `#0B0E17` | Основной фон (почти чёрный с синевой) |
| `--bg-secondary` | `#131829` | Фон карточек, сайдбаров, панелей |
| `--bg-panel` | `#1A2035` | Фон модальных окон, всплывающих панелей |
| `--bg-surface` | `#222B45` | Фон интерактивных элементов (кнопки hover, инпуты) |
| `--accent-cyan` | `#00F0FF` | Основной акцент — заголовки, ссылки, бордеры, неоновые свечения |
| `--accent-cyan-dim` | `#0A8F99` | Приглушённый cyan для вторичных элементов |
| `--accent-green` | `#39FF6B` | Позитивные действия: «Безопасно», кнопки CTA |
| `--accent-red` | `#FF4757` | Негативные: «Мошенничество», важные предупреждения |
| `--accent-amber` | `#FFB547` | Предупреждения, категории, акцентный текст |
| `--text-primary` | `#E4E8F1` | Основной текст |
| `--text-secondary` | `#8892A8` | Вторичный текст, подписи |
| `--text-muted` | `#4A5568` | Мета-информация, плейсхолдеры |
| `--border-default` | `#1E2A42` | Границы карточек |
| `--border-glow` | `rgba(0, 240, 255, 0.15)` | Неоновое свечение бордеров |

### 1.2 Типографика

| Элемент | Шрифт | Размер | Вес | Заметки |
|---|---|---|---|---|
| Лого / Заголовки h1 | **Press Start 2P** (Google Fonts) | 28–36px | 400 | Пиксельный шрифт, как «ANTIFRAUD HERO» на скриншотах |
| Подзаголовки h2-h3 | **JetBrains Mono** | 20–24px | 700 | Моноширинный, технический вид |
| Навигация | **JetBrains Mono** | 14px | 500 | Капс, letter-spacing: 2px |
| Основной текст | **Inter** | 16px / line-height 1.7 | 400 | Чистая читаемость |
| Кнопки | **JetBrains Mono** | 14px | 600 | Uppercase, tracking-wider |
| Код / мета / даты | **JetBrains Mono** | 13px | 400 | IP-адреса, технические данные, даты карточек |

### 1.3 Компоненты UI

#### Кнопки (вдохновлены нижней панелью игры — 4 action-кнопки с цветовой кодировкой)
- **Primary (cyan):** Тонкий cyan-бордер, `bg-transparent`, при hover — `bg-cyan/10` с `box-shadow: 0 0 20px rgba(0,240,255,0.3)` (неоновое свечение)
- **Danger (red):** Красный бордер + свечение
- **Success (green):** Зелёный бордер + свечение
- **Warning (amber):** Янтарный бордер + свечение

Все кнопки — прямоугольные, без скруглений (pixel-art стиль), mono-шрифт, uppercase.

#### Карточки контента (замена текущих тёмно-серых карточек с Tilda)
- Фон `--bg-secondary`
- Бордер 1px `--border-default`
- При hover — бордер переходит в `--accent-cyan` с glow-эффектом
- Изображение сверху (если есть) — с `filter: grayscale(20%) contrast(110%)` для единого стиля
- Дата в углу — моно-шрифт, мелкий, `--accent-amber`
- Заголовок — JetBrains Mono bold
- Описание — Inter, `--text-secondary`, 2 строки с обрезкой
- Лейбл категории (INTERVIEW / NEWSLETTER / ARTICLE) — маленький бейдж с цветовым кодированием

#### «Терминальный» блок
- Стилизация под окно терминала/монитора из игры
- Заголовок-бар с точками (●●●) или пиксельными кнопками
- Шрифт JetBrains Mono
- Зеленоватый или cyan текст на тёмном фоне
- Используется для: выделенных цитат, блоков «About Us», фактов о мошенничестве

#### Секция-заголовок (замена красных заголовков «INTERVIEW», «NEWSLETTER» и т.д.)
- Текст JetBrains Mono, uppercase, `--accent-cyan`
- Слева — вертикальная cyan-линия (2px) или мигающий курсор `_`
- Формат: `> INTERVIEW_LOG` / `> NEWSLETTER_FEED` / `> ARTICLE_DATABASE`
- Справа (опционально) — стрелки навигации карусели

#### Навигация
- Фиксированная верхняя панель
- Фон `--bg-primary` с `backdrop-filter: blur(12px)` при скролле
- Логотип «DISCAMMER» слева — Press Start 2P, `--accent-cyan`
- Пункты меню: COURSE, JOURNAL, PLAY GAME — JetBrains Mono, uppercase, cyan-подсветка active
- Мобильное: бургер-меню, стилизованное под терминальную панель

### 1.4 Эффекты и анимации
- **Scanline overlay:** Тонкие горизонтальные линии поверх hero-секции (CSS, opacity 0.03) — эффект CRT-монитора
- **Glow-эффект:** `text-shadow` и `box-shadow` с cyan для активных элементов
- **Глитч-анимация:** На заголовке главной — кратковременный glitch при появлении
- **Typewriter-эффект:** Бегущая строка «WHERE THE SCAM IS FOUND:» с ротацией категорий (как на текущем сайте, но в кибер-стиле)
- **Пиксельные частицы:** Фон hero с плавающими квадратными частицами (canvas или CSS)
- **Hover карточек:** Glow-бордер + лёгкий scale(1.02) + появление стрелки «→»

### 1.5 Иконки и графика
- Пиксельные иконки (32x32) для 10 категорий статей (Phishing, Nigerian Letters и т.д.) — заменяют текущие line-art иконки
- Библиотека **Pixelarticons** или кастомные SVG
- Фоновый паттерн: тонкая grid-сетка, как на экранах мониторов из скриншотов игры

---

## 2. Дизайн в Figma

### Инструкции для Claude Code + Figma MCP

> **Задача:** Создать дизайн-макеты всех страниц в Figma, используя дизайн-систему из Раздела 1.

### 2.1 Структура Figma-файла

Создать фрейм **«Discammer — Redesign»** со следующими Pages:

1. **🎨 Design System** — токены, компоненты, стили
2. **🏠 Home** — Главная (Desktop 1440px + Mobile 375px)
3. **📰 Journal** — Все материалы: Interview + Newsletter + Article (Desktop + Mobile)
4. **📄 Post** — Шаблон поста/статьи (Desktop + Mobile)
5. **📚 Scam Guide** — Шаблон гайда по типу мошенничества (Desktop + Mobile)
6. **🎓 Course** — Страница курса (Desktop + Mobile)
7. **🎮 Game** — Лендинг игры (Desktop + Mobile)

### 2.2 Макет: Главная страница `/`

**Hero-секция (100vh):**
- Фон `--bg-primary` (вместо текущего красного)
- По центру — «DISCAMMER» шрифтом Press Start 2P, цвет `--accent-cyan`, с glow-эффектом
- Под заголовком — typewriter-строка: `> WHERE THE SCAM IS FOUND: ` с ротацией `PHISHING | DEEPFAKES | SOCIAL ENGINEERING | ...` (amber цвет для ротируемого слова)
- 3 CTA-кнопки в ряд: `[▶ PLAY GAME]` `[📰 READ JOURNAL]` `[🎓 TAKE COURSE]` — стиль action-кнопок из игры
- Фон: тонкая grid-сетка + scanline overlay + плавающие пиксельные частицы
- Лёгкая изометрическая иллюстрация рабочего места аналитика по бокам (как на скриншотах 3-4 игры) — опциональный декор

**Секция «Interview» (миграция текущей карусели):**
- Заголовок: `> INTERVIEW_LOG` — cyan, JetBrains Mono
- Горизонтальная карусель карточек (по 4 видимых на desktop, по 1 на mobile)
- Каждая карточка:
  - Фото-заглушка (вместо видео) — серое placeholder-изображение или пиксельная иконка микрофона/камеры
  - Дата (amber, моно-шрифт) в верхнем левом углу
  - Заголовок: «Interview with Guest [Name]»
  - Описание: тема интервью (1-2 строки)
  - Бейдж `INTERVIEW` (cyan)
- Стрелки навигации по бокам

**Секция «Newsletter»:**
- Заголовок: `> NEWSLETTER_FEED`
- Аналогичная карусель
- Карточки с фото (миграция обложек с Tilda) + заголовок + подзаголовок + дата
- Бейдж `NEWSLETTER` (green)

**Секция «Article»:**
- Заголовок: `> ARTICLE_DATABASE`
- Аналогичная карусель
- Бейдж `ARTICLE` (amber)

**Секция «About Us» (замена текущего текстового блока):**
- Заголовок: `> MISSION_BRIEFING`
- Текст «About Us» внутри «терминального» блока — как окно монитора
- Стиль: моно-шрифт для заголовка, Inter для текста, cyan-бордер слева

**Секция «3 Pillars» (замена текущих 3 карточек с иконками):**
- 3 карточки в ряд (стек на mobile):
  - 🛡️ Protect Against Financial Scams
  - 🔍 Awareness Modern Scams
  - 🎮 Interactive Games and Tests
- Пиксельные иконки вместо текущих line-art
- Текст описания из текущей версии сохраняется
- Стиль карточек из дизайн-системы с glow-hover

**Секция «Scam Types» (замена текущих Navigation Articles):**
- Заголовок: `> THREAT_DATABASE`
- Горизонтальная карусель или сетка 5×2
- 10 карточек — каждая с пиксельной иконкой + название типа мошенничества + кнопка `READ →`
- При hover — glow-бордер

**CTA перед футером:**
- «Готов проверить свои навыки?» — крупная кнопка `[▶ START GAME]` (green glow)

**Footer:**
- Фон `--bg-secondary`
- Логотип «DISCAMMER» (Press Start 2P, мелкий)
- Колонки: Scam Guides (ссылки на 10 статей), Journal, Navigation
- Копирайт — моно-шрифт, dim

### 2.3 Макет: Журнал `/journal`

Заменяет текущие `/discammer_times`. Объединяет все 3 типа контента.

- Заголовок: «DISCAMMER TIMES» — Press Start 2P, с glitch-анимацией
- **Фильтры-табы** вверху: `[ALL]` `[INTERVIEW]` `[NEWSLETTER]` `[ARTICLE]` `[SCAM GUIDES]` — стиль кнопок из игры, active-таб подсвечен cyan
- **Сетка карточек**: 3 колонки (desktop), 2 (tablet), 1 (mobile)
- Каждая карточка:
  - Обложка (фото или placeholder)
  - Бейдж типа (INTERVIEW — cyan, NEWSLETTER — green, ARTICLE — amber, SCAM GUIDE — red)
  - Дата (моно, dim)
  - Заголовок
  - Описание (2 строки, обрезка)
  - `READ →`
- Пагинация или infinite scroll

### 2.4 Макет: Пост/статья `/post/{slug}` (шаблон)

Универсальный шаблон для Interview, Newsletter и Article.

- Хлебные крошки: `~/journal/newsletter/the-verification-swindle`
- Бейдж типа + дата
- Заголовок — h1, JetBrains Mono Bold, 28px
- Обложка (если есть) — полноширокая, в рамке «монитора»
- Контент:
  - Основной текст — Inter, 16px
  - Выделенные блоки — «терминальный» блок
  - Подзаголовки — JetBrains Mono
- Sidebar (desktop):
  - Оглавление (если есть h2/h3)
  - Связанные материалы того же типа
- Внизу: блок «Следующий материал» + «Вернуться в журнал»

### 2.5 Макет: Гайд по типу мошенничества `/guide/{slug}`

Отдельный шаблон для 10 scam-статей (Phishing, Nigerian Letters и т.д.)

- Хлебные крошки: `~/threat-database/phishing`
- Пиксельная иконка типа + заголовок
- «Уровень угрозы» — визуальный индикатор (как шкала репутации из игры)
- Контент статьи (мигрируется с Tilda):
  - Описание схемы
  - Реальная история (в «терминальном» блоке с amber-бордером)
  - Как защититься (карточки с green-акцентом)
- Внизу: карусель «Другие угрозы» (остальные 9 гайдов)

### 2.6 Макет: Курс `/course`

- Заголовок: `> TRAINING_PROGRAM`
- Описание курса
- Модули — вертикальный таймлайн:
  - Номер, название, описание, статус (🔒 / ✅ / ▶)
  - Прогресс-бар сверху (стиль шкалы репутации из игры)
- Заглушка для контента урока

### 2.7 Макет: Игра `/game`

- Hero: «ANTIFRAUD HERO» в пиксельном стиле (как неоновая вывеска из скриншотов 3-4)
- Описание игры (2-3 предложения из дизайн-документа)
- Кнопка `[▶ PLAY NOW]` (крупная, green glow)
- Контейнер для iframe/embed (16:9, рамка-монитор)
- Под игрой: карточки типов мошенничества, которые встретятся в игре

---

## 3. Структура проекта

```
discammer/
├── backend/
│   ├── main.py                  # FastAPI app
│   ├── config.py                # Настройки
│   ├── database.py              # SQLite: модели + CRUD
│   ├── models.py                # Pydantic-схемы
│   ├── markdown_renderer.py     # Markdown → HTML с кастомными стилями
│   ├── routers/
│   │   ├── pages.py             # Серверный рендеринг (Jinja2)
│   │   └── api.py               # JSON API для React-компонентов
│   ├── templates/
│   │   ├── base.html            # Layout (head, nav, footer, scripts)
│   │   ├── home.html
│   │   ├── journal.html
│   │   ├── post.html            # Универсальный шаблон Interview/Newsletter/Article
│   │   ├── guide.html           # Шаблон гайда по мошенничеству
│   │   ├── course.html
│   │   └── game.html
│   ├── static/
│   │   ├── css/
│   │   │   └── main.css         # TailwindCSS output + кастомные стили
│   │   ├── js/
│   │   │   └── app.js           # Собранный React-бандл
│   │   ├── fonts/
│   │   └── images/
│   │       ├── icons/           # Пиксельные SVG-иконки (10 типов мошенничества)
│   │       └── covers/          # Обложки статей (мигрированные с Tilda)
│   └── seed_data.py             # Наполнение БД всем контентом
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── src/
│   │   ├── main.tsx             # Entry: islands hydration
│   │   ├── components/
│   │   │   ├── HeroTypewriter.tsx       # Бегущая строка с ротацией
│   │   │   ├── ParticleBackground.tsx   # Canvas-частицы
│   │   │   ├── ContentCarousel.tsx      # Универсальная карусель (Interview/Newsletter/Article)
│   │   │   ├── ScamTypesGrid.tsx        # Сетка 10 типов мошенничества
│   │   │   ├── GlitchText.tsx           # CSS glitch-анимация
│   │   │   ├── TerminalBlock.tsx        # Окно терминала
│   │   │   ├── ScanlineOverlay.tsx      # CRT-эффект
│   │   │   ├── JournalFilter.tsx        # Табы фильтрации на странице журнала
│   │   │   ├── CourseProgress.tsx       # Прогресс курса
│   │   │   ├── GameEmbed.tsx            # Контейнер игры
│   │   │   └── MobileMenu.tsx           # Бургер-меню
│   │   ├── styles/
│   │   │   └── globals.css
│   │   └── utils/
│   │       └── api.ts
│   └── public/
│
├── content/                     # Markdown-файлы контента (миграция с Tilda)
│   ├── guides/                  # 10 гайдов по типам мошенничества
│   │   ├── phishing.md
│   │   ├── nigerian-letters.md
│   │   ├── get-rich-quick-schemes.md
│   │   ├── investment-pyramids.md
│   │   ├── false-charities.md
│   │   ├── fake-online-stores.md
│   │   ├── abuse-on-dating-sites.md
│   │   ├── sms-and-phone-scams.md
│   │   ├── fraud-with-lotteries.md
│   │   └── scam-sites-working-at-home.md
│   ├── interviews/              # 4+ интервью
│   │   ├── kelvin-mou.md
│   │   ├── mike-gibson.md
│   │   ├── michael-wakelin.md
│   │   └── guy-eames.md
│   ├── newsletters/             # 4+ ньюслеттера
│   │   ├── verification-swindle.md
│   │   ├── urgency-trap.md
│   │   ├── 5g-and-beyond.md
│   │   └── ai-creativity.md
│   └── articles/                # 4+ статей
│       ├── ico-dilemma.md
│       ├── impact-of-technology.md
│       ├── breaking-the-code.md
│       └── ar-and-vr.md
│
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── README.md
└── .env.example
```

---

## 4. База данных (SQLite)

### 4.1 Модель `Post` (единая для Interview, Newsletter, Article)

```
Post:
  - id: int (PK, autoincrement)
  - slug: str (unique) — "kelvin-mou", "verification-swindle", "ico-dilemma"
  - title: str — "Interview with Guest Kelvin Mou"
  - subtitle: str (nullable) — "The Impact of Cutting Edge Technologies..."
  - type: enum("interview", "newsletter", "article")
  - content: text (Markdown)
  - cover_image: str (nullable) — путь к обложке в /static/images/covers/
  - published_at: date
  - created_at: datetime
```

### 4.2 Модель `ScamGuide` (10 гайдов по типам мошенничества)

```
ScamGuide:
  - id: int (PK)
  - slug: str (unique) — "phishing", "nigerian-letters"
  - title: str — "Phishing: How to Avoid Getting Hooked"
  - description: str — краткое описание для карточки
  - content: text (Markdown)
  - icon: str — имя SVG-иконки ("phishing.svg")
  - threat_level: int (1-5) — уровень угрозы для визуала
  - category: str — "phishing", "social_engineering", "investment", "phone", "online"
  - published_at: date
```

### 4.3 Модель `CourseModule`

```
CourseModule:
  - id: int (PK)
  - order: int
  - title: str
  - description: str
  - content: text (Markdown)
  - is_locked: bool (default True)
```

---

## 5. Реализация: Пошаговый план

### Фаза 1 — Backend-каркас

**Шаг 1.1: Инициализация FastAPI**
```bash
pip install fastapi uvicorn jinja2 python-multipart aiofiles aiosqlite markdown
```
- Создать FastAPI app в `main.py`
- Подключить Jinja2 templates
- Маунтить статику
- Подключить роутеры

**Шаг 1.2: SQLite — создание таблиц**

Реализовать `database.py` с моделями Post, ScamGuide, CourseModule. Async через aiosqlite.

**Шаг 1.3: Seed-данные — миграция всего контента**

Скрипт `seed_data.py`:

1. **10 ScamGuide** — скопировать текст всех 10 статей с Tilda (Phishing, Nigerian Letters и т.д.) в Markdown-файлы в `content/guides/`, загрузить в БД
2. **4 Interview** — создать записи с текстовым описанием (без видео). Контент: тема интервью, краткое описание гостя, ключевые тезисы. Обложки — placeholder или заглушка
3. **4 Newsletter** — мигрировать тексты (The Verification Swindle, The Urgency Trap, 5G and Beyond, AI Creativity). Обложки — из Tilda (скачать заранее)
4. **4 Article** — мигрировать тексты (ICO Dilemma, Impact of Technology, Breaking the Code, AR and VR). Обложки из Tilda

> **Важно для Claude Code:** Контент интервью, ньюслеттеров и статей нужно вытянуть из Tilda через `web_fetch` по URL-адресам tpost. Если URL недоступен — использовать заголовок и описание из скриншотов как заглушку и пометить `TODO: fill content`.

**Шаг 1.4: Роуты страниц**

| Метод | URL | Шаблон | Данные |
|---|---|---|---|
| GET | `/` | `home.html` | Последние 4 Interview, 4 Newsletter, 4 Article, все 10 ScamGuide, About Us текст |
| GET | `/journal` | `journal.html` | Все Post + все ScamGuide, с пагинацией |
| GET | `/journal/{slug}` | `post.html` | Один Post (Interview/Newsletter/Article) |
| GET | `/guide/{slug}` | `guide.html` | Один ScamGuide |
| GET | `/course` | `course.html` | Модули курса |
| GET | `/game` | `game.html` | Статичная страница |

**Шаг 1.5: API-роуты (для React-компонентов)**

| Метод | URL | Ответ |
|---|---|---|
| GET | `/api/posts?type=interview&limit=4` | Список постов с фильтром по типу |
| GET | `/api/posts?type=newsletter&limit=4` | |
| GET | `/api/posts?type=article&limit=4` | |
| GET | `/api/guides` | Все 10 ScamGuide (для каруселей) |
| GET | `/api/course/modules` | Модули курса |

### Фаза 2 — Frontend (React + Tailwind)

**Шаг 2.1: Инициализация**
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install tailwindcss @tailwindcss/vite
```

**Шаг 2.2: CSS-переменные**

В `globals.css` определить все токены из Раздела 1.1. В Tailwind расширить через `var(--...)`.

**Шаг 2.3: React-компоненты (islands) — порядок реализации:**

1. **ScanlineOverlay** — CSS-only полосы CRT (10 мин)
2. **ParticleBackground** — Canvas, плавающие пиксельные квадраты (30 мин)
3. **GlitchText** — CSS clip-path + transform для заголовков (15 мин)
4. **HeroTypewriter** — Бегущая строка с ротацией категорий «WHERE THE SCAM IS FOUND: PHISHING▮» (20 мин)
5. **TerminalBlock** — Блок-окно терминала, переиспользуемый (15 мин)
6. **ContentCarousel** — Универсальная карусель с props: `type`, `title`, `apiUrl`. Используется 3 раза на главной (Interview, Newsletter, Article) + в Journal (40 мин)
7. **ScamTypesGrid** — Горизонтальная карусель/сетка 10 типов мошенничества (30 мин)
8. **JournalFilter** — Табы ALL / INTERVIEW / NEWSLETTER / ARTICLE / SCAM GUIDES с fetch и перерисовкой (25 мин)
9. **MobileMenu** — Бургер → выпадающая терминальная панель (20 мин)
10. **CourseProgress** — Прогресс-бар + таймлайн модулей (20 мин)
11. **GameEmbed** — iframe-контейнер в рамке «монитора» (15 мин)

**Шаг 2.4: Сборка**

Vite output → `../backend/static/js/` и `../backend/static/css/`. Islands-гидрация через `data-component` + `data-props`.

### Фаза 3 — Jinja2 шаблоны

**Шаг 3.1: `base.html`**
- Head: мета, Google Fonts (Press Start 2P, JetBrains Mono, Inter), CSS
- Nav: логотип + меню + MobileMenu island
- `{% block content %}`
- Footer: логотип, колонки ссылок, копирайт
- Script: React бандл

**Шаг 3.2: `home.html`** — самая важная страница
```
{% block content %}
  <!-- Hero -->
  <section class="hero">
    <div data-component="ParticleBackground"></div>
    <div data-component="ScanlineOverlay"></div>
    <h1 data-component="GlitchText" data-props='{"text":"DISCAMMER"}'>DISCAMMER</h1>
    <div data-component="HeroTypewriter" data-props='{"phrases":["PHISHING","DEEPFAKES","SOCIAL ENGINEERING","INVESTMENT FRAUD"]}'></div>
    <div class="hero-buttons">...</div>
  </section>

  <!-- Interview -->
  <section>
    <div data-component="ContentCarousel" data-props='{"title":"> INTERVIEW_LOG","apiUrl":"/api/posts?type=interview&limit=8","badge":"INTERVIEW"}'></div>
  </section>

  <!-- Newsletter -->
  <section>
    <div data-component="ContentCarousel" data-props='{"title":"> NEWSLETTER_FEED","apiUrl":"/api/posts?type=newsletter&limit=8","badge":"NEWSLETTER"}'></div>
  </section>

  <!-- Article -->
  <section>
    <div data-component="ContentCarousel" data-props='{"title":"> ARTICLE_DATABASE","apiUrl":"/api/posts?type=article&limit=8","badge":"ARTICLE"}'></div>
  </section>

  <!-- About Us -->
  <section>
    <div data-component="TerminalBlock" data-props='{"title":"> MISSION_BRIEFING"}'>
      <p>We are a platform dedicated to...</p>
    </div>
  </section>

  <!-- 3 Pillars — серверный HTML -->
  <section class="pillars-grid">
    {% for pillar in pillars %}...{% endfor %}
  </section>

  <!-- Scam Types -->
  <section>
    <div data-component="ScamTypesGrid" data-props='{"title":"> THREAT_DATABASE"}'></div>
  </section>

  <!-- CTA -->
  <section class="cta">...</section>
{% endblock %}
```

**Шаг 3.3: `journal.html`**
- GlitchText заголовок
- JournalFilter island (табы + сетка карточек)
- Серверный fallback: все карточки в HTML для SEO

**Шаг 3.4: `post.html`**
- Хлебные крошки (серверный HTML)
- Бейдж типа + дата
- Заголовок + подзаголовок
- Обложка (если есть)
- Контент (Markdown → HTML через `markdown_renderer.py`)
- Sidebar: оглавление + связанные посты
- Блок «Следующий материал»

**Шаг 3.5: `guide.html`**
- Хлебные крошки
- Пиксельная иконка + заголовок + threat level bar
- Контент статьи
- Карусель «Другие угрозы»

**Шаг 3.6: `course.html`** — CourseProgress island
**Шаг 3.7: `game.html`** — GameEmbed island

### Фаза 4 — Стилизация и полировка

**Шаг 4.1: Адаптивность**
- Breakpoints: 375px / 768px / 1024px / 1440px
- Nav → бургер на mobile
- Карусели → 1 карточка mobile, 2 tablet, 4 desktop
- Hero → уменьшенный заголовок, стек кнопок

**Шаг 4.2: Анимации**
- Intersection Observer: fade-in секций
- Smooth scroll
- Hover glow на карточках
- Glitch: однократно при появлении в viewport

**Шаг 4.3: Accessibility**
- Focus ring (cyan) на всех интерактивных элементах
- Alt-тексты для изображений
- Семантический HTML (header, main, nav, article, aside, footer)
- `prefers-reduced-motion`: отключить glitch, particles, typewriter

**Шаг 4.4: SEO и Performance**
- Мета-теги для каждой страницы (title, description, og:image)
- Шрифты: `font-display: swap`, preload Press Start 2P
- Изображения: WebP, lazy loading
- CSS: Tailwind purge
- JS: dynamic import для тяжёлых компонентов (ParticleBackground, ContentCarousel)

### Фаза 5 — Docker и деплой

**Шаг 5.1: Dockerfile**
```dockerfile
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/ .
RUN npm ci && npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/ ./backend/
COPY content/ ./content/
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=frontend-build /app/frontend/dist/assets/ ./backend/static/
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Шаг 5.2: docker-compose.yml**
```yaml
version: "3.8"
services:
  web:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data
    environment:
      - DATABASE_URL=sqlite:///data/discammer.db
```

**Шаг 5.3: Первый запуск**
```bash
docker compose up --build
# При первом запуске seed_data.py заполнит БД
```

---

## 6. Полный реестр контента для миграции

### 6.1 Scam Guides (10 штук) — миграция полного текста

| # | slug | Title | Category | Tilda URL |
|---|---|---|---|---|
| 1 | `phishing` | Phishing: How to Avoid Getting Hooked by Scammers | phishing | `/phishing` |
| 2 | `nigerian-letters` | Nigerian Letters | social_engineering | `/nigerian_letters` |
| 3 | `get-rich-quick-schemes` | Get-Rich-Quick Schemes | investment | `/get_rich_quick_schemes` |
| 4 | `investment-pyramids` | Investment Pyramids | investment | `/investment_pyramids` |
| 5 | `false-charities` | False Charities | social_engineering | `/false_charities` |
| 6 | `fake-online-stores` | Fake Online Stores | online | `/fake_online_stores` |
| 7 | `abuse-on-dating-sites` | Abuse on Dating Sites | social_engineering | `/abuse_on_dating_sites` |
| 8 | `sms-and-phone-scams` | SMS and Phone Scams | phone | `/sms_and_phone_scams` |
| 9 | `fraud-with-lotteries` | Fraud with Lotteries or Contests | online | `/fraud_with_lotteries_or_contests` |
| 10 | `scam-sites-working-at-home` | Scam Sites for Working at Home | online | `/scam_sites_for_working_at_home` |

> **Задача для Claude Code:** Последовательно зайти на каждый URL через `web_fetch`, извлечь полный текст статьи, сохранить как Markdown в `content/guides/{slug}.md`.

### 6.2 Interviews (4 штуки) — текстовые карточки (без видео)

| # | slug | Title | Subtitle | Date |
|---|---|---|---|---|
| 1 | `kelvin-mou` | Interview with Guest Kelvin Mou | The Impact of Cutting Edge Technologies on Traditional Management Strategies | 11.02.2025 |
| 2 | `mike-gibson` | Interview with Guest Mike Gibson | The Impact of Technology on the Role of Creativity in Business and Communication | 11.02.2025 |
| 3 | `michael-wakelin` | Interview with Guest Michael Wakelin | Cybersecurity, Ethical Hacking and Quantum Computing | 11.02.2025 |
| 4 | `guy-eames` | Interview with Guest Guy Eames | The Importance of Digital Twins | 21.01.2025 |

> Tilda URL: `/tpost/*-interview-with-guest-*`. Попытаться извлечь текстовый контент. Если недоступен — создать заглушку с title + subtitle и пометить `<!-- TODO: fill content from original interview -->`.

### 6.3 Newsletters (4 штуки)

| # | slug | Title | Subtitle | Date |
|---|---|---|---|---|
| 1 | `verification-swindle` | The Verification Swindle | Why That 'Security' Text Isn't Safe | 16.01.2026 |
| 2 | `urgency-trap` | The Urgency Trap | How Scammers Use Pressure to Steal | 16.01.2026 |
| 3 | `5g-and-beyond` | 5G and Beyond | The Future of Wireless Technology | 26.04.2025 |
| 4 | `ai-creativity` | AI Creativity | (subtitle TBD) | 11.02.2025 |

> Аналогично — попытаться извлечь через `web_fetch`, иначе заглушка.

### 6.4 Articles (4 штуки)

| # | slug | Title | Date |
|---|---|---|---|
| 1 | `ico-dilemma` | The ICO Dilemma | 14.02.2025 |
| 2 | `impact-of-technology` | The Impact of Technology | 14.02.2025 |
| 3 | `breaking-the-code` | Breaking the Code | 14.02.2025 |
| 4 | `ar-and-vr` | AR and VR | 07.02.2025 |

> Аналогично.

### 6.5 Статические тексты

**About Us:**
> We are a platform dedicated to empowering people via digital literacy in order to mitigate fraudulent behavior and scams via AI and various other emerging technologies

**3 Pillars:**
1. **Protect Against Financial Scams** — Learning the basics of scam prevention: We help people recognize and combat various types of fraud to safeguard their money and personal information.
2. **Awareness Modern Scams** — To raise awareness of modern deception methods such as phishing, fake investments, false online stores and others.
3. **Interactive Games and Tests** — Provide interactive games and tests to put your skills into practice and help you identify scammers.

### 6.6 Обложки (изображения)

> **Задача для Claude Code:** Скачать обложки карточек с Tilda CDN (`tildacdn.com`) для Interview, Newsletter и Article. Сохранить в `backend/static/images/covers/{slug}.webp`. Если обложка недоступна — использовать generated placeholder (тёмный фон + пиксельная иконка + заголовок).

---

## 7. Визуальные референсы

### Из скриншотов игры «Antifraud Hero» — что взять:

**Скриншоты 1, 2, 5 (вид от первого лица, рабочий стол аналитика):**
- Цветовая палитра: тёмно-синий фон, cyan/teal UI, amber/green акценты
- 4 action-кнопки внизу с цветовой кодировкой → стиль кнопок на сайте
- Панель «IP Lookup» справа → стиль информационных сайдбаров
- Клавиатура RGB, банки энергетиков → атмосфера (можно декоративно)

**Скриншоты 3, 4, 6, 7 (изометрия офиса):**
- Неоновая вывеска «ANTIFRAUD HERO» → стиль логотипа/заголовков
- Несколько мониторов, серверная стойка → hero-иллюстрация
- Прогрессия: День 1 (простой стол, 1 монитор) → День 30 (полный сетап) → метафора для курса

**Общий стиль:** pixel art, dark palette, neon cyan/green, кибербезопасность, «ты за терминалом».

---

## 8. Чеклист готовности

### Дизайн (Figma)
- [ ] Design System: токены, компоненты
- [ ] Главная — Desktop 1440px + Mobile 375px
- [ ] Журнал — Desktop + Mobile
- [ ] Пост (шаблон) — Desktop + Mobile
- [ ] Гайд по мошенничеству (шаблон) — Desktop + Mobile
- [ ] Курс — Desktop + Mobile
- [ ] Игра — Desktop + Mobile

### Backend
- [ ] FastAPI запускается
- [ ] SQLite: таблицы Post, ScamGuide, CourseModule
- [ ] seed_data.py: все 22 единицы контента загружены (10 guides + 4 interviews + 4 newsletters + 4 articles)
- [ ] Все роуты отдают HTML-страницы
- [ ] API-роуты для React-компонентов

### Frontend
- [ ] Все 11 React-компонентов рендерятся
- [ ] Islands-гидрация работает
- [ ] 3 карусели на главной загружают данные из API
- [ ] Фильтры на странице журнала работают
- [ ] Адаптивность: 375–1440px

### Стиль и анимации
- [ ] Дизайн-токены применены (цвета, шрифты)
- [ ] Glitch, typewriter, particles, glow-hover
- [ ] Scanline overlay на hero
- [ ] Мобильное бургер-меню

### Контент
- [ ] 10 Scam Guides — полный текст
- [ ] 4 Interviews — текст или заглушка
- [ ] 4 Newsletters — текст или заглушка
- [ ] 4 Articles — текст или заглушка
- [ ] About Us + 3 Pillars
- [ ] Обложки: скачаны или placeholder

### Деплой
- [ ] Docker: `docker compose up` запускает проект
- [ ] seed_data.py выполняется при первом запуске
- [ ] Lighthouse: Performance > 85, Accessibility > 90
