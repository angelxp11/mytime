import React, { useEffect, useState } from 'react';
import { FiClock, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { doc, getDoc, collection, getDocs, setDoc, query, where } from 'firebase/firestore';
import { db } from '../server/api';
import '../../colors.css';
import './HomePage.css';
import Loading from '../loading/loading';
import ModalConfirmation from '../modalconfirmation/modalconfirmation';

const getTodayDateInput = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMondayOfWeek = (date) => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day + 6) % 7;
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

const formatDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateDisplay = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${day}/${month}/${year}`;
};

const formatName = (value) => {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const getFirstName = (fullName) => {
  return fullName.trim().split(/\s+/)[0];
};

const parseTimeToMinutes = (time) => {
  if (!time || time === '—') return null;
  const [hour, minute] = time.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
};

const isTimeRangeOverlap = (startA, endA, startB, endB) => {
  if (startA == null || endA == null || startB == null || endB == null) return false;
  return startA < endB && endA > startB;
};

// Mapeo de estados a descripciones
const estadoDescriptions = {
  'libre': 'DESCANSO',
  'INC': 'INCAPACIDAD',
  'LIC': 'LICENCIA',
  'VAC': 'VACACIONES',
  'SAN': 'SANCIONADO',
  'CAP': 'CAPACITACIÓN',
  'CEO': 'CEO',
};

const getEstadoDescription = (estado) => estadoDescriptions[estado] || estado;

const markOverlappingSchedules = (schedules) => {
  if (schedules.length === 0) return schedules;

  const userSchedule = schedules[0]; // El primer horario es siempre del usuario
  const userStart = parseTimeToMinutes(userSchedule.ingreso);
  const userEnd = parseTimeToMinutes(userSchedule.salida);
  const userHasSchedule = userStart !== null && userEnd !== null;

  const markedSchedules = schedules.map((item, index) => {
    let overlap = false;
    let category = 0; // 0: overlap, 1: no-overlap con horario, 2: descanso, 3: no registrado, 4+: estados especiales
    
    // Determinar si la celda debe fusionarse (ESTADO ESPECIAL, LIBRE o NO REGISTRADO)
    let merged = false;
    let mergedText = '';
    let estado = item.estado || null;
    
    // Revisar estados especiales primero
    if (estado && ['INC', 'LIC', 'VAC', 'SAN', 'CAP', 'CEO'].includes(estado)) {
      merged = true;
      mergedText = getEstadoDescription(estado);
      category = 4; // Estados especiales
    } else if (item.ingreso === 'LI' && item.salida === 'BRE') {
      merged = true;
      mergedText = 'DESCANSO';
      category = 2; // Descanso
    } else if (item.ingreso === 'NO' && item.salida === 'REGISTRO') {
      merged = true;
      mergedText = 'NO REGISTRADO';
      category = 3; // No registrado
    } else {
      if (index === 0) {
        // Usuario: siempre overlap si tiene horario
        overlap = userHasSchedule;
      } else {
        // Compañeros: overlap solo si se solapan con el usuario
        const itemStart = parseTimeToMinutes(item.ingreso);
        const itemEnd = parseTimeToMinutes(item.salida);
        overlap = userHasSchedule && isTimeRangeOverlap(userStart, userEnd, itemStart, itemEnd);
      }
      
      if (overlap) {
        category = 0; // Coincide (verde)
      } else {
        category = 1; // No coincide pero tiene horario (rojo)
      }
    }
    
    return { ...item, overlap, merged, mergedText, category, estado };
  });

  // Mantener el usuario en posición 0, ordenar el resto por categoría
  const userItem = markedSchedules[0];
  const otherItems = markedSchedules.slice(1).sort((a, b) => a.category - b.category);
  
  return [userItem, ...otherItems];
};

const getFriendlyDayLabel = (date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = new Date(date);
  selected.setHours(0, 0, 0, 0);
  const diff = Math.round((selected - today) / (1000 * 60 * 60 * 24));

  if (diff === 0) return 'HOY';
  if (diff === 1) return 'MAÑANA';
  if (diff === -1) return 'AYER';
  return selected.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase();
};

const formatDescBadge = (desc) => {
  if (desc == null) return '';
  const n = parseInt(String(desc), 10);
  if (Number.isNaN(n)) return String(desc);
  return `${n}h`;
};

// ─── FUNCIÓN PARA DIFERENCIAR NOMBRES DUPLICADOS ────────────────────────────
const disambiguateNames = (schedules) => {
  // Agrupar por nombre (primer nombre)
  const nameGroups = {};
  
  schedules.forEach((schedule, index) => {
    const firstName = schedule.name;
    if (!nameGroups[firstName]) {
      nameGroups[firstName] = [];
    }
    nameGroups[firstName].push(index);
  });
  
  // Crear array de información de nombres
  const displayNames = schedules.map((schedule) => ({
    display: schedule.name,
    isDuplicate: false,
  }));
  
  // Para grupos con duplicados, todos los miembros usan una forma desambiguada
  Object.values(nameGroups).forEach((indices) => {
    if (indices.length <= 1) return;

    const usedDisplays = new Set();
    indices.forEach((idx) => {
      const fullName = schedules[idx].fullName || schedules[idx].name;
      const parts = fullName.split(/\s+/).filter(Boolean);
      let display = parts[0];

      if (parts.length >= 2) {
        display = `${parts[0]} ${parts[1]}`;
      }

      // Si el primer+segundo nombre sigue colisionando, agregar más partes
      let partIndex = 2;
      while (usedDisplays.has(display) && partIndex < parts.length) {
        display = `${display} ${parts[partIndex]}`;
        partIndex += 1;
      }

      if (usedDisplays.has(display)) {
        display = fullName;
      }

      displayNames[idx].display = display;
      displayNames[idx].isDuplicate = true;
      usedDisplays.add(display);
    });
  });
  
  return displayNames;
};

const HomePage = ({ user, userPlan, setCurrentView, setShowCopiModal, setShowPlanModal }) => {
  const [hasRegisteredToday, setHasRegisteredToday] = useState(false);
  const [todaySchedules, setTodaySchedules] = useState([]);
  const [userName, setUserName] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [sharedWith, setSharedWith] = useState([]);
  const [userGroup, setUserGroup] = useState(null);
  const [isLoadingGroup, setIsLoadingGroup] = useState(true);

  useEffect(() => {
    if (!user) return;

    const checkUserGroup = async () => {
      setIsLoadingGroup(true);
      try {
        // Buscar si el usuario es propietario de un grupo
        const gruposRef = collection(db, 'grupos');
        const ownerQuery = query(gruposRef, where('ownerId', '==', user.uid));
        const ownerSnapshot = await getDocs(ownerQuery);

        if (!ownerSnapshot.empty) {
          setUserGroup(ownerSnapshot.docs[0].data());
          return;
        }

        // Si no es propietario, buscar si es participante
        const userEmail = user.email?.toLowerCase();
        const allGruposSnapshot = await getDocs(gruposRef);
        
        for (const doc of allGruposSnapshot.docs) {
          const groupData = doc.data();
          const isParticipant = groupData.participants?.some(
            (p) => p.email?.toLowerCase?.() === userEmail
          );
          if (isParticipant) {
            setUserGroup(groupData);
            return;
          }
        }

        setUserGroup(null);
      } catch (error) {
        console.error('Error verificando grupo del usuario:', error);
        setUserGroup(null);
      } finally {
        setIsLoadingGroup(false);
      }
    };

    checkUserGroup();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const checkTodayRegistration = async () => {
      try {
        const [horasSnap, usuarioSnap] = await Promise.all([
          getDoc(doc(db, 'horasTrabajadas', user.uid)),
          getDoc(doc(db, 'usuarios', user.uid)),
        ]);

        if (usuarioSnap.exists()) {
          const userData = usuarioSnap.data();
          setUserName(userData.name);
        }

        const today = getTodayDateInput();
        const registered = horasSnap.exists() ? !!horasSnap.data()?.dias?.[today] : false;
        setHasRegisteredToday(registered);
      } catch (error) {
        console.error('Error checking today registration:', error);
        setHasRegisteredToday(false);
      }
    };

    checkTodayRegistration();
  }, [user]);

  useEffect(() => {
    if (!user || isLoadingGroup) return;

    const loadSelectedSchedules = async () => {
      setTodaySchedules([]); // Reset to show loading
      const selectedDateStr = formatDateInput(selectedDate);
      const monday = getMondayOfWeek(selectedDate);
      const weekStartDate = formatDateInput(monday);
      const allSchedules = [];

      try {
        if (userGroup) {
          // Cargar horarios del grupo
          await loadGroupSchedules(allSchedules, selectedDateStr, weekStartDate);
        } else {
          // Cargar horarios compartidos (comportamiento actual)
          await loadSharedSchedules(allSchedules, selectedDateStr, weekStartDate);
        }

        const markedSchedules = markOverlappingSchedules(allSchedules);
        setTodaySchedules(markedSchedules);
      } catch (error) {
        console.error('Error cargando horarios del día seleccionado:', error);
        setTodaySchedules([]);
      } finally {
        // Loading handled by checking todaySchedules.length
      }
    };

    loadSelectedSchedules();
  }, [user, selectedDate, userGroup, isLoadingGroup]);

  const loadGroupSchedules = async (allSchedules, selectedDateStr, weekStartDate) => {
    if (!userGroup || !userGroup.participants) return;

    const participants = userGroup.participants || [];
    
    // Separar: el usuario actual primero, luego los demás
    const userParticipant = participants.find(p => p.uid === user.uid);
    const otherParticipants = participants.filter(p => p.uid !== user.uid);
    const orderedParticipants = userParticipant 
      ? [userParticipant, ...otherParticipants]
      : participants;

    try {
      // Paralelizar todas las operaciones de lectura para cada participante
      const schedulePromises = orderedParticipants.map(async (participant) => {
        try {
          const [usuarioDocSnap, horariosSnap] = await Promise.all([
            getDoc(doc(db, 'usuarios', participant.uid)),
            getDoc(doc(db, 'HORARIOS', participant.uid)),
          ]);

          if (!usuarioDocSnap.exists()) return null;

          const userData = usuarioDocSnap.data();
          const fullName = formatName(userData.name || 'Usuario');
          const firstName = getFirstName(fullName);
          const email = userData.email;

          let schedule = {
            name: firstName,
            fullName: fullName,
            ingreso: 'NO',
            salida: 'REGISTRO',
            email: email,
            estado: null,
            descanso: '00',
          };

          if (horariosSnap.exists()) {
            const horariosData = horariosSnap.data();
            const savedWeek = horariosData?.semanas?.[weekStartDate];
            const selectedSchedule = savedWeek?.days?.find((day) => day.date === selectedDateStr);

            if (selectedSchedule && selectedSchedule.tipo === 'trabajado') {
              schedule = {
                name: firstName,
                fullName: fullName,
                ingreso: selectedSchedule.startTime || '00:00',
                salida: selectedSchedule.endTime || '00:00',
                email: email,
                estado: selectedSchedule.estado || null,
                descanso: selectedSchedule.descanso || '00',
              };
            } else if (selectedSchedule && selectedSchedule.tipo !== 'trabajado') {
              // Día de descanso o estado especial
              schedule = {
                name: firstName,
                fullName: fullName,
                ingreso: 'LI',
                salida: 'BRE',
                email: email,
                estado: selectedSchedule.estado || 'libre',
                descanso: selectedSchedule.descanso || '00',
              };
            }
          }

          return schedule;
        } catch (error) {
          console.error(`Error cargando horarios del participante ${participant.uid}:`, error);
          return null;
        }
      });

      const schedules = await Promise.all(schedulePromises);
      schedules.forEach((schedule) => {
        if (schedule) allSchedules.push(schedule);
      });
    } catch (error) {
      console.error('Error cargando horarios del grupo:', error);
    }
  };

  const loadSharedSchedules = async (allSchedules, selectedDateStr, weekStartDate) => {
    const horariosSnap = await getDoc(doc(db, 'HORARIOS', user.uid));
    let firstNameUser = 'Usuario';
    let userSharedWith = [];

    if (horariosSnap.exists()) {
      const scheduleData = horariosSnap.data();
      userSharedWith = scheduleData.sharedWith || [];
      setSharedWith(userSharedWith);
      const usuarioSnap = await getDoc(doc(db, 'usuarios', user.uid));
      if (usuarioSnap.exists()) {
        firstNameUser = getFirstName(formatName(usuarioSnap.data().name || 'Usuario'));
      }

      const savedWeek = scheduleData?.semanas?.[weekStartDate];
      const selectedSchedule = savedWeek?.days?.find((day) => day.date === selectedDateStr);

      if (selectedSchedule && selectedSchedule.tipo === 'trabajado') {
        allSchedules.push({
          name: firstNameUser,
          ingreso: selectedSchedule.startTime || '00:00',
          salida: selectedSchedule.endTime || '00:00',
          email: user.email, // Usuario actual
          estado: selectedSchedule.estado || null,
          descanso: selectedSchedule.descanso || '00',
        });
      } else if (selectedSchedule && selectedSchedule.tipo !== 'trabajado') {
        // Día de descanso o estado especial
        allSchedules.push({
          name: firstNameUser,
          ingreso: 'LI',
          salida: 'BRE',
          email: user.email,
          estado: selectedSchedule.estado || 'libre',
          descanso: selectedSchedule.descanso || '00',
        });
      } else {
        // No ha registrado
        allSchedules.push({
          name: firstNameUser,
          ingreso: 'NO',
          salida: 'REGISTRO',
          email: user.email,
          estado: null,
          descanso: '00',
        });
      }
    } else {
      const usuarioSnap = await getDoc(doc(db, 'usuarios', user.uid));
      if (usuarioSnap.exists()) {
        firstNameUser = getFirstName(formatName(usuarioSnap.data().name || 'Usuario'));
      }
      allSchedules.push({
        name: firstNameUser,
        ingreso: 'NO',
        salida: 'REGISTRO',
        email: user.email,
        estado: null,
        descanso: '00',
      });
      setSharedWith([]);
    }

    try {
      const horariosRef = collection(db, 'HORARIOS');
      const querySnapshot = await getDocs(horariosRef);

      for (const horariosDoc of querySnapshot.docs) {
        // No incluir al usuario autenticado
        if (horariosDoc.id === user.uid) continue;
        
        const horariosData = horariosDoc.data();
        if (horariosData.sharedWith && horariosData.sharedWith.includes(user.email)) {
          const usuarioDocRef = doc(db, 'usuarios', horariosDoc.id);
          const usuarioDocSnap = await getDoc(usuarioDocRef);

          if (usuarioDocSnap.exists()) {
            const userData = usuarioDocSnap.data();
            const fullName = formatName(userData.name || 'Usuario');
            const firstName = getFirstName(fullName);
            const email = userData.email;
            const savedWeek = horariosData?.semanas?.[weekStartDate];
            const selectedScheduleShared = savedWeek?.days?.find((day) => day.date === selectedDateStr);

            if (selectedScheduleShared && selectedScheduleShared.tipo === 'trabajado') {
              allSchedules.push({
                name: firstName,
                fullName: fullName,
                ingreso: selectedScheduleShared.startTime || '00:00',
                salida: selectedScheduleShared.endTime || '00:00',
                email: email,
                estado: selectedScheduleShared.estado || null,
                descanso: selectedScheduleShared.descanso || '00',
              });
            } else if (selectedScheduleShared && selectedScheduleShared.tipo !== 'trabajado') {
              // Día de descanso o estado especial
              allSchedules.push({
                name: firstName,
                fullName: fullName,
                ingreso: 'LI',
                salida: 'BRE',
                email: email,
                estado: selectedScheduleShared.estado || 'libre',
                descanso: selectedScheduleShared.descanso || '00',
              });
            } else {
              // No ha registrado
              allSchedules.push({
                name: firstName,
                fullName: fullName,
                ingreso: 'NO',
                salida: 'REGISTRO',
                email: email,
                estado: null,
                descanso: '00',
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error cargando horarios compartidos:', error);
    }
  };

  const handlePreviousDay = () => {
    setSelectedDate((current) => {
      const previous = new Date(current);
      previous.setDate(previous.getDate() - 1);
      return previous;
    });
  };

  const handleNextDay = () => {
    setSelectedDate((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + 1);
      return next;
    });
  };

  if (!user) {
    return (
      <div className="home-container">
        <h1>Bienvenido a MyTime</h1>
        <p>Tu plataforma para gestionar horas de trabajo y pagos.</p>
        <button className="home-button" onClick={() => setCurrentView('login')}>
          Iniciar Sesión
        </button>
      </div>
    );
  }

  const displayName = userName ? formatName(userName) : user.email;

  const isSubscriptionExpired = () => {
    if (!userPlan) return false;

    if (userPlan.plan !== 'premium') return true;
    if (!userPlan.expirationDate) return false;

    const now = new Date();
    return userPlan.expirationDate < now;
  };

  const canRegisterHours = () => {
    return userPlan?.plan === 'premium' && !isSubscriptionExpired();
  };

  const handleRegisterHoursClick = () => {
    if (canRegisterHours()) {
      setCurrentView('registerhours');
    } else {
      setShowPlanModal(true);
    }
  };

  const handleConsultarPagoClick = () => {
    if (userPlan?.plan === 'premium' && !isSubscriptionExpired()) {
      setCurrentView('pago');
    } else {
      setShowPlanModal(true);
    }
  };

  if (todaySchedules.length === 0 || isLoadingGroup) {
    return (
      <div className="home-container">
        <Loading />
      </div>
    );
  }

  return (
    <div className="home-container">
      <h1 className={hasRegisteredToday ? 'registered' : 'not-registered'}>
        {hasRegisteredToday
          ? `Felicidades ${displayName}, Ya tienes el registro de hoy`
          : `Bienvenido ${displayName}, Hoy no has ingresado tu entrada ni salida`
        }
      </h1>

      <div className="home-today-schedule">
        <div className="schedule-header">
          <button className="date-nav" onClick={handlePreviousDay} aria-label="Día anterior">
            <FiChevronLeft size={20} />
          </button>

          <div className="selected-day-label">
            <strong>{getFriendlyDayLabel(selectedDate)}</strong>
            <span>{formatDateDisplay(selectedDate)}</span>
          </div>

          <button className="date-nav" onClick={handleNextDay} aria-label="Día siguiente">
            <FiChevronRight size={20} />
          </button>
        </div>

        <div className="schedule-table">
          {(() => {
            const displayNames = disambiguateNames(todaySchedules);
            return todaySchedules.map((item, index) => {
              const nameInfo = displayNames[index];
              // Determinar clase de estado
              let stateClass = '';
              if (item.estado && ['INC', 'LIC', 'VAC', 'SAN', 'CAP', 'CEO'].includes(item.estado)) {
                stateClass = `state-${item.estado.toLowerCase()}`;
              } else if (item.estado === 'libre' || (item.ingreso === 'LI' && item.salida === 'BRE')) {
                stateClass = 'state-libre';
              }
              
              return (
                <div className={`schedule-row category-${item.category} ${stateClass}`} key={index}>
                  <span className={nameInfo.isDuplicate ? 'name-differentiator' : ''}>
                    {nameInfo.display}
                  </span>
                  {item.merged ? (
                    <span className="merged-cell">{item.mergedText}</span>
                  ) : (
                    <>
                      <span>{item.ingreso}</span>
                      <span>{item.salida}</span>
                    </>
                  )}
                  {item.category === 0 &&
  item.descanso &&
  String(item.descanso) !== '00' && (
                <div
                  className="break-badge"
                  data-break={formatDescBadge(item.descanso).replace('h', '')}
                  aria-hidden="true"
                />
)}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {isSubscriptionExpired() && (
        <div className="subscription-expired-banner">
          <div className="expired-message">
            <div>
              <span className="expired-icon">⚠️</span>
              <span className="expired-text">Mejora tu plan</span>
            </div>
            <p className="expired-description">
              Desbloquea el registro de horas diarias y apoya al desarrollador para seguir mejorando MyTime.
            </p>
          </div>
          <button className="renew-button" onClick={() => setShowPlanModal(true)}>
            Mejorar plan
          </button>
        </div>
      )}

      <p>Tu plataforma para gestionar horas de trabajo y pagos.</p>

      <div className="home-buttons">
        <button className="home-button" onClick={handleRegisterHoursClick}>
          <FiClock size={18} style={{ marginRight: '10px' }} />
          {canRegisterHours() ? 'Registrar Horas' : 'Actualizar a Premium'}
        </button>
        <button className="home-button" onClick={() => setCurrentView('trabajos')}>
          Ver Mis Trabajos
        </button>
        <button className="home-button" onClick={handleConsultarPagoClick}>
          {canRegisterHours() ? 'Consultar Pago' : 'Actualizar a Premium'}
        </button>
        <button className="home-button" onClick={() => setShowCopiModal(true)}>
          Recuperar Datos
        </button>
      </div>
    </div>
  );
};

export default HomePage;