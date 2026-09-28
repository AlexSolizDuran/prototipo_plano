# Detección de espacios

*Contrato de confirmación (commit) y replicación para la reconciliación de habitaciones impulsada por muros.*

Se aplica a: `packages/core/src/lib/space-detection.ts`, `packages/core/src/store/**` y a los consumidores de colaboración de `SceneCommit`.

La detección de espacios deriva el estado de las habitaciones de la geometría de los muros. La reconciliación actualiza las clasificaciones de los lados de los muros, crea o actualiza las losas (slabs) y los techos automáticos, y actualiza el `children` de su nivel. Esas escrituras derivadas forman parte de la edición de muro que las desencadenó, no de una operación posterior en segundo plano.

## Límite de confirmación local

`initSpaceDetectionSync` debe seguir siendo un suscriptor síncrono del store de la escena. Una mutación local de muro y toda la reconciliación que desencadena deben terminar antes de que zundo emita la instantánea `SceneCommit` de la mutación.

La reconciliación pausa la historia de la escena mientras aplica las escrituras derivadas. Esto mantiene la edición desencadenante y su estado generado en un solo paso de deshacer, mientras que la mutación exterior rastreada aún captura el gráfico reconciliado final en `SceneCommit.current`. La instantánea emitida debe contener por tanto:

- la edición de muro desencadenante;
- los valores reconciliados de `frontSide` y `backSide`;
- las losas y techos automáticos generados o actualizados; y
- las actualizaciones correspondientes de `children` del nivel.

No programes la reconciliación desde `subscribeSceneCommits`. Los oyentes de confirmación se ejecutan después del límite de la instantánea. Como las escrituras de reconciliación están pausadas por la historia, mover ese trabajo allí no enmendaría la instantánea emitida ni produciría una segunda confirmación local, dejando a los consumidores de colaboración sin poder transmitir el estado generado.

## Consumo del parche host

El cliente originador es el único cliente que reconcilia una edición local de muro y acuña IDs para las superficies de habitación generadas. La colaboración transporta la diferencia resultante antes/actual, incluyendo los nodos generados y las actualizaciones de padre.

Los clientes receptores aplican ese gráfico transmitido como un parche host. La aplicación del host está pausada por la historia y puede ejecutarse mientras la escena está en modo de solo lectura, por lo que la detección de espacios no debe regenerar la habitación localmente. El receptor consume los IDs de losas y techos del originador y no registra ninguna entrada local de deshacer ni confirmación local para el cambio del host.

Este contrato de doble lado evita que los pares acuñen de forma independiente IDs diferentes para la misma habitación:

1. Edición local de muro → reconciliación síncrona → una confirmación local completa y un paso de deshacer.
2. Parche host → aplicar el estado generado transmitido → sin reconciliación local ni entrada de historia local.

Los cambios en la programación de la detección de espacios, el pausado de la historia, la entrega de confirmaciones de escena o la aplicación de parches host deben preservar ambos lados de este contrato.