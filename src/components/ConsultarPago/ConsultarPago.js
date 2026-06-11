import React, { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { FiX, FiCalendar, FiClock } from 'react-icons/fi';
import { db } from '../server/api';
import './ConsultarPago.css';
import Loading from '../loading/loading';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { festivosText } from './festivos';

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

const getFestivos = () => {
  const festivos = new Set();
  const lines = festivosText.split('\n');
  lines.forEach(line => {
    const match = line.match(/\/\/ (\d{2})\/(\d{2})\/(\d{4}) -/);
    if (match) {
      const [, day, month, year] = match;
      festivos.add(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    }
  });
  return festivos;
};

const parseTime = (value) => {
  if (!value) return null;
  const [hour, minute] = value.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute, second: 0 };
};

const calculateWorked = (entryValue, exitValue) => {
  const entry = parseTime(entryValue);
  const exit = parseTime(exitValue);
  if (!entry || !exit) {
    return { hours: 0, minutes: 0, seconds: 0 };
  }

  let entrySeconds = entry.hour * 3600 + entry.minute * 60 + entry.second;
  let exitSeconds = exit.hour * 3600 + exit.minute * 60 + exit.second;

  if (exitSeconds <= entrySeconds) {
    exitSeconds += 24 * 3600;
  }

  const diff = exitSeconds - entrySeconds;
  return {
    hours: Math.floor(diff / 3600),
    minutes: Math.floor((diff % 3600) / 60),
    seconds: diff % 60,
  };
};

const getMondayOfWeek = (date) => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day + 6) % 7;
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

const getHorarioForDay = (dateStr, horariosData) => {
  const date = createDateFromString(dateStr);
  const monday = getMondayOfWeek(date);
  const weekStart = formatLocalDate(monday);
  const weekData = horariosData[weekStart];
  if (!weekData) return null;
  const dayOfWeek = date.getDay(); // 0 sunday, 1 monday, etc.
  const daySchedule = weekData.days.find((day) => {
    if (typeof day.id !== 'undefined') {
      return day.id === dayOfWeek;
    }
    return day.date === dateStr;
  });
  return daySchedule;
};

const calculateMinDiff = (time1, time2) => {
  const t1 = parseTime(time1);
  const t2 = parseTime(time2);
  if (!t1 || !t2) return 0;
  const min1 = t1.hour * 60 + t1.minute;
  const min2 = t2.hour * 60 + t2.minute;
  return min2 - min1; // positiva si t2 > t1
};

const calculateAdjustmentMinutes = (scheduledTime, actualTime, type, isNextDay = false, baseDate = null) => {
  const scheduled = parseTime(scheduledTime);
  const actual = parseTime(actualTime);
  if (!scheduled || !actual) return 0;

  let scheduledMinutes = scheduled.hour * 60 + scheduled.minute;
  let actualMinutes = actual.hour * 60 + actual.minute;

  // Si la salida es después de medianoche (ej. 00:36), tratarla como del día siguiente
  // En este caso, sumamos 24 horas (1440 minutos) a la hora real
  if (isNextDay) {
    actualMinutes += 24 * 60;
  }

  if (type === 'entrada') {
    return scheduledMinutes - actualMinutes; // early entry is positive, late is negative
  }

  return actualMinutes - scheduledMinutes; // late exit is positive, early is negative
};

// Nueva función para verificar si la salida cruza medianoche
const doesExitCrossMidnight = (entryTime, exitTime) => {
  const entry = parseTime(entryTime);
  const exit = parseTime(exitTime);
  if (!entry || !exit) return false;
  
  // Si la hora de salida es menor que la de entrada, significa que cruza medianoche
  // También consideramos que si la salida es antes de las 12:00 PM y la entrada es después de las 12:00 PM
  return exit.hour < entry.hour || (exit.hour === entry.hour && exit.minute <= entry.minute);
};

const calculateWorkedMinutes = (startTime, endTime, isNextDay = false) => {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  if (!start || !end) return 0;

  let startMinutes = start.hour * 60 + start.minute;
  let endMinutes = end.hour * 60 + end.minute;
  
  // Si la salida es después de medianoche (ej. 00:36), treat it as next day
  // En este caso, sumamos 24 horas (1440 minutos) a la hora de salida
  if (isNextDay) {
    endMinutes += 24 * 60;
  }
  
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }
  return endMinutes - startMinutes;
};

const formatMinutes = (minutes) => {
  const sign = minutes < 0 ? '-' : '';
  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  return `${sign}${hours}h ${mins}m`;
};

const formatMin = (min) => {
  if (min === 0) return '0m';
  const abs = Math.abs(min);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  const sign = min > 0 ? '+' : '-';
  if (hours > 0) return `${sign}${hours}h ${mins}m`;
  return `${sign}${mins}m`;
};

const ConsultarPago = ({ user, setCurrentView }) => {
  const [startDate, setStartDate] = useState(getTodayDateInput());
  const [endDate, setEndDate] = useState(getTodayDateInput());
  const [trabajos, setTrabajos] = useState([]);
  const [selectedTrabajo, setSelectedTrabajo] = useState('');
  const [diasData, setDiasData] = useState({});
  const [horariosData, setHorariosData] = useState({});
  const [loading, setLoading] = useState(false);
  const [calculations, setCalculations] = useState(null);
  const [reportMode, setReportMode] = useState('classic');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState('month');
  const [selectingMode, setSelectingMode] = useState('start'); // 'start' or 'end'
  const [simulateSchedule, setSimulateSchedule] = useState(false);

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
    loadHorariosData();
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

  const loadHorariosData = async () => {
    try {
      const docRef = doc(db, 'HORARIOS', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setHorariosData(docSnap.data().semanas || {});
      }
    } catch (error) {
      console.error('Error cargando horarios:', error);
    }
  };

  const calculatePayment = (simulateOverride) => {
    setLoading(true);
    try {
      const simulate = typeof simulateOverride !== 'undefined' ? simulateOverride : simulateSchedule;
      const trabajo = trabajos.find((t) => t.id === selectedTrabajo);
      if (!trabajo) {
        setLoading(false);
        return;
      }

      const startDateTime = createDateFromString(startDate);
      const endDateTime = createDateFromString(endDate);

      const festivos = getFestivos();

      const isDominicalDate = (dateStr) => {
        const dayOfWeek = createDateFromString(dateStr).getDay();
        return dayOfWeek === 0 || festivos.has(dateStr);
      };

      const diasLaborados = [];
      const detalles = [];
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
          if (dayData.tipo === 'trabajado') {
            // Si está en modo simulación, usar el horario programado en vez de las horas registradas
            const daySchedule = getHorarioForDay(dateStr, horariosData);
            const useSchedule = simulate && daySchedule && daySchedule.startTime && daySchedule.endTime;

            const entradaStr = useSchedule ? daySchedule.startTime : dayData.entrada;
            const salidaStr = useSchedule ? daySchedule.endTime : dayData.salida;

            if (entradaStr && salidaStr) {
              const [entryH, entryM] = entradaStr.split(':').map(Number);
              const [exitH, exitM] = salidaStr.split(':').map(Number);
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
                horaEntrada: entradaStr,
                horaSalida: salidaStr,
                simulated: useSchedule,
              });
            }
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

    const startDateTime = createDateFromString(calculations.startDate);
    const endDateTime = createDateFromString(calculations.endDate);

    // ─── Helpers ───────────────────────────────────────────────────
    const formatMoney = (value) =>
      `$${Math.floor(value).toLocaleString('es-CO')}`;

    // ─── Constantes de columnas ────────────────────────────────────
    // Tabla principal (3 columnas)
    const MC = { label: 17, qty: 110, amount: 193 };

    // Tabla de horario — sin columna GENERADO, más espacio para cada col
    const HC = {
      dia:    16,
      entH:   52,
      entR:   74,
      salH:   96,
      salR:   118,
      llegan: 140,
      extra:  158,
      total:  176,
    };

    // Resumen acumulado (2 columnas lado a lado)
    const SC = {
      leftLabel:  17,
      leftVal:    95,
      rightLabel: 107,
      rightVal:   195,
    };

    const PAGE_BOTTOM = 272;
    const ROW_H       = 8;

    let y = 15;

    // ─── TÍTULO ────────────────────────────────────────────────────
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text('REPORTE DE PAGO', 105, y, { align: 'center' });

    y += 2;
    pdf.setDrawColor(30, 41, 59);
    pdf.setLineWidth(0.6);
    pdf.line(15, y + 5, 195, y + 5);
    y += 12;

    // ─── INFO GENERAL ──────────────────────────────────────────────
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(60, 60, 60);
    pdf.text(`Trabajo: ${calculations.trabajo}`, 15, y);
    y += 5;
    pdf.text(`Periodo: del ${formatFechaDisplay(calculations.startDate)} al ${formatFechaDisplay(calculations.endDate)}`, 15, y);
    y += 10;

    // ─── TABLA PRINCIPAL ───────────────────────────────────────────
    const pdfRows = reportMode === 'classic'
      ? [
          { label: 'Horas diurnas',                  quantityLabel: formatHoras(calculations.horasDiurnas),               amount: calculations.pagoBase },
          { label: 'Horas nocturnas',                 quantityLabel: formatHoras(calculations.horasNocturnas),              amount: calculations.pagoNocturno },
          { label: 'Horas diurnas dominical',         quantityLabel: formatHoras(calculations.horasDiurnaDominical),        amount: calculations.pagoDiurnaDominical },
          { label: 'Horas nocturnas dominical',       quantityLabel: formatHoras(calculations.horasNocturnaDominical),      amount: calculations.pagoNocturnaDominical },
          { label: 'Horas extra diurna',              quantityLabel: formatHoras(calculations.horasExtraDiurna),            amount: calculations.pagoExtraDiurna },
          { label: 'Horas extra nocturna',            quantityLabel: formatHoras(calculations.horasExtraNocturna),          amount: calculations.pagoExtraNocturna },
          { label: 'Horas extra dominical diurna',    quantityLabel: formatHoras(calculations.horasExtraDominicalDiurna),   amount: calculations.pagoExtraDominicalDiurna },
          { label: 'Horas extra dominical nocturna',  quantityLabel: formatHoras(calculations.horasExtraDominicalNocturna), amount: calculations.pagoExtraDominicalNocturna },
          { label: 'Incapacidad común',               quantityLabel: `${calculations.diasIncapacidadComun} días`,           amount: calculations.pagoIncapacidadComun },
          { label: 'Incapacidad laboral',             quantityLabel: `${calculations.diasIncapacidadLaboral} días`,         amount: calculations.pagoIncapacidadLaboral },
          { label: 'Auxilio de transporte',           quantityLabel: `${calculations.detalles.length} días`,               amount: calculations.auxilioTransporte },
        ]
      : [
          { label: 'Horas diarias',         quantityLabel: formatHoras(calculations.totalHoras),                                                                         amount: calculations.totalHoras * calculations.baseHourly },
          { label: 'Recargo nocturno',      quantityLabel: formatHoras(calculations.horasNocturnas + calculations.horasExtraNocturna),                                   amount: (calculations.pagoNocturnoRecargo || 0) + (calculations.pagoExtraNocturnaRecargo || 0) },
          { label: 'Horas dominicales',     quantityLabel: formatHoras(calculations.totalDominicalHours),                                                                amount: calculations.totalDominicalAmount },
          { label: 'Auxilio de transporte', quantityLabel: `${calculations.detalles.length} días`,                                                                       amount: calculations.auxilioTransporte },
        ];

    // Encabezado tabla principal
    pdf.setFillColor(30, 41, 59);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.rect(15, y, 180, 10, 'F');   // ← era 8
pdf.text('CONCEPTO', MC.label,  y + 6);  // ← era y + 5
pdf.text('CANTIDAD', MC.qty,    y + 6);
pdf.text('PAGO',     MC.amount, y + 6, { align: 'right' });
y += 12;  // ← era 10

    // Filas tabla principal
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdfRows.forEach((row, i) => {
      pdf.setTextColor(0, 0, 0);
      if (i % 2 === 0) {
        pdf.setFillColor(245, 245, 245);
        pdf.rect(15, y - 5, 180, ROW_H, 'F');
      }
      pdf.text(row.label,               MC.label,  y);
      pdf.text(row.quantityLabel,        MC.qty,    y);
      pdf.text(formatMoney(row.amount),  MC.amount, y, { align: 'right' });
      y += ROW_H;
    });

    // Fila TOTAL
    y += 2;
    const pdfTotalAmount = pdfRows.reduce((sum, r) => sum + r.amount, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFillColor(30, 41, 59);
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(10);
    pdf.rect(15, y - 5, 180, 10, 'F');
    pdf.text('TOTAL A PAGAR',                         MC.label,  y + 1);
    pdf.text(formatHoras(calculations.totalHoras),    MC.qty,    y + 1);
    pdf.text(formatMoney(pdfTotalAmount),             MC.amount, y + 1, { align: 'right' });

    y += 14;

    // ─── TABLA DE CONTROL DE HORARIO ───────────────────────────────
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(30, 41, 59);
    pdf.text('CONTROL DE HORARIO', 15, y);
    y += 7;

    // Helper encabezado horario
    const drawHorarioHeader = () => {
      pdf.setFillColor(30, 41, 59);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.rect(15, y, 180, 10, 'F');
      pdf.text('DÍA',      HC.dia,    y + 6);
      pdf.text('ENT H',    HC.entH,   y + 6);
      pdf.text('ENT R',    HC.entR,   y + 6);
      pdf.text('SAL H',    HC.salH,   y + 6);
      pdf.text('SAL R',    HC.salR,   y + 6);
      pdf.text('LLEGADA',  HC.llegan, y + 6);
      pdf.text('TIEMPO +', HC.extra,  y + 6);
      pdf.text('TOTAL',    HC.total,  y + 6);
      y += 12;
    };

    drawHorarioHeader();

    // Construir filas del horario
    const tableHorario = [];

    for (let d = new Date(startDateTime); d <= endDateTime; d.setDate(d.getDate() + 1)) {
      const dateStr = formatLocalDate(d);
      const dayData = diasData[dateStr];
      if (!dayData) continue;

      if (dayData.tipo === 'trabajado') {
        const daySchedule       = getHorarioForDay(dateStr, horariosData);
        const entradaH          = daySchedule?.startTime || '-';
        const salidaH           = daySchedule?.endTime   || '-';
        const entradaR          = dayData.entrada || '-';
        const salidaR           = dayData.salida  || '-';
        const isNextDay         = doesExitCrossMidnight(entradaR, salidaR);
        const diffEntrada       = entradaH !== '-' && entradaR !== '-' ? calculateAdjustmentMinutes(entradaH, entradaR, 'entrada') : 0;
        const diffSalida        = salidaH  !== '-' && salidaR  !== '-' ? calculateAdjustmentMinutes(salidaH, salidaR, 'salida', isNextDay) : 0;
        const scheduleMinutes   = entradaH !== '-' && salidaH  !== '-' ? calculateWorkedMinutes(entradaH, salidaH) : 0;
        const registeredMinutes = entradaR !== '-' && salidaR  !== '-' ? calculateWorkedMinutes(entradaR, salidaR, isNextDay) : 0;

        tableHorario.push({
          fecha: dateStr, entradaH, entradaR, salidaH, salidaR,
          diffEntrada, diffSalida,
          total: diffEntrada + diffSalida,
          scheduleMinutes, registeredMinutes,
          tipo: 'trabajado',
        });
      } else {
        tableHorario.push({ fecha: dateStr, tipo: dayData.tipo });
      }
    }

    // Renderizar filas del horario
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);

    tableHorario.forEach((row, i) => {
      if (y > PAGE_BOTTOM) {
        pdf.addPage();
        y = 15;
        drawHorarioHeader();
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
      }

      if (i % 2 === 0) {
        pdf.setFillColor(245, 245, 245);
        pdf.rect(15, y - 5, 180, ROW_H, 'F');
      }

      pdf.setTextColor(0, 0, 0);

      if (row.tipo === 'trabajado') {
        pdf.text(formatFechaDisplay(row.fecha), HC.dia,   y);
        pdf.text(row.entradaH || '-',           HC.entH,  y);
        pdf.text(row.entradaR || '-',           HC.entR,  y);
        pdf.text(row.salidaH  || '-',           HC.salH,  y);
        pdf.text(row.salidaR  || '-',           HC.salR,  y);

        // Llegada
        if (row.diffEntrada !== 0) {
          pdf.setTextColor(row.diffEntrada > 0 ? 0 : 200, row.diffEntrada > 0 ? 128 : 0, 0);
          pdf.text(formatMin(row.diffEntrada), HC.llegan, y);
        } else {
          pdf.setTextColor(150, 150, 150);
          pdf.text('—', HC.llegan, y);
        }

        // + Tiempo
        if (row.diffSalida > 0) {
          pdf.setTextColor(0, 128, 0);
          pdf.text(formatMin(row.diffSalida), HC.extra, y);
        } else {
          pdf.setTextColor(150, 150, 150);
          pdf.text('—', HC.extra, y);
        }

        // Total
        if (row.total !== 0) {
          pdf.setTextColor(row.total > 0 ? 0 : 200, row.total > 0 ? 128 : 0, 0);
          pdf.text(formatMin(row.total), HC.total, y);
        } else {
          pdf.setTextColor(150, 150, 150);
          pdf.text('—', HC.total, y);
        }

        pdf.setTextColor(0, 0, 0);

      } else {
        // Descanso / incapacidad
        const tipoLabel =
          row.tipo === 'descanso'          ? 'DESCANSO'      :
          row.tipo === 'incapacidad_comun' ? 'INC. COMÚN'    : 'INC. LABORAL';

        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(120, 120, 120);
        pdf.text(formatFechaDisplay(row.fecha), HC.dia, y);
        pdf.text(tipoLabel, 105, y, { align: 'center' });
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(0, 0, 0);
      }

      y += ROW_H;
    });

    // ─── RESUMEN ACUMULADO ─────────────────────────────────────────
    if (tableHorario.length > 0) {
      if (y > PAGE_BOTTOM - 55) {
        pdf.addPage();
        y = 15;
      }

      const totalLlegadaTemprano   = tableHorario.reduce((s, r) => s + (r.diffEntrada > 0 ? r.diffEntrada : 0), 0);
      const totalLlegadaTarde      = tableHorario.reduce((s, r) => s + (r.diffEntrada < 0 ? r.diffEntrada : 0), 0);
      const totalTiempoExtra       = tableHorario.reduce((s, r) => s + (r.diffSalida  > 0 ? r.diffSalida  : 0), 0);
      const totalAdjustmentMinutes = tableHorario.reduce((s, r) => s + (r.total || 0), 0);
      const totalScheduleMinutes   = tableHorario.reduce((s, r) => s + (r.scheduleMinutes   || 0), 0);
      const totalRegisteredMinutes = tableHorario.reduce((s, r) => s + (r.registeredMinutes || 0), 0);

      y += 4;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(30, 41, 59);
      pdf.text('RESUMEN ACUMULADO', 15, y);
      y += 8;

      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.3);
      pdf.line(15, y - 3, 195, y - 3);

      pdf.setFontSize(9.5);

      // Fila 1
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
      pdf.text('Llegadas tempranas:', SC.leftLabel, y);
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 140, 0);
      pdf.text(formatMin(totalLlegadaTemprano), SC.leftVal, y, { align: 'right' });

      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
      pdf.text('Total por horario:', SC.rightLabel, y);
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 53, 128);
      pdf.text(formatHoras(totalScheduleMinutes / 60), SC.rightVal, y, { align: 'right' });
      y += 7;

      // Fila 2
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
      pdf.text('Llegadas tardías:', SC.leftLabel, y);
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(200, 0, 0);
      pdf.text(formatMin(totalLlegadaTarde), SC.leftVal, y, { align: 'right' });

      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
      pdf.text('Total por registro:', SC.rightLabel, y);
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 53, 128);
      pdf.text(formatHoras(totalRegisteredMinutes / 60), SC.rightVal, y, { align: 'right' });
      y += 7;

      // Fila 3
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
      pdf.text('Tiempo extra:', SC.leftLabel, y);
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 140, 0);
      pdf.text(formatMin(totalTiempoExtra), SC.leftVal, y, { align: 'right' });
      y += 7;

      // Fila 4 — total ajuste
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
      pdf.text('Total ajuste:', SC.leftLabel, y);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...(totalAdjustmentMinutes >= 0 ? [0, 140, 0] : [200, 0, 0]));
      pdf.text(formatMin(totalAdjustmentMinutes), SC.leftVal, y, { align: 'right' });
      pdf.setTextColor(0, 0, 0);
      y += 4;

      pdf.setDrawColor(200, 200, 200);
      pdf.line(15, y, 195, y);
    }

    // ─── FOOTER ────────────────────────────────────────────────────
    y += 10;
    if (y > PAGE_BOTTOM) { pdf.addPage(); y = 15; }
    pdf.setTextColor(150, 150, 150);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.text(`Generado el: ${new Date().toLocaleDateString('es-CO')}`, 195, y, { align: 'right' });

    // ─── ABRIR EN EL NAVEGADOR ─────────────────────────────────────
    const pdfBlob = pdf.output('blob');
    window.open(URL.createObjectURL(pdfBlob), '_blank');

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
                        const festivos = getFestivos();
                        const isFestivo = festivos.has(dateStr);
                        const dayData = diasData[dateStr];
                        const tipo = dayData?.tipo || null;
                        const today = formatLocalDate(new Date());
                        const isToday = dateStr === today;
                        
                        if (dateStr === startDate) classes.push('range-start');
                        if (dateStr === endDate) classes.push('range-end');
                        if (dateStr > startDate && dateStr < endDate) classes.push('range-middle');
                        
                        // Lógica de festivos
                        if (isFestivo && tipo) {
                          classes.push('festivo', tipo);
                        } else if (isFestivo && !tipo) {
                          classes.push('festivo');
                        } else if (tipo && classes.length === 0) {
                          classes.push(tipo);
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
              <button type="button" className="btn-calculate" onClick={() => calculatePayment(false)}>
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

              <div className="select-mode" style={{ justifyContent: 'center', marginTop: 10 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={simulateSchedule}
                    onChange={(e) => {
                      const newVal = e.target.checked;
                      setSimulateSchedule(newVal);
                      calculatePayment(newVal);
                    }}
                  />
                  Simulación: usar horario programado en vez de horas registradas
                  <span className="simulate-info-tag">La simulación toma como base el horario programado para calcular las horas trabajadas y no los registros reales de marcación. Por esta razón, ese valor debería considerarse como el mínimo que tendrían que pagarte, en caso de que no se validen los minutos efectivamente trabajados.
</span>
                </label>
              </div>

              <div className="report-summary">
                <p><strong>Horas pagadas totales:</strong> {formatHoras(calculations.totalHoras)}</p>
                <p><strong>Horas recargo nocturno:</strong> {formatHoras(recargoNocturnoHours)}</p>
                <p><strong>Horas recargo dominical:</strong> {formatHoras(recargoDominicalHours)}</p>
                {/* Totales por horario y registro */}
                <p><strong>Totales por horario:</strong> {formatHoras((() => {
                  // Recalcular aquí para la vista
                  let tableHorario = [];
                  const startDateTime = createDateFromString(calculations.startDate);
                  const endDateTime = createDateFromString(calculations.endDate);
                  for (let d = new Date(startDateTime); d <= endDateTime; d.setDate(d.getDate() + 1)) {
                    const dateStr = formatLocalDate(d);
                    const dayData = diasData[dateStr];
                    if (!dayData || dayData.tipo !== 'trabajado') continue;
                    const daySchedule = getHorarioForDay(dateStr, horariosData);
                    const entradaH = daySchedule?.startTime || '-';
                    const salidaH = daySchedule?.endTime || '-';
                    // Calcular minutos trabajados según el horario
                    const scheduleMinutes = entradaH !== '-' && salidaH !== '-' ? calculateWorkedMinutes(entradaH, salidaH) : 0;
                    tableHorario.push({ scheduleMinutes });
                  }
                  const totalScheduleMinutes = tableHorario.reduce((sum, row) => sum + row.scheduleMinutes, 0);
                  return totalScheduleMinutes / 60;
                })())}</p>
                <p><strong>Totales por registro:</strong> {formatHoras((() => {
                  let tableHorario = [];
                  const startDateTime = createDateFromString(calculations.startDate);
                  const endDateTime = createDateFromString(calculations.endDate);
                  for (let d = new Date(startDateTime); d <= endDateTime; d.setDate(d.getDate() + 1)) {
                    const dateStr = formatLocalDate(d);
                    const dayData = diasData[dateStr];
                    if (!dayData || dayData.tipo !== 'trabajado') continue;
                    const entradaR = dayData.entrada || '-';
                    const salidaR = dayData.salida || '-';
                    const isNextDay = doesExitCrossMidnight(entradaR, salidaR);
                    // Calcular minutos registrados (considerando si cruza medianoche)
                    const registeredMinutes = entradaR !== '-' && salidaR !== '-' ? calculateWorkedMinutes(entradaR, salidaR, isNextDay) : 0;
                    tableHorario.push({ registeredMinutes });
                  }
                  const totalRegisteredMinutes = tableHorario.reduce((sum, row) => sum + row.registeredMinutes, 0);
                  return totalRegisteredMinutes / 60;
                })())}</p>
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
              <button className="btn-new-calculation" onClick={() => {
                setCalculations(null);
                setSimulateSchedule(false);
              }}>
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
