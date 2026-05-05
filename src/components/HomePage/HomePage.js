import React, { useEffect, useState } from 'react';
import { FiClock, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { doc, getDoc, collection, getDocs, setDoc } from 'firebase/firestore';
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

const markOverlappingSchedules = (schedules) => {
  if (schedules.length === 0) return schedules;

  const userSchedule = schedules[0]; // El primer horario es siempre del usuario
  const userStart = parseTimeToMinutes(userSchedule.ingreso);
  const userEnd = parseTimeToMinutes(userSchedule.salida);
  const userHasSchedule = userStart !== null && userEnd !== null;

  const markedSchedules = schedules.map((item, index) => {
    let overlap = false;
    if (index === 0) {
      // Usuario: siempre overlap si tiene horario
      overlap = userHasSchedule;
    } else {
      // Compañeros: overlap solo si se solapan con el usuario
      const itemStart = parseTimeToMinutes(item.ingreso);
      const itemEnd = parseTimeToMinutes(item.salida);
      overlap = userHasSchedule && isTimeRangeOverlap(userStart, userEnd, itemStart, itemEnd);
    }
    return { ...item, overlap };
  });

  // Ordenar: primero los que tienen overlap (verde), luego los que no (rojo)
  return markedSchedules.sort((a, b) => {
    if (a.overlap && !b.overlap) return -1;
    if (!a.overlap && b.overlap) return 1;
    return 0; // Mantener orden relativo si ambos true o ambos false
  });
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

const HomePage = ({ user, userPlan, setCurrentView, setShowCopiModal, setShowPlanModal }) => {
  const [hasRegisteredToday, setHasRegisteredToday] = useState(false);
  const [todaySchedules, setTodaySchedules] = useState([]);
  const [userName, setUserName] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [sharedWith, setSharedWith] = useState([]);
  const [showShareBackModal, setShowShareBackModal] = useState(false);
  const [shareBackUser, setShareBackUser] = useState(null);

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
    if (!user) return;

    const loadSelectedSchedules = async () => {
      setTodaySchedules([]); // Reset to show loading
      const selectedDateStr = formatDateInput(selectedDate);
      const monday = getMondayOfWeek(selectedDate);
      const weekStartDate = formatDateInput(monday);
      const allSchedules = [];

      try {
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
            });
          } else {
            allSchedules.push({
              name: firstNameUser,
              ingreso: '—',
              salida: '—',
              email: user.email,
            });
          }
        } else {
          const usuarioSnap = await getDoc(doc(db, 'usuarios', user.uid));
          if (usuarioSnap.exists()) {
            firstNameUser = getFirstName(formatName(usuarioSnap.data().name || 'Usuario'));
          }
          allSchedules.push({
            name: firstNameUser,
            ingreso: '—',
            salida: '—',
            email: user.email,
          });
          setSharedWith([]);
        }

        try {
          const horariosRef = collection(db, 'HORARIOS');
          const querySnapshot = await getDocs(horariosRef);

          for (const horariosDoc of querySnapshot.docs) {
            const horariosData = horariosDoc.data();
            if (horariosData.sharedWith && horariosData.sharedWith.includes(user.email)) {
              const usuarioDocRef = doc(db, 'usuarios', horariosDoc.id);
              const usuarioDocSnap = await getDoc(usuarioDocRef);

              if (usuarioDocSnap.exists()) {
                const userData = usuarioDocSnap.data();
                const firstName = getFirstName(formatName(userData.name || 'Usuario'));
                const email = userData.email;
                const savedWeek = horariosData?.semanas?.[weekStartDate];
                const selectedScheduleShared = savedWeek?.days?.find((day) => day.date === selectedDateStr);

                if (selectedScheduleShared && selectedScheduleShared.tipo === 'trabajado') {
                  allSchedules.push({
                    name: firstName,
                    ingreso: selectedScheduleShared.startTime || '00:00',
                    salida: selectedScheduleShared.endTime || '00:00',
                    email: email,
                  });
                } else {
                  allSchedules.push({
                    name: firstName,
                    ingreso: '—',
                    salida: '—',
                    email: email,
                  });
                }
              }
            }
          }
        } catch (error) {
          console.error('Error cargando horarios compartidos:', error);
        }

        const markedSchedules = markOverlappingSchedules(allSchedules);
        setTodaySchedules(markedSchedules);

        // Verificar si hay un compañero que te compartió pero tú no le has compartido
        const sharedCompanions = markedSchedules.slice(1).filter(schedule => !userSharedWith.includes(schedule.email));
        if (sharedCompanions.length > 0 && !showShareBackModal) {
          const companion = sharedCompanions[0];
          const key = `declineShare_${user.email}_${companion.email}_${formatDateInput(selectedDate)}`;
          const declinedAt = localStorage.getItem(key);
          if (declinedAt) {
            const now = Date.now();
            const diff = now - parseInt(declinedAt);
            const oneDay = 24 * 60 * 60 * 1000;
            if (diff < oneDay) {
              // Aún no ha pasado un día, no mostrar
              return;
            } else {
              // Ha pasado, remover la clave
              localStorage.removeItem(key);
            }
          }
          setShareBackUser(companion); // Mostrar modal para el primero
          setShowShareBackModal(true);
        }
      } catch (error) {
        console.error('Error cargando horarios del día seleccionado:', error);
        setTodaySchedules([]);
      } finally {
        // Loading handled by checking todaySchedules.length
      }
    };

    loadSelectedSchedules();
  }, [user, selectedDate, showShareBackModal]);

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

  const handleShareBackConfirm = async () => {
    if (!shareBackUser || !user) return;

    try {
      const updatedSharedWith = [...sharedWith, shareBackUser.email];
      await setDoc(
        doc(db, 'HORARIOS', user.uid),
        { sharedWith: updatedSharedWith },
        { merge: true }
      );
      setSharedWith(updatedSharedWith);
      setShowShareBackModal(false);
      setShareBackUser(null);
      // Recargar schedules para reflejar el cambio
      // Como selectedDate no cambió, el useEffect se ejecutará de nuevo
    } catch (error) {
      console.error('Error compartiendo horario de vuelta:', error);
    }
  };

  const handleShareBackCancel = () => {
    if (shareBackUser && user) {
      const key = `declineShare_${user.email}_${shareBackUser.email}_${formatDateInput(selectedDate)}`;
      localStorage.setItem(key, Date.now().toString());
    }
    setShowShareBackModal(false);
    setShareBackUser(null);
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

  if (todaySchedules.length === 0) {
    return (
      <div className="home-container">
        <Loading />
      </div>
    );
  }

  return (
    <div className="home-container">
      <h1>
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
            <span>{formatDateInput(selectedDate)}</span>
          </div>

          <button className="date-nav" onClick={handleNextDay} aria-label="Día siguiente">
            <FiChevronRight size={20} />
          </button>
        </div>

        <div className="schedule-table">
          {todaySchedules.map((item, index) => (
            <div className={`schedule-row${item.overlap ? ' overlap' : ' no-overlap'}`} key={index}>
              <span>{item.name}</span>
              <span>{item.ingreso}</span>
              <span>{item.salida}</span>
            </div>
          ))}
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
        <button className="home-button" onClick={() => setCurrentView('pago')}>
          Consultar Pago
        </button>
        <button className="home-button" onClick={() => setShowCopiModal(true)}>
          Recuperar Datos
        </button>
      </div>

      <ModalConfirmation
        isOpen={showShareBackModal}
        title="¿Quieres compartir tu horario?"
        message={`Tu compañero ${shareBackUser?.name} ha compartido su horario contigo. ¿Quieres compartirle también tu horario?`}
        onConfirm={handleShareBackConfirm}
        onCancel={handleShareBackCancel}
        onClose={handleShareBackCancel}
      />

    </div>
  );
};

export default HomePage;