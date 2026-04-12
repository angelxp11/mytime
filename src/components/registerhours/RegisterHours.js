import React, { useEffect, useMemo, useState } from 'react';
import { FiCalendar, FiClock, FiSave, FiX } from 'react-icons/fi';
import { doc, setDoc } from 'firebase/firestore';
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
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  return { hours, minutes, seconds };
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

const RegisterHours = ({ user, setCurrentView }) => {
  const [todayActive, setTodayActive] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getTodayDateInput());
  const [entryTime, setEntryTime] = useState('18:00');
  const [exitTime, setExitTime] = useState('02:00');
  const [tipo, setTipo] = useState('trabajado');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (todayActive) {
      setSelectedDate(getTodayDateInput());
    }
  }, [todayActive]);

  const worked = useMemo(() => calculateWorked(entryTime, exitTime), [entryTime, exitTime]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user) return;

    const fecha = selectedDate || getTodayDateInput();
    const payload = {
      tipo,
      registeredAt: new Date().toISOString(),
      date: fecha,
    };

    if (tipo === 'trabajado') {
      payload.entrada = entryTime;
      payload.salida = exitTime;
      payload.worked = {
        hours: worked.hours,
        minutes: worked.minutes,
        seconds: worked.seconds,
      };
    }

    setIsSubmitting(true);

    try {
      await setDoc(
        doc(db, 'horasTrabajadas', user.uid),
        {
          dias: {
            [fecha]: payload,
          },
        },
        { merge: true }
      );
      showToast('Registro guardado con éxito.', 'success');
      if (todayActive) {
        setCurrentView('home');
      } else {
        // Limpiar campos cuando el switch está desactivado
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

  return (
    <div className="register-hours-overlay">
      <div className="register-hours-modal">
        <div className="register-hours-header">
          <div className="register-hours-title">
            <FiClock size={24} />
            <div>
              <h2>Registrar mi tiempo</h2>
              <p>Registra tu jornada de entrada y salida de forma rápida.</p>
            </div>
          </div>
          <button
            type="button"
            className="register-hours-close"
            onClick={() => setCurrentView('home')}
            aria-label="Cerrar modal"
          >
            <FiX size={20} />
          </button>
        </div>

        <form className="register-hours-form" onSubmit={handleSubmit}>
          <div className="register-hours-note">
            <FiCalendar />
            <p>
              Usa el switch para registrar el día de hoy o elegir una fecha pasada. Si el switch está activo, el registro se guardará en la fecha de hoy; si está inactivo, podrás escoger otra fecha.
            </p>
          </div>

          <div className="register-hours-row">
            <label className="switch-label">
              <span>Registrar el día de hoy</span>
              <label className="register-hours-switch">
                <input
                  type="checkbox"
                  checked={todayActive}
                  onChange={(event) => setTodayActive(event.target.checked)}
                />
                <span className="slider" />
              </label>
            </label>
          </div>

          <div className="register-hours-field">
            <label>Fecha</label>
            <div className="input-with-icon">
              <FiCalendar />
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                disabled={todayActive}
                min="2000-01-01"
                max={getTodayDateInput()}
              />
            </div>
          </div>

          <div className="register-hours-field">
            <label>Tipo de día</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="trabajado">Trabajado</option>
              <option value="descanso">Día libre</option>
              <option value="incapacidad_comun">Incapacidad común</option>
              <option value="incapacidad_laboral">Incapacidad laboral</option>
            </select>
          </div>

          {tipo === 'trabajado' && (
            <>
              <div className="register-hours-row two-columns">
                <div className="register-hours-field">
                  <label>Hora de entrada</label>
                  <input
                    type="time"
                    value={entryTime}
                    onChange={(event) => setEntryTime(event.target.value)}
                    required
                  />
                </div>
                <div className="register-hours-field">
                  <label>Hora de salida</label>
                  <input
                    type="time"
                    value={exitTime}
                    onChange={(event) => setExitTime(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="register-hours-field">
                <label>Duración calculada</label>
                <div className="duration-box">
                  <strong>{worked.hours}h {worked.minutes}m {worked.seconds}s</strong>
                  <span>
                    {exitTime <= entryTime
                      ? 'Turno nocturno: salida al día siguiente'
                      : 'Turno del mismo día'}
                  </span>
                </div>
              </div>
            </>
          )}

          <div className="register-hours-actions">
            <button type="submit" className="register-hours-submit" disabled={isSubmitting}>
              <FiSave size={18} /> {isSubmitting ? 'Guardando...' : 'Guardar registro'}
            </button>
            <button
              type="button"
              className="register-hours-secondary"
              onClick={() => setCurrentView('home')}
            >
              Cancelar
            </button>
          </div>

          {!todayActive && selectedDate && (
            <div className="register-hours-info">
              Fecha seleccionada: <strong>{formatLongDate(selectedDate)}</strong>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default RegisterHours;
