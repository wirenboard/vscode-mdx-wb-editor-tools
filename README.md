# vscode-mdx-preview-wb-style

## Описание
Кастомный рендер md-файлов из репозитория https://github.com/wirenboard/website

### Компоненты
Основная идея — находить в тексте [компоненты](https://github.com/wirenboard/website/blob/main/doc/components.md) и рендерить их в html, по пути подтягивая файлы картинок.

Пока умеет только:
- `photo`
- `gallery`
- `video-player`
- `video-gallery`

![изображение](./assets/preview.png)

### Доступные сниппеты для Markdown

#### Заголовки
- `wb-h2` → `## Заголовок 2`  
- `wb-h3` → `### Заголовок 3`  

#### Списки
- `wb-list-ul` →  
  ```markdown
  - Пункт 1
  - Пункт 2
  - Пункт 3
  ```
- `wb-list-ol` →  
  ```markdown
  1. Пункт 1
  2. Пункт 2
  3. Пункт 3
  ```

#### Ссылки
- `wb-link` → `[текст ссылки](https://example.com)`

#### Медиа-компоненты
- `wb-comp-photo` →  
  ```markdown
  :photo{
    src="путь/к/изображению.jpg"
    alt="Описание"
    caption="Подпись"
    width="500px"
    float="left|right"
  }
  ```
- `wb-comp-gallery` →  
  ```markdown
  :gallery{
    data='[
      ["img1.jpg", "Описание 1"],
      ["img2.jpg", "Описание 2"]
    ]'
  }
  ```
- `wb-comp-video` →  
  ```markdown
  :video-player{
    url="https://youtube.com/..."
    cover="превью.jpg"
    width="600px"
  }
  ```
- `wb-comp-video-gallery` →  
  ```markdown
  :video-gallery{
    data='[
      ["url1", "Описание 1", "cover1.jpg"],
      ["url2", "Описание 2", "cover2.jpg"]
    ]'
  }
  ```

#### Шаблоны документов
- `wb-md-article` → Шаблон статьи с frontmatter  
- `wb-md-solution` → Шаблон решения для клиента  
- `wb-md-integrator` → Шаблон карточки интегратора  
- `wb-md-vacancy` → Шаблон вакансии  

Для использования: введите префикс (например `wb-h2`) и нажмите `Tab`.

## Сборка
### Установка зависимостей (однократно)
```
sudo npm install -g vsce
```

### Локальная установка
В каталоге проекта:
```
npm install
```

### Компиляция и упаковка
```
npm run package
```
Собранный плагин будет в папке `dist`.

## Использование
### Установка/обновление
```
codium --install-extension ./dist/mdx-preview-X.Y.Z.vsix --force
vscode --install-extension ./dist/mdx-preview-X.Y.Z.vsix --force
```

### Запуск предпросмотра
Ctrl+Shift+P → Mdx Preview: Show Preview

## Добавление кастомных рендеров
### 1. MDX-компонент
```md
:myComponent{
  data='[
    {"name":"Item One","value":42},
    {"name":"Item Two","value":99}
  ]'
}
```

### 2. HTML-шаблон (Handlebars)
Создаем `templates/myComponent.html`:
```hbs
<div class="mdx-my-component">
  {{#each items}}
    <article class="my-component-item">
      <h3>{{name}}</h3>
      <p>Value: {{value}}</p>
    </article>
  {{/each}}
</div>
```

### 3. Реализация рендерера
Добавляем в `extension.ts`:
```ts
// ... существующий код ...

// 1. Импорт шаблона
const myComponentTemplate = Handlebars.compile(
  fs.readFileSync(path.join(context.extensionPath, 'templates', 'myComponent.html'), 'utf8'
);

// 2. Регистрация рендерера
componentRenderers.myComponent = (attrs, webview, docUri) => {
  try {
    const items = JSON.parse(attrs.data || '[]') as Array<{ name: string; value: number }>;
    return myComponentTemplate({ items });
  } catch (error) {
    console.error('myComponent error:', error);
    return `<div class="error">Invalid myComponent data</div>`;
  }
};

// ... остальной код ...
```

### 4. Стилизация (без изменений)
```css
.mdx-my-component {
  display: flex;
  flex-direction: column;
  gap: 1em;
}
.my-component-item {
  border: 1px solid #ddd;
  padding: 0.5em;
  border-radius: 4px;
}
```