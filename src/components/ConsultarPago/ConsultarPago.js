import React, { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { FiX, FiCalendar, FiClock } from 'react-icons/fi';
import { db } from '../server/api';
import './ConsultarPago.css';
import Loading from '../loading/loading';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

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
  const hours = Math.floor(horas);
  const minutes = Math.round((horas - hours) * 60);
  return `${hours}h ${minutes}m`;
};

const ConsultarPago = ({ user, setCurrentView }) => {
  const [startDate, setStartDate] = useState(getTodayDateInput());
  const [endDate, setEndDate] = useState(getTodayDateInput());
  const [trabajos, setTrabajos] = useState([]);
  const [selectedTrabajo, setSelectedTrabajo] = useState('');
  const [diasData, setDiasData] = useState({});
  const [loading, setLoading] = useState(false);
  const [calculations, setCalculations] = useState(null);
  const [reportMode, setReportMode] = useState('classic');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState('month');
  const [selectingMode, setSelectingMode] = useState('start'); // 'start' or 'end'

  const formatMonthYear = (locale, date) => {
    const formatted = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  const handleActiveStartDateChange = ({ activeStartDate }) => {
    setCurrentMonth(activeStartDate);
  };

  const handleViewChange = ({ activeStartDate, view: nextView }) => {
    if (activeStartDate) setCurrentMonth(activeStartDate);
    if (nextView) setView(nextView);
  };

  const handleMonthClick = () => {
    setView(prev => {
      if (prev === 'month') return 'year';
      if (prev === 'year') return 'decade';
      return 'month';
    });
  };

  const handleDayClick = (date) => {
    const dateStr = formatLocalDate(date);
    if (selectingMode === 'start') {
      setStartDate(dateStr);
    } else {
      setEndDate(dateStr);
    }
  };

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

      const normalizeHourlyValue = (value, baseValue, fallback) => {
        if (typeof value === 'number' && !Number.isNaN(value) && value > 0) {
          return value < baseValue ? baseValue + value : value;
        }
        return fallback;
      };

      const baseHourly = trabajo.baseHourly || 0;
      const nocturnaHourly = normalizeHourlyValue(
        trabajo.values?.nocturna,
        baseHourly,
        baseHourly * (1 + (trabajo.nocturnoPct || 35) / 100)
      );
      const dominicalHourly = normalizeHourlyValue(
        trabajo.values?.dominical,
        baseHourly,
        baseHourly * (1 + (trabajo.dominicalPct || 90) / 100)
      );
      const extraDiurnaHourly = normalizeHourlyValue(
        trabajo.values?.extraDiurna,
        baseHourly,
        baseHourly * (1 + (trabajo.extraDiurnaPct || 25) / 100)
      );
      const extraNocturnaHourly = normalizeHourlyValue(
        trabajo.values?.extraNocturna,
        baseHourly,
        baseHourly * (1 + (trabajo.extraNocturnaPct || 75) / 100)
      );
      const extraDominicalDiurnaHourly = normalizeHourlyValue(
        trabajo.values?.extraDominicalDiurna,
        baseHourly,
        baseHourly * (1 + (trabajo.extraDominicalDiurnaPct || 115) / 100)
      );
      const extraDominicalNocturnaHourly = normalizeHourlyValue(
        trabajo.values?.extraDominicalNocturna,
        baseHourly,
        baseHourly * (1 + (trabajo.extraDominicalNocturnaPct || 165) / 100)
      );
      const incapacidadComunHourly = normalizeHourlyValue(
        trabajo.values?.incapacidadComun,
        baseHourly,
        baseHourly * ((trabajo.incapacidadComunPct || 66.67) / 100)
      );
      const incapacidadLaboralHourly = normalizeHourlyValue(
        trabajo.values?.incapacidadLaboral,
        baseHourly,
        baseHourly * ((trabajo.incapacidadLaboralPct || 100) / 100)
      );
      const nocturnaDominicalHourly = nocturnaHourly + dominicalHourly - baseHourly;

      const pagoBase = horasDiurnas * baseHourly;
      const pagoNocturno = horasNocturnas * nocturnaHourly;
      const pagoDiurnaDominical = horasDiurnaDominical * dominicalHourly;
      const pagoNocturnaDominical = horasNocturnaDominical * nocturnaDominicalHourly;
      const pagoExtraDiurna = horasExtraDiurna * extraDiurnaHourly;
      const pagoExtraNocturna = horasExtraNocturna * extraNocturnaHourly;
      const pagoExtraDominicalDiurna = horasExtraDominicalDiurna * extraDominicalDiurnaHourly;
      const pagoExtraDominicalNocturna = horasExtraDominicalNocturna * extraDominicalNocturnaHourly;
      const pagoIncapacidadComun = diasIncapacidadComun * 8 * incapacidadComunHourly;
      const pagoIncapacidadLaboral = diasIncapacidadLaboral * 8 * incapacidadLaboralHourly;
      const auxilioTransporte = (trabajo.auxilioTransporteDiario || 0) * diasLaborados.length;

      const pagoNocturnoRecargo = horasNocturnas * (nocturnaHourly - baseHourly);
      const pagoDiurnaDominicalRecargo = horasDiurnaDominical * (dominicalHourly - baseHourly);
      const pagoNocturnaDominicalRecargo = horasNocturnaDominical * (nocturnaDominicalHourly - baseHourly);
      const pagoExtraDiurnaRecargo = horasExtraDiurna * (extraDiurnaHourly - baseHourly);
      const pagoExtraNocturnaRecargo = horasExtraNocturna * (extraNocturnaHourly - baseHourly);
      const pagoExtraDominicalDiurnaRecargo = horasExtraDominicalDiurna * (extraDominicalDiurnaHourly - baseHourly);
      const pagoExtraDominicalNocturnaRecargo = horasExtraDominicalNocturna * (extraDominicalNocturnaHourly - baseHourly);

      const totalDominicalHours = horasDiurnaDominical + horasNocturnaDominical + horasExtraDominicalDiurna + horasExtraDominicalNocturna;
      const totalDominicalAmount = totalDominicalHours * dominicalHourly;

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
        pagoNocturnoRecargo,
        pagoDiurnaDominical,
        pagoDiurnaDominicalRecargo,
        pagoNocturnaDominical,
        pagoNocturnaDominicalRecargo,
        pagoExtraDiurna,
        pagoExtraDiurnaRecargo,
        pagoExtraNocturna,
        pagoExtraNocturnaRecargo,
        pagoExtraDominicalDiurna,
        pagoExtraDominicalDiurnaRecargo,
        pagoExtraDominicalNocturna,
        pagoExtraDominicalNocturnaRecargo,
        pagoIncapacidadComun,
        pagoIncapacidadLaboral,
        auxilioTransporte,
        totalDominicalHours,
        totalDominicalAmount,
        valorDominical: dominicalHourly,
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
    const pdfRows = reportMode === 'classic'
      ? [
          {
            label: 'Horas Diurnas',
            quantityLabel: formatHoras(calculations.horasDiurnas),
            amount: calculations.pagoBase,
          },
          {
            label: 'Horas Nocturnas',
            quantityLabel: formatHoras(calculations.horasNocturnas),
            amount: calculations.pagoNocturno,
          },
          {
            label: 'Horas Diurnas Dominical',
            quantityLabel: formatHoras(calculations.horasDiurnaDominical),
            amount: calculations.pagoDiurnaDominical,
          },
          {
            label: 'Horas Nocturnas Dominical',
            quantityLabel: formatHoras(calculations.horasNocturnaDominical),
            amount: calculations.pagoNocturnaDominical,
          },
          {
            label: 'Horas Extra Diurna',
            quantityLabel: formatHoras(calculations.horasExtraDiurna),
            amount: calculations.pagoExtraDiurna,
          },
          {
            label: 'Horas Extra Nocturna',
            quantityLabel: formatHoras(calculations.horasExtraNocturna),
            amount: calculations.pagoExtraNocturna,
          },
          {
            label: 'Horas Extra Dominical Diurna',
            quantityLabel: formatHoras(calculations.horasExtraDominicalDiurna),
            amount: calculations.pagoExtraDominicalDiurna,
          },
          {
            label: 'Horas Extra Dominical Nocturna',
            quantityLabel: formatHoras(calculations.horasExtraDominicalNocturna),
            amount: calculations.pagoExtraDominicalNocturna,
          },
          {
            label: 'Incapacidad Común',
            quantityLabel: `${calculations.diasIncapacidadComun} días`,
            amount: calculations.pagoIncapacidadComun,
          },
          {
            label: 'Incapacidad Laboral',
            quantityLabel: `${calculations.diasIncapacidadLaboral} días`,
            amount: calculations.pagoIncapacidadLaboral,
          },
          {
            label: 'Auxilio Transporte',
            quantityLabel: `${calculations.detalles.length} días`,
            amount: calculations.auxilioTransporte,
          },
        ]
      : [
          {
            label: 'Horas Diarias',
            quantityLabel: formatHoras(calculations.totalHoras),
            amount: calculations.totalHoras * calculations.baseHourly,
          },
          {
            label: 'Recargo Nocturno',
            quantityLabel: formatHoras(calculations.horasNocturnas + calculations.horasExtraNocturna),
            amount:
              (calculations.pagoNocturnoRecargo || 0) +
              (calculations.pagoExtraNocturnaRecargo || 0),
          },
          {
            label: 'Horas Dominicales',
            quantityLabel: formatHoras(calculations.totalDominicalHours),
            amount: calculations.totalDominicalAmount,
          },
          {
            label: 'Auxilio Transporte',
            quantityLabel: `${calculations.detalles.length} días`,
            amount: calculations.auxilioTransporte,
          },
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

    pdfRows.forEach((row, i) => {
      if (i % 2 === 0) {
        pdf.setFillColor(245, 245, 245);
        pdf.rect(15, y - 4, 180, 8, 'F');
      }

      pdf.text(row.label, 17, y);
      pdf.text(row.quantityLabel, 90, y);
      pdf.text(formatMoney(row.amount), 160, y, { align: 'right' });

      y += 8;
    });

    // 💰 TOTAL
    y += 5;

    pdf.setFont('helvetica', 'bold');
    pdf.setFillColor(30, 41, 59);
    pdf.setTextColor(255, 255, 255);

    pdf.rect(15, y - 4, 180, 10, 'F');

    const pdfTotalAmount = pdfRows.reduce((sum, row) => sum + row.amount, 0);

    pdf.text('TOTAL A PAGAR', 17, y + 2);
    pdf.text(formatHoras(calculations.totalHoras), 90, y + 2);
    pdf.text(formatMoney(pdfTotalAmount), 160, y + 2, { align: 'right' });

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

  const recargoNocturnoHours = calculations
    ? calculations.horasNocturnas + calculations.horasExtraNocturna + calculations.horasNocturnaDominical + calculations.horasExtraDominicalNocturna
    : 0;
  const recargoDominicalHours = calculations
    ? calculations.horasDiurnaDominical + calculations.horasNocturnaDominical + calculations.horasExtraDominicalDiurna + calculations.horasExtraDominicalNocturna
    : 0;

  const reportRows = calculations ? (
    reportMode === 'classic'
      ? [
          {
            label: 'Horas Diurnas',
            quantity: calculations.horasDiurnas,
            amount: calculations.pagoBase,
          },
          {
            label: 'Horas Nocturnas',
            quantity: calculations.horasNocturnas,
            amount: calculations.pagoNocturno,
          },
          {
            label: 'Horas Diurnas Dominical',
            quantity: calculations.horasDiurnaDominical,
            amount: calculations.pagoDiurnaDominical,
          },
          {
            label: 'Horas Nocturnas Dominical',
            quantity: calculations.horasNocturnaDominical,
            amount: calculations.pagoNocturnaDominical,
          },
          {
            label: 'Horas Extra Diurna',
            quantity: calculations.horasExtraDiurna,
            amount: calculations.pagoExtraDiurna,
          },
          {
            label: 'Horas Extra Nocturna',
            quantity: calculations.horasExtraNocturna,
            amount: calculations.pagoExtraNocturna,
          },
          {
            label: 'Horas Extra Dominical Diurna',
            quantity: calculations.horasExtraDominicalDiurna,
            amount: calculations.pagoExtraDominicalDiurna,
          },
          {
            label: 'Horas Extra Dominical Nocturna',
            quantity: calculations.horasExtraDominicalNocturna,
            amount: calculations.pagoExtraDominicalNocturna,
          },
          {
            label: 'Incapacidad Común',
            quantity: calculations.diasIncapacidadComun,
            amount: calculations.pagoIncapacidadComun,
            unit: 'días',
          },
          {
            label: 'Incapacidad Laboral',
            quantity: calculations.diasIncapacidadLaboral,
            amount: calculations.pagoIncapacidadLaboral,
            unit: 'días',
          },
          {
            label: 'Auxilio Transporte',
            quantity: calculations.detalles.length,
            amount: calculations.auxilioTransporte,
            unit: 'días',
          },
        ]
      : [
          {
            label: 'Horas Diarias',
            quantity: calculations.totalHoras,
            amount: calculations.totalHoras * calculations.baseHourly,
          },
          {
            label: 'Recargo Nocturno',
            quantity: calculations.horasNocturnas + calculations.horasExtraNocturna,
            amount:
              (calculations.pagoNocturnoRecargo || 0) +
              (calculations.pagoExtraNocturnaRecargo || 0),
          },
          {
            label: 'Horas Dominicales',
            quantity: calculations.totalDominicalHours,
            amount: calculations.totalDominicalAmount,
          },
          {
            label: 'Auxilio Transporte',
            quantity: calculations.detalles.length,
            amount: calculations.auxilioTransporte,
            unit: 'días',
          },
        ]
  ).filter((row) => row.quantity > 0 || row.amount !== 0) : [];

  const reportTotalAmount = reportRows.reduce((sum, row) => sum + row.amount, 0);

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
              <div className="calendar-section">
                <label>Seleccionar Rango de Fechas</label>
                <div className="select-mode">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectingMode === 'end'}
                      onChange={() => setSelectingMode(selectingMode === 'start' ? 'end' : 'start')}
                    />
                    Seleccionar Fecha Final
                  </label>
                </div>
                <button type="button" className="calendar-current-month" onClick={handleMonthClick}>
                  {formatMonthYear('es-ES', currentMonth)}
                </button>
                <div className="calendar-container">
                  <Calendar
                    onClickDay={handleDayClick}
                    tileClassName={({ date, view }) => {
                      if (view === 'month') {
                        const dateStr = formatLocalDate(date);
                        let classes = [];
                        if (dateStr === startDate) classes.push('range-start');
                        if (dateStr === endDate) classes.push('range-end');
                        if (dateStr > startDate && dateStr < endDate) classes.push('range-middle');
                        const dayData = diasData[dateStr];
                        if (dayData && dayData.tipo && classes.length === 0) {
                          classes.push(dayData.tipo);
                        }
                        return classes.length ? classes : null;
                      }
                      return null;
                    }}
                    locale="es-ES"
                    calendarType="iso8601"
                    view={view}
                    onViewChange={handleViewChange}
                    formatMonthYear={formatMonthYear}
                    navigationLabel={() => null}
                    activeStartDate={currentMonth}
                    onActiveStartDateChange={handleActiveStartDateChange}
                  />
                </div>
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

              <div className="report-summary">
                <p><strong>Horas pagadas totales:</strong> {formatHoras(calculations.totalHoras)}</p>
                <p><strong>Horas recargo nocturno:</strong> {formatHoras(recargoNocturnoHours)}</p>
                <p><strong>Horas recargo dominical:</strong> {formatHoras(recargoDominicalHours)}</p>
              </div>

              <div className="report-switch-section">
                <div className="report-mode-switch">
                  <div className="mydict">
                    <div>
                      <label>
                        <input
                          type="radio"
                          name="reportMode"
                          value="classic"
                          checked={reportMode === 'classic'}
                          onChange={() => setReportMode('classic')}
                        />
                        <span>Horas estándar</span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="reportMode"
                          value="buk"
                          checked={reportMode === 'buk'}
                          onChange={() => setReportMode('buk')}
                        />
                        <span>Buk</span>
                      </label>
                    </div>
                  </div>
                </div>
                <p className="switch-note">
                  {reportMode === 'classic'
                    ? 'Muestra horas diurnas, nocturnas, dominicales y auxilio de transporte.'
                    : 'Muestra horas diarias con base, recargo nocturno sin base y salario dominical con base + recargo.'}
                </p>
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
                    {reportRows.map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td>
                          {row.unit ? `${row.quantity} ${row.unit}` : formatHoras(row.quantity)}
                        </td>
                        <td>${Math.floor(row.amount).toLocaleString('es-CO')}</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td><strong>TOTAL A PAGAR</strong></td>
                      <td><strong>{formatHoras(calculations.totalHoras)}</strong></td>
                      <td><strong>${Math.floor(reportTotalAmount).toLocaleString('es-CO')}</strong></td>
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
