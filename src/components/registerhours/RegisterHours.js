import React, { useEffect, useMemo, useState } from 'react';
import { FiCalendar, FiClock, FiSave, FiX } from 'react-icons/fi';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../server/api';
import { showToast } from '../ToastContainer';
import './RegisterHours.css';

const getTodayDateInput = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDayName = (dateString) => {
  const names = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const date = new Date(`${dateString}T00:00:00`);
  return names[date.getDay()];
};

export const normalizePendingDayKind = (day = {}) => {
  const tipo = String(day?.tipo || '').trim().toLowerCase();
  const estado = String(day?.estado || '').trim().toLowerCase();

  if (tipo === 'capacitacion' || estado === 'cap' || estado === 'capacitacion') {
    return 'capacitacion';
  }

  if (
    tipo === 'vacaciones' ||
    tipo === 'vac' ||
    estado === 'vac' ||
    estado === 'vacaciones'
  ) {
    return 'vacaciones';
  }

  if (tipo === 'descanso' || estado === 'libre' || estado === 'descanso') {
    return 'descanso';
  }

  return tipo || 'descanso';
};

const getWeekKeyFromDate = (date, weeksOffset = 0) => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day + 6) % 7;
  result.setDate(result.getDate() - diff - (weeksOffset * 7));
  result.setHours(0, 0, 0, 0);
  return formatDateInput(result);
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
  if (!entry || !exit) return { hours: 0, minutes: 0, seconds: 0 };

  let entrySeconds = entry.hour * 3600 + entry.minute * 60;
  let exitSeconds  = exit.hour  * 3600 + exit.minute  * 60;
  if (exitSeconds <= entrySeconds) exitSeconds += 24 * 3600;

  const diff = exitSeconds - entrySeconds;
  return {
    hours:   Math.floor(diff / 3600),
    minutes: Math.floor((diff % 3600) / 60),
    seconds: diff % 60,
  };
};

const formatLongDate = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
};

const RegisterHours = ({ user, setCurrentView, previousView = 'home' }) => {
  const [todayActive, setTodayActive]             = useState(true);
  const [selectedDate, setSelectedDate]           = useState(getTodayDateInput());
  const [entryTime, setEntryTime]                 = useState('18:00');
  const [exitTime, setExitTime]                   = useState('02:00');
  const [tipo, setTipo]                           = useState('trabajado');
  const [isSubmitting, setIsSubmitting]           = useState(false);
  const [missingDescansoDays, setMissingDescansoDays] = useState([]);
  const [showDescansoPrompt, setShowDescansoPrompt]   = useState(false);

  // Bloquear scroll del body mientras el modal está abierto
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    if (todayActive) setSelectedDate(getTodayDateInput());
  }, [todayActive]);

  // Cuando tipo cambia a capacitacion, establecer automáticamente 6 horas (06:00-12:00)
  useEffect(() => {
    if (tipo === 'capacitacion') {
      setEntryTime('06:00');
      setExitTime('12:00');
    }
  }, [tipo]);

  useEffect(() => {
    const loadMissingDescansoDays = async () => {
      if (!user) return;

      try {
        const [horariosSnap, horasSnap] = await Promise.all([
          getDoc(doc(db, 'HORARIOS', user.uid)),
          getDoc(doc(db, 'horasTrabajadas', user.uid)),
        ]);

        const registeredDates = new Set(
          horasSnap.exists() ? Object.keys(horasSnap.data()?.dias || {}) : []
        );
        const semanas = horariosSnap.exists() ? horariosSnap.data()?.semanas || {} : {};

        const getMissingPendingDays = (weekKey) => {
          const savedWeek = semanas[weekKey];
          return (savedWeek?.days || [])
            .filter((day) => day?.date)
            .map((day) => ({
              ...day,
              pendingType: normalizePendingDayKind(day),
            }))
            .filter((day) => ['descanso', 'capacitacion', 'vacaciones'].includes(day.pendingType))
            .filter((day) => !registeredDates.has(day.date));
        };

        const currentWeekKey = getWeekKeyFromDate(new Date());
        const currentWeekMissingDays = getMissingPendingDays(currentWeekKey);

        let pendingDays = [...currentWeekMissingDays];

        for (let offset = 1; offset < 6; offset += 1) {
          const weekKey = getWeekKeyFromDate(new Date(), offset);
          const weekMissingDays = getMissingPendingDays(weekKey);
          pendingDays.push(...weekMissingDays);
        }

        const deduplicated = pendingDays.filter(
          (day, index, arr) => arr.findIndex((item) => item.date === day.date && item.pendingType === day.pendingType) === index
        );

        if (deduplicated.length > 0) {
          setMissingDescansoDays(deduplicated);
          setShowDescansoPrompt(true);
        } else {
          setMissingDescansoDays([]);
          setShowDescansoPrompt(false);
        }
      } catch (error) {
        console.error('Error cargando días pendientes:', error);
      }
    };
    loadMissingDescansoDays();
  }, [user]);

  const getWeekDaysWithTypes = async (selectedDateStr) => {
    if (!user) return { descansos: [], capacitaciones: [], allDays: [] };
    try {
      const horariosSnap = await getDoc(doc(db, 'HORARIOS', user.uid));
      if (!horariosSnap.exists()) return { descansos: [], capacitaciones: [], allDays: [] };

      const semanas = horariosSnap.data()?.semanas || {};
      const selectedDate = new Date(`${selectedDateStr}T00:00:00`);
      const monday = getWeekKeyFromDate(selectedDate);
      const weekData = semanas[monday];

      if (!weekData || !weekData.days) return { descansos: [], capacitaciones: [], allDays: [] };

      const descansos = weekData.days.filter((day) => day.tipo === 'descanso');
      const capacitaciones = weekData.days.filter((day) => day.tipo === 'capacitacion');
      const vacaciones = weekData.days.filter((day) => day.tipo === 'vacaciones');
      return { descansos, capacitaciones, vacaciones, allDays: weekData.days };
    } catch (error) {
      console.error('Error obteniendo días de la semana:', error);
      return { descansos: [], capacitaciones: [], allDays: [] };
    }
  };

  const worked = useMemo(() => calculateWorked(entryTime, exitTime), [entryTime, exitTime]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user) return;

    const fecha = selectedDate || getTodayDateInput();
    const workedHours = calculateWorked(entryTime, exitTime);
    const payload = {
      tipo,
      registeredAt: new Date().toISOString(),
      date: fecha,
    };

    if (tipo === 'trabajado' || tipo === 'capacitacion') {
      payload.entrada = entryTime;
      payload.salida  = exitTime;
      payload.worked  = { hours: workedHours.hours, minutes: workedHours.minutes, seconds: workedHours.seconds };
    }

    setIsSubmitting(true);
    try {
      // Registrar el día principal
      await setDoc(
        doc(db, 'horasTrabajadas', user.uid),
        { dias: { [fecha]: payload } },
        { merge: true }
      );

      // Si es trabajado, capacitacion o vacaciones, registrar automáticamente los días pendientes de la semana
      if (tipo === 'trabajado' || tipo === 'capacitacion' || tipo === 'vacaciones') {
        const { allDays } = await getWeekDaysWithTypes(fecha);

        const horasSnap = await getDoc(doc(db, 'horasTrabajadas', user.uid));
        const registeredDates = horasSnap.exists()
          ? Object.keys(horasSnap.data()?.dias || {})
          : [];

        const pendingWeekDays = (allDays || [])
          .filter((day) => day?.date)
          .map((day) => ({
            ...day,
            pendingType: normalizePendingDayKind(day),
          }))
          .filter((day) => ['descanso', 'capacitacion', 'vacaciones'].includes(day.pendingType))
          .filter((day) => !registeredDates.includes(day.date));

        if (pendingWeekDays.length > 0) {
          const diasPayload = pendingWeekDays.reduce((acc, day) => {
            acc[day.date] = {
              tipo: day.pendingType,
              registeredAt: new Date().toISOString(),
              date: day.date,
              worked: { hours: 0, minutes: 0, seconds: 0 },
              ...(day.pendingType === 'capacitacion' ? { entrada: '06:00', salida: '12:00' } : {}),
            };
            return acc;
          }, {});

          await setDoc(
            doc(db, 'horasTrabajadas', user.uid),
            { dias: diasPayload },
            { merge: true }
          );

          const diasFormato = pendingWeekDays
            .map((day) => `${day.pendingType === 'capacitacion' ? 'Capacitación' : 'Descanso'} ${getDayName(day.date)}`)
            .join(', ');
          showToast(`Registro guardado + Días pendientes registrados automáticamente: ${diasFormato}`, 'success');
        } else {
          showToast('Registro guardado con éxito.', 'success');
        }
      } else {
        showToast('Registro guardado con éxito.', 'success');
      }
      
      if (todayActive) {
        setCurrentView();
      } else {
        setEntryTime('18:00');
        setExitTime('02:00');
        setTipo('trabajado');
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('Error guardando horas:', error);
      showToast('No se pudo guardar el registro. Intenta de nuevo.', 'error');
      setIsSubmitting(false);
    }
  };

  const handleRegisterMissingDescansoDays = async () => {
    if (!user || missingDescansoDays.length === 0) return;
    const diasPayload = missingDescansoDays.reduce((acc, day) => {
      const pendingType = normalizePendingDayKind(day);
      acc[day.date] = {
        tipo: pendingType,
        registeredAt: new Date().toISOString(),
        date: day.date,
        worked: { hours: 0, minutes: 0, seconds: 0 },
        ...(pendingType === 'capacitacion' ? { entrada: '06:00', salida: '12:00' } : {}),
      };
      return acc;
    }, {});
    try {
      await setDoc(
        doc(db, 'horasTrabajadas', user.uid),
        { dias: diasPayload },
        { merge: true }
      );
      const tipoTexto = missingDescansoDays.some((day) => normalizePendingDayKind(day) === 'capacitacion')
        ? 'Días pendientes registrados correctamente.'
        : missingDescansoDays.some((day) => normalizePendingDayKind(day) === 'vacaciones')
          ? 'Días de vacaciones registrados correctamente.'
          : 'Días de descanso registrados correctamente.';
      showToast(tipoTexto, 'success');
      setShowDescansoPrompt(false);
      setMissingDescansoDays([]);
    } catch (error) {
      console.error('Error registrando días pendientes:', error);
      showToast('No se pudieron registrar los días pendientes.', 'error');
    }
  };

  const renderDescansoMessage = () => {
    if (!showDescansoPrompt || missingDescansoDays.length === 0) return null;

    const formattedDays = [...missingDescansoDays]
      .sort((a, b) => new Date(`${b.date}T00:00:00`) - new Date(`${a.date}T00:00:00`))
      .map((day) => {
        const date = new Date(`${day.date}T00:00:00`);
        const dayName = getDayName(day.date);
        const dayNumber = date.getDate();
        const monthName = date.toLocaleDateString('es-ES', { month: 'long' });
        const pendingKind = normalizePendingDayKind(day);
    const tipoLabel = pendingKind === 'capacitacion'
      ? 'Capacitación'
      : pendingKind === 'vacaciones'
        ? 'Vacaciones'
        : 'Descanso';
    return `${tipoLabel} · ${dayName} ${dayNumber} de ${monthName}`;
  })
  .join(', ');

    return (
      <div className="register-hours-alert">
        <p>
          ℹ️ Días sin registrar: <strong>{formattedDays}</strong>
        </p>
        <div className="register-hours-alert-actions">
          <button
            type="button"
            className="register-hours-alert-yes"
            onClick={handleRegisterMissingDescansoDays}
          >
            Registrar pendientes
          </button>
          <button
            type="button"
            className="register-hours-alert-no"
            onClick={() => setShowDescansoPrompt(false)}
          >
            Ahora no
          </button>
        </div>
      </div>
    );
  };

  const isNightShift = exitTime <= entryTime;

  return (
    <div className="register-hours-overlay" onClick={(e) => e.target === e.currentTarget && setCurrentView()}>
      <div className="register-hours-modal">

        {/* Header */}
        <div className="register-hours-header">
          <div className="register-hours-title">
            <div className="register-hours-icon-wrap">
              <FiClock size={22} />
            </div>
            <div>
              <h2>Registrar mi tiempo</h2>
              <p>Registra tu jornada de entrada y salida.</p>
            </div>
          </div>
          <button
            type="button"
            className="register-hours-close"
            onClick={() => setCurrentView()}
            aria-label="Cerrar"
          >
            <FiX size={18} />
          </button>
        </div>

        <form className="register-hours-form" onSubmit={handleSubmit}>

          {/* Nota informativa */}
          <div className="register-hours-note">
            <FiCalendar size={16} />
            <span>
              Activa el switch para registrar hoy, o desactívalo para elegir una fecha pasada.
            </span>
          </div>

          {/* Alerta días de descanso */}
          {renderDescansoMessage()}

          {/* Switch "Hoy" */}
          <div className="register-hours-row">
            <label className="switch-label">
              <span>Registrar el día de hoy</span>
              <label className="register-hours-switch">
                <input
                  type="checkbox"
                  checked={todayActive}
                  onChange={(e) => setTodayActive(e.target.checked)}
                />
                <span className="slider" />
              </label>
            </label>
          </div>

          {/* Fecha */}
          <div className="register-hours-field">
            <label>Fecha</label>
            <div className="input-with-icon">
              <FiCalendar size={16} />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                disabled={todayActive}
                min="2000-01-01"
                max={getTodayDateInput()}
              />
            </div>
          </div>

          {/* Tipo de día */}
          <div className="register-hours-field">
            <label>Tipo de día</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="trabajado">Trabajado</option>
              <option value="descanso">Día libre</option>
              <option value="vacaciones">Vacaciones</option>
              <option value="capacitacion">Capacitación</option>
              <option value="incapacidad_comun">Incapacidad común</option>
              <option value="incapacidad_laboral">Incapacidad laboral</option>
            </select>
          </div>

          {/* Horas — si tipo === trabajado o capacitacion */}
          {(tipo === 'trabajado' || tipo === 'capacitacion') && (
            <>
              <div className="register-hours-row two-columns">
                <div className="register-hours-field">
                  <label>{tipo === 'capacitacion' ? 'Inicio de capacitación' : 'Hora de entrada'}</label>
                  <input
                    type="time"
                    value={entryTime}
                    onChange={(e) => setEntryTime(e.target.value)}
                    required
                  />
                </div>
                <div className="register-hours-field">
                  <label>{tipo === 'capacitacion' ? 'Fin de capacitación' : 'Hora de salida'}</label>
                  <input
                    type="time"
                    value={exitTime}
                    onChange={(e) => setExitTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="register-hours-field">
                <label>Duración calculada</label>
                <div className="duration-box">
                  <strong>{worked.hours}h {worked.minutes}m {worked.seconds}s</strong>
                  <span>{tipo === 'capacitacion' ? 'Horas pagadas como tarifa base' : (isNightShift ? '🌙 Turno nocturno' : '☀️ Turno diurno')}</span>
                </div>
              </div>
            </>
          )}


          {tipo === 'vacaciones' && (
            <div className="register-hours-field">
              <label>Vacaciones</label>
              <div className="duration-box" style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>
                <strong>VAC - Día pagado</strong>
                <span>🏖️ Se registra como día de vacaciones</span>
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="register-hours-actions">
            <button
              type="button"
              className="register-hours-secondary"
              onClick={() => setCurrentView(previousView || 'home')}
            >
              Cancelar
            </button>
            <button type="submit" className="register-hours-submit" disabled={isSubmitting}>
              <FiSave size={16} />
              {isSubmitting ? 'Guardando...' : 'Guardar registro'}
            </button>
          </div>

          {/* Fecha seleccionada (cuando se cambia manualmente) */}
          {!todayActive && selectedDate && (
            <div className="register-hours-info">
              <FiCalendar size={15} />
              <span>Registrando para: <strong>{formatLongDate(selectedDate)}</strong></span>
            </div>
          )}

        </form>
      </div>
    </div>
  );
};

export default RegisterHours;