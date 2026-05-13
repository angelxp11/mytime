import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../server/api';
import { showToast } from '../../ToastContainer';
import Loading from '../../loading/loading';
import './horariosgrupo.css';

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
  return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
};

const formatDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDayLabel = (date) =>
  new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' }).format(date);

const formatWeekday = (date) =>
  new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(date);

// Solo horas enteras: diff = endH - startH
const calcTotal = (startH, endH, descanso = 0) => {
  let diff = parseInt(endH || 0) - parseInt(startH || 0);

  if (diff < 0) diff += 24;

  const breakTime = parseInt(descanso || 0);

  return Math.max(0, diff - breakTime);
};

const createScheduleDays = (startOfWeek) =>
  Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    return { id: i, date };
  });

const findUserIdByEmail = async (email) => {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const usuariosQuery = query(
    collection(db, 'usuarios'),
    where('email', '==', normalized)
  );
  const querySnapshot = await getDocs(usuariosQuery);
  if (querySnapshot.empty) return null;
  return querySnapshot.docs[0].id;
};

const buildIndividualSchedulePayload = (currentWeekStart, groupSchedules, weekStartDate, participantIndex) => {
  const weekEndDate = formatDateInput(new Date(currentWeekStart.getTime() + 6 * 86400000));
  return {
    semana: weekStartDate,
    weekNumber: getISOWeekNumber(currentWeekStart),
    startDate: weekStartDate,
    endDate: weekEndDate,
    days: createScheduleDays(currentWeekStart).map((day, dayIndex) => {
      const key = `participant_${participantIndex}_day_${dayIndex}`;
      const cell = groupSchedules[key] || {};
      const tipo = cell.estado === 'libre' ? 'descanso' : 'trabajado';
      const mappedDay = {
        date: formatDateInput(day.date),
        label: formatDayLabel(day.date),
        tipo,
      };
      if (tipo === 'trabajado') {
        mappedDay.startTime = `${String(cell.startH || '00').padStart(2, '0')}:00`;
        mappedDay.endTime = `${String(cell.endH || '00').padStart(2, '0')}:00`;
      }
      return mappedDay;
    }),
    savedAt: new Date().toISOString(),
  };
};

// Input numérico de 2 dígitos
const TwoDigitInput = ({ value, onChange, disabled }) => (
  <input
    type="text"
    inputMode="numeric"
    maxLength={2}
    className="horariosgrupo-cell-2dig"
    value={value}
    disabled={disabled}
    onChange={(e) => {
      const v = e.target.value.replace(/\D/g, '').slice(0, 2);
      onChange(v);
    }}
  />
);

// Aviso rotación móvil
const LandscapePrompt = () => (
  <div className="horariosgrupo-landscape-prompt">
    <span className="horariosgrupo-landscape-icon">📱</span>
    <p>Gira el teléfono horizontalmente para ver mejor el horario</p>
  </div>
);

// ─── PARSER DE PEGADO DESDE EXCEL ───────────────────────────────────────────
// Formato por día: estado  entrada  salida  descanso  horas
// "estado" puede ser "-" o texto como "Libre"
// Ejemplo 7 días de un participante:
//   -  9  18  1  8   Libre                    -  9  18  1  8  ...
// Tokens libres: "Libre" seguido de espacios vacíos (las celdas fusionadas de Excel
// se exportan como columnas vacías — en total 5 tokens por día incluyendo el primero)
const parseExcelPaste = (raw, numParticipants, numDays = 7) => {
  const lines = raw.trim().split(/\n/);

  const isTabular = lines.some((l) => l.includes('\t'));

  let rows = [];

  if (isTabular) {
    rows = lines
      .map((line) =>
        line
          .split('\t')
          .map((t) => t.trim())
      )
      // 🔥 eliminar filas basura (vacías reales)
      .filter((row) =>
        row.some((cell) => {
          const v = (cell || '').toLowerCase();
          return (
            v === '-' ||
            v === 'libre' ||
            v === 'descanso' ||
            v === 'day off' ||
            v === 'free' ||
            !isNaN(parseInt(v))
          );
        })
      );
  } else {
    // texto plano (fallback)
    const allTokens = lines.join(' ').trim().split(/\s+/);
    const tokensPerParticipant = numDays * 5;

    for (let p = 0; p < numParticipants; p++) {
      rows.push(
        allTokens.slice(
          p * tokensPerParticipant,
          (p + 1) * tokensPerParticipant
        )
      );
    }
  }

  // 🔥 asegurar cantidad correcta de participantes
  rows = rows.slice(0, numParticipants);

  const newSchedules = {};

  rows.forEach((tokens, pIndex) => {
    let tokenIdx = 0;

    for (let d = 0; d < numDays; d++) {
      const key = `participant_${pIndex}_day_${d}`;

      const tok0 = (tokens[tokenIdx] || '').toLowerCase(); // estado
      const tok1 = tokens[tokenIdx + 1] || ''; // entrada
      const tok2 = tokens[tokenIdx + 2] || ''; // salida
      const tok3 = tokens[tokenIdx + 3] || ''; // descanso
      // tok4 = tokens[tokenIdx + 4] -> IGNORADO (horas)

      const isLibre =
        tok0 === 'libre' ||
        tok0 === 'descanso' ||
        tok0 === 'day off' ||
        tok0 === 'free';

      if (isLibre) {
        newSchedules[key] = {
          estado: 'libre',
          startH: '00',
          endH: '00',
          descanso: '00',
          horas: '00',
        };
      } else {
        const startH = String(parseInt(tok1) || 0).padStart(2, '0');
        const endH = String(parseInt(tok2) || 0).padStart(2, '0');
        const descanso = String(parseInt(tok3) || 0).padStart(2, '0');

        newSchedules[key] = {
          estado: '-',
          startH,
          endH,
          descanso,
          horas: String(calcTotal(startH, endH, descanso)).padStart(2, '0'),
        };
      }

      // 🔥 CLAVE: avanzar SIEMPRE 5 columnas por día
      tokenIdx += 5;
    }
  });

  return newSchedules;
};

// ─── MODAL PEGAR EXCEL ───────────────────────────────────────────────────────
const PasteModal = ({ numParticipants, onApply, onClose }) => {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const handleApply = () => {
    if (!text.trim()) {
      setError('Pega el contenido copiado de Excel primero.');
      return;
    }
    try {
      const result = parseExcelPaste(text, numParticipants);
      if (Object.keys(result).length === 0) {
        setError('No se pudo interpretar el contenido. Revisa el formato.');
        return;
      }
      onApply(result);
      onClose();
    } catch (e) {
      setError('Error al procesar el texto: ' + e.message);
    }
  };

  return (
    <div className="horariosgrupo-modal-overlay" onClick={onClose}>
      <div
        className="horariosgrupo-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="horariosgrupo-modal-header">
          <h3>📋 Pegar horarios desde Excel</h3>
          <button className="horariosgrupo-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="horariosgrupo-modal-body">
          <p className="horariosgrupo-modal-hint">
            Copia las celdas directamente desde Excel y pégalas aquí.<br />
            Formato por día: <code>Estado · Entrada · Salida · Descanso · Horas</code><br />
            El estado <strong>"Libre"</strong> marcará ese día como descanso.
          </p>
          <p className="horariosgrupo-modal-hint horariosgrupo-modal-hint--sub">
            Se detectarán automáticamente <strong>{numParticipants} participante{numParticipants !== 1 ? 's' : ''}</strong>.
          </p>
          <textarea
            className="horariosgrupo-modal-textarea"
            placeholder={`Pega aquí el contenido copiado de Excel…\n\nEjemplo (2 participantes, 7 días):\n-\t9\t18\t1\t8\tLibre\t\t\t\t\t-\t9\t18\t1\t8\t…`}
            value={text}
            onChange={(e) => { setText(e.target.value); setError(''); }}
            rows={10}
            spellCheck={false}
          />
          {error && <p className="horariosgrupo-modal-error">{error}</p>}
        </div>

        <div className="horariosgrupo-modal-footer">
          <button className="horariosgrupo-modal-cancel" onClick={onClose}>Cancelar</button>
          <button className="horariosgrupo-modal-apply" onClick={handleApply}>
            ✅ Aplicar horarios
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
const HorariosGrupo = ({ group, user, onBack }) => {
  const [today] = useState(() => new Date());
  const currentMonday = getMondayOfWeek(today);
  const [selectedWeekOffset, setSelectedWeekOffset] = useState(0);
  const [useCustomPicker, setUseCustomPicker] = useState(false);
  const [manualDate, setManualDate] = useState(formatDateInput(currentMonday));
  const [validManualDate, setValidManualDate] = useState(formatDateInput(currentMonday));
  const [dateError, setDateError] = useState('');
  const [groupSchedules, setGroupSchedules] = useState({});
  const [loading, setLoading] = useState(false);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [participants, setParticipants] = useState(group.participants || []);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [isPortrait, setIsPortrait] = useState(
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );
  // Detectar el rol del usuario en el grupo
  const userEmail = user?.email?.toLowerCase() || '';
  const userRole = React.useMemo(() => {
    if (group.ownerId === user?.uid) return 'owner';
    const found = (group.participants || []).find(
      (p) => (p.email?.toLowerCase?.() === userEmail)
    );
    // Si es participante pero no tiene rol definido, por defecto es 'editor'
    return found?.role || 'editor';
  }, [group, userEmail, user?.uid]);

  useEffect(() => {
    const check = () => setIsPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  const currentWeekStart = useMemo(() => {
    if (useCustomPicker) {
      const selected = new Date(`${validManualDate}T00:00:00`);
      return getMondayOfWeek(selected);
    }
    const start = getMondayOfWeek(today);
    start.setDate(start.getDate() + selectedWeekOffset * 7);
    return start;
  }, [today, selectedWeekOffset, useCustomPicker, validManualDate]);

  const formatGroupCellFromSavedDay = (day) => {
    const tipo = day?.tipo || 'trabajado';
    const isDescanso = tipo === 'descanso';
    const startH = isDescanso ? '00' : String(day?.startTime?.split(':')[0] || '00').padStart(2, '0');
    const endH = isDescanso ? '00' : String(day?.endTime?.split(':')[0] || '00').padStart(2, '0');
    return {
      estado: isDescanso ? 'libre' : '-',
      startH,
      endH,
      descanso: '00',
      horas: isDescanso
  ? '00'
  : String(calcTotal(startH, endH, 0)).padStart(2, '0'),
    };
  };

  const buildDefaultSchedule = (numParticipants = participants.length) => {
    const schedule = {};
    for (let pIndex = 0; pIndex < numParticipants; pIndex++) {
      for (let d = 0; d < 7; d++) {
        const key = `participant_${pIndex}_day_${d}`;
        schedule[key] = {
          estado: '-',
          startH: '00',
          endH: '00',
          descanso: '00',
          horas: '00',
        };
      }
    }
    return schedule;
  };

  useEffect(() => {
    const loadGroupSchedules = async () => {
      const weekStartDate = formatDateInput(currentWeekStart);
      setLoading(true);
      setScheduleLoaded(false);
      if (!user) { setLoading(false); return; }
      try {
        // Usar el ID del owner del grupo para garantizar consistencia
        const ownerId = group.ownerId || group.id;
        const docRef = doc(db, 'HORARIOS_GRUPOS', `${ownerId}_${group.id}`);
        const docSnap = await getDoc(docRef);
        const data = docSnap.exists() ? docSnap.data() : null;
        const savedWeek = data?.semanas?.[weekStartDate];

        // 🔥 0. Inicializar orderedParticipants (disponible en ambas ramas)
        let orderedParticipants = group.participants || [];

        if (savedWeek?.groupSchedules) {
  const schedules = {};

  // 🔥 1. Restaurar participantes manteniendo TODOS del grupo actual
  // Usa participantes del grupo como fuente de verdad, pero respeta el orden guardado
  if (savedWeek.participants && Array.isArray(savedWeek.participants)) {
    // Crear un set de emails de participantes guardados
    const savedParticipantEmails = new Set(
      savedWeek.participants.map(p => p.email?.toLowerCase())
    );
    
    // Reordenar: primero los guardados (en su orden), luego los nuevos
    orderedParticipants = [
      ...savedWeek.participants.filter(p => 
        group.participants?.some(gp => gp.email?.toLowerCase() === p.email?.toLowerCase())
      ),
      ...(group.participants || []).filter(gp =>
        !savedParticipantEmails.has(gp.email?.toLowerCase())
      ),
    ];
  }
  
  setParticipants(orderedParticipants);

  // 🔥 2. Reconstruir horarios
  if (Array.isArray(savedWeek.groupSchedules)) {
    savedWeek.groupSchedules.forEach((participantEntry) => {
      const participantIndex = Number(participantEntry.participantIndex ?? 0);

      participantEntry.days?.forEach((day, dayIndex) => {
        const key = `participant_${participantIndex}_day_${dayIndex}`;

        schedules[key] = formatGroupCellFromSavedDay(day);
      });
    });
  } else {
    Object.entries(savedWeek.groupSchedules).forEach(([key, value]) => {
      schedules[key] = {
        estado: value.estado || '-',
        startH: String(value.startH || '00').padStart(2, '0'),
        endH: String(value.endH || '00').padStart(2, '0'),
        descanso: String(value.descanso || '00').padStart(2, '0'),
        horas: String(
          value.horas || calcTotal(value.startH, value.endH)
        ).padStart(2, '0'),
      };
    });
  }

  // 🔥 3. Aplicar horarios (usa la cantidad correcta de participantes)
  setGroupSchedules({
    ...buildDefaultSchedule(orderedParticipants.length),
    ...schedules,
  });

  setScheduleLoaded(true);
  setLastUpdated(savedWeek.updatedAt);
} else {
          const schedules = buildDefaultSchedule(orderedParticipants.length);
          for (let pIndex = 0; pIndex < orderedParticipants.length; pIndex++) {
            const participant = orderedParticipants[pIndex];
            let participantId = participant.uid;
            if (!participantId && participant.email) {
              participantId = await findUserIdByEmail(participant.email);
            }
            if (!participantId) continue;
            try {
              const userDocRef = doc(db, 'HORARIOS', participantId);
              const userDocSnap = await getDoc(userDocRef);
              if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                const userWeek = userData?.semanas?.[weekStartDate];
                if (userWeek?.days) {
                  userWeek.days.forEach((day, dIndex) => {
                    const key = `participant_${pIndex}_day_${dIndex}`;
                    schedules[key] = formatGroupCellFromSavedDay(day);
                  });
                }
              }
            } catch (err) {
              console.error('Error loading individual schedule for', participant.email, err);
            }
          }
          setGroupSchedules(schedules);
          setParticipants(orderedParticipants);
          setScheduleLoaded(false);
          setLastUpdated(null);
        }
      } catch (error) {
        console.error('Error cargando horarios del grupo:', error);
        setGroupSchedules(buildDefaultSchedule());
        setScheduleLoaded(false);
        setLastUpdated(null);
      } finally {
        setLoading(false);
      }
    };
    loadGroupSchedules();
  }, [currentWeekStart, user, group.id, group.participants?.length]);

  const handleWeekChange = (e) => {
    setSelectedWeekOffset(Number(e.target.value));
    setUseCustomPicker(false);
    setDateError('');
  };

  const handleCustomWeekToggle = (e) => {
    setUseCustomPicker(e.target.checked);
    setDateError('');
    if (e.target.checked) setManualDate(formatDateInput(currentWeekStart));
  };

  const handleManualDateChange = (e) => {
    const value = e.target.value;
    setManualDate(value);
    const selectedDate = new Date(`${value}T00:00:00`);
    if (isNaN(selectedDate.getTime())) { setDateError('Selecciona una fecha válida.'); return; }
    setDateError('');
    setValidManualDate(value);
  };

  const handleDragStart = (index) => setDraggedIndex(index);
  const handleDragOver = (e) => e.preventDefault();

  const handleDrop = (targetIndex) => {
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    const from = draggedIndex;
    const to = targetIndex;

    const newParticipants = [...participants];
    [newParticipants[from], newParticipants[to]] = [newParticipants[to], newParticipants[from]];

    const newSchedules = { ...groupSchedules };
    for (let d = 0; d < 7; d++) {
      const kFrom = `participant_${from}_day_${d}`;
      const kTo = `participant_${to}_day_${d}`;
      const tmp = newSchedules[kFrom];
      newSchedules[kFrom] = newSchedules[kTo];
      newSchedules[kTo] = tmp;
      if (newSchedules[kFrom] === undefined) delete newSchedules[kFrom];
      if (newSchedules[kTo] === undefined) delete newSchedules[kTo];
    }

    setParticipants(newParticipants);
    setGroupSchedules(newSchedules);
    setDraggedIndex(null);
  };

  const updateCell = (pIndex, dayIndex, field, value) => {
    const key = `participant_${pIndex}_day_${dayIndex}`;
    setGroupSchedules((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleSaveSchedules = async () => {
    if (!user) { showToast('No se encontró usuario activo.', 'error'); return; }

    try {
      const weekStartDate = formatDateInput(currentWeekStart);
      const weekEndDate = formatDateInput(new Date(currentWeekStart.getTime() + 6 * 86400000));
      const groupSchedulesArray = participants.map((participant, pIndex) => {
        const participantDays = createScheduleDays(currentWeekStart).map((day, dayIndex) => {
          const key = `participant_${pIndex}_day_${dayIndex}`;
          const cell = groupSchedules[key] || {};
          const tipo = cell.estado === 'libre' ? 'descanso' : 'trabajado';
          const mappedDay = {
            date: formatDateInput(day.date),
            label: formatDayLabel(day.date),
            tipo,
          };

          if (tipo === 'trabajado') {
            mappedDay.startTime = `${String(cell.startH || '00').padStart(2, '0')}:00`;
            mappedDay.endTime = `${String(cell.endH || '00').padStart(2, '0')}:00`;
          }

          return mappedDay;
        });

        return {
          participantIndex: pIndex,
          uid: participant.uid || '',
          email: participant.email || '',
          name: participant.name || '',
          days: participantDays,
        };
      });

      const schedulePayload = {
  semana: weekStartDate,
  weekNumber: getISOWeekNumber(currentWeekStart),
  startDate: weekStartDate,
  endDate: weekEndDate,
  ownerId: group.ownerId || group.id,

  participants, // 👈 ORDEN REAL
  participantOrder: participants.map((p, index) => ({
    uid: p.uid || '',
    email: p.email || '',
    index,
  })),

  groupSchedules: groupSchedulesArray,
  updatedAt: new Date().toISOString(),
};

      await setDoc(
        doc(db, 'HORARIOS_GRUPOS', `${group.ownerId || group.id}_${group.id}`),
        { semanas: { [weekStartDate]: schedulePayload } },
        { merge: true }
      );

      await Promise.all(
        participants.map(async (participant, pIndex) => {
          if (!participant.email) return;
          const participantId = participant.uid || await findUserIdByEmail(participant.email);
          if (!participantId) return;

          const individualPayload = buildIndividualSchedulePayload(
            currentWeekStart,
            groupSchedules,
            weekStartDate,
            pIndex
          );

          await setDoc(
            doc(db, 'HORARIOS_aa', participantId),
            { semanas: { [weekStartDate]: individualPayload } },
            { merge: true }
          );
        })
      );

      setScheduleLoaded(true);
      setLastUpdated(schedulePayload.updatedAt);
      showToast('Horarios del grupo guardados correctamente y exportados a HORARIOS.', 'success');
    } catch (error) {
      console.error('Error guardando horarios del grupo:', error);
      showToast('No se pudo guardar los horarios. Intenta de nuevo.', 'error');
    }
  };

  // Aplica horarios pegados desde el modal
  const handleApplyPaste = (parsedSchedules) => {
    setGroupSchedules((prev) => ({ ...prev, ...parsedSchedules }));
    showToast('Horarios cargados correctamente desde Excel.', 'success');
  };

  // Calcula total de horas de un participante en la semana
  const calcRowTotal = (pIndex, days) => {
    let total = 0;
    days.forEach((_, dayIndex) => {
      const key = `participant_${pIndex}_day_${dayIndex}`;
      const cell = groupSchedules?.[key] || {};
      if (cell.estado !== 'libre') {
        total += calcTotal(cell.startH, cell.endH, cell.descanso);
      }
    });
    return total;
  };

  if (loading) return <Loading text="Cargando horarios del grupo..." />;

  const days = createScheduleDays(currentWeekStart);

  return (
    <div className="horariosgrupo-container">
      <button className="horariosgrupo-back-button" onClick={onBack}>
        ← Volver
      </button>

      <div className="horariosgrupo-header">
        <h2>{group.groupName}</h2>
        <p>Gestiona los horarios del grupo para la semana</p>
      </div>

      {/* CONTROLS */}
      <div className="horariosgrupo-controls">
        <div className="horariosgrupo-select-wrapper">
          <label htmlFor="weekSelect">Seleccionar semana</label>
          <select id="weekSelect" value={selectedWeekOffset} onChange={handleWeekChange}>
            {weekOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="horariosgrupo-week-meta">
          <div className="horariosgrupo-week-number">Semana {getISOWeekNumber(currentWeekStart)}</div>
          <div className={`horariosgrupo-week-status ${scheduleLoaded ? 'loaded' : 'unloaded'}`}>
            {scheduleLoaded ? 'Cargado' : 'Sin guardar'}
          </div>
          {lastUpdated && (
            <div className="horariosgrupo-last-updated">
              Actualizado: {new Date(lastUpdated).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Toggle switch propio */}
        <label className="horariosgrupo-toggle-label">
          <input
            type="checkbox"
            className="horariosgrupo-toggle-input"
            checked={useCustomPicker}
            onChange={handleCustomWeekToggle}
          />
          <span className="horariosgrupo-toggle-track">
            <span className="horariosgrupo-toggle-thumb" />
          </span>
          <span className="horariosgrupo-toggle-text">Usar calendario para seleccionar fecha</span>
        </label>

        {useCustomPicker && (
          <div className="horariosgrupo-custom-week">
            <label htmlFor="mondayPicker">Selecciona una fecha</label>
            <input
              id="mondayPicker"
              type="date"
              value={manualDate}
              onChange={handleManualDateChange}
              min="2000-01-01"
            />
            {dateError && <p className="horariosgrupo-error">{dateError}</p>}
          </div>
        )}
      </div>

      {/* Aviso rotación solo en móvil portrait */}
      {isMobile && isPortrait && <LandscapePrompt />}

      {/* TABLA EXCEL */}
      <div className="horariosgrupo-table-wrapper">
        <table className="horariosgrupo-table">
          <thead>
            <tr>
              <th className="horariosgrupo-th horariosgrupo-th-name" rowSpan={2}>
                Participante
              </th>
              {days.map((day, dayIndex) => (
                <th key={dayIndex} className="horariosgrupo-th horariosgrupo-th-day" colSpan={5}>
                  <div className="horariosgrupo-day-weekday">{formatWeekday(day.date)}</div>
                  <div className="horariosgrupo-day-date">{formatDayLabel(day.date)}</div>
                </th>
              ))}
              <th className="horariosgrupo-th horariosgrupo-th-rowtotal" rowSpan={2}>
                Total<br />horas
              </th>
            </tr>
            <tr>
              {days.map((_, dayIndex) => (
                <React.Fragment key={dayIndex}>
                  <th className="horariosgrupo-th horariosgrupo-th-sub">Est</th>
                  <th className="horariosgrupo-th horariosgrupo-th-sub">Entr</th>
                  <th className="horariosgrupo-th horariosgrupo-th-sub">Sal</th>
                  <th className="horariosgrupo-th horariosgrupo-th-sub">Desc</th>
                  <th className="horariosgrupo-th horariosgrupo-th-sub">Tot</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {participants.map((participant, pIndex) => {
              const rowTotal = calcRowTotal(pIndex, days);
              return (
                <tr
                  key={`${participant.email}-${pIndex}`}
                  className={`horariosgrupo-row ${draggedIndex === pIndex ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(pIndex)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(pIndex)}
                >
                  <td className="horariosgrupo-td horariosgrupo-td-name">
                    <span className="horariosgrupo-drag-handle">⋮⋮</span>
                    <strong className="horariosgrupo-participant-name">{participant.name}</strong>
                  </td>

                  {days.map((_, dayIndex) => {
                    const key = `participant_${pIndex}_day_${dayIndex}`;
                    const cell = groupSchedules?.[key] || {};
                    const estado = cell.estado || '-';
                    const libre = estado === 'libre';
                    const startH = cell.startH || '00';
                    const endH = cell.endH || '00';
                    const dayTotal = libre
  ? 0
  : calcTotal(startH, endH, cell.descanso);

                    if (libre) {
                      return (
                        <React.Fragment key={dayIndex}>
                          <td className="horariosgrupo-td horariosgrupo-td-estado">
                            <select
                              className="horariosgrupo-cell-estado"
                              value={estado}                            disabled={userRole === 'lector'}                              onChange={(e) => updateCell(pIndex, dayIndex, 'estado', e.target.value)}
                            >
                              <option value="-">-</option>
                              <option value="libre">libre</option>
                            </select>
                          </td>
                          <td className="horariosgrupo-td horariosgrupo-td-descanso" colSpan={4}>
                            DESCANSO
                          </td>
                        </React.Fragment>
                      );
                    }

                    return (
                      <React.Fragment key={dayIndex}>
                        <td className="horariosgrupo-td horariosgrupo-td-estado">
                          <select
                            className="horariosgrupo-cell-estado"
                            value={estado}
                            disabled={userRole === 'lector'}
                            onChange={(e) => updateCell(pIndex, dayIndex, 'estado', e.target.value)}
                          >
                            <option value="-">-</option>
                            <option value="libre">libre</option>
                          </select>
                        </td>
                        <td className="horariosgrupo-td">
                          <TwoDigitInput
                            value={startH}
                            disabled={userRole === 'lector'}
                            onChange={(v) => updateCell(pIndex, dayIndex, 'startH', v)}
                          />
                        </td>
                        <td className="horariosgrupo-td">
                          <TwoDigitInput
                            value={endH}
                            disabled={userRole === 'lector'}
                            onChange={(v) => updateCell(pIndex, dayIndex, 'endH', v)}
                          />
                        </td>
                        <td className="horariosgrupo-td">
                          <TwoDigitInput
                            value={cell.descanso || '00'}
                            disabled={userRole === 'lector'}
                            onChange={(v) => updateCell(pIndex, dayIndex, 'descanso', v)}
                          />
                        </td>
                        <td className="horariosgrupo-td horariosgrupo-td-total">
                          {dayTotal}h
                        </td>
                      </React.Fragment>
                    );
                  })}

                  {/* Columna total horas de la semana */}
                  <td className="horariosgrupo-td horariosgrupo-td-rowtotal">
                    {rowTotal}h
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="horariosgrupo-actions">
        {/* Solo editores y owner pueden ver los botones */}
        {(userRole === 'editor' || userRole === 'owner') && (
          <>
            <button
              type="button"
              className="horariosgrupo-paste-button"
              onClick={() => setShowPasteModal(true)}
            >
              📋 Pegar de Excel
            </button>
            <button type="button" className="horariosgrupo-save-button" onClick={handleSaveSchedules}>
              Guardar horarios
            </button>
          </>
        )}
        {userRole === 'lector' && (
          <div className="horariosgrupo-viewer-notice">
            📖 Tienes acceso de lectura. Solo editores pueden modificar los horarios.
          </div>
        )}
      </div>

      {/* Modal pegar Excel */}
      {showPasteModal && (
        <PasteModal
          numParticipants={participants.length}
          onApply={handleApplyPaste}
          onClose={() => setShowPasteModal(false)}
        />
      )}
    </div>
  );
};

export default HorariosGrupo;
//"2"