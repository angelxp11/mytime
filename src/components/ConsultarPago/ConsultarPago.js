import React, { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { FiX, FiCalendar, FiClock } from 'react-icons/fi';
import { db } from '../server/api';
import './ConsultarPago.css';
import Loading from '../loading/loading';

const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createDateFromString = (dateStr) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getTodayDateInput = () => formatLocalDate(new Date());

const formatFechaDisplay = (dateStr) => {
  const date = createDateFromString(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const monthNames = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

const formatHoras = (horas) => {
  const h = Math.floor(horas);
  const m = Math.round((horas - h) * 60);
  return `${h}h ${m}m`;
};

const ConsultarPago = ({ user, setCurrentView }) => {
  const [startDate, setStartDate] = useState(getTodayDateInput());
  const [endDate, setEndDate] = useState(getTodayDateInput());
  const [trabajos, setTrabajos] = useState([]);
  const [selectedTrabajo, setSelectedTrabajo] = useState('');
  const [diasData, setDiasData] = useState({});
  const [loading, setLoading] = useState(false);
  const [calculations, setCalculations] = useState(null);

  useEffect(() => {
    if (!user) return;
    loadTrabajos();
    loadDiasData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadTrabajos = async () => {
    try {
      const q = query(collection(db, 'trabajos'), where('userId', '==', user.uid));
      const querySnapshot = await getDocs(q);
      const trabajosList = [];
      querySnapshot.forEach((doc) => {
        trabajosList.push({ id: doc.id, ...doc.data() });
      });
      setTrabajos(trabajosList);
      if (trabajosList.length > 0) {
        setSelectedTrabajo(trabajosList[0].id);
      }
    } catch (error) {
      console.error('Error cargando trabajos:', error);
    }
  };

  const loadDiasData = async () => {
    try {
      const docRef = doc(db, 'horasTrabajadas', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setDiasData(docSnap.data().dias || {});
      }
    } catch (error) {
      console.error('Error cargando datos de días:', error);
    }
  };

  const calculatePayment = () => {
    setLoading(true);
    try {
      const trabajo = trabajos.find((t) => t.id === selectedTrabajo);
      if (!trabajo) {
        setLoading(false);
        return;
      }

      const startDateTime = createDateFromString(startDate);
      const endDateTime = createDateFromString(endDate);

      const isDominicalDate = (dateStr) => {
        const dayDataForDate = diasData[dateStr] || {};
        const dayOfWeek = createDateFromString(dateStr).getDay();
        return dayDataForDate.festivo === true
          || dayDataForDate.holiday === true
          || dayDataForDate.esFestivo === true
          || dayOfWeek === 0;
      };

      const diasLaborados = [];
      let totalHoras = 0;
      let horasDiurnas = 0;
      let horasNocturnas = 0;
      let horasDiurnaDominical = 0;
      let horasNocturnaDominical = 0;
      let horasExtraDiurna = 0;
      let horasExtraNocturna = 0;
      let horasExtraDominicalDiurna = 0;
      let horasExtraDominicalNocturna = 0;
      let diasDescanso = 0;
      let diasIncapacidadComun = 0;
      let diasIncapacidadLaboral = 0;

      // Iterar sobre los días en el rango usando fechas locales
      for (let d = new Date(startDateTime); d <= endDateTime; d.setDate(d.getDate() + 1)) {
        const dateStr = formatLocalDate(d);
        const dayData = diasData[dateStr];

        if (dayData) {
          if (dayData.tipo === 'trabajado' && dayData.entrada && dayData.salida) {
            const [entryH, entryM] = dayData.entrada.split(':').map(Number);
            const [exitH, exitM] = dayData.salida.split(':').map(Number);
            const entryTime = entryH + entryM / 60;
            const exitTime = exitH + exitM / 60;

            const [diurnalStartH, diurnalStartM] = (trabajo.diurnalStart || '06:00').split(':').map(Number);
            const [diurnalEndH, diurnalEndM] = (trabajo.diurnalEnd || '19:00').split(':').map(Number);
            const diurnalStartTime = diurnalStartH + diurnalStartM / 60;
            const diurnalEndTime = diurnalEndH + diurnalEndM / 60;

            // Detectar si el turno cruza medianoche (salida < entrada)
            const cruzaMedianoche = exitTime < entryTime;

            if (cruzaMedianoche) {
              // Primera parte: entrada hasta medianoche (mismo día)
              const horasPrimeraDia = 24 - entryTime;
              const isDominical1 = isDominicalDate(dateStr);

              const horasDiurnasParte1 = Math.max(0, Math.min(diurnalEndTime, 24) - entryTime);
              const horasNocturnasParte1 = horasPrimeraDia - horasDiurnasParte1;

              if (isDominical1) {
                horasDiurnaDominical += horasDiurnasParte1;
                horasNocturnaDominical += horasNocturnasParte1;
              } else {
                horasDiurnas += horasDiurnasParte1;
                horasNocturnas += horasNocturnasParte1;
              }

              // Segunda parte: medianoche hasta salida (día siguiente)
              const nextDate = createDateFromString(dateStr);
              nextDate.setDate(nextDate.getDate() + 1);
              const nextDateStr = formatLocalDate(nextDate);
              const isDominical2 = isDominicalDate(nextDateStr);

              const horasSegundaDia = exitTime;
              const horasDiurnasParte2 = Math.max(0, Math.min(exitTime, diurnalEndTime) - diurnalStartTime);
              const horasNocturnasParte2 = horasSegundaDia - horasDiurnasParte2;

              if (isDominical2) {
                horasDiurnaDominical += horasDiurnasParte2;
                horasNocturnaDominical += horasNocturnasParte2;
              } else {
                horasDiurnas += horasDiurnasParte2;
                horasNocturnas += horasNocturnasParte2;
              }

              totalHoras += horasPrimeraDia + horasSegundaDia;
            } else {
              // Turno dentro del mismo día (sin cruzar medianoche)
              const horasTotal = exitTime - entryTime;
              const isDominical = isDominicalDate(dateStr);

              const horasDiurnasHoy = Math.max(0, Math.min(exitTime, diurnalEndTime) - Math.max(entryTime, diurnalStartTime));
              const horasNoctuarnasHoy = horasTotal - horasDiurnasHoy;

              if (isDominical) {
                horasDiurnaDominical += horasDiurnasHoy;
                horasNocturnaDominical += horasNoctuarnasHoy;
              } else {
                horasDiurnas += horasDiurnasHoy;
                horasNocturnas += horasNoctuarnasHoy;
              }

              totalHoras += horasTotal;
            }

            diasLaborados.push({
              fecha: dateStr,
              horas: cruzaMedianoche ? 24 - entryTime + exitTime : exitTime - entryTime,
              horaEntrada: dayData.entrada,
              horaSalida: dayData.salida,
            });
          } else if (dayData.tipo === 'descanso') {
            diasDescanso++;
          } else if (dayData.tipo === 'incapacidad_comun') {
            diasIncapacidadComun++;
          } else if (dayData.tipo === 'incapacidad_laboral') {
            diasIncapacidadLaboral++;
          }
        }
      }

      const baseHourly = trabajo.baseHourly || 0;
      const pagoBase = horasDiurnas * baseHourly;
      const pagoNocturno = horasNocturnas * baseHourly * (1 + (trabajo.nocturnoPct || 35) / 100);
      const pagoDiurnaDominical = horasDiurnaDominical * baseHourly * (1 + (trabajo.dominicalPct || 90) / 100);
      const pagoNocturnaDominical = horasNocturnaDominical * baseHourly * (1 + ((trabajo.nocturnoPct || 35) + (trabajo.dominicalPct || 90)) / 100);
      const pagoExtraDiurna = horasExtraDiurna * baseHourly * (1 + (trabajo.extraDiurnaPct || 25) / 100);
      const pagoExtraNocturna = horasExtraNocturna * baseHourly * (1 + (trabajo.extraNocturnaPct || 75) / 100);
      const pagoExtraDominicalDiurna = horasExtraDominicalDiurna * baseHourly * (1 + (trabajo.extraDominicalDiurnaPct || 115) / 100);
      const pagoExtraDominicalNocturna = horasExtraDominicalNocturna * baseHourly * (1 + (trabajo.extraDominicalNocturnaPct || 165) / 100);
      const pagoIncapacidadComun = diasIncapacidadComun * 8 * baseHourly * ((trabajo.incapacidadComunPct || 66.67) / 100);
      const pagoIncapacidadLaboral = diasIncapacidadLaboral * 8 * baseHourly * ((trabajo.incapacidadLaboralPct || 100) / 100);
      const auxilioTransporte = (trabajo.auxilioTransporteDiario || 0) * diasLaborados.length;

      const totalPago = pagoBase + pagoNocturno + pagoDiurnaDominical + pagoNocturnaDominical + pagoExtraDiurna + pagoExtraNocturna +
        pagoExtraDominicalDiurna + pagoExtraDominicalNocturna + pagoIncapacidadComun +
        pagoIncapacidadLaboral + auxilioTransporte;

      setCalculations({
        trabajo: trabajo.workName,
        startDate,
        endDate,
        diasLaborados: diasLaborados.length,
        totalHoras,
        horasDiurnas,
        horasNocturnas,
        horasDiurnaDominical,
        horasNocturnaDominical,
        horasExtraDiurna,
        horasExtraNocturna,
        horasExtraDominicalDiurna,
        horasExtraDominicalNocturna,
        diasDescanso,
        diasIncapacidadComun,
        diasIncapacidadLaboral,
        baseHourly,
        pagoBase,
        pagoNocturno,
        pagoDiurnaDominical,
        pagoNocturnaDominical,
        pagoExtraDiurna,
        pagoExtraNocturna,
        pagoExtraDominicalDiurna,
        pagoExtraDominicalNocturna,
        pagoIncapacidadComun,
        pagoIncapacidadLaboral,
        auxilioTransporte,
        totalPago,
        detalles: diasLaborados,
      });
    } catch (error) {
      console.error('Error en cálculo de pago:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = () => {
  if (!calculations) return;

  try {
    const { jsPDF } = require('jspdf');

    const pdf = new jsPDF('p', 'mm', 'a4');

    // Helpers
    const formatMoney = (value) =>
      `$${Math.floor(value).toLocaleString('es-CO')}`;

    let y = 15;

    // 🧾 TITULO
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text('REPORTE DE PAGO', 105, y, { align: 'center' });

    y += 10;

    // Línea
    pdf.setDrawColor(200);
    pdf.line(15, y, 195, y);

    y += 8;

    // 📄 INFO GENERAL
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');

    pdf.text(`Trabajo: ${calculations.trabajo}`, 15, y);
    y += 6;
    pdf.text(`Periodo: ${calculations.startDate} a ${calculations.endDate}`, 15, y);

    y += 10;

    // 🧮 TABLA
    const rows = [
      ['Horas Diurnas', formatHoras(calculations.horasDiurnas), formatMoney(calculations.pagoBase)],
      ['Horas Nocturnas', formatHoras(calculations.horasNocturnas), formatMoney(calculations.pagoNocturno)],
      ['Diurna Dominical', formatHoras(calculations.horasDiurnaDominical), formatMoney(calculations.pagoDiurnaDominical)],
      ['Nocturna Dominical', formatHoras(calculations.horasNocturnaDominical), formatMoney(calculations.pagoNocturnaDominical)],
      ['Extra Diurna', formatHoras(calculations.horasExtraDiurna), formatMoney(calculations.pagoExtraDiurna)],
      ['Extra Nocturna', formatHoras(calculations.horasExtraNocturna), formatMoney(calculations.pagoExtraNocturna)],
      ['Extra Dom. Diurna', formatHoras(calculations.horasExtraDominicalDiurna), formatMoney(calculations.pagoExtraDominicalDiurna)],
      ['Extra Dom. Nocturna', formatHoras(calculations.horasExtraDominicalNocturna), formatMoney(calculations.pagoExtraDominicalNocturna)],
      ['Incapacidad Común', `${calculations.diasIncapacidadComun} días`, formatMoney(calculations.pagoIncapacidadComun)],
      ['Incapacidad Laboral', `${calculations.diasIncapacidadLaboral} días`, formatMoney(calculations.pagoIncapacidadLaboral)],
      ['Auxilio Transporte', `${calculations.detalles.length} días`, formatMoney(calculations.auxilioTransporte)],
    ];

    // Encabezados
    pdf.setFont('helvetica', 'bold');
    pdf.setFillColor(30, 41, 59); // oscuro
    pdf.setTextColor(255, 255, 255);

    pdf.rect(15, y, 180, 8, 'F');
    pdf.text('Concepto', 17, y + 5);
    pdf.text('Cantidad', 90, y + 5);
    pdf.text('Pago', 160, y + 5);

    y += 10;

    // Filas
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(0, 0, 0);

    rows.forEach((row, i) => {
      if (i % 2 === 0) {
        pdf.setFillColor(245, 245, 245);
        pdf.rect(15, y - 4, 180, 8, 'F');
      }

      pdf.text(row[0], 17, y);
      pdf.text(row[1], 90, y);
      pdf.text(row[2], 160, y, { align: 'right' });

      y += 8;
    });

    // 💰 TOTAL
    y += 5;

    pdf.setFont('helvetica', 'bold');
    pdf.setFillColor(30, 41, 59);
    pdf.setTextColor(255, 255, 255);

    pdf.rect(15, y - 4, 180, 10, 'F');

    pdf.text('TOTAL A PAGAR', 17, y + 2);
    pdf.text(formatHoras(calculations.totalHoras), 90, y + 2);
    pdf.text(formatMoney(calculations.totalPago), 160, y + 2, { align: 'right' });

    // 📅 FOOTER
    y += 15;

    pdf.setTextColor(100);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'italic');

    const today = new Date().toLocaleDateString('es-CO');
    pdf.text(`Generado el: ${today}`, 15, y);

    // 💾 GUARDAR
    pdf.save(`Calculo_Pago_${calculations.trabajo}_${calculations.startDate}.pdf`);

  } catch (error) {
    console.error('Error generando PDF:', error);
  }
};

  if (loading && !calculations) {
    return (
      <div className="consultar-pago-overlay">
        <div className="consultar-pago-modal">
          <Loading text="Calculando pago..." />
        </div>
      </div>
    );
  }

  return (
    <div className="consultar-pago-overlay">
      <div className="consultar-pago-modal">
        <div className="consultar-pago-header">
          <div className="consultar-pago-title">
            <FiClock size={24} />
            <div>
              <h2>Consultar Pago</h2>
              <p>Calcula tu salario según el período y trabajo seleccionado.</p>
            </div>
          </div>
          <button
            type="button"
            className="consultar-pago-close"
            onClick={() => setCurrentView('home')}
            aria-label="Cerrar modal"
          >
            <FiX size={20} />
          </button>
        </div>

        {!calculations ? (
          <form className="consultar-pago-form">
            <div className="form-section">
              <div className="form-group">
                <label htmlFor="startDate">
                  <FiCalendar size={16} />
                  Fecha Inicial
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="endDate">
                  <FiCalendar size={16} />
                  Fecha Final
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="trabajo">Seleccionar Trabajo</label>
                <select
                  id="trabajo"
                  value={selectedTrabajo}
                  onChange={(e) => setSelectedTrabajo(e.target.value)}
                >
                  {trabajos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.workName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="consultar-pago-actions">
              <button type="button" className="btn-calculate" onClick={calculatePayment}>
                Calcular Pago
              </button>
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setCurrentView('home')}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="results-section">
            <div id="calculation-report" className="calculation-report">
              <h3>Reporte de Cálculo de Pago</h3>
              <div className="report-header">
                <p><strong>Trabajo:</strong> {calculations.trabajo}</p>
                <p><strong>Período:</strong> {formatFechaDisplay(calculations.startDate)} a {formatFechaDisplay(calculations.endDate)}</p>
              </div>

              <div className="report-section">
                <h4>Resumen de Horas y Pago</h4>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Cantidad</th>
                      <th>Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Horas Diurnas</td>
                      <td>{formatHoras(calculations.horasDiurnas)}</td>
                      <td>${Math.floor(calculations.pagoBase).toLocaleString('es-CO')}</td>
                    </tr>
                    <tr>
                      <td>Horas Nocturnas</td>
                      <td>{formatHoras(calculations.horasNocturnas)}</td>
                      <td>${Math.floor(calculations.pagoNocturno).toLocaleString('es-CO')}</td>
                    </tr>
                    <tr>
                      <td>Horas Diurnas Dominical</td>
                      <td>{formatHoras(calculations.horasDiurnaDominical)}</td>
                      <td>${Math.floor(calculations.pagoDiurnaDominical).toLocaleString('es-CO')}</td>
                    </tr>
                    <tr>
                      <td>Horas Nocturnas Dominical</td>
                      <td>{formatHoras(calculations.horasNocturnaDominical)}</td>
                      <td>${Math.floor(calculations.pagoNocturnaDominical).toLocaleString('es-CO')}</td>
                    </tr>
                    <tr>
                      <td>Horas Extra Diurna</td>
                      <td>{formatHoras(calculations.horasExtraDiurna)}</td>
                      <td>${Math.floor(calculations.pagoExtraDiurna).toLocaleString('es-CO')}</td>
                    </tr>
                    <tr>
                      <td>Horas Extra Nocturna</td>
                      <td>{formatHoras(calculations.horasExtraNocturna)}</td>
                      <td>${Math.floor(calculations.pagoExtraNocturna).toLocaleString('es-CO')}</td>
                    </tr>
                    <tr>
                      <td>Horas Extra Dominical Diurna</td>
                      <td>{formatHoras(calculations.horasExtraDominicalDiurna)}</td>
                      <td>${Math.floor(calculations.pagoExtraDominicalDiurna).toLocaleString('es-CO')}</td>
                    </tr>
                    <tr>
                      <td>Horas Extra Dominical Nocturna</td>
                      <td>{formatHoras(calculations.horasExtraDominicalNocturna)}</td>
                      <td>${Math.floor(calculations.pagoExtraDominicalNocturna).toLocaleString('es-CO')}</td>
                    </tr>
                    <tr>
                      <td>Incapacidad Común</td>
                      <td>{calculations.diasIncapacidadComun} días</td>
                      <td>${Math.floor(calculations.pagoIncapacidadComun).toLocaleString('es-CO')}</td>
                    </tr>
                    <tr>
                      <td>Incapacidad Laboral</td>
                      <td>{calculations.diasIncapacidadLaboral} días</td>
                      <td>${Math.floor(calculations.pagoIncapacidadLaboral).toLocaleString('es-CO')}</td>
                    </tr>
                    <tr>
                      <td>Auxilio de Transporte</td>
                      <td>{calculations.detalles.length} días</td>
                      <td>${Math.floor(calculations.auxilioTransporte).toLocaleString('es-CO')}</td>
                    </tr>
                    <tr className="total-row">
                      <td><strong>TOTAL A PAGAR</strong></td>
                      <td><strong>{formatHoras(calculations.totalHoras)}</strong></td>
                      <td><strong>${Math.floor(calculations.totalPago).toLocaleString('es-CO')}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="action-buttons">
              <button className="btn-download" onClick={downloadPDF}>
                Descargar PDF
              </button>
              <button className="btn-new-calculation" onClick={() => setCalculations(null)}>
                Nuevo Cálculo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConsultarPago;
