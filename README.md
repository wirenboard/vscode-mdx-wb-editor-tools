# vscode-mdx-preview-wb-style
## Описание
Кастомный рендер md-файлов из репозитория https://github.com/wirenboard/website

Основная идея — находить в тексте [компоненты](https://github.com/wirenboard/website/blob/main/doc/components.md) и рендерить их в html, по пути подтягивая файлы картинок.

Пока умеет только photo и gallery.

![изображение](https://github.com/user-attachments/assets/bc5cffd8-dc22-40b6-891e-f39f08f279f3)


## Сборка
### Установка зависимостей (однократно)
```
npm install
```

### Компиляция TypeScript
```
npm run compile
```

### Упаковка расширения в .vsix
```
vsce package
```

# Как пользоваться
## Установка или обновление расширения в VSCodium
```
codium --install-extension ./mdx-preview-X.Y.Z.vsix --force
vscode --install-extension ./mdx-preview-X.Y.Z.vsix --force
```

## Запуск предпросмотра в редакторе (вручную)

Ctrl+Shift+P → Mdx Preview: Show Preview
