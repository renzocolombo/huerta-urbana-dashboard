import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const files = [
  'Resumen.jsx', 'Graficos.jsx', 'PedidosDelDia.jsx', 'IAFlotante.jsx', 
  'Historial.jsx', 'Clientes.jsx', 'AgendaEntregas.jsx', 'RutaOptimizada.jsx', 
  'ControlStock.jsx', 'Reportes.jsx'
];

files.forEach(file => {
  const p = path.join(__dirname, 'src', 'components', file);
  if (!fs.existsSync(p)) return;
  
  let content = fs.readFileSync(p, 'utf8');
  
  if (content.includes('useGoogleSheets')) {
     console.log('Skipping', file);
     return;
  }

  // 1. Reemplazar import mockData retirando PEDIDOS (si existe PEDIDOS dentro de mockData)
  content = content.replace(/import\s+\{\s*([^}]*?)\s*\}\s+from\s+['"]\.\.\/data\/mockData['"];/g, (match, names) => {
    let cleanNames = names.split(',').map(n => n.trim()).filter(n => n !== 'PEDIDOS').join(', ');
    if (cleanNames.length === 0) return '';
    return `import { ${cleanNames} } from '../data/mockData';`;
  });

  // 1b. Inyectar import useGoogleSheets
  content = `import { useGoogleSheets } from '../context/GoogleSheetsContext';\n` + content;

  // 2. Inyectar const { pedidos: PEDIDOS } = useGoogleSheets(); dentro de la función default
  content = content.replace(/export\s+default\s+function\s+(\w+)\s*\(([^)]*)\)\s*\{/g, (match) => {
    return match + `\n  const { pedidos: PEDIDOS } = useGoogleSheets();\n`;
  });
  
  // Excepción para IAFlotante si no hizo match en la regla anterior
  if (file === 'IAFlotante.jsx' && !content.includes('const { pedidos: PEDIDOS } = useGoogleSheets();')) {
      content = content.replace(/export\s+default\s+function\s+IAFlotante\s*\(\)\s*\{/, "export default function IAFlotante() {\n  const { pedidos: PEDIDOS } = useGoogleSheets();\n");
  }

  fs.writeFileSync(p, content);
  console.log('Refactored:', file);
});
