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

// Mapeo de estados a descripciones
const estadoDescriptions = {
  '-': 'DESCANSO',
  'libre': 'DESCANSO',
  'INC': 'INCAPACIDAD',
  'LIC': 'LICENCIA',
  'VAC': 'VACACIONES',
  'SAN': 'SANCIONADO',
  'CAP': 'CAPACITACIÓN',
  'CEO': 'CEO',
};

const getEstadoDescription = (estado) => estadoDescriptions[estado] || estado;

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
  const nonWorkingStates = ['libre', 'INC', 'LIC', 'VAC', 'SAN', 'CAP', 'CEO'];
  return {
    semana: weekStartDate,
    weekNumber: getISOWeekNumber(currentWeekStart),
    startDate: weekStartDate,
    endDate: weekEndDate,
    days: createScheduleDays(currentWeekStart).map((day, dayIndex) => {
      const key = `participant_${participantIndex}_day_${dayIndex}`;
      const cell = groupSchedules[key] || {};
      const tipo = nonWorkingStates.includes(cell.estado) ? 'descanso' : 'trabajado';
      const mappedDay = {
        date: formatDateInput(day.date),
        label: formatDayLabel(day.date),
        tipo,
      };
      if (cell.estado && cell.estado !== '-') {
        // Incluir el estado especial (VAC, INC, LIC, SAN, CAP, CEO, etc.)
        mappedDay.estado = cell.estado;
      }
      if (cell.estado === '-') {
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
            v === 'inc' ||
            v === 'lic' ||
            v === 'vac' ||
            v === 'san' ||
            v === 'cap' ||
            v === 'ceo' ||
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

      const isNonWorkingDay =
        tok0 === 'libre' ||
        tok0 === 'descanso' ||
        tok0 === 'day off' ||
        tok0 === 'free' ||
        tok0 === 'inc' ||
        tok0 === 'lic' ||
        tok0 === 'vac' ||
        tok0 === 'san' ||
        tok0 === 'cap' ||
        tok0 === 'ceo';

      if (isNonWorkingDay) {
        const estadoMap = {
          'libre': 'libre',
          'descanso': 'libre',
          'day off': 'libre',
          'free': 'libre',
          'inc': 'INC',
          'lic': 'LIC',
          'vac': 'VAC',
          'san': 'SAN',
          'cap': 'CAP',
          'ceo': 'CEO',
        };
        newSchedules[key] = {
          estado: estadoMap[tok0] || 'libre',
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

// ─── FUNCIÓN PARA GENERAR MENSAJE DE CAMBIOS ────────────────────────────────
const getChangeMessage = (prev, current) => {
  if (!prev || !current) return '';

  const cambios = [];

  if (prev.estado !== current.estado) {
    cambios.push(`Est: ${prev.estado} → ${current.estado}`);
  }

  if (prev.startH !== current.startH) {
    cambios.push(`Ent: ${prev.startH} → ${current.startH}`);
  }

  if (prev.endH !== current.endH) {
    cambios.push(`Sal: ${prev.endH} → ${current.endH}`);
  }

  if (prev.descanso !== current.descanso) {
    cambios.push(`Desc: ${prev.descanso} → ${current.descanso}`);
  }

  return cambios.length ? cambios : [];
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
            Estados disponibles: <strong>-</strong> (trabajado), <strong>Libre</strong>, <strong>INC</strong> (Incapacidad), <strong>LIC</strong> (Licencia), <strong>VAC</strong> (Vacaciones), <strong>SAN</strong> (Sancionado), <strong>CAP</strong> (Capacitación), <strong>CEO</strong>.
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
  const [previousGroupSchedules, setPreviousGroupSchedules] = useState({});
  const [changedCells, setChangedCells] = useState(new Set());
  const [hoverCell, setHoverCell] = useState(null);
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

  const getCargoLevelById = React.useCallback((cargoId) => {
    const cargo = group.cargos?.find((item) => item.id === cargoId);
    return cargo?.nivel ?? null;
  }, [group.cargos]);

  const getCargoLevelClass = (participant) => {
    const nivel = getCargoLevelById(participant?.cargo);
    return nivel ? `cargo-level-${nivel}` : '';
  };

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
      estado: day?.estado || (isDescanso ? 'libre' : '-'),
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
        let orderedParticipants = group.participants || [];

// 🔥 aplicar orden global si existe
if (data?.participantOrderGlobal) {
  const orderMap = new Map(
    data.participantOrderGlobal.map(p => [p.email?.toLowerCase(), p.index])
  );

  orderedParticipants = [...orderedParticipants].sort((a, b) => {
    const emailA = a.email?.toLowerCase();
    const emailB = b.email?.toLowerCase();
    const hasA = orderMap.has(emailA);
    const hasB = orderMap.has(emailB);
    const indexA = orderMap.get(emailA);
    const indexB = orderMap.get(emailB);
    const levelA = getCargoLevelById(a.cargo) ?? 999;
    const levelB = getCargoLevelById(b.cargo) ?? 999;

    if (levelA !== levelB) return levelA - levelB;

    if (hasA && hasB) return indexA - indexB;
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;

    return (a.name || '').localeCompare(b.name || '');
  });
}
        const savedWeek = data?.semanas?.[weekStartDate];

        if (savedWeek?.groupSchedules) {
  const schedules = {};

  // 🔥 1. Restaurar participantes manteniendo TODOS del grupo actual
  // Si hay participantOrderGlobal, ese orden prevalece en todas las semanas.
  if (!data?.participantOrderGlobal && savedWeek.participants && Array.isArray(savedWeek.participants)) {
    const savedParticipantEmails = new Set(
      savedWeek.participants.map(p => p.email?.toLowerCase())
    );

    orderedParticipants = [
      ...orderedParticipants.filter((p) => savedParticipantEmails.has(p.email?.toLowerCase())),
      ...orderedParticipants.filter((p) => !savedParticipantEmails.has(p.email?.toLowerCase())),
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
  const finalSchedules = {
    ...buildDefaultSchedule(orderedParticipants.length),
    ...schedules,
  };
  setPreviousGroupSchedules(finalSchedules);
  setGroupSchedules(finalSchedules);
  setChangedCells(new Set());

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
          setPreviousGroupSchedules(schedules);
          setGroupSchedules(schedules);
          setChangedCells(new Set());
          setParticipants(orderedParticipants);
          setScheduleLoaded(false);
          setLastUpdated(null);
        }
      } catch (error) {
        console.error('Error cargando horarios del grupo:', error);
        const defaultSchedule = buildDefaultSchedule();
        setPreviousGroupSchedules(defaultSchedule);
        setGroupSchedules(defaultSchedule);
        setChangedCells(new Set());
        setScheduleLoaded(false);
        setLastUpdated(null);
      } finally {
        setLoading(false);
      }
    };
    loadGroupSchedules();
  }, [currentWeekStart, user, group.id, group.participants?.length, getCargoLevelById]);

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

    // Reordenar participantes: remover y insertar en nueva posición
    const newParticipants = [...participants];
    const [draggedItem] = newParticipants.splice(from, 1);
    newParticipants.splice(to, 0, draggedItem);

    // Mapear índices viejos a nuevos para reorganizar horarios
    const oldIndices = Array.from({ length: participants.length }, (_, i) => i);
    const [draggedOldIdx] = oldIndices.splice(from, 1);
    oldIndices.splice(to, 0, draggedOldIdx);

    // Reorganizar horarios según el nuevo orden
    const newSchedules = {};
    for (let newIdx = 0; newIdx < newParticipants.length; newIdx++) {
      const oldIdx = oldIndices[newIdx];
      for (let d = 0; d < 7; d++) {
        const oldKey = `participant_${oldIdx}_day_${d}`;
        const newKey = `participant_${newIdx}_day_${d}`;
        newSchedules[newKey] = groupSchedules[oldKey];
      }
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
  const handleSaveParticipantOrder = async () => {
  try {
    const ownerId = group.ownerId || group.id;

    const orderPayload = participants.map((p, index) => ({
      uid: p.uid || '',
      email: p.email || '',
      index,
    }));

    await setDoc(
      doc(db, 'HORARIOS_GRUPOS', `${ownerId}_${group.id}`),
      {
        participantOrderGlobal: orderPayload,
      },
      { merge: true }
    );

    showToast('Orden de participantes guardado correctamente.', 'success');
  } catch (error) {
    console.error(error);
    showToast('Error guardando el orden.', 'error');
  }
};

  const handleSaveSchedules = async () => {
    if (!user) { showToast('No se encontró usuario activo.', 'error'); return; }

    try {
      const weekStartDate = formatDateInput(currentWeekStart);
      const weekEndDate = formatDateInput(new Date(currentWeekStart.getTime() + 6 * 86400000));
      const groupSchedulesArray = participants.map((participant, pIndex) => {
        const nonWorkingStates = ['libre', 'INC', 'LIC', 'VAC', 'SAN', 'CAP', 'CEO'];
        const participantDays = createScheduleDays(currentWeekStart).map((day, dayIndex) => {
          const key = `participant_${pIndex}_day_${dayIndex}`;
          const cell = groupSchedules[key] || {};
          const tipo = nonWorkingStates.includes(cell.estado) ? 'descanso' : 'trabajado';
          const mappedDay = {
            date: formatDateInput(day.date),
            label: formatDayLabel(day.date),
            tipo,
          };

          if (cell.estado && cell.estado !== '-') {
            // Incluir el estado especial (VAC, INC, LIC, SAN, CAP, CEO, etc.)
            mappedDay.estado = cell.estado;
          }

          if (cell.estado === '-') {
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
            doc(db, 'HORARIOS', participantId),
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
    const newSchedules = { ...groupSchedules, ...parsedSchedules };
    setGroupSchedules(newSchedules);
    
    // Detectar celdas que cambiaron
    const changed = new Set();
    Object.keys(parsedSchedules).forEach((key) => {
      const oldValue = JSON.stringify(groupSchedules[key] || {});
      const newValue = JSON.stringify(parsedSchedules[key] || {});
      if (oldValue !== newValue) {
        changed.add(key);
      }
    });
    
    setChangedCells(changed);
    showToast('Horarios cargados correctamente desde Excel.', 'success');
  };

  // Calcula total de horas de un participante en la semana
  const calcRowTotal = (pIndex, days) => {
    let total = 0;
    days.forEach((_, dayIndex) => {
      const key = `participant_${pIndex}_day_${dayIndex}`;
      const cell = groupSchedules?.[key] || {};
      const estado = cell.estado || '-';
      
      if (estado === 'CEO' || estado === 'CAP') {
        total += 8;
      } else if (!['libre', 'INC', 'LIC', 'VAC', 'SAN'].includes(estado)) {
        total += calcTotal(cell.startH, cell.endH, cell.descanso);
      }
    });
    return total;
  };

  const handleCopyMatrix = async () => {
    try {
      const days = createScheduleDays(currentWeekStart);
      let matrixText = '';

      // Encabezados
      let headerRow = 'Participante';
      days.forEach((day) => {
        const dayLabel = formatDayLabel(day.date);
        headerRow += `\t${dayLabel}\t\t\t\t`;
      });
      headerRow += '\tTotal horas';
      matrixText += headerRow + '\n';

      // Subencabezados (Est, Entr, Sal, Desc, Tot para cada día)
      let subHeaderRow = '';
      days.forEach(() => {
        subHeaderRow += '\tEst\tEntr\tSal\tDesc\tTot';
      });
      subHeaderRow += '\t';
      matrixText += subHeaderRow + '\n';

      // Filas de participantes
      participants.forEach((participant, pIndex) => {
        let row = participant.name || 'Sin nombre';
        const rowTotal = calcRowTotal(pIndex, days);

        days.forEach((_, dayIndex) => {
          const key = `participant_${pIndex}_day_${dayIndex}`;
          const cell = groupSchedules?.[key] || {};
          const estado = cell.estado === 'libre' ? 'Libre' : '-';
          const startH = cell.startH || '00';
          const endH = cell.endH || '00';
          const descanso = cell.descanso || '00';
          const dayTotal = cell.estado === 'libre' ? 0 : calcTotal(startH, endH, descanso);

          row += `\t${estado}\t${startH}\t${endH}\t${descanso}\t${dayTotal}`;
        });

        row += `\t${rowTotal}`;
        matrixText += row + '\n';
      });

      // Copiar al portapapeles
      await navigator.clipboard.writeText(matrixText);
      showToast('Matriz copiada al portapapeles. ¡Listo para pegar en Excel!', 'success');
    } catch (error) {
      console.error('Error copiando matriz:', error);
      showToast('Error al copiar la matriz.', 'error');
    }
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
                  <td className={`horariosgrupo-td horariosgrupo-td-name ${getCargoLevelClass(participant)}`}>
                    <span className="horariosgrupo-drag-handle">⋮⋮</span>
                    <strong className="horariosgrupo-participant-name">{participant.name}</strong>
                  </td>

                  {days.map((_, dayIndex) => {
                    const key = `participant_${pIndex}_day_${dayIndex}`;
                    const cell = groupSchedules?.[key] || {};
                    const estado = cell.estado || '-';
                    const isNonWorkingDay = ['libre', 'INC', 'LIC', 'VAC', 'SAN', 'CAP', 'CEO'].includes(estado);
                    const startH = cell.startH || '00';
                    const endH = cell.endH || '00';
                    const dayTotal = isNonWorkingDay
  ? (estado === 'CEO' || estado === 'CAP' ? 8 : 0)
  : calcTotal(startH, endH, cell.descanso);

                    if (isNonWorkingDay) {
                      return (
                        <React.Fragment key={dayIndex}>
                          <td className={`horariosgrupo-td horariosgrupo-td-estado horariosgrupo-estado-${estado}`}>
                            <select
                              className="horariosgrupo-cell-estado"
                              value={estado}
                              disabled={userRole === 'lector'}
                              onChange={(e) => updateCell(pIndex, dayIndex, 'estado', e.target.value)}
                            >
                              <option value="-">-</option>
                              <option value="libre">Libre</option>
                              <option value="INC">INC</option>
                              <option value="LIC">LIC</option>
                              <option value="VAC">VAC</option>
                              <option value="SAN">SAN</option>
                              <option value="CAP">CAP</option>
                              <option value="CEO">CEO</option>
                            </select>
                          </td>
                          <td className={`horariosgrupo-td horariosgrupo-td-descanso horariosgrupo-descanso-${estado}`} colSpan={4}>
                            {getEstadoDescription(estado)}
                          </td>
                        </React.Fragment>
                      );
                    }

                    return (
                      <React.Fragment key={dayIndex}>
                        <td 
                          className={`horariosgrupo-td horariosgrupo-td-estado ${changedCells.has(key) ? 'changed' : ''}`}
                          onMouseEnter={() => changedCells.has(key) && setHoverCell(key)}
                          onMouseLeave={() => setHoverCell(null)}
                        >
                          <select
                            className="horariosgrupo-cell-estado"
                            value={estado}
                            disabled={userRole === 'lector'}
                            onChange={(e) => updateCell(pIndex, dayIndex, 'estado', e.target.value)}
                          >
                            <option value="-">-</option>
                            <option value="libre">Libre</option>
                            <option value="INC">INC</option>
                            <option value="LIC">LIC</option>
                            <option value="VAC">VAC</option>
                            <option value="SAN">SAN</option>
                            <option value="CAP">CAP</option>
                            <option value="CEO">CEO</option>
                          </select>
                          {hoverCell === key && previousGroupSchedules[key] && (
                            <div className="horariosgrupo-tooltip">
                              {getChangeMessage(previousGroupSchedules[key], cell).map((msg, idx) => (
                                <div key={idx}>{msg}</div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td 
                          className={`horariosgrupo-td ${changedCells.has(key) ? 'changed' : ''}`}
                          onMouseEnter={() => changedCells.has(key) && setHoverCell(key)}
                          onMouseLeave={() => setHoverCell(null)}
                        >
                          <TwoDigitInput
                            value={startH}
                            disabled={userRole === 'lector'}
                            onChange={(v) => updateCell(pIndex, dayIndex, 'startH', v)}
                          />
                        </td>
                        <td 
                          className={`horariosgrupo-td ${changedCells.has(key) ? 'changed' : ''}`}
                          onMouseEnter={() => changedCells.has(key) && setHoverCell(key)}
                          onMouseLeave={() => setHoverCell(null)}
                        >
                          <TwoDigitInput
                            value={endH}
                            disabled={userRole === 'lector'}
                            onChange={(v) => updateCell(pIndex, dayIndex, 'endH', v)}
                          />
                        </td>
                        <td 
                          className={`horariosgrupo-td ${changedCells.has(key) ? 'changed' : ''}`}
                          onMouseEnter={() => changedCells.has(key) && setHoverCell(key)}
                          onMouseLeave={() => setHoverCell(null)}
                        >
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
            <button
              type="button"
              className="horariosgrupo-save-button"
              onClick={handleSaveParticipantOrder}
            >
              💾 Guardar orden
            </button>
            <button
              type="button"
              className="horariosgrupo-copy-button"
              onClick={handleCopyMatrix}
            >
              📋 Copiar matriz
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