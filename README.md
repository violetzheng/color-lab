# Color Photo K-Means App

A minimal full-stack app that lets you upload a photo, extracts the dominant colours using k-means on the backend, then recolours the image interactively in the browser.

## Features

- Upload an image file.
- Extract main colours using k-means clustering.
- Show a slightly recoloured/posterised version of the image.
- Drag colour chips around the palette board.
- Customise each extracted colour with a colour picker.
- Adjust recolouring strength.
- Download the modified image preview as a PNG.

## Run locally

```bash
npm run install:all
npm run dev
```

Open the Vite URL, usually:

```bash
http://localhost:5173
```

The backend runs on:

```bash
http://localhost:4000
```

## Project structure

```text
color-photo-kmeans-app/
  package.json
  README.md
  server/
    package.json
    server.js
  client/
    package.json
    index.html
    vite.config.js
    src/
      main.jsx
      App.jsx
      App.css
```

## Notes

The backend only extracts the palette. The browser keeps the original image data and re-renders the recoloured preview whenever you drag/edit palette chips or change the strength slider.
