import React, { useEffect, useState, useMemo } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../server/api';
import { showToast } from '../ToastContainer';
import '../../colors.css';
import './calendar.css';
import Loading from '../loading/loading';

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

const formatLongDate = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const getTipoLabel = (tipo) => {
  switch (tipo) {
    case 'trabajado':
      return 'Trabajado';
    case 'descanso':
      return 'Día libre';
    case 'incapacidad_comun':
      return 'Incapacidad común';
    case 'incapacidad_laboral':
      return 'Incapacidad laboral';
    default:
      return 'Sin tipo';
  }
};

const CalendarComponent = ({ user }) => {
  const [diasData, setDiasData] = useState({});
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState('month');
  const [loading, setLoading] = useState(false);

  const [selectedDate, setSelectedDate] = useState('');
  const [selectedDayData, setSelectedDayData] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editTipo, setEditTipo] = useState('trabajado');
  const [editEntryTime, setEditEntryTime] = useState('18:00');
  const [editExitTime, setEditExitTime] = useState('02:00');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setDiasData({});
      setLoading(false);
      return;
    }

    let isMounted = true;
    const loadData = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, 'horasTrabajadas', user.uid);
        const docSnap = await getDoc(docRef);
        if (!isMounted) return;

        if (docSnap.exists()) {
          const data = docSnap.data();
          setDiasData(data.dias || {});
        } else {
          setDiasData({});
        }
      } catch (error) {
        console.error('Error loading data:', error);
        if (isMounted) setDiasData({});
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, [user]);

  const counts = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const counts = { trabajado: 0, descanso: 0, incapacidad_comun: 0, incapacidad_laboral: 0 };
    Object.keys(diasData).forEach(dateStr => {
      const date = new Date(dateStr);
      if (date.getFullYear() === year && date.getMonth() === month) {
        const tipo = diasData[dateStr].tipo;
        if (counts[tipo] !== undefined) counts[tipo]++;
      }
    });
    return counts;
  }, [diasData, currentMonth]);

  const getTileClassName = ({ date, view }) => {
    if (view === 'month') {
      const dateStr = date.toISOString().slice(0, 10);
      const dayData = diasData[dateStr];

      if (dayData && dayData.tipo) {
        return dayData.tipo;
      }
    }
    return null;
  };

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
    const dateStr = date.toISOString().slice(0, 10);
    const dayData = diasData[dateStr];
    if (!dayData) return;

    setSelectedDate(dateStr);
    setSelectedDayData(dayData);
    setDetailsOpen(true);
    setEditMode(false);
    setEditTipo(dayData.tipo || 'trabajado');
    setEditEntryTime(dayData.entrada || '18:00');
    setEditExitTime(dayData.salida || '02:00');
  };

  const startEdit = () => {
    setEditMode(true);
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setEditMode(false);
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    if (!user || !selectedDate) return;

    if (editTipo === 'trabajado' && (!editEntryTime || !editExitTime)) {
      showToast('Completa la hora de entrada y salida para guardar el registro.', 'error');
      return;
    }

    const payload = {
      tipo: editTipo,
      registeredAt: selectedDayData?.registeredAt || new Date().toISOString(),
      date: selectedDate,
    };

    if (editTipo === 'trabajado') {
      payload.entrada = editEntryTime;
      payload.salida = editExitTime;
      payload.worked = calculateWorked(editEntryTime, editExitTime);
    }

    setIsSaving(true);
    try {
      await setDoc(
        doc(db, 'horasTrabajadas', user.uid),
        { dias: { [selectedDate]: payload } },
        { merge: true }
      );
      setDiasData((prev) => ({ ...prev, [selectedDate]: payload }));
      setSelectedDayData(payload);
      setEditMode(false);
      showToast('Registro actualizado.', 'success');
    } catch (error) {
      console.error('Error guardando edición:', error);
      showToast('No se pudo actualizar el registro. Intenta de nuevo.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="pago-container">
        <Loading text="Cargando días..." />
      </div>
    );
  }

  return (
    <div className="pago-container">
      <h2>Calendario de Registro</h2>
      <div className="legend">
        <div className="legend-item">
          <span className="color-box trabajado"></span> Trabajado: {counts.trabajado}
        </div>
        <div className="legend-item">
          <span className="color-box descanso"></span> Descanso: {counts.descanso}
        </div>
        <div className="legend-item">
          <span className="color-box incapacidad_comun"></span> Incapacidad Común: {counts.incapacidad_comun}
        </div>
        <div className="legend-item">
          <span className="color-box incapacidad_laboral"></span> Incapacidad Laboral: {counts.incapacidad_laboral}
        </div>
      </div>
      <button type="button" className="calendar-current-month" onClick={handleMonthClick}>
        {formatMonthYear('es-ES', currentMonth)}
      </button>
      <div className="calendar-container">
        <Calendar
          locale="es-ES"
          calendarType="iso8601"
          view={view}
          onViewChange={handleViewChange}
          formatMonthYear={formatMonthYear}
          navigationLabel={() => null}
          tileClassName={getTileClassName}
          activeStartDate={currentMonth}
          onActiveStartDateChange={handleActiveStartDateChange}
          onClickDay={handleDayClick}
        />
      </div>

      {detailsOpen && selectedDayData && (
        <div className="calendar-modal-overlay">
          <div className="calendar-modal">
            <div className="calendar-modal-header">
              <div>
                <p className="calendar-modal-subtitle">Registro del día</p>
                <h3>{formatLongDate(selectedDate)}</h3>
              </div>
              <button type="button" className="calendar-modal-close" onClick={closeDetails} aria-label="Cerrar modal">
                ×
              </button>
            </div>

            {!editMode ? (
              <div className="calendar-modal-content">
                <div className="calendar-modal-row">
                  <span className="calendar-modal-label">Tipo de registro</span>
                  <strong>{getTipoLabel(selectedDayData.tipo)}</strong>
                </div>

                {selectedDayData.tipo === 'trabajado' ? (
                  <>
                    <div className="calendar-modal-row">
                      <span className="calendar-modal-label">Entrada</span>
                      <strong>{selectedDayData.entrada || '—'}</strong>
                    </div>
                    <div className="calendar-modal-row">
                      <span className="calendar-modal-label">Salida</span>
                      <strong>{selectedDayData.salida || '—'}</strong>
                    </div>
                    <div className="calendar-modal-row">
                      <span className="calendar-modal-label">Tiempo registrado</span>
                      <strong>
                        {selectedDayData.worked?.hours ?? 0}h {selectedDayData.worked?.minutes ?? 0}m {selectedDayData.worked?.seconds ?? 0}s
                      </strong>
                    </div>
                  </>
                ) : (
                  <div className="calendar-modal-row">
                    <span className="calendar-modal-label">Descripción</span>
                    <strong>{getTipoLabel(selectedDayData.tipo)}</strong>
                  </div>
                )}

                <div className="calendar-modal-actions">
                  <button type="button" className="calendar-modal-button" onClick={startEdit}>
                    Editar registro
                  </button>
                  <button type="button" className="calendar-modal-secondary" onClick={closeDetails}>
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <form className="calendar-modal-content" onSubmit={handleSaveEdit}>
                <div className="calendar-modal-row">
                  <label className="calendar-modal-label">Tipo de día</label>
                  <select value={editTipo} onChange={(e) => setEditTipo(e.target.value)}>
                    <option value="trabajado">Trabajado</option>
                    <option value="descanso">Día libre o descanso</option>
                    <option value="incapacidad_comun">Incapacidad común</option>
                    <option value="incapacidad_laboral">Incapacidad laboral</option>
                  </select>
                </div>

                {editTipo === 'trabajado' && (
                  <>
                    <div className="calendar-modal-row two-columns">
                      <div>
                        <label className="calendar-modal-label">Hora de entrada</label>
                        <input
                          type="time"
                          value={editEntryTime}
                          onChange={(e) => setEditEntryTime(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label className="calendar-modal-label">Hora de salida</label>
                        <input
                          type="time"
                          value={editExitTime}
                          onChange={(e) => setEditExitTime(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="calendar-modal-row">
                      <span className="calendar-modal-label">Duración calculada</span>
                      <strong>
                        {calculateWorked(editEntryTime, editExitTime).hours}h {calculateWorked(editEntryTime, editExitTime).minutes}m {calculateWorked(editEntryTime, editExitTime).seconds}s
                      </strong>
                    </div>
                  </>
                )}

                <div className="calendar-modal-actions">
                  <button type="submit" className="calendar-modal-button" disabled={isSaving}>
                    {isSaving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                  <button type="button" className="calendar-modal-secondary" onClick={() => setEditMode(false)} disabled={isSaving}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarComponent;
