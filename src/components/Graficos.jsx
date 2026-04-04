import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { LOCALIDADES, PRODUCTOS } from '../data/mockData';

const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

const VERDE = '#22c55e';
const COLORES = ['#22c55e','#3b82f6','#a855f7','#f59e0b','#ef4444','#06b6d4'];

const TooltipCustom = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111827] border border-gray-700 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {typeof p.value === 'number' && p.value > 100 ? $$(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

function GraficoCard({ titulo, children }) {
  return (
    <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-5 fade-in">
      <h3 className="text-sm font-semibold text-white mb-4">{titulo}</h3>
      {children}
    </div>
  );
}

export default function Graficos() {
  const { pedidos: PEDIDOS } = useGoogleSheets();

  const { pedidosSemana, facturacionSemanas, productosTorta, localidadesBarra } = useMemo(() => {
    const hoy = new Date();

    // Pedidos por día última semana
    const pedidosSemana = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(hoy); d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().split('T')[0];
      const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
      const del_dia = PEDIDOS.filter(p => p.fecha === key);
      return {
        dia: dias[d.getDay()],
        pedidos: del_dia.length,
        facturacion: del_dia.reduce((s, p) => s + p.total, 0),
      };
    });

    // Facturación por semana (últimas 6)
    const facturacionSemanas = Array.from({ length: 6 }, (_, i) => {
      const semDesde = new Date(hoy); semDesde.setDate(semDesde.getDate() - (i + 1) * 7);
      const semHasta = new Date(hoy); semHasta.setDate(semHasta.getDate() - i * 7);
      const fmtDesde = semDesde.toISOString().split('T')[0];
      const fmtHasta = semHasta.toISOString().split('T')[0];
      const total = PEDIDOS
        .filter(p => p.fecha >= fmtDesde && p.fecha <= fmtHasta)
        .reduce((s, p) => s + p.total, 0);
      return { semana: `S-${i + 1}`, total };
    }).reverse();

    // Productos más vendidos
    const prodMap = {};
    PEDIDOS.forEach(p => {
      prodMap[p.producto] = (prodMap[p.producto] || 0) + p.cantidades;
    });
    const productosTorta = Object.entries(prodMap)
      .map(([name, value]) => ({ name: name.replace('COMBO ',''), value }))
      .sort((a, b) => b.value - a.value);

    // Pedidos por localidad
    const locMap = {};
    PEDIDOS.forEach(p => { locMap[p.localidad] = (locMap[p.localidad] || 0) + 1; });
    const localidadesBarra = Object.entries(locMap)
      .map(([localidad, pedidos]) => ({ localidad, pedidos }))
      .sort((a, b) => b.pedidos - a.pedidos)
      .slice(0, 10);

    return { pedidosSemana, facturacionSemanas, productosTorta, localidadesBarra };
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Gráficos</h2>
        <p className="text-gray-500 text-sm mt-1">Análisis visual del desempeño</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pedidos por día */}
        <GraficoCard titulo="Pedidos por día — última semana">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pedidosSemana} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="dia" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<TooltipCustom />} />
              <Bar dataKey="pedidos" name="Pedidos" fill={VERDE} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </GraficoCard>

        {/* Facturación semanal */}
        <GraficoCard titulo="Facturación por semana">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={facturacionSemanas}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="semana" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<TooltipCustom />} />
              <Line type="monotone" dataKey="total" name="Facturación" stroke={VERDE} strokeWidth={2} dot={{ fill: VERDE, r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </GraficoCard>

        {/* Torta de productos */}
        <GraficoCard titulo="Productos más vendidos">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={productosTorta} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} paddingAngle={3}>
                {productosTorta.map((_, i) => (
                  <Cell key={i} fill={COLORES[i % COLORES.length]} />
                ))}
              </Pie>
              <Tooltip content={<TooltipCustom />} />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }} />
            </PieChart>
          </ResponsiveContainer>
        </GraficoCard>

        {/* Localidades */}
        <GraficoCard titulo="Pedidos por localidad">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={localidadesBarra} layout="vertical" barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="localidad" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
              <Tooltip content={<TooltipCustom />} />
              <Bar dataKey="pedidos" name="Pedidos" fill="#3b82f6" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </GraficoCard>
      </div>
    </div>
  );
}
