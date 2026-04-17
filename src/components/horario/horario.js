import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../server/api';
import { showToast } from '../ToastContainer';
import Loading from '../loading/loading';
import './horario.css';

const weekOptions = [
  { value: -4, label: 'Hace 4 semanas' },
  { value: -3, label: 'Hace 3 semanas' },
  { value: -2, label: 'Hace 2 semanas' },
  { value: -1, label: 'Semana pasada' },
  { value: 0, label: 'Esta semana' },
  { value: 1, label: 'La siguiente' },
  { value: 2, label: 'Dentro de 2 semanas' },
];

const getMondayOfWeek = (date) => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day + 6) % 7;
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

const getISOWeekNumber = (date) => {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 4 - (target.getDay() || 7));
  const yearStart = new Date(target.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return weekNo;
};

const formatDate = (date) => {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

const formatShortDate = (date) => {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
};

const formatDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createScheduleDays = (startOfWeek) => {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + index);
    return {
      id: index,
      date,
      label: formatShortDate(date),
      startTime: '08:00',
      endTime: '17:00',
      tipo: 'trabajado',
    };
  });
};

const parseTimeToMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const getWorkedMinutes = (startTime, endTime, tipo) => {
  if (tipo !== 'trabajado') return 0;
  const start = parseTimeToMinutes(startTime);
  let end = parseTimeToMinutes(endTime);
  if (end <= start) {
    end += 24 * 60;
  }
  return end - start;
};

const formatWorkedDuration = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
};

const mapSavedDaysToScheduleDays = (startOfWeek, savedDays = []) => {
  const savedByDate = savedDays.reduce((acc, day) => {
    if (day?.date) {
      acc[day.date] = day;
    }
    return acc;
  }, {});

  return createScheduleDays(startOfWeek).map((day) => {
    const savedDay = savedByDate[formatDateInput(day.date)];
    if (!savedDay) return day;

    return {
      ...day,
      tipo: savedDay.tipo || 'trabajado',
      startTime: savedDay.tipo === 'trabajado' && savedDay.startTime ? savedDay.startTime : '08:00',
      endTime: savedDay.tipo === 'trabajado' && savedDay.endTime ? savedDay.endTime : '17:00',
    };
  });
};

const Horario = ({ user }) => {
  const [today] = useState(() => new Date());
  const currentMonday = getMondayOfWeek(today);
  const [selectedWeekOffset, setSelectedWeekOffset] = useState(0);
  const [useCustomPicker, setUseCustomPicker] = useState(false);
  const [manualDate, setManualDate] = useState(formatDateInput(currentMonday));
  const [validManualDate, setValidManualDate] = useState(formatDateInput(currentMonday));
  const [dateError, setDateError] = useState('');
  const [scheduleDays, setScheduleDays] = useState(() => createScheduleDays(currentMonday));
  const [loading, setLoading] = useState(false);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);

  const currentWeekStart = useMemo(() => {
    if (useCustomPicker) {
      const selected = new Date(`${validManualDate}T00:00:00`);
      return getMondayOfWeek(selected);
    }
    const start = getMondayOfWeek(today);
    start.setDate(start.getDate() + selectedWeekOffset * 7);
    return start;
  }, [today, selectedWeekOffset, useCustomPicker, validManualDate]);

  const totalWeeklyMinutes = useMemo(
    () => scheduleDays.reduce((sum, day) => sum + getWorkedMinutes(day.startTime, day.endTime, day.tipo), 0),
    [scheduleDays]
  );

  useEffect(() => {
    const loadWeekSchedule = async () => {
      const weekStartDate = formatDateInput(currentWeekStart);
      const defaultDays = createScheduleDays(currentWeekStart);
      setLoading(true);
      setScheduleLoaded(false);

      if (!user) {
        setScheduleDays(defaultDays);
        setLoading(false);
        return;
      }

      try {
        const docRef = doc(db, 'HORARIOS', user.uid);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          setScheduleDays(defaultDays);
          setLoading(false);
          return;
        }

        const data = docSnap.data();
        const savedWeek = data?.semanas?.[weekStartDate];

        if (savedWeek?.days) {
          setScheduleDays(mapSavedDaysToScheduleDays(currentWeekStart, savedWeek.days));
          setScheduleLoaded(true);
        } else {
          setScheduleDays(defaultDays);
          setScheduleLoaded(false);
        }
      } catch (error) {
        console.error('Error cargando horario:', error);
        setScheduleDays(defaultDays);
        setScheduleLoaded(false);
      } finally {
        setLoading(false);
      }
    };

    loadWeekSchedule();
  }, [currentWeekStart, user]);

  const handleWeekChange = (event) => {
    const offset = Number(event.target.value);
    setSelectedWeekOffset(offset);
    setUseCustomPicker(false);
    setDateError('');
  };

  const handleCustomWeekToggle = (event) => {
    const checked = event.target.checked;
    setUseCustomPicker(checked);
    setDateError('');
    if (checked) {
      setManualDate(formatDateInput(currentWeekStart));
    }
  };

  const handleManualDateChange = (event) => {
    const value = event.target.value;
    setManualDate(value);
    const selectedDate = new Date(`${value}T00:00:00`);

    if (isNaN(selectedDate.getTime())) {
      setDateError('Selecciona una fecha válida.');
      return;
    }

    setDateError('');
    setValidManualDate(value);
  };

  const handleSaveSchedule = async () => {
    if (!user) {
      showToast('No se encontró usuario activo.', 'error');
      return;
    }

    try {
      const weekStartDate = formatDateInput(currentWeekStart);
      const weekEndDate = formatDateInput(new Date(currentWeekStart.getTime() + 6 * 86400000));
      const schedulePayload = {
        semana: weekStartDate,
        weekNumber: getISOWeekNumber(currentWeekStart),
        startDate: weekStartDate,
        endDate: weekEndDate,
        days: scheduleDays.map((day) => {
          const mappedDay = {
            date: formatDateInput(day.date),
            label: day.label,
            tipo: day.tipo,
          };

          if (day.tipo === 'trabajado') {
            mappedDay.startTime = day.startTime;
            mappedDay.endTime = day.endTime;
          }

          return mappedDay;
        }),
        savedAt: new Date().toISOString(),
      };

      await setDoc(
        doc(db, 'HORARIOS', user.uid),
        {
          semanas: {
            [weekStartDate]: schedulePayload,
          },
        },
        { merge: true }
      );

      setScheduleLoaded(true);
      showToast('Horario guardado correctamente.', 'success');
    } catch (error) {
      console.error('Error guardando horario:', error);
      showToast('No se pudo guardar el horario. Intenta de nuevo.', 'error');
    }
  };

  const handleTimeChange = (id, field, value) => {
    setScheduleDays((prev) =>
      prev.map((day) =>
        day.id === id
          ? {
              ...day,
              [field]: value,
            }
          : day
      )
    );
  };

  const handleTipoChange = (id, value) => {
    setScheduleDays((prev) =>
      prev.map((day) =>
        day.id === id
          ? {
              ...day,
              tipo: value,
            }
          : day
      )
    );
  };

  if (loading) {
    return <Loading text="Cargando horario..." />;
  }

  return (
    <div className="horario-container">
      <div className="horario-header">
        <div>
          <h2>Horarios</h2>
          <p className="horario-interval">
            {formatDate(currentWeekStart)} — {formatDate(new Date(currentWeekStart.getTime() + 6 * 86400000))}
          </p>
        </div>

        <div className="horario-controls">
          <div className="horario-select-row">
            <div className="horario-select-wrapper">
              <label htmlFor="weekSelect">Seleccionar semana</label>
              <select id="weekSelect" value={selectedWeekOffset} onChange={handleWeekChange}>
                {weekOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="horario-week-meta">
              <div className="horario-week-number">Semana {getISOWeekNumber(currentWeekStart)}</div>
              <div className={`horario-week-status ${scheduleLoaded ? 'loaded' : 'unloaded'}`}>
                {scheduleLoaded ? 'Horario cargado' : 'Sin horario guardado'}
              </div>
            </div>
          </div>

          <div className="checkbox-wrapper-1 horario-checkbox-toggle">
            <input
              id="horarioCustomPicker"
              className="substituted dark"
              type="checkbox"
              checked={useCustomPicker}
              onChange={handleCustomWeekToggle}
            />
            <label htmlFor="horarioCustomPicker">Usar calendario para seleccionar fecha</label>
          </div>

          {useCustomPicker && (
            <div className="horario-custom-week">
              <label htmlFor="mondayPicker">Selecciona una fecha</label>
              <input
                id="mondayPicker"
                type="date"
                value={manualDate}
                onChange={handleManualDateChange}
                min="2000-01-01"
              />
              {dateError && <p className="horario-error">{dateError}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="horario-card">
        <div className="horario-card-title">Tabla de horarios</div>
        <div className="horario-table-wrapper">
          <table className="horario-table">
            <thead>
              <tr>
                <th>Día</th>
                <th>Hora inicio</th>
                <th>Hora fin</th>
                <th>Horas</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              {scheduleDays.map((day) => {
                const workedMinutes = getWorkedMinutes(day.startTime, day.endTime, day.tipo);
                return (
                  <tr key={day.id} className={day.tipo === 'descanso' ? 'horario-row-free' : ''}>
                    <td>{day.label}</td>
                    <td>
                      <input
                        type="time"
                        value={day.startTime}
                        onChange={(event) => handleTimeChange(day.id, 'startTime', event.target.value)}
                        min="00:00"
                        max="23:59"
                        step="60"
                        disabled={day.tipo !== 'trabajado'}
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        value={day.endTime}
                        onChange={(event) => handleTimeChange(day.id, 'endTime', event.target.value)}
                        min="00:00"
                        max="23:59"
                        step="60"
                        disabled={day.tipo !== 'trabajado'}
                      />
                    </td>
                    <td>{formatWorkedDuration(workedMinutes)}</td>
                    <td>
                      <select
                        className="horario-tipo-select"
                        value={day.tipo}
                        onChange={(event) => handleTipoChange(day.id, event.target.value)}
                      >
                        <option value="trabajado">Trabajado</option>
                        <option value="descanso">Descanso</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="horario-summary">
          Horas totales de la semana: <strong>{formatWorkedDuration(totalWeeklyMinutes)}</strong>
        </div>
        <div className="horario-actions">
          <button type="button" className="horario-save-button" onClick={handleSaveSchedule}>
            Guardar horario
          </button>
        </div>
      </div>
    </div>
  );
};

export default Horario;
