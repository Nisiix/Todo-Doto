# Novedades

Traducción al español de `CHANGELOG.md` (italiano), leída por la aplicación y por el sitio. Cada versión añade la misma sección, con los mismos puntos en el mismo orden, a los cinco archivos (`CHANGELOG.md`, `.en`, `.fr`, `.de`, `.es`): una prueba lo comprueba.

## 0.7.0 — 21 de octubre de 2026

- Automatizaciones (menú del espacio de trabajo, administradores): si una tarea urgente se queda un día sin responsable, los administradores reciben una notificación; si una pregunta se queda 5 días sin respuesta, quien aparece mencionado recibe un aviso; al confirmar una tarea sin fecha límite, la aplicación la pide enseguida. Los días se eligen; sin servidor, cada aviso llega una sola vez.
- Qué ha cambiado: se eligen dos momentos (las copias de seguridad diarias, o ahora) y se ve qué se ha añadido, completado, reabierto, enviado a la papelera o eliminado, las fechas límite movidas «de → a», las tareas pasadas a otros y los proyectos nuevos, renombrados o enviados a la papelera. Un clic abre la tarea.
- Pregunta al proyecto (con la IA local): preguntas como «¿qué decidimos sobre la autenticación?» o «¿qué requisitos necesita el backend?». La respuesta sale solo de tareas, comentarios, preguntas y decisiones, del documento de arquitectura, de las notas del Stack y de los adjuntos de texto o PDF, y cita sus fuentes, que se abren con un clic. Nada sale del PC.
- El detalle de la tarea conserva los campos que se están editando y recibe las actualizaciones de los demás.
- Con el panel de la tarea abierto, los botones de la parte superior del proyecto muestran solo el icono: el nombre del proyecto sigue siendo legible.
- Enviar comentarios (menú del espacio de trabajo, paleta, pantalla de inicio, Ajustes): informa de un problema, propone una idea o haz una pregunta en GitHub, con la versión ya rellenada, o escribe al autor por correo.
- Aviso de nueva versión: una vez al día la aplicación comprueba la última versión publicada y, si hay una más reciente, lo indica en la parte superior de la ventana con «Novedades» y «Descargar». Se puede comprobar a mano o desactivar en Ajustes › Generales.
- Apoyar Todo Doto (menú del espacio de trabajo y pantalla de inicio): donación con PayPal o dirección de PayPal para copiar.

## 0.6.0 — 20 de octubre de 2026

- Dependencias: una tarea «va después» de otras. Mientras esas no estén completadas lleva un candado; si vence antes que lo que la bloquea, un aviso lo indica. En el Gantt las flechas unen las barras y la cadena crítica aparece resaltada. Cuando la tarea se desbloquea, su responsable recibe una notificación.
- Hitos: versiones o entregas con fecha objetivo, avance, filtro y línea en el Gantt; en la entrada rápida «~v1.3». Al alcanzar el hito, las notas de versión se escriben a partir de las tareas completadas y se copian o se añaden al CHANGELOG.md del proyecto.
- Carga por semana (Análisis): fechas límite y horas estimadas de cada persona en las próximas semanas, en todos los proyectos, con los solapamientos y «Pasar a…» con las personas recomendadas. Estimación en horas en la tarea o con «=3h».
- Ausencias y horas semanales (Miembros › Disponibilidad): se ven en la lista de asignados, reducen la carga y señalan las tareas que vencen mientras su responsable está ausente.
- Salud de los proyectos: un anillo amarillo o rojo en la barra lateral, con los motivos, y la evolución semana a semana en Análisis.
- PC listos: en Análisis la matriz proyectos × personas con el estado de cada PC; en la lista de asignados, si el PC de la persona está listo para el proyecto.
- Informe de estado interno de un periodo: completadas, retrasos, próximas fechas límite, hitos, decisiones, preguntas y alertas. Se copia en Markdown, se guarda como página para imprimir en PDF o se envía por correo; la introducción la puede escribir la IA local.
- Nota de traspaso: al pasar una tarea a otra persona, el detalle propone un resumen para quien la recibe, para añadir como comentario.
- Calendarios de fechas límite (.ics) en la carpeta Datos, para ti y para cada proyecto, para abrir en Outlook o Thunderbird; se activan desde el menú del espacio de trabajo.
- Listas de comprobación en las tareas y repetición semanal o mensual: al completarla nace la siguiente, con la lista por hacer.
- Plantillas de proyecto: se guarda un proyecto como plantilla y se crea uno nuevo con Stack, carpetas de adjuntos, hitos y tareas, con fechas a partir de hoy.
- Limpieza guiada para administradores: etiquetas nunca usadas, carpetas vacías, proyectos parados, adjuntos desaparecidos, hitos por cerrar y papeleras antiguas.

## 0.5.0 — 20 de octubre de 2026

- Entrada rápida: encima de la lista se escribe «Exportación CSV !alta @mario #bug antes del viernes» e Intro crea la tarea con prioridad, asignado, etiqueta y fecha límite. Lo reconocido se ve antes; la X lo deja en el título. También funciona en el diálogo «Nueva tarea».
- Hoy: una página con lo que te afecta en todos los proyectos (con retraso, que vence hoy y esta semana, urgente, preguntas que esperan tu respuesta, respuestas a tus preguntas). Se completa y se pospone sin abrir el proyecto; posponer vale solo para ti y no cambia la fecha límite.
- Decisiones: en una pregunta, la respuesta elegida se convierte en «la decisión», con su motivo. El proyecto tiene su registro de decisiones, con búsqueda y copia en Markdown.
- Alertas y tiempos: en el proyecto, la lista de lo que está saliendo mal sin que nadie lo haya señalado (retrasos, urgencias sin responsable, preguntas sin respuesta, tareas paradas) y los tiempos medianos de creada a confirmada y a completada, con la antigüedad de las tareas pendientes.
- Git por tarea: en el detalle, los commits que citan TODO-n y el nombre de la rama para copiar; la tarea aparece «en curso» con commits recientes o con su rama abierta en el PC.
- Archivo: las tareas completadas hace más de 90 días quedan al final de «Completadas», detrás de «Mostrar archivadas». La búsqueda siempre las encuentra.
- Paleta de comandos: en Ctrl+K, «>» muestra los comandos (Hoy, nueva tarea, decisiones, alertas, secciones del proyecto, ajustes…) y «+» añade una tarea al proyecto abierto.

## 0.4.0 — 20 de octubre de 2026

- VPN de la oficina desde los ajustes: se elige una VPN ya configurada en Windows y Todo Doto la conecta sola cuando la carpeta compartida no responde (también al abrir). Las credenciales se quedan en Windows.
- Acceso corporativo: con la cuenta de dominio (Active Directory o Microsoft Entra ID) la misma persona es el mismo usuario en cualquier PC; los roles pueden salir de los grupos de Active Directory.
- Correo y Teams: «Enviar por correo» en tareas, hoja de ruta y resumen; un canal de Microsoft Teams por proyecto con tareas creadas, completadas, asignaciones, preguntas y menciones; correo a quien es mencionado o recibe una tarea; el resumen del día cada mañana. Envío con el Outlook del PC o con el servidor SMTP de la empresa; todo opcional y elegido por el administrador.
- Pensado para equipos más grandes: historial en archivos por mes y por PC (se acabó el archivo único reescrito por todos), un diario de cambios para saber qué archivos releer, comprobación de la carpeta menos frecuente con la ventana en segundo plano o lejos del PC, proyectos con cientos de tareas divididos en capítulos.

## 0.3.0 — 20 de octubre de 2026

- Todo Doto es gratuito: licencias y suscripciones quedan suspendidas. Quien quiera puede apoyar el desarrollo con una donación por PayPal (Ajustes › Generales y sitio).
- Quién trabaja en qué: en el detalle de la tarea «Estoy en ello»; en la lista una pastilla verde con quién trabaja en ella, sin mover las columnas; en el nuevo Panorama la lista de todo el equipo.
- Hoja de ruta para el cliente: una página con lo que está hecho y lo que llega, sin descripciones, comentarios ni detalles internos, para enviar o imprimir en PDF.
- Configurar este PC: en un solo paso los programas que necesitan todos tus proyectos, cada uno instalado una sola vez.
- Stack desactualizado: si los archivos del proyecto cambian (p. ej. una nueva versión de Node.js), un aviso propone actualizar el Stack con un clic.
- Portátil fuera de la oficina: sin la carpeta compartida se sigue trabajando en la copia del PC; al volver, los cambios se unen a los de los compañeros, campo por campo, y se muestran los conflictos.
- Cifrado de los datos en el disco para los espacios de trabajo en red (Ajustes › Datos de usuario, administradores): archivos, copias de seguridad y copia fuera de la oficina ilegibles sin la contraseña.
- Detección de cambios más ligera en las carpetas de red: solo se consultan las carpetas que han cambiado.

## 0.2.26 — 16 de octubre de 2026

- IA local, gratuita y toda en el PC (Ollama con Qwen 3 4B, o un servidor compatible con OpenAI como LM Studio): la aplicación solo se comunica con el motor instalado en el PC, nunca con servicios externos.
- Ajustes › IA local: prueba de conexión y descarga de los modelos con barra de progreso. En el instalador para Windows, opción para instalar también la IA.
- Stack: «Detectar desde los archivos del proyecto» con la IA activa propone también requisitos, pasos, variables y notas que los archivos no dicen explícitamente, para elegir antes de añadirlos.
- Funciones asistidas: «Cómo resolverlo» para los requisitos, tareas a partir de un texto, aviso de tareas parecidas, búsqueda por significado, commits que podrían completar una tarea, resumen de la semana, AGENTS.md/CLAUDE.md desde el Stack.
- Un banner en la parte superior invita a activar la IA local; una vez cerrado, no vuelve a aparecer.

## 0.2.25 — 16 de octubre de 2026

- En la barra lateral las secciones del proyecto están ahora en el orden Stack, Todo, Gantt, Adjuntos.
- Nuevo sitio: precios de los planes Free, Team y Business, preguntas frecuentes, guía de uso, notas de versión, comparaciones con Trello y Excel, páginas legales actualizadas.

## 0.2.24 — 15 de octubre de 2026

- Stack: los campos no válidos impiden guardar.

## 0.2.23 — 15 de octubre de 2026

- «Detectar desde los archivos del proyecto» solo con una carpeta de proyecto válida.

## 0.2.22 — 15 de octubre de 2026

- Se vuelve a abrir el último espacio de trabajo sin pasar por la elección del espacio de trabajo.

## 0.2.21 — 15 de octubre de 2026

- Carpeta del proyecto mostrada solo si existe de verdad en este PC.

## 0.2.20 — 15 de octubre de 2026

- Filtros del Gantt, fecha límite sin definir, ajustes con «Datos de usuario».

## 0.2.19 — 15 de octubre de 2026

- Carpeta del proyecto en este PC, ajustes en pestañas.

## 0.2.18 — 15 de octubre de 2026

- Todo Doto: nuevo nombre, Gantt de las tareas confirmadas, requisitos desde los archivos del proyecto.

## 0.2.17 — 15 de octubre de 2026

- Commit de git → tarea: «cierra TODO-n» completa la tarea.

## 0.2.16 — 15 de octubre de 2026

- Configuración de los PC compartida, notificaciones configurables, copias de seguridad.

## 0.2.15 — 15 de octubre de 2026

- Eliminaciones limitadas a la carpeta Datos, mensajes sobre los archivos del proyecto.

## 0.2.14 — 14 de octubre de 2026

- «Recordar la contraseña» opcional, cifrada con Windows DPAPI.

## 0.2.13 — 14 de octubre de 2026

- Favoritos en la barra lateral solo si hay proyectos con estrella.

## 0.2.12 — 14 de octubre de 2026

- Enlaces externos, comprobación de .NET y de requisitos fuera del PATH, campos de la tarea en el detalle.

## 0.2.11 — 14 de octubre de 2026

- Proyectos desde su carpeta, stack también desde carpetas de red y subcarpetas, red más rápida.

## 0.2.10 — 14 de octubre de 2026

- Visibilidad de los proyectos pública o limitada, con un punto en la barra lateral.

## 0.2.9 — 14 de octubre de 2026

- Carpetas de red con errores explicados, carpeta creada con el proyecto, importación del stack.

## 0.2.8 — 14 de octubre de 2026

- Carpeta de proyectos deducida para los espacios de trabajo creados antes de la 0.2.4.

## 0.2.7 — 14 de octubre de 2026

- Nombre del proyecto desde su carpeta, sin modificación posterior.

## 0.2.6 — 14 de octubre de 2026

- Gestión de permisos en la página Miembros, corrección de la actualización en segundo plano.

## 0.2.5 — 14 de octubre de 2026

- GitHub, comprobación automática de requisitos, nombre y usuarios del proyecto.

## 0.2.4 — 14 de octubre de 2026

- Carpeta de proyectos y carpeta Datos separadas, configuración automática.

## 0.2.3 — 14 de octubre de 2026

- Espacio de trabajo desde una carpeta de proyectos existentes, con creación automática de los proyectos.

## 0.2.2 — 14 de octubre de 2026

- Secciones del proyecto en la barra lateral, Stack con importación .md y requisitos automáticos.

## 0.2.1 — 14 de octubre de 2026

- Guardados bajo bloqueo entre PC, exe portátil sin instalador.

## 0.2.0 — 14 de octubre de 2026

- Primera versión publicada con build automática, sitio e instaladores en italiano y en inglés.
