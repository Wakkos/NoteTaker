# Grabador

Graba reuniones en Windows (cualquier app: Teams, Zoom, Meet…) e importa audio o vídeo. Cuando acaba, transcribe la grabación completa por API y la guarda junto al audio.

## Instalar

En GitHub, pestaña **Releases**: descarga `Grabador Setup x.y.z.exe` e instálalo. Como el instalador no está firmado, Windows avisa la primera vez: *Más información → Ejecutar de todas formas*.

Para sacar una versión nueva: sube un tag (`git tag v0.2.0 && git push --tags`). GitHub Actions compila el instalador y lo publica en Releases. También se puede lanzar a mano desde la pestaña Actions → Build → Run workflow (el `.exe` queda en los artefactos de esa ejecución).

## Desarrollo

```
npm install
npm start
```

La primera vez: **Ajustes** (engranaje) → pega la clave de Deepgram. Se saca en console.deepgram.com.

## Uso

- **Botón rojo o `Ctrl+R`**: empieza/para la grabación. Graba dos pistas: tu micrófono y todo lo que suena en el sistema. Las dos barras verdes muestran que entra audio en cada una; si la del altavoz sale en rojo, solo se está grabando el micro.
- **Importar** (flecha) o **arrastrar archivos a la ventana**: m4a de Notas de voz del iPhone, mp4, mov, mp3, wav… De los vídeos solo se saca el audio.
- **Punto de estado**: amarillo girando = preparando o transcribiendo, verde = hecho, rojo = error, hueco = sin transcribir.
- **Hablantes**: haz clic en "Hablante 1" para ponerle nombre; se aplica a toda la transcripción.
- **Copiar**: copia la transcripción en texto, lista para pegar en Claude.
- **Idioma**: cada grabación tiene el suyo (español, inglés o detectar). Si lo cambias, pulsa *Volver a transcribir*.
- **Diccionario** (Ajustes): un término por línea (ANDRITZ, P6, EVA, nombres…). Se manda con cada transcripción. Mejor 20–50 términos importantes que cientos.

Usa auriculares en las reuniones: sin ellos, tu micro recoge también lo que sale por los altavoces y la transcripción puede duplicar frases.

## Dónde se guarda

`Documentos\Grabador\<fecha>_<id>\` (se puede cambiar en Ajustes):

| Archivo | Qué es |
|---|---|
| `audio.ogg` | Audio final (Opus, ~14 MB/hora). Es el que se transcribe. |
| `mic.webm`, `system.webm` | Pistas originales de una grabación. |
| `transcript.json` | Segmentos con tiempos y hablantes. |
| `transcript.md` | Transcripción en texto. |
| `meta.json` | Título, fecha, estado, nombres de hablantes. |

Si la app se cierra a mitad de una grabación, al volver a abrirla rescata lo grabado y lo transcribe.

## Motor de transcripción

`lib/transcribe.js`. Hoy usa Deepgram Nova-3 (con separación de hablantes y diccionario). Para probar otro servicio se añade otra función con la misma salida y se cambia el proveedor; el resto de la app no cambia.

## Pruebas

```
npm test
```
