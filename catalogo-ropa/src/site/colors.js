/** Nombre de color (español) → hex para muestras en filtros y tarjetas. */
export const COLOR_HEX = {
  negro: '#111111', blanco: '#ffffff', gris: '#8d8f92', 'gris oscuro': '#4a4b4d', 'gris claro': '#c9cacc',
  beige: '#d9c7a7', crudo: '#ece6da', albaricoque: '#f2c8a0', caqui: '#a39167', 'marrón': '#6b4a32', camel: '#b08a5b',
  'azul marino': '#1f2a44', azul: '#2f5fa7', 'azul claro': '#a9c4e0', verde: '#3c7a4b', 'verde militar': '#5b6340',
  'verde oscuro': '#25402f', rojo: '#b3261e', burdeos: '#6d1a2b', rosa: '#e8b4bc', morado: '#6a4c93', amarillo: '#e8c547', naranja: '#e07b39',
};

export function colorHex(name) {
  return COLOR_HEX[String(name || '').toLowerCase()] || '#cccccc';
}
