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
Допустим, есть компонент с данными:
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
  {{#if error}}<div class="error">{{error}}</div>{{/if}}
</div>
```

### 3. Реализация рендерера
Добавляем в `extension.ts`:
```ts
const componentRenderers: Record<string, ComponentRenderer> = {
  // ... existing renderers ...

  myComponent: (attrs, webview, docUri, templates) => {
    try {
      const items = JSON.parse(attrs.data || '[]');
      return templates.myComponent({ items, error: null });
    } catch (error) {
      return templates.myComponent({ 
        items: [], 
        error: 'Invalid JSON format' 
      });
    }
  }
};
```

### 4. Стилизация
```css
.mdx-my-component {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  background: #f8f8f8;
}

.my-component-item {
  border-left: 3px solid #4CAF50;
  padding: 0.5rem 1rem;
}

.mdx-my-component .error {
  color: #f44336;
  font-style: italic;
}
```
