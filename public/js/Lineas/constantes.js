// ================================================================
// Líneas de proceso - Constantes y paleta de colores
// ================================================================
// Definiciones inmutables compartidas por todos los módulos de líneas.

// Paleta fija: los primeros 3 son fijos por convención de la empresa,
// los otros 7 son configurables y renombrables por P&ID.
var COLORES_LINEA = [
  { indice: 0, color: '#FFC107', fijo: true  }, // Gas (amarillo)
  { indice: 1, color: '#795548', fijo: true  }, // Petróleo (marrón)
  { indice: 2, color: '#4FC3F7', fijo: true  }, // Agua (celeste)
  { indice: 3, color: '#E53935', fijo: false }, // rojo
  { indice: 4, color: '#43A047', fijo: false }, // verde
  { indice: 5, color: '#FB8C00', fijo: false }, // naranja
  { indice: 6, color: '#8E24AA', fijo: false }, // violeta
  { indice: 7, color: '#EC407A', fijo: false }, // rosa
  { indice: 8, color: '#00897B', fijo: false }, // turquesa
  { indice: 9, color: '#607D8B', fijo: false }  // gris
];

// Nombres por defecto (los renombrables son los índices >= 3)
var NOMBRES_COLORES_LINEA_DEFAULT = [
  'Gas', 'Petróleo', 'Agua',
  'Color 4', 'Color 5', 'Color 6', 'Color 7', 'Color 8', 'Color 9', 'Color 10'
];