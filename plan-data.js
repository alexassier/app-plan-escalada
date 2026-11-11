/*
  PLAN DE ESCALADA · datos editables
  ----------------------------------
  Todo lo que ves en la web sale de este archivo. Cambia los números,
  nombres o ejercicios y recarga la página.

  - inicio: lunes de la semana 1 (AAAA-MM-DD).
  - tests: "antes" y "ahora". mejor: "sube" si un número más alto es mejor,
    "baja" si más bajo es mejor, "letra" para notas A–E (A es la mejor).
  - mesociclos: cada uno tiene 4 semanas; la primera es de descarga.
  - Cada ejercicio: [nombre, tipo, series, reps, rpe, descanso, nota opcional]
*/

window.PLAN = {
  inicio: "2026-11-02",

  atleta: {
    altura: { valor: 178, unidad: "cm" },
    peso: { antes: 70.5, ahora: 69.8, unidad: "kg" },
    grado: { boulder: "7A", via: "7b" },
    fechaAntes: "2026-07-20",
    fechaAhora: "2026-10-26",
  },

  tests: [
    {
      grupo: "Movilidad",
      items: [
        { nombre: "Flexión de hombro", antes: "D", ahora: "C", mejor: "letra" },
        { nombre: "Flexibilidad lateral", antes: 186, ahora: 191, unidad: "cm", mejor: "sube" },
        { nombre: "Flexión de cadera", lados: { izq: [128, 133], dcha: [126, 130] }, unidad: "cm", mejor: "sube" },
        { nombre: "Flexibilidad frontal", antes: "D", ahora: "D", mejor: "letra" },
        { nombre: "Movilidad de tobillo", lados: { izq: [14, 16], dcha: [15, 15] }, unidad: "cm", mejor: "sube" },
        { nombre: "Hombro en rotación", lados: { izq: ["C", "C"], dcha: ["D", "C"] }, mejor: "letra" },
      ],
    },
    {
      grupo: "Fuerza",
      items: [
        { nombre: "Dominada 1RM (lastre)", antes: 22, ahora: 28, unidad: "kg", mejor: "sube" },
        { nombre: "Suspensión 20 mm 10 s (lastre)", antes: 12, ahora: 17, unidad: "kg", mejor: "sube" },
        { nombre: "Bloqueo a 90°", antes: 18, ahora: 16, unidad: "s", mejor: "sube" },
        { nombre: "Fuerza escapular", antes: "C", ahora: "B", mejor: "letra" },
        { nombre: "Front lever", antes: "D", ahora: "C", mejor: "letra" },
      ],
    },
    {
      grupo: "Resistencia y core",
      items: [
        { nombre: "Suspensiones 7/3 al 60 %", antes: 84, ahora: 105, unidad: "s", mejor: "sube" },
        { nombre: "Dominadas máximas", antes: 16, ahora: 19, unidad: "reps", mejor: "sube" },
        { nombre: "Plancha frontal", antes: 150, ahora: 180, unidad: "s", mejor: "sube" },
        { nombre: "Plancha lateral", lados: { izq: [95, 110], dcha: [100, 105] }, unidad: "s", mejor: "sube" },
        { nombre: "Hollow body", antes: 60, ahora: 55, unidad: "s", mejor: "sube" },
        { nombre: "Flexiones en 60 s", antes: 41, ahora: 44, unidad: "reps", mejor: "sube" },
      ],
    },
  ],

  // Tipos de bloque: nombre visible y color (usa las variables de styles.css)
  tipos: {
    mov: { nombre: "Movilidad", color: "var(--t-mov)" },
    tec: { nombre: "Técnica", color: "var(--t-tec)" },
    dedos: { nombre: "Fuerza de dedos", color: "var(--t-dedos)" },
    trac: { nombre: "Tracción", color: "var(--t-trac)" },
    gym: { nombre: "Fuerza general", color: "var(--t-gym)" },
    core: { nombre: "Core", color: "var(--t-core)" },
    res: { nombre: "Resistencia", color: "var(--t-res)" },
    prev: { nombre: "Prevención", color: "var(--t-prev)" },
    flex: { nombre: "Flexibilidad", color: "var(--t-flex)" },
    roca: { nombre: "Escalada libre", color: "var(--t-roca)" },
  },

  mesociclos: [
    {
      nombre: "Base",
      objetivo: "Volumen, técnica y tendones preparados para cargar.",
      dias: [
        { titulo: "Dedos y volumen", ejercicios: [
          ["Rutina de movilidad", "mov", 1, "10 min", null, null, "Hombros, muñecas y cadera"],
          ["Calentamiento técnico", "tec", 1, "15 min", 5, null, "Bloques fáciles, pies silenciosos"],
          ["Suspensiones 20 mm", "dedos", 5, "10 s", 7, "2 min", "Media regleta, sin lastre"],
          ["4×4 en bloque", "res", 4, "4 bloques", 7, "3 min", "Grado 2 por debajo del máximo"],
        ]},
        { titulo: "Gimnasio", ejercicios: [
          ["Peso muerto rumano", "gym", 4, "8", 7, "2 min"],
          ["Remo con barra", "gym", 4, "8", 7, "2 min"],
          ["Press banca", "gym", 3, "10", 7, "90 s", "Antagonista"],
          ["Sentadilla búlgara", "gym", 3, "8 por pierna", 7, "90 s"],
          ["Elevación de piernas en barra", "core", 3, "10", 7, "60 s"],
          ["Rueda abdominal", "core", 3, "10", 7, "60 s"],
        ]},
        { titulo: "Técnica en vía", ejercicios: [
          ["Rutina de movilidad", "mov", 1, "10 min", null, null],
          ["Vías de técnica", "tec", 4, "1 vía", 6, "5 min", "Una con pies de adherencia, otra en desplome"],
          ["Suspensiones intermitentes 7/3", "res", 3, "6 reps", 7, "3 min", "Regleta 20 mm"],
          ["Escalada continua", "res", 2, "12 min", 6, "6 min", "Grado cómodo sin bajar del muro"],
        ]},
        { titulo: "Prevención", ejercicios: [
          ["Extensores de muñeca con goma", "prev", 3, "15", 6, "45 s"],
          ["Rotación externa de hombro", "prev", 3, "12", 6, "45 s"],
          ["Face pull", "prev", 3, "15", 7, "60 s"],
          ["Flexiones en anillas", "gym", 3, "10", 7, "90 s"],
          ["Estiramiento de gemelo", "flex", 2, "45 s", null, "15 s"],
          ["Jefferson curl", "flex", 2, "8", 6, "60 s", "Lento, peso ligero"],
        ]},
        { titulo: "Tracción y bloque", ejercicios: [
          ["Rutina de movilidad", "mov", 1, "10 min", null, null],
          ["Calentamiento técnico", "tec", 1, "15 min", 5, null],
          ["Dominadas lastradas", "trac", 4, "5", 7, "3 min"],
          ["Bloqueos 90° y 120°", "trac", 3, "2 × 8 s", 7, "2 min"],
          ["Boulder a proyecto", "tec", 1, "45 min", 8, null, "Elige 3 bloques del límite"],
          ["Couch stretch", "flex", 2, "60 s", null, "15 s"],
          ["Frog pose", "flex", 2, "60 s", null, "15 s"],
        ]},
        { titulo: "Escalada libre", ejercicios: [
          ["Indoor u outdoor", "roca", 1, "Libre", null, null, "Disfruta, sin series"],
        ]},
      ],
    },
    {
      nombre: "Fuerza-resistencia",
      objetivo: "Aguantar más movimientos duros seguidos.",
      dias: [
        { titulo: "Dedos y circuitos", ejercicios: [
          ["Rutina de movilidad", "mov", 1, "10 min", null, null],
          ["Calentamiento técnico", "tec", 1, "15 min", 5, null],
          ["Suspensiones 20 mm lastradas", "dedos", 5, "10 s", 8, "2 min", "+ lastre de tu último test"],
          ["Circuito de 20 movimientos", "res", 4, "1 circuito", 8, "4 min"],
        ]},
        { titulo: "Gimnasio", ejercicios: [
          ["Peso muerto", "gym", 4, "5", 8, "3 min"],
          ["Remo con barra", "gym", 4, "6", 8, "2 min"],
          ["Press banca inclinado", "gym", 3, "8", 7, "90 s"],
          ["Sentadilla búlgara", "gym", 3, "6 por pierna", 8, "2 min"],
          ["Toes to bar", "core", 3, "8", 8, "60 s"],
          ["Pallof press", "core", 3, "12 por lado", 7, "45 s"],
        ]},
        { titulo: "Resistencia en vía", ejercicios: [
          ["Rutina de movilidad", "mov", 1, "10 min", null, null],
          ["Vías de calentamiento", "tec", 2, "1 vía", 5, "5 min"],
          ["Suspensiones intermitentes 7/3", "res", 4, "6 reps", 8, "3 min"],
          ["Vía-descuelgue-vía", "res", 3, "2 vías", 8, "8 min", "Sin descanso entre las dos"],
        ]},
        { titulo: "Prevención", ejercicios: [
          ["Extensores de muñeca con goma", "prev", 3, "15", 6, "45 s"],
          ["Rotación externa de hombro", "prev", 3, "12", 6, "45 s"],
          ["Press militar con mancuerna", "gym", 3, "8", 7, "90 s"],
          ["Fondos en paralelas", "gym", 3, "10", 7, "90 s"],
          ["Estiramiento de isquios con goma", "flex", 2, "60 s", null, "15 s"],
          ["Jefferson curl", "flex", 2, "8", 6, "60 s"],
        ]},
        { titulo: "Tracción y bloque", ejercicios: [
          ["Rutina de movilidad", "mov", 1, "10 min", null, null],
          ["Calentamiento técnico", "tec", 1, "15 min", 5, null],
          ["Dominadas en 3 posiciones", "trac", 4, "3 × 3", 8, "3 min", "Abierta, neutra, cerrada"],
          ["Front lever tuck", "core", 4, "10 s", 8, "2 min"],
          ["Bloques en series de 4", "res", 3, "4 bloques", 8, "5 min"],
          ["Pigeon pose", "flex", 2, "60 s", null, "15 s"],
        ]},
        { titulo: "Escalada libre", ejercicios: [
          ["Indoor u outdoor", "roca", 1, "Libre", null, null, "Prueba una vía larga"],
        ]},
      ],
    },
    {
      nombre: "Potencia",
      objetivo: "Movimientos explosivos y bloques al límite.",
      dias: [
        { titulo: "Dedos al máximo", ejercicios: [
          ["Rutina de movilidad", "mov", 1, "10 min", null, null],
          ["Calentamiento técnico", "tec", 1, "20 min", 5, null, "Sube de grado poco a poco"],
          ["Suspensiones 15 mm máximas", "dedos", 6, "7 s", 9, "3 min"],
          ["Campus 1-3-5", "dedos", 4, "1 subida", 9, "3 min", "Solo si no hay molestias"],
        ]},
        { titulo: "Gimnasio potente", ejercicios: [
          ["Peso muerto", "gym", 4, "3", 8, "3 min", "Velocidad máxima en la subida"],
          ["Dominadas explosivas", "trac", 4, "4", 8, "2 min"],
          ["Press banca", "gym", 3, "5", 8, "2 min"],
          ["Saltos al cajón", "gym", 3, "5", 7, "90 s"],
          ["Dragon flag", "core", 3, "5", 8, "90 s"],
        ]},
        { titulo: "Bloque explosivo", ejercicios: [
          ["Rutina de movilidad", "mov", 1, "10 min", null, null],
          ["Calentamiento técnico", "tec", 1, "15 min", 5, null],
          ["Lances y dinámicos", "tec", 5, "3 intentos", 8, "3 min"],
          ["Boulder máximo", "trac", 1, "40 min", 9, null, "Descansa 4 min entre pegues"],
        ]},
        { titulo: "Prevención", ejercicios: [
          ["Extensores de muñeca con goma", "prev", 3, "15", 6, "45 s"],
          ["Rotación externa de hombro", "prev", 3, "12", 6, "45 s"],
          ["Y-T-W en banco", "prev", 3, "8", 6, "60 s"],
          ["Flexiones con palmada", "gym", 3, "6", 7, "90 s"],
          ["Estiramiento de gemelo", "flex", 2, "45 s", null, "15 s"],
        ]},
        { titulo: "Tracción y bloque", ejercicios: [
          ["Rutina de movilidad", "mov", 1, "10 min", null, null],
          ["Calentamiento técnico", "tec", 1, "15 min", 5, null],
          ["Dominada a un brazo asistida", "trac", 4, "3 por brazo", 9, "3 min"],
          ["Front lever una pierna", "core", 4, "8 s", 8, "2 min"],
          ["Boulder a proyecto", "tec", 1, "45 min", 9, null],
          ["Couch stretch", "flex", 2, "60 s", null, "15 s"],
        ]},
        { titulo: "Escalada libre", ejercicios: [
          ["Indoor u outdoor", "roca", 1, "Libre", null, null, "Día de pegues al proyecto"],
        ]},
      ],
    },
  ],
};
