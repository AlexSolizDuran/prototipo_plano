# Entorno de ejecución de captura (capture runtime)

Los datos de captura son una extensión opcional del visor, no un renderizador privado de Community y
no un segundo grafo de escena.

## Límites de propiedad

- `@pascal-app/core/capture` (`packages/core/src/capture/`) es dueño de los manifiestos versionados,
  los descriptores normalizados de flujos (streams), los localizadores estables de sesión, los
  encabezados incrementales de paquetes y la interfaz `CaptureSource`. No tiene React, Three.js,
  autenticación, base de datos ni transporte prescrito, por lo que se mantiene dentro de la regla de
  capa de lógica pura del core.
- `@pascal-app/viewer/capture` (`packages/viewer/src/capture/`) se monta dentro de `Viewer` a través
  de su ranura de hijos existente. Resuelve `scan.captureSession`, portaliza las capas al grupo
  registrado de ese nodo de scan, respeta la visibilidad por capa, compone los marcos de coordenadas
  declarados de local-a-padre en el espacio de sesión, y proporciona los renderizadores de modelo de
  referencia, movimiento de dispositivo, nube de puntos y superficie de color compacta.
  `@pascal-app/viewer/capture/preview` expone los constructores de geometría matcap y de malla de
  superficie por sí solos para clientes de captura que renderizan una vista previa local sin el
  entorno de ejecución.
- `@pascal-app/core` almacena solo el ancla de la escena: localizador de sesión, URL opcional de la
  malla actual, colocación, opacidad y un mapa de visibilidad extensible. Las muestras crudas y los
  inventarios de artefactos nunca entran al JSON de la escena.
- Un host es dueño de la resolución de fuentes, el control de acceso, las URLs firmadas, la
  persistencia, la retención, la colaboración y la selección de transporte. El resolutor de Community
  usa su ruta autenticada de manifiesto de captura.

## Estático y en vivo usan la misma fuente

Cada fuente implementa `describe()`. Las fuentes HTTP estáticas se detienen ahí. Las fuentes en vivo
además implementan `subscribe()` y producen cambios de descriptor o paquetes de flujo acotados. El
entorno de ejecución aplica el ordenamiento de generación y secuencia antes de que los renderizadores
consuman los paquetes.

El protocolo deliberadamente no elige WebSocket, WebRTC, Supabase Realtime ni otro transporte. Un
visor incrustado puede usar un manifiesto HTTP público; una herramienta local puede usar archivos o
un productor en memoria; Community puede superponer su modelo de colaboración y autorización sobre la
misma interfaz.

Community deliberadamente aún no monta artefactos de captura en su visor público de proyectos. Su
ruta de manifiesto actual requiere acceso de edición; una superficie pública futura necesita una
política explícita de artefactos con alcance de vista y de privacidad antes de poder usar el mismo
entorno de ejecución de manera segura.

## Extensión de flujo (stream)

Los flujos del manifiesto v2 usan ids estables más cadenas abiertas de `kind` y `role`. Los roles
conocidos actualmente se asignan a `model`, `deviceMotion`, `pointCloud` y `surfaceMesh`. El
renderizador de superficie de referencia acepta la vista previa en línea cuantizada y acotada que
emite Capture; una malla futura con textura UV o reconstruida por servidor puede ser otro flujo
respaldado por artefactos sin cambiar `ScanNode`. Los flujos desconocidos siguen disponibles para los
hosts, que pueden agregar un renderizador con clave por role o kind sin cambiar el esquema de la
escena. Un adaptador de splat debería seguir siendo un renderizador compuesto separado mientras
consume la misma fuente y el mismo contrato de visibilidad.

## Compatibilidad

El protocolo normaliza el manifiesto v1 de RoomPlan/movimiento de dispositivo de Community, de modo
que las capturas existentes sigan siendo visibles. `ScanNode` mantiene cargables los escaneos
heredados respaldados por GLB, hace que `manifestUrl` sea opcional para sesiones resueltas por el
host, y usa un registro de visibilidad extensible para que agregar una modalidad de datos no exija
otra versión del esquema de nodo.