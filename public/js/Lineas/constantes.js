// ================================================================
// Líneas de proceso - Constantes y paleta de colores
// ================================================================
// Definiciones inmutables compartidas por todos los módulos de líneas.

// Paleta fija: los primeros 3 son fijos por convención de la empresa,
// los otros 7 son configurables y renombrables por P&ID.
var COLORES_LINEA = [
  { indice: 0, color: '#FFEE58', fijo: true  }, // Gas (amarillo claro)
  { indice: 1, color: '#795548', fijo: true  }, // Petróleo (marrón)
  { indice: 2, color: '#4FC3F7', fijo: true  }, // Agua (celeste)
  { indice: 3, color: '#C62828', fijo: false }, // rojo intenso
  { indice: 4, color: '#9CCC65', fijo: false }, // verde claro
  { indice: 5, color: '#EF6C00', fijo: false }, // naranja oscuro
  { indice: 6, color: '#8E24AA', fijo: false }, // violeta
  { indice: 7, color: '#0D47A1', fijo: false }, // azul oscuro
  { indice: 8, color: '#1B5E20', fijo: false }, // verde oscuro
  { indice: 9, color: '#607D8B', fijo: false }  // gris
];

// Nombres por defecto (los renombrables son los índices >= 3)
var NOMBRES_COLORES_LINEA_DEFAULT = [
  'Gas', 'Petróleo', 'Agua',
  'Color 4', 'Color 5', 'Color 6', 'Color 7', 'Color 8', 'Color 9', 'Color 10'
];